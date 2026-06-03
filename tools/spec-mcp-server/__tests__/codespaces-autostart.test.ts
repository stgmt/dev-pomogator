/**
 * Tests for the Codespaces autostart entry (FR-16 / SPECGEN004_36, _37).
 *
 * Both sides run for real: the install injection writes + re-reads a
 * devcontainer.json, and the runtime autostart boots the actual lifecycle with
 * Codespaces env vars set, asserting the on-disk lock tag + rebuild timing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ensureCodespacesPostStart,
  postStartHasMcpAutostart,
  codespacesAutostart,
  MARKER,
} from '../codespaces-autostart.ts';
import { readLock } from '../lock-manager.ts';

describe('codespaces-autostart', () => {
  let root: string;
  let savedCodespaces: string | undefined;
  let savedName: string | undefined;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `cs-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specs/auth/FR.md'), '## FR-1: Login\n');
    savedCodespaces = process.env.CODESPACES;
    savedName = process.env.CODESPACE_NAME;
  });
  afterEach(() => {
    if (savedCodespaces === undefined) delete process.env.CODESPACES;
    else process.env.CODESPACES = savedCodespaces;
    if (savedName === undefined) delete process.env.CODESPACE_NAME;
    else process.env.CODESPACE_NAME = savedName;
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('ensureCodespacesPostStart (install injection)', () => {
    it('creates a devcontainer.json whose postStartCommand launches the autostart', () => {
      const res = ensureCodespacesPostStart(root);
      expect(res.injected).toBe(true);
      const dc = JSON.parse(fs.readFileSync(res.path, 'utf8'));
      expect(postStartHasMcpAutostart(dc.postStartCommand)).toBe(true);
      expect(dc.postStartCommand).toContain(MARKER);
    });

    it('is idempotent — a second call detects our marker and no-ops', () => {
      ensureCodespacesPostStart(root);
      const second = ensureCodespacesPostStart(root);
      expect(second.injected).toBe(false);
      expect(second.alreadyPresent).toBe(true);
    });

    it('chains after a pre-existing postStartCommand instead of clobbering it', () => {
      const dir = path.join(root, '.devcontainer');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'devcontainer.json'),
        JSON.stringify({ name: 'x', postStartCommand: 'bash setup.sh' }, null, 2),
      );
      ensureCodespacesPostStart(root);
      const dc = JSON.parse(fs.readFileSync(path.join(dir, 'devcontainer.json'), 'utf8'));
      expect(dc.postStartCommand).toMatch(/^bash setup\.sh && /);
      expect(postStartHasMcpAutostart(dc.postStartCommand)).toBe(true);
    });
  });

  describe('codespacesAutostart (runtime)', () => {
    it('writes a lock tagged codespaces:<machine-id> and builds the graph (SPECGEN004_36)', async () => {
      process.env.CODESPACES = 'true';
      process.env.CODESPACE_NAME = 'fluffy-machine-42';
      const handle = await codespacesAutostart({ repoRoot: root, watchProbe: async () => true });
      try {
        expect(readLock(root)!.env).toBe('codespaces:fluffy-machine-42');
        expect(handle.graph.nodes.has('FR-1')).toBe(true);
      } finally {
        await handle.shutdown();
      }
    });

    it('resumes from a stale lock, rebuilds ≤2s, keeps the codespaces env tag (SPECGEN004_37)', async () => {
      process.env.CODESPACES = 'true';
      process.env.CODESPACE_NAME = 'fluffy-machine-42';
      // The pre-hibernation session's lock, left behind by a now-dead process.
      fs.mkdirSync(path.join(root, '.dev-pomogator'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.dev-pomogator', '.mcp-lock.json'),
        JSON.stringify({
          pid: 2_147_483_646,
          env: 'codespaces:fluffy-machine-42',
          started_at: new Date(0).toISOString(),
          last_heartbeat: new Date(0).toISOString(),
        }),
      );
      const t0 = Date.now();
      const handle = await codespacesAutostart({ repoRoot: root, watchProbe: async () => true });
      const elapsed = Date.now() - t0;
      try {
        expect(elapsed).toBeLessThanOrEqual(2000);
        expect(readLock(root)!.env).toBe('codespaces:fluffy-machine-42');
        expect(handle.graph.nodes.has('FR-1')).toBe(true);
      } finally {
        await handle.shutdown();
      }
    });
  });
});
