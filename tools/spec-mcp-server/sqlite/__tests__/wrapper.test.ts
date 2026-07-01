// Tests for the SQLite wrapper (FR-10 + NFR-Reliability-5).
//
// `better-sqlite3` is an optional native dep; on a vanilla Docker image
// it's not loadable (--ignore-scripts skips the prebuild) so the tests
// drive the wrapper with two fixtures:
//   • an injectable in-memory stub that mimics the constructor surface,
//     so the «opt-in enabled» path is exercised deterministically;
//   • the real loader path that confirms the wrapper degrades to a stub
//     when the native binding can't be loaded.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  openDatabase,
  integrityCheck,
  quarantineCorrupt,
  SCHEMA_VERSION,
} from '../wrapper.ts';

interface FakeRow {
  key?: string;
  value?: string;
  integrity_check?: string;
}

// Minimal in-memory fake that satisfies the wrapper's contract.
function makeFakeSqliteCtor(): new (p: string) => unknown {
  return class FakeDb {
    private rows = new Map<string, string>();
    private execLog: string[] = [];
    constructor(public dbPath: string) {}
    exec(sql: string): void {
      this.execLog.push(sql);
    }
    prepare(sql: string): {
      run: (...args: unknown[]) => { changes: number };
      get: (...args: unknown[]) => FakeRow | undefined;
      all: () => unknown[];
    } {
      const isInsert = /INSERT.*meta/i.test(sql);
      const isSelect = /SELECT.*FROM meta/i.test(sql);
      return {
        run: (...args: unknown[]): { changes: number } => {
          if (isInsert) {
            const k = String(args[0]);
            const v = String(args[1]);
            this.rows.set(k, v);
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        get: (...args: unknown[]): FakeRow | undefined => {
          if (isSelect) {
            const k = String(args[0]);
            const v = this.rows.get(k);
            return v === undefined ? undefined : { value: v };
          }
          return undefined;
        },
        all: (): unknown[] => [],
      };
    }
    pragma(spec: string): unknown {
      if (spec === 'integrity_check') return [{ integrity_check: 'ok' }];
      return [];
    }
    close(): void {
      /* noop */
    }
  };
}

describe('openDatabase — degraded path (no native binding)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `sqlite-stub-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns a stub backend when the loader throws', async () => {
    const handle = await openDatabase({
      repoRoot: root,
      loader: () => {
        throw new Error('not installed');
      },
    });
    expect(handle.backend.available).toBe(false);
    expect(handle.backend.reason).toBe('native_binding_missing');
    expect(handle.schemaVersion()).toBe(0);
  });

  it('stub backend throws when callers try to query', async () => {
    const handle = await openDatabase({
      repoRoot: root,
      loader: () => {
        throw new Error('not installed');
      },
    });
    expect(() => handle.backend.exec('SELECT 1')).toThrow(/unavailable/);
  });
});

describe('openDatabase — opt-in path (fake native ctor)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `sqlite-real-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('initialises schema + stamps SCHEMA_VERSION on first open', async () => {
    const Ctor = makeFakeSqliteCtor();
    const handle = await openDatabase({
      repoRoot: root,
      loader: () => ({ default: Ctor }),
    });
    expect(handle.backend.available).toBe(true);
    expect(handle.schemaVersion()).toBe(SCHEMA_VERSION);
  });

  it('integrityCheck returns "ok" on a fresh DB', async () => {
    const Ctor = makeFakeSqliteCtor();
    const handle = await openDatabase({
      repoRoot: root,
      loader: () => ({ default: Ctor }),
    });
    expect(integrityCheck(handle)).toBe('ok');
  });

  it('integrityCheck returns "unavailable" when backend is a stub', async () => {
    const handle = await openDatabase({
      repoRoot: root,
      loader: () => {
        throw new Error('nope');
      },
    });
    expect(integrityCheck(handle)).toBe('unavailable');
  });
});

describe('quarantineCorrupt', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `sqlite-quarantine-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('renames an existing DB file with a .corrupt-<ts> suffix', () => {
    const db = path.join(root, '.spec-index.sqlite');
    fs.writeFileSync(db, 'fake-bytes');
    const target = quarantineCorrupt(db, new Date('2026-05-30T00:00:00.000Z'));
    expect(target).toBe(`${db}.corrupt-2026-05-30T00-00-00-000Z`);
    expect(fs.existsSync(db)).toBe(false);
    expect(fs.existsSync(target!)).toBe(true);
  });

  it('returns null when there is nothing to quarantine', () => {
    expect(quarantineCorrupt(path.join(root, 'missing.sqlite'))).toBeNull();
  });
});
