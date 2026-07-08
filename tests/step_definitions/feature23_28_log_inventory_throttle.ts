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
import { appendFinding, appendFindings } from '../../tools/spec-check-log/writer.ts';
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

// ── SPECGEN004_513 — FR-59: bounded push reminder, complete log ─────────────

interface F59World extends V4World {
  f59Findings?: Finding[];
  f59Flush?: PushDecision;
  f59RepoRoot?: string;
}

Given('a PostToolUse push window with {int} conformance findings', function (this: F59World, count: number) {
  this.f59RepoRoot = path.join(this.tempDir, 'fr59-repo');
  fs.mkdirSync(this.f59RepoRoot, { recursive: true });
  this.f59Findings = Array.from({ length: count }, (_, i) =>
    mkFinding(`synthetic-fr59-finding-${i + 1} ${'x'.repeat(220)}`, i + 1),
  );
});

When('the spec-conformance push window flushes', function (this: F59World) {
  this.f59Flush = decidePush({
    now: 4_000,
    previous: { window_start: 1_000, pending: this.f59Findings! },
    newFindings: [],
  });
});

Then('the emitted reminder is at most {int} bytes', function (this: F59World, maxBytes: number) {
  assert.notEqual(this.f59Flush?.emit, null, 'window elapsed → bounded reminder emitted');
  assert.equal(this.f59Flush?.newState, null, 'state clears after the bounded flush');
  assert.equal(
    Buffer.byteLength(this.f59Flush!.emit!, 'utf8') <= maxBytes,
    true,
    `expected reminder <= ${maxBytes} bytes, got ${Buffer.byteLength(this.f59Flush!.emit!, 'utf8')}`,
  );
});

Then('the emitted reminder summarizes the finding count, severity counts, omitted count, and full-log pointer', function (this: F59World) {
  const lines = (this.f59Flush?.emit ?? '').split('\n');
  assert.equal(lines[0], '<system-reminder>');
  assert.equal(lines[1], 'Spec conformance findings (PostToolUse push, 3s window):');
  assert.equal(lines[2], '  3000 finding(s): 3000 warning');
  assert.equal(lines[3], '  Showing up to 20 sample finding(s); omitted 2980.');
  assert.equal(lines[4], '  Full log: .dev-pomogator/.spec-check-log/ (or run /spec-status).');
  assert.equal(lines[lines.length - 1], '</system-reminder>');
});

Then('the emitted reminder shows no more than {int} sample findings', function (this: F59World, maxSamples: number) {
  const emit = this.f59Flush?.emit ?? '';
  const sampleLines = emit.split('\n').filter((line) => /^ {2}\[[A-Z]+\]/.test(line));
  assert.equal(sampleLines.length, maxSamples, `expected exactly ${maxSamples} sample lines`);
  assert.match(sampleLines[0], /^ {2}\[WARNING\] ORPHAN_TASK \.specs\/probe\/TASKS\.md:1 — synthetic-fr59-finding-1 /);
  assert.match(sampleLines[19], /^ {2}\[WARNING\] ORPHAN_TASK \.specs\/probe\/TASKS\.md:20 — synthetic-fr59-finding-20 /);
  assert.doesNotMatch(emit, /synthetic-fr59-finding-21\s/);
  assert.doesNotMatch(emit, /synthetic-fr59-finding-3000\s/);
});

Then('the durable spec-check-log writer still records every synthetic finding', function (this: F59World) {
  appendFindings(this.f59Findings!, {
    repoRoot: this.f59RepoRoot!,
    source: 'spec-conformance-push',
    sessionId: 'bdd-fr59',
    now: new Date('2026-07-09T00:00:00.000Z'),
  });
  const dir = path.join(this.f59RepoRoot!, '.dev-pomogator', '.spec-check-log');
  const lines = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean));
  assert.equal(lines.length, this.f59Findings!.length, 'writer must retain every synthetic finding');
  const first = JSON.parse(lines[0]);
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(first.source, 'spec-conformance-push');
  assert.equal(first.session_id, 'bdd-fr59');
  assert.equal(first.finding_code, 'ORPHAN_TASK');
  assert.match(first.message, /synthetic-fr59-finding-1/);
  assert.match(last.message, /synthetic-fr59-finding-3000/);
});
