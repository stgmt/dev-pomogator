// @feature52 — FR-52 (Session dogfood hardening) + the STRICT host-bdd block (owner directive
// 2026-06-24: "буквально ничего на машине, всё в Docker"). Drives the REAL
// tools/tui-test-runner/test_guard.ts by spawning it exactly the way the PreToolUse hook does
// (bootstrap.cjs -> tsx) and asserting the allow/deny matrix. No mock.
//
// Contract: EVERY host cucumber/run-bdd invocation — full, --name, --tags batch, --dry-run, and
// `node scripts/run-bdd.mjs` (any form) — is DENIED (exit 2) and routed to docker-bdd.sh. Only a
// docker-wrapped run (docker-bdd.sh / docker compose) and PROSE that merely mentions cucumber are
// allowed. (Supersedes the earlier full-vs-filtered clobber matrix: under "nothing on host" the
// clobber-vs-full distinction is moot — the guard's clobber branch was removed.)
//
// Mutation gutcheck (revert in .dev-pomogator/.tmp/guard-check.mjs): break the guard's cucumber
// detection and the deny legs redden; break the docker ALLOWED_PATTERNS and the docker-bdd allow
// leg reddens.
import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const GUARD_ARGS = [
  '-e',
  "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT || '.', 'tools', '_shared', 'bootstrap.cjs'))",
  '--',
  'tools/tui-test-runner/test_guard.ts',
];

function runGuard(command: string): { status: number | null; stdout: string } {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const r = spawnSync(process.execPath, GUARD_ARGS, {
    input: payload,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

const CUKE = 'node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js';

interface GuardWorld {
  lastResult?: { status: number | null; stdout: string };
}

Given(/^the test-guard PreToolUse hook is the canonical Bash guard$/, function () {
  assert.ok(
    fs.existsSync('tools/tui-test-runner/test_guard.ts'),
    'the test-guard hook source must exist (it is the registered PreToolUse Bash guard)',
  );
});

// ─── DENY legs: every host cucumber/run-bdd form → exit 2 + docker-bdd ────────────────

When(/^a full host cucumber run hits the default config$/, function (this: GuardWorld) {
  this.lastResult = runGuard(CUKE);
});
When(/^a host cucumber run is filtered by name$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --name "SPECGEN004_15"`);
});
When(/^a host cucumber run is filtered by tag as a batch$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --tags "@feature7"`);
});
When(/^a full host run-bdd invocation has no filter$/, function (this: GuardWorld) {
  this.lastResult = runGuard('node scripts/run-bdd.mjs');
});
When(/^a host run-bdd invocation is filtered by name$/, function (this: GuardWorld) {
  this.lastResult = runGuard('node scripts/run-bdd.mjs --name "SPECGEN004_15"');
});
When(/^a dry-run host cucumber pass hits the default config$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --dry-run`);
});

Then(/^the guard denies it with exit 2 and routes to docker-bdd$/, function (this: GuardWorld) {
  assert.equal(this.lastResult?.status, 2, `host BDD run must be denied (exit 2); got ${this.lastResult?.status}`);
  assert.ok(
    /docker-bdd\.sh/.test(this.lastResult?.stdout ?? ''),
    `deny remediation must point at scripts/docker-bdd.sh; got: ${this.lastResult?.stdout}`,
  );
});

// ─── ALLOW legs: docker-wrapped run + prose that only mentions cucumber ────────────────

When(/^a docker-bdd\.sh invocation runs the suite in Docker$/, function (this: GuardWorld) {
  this.lastResult = runGuard('bash scripts/docker-bdd.sh --tags "@feature7"');
});
When(/^a git commit message merely mentions a cucumber run$/, function (this: GuardWorld) {
  this.lastResult = runGuard('git commit -m "fix: cucumber --name X clobbers .last-test-run.ndjson"');
});

Then(/^the guard allows it with exit 0$/, function (this: GuardWorld) {
  assert.equal(this.lastResult?.status, 0, `must be allowed (exit 0); got ${this.lastResult?.status}`);
});
