// @feature52 — FR-52 (Session dogfood hardening). P28-1 / FR-52a: the cucumber-clobber
// guard. Drives the REAL tools/tui-test-runner/test_guard.ts by spawning it exactly the
// way the PreToolUse hook does (bootstrap.cjs -> tsx) and asserting the allow/deny matrix.
// No mock: a bare `--name` run against the default config is denied (exit 2) and the deny
// message points at the clobber-safe runner; the run-bdd wrapper, a full run, and an
// explicit `-c` isolated run are all allowed (exit 0). Mutation gutcheck (proven by revert
// in .dev-pomogator/.tmp/guard-check.mjs): break the guard's cucumber detection and the
// deny leg reddens; break its redirect-exclusion and the explicit-config allow leg reddens.
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
  clobberStatus?: number | null;
  clobberStdout?: string;
  wrapperStatus?: number | null;
  fullRunStatus?: number | null;
  isolatedStatus?: number | null;
}

Given(/^the test-guard PreToolUse hook is the canonical Bash guard$/, function () {
  assert.ok(
    fs.existsSync('tools/tui-test-runner/test_guard.ts'),
    'the test-guard hook source must exist (it is the registered PreToolUse Bash guard)',
  );
});

When(/^a bare filtered cucumber run hits the default config$/, function (this: GuardWorld) {
  const r = runGuard(`${CUKE} --name "SPECGEN004_149"`);
  this.clobberStatus = r.status;
  this.clobberStdout = r.stdout;
});
Then(
  /^the clobber guard denies it with exit 2 and points at the run-bdd wrapper$/,
  function (this: GuardWorld) {
    assert.equal(this.clobberStatus, 2, `bare --name must be denied (exit 2); got ${this.clobberStatus}`);
    assert.ok(
      /run-bdd\.mjs/.test(this.clobberStdout ?? ''),
      `deny remediation must point at scripts/run-bdd.mjs; got: ${this.clobberStdout}`,
    );
  },
);

When(/^the clobber-safe run-bdd wrapper is invoked with a name filter$/, function (this: GuardWorld) {
  this.wrapperStatus = runGuard('node scripts/run-bdd.mjs --name "SPECGEN004_149"').status;
});
Then(/^the guard allows the wrapper with exit 0$/, function (this: GuardWorld) {
  assert.equal(this.wrapperStatus, 0, `run-bdd wrapper must be allowed (exit 0); got ${this.wrapperStatus}`);
});

When(/^a full cucumber run with no name filter hits the default config$/, function (this: GuardWorld) {
  this.fullRunStatus = runGuard(`${CUKE}`).status;
});
Then(/^the guard allows the full run with exit 0$/, function (this: GuardWorld) {
  assert.equal(this.fullRunStatus, 0, `full run must be allowed (exit 0); got ${this.fullRunStatus}`);
});

When(/^a filtered cucumber run names an explicit temp config$/, function (this: GuardWorld) {
  this.isolatedStatus = runGuard(`${CUKE} -c .dev-pomogator/.tmp/cuke.json --name "X"`).status;
});
Then(/^the guard allows the isolated run with exit 0$/, function (this: GuardWorld) {
  assert.equal(
    this.isolatedStatus,
    0,
    `explicit -c isolated run must be allowed (exit 0); got ${this.isolatedStatus}`,
  );
});
