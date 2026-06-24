// @feature52 — FR-52 (Session dogfood hardening). P28-1 / FR-52a: the cucumber-clobber
// guard. Drives the REAL tools/tui-test-runner/test_guard.ts by spawning it exactly the
// way the PreToolUse hook does (bootstrap.cjs -> tsx) and asserting the allow/deny matrix.
// No mock: a bare `--name` run against the default config is denied (exit 2) and the deny
// message points at the clobber-safe runner; the run-bdd FILTERED wrapper and an explicit
// `-c` isolated run are allowed (exit 0). A FULL host run (raw cucumber OR `node
// scripts/run-bdd.mjs` with no filter) is denied (exit 2) and points at docker-bdd.sh —
// the host-bdd block added after the 2026-06-24 incident (a full host run polluted the
// canonical with Linux/Docker-only false reds). Mutation gutcheck (proven by revert in
// .dev-pomogator/.tmp/guard-check.mjs): break the guard's cucumber detection and the deny
// leg reddens; break its redirect-exclusion and the explicit-config allow leg reddens.
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
  fullRunStdout?: string;
  runBddFullStatus?: number | null;
  runBddFullStdout?: string;
  isolatedStatus?: number | null;
  dryRunStatus?: number | null;
  cDefaultDryRunStatus?: number | null;
  proseStatus?: number | null;
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
  const r = runGuard(`${CUKE}`);
  this.fullRunStatus = r.status;
  this.fullRunStdout = r.stdout;
});
Then(/^the guard denies the full host run with exit 2 and points at docker-bdd$/, function (this: GuardWorld) {
  assert.equal(this.fullRunStatus, 2, `full host cucumber run must be denied (exit 2); got ${this.fullRunStatus}`);
  assert.ok(
    /docker-bdd\.sh/.test(this.fullRunStdout ?? ''),
    `deny remediation must point at scripts/docker-bdd.sh; got: ${this.fullRunStdout}`,
  );
});

// Regression lock on the exact 2026-06-24 incident command: a FULL `node scripts/run-bdd.mjs`
// (no filter) refreshes the canonical on the HOST → must be denied → docker-bdd.sh. (The FILTERED
// run-bdd wrapper above stays allowed — harm-precise full-vs-filtered cut.)
When(/^a full host run-bdd invocation has no name filter$/, function (this: GuardWorld) {
  const r = runGuard('node scripts/run-bdd.mjs');
  this.runBddFullStatus = r.status;
  this.runBddFullStdout = r.stdout;
});
Then(/^the guard denies the full host run-bdd with exit 2 and points at docker-bdd$/, function (this: GuardWorld) {
  assert.equal(this.runBddFullStatus, 2, `full host run-bdd must be denied (exit 2); got ${this.runBddFullStatus}`);
  assert.ok(
    /docker-bdd\.sh/.test(this.runBddFullStdout ?? ''),
    `deny remediation must point at scripts/docker-bdd.sh; got: ${this.runBddFullStdout}`,
  );
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

// FR-52a gap closed 2026-06-19: a --dry-run executes nothing but STILL writes the canonical
// ndjson (all-skipped), so it poisons the census exactly like a filtered run. The old guard
// only keyed on --name and let this through (the live clobber this session).
When(/^a dry-run cucumber pass hits the default config$/, function (this: GuardWorld) {
  this.dryRunStatus = runGuard(`${CUKE} --dry-run`).status;
});
Then(/^the clobber guard denies the dry-run with exit 2$/, function (this: GuardWorld) {
  assert.equal(this.dryRunStatus, 2, `--dry-run on default config must be denied (exit 2); got ${this.dryRunStatus}`);
});

// -c cucumber.json is NOT a safe redirect — the default config's format writes the canonical.
When(/^a dry-run names the default cucumber\.json config explicitly$/, function (this: GuardWorld) {
  this.cDefaultDryRunStatus = runGuard(`${CUKE} -c cucumber.json --dry-run`).status;
});
Then(/^the clobber guard still denies it with exit 2$/, function (this: GuardWorld) {
  assert.equal(
    this.cDefaultDryRunStatus,
    2,
    `-c cucumber.json (the default, writes canonical) must be denied (exit 2); got ${this.cDefaultDryRunStatus}`,
  );
});

// False-positive fixed: a prose command (git commit) may MENTION cucumber + a flag in its
// message but never RUNS cucumber — the guard must not deny it.
When(/^a git commit message merely mentions a filtered cucumber run$/, function (this: GuardWorld) {
  this.proseStatus = runGuard('git commit -m "fix: cucumber --name X clobbers .last-test-run.ndjson"').status;
});
Then(/^the guard allows the commit with exit 0$/, function (this: GuardWorld) {
  assert.equal(this.proseStatus, 0, `a commit message mentioning cucumber must be allowed (exit 0); got ${this.proseStatus}`);
});
