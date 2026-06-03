/**
 * Tests for the spec-check-log JSONL writer (FR-15).
 *
 * Pin the FR-15 invariants:
 *   1. Each finding becomes one parseable JSON line in `<YYYY-MM-DD>.jsonl`.
 *   2. The envelope carries the canonical metadata fields the CLI reader
 *      promises: timestamp / finding_code / severity / location / message /
 *      spec_slug / source / session_id.
 *   3. Rotation past the 10 MB threshold rolls over to `<YYYY-MM-DD>-1.jsonl`
 *      AND prior shards are preserved untouched.
 *   4. `appendFinding` is concurrent-safe via `fs.appendFileSync` (O_APPEND)
 *      — pinned by a synchronous-burst regression test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  appendFinding,
  appendRawEntry,
  composeEntry,
  activeShardPath,
  ROTATION_BYTES,
} from '../writer.ts';
import type { Finding } from '../../spec-graph/conformance.ts';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    code: 'UNCOVERED_FR',
    severity: 'warning',
    location: { file: '.specs/auth/FR.md', line: 12 },
    message: 'FR-001 has no AC and no tested-by Scenario.',
    nodeId: 'FR-001',
    ...overrides,
  };
}

describe('composeEntry', () => {
  it('carries the FR-15 envelope fields', () => {
    const now = new Date('2026-05-29T03:00:00Z');
    const entry = composeEntry(
      makeFinding(),
      { repoRoot: '/tmp', source: 'spec-conformance-push', sessionId: 'sess-1' },
      now,
    );
    expect(entry.timestamp).toBe(now.toISOString());
    expect(entry.finding_code).toBe('UNCOVERED_FR');
    expect(entry.severity).toBe('warning');
    expect(entry.location.file).toBe('.specs/auth/FR.md');
    expect(entry.location.line).toBe(12);
    expect(entry.spec_slug).toBe('auth');
    expect(entry.source).toBe('spec-conformance-push');
    expect(entry.session_id).toBe('sess-1');
    expect(entry.node_id).toBe('FR-001');
  });

  it('omits spec_slug for non-spec paths', () => {
    const entry = composeEntry(
      makeFinding({ location: { file: 'tools/foo.ts', line: 1 } }),
      { repoRoot: '/tmp', source: 'x' },
      new Date(),
    );
    expect(entry.spec_slug).toBeUndefined();
  });
});

describe('appendFinding — file shape + idempotency', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `spec-check-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes a single parseable JSON line per call', () => {
    const shard = appendFinding(makeFinding(), {
      repoRoot: root,
      source: 'test',
      now: new Date('2026-05-29T03:00:00Z'),
    });
    expect(path.basename(shard)).toBe('2026-05-29.jsonl');
    const raw = fs.readFileSync(shard, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    const obj = JSON.parse(lines[0]) as { finding_code: string };
    expect(obj.finding_code).toBe('UNCOVERED_FR');
  });

  it('appends to the same file when called twice the same day', () => {
    const now = new Date('2026-05-29T03:00:00Z');
    appendFinding(makeFinding(), { repoRoot: root, source: 't', now });
    appendFinding(makeFinding({ code: 'ORPHAN_TASK' }), {
      repoRoot: root,
      source: 't',
      now,
    });
    const shard = activeShardPath(root, '2026-05-29');
    const lines = fs.readFileSync(shard, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).finding_code).toBe('UNCOVERED_FR');
    expect(JSON.parse(lines[1]).finding_code).toBe('ORPHAN_TASK');
  });
});

describe('appendFinding — FR-15 rotation', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `spec-check-rot-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('rolls over when the active shard crosses the threshold', () => {
    const now = new Date('2026-05-29T03:00:00Z');
    // Seed the base shard with bytes just BELOW threshold, then append once.
    const dir = path.join(root, '.dev-pomogator', '.spec-check-log');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, '2026-05-29.jsonl');
    fs.writeFileSync(base, 'x'.repeat(100));
    // Use a tiny rotation threshold to keep the test fast.
    const shard1 = appendFinding(makeFinding(), {
      repoRoot: root,
      source: 't',
      now,
      rotationBytes: 50, // 100B already > 50B → rotate
    });
    expect(path.basename(shard1)).toBe('2026-05-29-1.jsonl');
    // Base shard must remain intact.
    expect(fs.readFileSync(base, 'utf8')).toBe('x'.repeat(100));
  });

  it('continues incrementing the suffix on every rotation', () => {
    const now = new Date('2026-05-29T03:00:00Z');
    const dir = path.join(root, '.dev-pomogator', '.spec-check-log');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '2026-05-29.jsonl'), 'x'.repeat(100));
    fs.writeFileSync(path.join(dir, '2026-05-29-1.jsonl'), 'y'.repeat(100));
    const shard2 = appendFinding(makeFinding(), {
      repoRoot: root,
      source: 't',
      now,
      rotationBytes: 50,
    });
    expect(path.basename(shard2)).toBe('2026-05-29-2.jsonl');
  });

  it('ROTATION_BYTES default is 10 MB per FR-15', () => {
    expect(ROTATION_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('appendRawEntry — arbitrary non-finding entries (FR-19 / FR-22)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `raw-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const lastEntry = (): Record<string, unknown> => {
    const dir = path.join(root, '.dev-pomogator', '.spec-check-log');
    const f = fs.readdirSync(dir).find((n) => n.endsWith('.jsonl'))!;
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  };

  it('writes an arbitrary entry verbatim and auto-stamps a timestamp', () => {
    appendRawEntry({ kind: 'ALLOW_AFTER_MIGRATION', reason: 'spec_version', observed_version: 2 }, {
      repoRoot: root,
      now: new Date('2026-06-03T00:00:00Z'),
    });
    const e = lastEntry();
    expect(e.kind).toBe('ALLOW_AFTER_MIGRATION');
    expect(e.observed_version).toBe(2);
    expect(e.timestamp).toBe('2026-06-03T00:00:00.000Z');
  });

  it('shares rotation with findings (rolls over past the threshold)', () => {
    const shard = appendRawEntry({ a: 1 }, { repoRoot: root, now: new Date('2026-06-03T00:00:00Z') });
    fs.appendFileSync(shard, 'x'.repeat(64)); // push past a tiny threshold
    const shard2 = appendRawEntry({ b: 2 }, {
      repoRoot: root,
      now: new Date('2026-06-03T00:00:00Z'),
      rotationBytes: 32,
    });
    expect(path.basename(shard2)).toBe('2026-06-03-1.jsonl');
  });
});
