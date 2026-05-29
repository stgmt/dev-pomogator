/**
 * Tests for the spec-check-log CLI (FR-15 reader path).
 *
 * Cover the canonical query knobs: --since, --grep, --code, --severity,
 * --source, --json, --count. Driven through the in-process `run()`
 * entry, no subprocess spawn.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { run, parseDuration } from '../cli.ts';
import { appendFinding } from '../writer.ts';
import type { Finding } from '../../spec-graph/conformance.ts';

function fr(file: string, line: number, code = 'UNCOVERED_FR'): Finding {
  return {
    code: code as Finding['code'],
    severity: code === 'UNCOVERED_FR' ? 'warning' : 'info',
    location: { file, line },
    message: `${code} on ${file}:${line}`,
  };
}

describe('parseDuration', () => {
  it('parses common shapes', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('5m')).toBe(5 * 60_000);
    expect(parseDuration('24h')).toBe(86_400_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('1w')).toBe(604_800_000);
  });
  it('returns null on bad input', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1y')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});

describe('cli.run — filters', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `cli-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function seed(): void {
    const t0 = new Date('2026-05-29T00:00:00Z');
    appendFinding(fr('.specs/auth/FR.md', 1), { repoRoot: root, source: 'push', now: t0 });
    appendFinding(fr('.specs/auth/FR.md', 2, 'ORPHAN_TASK'), {
      repoRoot: root,
      source: 'push',
      now: new Date(t0.getTime() + 5_000),
    });
    appendFinding(fr('.specs/billing/FR.md', 1, 'UNTAGGED_SCENARIO'), {
      repoRoot: root,
      source: 'guard',
      now: new Date(t0.getTime() + 10_000),
    });
  }

  it('returns every entry without filters', () => {
    seed();
    const { matched } = run(['--root', root]);
    expect(matched).toHaveLength(3);
  });

  it('filters by --code', () => {
    seed();
    const { matched } = run(['--root', root, '--code', 'ORPHAN_TASK']);
    expect(matched).toHaveLength(1);
    expect(matched[0].finding_code).toBe('ORPHAN_TASK');
  });

  it('filters by --severity', () => {
    seed();
    const { matched } = run(['--root', root, '--severity', 'info']);
    expect(matched).toHaveLength(2);
    for (const m of matched) expect(m.severity).toBe('info');
  });

  it('filters by --source', () => {
    seed();
    const { matched } = run(['--root', root, '--source', 'guard']);
    expect(matched).toHaveLength(1);
    expect(matched[0].source).toBe('guard');
  });

  it('filters by --grep (case-insensitive)', () => {
    seed();
    const { matched } = run(['--root', root, '--grep', 'orphan']);
    expect(matched.every((e) => e.message.toLowerCase().includes('orphan'))).toBe(true);
  });

  it('filters by --since against `now`', () => {
    seed();
    // Time-travel: `now` = entry 1's timestamp + 7s. Window = 4s.
    // Only entries newer than (now - 4s) ⇒ entries 2 and 3 in seed().
    const now = Date.parse('2026-05-29T00:00:07Z');
    const { matched } = run(['--root', root, '--since', '4s'], now);
    expect(matched).toHaveLength(2);
  });

  it('--count emits the integer count', () => {
    seed();
    const { text } = run(['--root', root, '--count']);
    expect(text.trim()).toBe('3');
  });

  it('--json re-emits canonical JSONL lines', () => {
    seed();
    const { text } = run(['--root', root, '--json']);
    const lines = text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(() => lines.forEach((l) => JSON.parse(l))).not.toThrow();
  });

  it('rejects an unknown flag with a clear error', () => {
    expect(() => run(['--root', root, '--wat'])).toThrow(/unknown flag/);
  });
});
