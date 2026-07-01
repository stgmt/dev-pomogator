/**
 * @FR-45 step definitions — SPECGEN004_224..227. Tests the investigateDrifted()
 * helper (spec-archive.ts) — the function that reads a drifted spec's README +
 * FILE_CHANGES, searches for its claimed implementation on disk (including v1→v2
 * path moves via basename matching), and recommends KEEP_DRIFTED vs RETIRE_CANDIDATE.
 *
 * All scenarios are in-process: import the real function, build tmpdir fixtures,
 * call it, assert on the returned DriftInvestigation. No mocks, no inline copies.
 *
 * @see tools/specs-generator/spec-archive.ts investigateDrifted
 * @see .specs/spec-generator-v4/FR.md FR-45
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_224
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { investigateDrifted, type DriftInvestigation } from '../../tools/specs-generator/spec-archive.ts';
import { V4World } from '../hooks/before-after.ts';

interface DriftWorld extends V4World {
  driftTmp?: string;
  driftSlug?: string;
  driftResult?: DriftInvestigation;
}

/** Build a throwaway repo root with a tools/foo/ source tree. */
function mkDriftRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-inv-'));
  fs.mkdirSync(path.join(tmp, 'tools', 'foo'), { recursive: true });
  return tmp;
}

function writeSpec(tmp: string, slug: string, readme: string, fileChanges: string): void {
  const dir = path.join(tmp, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), readme);
  fs.writeFileSync(path.join(dir, 'FILE_CHANGES.md'), fileChanges);
}

// ─── Given steps ─────────────────────────────────────────────────────────────

Given(/^a drifted spec whose README marks it as shipped and whose claimed impl exists on disk$/, function (this: DriftWorld) {
  const tmp = mkDriftRepo();
  writeSpec(tmp, 'alive', '# Alive\n\n**Status: shipped 0.1.0** body line\n', '| `tools/foo/bar.ts` | create |\n');
  fs.writeFileSync(path.join(tmp, 'tools', 'foo', 'bar.ts'), 'export {};\n');
  this.driftTmp = tmp;
  this.driftSlug = 'alive';
});

Given(/^a drifted spec whose FILE_CHANGES points to an old v1 path but the file moved to tools\/ keeping its basename$/, function (this: DriftWorld) {
  const tmp = mkDriftRepo();
  writeSpec(tmp, 'moved', '# Moved\n\nbody, no status marker\n', '| `extensions/x/tools/widget.py` | create |\n');
  fs.writeFileSync(path.join(tmp, 'tools', 'foo', 'widget.py'), '# moved here in v2\n');
  this.driftTmp = tmp;
  this.driftSlug = 'moved';
});

Given(/^a drifted spec with no shipped marker and its claimed impl absent from disk$/, function (this: DriftWorld) {
  const tmp = mkDriftRepo();
  writeSpec(tmp, 'dead', '# Dead\n\nbody, no status marker\n', '| `tools/gone/missing.ts` | create |\n');
  this.driftTmp = tmp;
  this.driftSlug = 'dead';
});

Given(/^a spec directory that exists but contains no README or FILE_CHANGES$/, function (this: DriftWorld) {
  const tmp = mkDriftRepo();
  fs.mkdirSync(path.join(tmp, '.specs', 'empty'), { recursive: true });
  this.driftTmp = tmp;
  this.driftSlug = 'empty';
});

// ─── When step ────────────────────────────────────────────────────────────────

When(/^investigateDrifted runs on that spec$/, function (this: DriftWorld) {
  this.driftResult = investigateDrifted(this.driftTmp!, this.driftSlug!);
});

// ─── Then steps ──────────────────────────────────────────────────────────────

Then(/^the investigation recommends KEEP_DRIFTED with shipped=true and codePresent=true$/, function (this: DriftWorld) {
  assert.equal(this.driftResult!.recommendation, 'KEEP_DRIFTED');
  assert.equal(this.driftResult!.shipped, true);
  assert.equal(this.driftResult!.codePresent, true);
  assert.match(this.driftResult!.summary, /shipped/i);
});

Then(/^the investigation recommends KEEP_DRIFTED with shipped=false and codePresent=true because the basename was found at the moved path$/, function (this: DriftWorld) {
  assert.equal(this.driftResult!.recommendation, 'KEEP_DRIFTED');
  assert.equal(this.driftResult!.shipped, false);
  assert.equal(this.driftResult!.codePresent, true);
  assert.match(this.driftResult!.evidence, /drifted, feature lives/);
});

Then(/^the investigation recommends RETIRE_CANDIDATE with codePresent=false$/, function (this: DriftWorld) {
  assert.equal(this.driftResult!.recommendation, 'RETIRE_CANDIDATE');
  assert.equal(this.driftResult!.codePresent, false);
  assert.match(this.driftResult!.evidence, /none of .* found|cannot tell/);
});

Then(/^the investigation recommends RETIRE_CANDIDATE without throwing$/, function (this: DriftWorld) {
  assert.equal(this.driftResult!.recommendation, 'RETIRE_CANDIDATE');
  assert.equal(this.driftResult!.codePresent, false);
  // no throw — best-effort read; no assertion on evidence pattern (docs absent)
});
