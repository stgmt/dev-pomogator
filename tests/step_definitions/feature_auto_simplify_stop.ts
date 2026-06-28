/**
 * PLUGIN_AUTOSIMPLIFY step definitions — the auto-simplify Stop hook.
 *
 * Migrated from tests/e2e/simplify-stop.test.ts (+ the dead orphan PLUGIN_auto-simplify.feature, which
 * had pseudo-tags `# @featureN` and NO step-defs). Drives the REAL tools/auto-simplify/simplify_stop.ts
 * spawned through the plugin bootstrap launcher with a per-scenario workspace, crafted stdin + env, and
 * real `.simplify-marker.json` fixtures keyed by the REAL hashFileList (no mocks). The diff size is
 * driven by the hook's own SIMPLIFY_DIFF_OVERRIDE test hook (files * 10 lines) so it is deterministic
 * without a real git repo (docker-no-git-repo gotcha). The two original file-inspection cases
 * (substantial module / executable) are dropped as anti-patterns.
 *
 * @see tests/features/plugins/auto-simplify/PLUGIN_auto-simplify.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import { hashFileList } from '../../tools/_shared/marker-utils.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const LAUNCH = ['-e', `require(require('path').join(process.cwd(),'tools','_shared','bootstrap.cjs'))`, '--', 'tools/auto-simplify/simplify_stop.ts'];
const OVERRIDE_FILES = ['a.ts', 'b.ts', 'c.ts']; // 3 files → 30 lines via SIMPLIFY_DIFF_OVERRIDE

interface SxWorld extends V4World {
  sxEnv?: Record<string, string>;
  sxInput?: string;
  sxOut?: string;
  sxCode?: number | null;
}

function markerFile(this: SxWorld): string {
  return path.join(this.tempDir, '.dev-pomogator', '.simplify-marker.json');
}
function writeMarker(this: SxWorld, m: Record<string, unknown>): void {
  const f = markerFile.call(this);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof m === 'string' ? (m as unknown as string) : JSON.stringify(m, null, 2));
}
function runHook(this: SxWorld): void {
  const input = this.sxInput ?? JSON.stringify({ workspace_roots: [this.tempDir] });
  const r = spawnSync(process.execPath, LAUNCH, {
    input, cwd: REPO_ROOT, encoding: 'utf-8',
    env: { ...process.env, ...(this.sxEnv ?? {}) },
  });
  this.sxOut = (r.stdout ?? '').trim();
  this.sxCode = r.status;
}

Given('the auto-simplify hook is disabled via env', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'false' };
});
Given('the auto-simplify hook receives empty stdin', function (this: SxWorld) {
  this.sxInput = '';
});
Given('an auto-simplify change below the line threshold', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: 'only.ts', SIMPLIFY_MIN_LINES: '20' }; // 10 lines < 20
});
Given('an auto-simplify change above the threshold with no marker', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: OVERRIDE_FILES.join(','), SIMPLIFY_MIN_LINES: '10' };
});
Given('an auto-simplify marker whose hash matches the current change', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: OVERRIDE_FILES.join(','), SIMPLIFY_MIN_LINES: '10' };
  writeMarker.call(this, { hash: hashFileList([...OVERRIDE_FILES].sort()), timestamp: new Date().toISOString(), count: 1 });
});
Given('an auto-simplify marker with a different hash within the cooldown window', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: OVERRIDE_FILES.join(','), SIMPLIFY_MIN_LINES: '10', SIMPLIFY_COOLDOWN_MINUTES: '5' };
  writeMarker.call(this, { hash: hashFileList(['different.ts']), timestamp: new Date().toISOString(), count: 1 });
});
Given('an auto-simplify marker that has hit the max retry count', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: OVERRIDE_FILES.join(','), SIMPLIFY_MIN_LINES: '10', SIMPLIFY_MAX_RETRIES: '2', SIMPLIFY_COOLDOWN_MINUTES: '5' };
  const old = new Date(Date.parse('2020-01-01T00:00:00Z')).toISOString(); // far past cooldown
  writeMarker.call(this, { hash: hashFileList(['different.ts']), timestamp: old, count: 2 });
});
Given('an auto-simplify marker file containing invalid JSON', function (this: SxWorld) {
  this.sxEnv = { SIMPLIFY_ENABLED: 'true', SIMPLIFY_DIFF_OVERRIDE: OVERRIDE_FILES.join(','), SIMPLIFY_MIN_LINES: '10' };
  writeMarker.call(this, '{ this is not valid json' as unknown as Record<string, unknown>);
});

When('the auto-simplify Stop hook fires', function (this: SxWorld) {
  runHook.call(this);
});

Then('the auto-simplify hook approves the stop', function (this: SxWorld) {
  assert.equal(this.sxCode, 0, 'fail-open: exit 0');
  assert.equal(this.sxOut, '{}', `approve must emit exactly {} — got ${this.sxOut}`);
});
Then('the auto-simplify hook blocks the stop citing the simplify skill', function (this: SxWorld) {
  assert.equal(this.sxCode, 0, 'hook always exits 0');
  const j = JSON.parse(this.sxOut || '{}');
  assert.equal(j.decision, 'block', `must block — got ${this.sxOut}`);
  assert.match(j.reason, /\/simplify/, 'block reason names /simplify');
});
Then('the auto-simplify marker file is created with the current diff hash', function (this: SxWorld) {
  const f = markerFile.call(this);
  assert.ok(fs.existsSync(f), 'a marker file must be written on a block');
  const m = JSON.parse(fs.readFileSync(f, 'utf-8'));
  assert.equal(m.hash, hashFileList([...OVERRIDE_FILES].sort()), 'marker hash must be the current diff hash');
});
