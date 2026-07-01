/**
 * @FR-23 / @FR-28 step definitions — closing the NO-SCEN class found by the
 * 2026-06-07 per-FR implementation review: both FRs were implemented and
 * vitest-verified but carried ZERO BDD scenarios (invisible to the graph's
 * tested-by layer). Bound to the REAL writers / the REAL pure throttle:
 *   122 → FR-23  two-tier log inventory (soft → form-guards.log, hard → JSONL)
 *   123 → FR-28  fixed (non-sliding) push window + aggregated dedup flush
 *
 * @see .specs/spec-generator-v4/FR.md FR-23, FR-28
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { logEvent, readRecentEvents } from '../../tools/specs-validator/audit-logger.ts';
import { appendFinding } from '../../tools/spec-check-log/writer.ts';
import { decidePush, type PushDecision } from '../../tools/spec-conformance-push/spec-conformance-push.ts';
import type { Finding } from '../../tools/spec-graph/conformance.ts';

// ── SPECGEN004_122 — FR-23: each tier writes to its own sink ───────────────

interface F23World extends V4World {
  softMarker?: string;
  hardRepoRoot?: string;
  hardShardPath?: string;
}

function mkFinding(message: string, line = 1): Finding {
  // findingKey = code|file|line|nodeId|relatedId (message is NOT in the key) —
  // distinct findings must differ by line; true duplicates share it.
  return {
    code: 'ORPHAN_TASK',
    severity: 'warning',
    message,
    location: { file: '.specs/probe/TASKS.md', line },
  } as Finding;
}

Given('a soft-tier event and a hard-tier finding', function (this: F23World) {
  this.softMarker = `bdd-fr23-${process.pid}-${this.tempDir.split(/[\\/]/).pop()}`;
  this.hardRepoRoot = path.join(this.tempDir, 'repo');
  fs.mkdirSync(this.hardRepoRoot, { recursive: true });
});

When('each is logged through its canonical writer', function (this: F23World) {
  // Soft tier: the real audit-logger (global ~/.dev-pomogator/logs/form-guards.log).
  logEvent('bdd-fr23-probe', 'ALLOW_VALID', this.softMarker!, 'FR-23 inventory scenario');
  // Hard tier: the real spec-check-log writer into an ISOLATED repo root —
  // the sink must be creatable on FIRST write (no pre-existing dir).
  this.hardShardPath = appendFinding(mkFinding('FR-23 hard-tier probe'), {
    repoRoot: this.hardRepoRoot!,
  });
});

Then('the soft event lands in the global form-guards log', function (this: F23World) {
  const mine = readRecentEvents(1).filter(
    (e) => e.hookName === 'bdd-fr23-probe' && e.filepath === this.softMarker,
  );
  assert.ok(mine.length >= 1, 'the soft-tier event must be readable back from form-guards.log');
});

Then(
  'the hard finding lands in the repo spec-check-log JSONL created on first write',
  function (this: F23World) {
    assert.ok(this.hardShardPath, 'appendFinding must return the shard path');
    assert.ok(
      this.hardShardPath!.replace(/\\/g, '/').includes('/.dev-pomogator/.spec-check-log/'),
      `hard tier must write under .dev-pomogator/.spec-check-log/, got ${this.hardShardPath}`,
    );
    const lines = fs.readFileSync(this.hardShardPath!, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.equal(entry.finding_code, 'ORPHAN_TASK'); // REAL envelope field (composeEntry)
    assert.ok(entry.timestamp, 'JSONL entry carries a timestamp envelope');
  },
);

// ── SPECGEN004_123 — FR-28: fixed window, aggregated dedup flush ───────────

interface F28World extends V4World {
  state?: PushDecision['newState'];
  flush?: PushDecision;
  t0?: number;
}

Given('findings accumulating in bursts within one throttle window', function (this: F28World) {
  this.t0 = 1_000_000;
  const first = decidePush({ now: this.t0, previous: null, newFindings: [mkFinding('burst-1', 1)] });
  assert.equal(first.emit, null, 'inside the window nothing is emitted');
  assert.equal(first.newState?.window_start, this.t0, 'first burst opens the window');
  this.state = first.newState;
});

When('more findings arrive before the window elapses', function (this: F28World) {
  const second = decidePush({
    now: this.t0! + 1_500,
    previous: this.state!,
    newFindings: [mkFinding('burst-2', 2), mkFinding('burst-2', 2)], // true duplicate: same key (line 2)
  });
  assert.equal(second.emit, null, 'still inside the window');
  this.state = second.newState;
});

Then('the window start stays the original one', function (this: F28World) {
  assert.equal(
    this.state?.window_start,
    this.t0,
    'FIXED window: accumulating bursts must NOT slide window_start forward',
  );
});

Then('the flush after the window carries the aggregated deduplicated set', function (this: F28World) {
  this.flush = decidePush({
    now: this.t0! + 3_001, // > WINDOW_MS (3000)
    previous: this.state!,
    newFindings: [],
  });
  assert.ok(this.flush.emit, 'window elapsed → one aggregated push');
  assert.equal(this.flush.newState, null, 'state cleared after flush');
  assert.ok(this.flush.emit!.includes('burst-1'), 'flush carries the first burst');
  assert.ok(this.flush.emit!.includes('burst-2'), 'flush carries the second burst');
  const dupCount = (this.flush.emit!.match(/burst-2/g) ?? []).length;
  assert.equal(dupCount, 1, `duplicates must be deduped in the flush, got ${dupCount} occurrences`);
});
