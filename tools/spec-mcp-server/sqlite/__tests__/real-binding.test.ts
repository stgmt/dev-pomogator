// Real `better-sqlite3` integration tests for the Phase-4 SQLite wrapper.
//
// `wrapper.test.ts` covers every branch with an injected fake constructor.
// This file complements it by opening a REAL SQLite database (when the
// native binding is loadable) and asserting that:
//   • PRAGMA journal_mode=WAL actually takes effect
//   • schema rows survive an open → write → reopen cycle (cross-session)
//   • PRAGMA integrity_check returns "ok" on a healthy file
//   • A corrupted DB file is quarantined and the next open starts fresh
//
// When the binding can't be loaded (e.g. Docker `--ignore-scripts` skipped
// prebuild and `npm rebuild` was unavailable) the whole suite is skipped
// rather than failing — the unit-level wrapper.test.ts already pins the
// stub path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  openDatabase,
  integrityCheck,
  quarantineCorrupt,
  openDatabaseWithRecovery,
} from '../wrapper.ts';

async function bindingAvailable(): Promise<boolean> {
  try {
    await import('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

const describeOrSkip = (await bindingAvailable()) ? describe : describe.skip;

describeOrSkip('SQLite wrapper — real better-sqlite3 binding', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `sqlite-real-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('opens a DB and reports the binding as available', async () => {
    const handle = await openDatabase({ repoRoot: root });
    expect(handle.backend.available).toBe(true);
    expect(handle.schemaVersion()).toBe(1);
    handle.backend.close();
  });

  it('actually enables WAL mode (FR-10)', async () => {
    const handle = await openDatabase({ repoRoot: root });
    const mode = handle.backend.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(Array.isArray(mode)).toBe(true);
    expect(mode[0].journal_mode.toLowerCase()).toBe('wal');
    handle.backend.close();
  });

  it('persists writes across a close + reopen cycle (cross-session shape)', async () => {
    {
      const h1 = await openDatabase({ repoRoot: root });
      h1.backend.prepare('INSERT INTO nodes(id,type,file,line,json) VALUES(?,?,?,?,?)').run(
        'FR-001',
        'FR',
        '.specs/auth/FR.md',
        1,
        '{"title":"Login flow"}',
      );
      h1.backend.close();
    }
    const h2 = await openDatabase({ repoRoot: root });
    const row = h2.backend.prepare('SELECT id, type, file FROM nodes WHERE id=?').get('FR-001') as
      | { id: string; type: string; file: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.id).toBe('FR-001');
    expect(row!.type).toBe('FR');
    h2.backend.close();
  });

  it('PRAGMA integrity_check returns "ok" on a healthy fresh DB', async () => {
    const handle = await openDatabase({ repoRoot: root });
    expect(integrityCheck(handle)).toBe('ok');
    handle.backend.close();
  });

  it('quarantine + reopen produces a fresh empty DB at the original path', async () => {
    // Open + write + close — DB file exists with rows.
    const h1 = await openDatabase({ repoRoot: root });
    h1.backend.prepare('INSERT INTO nodes(id,type,file,line,json) VALUES(?,?,?,?,?)').run(
      'FR-X', 'FR', 'f', 1, '{}',
    );
    const dbPath = h1.dbPath;
    h1.backend.close();
    expect(fs.existsSync(dbPath)).toBe(true);

    // Quarantine + reopen.
    const moved = quarantineCorrupt(dbPath, new Date('2026-05-30T00:00:00Z'));
    expect(moved).toMatch(/\.corrupt-/);
    expect(fs.existsSync(moved!)).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(false);

    const h2 = await openDatabase({ repoRoot: root });
    expect(h2.backend.available).toBe(true);
    const row = h2.backend.prepare('SELECT id FROM nodes WHERE id=?').get('FR-X');
    expect(row).toBeUndefined(); // fresh DB
    h2.backend.close();
  });

  it('openDatabaseWithRecovery: corrupt file → quarantine + sqlite.log + fresh DB (SPECGEN004_23)', async () => {
    const dbDir = path.join(root, '.dev-pomogator');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, '.spec-index.sqlite');
    fs.writeFileSync(dbPath, Buffer.alloc(8192, 0xff)); // not-a-database garbage

    const res = await openDatabaseWithRecovery({
      repoRoot: root,
      now: new Date('2026-05-30T00:00:00Z'),
    });
    try {
      expect(res.recovered).toBe(true);
      expect(res.quarantinedTo).toMatch(/\.spec-index\.sqlite\.corrupt-/);
      expect(fs.existsSync(res.quarantinedTo!)).toBe(true);
      // Reopened fresh + empty at the original path.
      expect(res.handle.backend.available).toBe(true);
      const n = res.handle.backend.prepare('SELECT COUNT(*) AS n FROM nodes').get() as { n: number };
      expect(n.n).toBe(0);
      // Warning logged.
      const log = fs.readFileSync(path.join(dbDir, 'logs', 'sqlite.log'), 'utf8');
      expect(log).toMatch(/\[WARN\].*corrupt SQLite index/);
    } finally {
      res.handle.backend.close();
    }
  });

  it('openDatabaseWithRecovery: healthy DB → no recovery, no log', async () => {
    const res = await openDatabaseWithRecovery({ repoRoot: root });
    try {
      expect(res.recovered).toBe(false);
      expect(integrityCheck(res.handle)).toBe('ok');
      expect(fs.existsSync(path.join(root, '.dev-pomogator', 'logs', 'sqlite.log'))).toBe(false);
    } finally {
      res.handle.backend.close();
    }
  });
});
