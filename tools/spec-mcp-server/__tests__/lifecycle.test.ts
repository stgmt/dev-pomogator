/**
 * Integration tests for the MCP server lifecycle orchestrator.
 *
 * The watcher branch is timing-sensitive (chokidar fires async on real FS
 * events), so these tests cover the deterministic surface: lock acquisition,
 * cold-build graph wiring, and graceful shutdown order. The single watcher-
 * event test uses chokidar's polling backend with a tiny stability window so
 * it stays reliable on every host.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { startLifecycle } from '../lifecycle.ts';
import { readLock } from '../lock-manager.ts';

describe('startLifecycle', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `mcp-lifecycle-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: Login\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('acquires the lock and cold-builds a graph with the seeded FR', async () => {
    const handle = await startLifecycle({ repoRoot: root, env: 'host', skipNdjson: true });
    try {
      expect(handle.graph.nodes.has('auth:FR-1')).toBe(true);
      const lock = readLock(root);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(process.pid);
    } finally {
      await handle.shutdown();
    }
  });

  it('shutdown() releases the lock and closes the watcher', async () => {
    const handle = await startLifecycle({ repoRoot: root, env: 'host', skipNdjson: true });
    await handle.shutdown();
    expect(readLock(root)).toBeNull();
    // Idempotent — second call must not throw.
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it('rejects a second lifecycle on the same repo while the first is live', async () => {
    const first = await startLifecycle({ repoRoot: root, env: 'host', skipNdjson: true });
    try {
      await expect(
        startLifecycle({ repoRoot: root, env: 'host', skipNdjson: true }),
      ).rejects.toThrow(/already held/);
    } finally {
      await first.shutdown();
    }
  });

  it('boots a READ-ONLY door (no throw) when a sibling holds the lock under onLockContention=readonly (P21-1)', async () => {
    const first = await startLifecycle({ repoRoot: root, env: 'host', skipNdjson: true });
    try {
      // The second session does NOT crash — it boots read-only.
      const second = await startLifecycle({
        repoRoot: root,
        env: 'host',
        skipNdjson: true,
        onLockContention: 'readonly',
      });
      try {
        expect(second.readOnly).toBe(true);
        expect(second.lockHolder?.pid).toBe(first.lock.record.pid);
        // Reads stay live: the read-only door still cold-built its own graph.
        expect(second.graph.nodes.has('auth:FR-1')).toBe(true);
        // It owns NOTHING — the on-disk lock is still the FIRST session's record.
        expect(readLock(root)!.pid).toBe(first.lock.record.pid);
        const log = fs.readFileSync(path.join(root, '.dev-pomogator', 'logs', 'watcher.log'), 'utf8');
        expect(log).toMatch(/READ-ONLY door/);
      } finally {
        await second.shutdown();
      }
      // The reader's shutdown must NOT have released the writer's lock.
      expect(readLock(root)).not.toBeNull();
      expect(readLock(root)!.pid).toBe(first.lock.record.pid);
    } finally {
      await first.shutdown();
    }
    // Once the writer shuts down, the lock is gone.
    expect(readLock(root)).toBeNull();
  });

  it('auto-falls-back to polling + logs the decision when the touch test fails (SPECGEN004_32)', async () => {
    const handle = await startLifecycle({
      repoRoot: root,
      env: 'host',
      skipNdjson: true,
      autoDetectWatchMode: true,
      watchProbe: async () => false, // simulate an unreliable Docker-Desktop bind mount
      pollIntervalMs: 1000,
    });
    try {
      expect(handle.watchMode).toBe('polling');
      expect(handle.pollIntervalMs).toBe(1000);
      const logFile = path.join(root, '.dev-pomogator', 'logs', 'watcher.log');
      expect(fs.existsSync(logFile)).toBe(true);
      const log = fs.readFileSync(logFile, 'utf8');
      expect(log).toMatch(/falling back to polling/);
      expect(log).toMatch(/1000ms interval/);

      // Subsequent changes are still detected — via the polling backend.
      await new Promise((r) => setTimeout(r, 250));
      fs.writeFileSync(path.join(root, '.specs/auth/FR2.md'), '## FR-2: Logout\n');
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && !handle.graph.nodes.has('auth:FR-2')) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(handle.graph.nodes.has('auth:FR-2')).toBe(true);
    } finally {
      await handle.shutdown();
    }
  });

  it('keeps native events when the touch test succeeds (SPECGEN004_32 happy path)', async () => {
    const handle = await startLifecycle({
      repoRoot: root,
      env: 'host',
      skipNdjson: true,
      autoDetectWatchMode: true,
      watchProbe: async () => true,
    });
    try {
      expect(handle.watchMode).toBe('native');
      const log = fs.readFileSync(path.join(root, '.dev-pomogator', 'logs', 'watcher.log'), 'utf8');
      expect(log).toMatch(/native fs events confirmed/);
    } finally {
      await handle.shutdown();
    }
  });

  it('reflects a single file change through the watcher into onPatch + graph', async () => {
    const patches: Array<{ kind: string; file: string }> = [];
    const handle = await startLifecycle({
      repoRoot: root,
      env: 'host',
      skipNdjson: true,
      usePolling: true,
      onPatch: (e) => patches.push({ kind: e.kind, file: e.file }),
    });
    try {
      // Bring chokidar fully ready before issuing the change.
      await new Promise((r) => setTimeout(r, 250));

      const target = path.join(root, '.specs/auth/FR.md');
      fs.writeFileSync(target, '## FR-1: Login (revised)\n');

      // Wait for the polling watcher to surface the change.
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && patches.length === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(patches.length).toBeGreaterThanOrEqual(1);
      expect(patches[0].file.endsWith('.specs/auth/FR.md')).toBe(true);
      // Graph reflects the new heading.
      expect(handle.graph.definitions.get('fr-1-login-revised')).toBeDefined();
    } finally {
      await handle.shutdown();
    }
  });
});
