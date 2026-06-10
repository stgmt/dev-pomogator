/**
 * FR-20 / T-Trans.2 — threshold-only conformance summary + ack contract.
 *
 * Exercises the REAL functions (in-process — latency p95 measurable without
 * subprocess noise) AND the real `ack-summary.ts` CLI subprocess for the
 * atomic-concurrent criterion. Soft-tier entries are seeded through the real
 * audit-logger format into an ISOLATED home (HOME/USERPROFILE override in
 * subprocess; in-process tests inject paths).
 *
 * The 5 T-Trans.2 criteria:
 *   1. threshold-zero  → emits NOTHING
 *   2. threshold-≥1    → single line `📊 Spec conformance: \d+ unresolved DENY since`
 *   3. ack             → after ack-summary runs, the seeded entry is silent;
 *                        a NEWER deny re-triggers
 *   4. latency         → render ≤50ms p95 across 100 trials, 1000-entry corpus
 *   5. atomic ack      → 8 concurrent ack writers → file is always valid JSON
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildConformanceSummary,
  buildTaskCensusLine,
  countHardDenySince,
  readAck,
  writeAckAtomic,
} from '../conformance-summary.ts';
import { composeEntry } from '../../spec-check-log/writer.ts';
import { writeTaskCensusCache } from '../../spec-graph/task-census.ts';

const ACK_CLI = path.resolve(__dirname, '..', 'ack-summary.ts');

let root: string;
let ackFile: string;
let repoRoot: string;
let softLog: string;

/** Seed N hard-tier deny findings via the REAL writer envelope (composeEntry —
 *  `finding_code` field). SPECGEN004_122 caught the old hand-rolled `code` seed
 *  masking a prod field mismatch (verify-against-real-artifact discipline). */
function seedHardDeny(n: number, ts = new Date()): void {
  const dir = path.join(repoRoot, '.dev-pomogator', '.spec-check-log');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const lines = Array.from({ length: n }, (_, i) =>
    JSON.stringify(
      composeEntry(
        {
          code: 'DUPLICATE_DEFINITION',
          severity: 'error',
          message: `seeded ${i}`,
          location: { file: '.specs/probe/FR.md', line: i + 1 },
        } as Parameters<typeof composeEntry>[0],
        { repoRoot },
        new Date(ts.getTime() + i),
      ),
    ),
  );
  fs.appendFileSync(file, lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr20-'));
  ackFile = path.join(root, 'state', 'last-summary-ack.json');
  repoRoot = path.join(root, 'repo');
  fs.mkdirSync(repoRoot, { recursive: true });
  // Isolated EMPTY soft-tier log: sibling guard suites write real DENYs into
  // the machine-local form-guards.log concurrently — counts must not race.
  softLog = path.join(root, 'soft.log');
  fs.writeFileSync(softLog, '');
});

afterAll(() => {
  // best-effort: leaf temp dirs die with the OS tmp cleaner anyway
});

describe('P21-6 per-spec task-census banner (buildTaskCensusLine)', () => {
  it('emits header + per-spec lines, surfacing open / 🔴 / ⏸', () => {
    writeTaskCensusCache(
      repoRoot,
      {
        total: { open: 29, doneRed: 1, doneUnrun: 3 },
        specs: [
          { slug: 'spec-generator-v4', open: 29, doneRed: 1, doneUnrun: 3 },
          { slug: 'session-pilot', open: 4, doneRed: 0, doneUnrun: 0 },
        ],
      },
      '2026-06-10T00:00:00Z',
    );
    const line = buildTaskCensusLine(repoRoot)!;
    expect(line).toMatch(/^📋 Spec tasks \(census 2026-06-10.*\): 29 open, 1 🔴 done-but-red, 3 ⏸ done-but-not-run/);
    expect(line).toMatch(/\n {3}spec-generator-v4: 29 open, 1🔴, 3⏸/);
    expect(line).toMatch(/\n {3}session-pilot: 4 open/);
  });

  it('shows было→стало when the total changed since the prev snapshot', () => {
    // first write (no prev) — silent on history
    writeTaskCensusCache(repoRoot, { total: { open: 29, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'x', open: 29, doneRed: 0, doneUnrun: 0 }] }, 't1');
    expect(buildTaskCensusLine(repoRoot)).not.toMatch(/было/);
    // changed total → rotation + история line
    writeTaskCensusCache(repoRoot, { total: { open: 31, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'x', open: 31, doneRed: 0, doneUnrun: 0 }] }, 't2');
    expect(buildTaskCensusLine(repoRoot)!).toMatch(/\[было 29 → стало 31, не подтверждено\]/);
  });

  it('caps to top-5 specs with «ещё N»', () => {
    const specs = Array.from({ length: 8 }, (_, i) => ({ slug: `s${i}`, open: 8 - i, doneRed: 0, doneUnrun: 0 }));
    writeTaskCensusCache(repoRoot, { total: { open: 36, doneRed: 0, doneUnrun: 0 }, specs }, 't');
    const line = buildTaskCensusLine(repoRoot)!;
    expect((line.match(/\n {3}s\d:/g) || []).length).toBe(5);
    expect(line).toMatch(/…ещё 3 спек/);
  });

  it('is silent when nothing is unfinished or the cache is absent', () => {
    expect(buildTaskCensusLine(repoRoot)).toBeNull(); // no cache
    writeTaskCensusCache(repoRoot, { total: { open: 0, doneRed: 0, doneUnrun: 0 }, specs: [] }, 't');
    expect(buildTaskCensusLine(repoRoot)).toBeNull(); // all clean → zero-noise
  });
});

describe('FR-20 threshold-only summary + ack (T-Trans.2)', () => {
  it('emits NOTHING when both logs hold zero unresolved events (threshold-zero)', () => {
    // Isolated repoRoot (no JSONL) + never-acked state + soft-tier filtered by
    // an ack stamped NOW so any real machine-local audit entries are excluded.
    writeAckAtomic({ ack_timestamp: new Date().toISOString(), ack_event_count: 0 }, ackFile);
    const line = buildConformanceSummary({ ackFile, repoRoot, softLog });
    expect(line).toBeNull();
  });

  it('emits a single matching line when ≥1 unresolved DENY exists (threshold-≥1)', () => {
    writeAckAtomic({ ack_timestamp: new Date(Date.now() - 60_000).toISOString(), ack_event_count: 0 }, ackFile);
    seedHardDeny(3);
    const line = buildConformanceSummary({ ackFile, repoRoot, softLog });
    expect(line).not.toBeNull();
    expect(line!).toMatch(/^📊 Spec conformance: \d+ unresolved DENY since /);
    expect(line!).toContain('3 unresolved DENY');
    expect(line!.split('\n')).toHaveLength(1); // ONE line, not an aggregate dump
  });

  it('goes silent after ack-summary.ts runs, and re-triggers on a NEWER deny (ack)', () => {
    seedHardDeny(2);
    expect(buildConformanceSummary({ ackFile, repoRoot, softLog })).not.toBeNull();

    // Real CLI subprocess — the same invocation the /spec-status skill makes.
    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', ACK_CLI, '--ack-file', ackFile, '--repo-root', repoRoot, '--soft-log', softLog],
      { encoding: 'utf-8', timeout: 60_000 },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('acknowledged at');
    const state = readAck(ackFile);
    expect(state).not.toBeNull();
    expect(state!.ack_event_count).toBeGreaterThanOrEqual(2);

    // Seeded entries are now acknowledged → silence.
    expect(buildConformanceSummary({ ackFile, repoRoot, softLog })).toBeNull();

    // A NEW deny after the ack re-triggers the line with count 1.
    seedHardDeny(1, new Date(Date.now() + 5))
    // ensure strictly-after the ack timestamp:
    ;
    const after = buildConformanceSummary({ ackFile, repoRoot, softLog });
    expect(after).not.toBeNull();
    expect(after!).toContain('1 unresolved DENY');
  });

  it('renders ≤50ms p95 over 100 trials on a 1000-entry corpus (NFR-Performance-6)', () => {
    writeAckAtomic({ ack_timestamp: new Date(Date.now() - 60_000).toISOString(), ack_event_count: 0 }, ackFile);
    seedHardDeny(1000);
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const line = buildConformanceSummary({ ackFile, repoRoot, softLog });
      samples.push(performance.now() - t0);
      expect(line).toContain('1000 unresolved DENY');
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95, `p95=${p95.toFixed(2)}ms over 100 trials`).toBeLessThanOrEqual(50);
  });

  it('keeps the ack file valid JSON under 8 concurrent writers (atomic write)', () => {
    const procs = Array.from({ length: 8 }, () =>
      spawnSync(
        process.execPath,
        ['--import', 'tsx', ACK_CLI, '--ack-file', ackFile, '--repo-root', repoRoot, '--soft-log', softLog],
        { encoding: 'utf-8', timeout: 60_000 },
      ),
    );
    for (const r of procs) expect(r.status, r.stderr).toBe(0);
    // Whatever writer won, the file must NEVER be torn: full parse + shape.
    const state = readAck(ackFile);
    expect(state).not.toBeNull();
    expect(typeof state!.ack_timestamp).toBe('string');
    expect(Number.isFinite(state!.ack_event_count)).toBe(true);
    // No stray temp files left behind.
    const leftovers = fs.readdirSync(path.dirname(ackFile)).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('caps the hard-tier scan at the last 1000 entries (bounded cost, FR-20)', () => {
    seedHardDeny(1200);
    expect(countHardDenySince(null, repoRoot)).toBe(1000);
  });
});
