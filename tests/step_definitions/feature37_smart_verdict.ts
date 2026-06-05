/**
 * @feature37 step definitions — smart verdict authoritative (FR-37), bound to
 * the REAL verdict entrypoint (no mocks). Built incrementally per Phase-14:
 *   97 → FR-37e  a stale FILE_CHANGES path fails the authoritative verdict
 *   (96 → FR-37a, 98 → FR-37b, 99/100 → FR-37c, 101 → FR-37d land with
 *    P14-2..P14-4 — their steps stay undefined until those tasks ship.)
 *
 * Integration discipline: the When step drives `runSpecVerdict()` — which
 * spawns the real `specs-generator-core.mjs` validate-spec + audit-spec —
 * against a temp fixture spec, NOT a hand-built findings array.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_96..101
 * @see .specs/spec-generator-v4/FR.md FR-37
 * @see tools/specs-generator/spec-verdict.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { runSpecVerdict, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';

interface F37World extends V4World {
  stalePath?: string;
  verdictSpecPath?: string;
  verdictCwd?: string;
  verdictResult?: SpecVerdictResult;
}

// ── SPECGEN004_97 — FR-37e: a stale FILE_CHANGES path fails the verdict ──

Given('a FILE_CHANGES path that does not exist on disk', function (this: F37World) {
  // Fixture corpus in the scenario temp workspace: one spec whose
  // FILE_CHANGES.md has an action=edit row pointing at a deleted path —
  // the exact shape of the 9 real `extensions/…` P0s this FR closes.
  this.stalePath = 'extensions/old-extension/tools/gone.ts';
  const specDir = path.join(this.tempDir, '.specs', 'stale-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'FILE_CHANGES.md'),
    [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
      `| \`${this.stalePath}\` | edit | path deleted by the canonical-plugin migration |`,
      '',
    ].join('\n'),
    'utf-8',
  );
  this.verdictSpecPath = path.join('.specs', 'stale-demo');
  this.verdictCwd = this.tempDir;
});

When('the authoritative verdict runs', function (this: F37World) {
  assert.ok(this.verdictSpecPath, 'no spec prepared for the verdict (Given step missing?)');
  this.verdictResult = runSpecVerdict(this.verdictSpecPath, { cwd: this.verdictCwd });
});

Then('it fails with a hard error naming the stale path', function (this: F37World) {
  const r = this.verdictResult;
  assert.ok(r, 'verdict did not run');
  assert.equal(r.verdict, 'RED', `expected RED verdict, got ${r.verdict}`);
  const staleFindings = r.auditGate.byClass['FILE_CHANGES_VERIFY'] ?? [];
  assert.ok(
    staleFindings.length >= 1,
    `expected a FILE_CHANGES_VERIFY hard error, got classes: ${Object.keys(r.auditGate.byClass).join(', ') || '(none)'}`,
  );
  assert.ok(
    staleFindings.some((f) => f.message.includes(this.stalePath!)),
    `stale path "${this.stalePath}" not named in: ${staleFindings.map((f) => f.message).join(' | ')}`,
  );
  // The gap list (what an agent acts on) must name it too.
  assert.ok(
    r.gapList.some((line) => line.includes('FILE_CHANGES_VERIFY') && line.includes(this.stalePath!)),
    `gap list does not name the stale path: ${r.gapList.join(' | ')}`,
  );
});
