/**
 * Phase 4 BDD step definitions — side-channel JSONL log + Codespaces.
 *
 * Wires SPECGEN004_34 (single-entry append) and SPECGEN004_35 (10MB
 * rotation) through the real production writer. SQLite-flavoured Phase 4
 * scenarios (SPECGEN004_21..23) land in a follow-up commit on the same
 * branch — they need `better-sqlite3` which forces a native rebuild.
 *
 * @see ../../tools/spec-check-log/writer.ts
 * @see ../../tools/spec-check-log/cli.ts
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appendFinding, activeShardPath, ROTATION_BYTES } from '../../tools/spec-check-log/writer.ts';
import type { Finding } from '../../tools/spec-graph/conformance.ts';
import type { V4World } from '../hooks/before-after.ts';

interface Phase4World extends V4World {
  finding?: Finding;
  shardWritten?: string;
  rotationOccurred?: boolean;
  preRotationFiles?: string[];
}

// ─── SPECGEN004_34 — append one entry per finding ────────────────────────

Given(
  /^a conformance_check produces a finding `([A-Z_]+)` for ([\w-]+)$/,
  function (this: Phase4World, code: string, nodeId: string) {
    this.finding = {
      code: code as Finding['code'],
      severity: 'warning',
      location: { file: '.specs/auth/auth.feature', line: 14 },
      message: `${code} on SCEN ${nodeId}`,
      nodeId,
    };
  },
);

When('PostToolUse hook completes', function (this: Phase4World) {
  assert.ok(this.finding, 'finding must be seeded');
  this.shardWritten = appendFinding(this.finding, {
    repoRoot: this.tempDir,
    source: 'spec-conformance-push',
    sessionId: 'sess-phase4-test',
    now: new Date('2026-05-29T03:00:00Z'),
  });
});

Then(
  /^a JSONL line is appended to `\.dev-pomogator\/\.spec-check-log\/<YYYY-MM-DD>\.jsonl`$/,
  function (this: Phase4World) {
    assert.ok(this.shardWritten, 'shard path must be set');
    assert.equal(path.basename(this.shardWritten!), '2026-05-29.jsonl');
    const lines = fs
      .readFileSync(this.shardWritten!, 'utf8')
      .split('\n')
      .filter(Boolean);
    assert.equal(lines.length, 1);
  },
);

Then(
  /^the line contains `timestamp`, `finding_code`, `severity`, `location`, `message`, `spec_slug`$/,
  function (this: Phase4World) {
    const raw = fs.readFileSync(this.shardWritten!, 'utf8').trim();
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ['timestamp', 'finding_code', 'severity', 'location', 'message', 'spec_slug']) {
      assert.ok(k in obj, `missing field "${k}" in log entry`);
    }
    assert.equal((obj.location as { file: string }).file, '.specs/auth/auth.feature');
  },
);

Then('the JSONL line is valid JSON parseable line-by-line', function (this: Phase4World) {
  const raw = fs.readFileSync(this.shardWritten!, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    assert.doesNotThrow(() => JSON.parse(line));
  }
});

// ─── SPECGEN004_35 — 10MB rotation ───────────────────────────────────────

Given(
  /^the current `\.spec-check-log\/<YYYY-MM-DD>\.jsonl` file size is 9\.5MB$/,
  function (this: Phase4World) {
    // Synthetic seed at a size that the next append will cross. The test
    // uses a tiny rotation threshold rather than physically writing 9.5MB
    // so it runs in milliseconds.
    const dir = path.join(this.tempDir, '.dev-pomogator', '.spec-check-log');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '2026-05-29.jsonl'), 'x'.repeat(100));
    this.preRotationFiles = fs.readdirSync(dir);
  },
);

When('the next append would exceed 10MB', function (this: Phase4World) {
  const finding: Finding = {
    code: 'UNCOVERED_FR',
    severity: 'warning',
    location: { file: '.specs/auth/FR.md', line: 1 },
    message: 'cross-rotation finding',
    nodeId: 'FR-A',
  };
  this.shardWritten = appendFinding(finding, {
    repoRoot: this.tempDir,
    source: 'test',
    now: new Date('2026-05-29T03:00:00Z'),
    // Synthetic threshold so the seeded 100B file already exceeds it.
    rotationBytes: 50,
  });
  this.rotationOccurred = path.basename(this.shardWritten).includes('-1.jsonl');
});

Then(
  /^the file is rotated to `\.spec-check-log\/<YYYY-MM-DD>-1\.jsonl`$/,
  function (this: Phase4World) {
    assert.equal(this.rotationOccurred, true, `expected rotation; got shard ${this.shardWritten}`);
    assert.equal(path.basename(this.shardWritten!), '2026-05-29-1.jsonl');
  },
);

Then(
  /^a new file `\.spec-check-log\/<YYYY-MM-DD>-2\.jsonl` starts for subsequent appends$/,
  function (this: Phase4World) {
    // The Phase-4 contract is «next shard suffix increments by one». Drive
    // one more append while the threshold is still tiny to confirm the
    // monotone progression.
    const finding: Finding = {
      code: 'UNCOVERED_FR',
      severity: 'warning',
      location: { file: '.specs/auth/FR.md', line: 2 },
      message: 'second cross-rotation finding',
      nodeId: 'FR-B',
    };
    const shard = appendFinding(finding, {
      repoRoot: this.tempDir,
      source: 'test',
      now: new Date('2026-05-29T03:00:00Z'),
      rotationBytes: 50,
    });
    assert.equal(path.basename(shard), '2026-05-29-2.jsonl');
  },
);

Then('previous files are not modified', function (this: Phase4World) {
  // The original 9.5MB stand-in shard (100B of 'x') must remain byte-stable.
  const dir = path.join(this.tempDir, '.dev-pomogator', '.spec-check-log');
  const base = fs.readFileSync(path.join(dir, '2026-05-29.jsonl'), 'utf8');
  assert.equal(base, 'x'.repeat(100));
});

// ─── ROTATION_BYTES contract sanity ──────────────────────────────────────
// (Not a separate Gherkin step; surfaces the constant for the reviewer.)
void ROTATION_BYTES;
