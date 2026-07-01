/**
 * @feature19 step definitions — form-guards-dispatch routing + verdict propagation
 * (SPECGEN004_295 – SPECGEN004_298)
 *
 * Drives the REAL `tools/specs-validator/form-guards-dispatch.ts` via
 * process.execPath + tsx (no mocks). Each scenario spawns the dispatcher with
 * a crafted stdin JSON payload and asserts on exit-code + stdout.
 *
 * beforeAll from V4World provides a fresh tempDir per scenario via the
 * Before hook in tests/hooks/before-after.ts.
 *
 * @see .specs/spec-generator-v4/FR.md FR-19 (two-tier hook policy, soft tier)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const DISPATCH = path.join(REPO_ROOT, 'tools', 'specs-validator', 'form-guards-dispatch.ts');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeProgressJson(dir: string, version: number): void {
  fs.writeFileSync(
    path.join(dir, '.progress.json'),
    JSON.stringify({ version, featureSlug: path.basename(dir) }),
    'utf-8',
  );
}

/**
 * Spawn form-guards-dispatch with the given stdin payload and cwd=REPO_ROOT
 * (bootstrap.cjs needs node_modules available).
 */
function runDispatch(stdinPayload: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', DISPATCH],
    {
      input: stdinPayload,
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      timeout: 60_000,
    },
  );
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function writeStdin(toolName: string, filePath: string, content: string): string {
  return JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, content } });
}

// ── World ─────────────────────────────────────────────────────────────────────

interface F19DispatchWorld extends V4World {
  v3SpecDir?: string;
  dispatchResult?: { status: number | null; stdout: string; stderr: string };
}

// ── Shared Given ─────────────────────────────────────────────────────────────

Given('a v3 spec directory with a progress.json marking version 3', function (this: F19DispatchWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'probe');
  fs.mkdirSync(specDir, { recursive: true });
  makeProgressJson(specDir, 3);
  this.v3SpecDir = specDir;
});

// ── SPECGEN004_295 — violating TASKS.md → deny exit 2 ────────────────────────

When('form-guards-dispatch receives a Write for a violating TASKS.md in that spec', function (this: F19DispatchWorld) {
  // Task block present but missing Status:/Est:/**Done When:** — guard denies.
  const badContent = '## Phase 0: x\n\n- [ ] bad task\n';
  const filePath = path.join(this.v3SpecDir!, 'TASKS.md');
  this.dispatchResult = runDispatch(writeStdin('Write', filePath, badContent));
});

Then(/the dispatcher exits 2 and the stdout JSON carries permissionDecision deny mentioning task-form-guard/, function (this: F19DispatchWorld) {
  assert.equal(this.dispatchResult!.status, 2, `Expected exit 2; got ${this.dispatchResult!.status}; stderr: ${this.dispatchResult!.stderr}`);
  const parsed = JSON.parse(this.dispatchResult!.stdout) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny', 'Expected permissionDecision: deny');
  assert.match(parsed.hookSpecificOutput?.permissionDecisionReason ?? '', /task-form-guard/, 'Expected reason to mention task-form-guard');
});

// ── SPECGEN004_296 — guard-clean TASKS.md → allow exit 0 ─────────────────────

When('form-guards-dispatch receives a Write for a valid TASKS.md in that spec', function (this: F19DispatchWorld) {
  // Task block with all required fields: Status, Est, and Done When checkbox.
  const goodContent = '## Phase 0: x\n\n- [x] good — Status: DONE | Est: 30m\n  **Done When:**\n  - [ ] check\n';
  const filePath = path.join(this.v3SpecDir!, 'TASKS.md');
  this.dispatchResult = runDispatch(writeStdin('Write', filePath, goodContent));
});

Then('the dispatcher exits 0 with no deny output', function (this: F19DispatchWorld) {
  assert.equal(
    this.dispatchResult!.status,
    0,
    `Expected exit 0; got ${this.dispatchResult!.status}; stderr: ${this.dispatchResult!.stderr}`,
  );
  // Guard-clean path: stdout should be empty or parseable as allow
  if (this.dispatchResult!.stdout.trim()) {
    const parsed = JSON.parse(this.dispatchResult!.stdout) as { hookSpecificOutput?: { permissionDecision?: string } };
    assert.notEqual(parsed.hookSpecificOutput?.permissionDecision, 'deny', 'Must not deny a valid TASKS.md');
  }
});

// ── SPECGEN004_297 — violating USER_STORIES.md → deny exit 2 ─────────────────

When('form-guards-dispatch receives a Write for a violating USER_STORIES.md in that spec', function (this: F19DispatchWorld) {
  // User story block present but missing priority and "why" — user-story-form-guard denies.
  const badContent = '### User Story 1: no priority no why\n\nSome text.\n';
  const filePath = path.join(this.v3SpecDir!, 'USER_STORIES.md');
  this.dispatchResult = runDispatch(writeStdin('Write', filePath, badContent));
});

Then(/the dispatcher exits 2 and the stdout JSON carries permissionDecision deny mentioning user-story-form-guard/, function (this: F19DispatchWorld) {
  assert.equal(this.dispatchResult!.status, 2, `Expected exit 2; got ${this.dispatchResult!.status}; stderr: ${this.dispatchResult!.stderr}`);
  const parsed = JSON.parse(this.dispatchResult!.stdout) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
  assert.equal(parsed.hookSpecificOutput?.permissionDecision, 'deny', 'Expected permissionDecision: deny');
  assert.match(parsed.hookSpecificOutput?.permissionDecisionReason ?? '', /user-story-form-guard/, 'Expected reason to mention user-story-form-guard');
});

// ── SPECGEN004_298 — non-spec path / non-target basename → fast exit 0 ────────

When('form-guards-dispatch receives a Write for a path outside .specs or for a non-target basename NOTES.md', function (this: F19DispatchWorld) {
  // Case 1: path outside .specs → fast exit 0
  const outsidePath = '/tmp/some-dir/TASKS.md';
  this.dispatchResult = runDispatch(writeStdin('Write', outsidePath, 'anything'));
});

Then('the dispatcher exits 0 with empty stdout', function (this: F19DispatchWorld) {
  // Non-spec path case
  assert.equal(
    this.dispatchResult!.status,
    0,
    `Expected exit 0 for non-spec path; got ${this.dispatchResult!.status}`,
  );
  assert.equal(
    this.dispatchResult!.stdout.trim(),
    '',
    `Expected empty stdout for non-spec path; got: ${this.dispatchResult!.stdout}`,
  );

  // Also verify non-target basename (NOTES.md) within .specs → fast exit 0
  const notesPath = path.join(this.v3SpecDir!, 'NOTES.md');
  const r2 = runDispatch(writeStdin('Write', notesPath, 'just notes'));
  assert.equal(r2.status, 0, `Expected exit 0 for non-target basename; got ${r2.status}`);
  assert.equal(r2.stdout.trim(), '', `Expected empty stdout for non-target basename; got: ${r2.stdout}`);
});
