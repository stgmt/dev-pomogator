/**
 * PLUGIN014 step definitions — the test-quality dedup Stop hook.
 *
 * Migrated from tests/e2e/test-quality.test.ts (+ the dead orphan PLUGIN014_test-quality.feature, which
 * had pseudo-tags `# @feature1` and NO step-defs). Drives the REAL tools/test-quality/dedup_stop.ts
 * spawned through the plugin bootstrap launcher with a per-scenario workspace + real .dedup-marker.json
 * fixtures keyed by the REAL hashFileList (no mocks). dedup_stop reads `git diff --numstat` (no test
 * override), so the "test files changed" cases set up a real throwaway git repo with a modified tests/
 * file in the workspace (the approve cases need no git). The @feature2 manifest file-inspection cases are
 * dropped as anti-patterns (and referenced the removed v1 extensions/ path).
 *
 * @see tests/features/plugins/test-quality/PLUGIN014_test-quality.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import { hashFileList } from '../../tools/_shared/marker-utils.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const LAUNCH = ['-e', `require(require('path').join(process.cwd(),'tools','_shared','bootstrap.cjs'))`, '--', 'tools/test-quality/dedup_stop.ts'];
const TEST_FILE = 'tests/e2e/some.test.ts';

interface DdWorld extends V4World {
  ddEnv?: Record<string, string>;
  ddOut?: string;
  ddCode?: number | null;
  ddHasGit?: boolean;
}

function markerFile(this: DdWorld): string {
  return path.join(this.tempDir, '.dev-pomogator', '.dedup-marker.json');
}
function writeMarker(this: DdWorld, m: Record<string, unknown>): void {
  const f = markerFile.call(this);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
}
/** Init a throwaway git repo in tempDir with a committed-then-modified tests/ file → git diff shows it. */
function gitWithTestChange(this: DdWorld): void {
  const g = (c: string) => execSync(c, { cwd: this.tempDir, stdio: 'pipe' });
  g('git init -q'); g('git config user.email t@t.t'); g('git config user.name t');
  fs.mkdirSync(path.join(this.tempDir, 'tests', 'e2e'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, TEST_FILE), 'export const a = 1;\n');
  g('git add -A'); g('git commit -qm init');
  fs.appendFileSync(path.join(this.tempDir, TEST_FILE), 'export const b = 2;\n');
  this.ddHasGit = true;
}
function runHook(this: DdWorld): void {
  const r = spawnSync(process.execPath, LAUNCH, {
    input: JSON.stringify({ workspace_roots: [this.tempDir] }),
    cwd: REPO_ROOT, encoding: 'utf-8', env: { ...process.env, ...(this.ddEnv ?? {}) },
  });
  this.ddOut = (r.stdout ?? '').trim();
  this.ddCode = r.status;
}

Given('a dedup workspace with no changed test files', function (this: DdWorld) {
  // fresh tempDir, no git → git diff finds nothing → no test files
});
Given('a dedup workspace with a changed test file and no marker', function (this: DdWorld) {
  gitWithTestChange.call(this);
});
Given('a dedup workspace with a changed test file already recorded by a matching marker', function (this: DdWorld) {
  gitWithTestChange.call(this);
  writeMarker.call(this, { hash: hashFileList([TEST_FILE]), timestamp: new Date().toISOString(), count: 1 });
});
Given('the dedup hook is disabled via env', function (this: DdWorld) {
  this.ddEnv = { DEDUP_ENABLED: 'false' };
});
Given('a dedup workspace with a changed test file that has hit the max retry count', function (this: DdWorld) {
  gitWithTestChange.call(this);
  const old = new Date(Date.parse('2020-01-01T00:00:00Z')).toISOString(); // past the 10min cooldown
  writeMarker.call(this, { hash: hashFileList(['tests/other/x.test.ts']), timestamp: old, count: 1 }); // different hash, count>=MAX_RETRIES(1)
});

When('the dedup Stop hook fires', function (this: DdWorld) {
  runHook.call(this);
});

Then('the dedup hook approves the stop', function (this: DdWorld) {
  assert.equal(this.ddCode, 0, 'fail-open: exit 0');
  assert.equal(this.ddOut, '{}', `approve must emit exactly {} — got ${this.ddOut}`);
});
Then('the dedup hook blocks the stop citing the dedup-tests skill', function (this: DdWorld) {
  assert.equal(this.ddCode, 0, 'hook always exits 0');
  const j = JSON.parse(this.ddOut || '{}');
  assert.equal(j.decision, 'block', `must block — got ${this.ddOut}`);
  assert.match(j.reason, /\/dedup-tests/, 'block reason names /dedup-tests');
});
Then('the dedup marker file is created with the current test-file hash', function (this: DdWorld) {
  const f = markerFile.call(this);
  assert.ok(fs.existsSync(f), 'a marker must be written on a block');
  const m = JSON.parse(fs.readFileSync(f, 'utf-8'));
  assert.equal(m.hash, hashFileList([TEST_FILE]), 'marker hash must be the current test-file-list hash');
});
