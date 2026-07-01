/**
 * Step definitions for BDDONLY001: the staged bdd-only test-file guard
 * (FR-5 of the bdd-only-migration spec). Drives the REAL guard
 * `tools/bdd-only-test-guard/guard.ts` via its real bootstrap launcher with a stdin
 * PreToolUse payload — no mocks, no inline copy. Per-scenario isolation comes from the
 * V4World Before hook's fresh `tempDir`; the "existing file" case is a real file written
 * under `this.tempDir`, and the escape log is asserted in the same isolated dir.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const REPO = process.env.APP_DIR || process.cwd();
const GUARD_REL = 'tools/bdd-only-test-guard/guard.ts';

interface GuardWorld extends V4World {
  guardExit: number;
  guardStdout: string;
  bddRel?: string;
  bddPre?: string;
}

/** A real vitest-style file with exactly `n` test-case openers (`it(`), so countTestCases() === n. */
function makeTestFile(n: number): string {
  let s = "describe('legacy', () => {\n";
  for (let i = 1; i <= n; i++) s += `  it('case ${i}', () => { expect(${i}).toBe(${i}); });\n`;
  s += '});\n';
  return s;
}

/** Spawn the guard through its REAL bootstrap launcher with a PreToolUse payload. cwd=REPO so tsx
 *  resolves node_modules; payload.cwd points at the scenario's tempDir so existence + the escape log
 *  are isolated there. */
function runGuard(
  toolName: string,
  filePathRel: string,
  cwd: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string } {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePathRel }, cwd });
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', GUARD_REL],
    { input: payload, encoding: 'utf-8', cwd: REPO, env: { ...process.env, ...env }, timeout: 30000 },
  );
  return { exitCode: res.status ?? 1, stdout: res.stdout || '' };
}

/** Spawn the guard with a real Edit PreToolUse payload (file_path + old_string/new_string) so the
 *  FR-10 shrink-only path reads the on-disk pre-content and simulates the edit. No mocks. */
function runGuardEdit(
  filePathRel: string,
  cwd: string,
  oldStr: string,
  newStr: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string } {
  const payload = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePathRel, old_string: oldStr, new_string: newStr }, cwd });
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', GUARD_REL],
    { input: payload, encoding: 'utf-8', cwd: REPO, env: { ...process.env, ...env }, timeout: 30000 },
  );
  return { exitCode: res.status ?? 1, stdout: res.stdout || '' };
}

Given<GuardWorld>(/^a clean workspace for the bdd-only guard$/, function () {
  // V4World Before already made a fresh tempDir; nothing else needed.
});

Given<GuardWorld>(/^an existing non-BDD test file with (\d+) test cases$/, function (n: string) {
  const rel = 'tests/e2e/legacy.test.ts';
  const content = makeTestFile(parseInt(n, 10));
  const abs = path.join(this.tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  this.bddRel = rel;
  this.bddPre = content;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit that raises its test-case count to (\d+)$/, function (m: string) {
  const next = makeTestFile(parseInt(m, 10));
  const r = runGuardEdit(this.bddRel!, this.tempDir, this.bddPre!, next);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit that lowers its test-case count to (\d+)$/, function (m: string) {
  const next = makeTestFile(parseInt(m, 10));
  const r = runGuardEdit(this.bddRel!, this.tempDir, this.bddPre!, next);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

Then<GuardWorld>(/^the bdd-only guard should deny with a shrink-only reason$/, function () {
  assert.strictEqual(this.guardExit, 2, `expected deny exit 2, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.match(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'deny decision in output');
  assert.match(this.guardStdout, /shrink-only/, 'names the shrink-only invariant');
});

Given<GuardWorld>(/^an existing test file "([^"]+)" in the workspace$/, function (rel: string) {
  const abs = path.join(this.tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '// existing test\n');
});

When<GuardWorld>(/^the bdd-only guard receives a Write for a new "([^"]+)"$/, function (rel: string) {
  const r = runGuard('Write', rel, this.tempDir);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives an Edit for "([^"]+)"$/, function (rel: string) {
  const r = runGuard('Edit', rel, this.tempDir);
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

When<GuardWorld>(/^the bdd-only guard receives a Write for a new "([^"]+)" with BDD_ONLY_SKIP set$/, function (rel: string) {
  const r = runGuard('Write', rel, this.tempDir, { BDD_ONLY_SKIP: '1' });
  this.guardExit = r.exitCode;
  this.guardStdout = r.stdout;
});

Then<GuardWorld>(/^the bdd-only guard should deny with a BDD-only reason$/, function () {
  assert.strictEqual(this.guardExit, 2, `expected deny exit 2, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.match(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'deny decision in output');
  assert.match(this.guardStdout, /bdd-only-test-guard/, 'names the guard');
});

Then<GuardWorld>(/^the bdd-only guard should allow the write$/, function () {
  assert.strictEqual(this.guardExit, 0, `expected allow exit 0, got ${this.guardExit}. stdout: ${this.guardStdout}`);
  assert.doesNotMatch(this.guardStdout, /"permissionDecision"\s*:\s*"deny"/, 'must not deny');
});

Then<GuardWorld>(/^the escape should be recorded in the bdd-only escape log$/, function () {
  const log = path.join(this.tempDir, '.claude', 'logs', 'bdd-only-escapes.jsonl');
  assert.ok(fs.existsSync(log), 'escape log must exist after a BDD_ONLY_SKIP override');
  const lines = fs.readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 1, 'escape log must have at least one entry');
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.reason, 'BDD_ONLY_SKIP', 'entry records the escape reason');
});
