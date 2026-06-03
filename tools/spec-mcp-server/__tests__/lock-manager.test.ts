/**
 * Unit tests for the MCP lock-manager.
 *
 * Pin the four core invariants:
 *   1. Acquire writes a JSON record atomically via O_EXCL `wx`.
 *   2. Re-acquire by a different "process" throws `ELOCK_HELD` (alive owner).
 *   3. Re-acquire over a stale lock (dead pid) succeeds (auto-cleanup).
 *   4. release() is idempotent + only unlinks if WE still own the lock.
 *
 * The "dead pid" branch is deterministic: we hand-write a lock file with a
 * pid that cannot be alive on the current platform (PID = 2_147_483_646), so
 * `process.kill(pid, 0)` is guaranteed to ESRCH.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { acquireLock, readLock, detectEnvironment } from '../lock-manager.ts';

describe('lock-manager', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `mcp-lock-test-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes a valid JSON record on acquire + reads back the same record', () => {
    const handle = acquireLock({ repoRoot: root, env: 'host' });
    try {
      expect(fs.existsSync(handle.path)).toBe(true);
      const parsed = readLock(root);
      expect(parsed).not.toBeNull();
      expect(parsed!.pid).toBe(process.pid);
      expect(parsed!.env).toBe('host');
      expect(typeof parsed!.started_at).toBe('string');
    } finally {
      handle.release();
    }
  });

  it('throws ELOCK_HELD when a live owner holds the lock', () => {
    const first = acquireLock({ repoRoot: root, env: 'host' });
    try {
      expect(() => acquireLock({ repoRoot: root, env: 'host' })).toThrow(/already held/);
      try {
        acquireLock({ repoRoot: root, env: 'host' });
      } catch (e) {
        expect((e as Error & { code: string }).code).toBe('ELOCK_HELD');
      }
    } finally {
      first.release();
    }
  });

  it('throws an env-mismatch ELOCK_HELD when a live owner holds a DIFFERENT env (SPECGEN004_33)', () => {
    const first = acquireLock({ repoRoot: root, env: 'host' });
    try {
      try {
        acquireLock({ repoRoot: root, env: 'container:cafe' });
        throw new Error('expected acquireLock to throw');
      } catch (e) {
        const err = e as Error & { code: string; envMismatch: boolean };
        expect(err.code).toBe('ELOCK_HELD');
        expect(err.envMismatch).toBe(true);
        expect(err.message).toContain('MCP already running in env host');
        expect(err.message).toContain(`(pid ${process.pid})`);
        expect(err.message).toContain('restart Claude Code in same env');
      }
      // No second lock was written — session A's record is intact.
      const held = readLock(root);
      expect(held!.pid).toBe(process.pid);
      expect(held!.env).toBe('host');
    } finally {
      first.release();
    }
  });

  it('auto-cleans a stale lock written by a dead pid', () => {
    const lockFile = path.join(root, '.dev-pomogator', '.mcp-lock.json');
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({
        pid: 2_147_483_646,
        env: 'host',
        started_at: new Date(0).toISOString(),
        last_heartbeat: new Date(0).toISOString(),
      }),
    );

    const handle = acquireLock({ repoRoot: root, env: 'host' });
    try {
      const fresh = readLock(root);
      expect(fresh!.pid).toBe(process.pid);
    } finally {
      handle.release();
    }
  });

  it('release() is idempotent and noop after a second call', () => {
    const handle = acquireLock({ repoRoot: root, env: 'host' });
    handle.release();
    expect(fs.existsSync(handle.path)).toBe(false);
    // Second call must not throw.
    expect(() => handle.release()).not.toThrow();
  });

  it('release() does NOT unlink a lock owned by a different pid', () => {
    const handle = acquireLock({ repoRoot: root, env: 'host' });
    // Simulate an external rewrite by another process.
    fs.writeFileSync(
      handle.path,
      JSON.stringify({
        pid: 2_147_483_646,
        env: 'host',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }),
    );
    handle.release();
    // Lock file is preserved — we don't own it anymore.
    expect(fs.existsSync(handle.path)).toBe(true);
    // Cleanup so afterEach succeeds.
    fs.unlinkSync(handle.path);
  });

  it('heartbeat() updates last_heartbeat in place', async () => {
    const handle = acquireLock({ repoRoot: root, env: 'host' });
    try {
      const before = readLock(root)!.last_heartbeat;
      await new Promise((r) => setTimeout(r, 25));
      handle.heartbeat();
      const after = readLock(root)!.last_heartbeat;
      expect(after).not.toBe(before);
    } finally {
      handle.release();
    }
  });
});

describe('detectEnvironment', () => {
  it('returns "host" by default', () => {
    expect(detectEnvironment({})).toBe('host');
  });

  it('detects Codespaces from CODESPACES + CODESPACE_NAME', () => {
    expect(
      detectEnvironment({ CODESPACES: 'true', CODESPACE_NAME: 'super-octo' }),
    ).toBe('codespaces:super-octo');
  });

  it('detects WSL from WSL_DISTRO_NAME', () => {
    expect(detectEnvironment({ WSL_DISTRO_NAME: 'Ubuntu-24.04' })).toBe('wsl:Ubuntu-24.04');
  });

  it('detects devcontainer from REMOTE_CONTAINERS=true', () => {
    expect(detectEnvironment({ REMOTE_CONTAINERS: 'true', HOSTNAME: 'h1' })).toBe('container:h1');
  });
});
