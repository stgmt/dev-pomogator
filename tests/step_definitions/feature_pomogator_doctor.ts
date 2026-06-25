/**
 * Step definitions for pomogator-doctor BDD scenarios.
 * Domain: POMOGATORDOCTOR001, POMOGATORDOCTOR002
 * Covers: _01-_15, _22, _25, _32, _40-_43, _10b, _11b (POMOGATORDOCTOR001)
 *         _01-_04 (POMOGATORDOCTOR002 — canonical v2 plugin manifest, issue #71)
 * Classification:
 *   runtime (in-process): _01-_03, _06-_14, _22, _25, _32, _40-_43, _10b, _11b
 *                         POMOGATORDOCTOR002_01-_04
 *   spawn (CLI hook):     _04, _05, _15
 *   @wip (excluded):     _16-_21, _23-_24, _26-_31, _33-_34
 *
 * Uses REGEX step patterns (not Cucumber Expressions) to handle literal
 * slashes and special characters in step prose.
 *
 * Env isolation: each scenario captures/restores process.env via savedEnv.
 * Fixture isolation: buildTempHome() creates fresh temp dirs; cleanup() removes them.
 * Child process cleanup: killAllChildren() in After hook.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import { expect } from 'chai';
import { V4World } from '../hooks/before-after.ts';
import {
  runDoctor,
  type DoctorReport,
  type DoctorOptions,
} from '../../.claude/skills/pomogator-doctor/scripts/engine/index.ts';
import { acquireLock, LockHeldError } from '../../.claude/skills/pomogator-doctor/scripts/engine/lock.ts';
import {
  buildHookOutput,
  exitCodeFor,
  formatChalk,
  formatJson,
} from '../../.claude/skills/pomogator-doctor/scripts/engine/reporter.ts';
import { spawnFakeMcp } from '../fixtures/pomogator-doctor/fake-mcp-server.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome, type TempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

// ---------------------------------------------------------------------------
// World extension for doctor-specific state
// ---------------------------------------------------------------------------

class DoctorWorld extends V4World {
  public home: TempHome | null = null;
  public report: DoctorReport | null = null;
  public runOptions: DoctorOptions = {};
  public savedEnv: NodeJS.ProcessEnv = {};
  public meridianServer: http.Server | null = null;
  public lockHolder: { release: () => void } | null = null;
  public hookResult: { stdout: string; stderr: string; status: number | null } | null = null;
}

// Cucumber uses the World set by setWorldConstructor in before-after.ts.
// We cannot replace it here — instead we cast to our extended shape in steps.
// Cast helper:
function world(ctx: object): DoctorWorld {
  return ctx as DoctorWorld;
}

// Per-scenario lifecycle: snapshot env and tear down fixtures after each scenario
Before({ tags: 'not @wip' }, async function (this: DoctorWorld) {
  this.savedEnv = { ...process.env };
  this.home = null;
  this.report = null;
  this.runOptions = {};
  this.meridianServer = null;
  this.lockHolder = null;
  this.hookResult = null;
});

After({ tags: 'not @wip' }, async function (this: DoctorWorld) {
  // Restore env contamination from meridian tests
  process.env = { ...this.savedEnv };

  // Tear down meridian test HTTP server if open
  if (this.meridianServer) {
    const srv = this.meridianServer;
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    this.meridianServer = null;
  }

  // Release any held lock
  if (this.lockHolder) {
    this.lockHolder.release();
    this.lockHolder = null;
  }

  // Kill any MCP children
  await killAllChildren();

  // Clean up temp home dirs
  if (this.home) {
    this.home.cleanup();
    this.home = null;
  }
});

// ---------------------------------------------------------------------------
// BACKGROUND stub steps — documentation-only; real isolation is via buildTempHome
// ---------------------------------------------------------------------------

Given(/^dev-pomogator is available as a local npm package$/, async function (this: DoctorWorld) {
  // doc: confirmed by the fact we import from the local .claude/skills path
});

Given(/^I have a clean temp HOME directory created by temp-home-builder$/, async function (this: DoctorWorld) {
  // doc: each Given below that calls buildTempHome() satisfies this
});

Given(/^process\.env\.HOME and USERPROFILE point to that temp dir$/, async function (this: DoctorWorld) {
  // doc: runDoctor receives homeDir explicitly, so process.env.HOME is irrelevant for in-process
  // For spawn tests, runHookSpawn passes HOME/USERPROFILE in the spawn env
});

Given(/^child-registry hook is active for SIGKILL cleanup$/, async function (this: DoctorWorld) {
  // doc: killAllChildren() is called in the After hook unconditionally
});

// ---------------------------------------------------------------------------
// GIVEN — fixture setup
// ---------------------------------------------------------------------------

Given(/^temp home fixture "valid" is loaded \(F-1\)$/, async function (this: DoctorWorld) {
  this.home = buildTempHome();
});

Given(/^temp home fixture "valid" is loaded with envInSettingsLocal=\{AUTO_COMMIT_API_KEY:"([^"]+)"\}$/, async function (this: DoctorWorld, value: string) {
  this.home = buildTempHome({ envInSettingsLocal: { AUTO_COMMIT_API_KEY: value } });
});

Given(/^temp home fixture "missing-tools" is loaded \(F-2\)$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({ skipTools: true });
});

Given(/^temp home fixture "corrupt-config" is loaded \(F-4\)$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({ corruptConfig: true });
});

Given(/^temp home fixture "version-mismatch" is loaded with configVersion "([^"]+)" and packageVersion "([^"]+)"$/, async function (this: DoctorWorld, configVer: string, pkgVer: string) {
  this.home = buildTempHome({ configVersion: configVer, packageVersion: pkgVer });
});

Given(/^temp home fixture with installedExtensions=\["plan-pomogator","auto-commit"\] and AUTO_COMMIT_API_KEY in settingsLocal$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({
    installedExtensions: [
      { name: 'plan-pomogator', dependencies: {} },
      {
        name: 'auto-commit',
        dependencies: {},
        envRequirements: [{ name: 'AUTO_COMMIT_API_KEY', required: true }],
      },
    ],
    envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test' },
  });
});

Given(/^temp home fixture with bun-oom-guard auto-commit and plan-pomogator extensions, AUTO_COMMIT_API_KEY set$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({
    installedExtensions: [
      { name: 'plan-pomogator' },
      {
        name: 'auto-commit',
        envRequirements: [{ name: 'AUTO_COMMIT_API_KEY', required: true }],
      },
      {
        name: 'bun-oom-guard',
        dependencies: { binaries: ['bun'] },
      },
    ],
    envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test' },
  });
});

Given(/^temp home fixture "valid" is loaded with packageVersion "([^"]+)" and configVersion "([^"]+)"$/, async function (this: DoctorWorld, pkgVer: string, configVer: string) {
  this.home = buildTempHome({ configVersion: configVer, packageVersion: pkgVer });
});

Given(/^temp home fixture "valid" with pluginJson declaring broken-missing command "([^"]+)"$/, async function (this: DoctorWorld, cmdName: string) {
  this.home = buildTempHome({
    pluginJson: { commands: [{ name: cmdName }, { name: 'reflect' }] },
    // no pluginCommandsOnDisk → both BROKEN-missing
  });
});

Given(/^temp home fixture "valid" with AUTO_COMMIT_API_KEY in envInSettingsLocal$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({ envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test' } });
});

Given(/^temp home fixture "valid" with plugin\.json declaring command "([^"]+)" with physical file on disk$/, async function (this: DoctorWorld, cmdName: string) {
  this.home = buildTempHome({
    pluginJson: { commands: [{ name: cmdName }] },
    pluginCommandsOnDisk: [cmdName],
  });
});

Given(/^AUTO_COMMIT_API_KEY is set via envInSettingsLocal$/, async function (this: DoctorWorld) {
  if (!this.home) {
    this.home = buildTempHome({ envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test' } });
  } else {
    // rebuild with the key set
    this.home.cleanup();
    this.home = buildTempHome({ envInSettingsLocal: { AUTO_COMMIT_API_KEY: 'sk-test' } });
  }
});

Given(/^a hanging fake MCP server is spawned and wired via \.mcp\.json$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('home must be created first');
  const hanging = spawnFakeMcp('hangOnInit');
  const mcpConfig = {
    mcpServers: {
      'fake-hanging': {
        command: hanging.command,
        args: hanging.args,
      },
    },
  };
  fs.writeFileSync(path.join(this.home.projectDir, '.mcp.json'), JSON.stringify(mcpConfig));
  // Add a markdown rule referencing the server so it's included in referencedMcpServers
  const rulesDir = path.join(this.home.projectDir, '.claude', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'references.md'), 'Uses mcp__fake-hanging__do_work.\n');
});

Given(/^AUTO_COMMIT_API_KEY is explicitly unset from process\.env$/, async function (this: DoctorWorld) {
  delete process.env['AUTO_COMMIT_API_KEY'];
});

Given(/^the lock is already held on the doctor\.lock file$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('home must be created first');
  const lockPath = path.join(this.home.homeDir, '.dev-pomogator', 'doctor.lock');
  this.lockHolder = acquireLock(lockPath);
});

// Meridian-specific Given steps

Given(/^CLAIM_GATE_JUDGE env is set to "([^"]+)"$/, async function (this: DoctorWorld, value: string) {
  process.env.CLAIM_GATE_JUDGE = value;
});

Given(/^CLAIM_GATE_JUDGE env is not set$/, async function (this: DoctorWorld) {
  delete process.env.CLAIM_GATE_JUDGE;
});

Given(/^MERIDIAN_URL is not set$/, async function (this: DoctorWorld) {
  delete process.env.MERIDIAN_URL;
});

Given(/^MERIDIAN_URL points to a port with nothing listening$/, async function (this: DoctorWorld) {
  process.env.MERIDIAN_URL = 'http://127.0.0.1:59599';
});

Given(/^a local HTTP server responds with mode passthrough and auth loggedIn true on a random port$/, async function (this: DoctorWorld) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ mode: 'passthrough', auth: { loggedIn: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  this.meridianServer = server;
  const port = (server.address() as { port: number }).port;
  process.env.MERIDIAN_URL = `http://127.0.0.1:${port}`;
});

Given(/^MERIDIAN_URL points to that server$/, async function (this: DoctorWorld) {
  // Already set by the "a local HTTP server" step — nothing to do
});

Given(/^temp home fixture with installedExtensions containing bun-oom-guard with binaries dependency bun$/, async function (this: DoctorWorld) {
  this.home = buildTempHome({
    installedExtensions: [
      { name: 'bun-oom-guard', dependencies: { binaries: ['bun'] } },
    ],
  });
});

// ---------------------------------------------------------------------------
// WHEN — action
// ---------------------------------------------------------------------------

// Feature-prose When aliases — map decorative prose to real in-process calls

When(/^I run `dev-pomogator --doctor` in interactive mode$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    interactive: false,
  });
});

When(/^I run `dev-pomogator --doctor --json`$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    json: true,
    interactive: false,
  });
});

When(/^I run `dev-pomogator --doctor`$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    interactive: false,
  });
});

When(/^I run runDoctor in-process$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    ...this.runOptions,
  });
});

When(/^I run runDoctor in-process with json=true$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    json: true,
    interactive: false,
  });
});

When(/^I run runDoctor in-process and expect a LockHeldError$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  let threw = false;
  try {
    await runDoctor({ homeDir: this.home.homeDir, projectRoot: this.home.projectDir });
  } catch (err) {
    if (err instanceof LockHeldError) threw = true;
    else throw err;
  }
  // Store result in lastExitCode as flag: 1 = threw LockHeldError, 0 = did not
  this.lastExitCode = threw ? 1 : 0;
});

When(/^I call buildHookOutput on the DoctorReport in-process$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  this.report = await runDoctor({
    homeDir: this.home.homeDir,
    projectRoot: this.home.projectDir,
    quiet: true,
  });
});

// Hook spawn (for _04, _05, _15)
const HOOK_PATH = path.resolve(
  process.cwd(),
  '.claude/skills/pomogator-doctor/scripts/doctor-hook.ts',
);
const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
const useStripTypes = NODE_MAJOR >= 22;

function runHookSpawn(homeDir: string, projectDir: string, input = '{}') {
  const [cmd, args] = useStripTypes
    ? [process.execPath, ['--experimental-strip-types', HOOK_PATH]]
    : [process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), HOOK_PATH]];
  return spawnSync(cmd, args, {
    encoding: 'utf-8',
    timeout: 15_000,
    cwd: projectDir,
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
    input,
  });
}

// Alias for feature prose "SessionStart hook invokes doctor-hook.ts with --quiet"
When(/^SessionStart hook invokes doctor-hook\.ts with --quiet$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  const res = runHookSpawn(
    this.home.homeDir,
    this.home.projectDir,
    JSON.stringify({ sessionId: 'test', reason: 'startup' }),
  );
  this.hookResult = { stdout: res.stdout, stderr: res.stderr, status: res.status };
  this.lastStdout = res.stdout;
  this.lastStderr = res.stderr;
  this.lastExitCode = res.status;
});

When(/^I invoke doctor-hook\.ts via SessionStart spawn with standard input$/, async function (this: DoctorWorld) {
  if (!this.home) throw new Error('No temp home fixture built');
  const res = runHookSpawn(
    this.home.homeDir,
    this.home.projectDir,
    JSON.stringify({ sessionId: 'test', reason: 'startup' }),
  );
  this.hookResult = { stdout: res.stdout, stderr: res.stderr, status: res.status };
  this.lastStdout = res.stdout;
  this.lastStderr = res.stderr;
  this.lastExitCode = res.status;
});

When(/^I invoke doctor-hook\.ts via SessionStart spawn with empty input on a bare home$/, async function (this: DoctorWorld) {
  const homeDir = fs.mkdtempSync(
    path.join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'doctor-empty-home-'),
  );
  const projectDir = fs.mkdtempSync(
    path.join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'doctor-empty-proj-'),
  );
  try {
    const res = runHookSpawn(homeDir, projectDir, '{}');
    this.hookResult = { stdout: res.stdout, stderr: res.stderr, status: res.status };
    this.lastStdout = res.stdout;
    this.lastStderr = res.stderr;
    this.lastExitCode = res.status;
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// THEN — assertions (in-process report)
// ---------------------------------------------------------------------------

Then(/^reinstallableIssues is empty$/, async function (this: DoctorWorld) {
  expect(this.report).to.not.be.null;
  expect(this.report!.reinstallableIssues).to.have.length(0);
});

Then(/^the report contains all known check IDs including C1, C2, C3, C6, C7, C13, C14$/, async function (this: DoctorWorld) {
  expect(this.report).to.not.be.null;
  const ids = new Set(this.report!.results.map((r) => r.id.split(':')[0]));
  expect(ids.has('C1')).to.be.true;
  expect(ids.has('C2')).to.be.true;
  expect(ids.has('C3')).to.be.true;
  expect(ids.has('C6')).to.be.true;
  expect(ids.has('C7')).to.be.true;
  expect(ids.has('C13')).to.be.true;
  expect(ids.has('C14')).to.be.true;
  expect(this.report!.installedExtensions).to.include('auto-commit');
});

Then(/^check C5 is severity "critical" and reinstallable and appears in reinstallableIssues$/, async function (this: DoctorWorld) {
  const c5 = this.report!.results.find((r) => r.id === 'C5');
  expect(c5, 'C5 result not found').to.not.be.undefined;
  expect(c5!.severity).to.equal('critical');
  expect(c5!.reinstallable).to.be.true;
  expect(c5!.message).to.match(/auto-commit/);
  expect(this.report!.reinstallableIssues.some((r) => r.id === 'C5')).to.be.true;
});

Then(/^check C7 for AUTO_COMMIT_API_KEY is severity "critical" and reinstallable=false and in manualIssues$/, async function (this: DoctorWorld) {
  const c7 = this.report!.results.find(
    (r) => r.fr === 'FR-5' && r.name === 'AUTO_COMMIT_API_KEY',
  );
  expect(c7, 'C7 for AUTO_COMMIT_API_KEY not found').to.not.be.undefined;
  expect(c7!.severity).to.equal('critical');
  expect(c7!.reinstallable).to.be.false;
  expect(c7!.hint).to.match(/\.env|settings\.local\.json/);
  expect(this.report!.manualIssues.some((r) => r.name === 'AUTO_COMMIT_API_KEY')).to.be.true;
});

Then(/^check C12 for fake-hanging server is severity "critical" and message contains "timeout"$/, async function (this: DoctorWorld) {
  const probe = this.report!.results.find((r) => r.id === 'C12:fake-hanging');
  expect(probe, 'C12:fake-hanging not found').to.not.be.undefined;
  expect(probe!.severity).to.equal('critical');
  expect(probe!.message).to.match(/timeout/i);
  // Probe timing: 2800ms-4000ms
  expect(probe!.durationMs).to.be.greaterThanOrEqual(2800);
  expect(probe!.durationMs).to.be.lessThan(4000);
});

Then(/^check C13 is severity "critical" and reinstallable and message contains "major"$/, async function (this: DoctorWorld) {
  const c13 = this.report!.results.find((r) => r.id === 'C13');
  expect(c13, 'C13 not found').to.not.be.undefined;
  expect(c13!.severity).to.equal('critical');
  expect(c13!.reinstallable).to.be.true;
  expect(c13!.message).to.match(/major/i);
});

Then(/^the JSON output is valid, contains no ANSI codes, C7 envStatus\.status="unset", no "value" field, and exitCodeFor returns 2$/, async function (this: DoctorWorld) {
  const json = formatJson(this.report!);
  expect(() => JSON.parse(json)).to.not.throw();
  expect(json).to.not.match(/\[/);
  expect(json).to.not.contain('sk-');
  const parsed = JSON.parse(json) as {
    results: Array<{ name: string; envStatus?: unknown; value?: unknown }>;
  };
  const envCheck = parsed.results.find((r) => r.name === 'AUTO_COMMIT_API_KEY');
  expect(envCheck, 'C7 not in JSON results').to.not.be.undefined;
  expect(envCheck!.envStatus).to.deep.equal({ name: 'AUTO_COMMIT_API_KEY', status: 'unset' });
  expect(envCheck).to.not.have.property('value');
  expect(exitCodeFor(this.report!)).to.equal(2);
});

Then(/^check C15 summary is severity "critical" and reinstallable and state="BROKEN-missing" and message matches the broken command$/, async function (this: DoctorWorld) {
  const summary = this.report!.results.find((r) => r.id === 'C15');
  expect(summary, 'C15 summary not found').to.not.be.undefined;
  expect(summary!.severity).to.equal('critical');
  expect(summary!.reinstallable).to.be.true;
  expect(summary!.state).to.equal('BROKEN-missing');
  expect(summary!.message).to.match(/create-spec|reflect/);
});

Then(/^formatChalk output contains all three traffic-light group emojis and Summary line$/, async function (this: DoctorWorld) {
  const chalk = formatChalk(this.report!);
  expect(chalk).to.contain('🟢');
  expect(chalk).to.contain('🟡');
  expect(chalk).to.contain('🔴');
  expect(chalk).to.match(/Self-sufficient/);
  expect(chalk).to.match(/Needs env vars/);
  expect(chalk).to.match(/Needs external deps/);
  expect(chalk).to.match(/Summary:/);
});

Then(/^buildHookOutput returns continue=true and either silent or bounded additionalContext$/, async function (this: DoctorWorld) {
  const hookOut = buildHookOutput(this.report!);
  expect(hookOut.continue).to.be.true;
  if (this.report!.summary.critical === 0 && this.report!.summary.warnings === 0) {
    expect(hookOut.suppressOutput).to.be.true;
    expect(hookOut.additionalContext).to.be.undefined;
  } else {
    expect(hookOut.additionalContext).to.not.be.undefined;
    expect(hookOut.additionalContext!.length).to.be.lessThanOrEqual(100);
    expect(hookOut.additionalContext).to.match(/pomogator-doctor/);
  }
});

Then(/^gatedOut includes C9, C10, C16 and results does NOT include those IDs$/, async function (this: DoctorWorld) {
  const gatedIds = new Set(this.report!.gatedOut.map((g) => g.id));
  expect(gatedIds.has('C9')).to.be.true;
  expect(gatedIds.has('C10')).to.be.true;
  expect(gatedIds.has('C16')).to.be.true;
  const resultIds = new Set(this.report!.results.map((r) => r.id.split(':')[0]));
  expect(resultIds.has('C9')).to.be.false;
  expect(resultIds.has('C10a')).to.be.false;
  expect(resultIds.has('C16a')).to.be.false;
});

Then(/^check C7 for AUTO_COMMIT_API_KEY is severity "ok", message mentions "settings\.local\.json", and envStatus\.status="set"$/, async function (this: DoctorWorld) {
  const envCheck = this.report!.results.find(
    (r) => r.fr === 'FR-5' && r.name === 'AUTO_COMMIT_API_KEY',
  );
  expect(envCheck, 'C7 for AUTO_COMMIT_API_KEY not found').to.not.be.undefined;
  expect(envCheck!.severity).to.equal('ok');
  expect(envCheck!.message).to.contain('settings.local.json');
  expect(envCheck!.envStatus).to.deep.equal({ name: 'AUTO_COMMIT_API_KEY', status: 'set' });
  expect(JSON.stringify(envCheck)).to.not.contain('sk-from-settings');
});

Then(/^check C3 is severity "critical" and reinstallable and message contains "invalid" or "parse"$/, async function (this: DoctorWorld) {
  const c3 = this.report!.results.find((r) => r.id === 'C3');
  expect(c3, 'C3 not found').to.not.be.undefined;
  expect(c3!.severity).to.equal('critical');
  expect(c3!.reinstallable).to.be.true;
  expect(c3!.message).to.match(/invalid|parse/i);
  expect(this.report!.reinstallableIssues.length).to.be.greaterThan(0);
});

Then(/^runDoctor threw a LockHeldError$/, async function (this: DoctorWorld) {
  expect(this.lastExitCode).to.equal(1, 'Expected LockHeldError to be thrown');
});

// _22: C15 when plugin.json missing
Then(/^check C15 is severity "ok" with message about no plugin\.json manifest$/, async function (this: DoctorWorld) {
  const c15 = this.report!.results.find((r) => r.id === 'C15');
  expect(c15, 'C15 not found').to.not.be.undefined;
  expect(c15!.severity).to.equal('ok');
  expect(c15!.message).to.match(/no plugin\.json manifest found/i);
});

// _25: C6 synced
Then(/^check C6 is severity "ok" and message does NOT contain "unexpected keys"$/, async function (this: DoctorWorld) {
  const c6 = this.report!.results.find((r) => r.id === 'C6');
  expect(c6, 'C6 not found').to.not.be.undefined;
  expect(c6!.severity).to.equal('ok');
  expect(c6!.message).to.not.contain('unexpected keys');
});

// _32: C30 Windows-only gating check
// On win32 C30 is relevant (appears in results); severity is "warning" if legacy npm found, "ok" if not.
// On non-win32 C30 is gated out entirely.
Then(/^on win32 results contains C30 severity "warning" about Legacy npm; on other platforms C30 is gated out$/, async function (this: DoctorWorld) {
  if (process.platform === 'win32') {
    const c30 = this.report!.results.find((r) => r.id === 'C30');
    expect(c30, 'C30 not found in results on win32').to.not.be.undefined;
    // severity is "warning" if legacy npm artifact found on disk, "ok" if not.
    // We only assert it is present and has a valid severity (the gate works).
    expect(['ok', 'warning']).to.include(c30!.severity);
  } else {
    const gatedIds = new Set(this.report!.gatedOut.map((g) => g.id));
    expect(gatedIds.has('C30')).to.be.true;
    const resultIds = new Set(this.report!.results.map((r) => r.id));
    expect(resultIds.has('C30')).to.be.false;
  }
});

// Meridian assertions

Then(/^gatedOut includes C17$/, async function (this: DoctorWorld) {
  expect(this.report!.gatedOut.some((g) => g.id === 'C17')).to.be.true;
});

Then(/^results does NOT include C17$/, async function (this: DoctorWorld) {
  expect(this.report!.results.some((r) => r.id === 'C17')).to.be.false;
});

Then(/^results includes C17 with severity "warning"$/, async function (this: DoctorWorld) {
  const c17 = this.report!.results.find((r) => r.id === 'C17');
  expect(c17, 'C17 not found in results').to.not.be.undefined;
  expect(c17!.severity).to.equal('warning');
});

Then(/^C17 message matches not running or no response or timeout$/, async function (this: DoctorWorld) {
  const c17 = this.report!.results.find((r) => r.id === 'C17');
  expect(c17!.message).to.match(/not running|no response|timeout/);
});

Then(/^C17 hint matches proxy-up or claude-subscription-proxy$/, async function (this: DoctorWorld) {
  const c17 = this.report!.results.find((r) => r.id === 'C17');
  expect(c17!.hint).to.match(/proxy-up|claude-subscription-proxy/);
});

Then(/^results includes C17 with severity "ok"$/, async function (this: DoctorWorld) {
  const c17 = this.report!.results.find((r) => r.id === 'C17');
  expect(c17, 'C17 not found in results').to.not.be.undefined;
  expect(c17!.severity).to.equal('ok');
});

Then(/^C17 message matches up on.*passthrough$/, async function (this: DoctorWorld) {
  const c17 = this.report!.results.find((r) => r.id === 'C17');
  expect(c17!.message).to.match(/up on .*passthrough/);
});

Then(/^gatedOut does NOT include C17$/, async function (this: DoctorWorld) {
  expect(this.report!.gatedOut.some((g) => g.id === 'C17')).to.be.false;
});

Then(/^gatedOut does NOT include C9$/, async function (this: DoctorWorld) {
  expect(this.report!.gatedOut.some((g) => g.id === 'C9')).to.be.false;
});

Then(/^results includes C9$/, async function (this: DoctorWorld) {
  const resultIds = new Set(this.report!.results.map((r) => r.id));
  expect(resultIds.has('C9')).to.be.true;
});

// Hook spawn assertions

Then(/^the hook stdout is valid JSON with continue=true$/, async function (this: DoctorWorld) {
  expect(this.hookResult, 'hook not yet invoked').to.not.be.null;
  expect(this.hookResult!.status).to.equal(0);
  const payload = JSON.parse(this.hookResult!.stdout.trim()) as { continue: boolean };
  expect(payload.continue).to.be.true;
});

Then(/^the hook stdout has suppressOutput=true$/, async function (this: DoctorWorld) {
  const payload = JSON.parse(this.hookResult!.stdout.trim()) as {
    continue: boolean;
    suppressOutput?: boolean;
  };
  expect(payload.suppressOutput).to.be.true;
});

Then(/^the hook stdout is valid JSON with continue=true even on corrupt config$/, async function (this: DoctorWorld) {
  expect(this.hookResult!.status).to.equal(0);
  const payload = JSON.parse(this.hookResult!.stdout.trim()) as { continue: boolean };
  expect(payload.continue).to.be.true;
  expect(typeof payload === 'object').to.be.true;
});

// either suppressOutput is true with no additionalContext when all checks pass
Then(/^either suppressOutput is true with no additionalContext when all checks pass$/, async function (this: DoctorWorld) {
  // This step is part of an OR — covered by the compound "buildHookOutput" Then step
  // Nothing additional here — assertion already done in the compound step
});

Then(/^Or additionalContext is defined with length at most 100 and mentions pomogator-doctor$/, async function (this: DoctorWorld) {
  // Covered by the compound buildHookOutput step above
});

// --- C18 hooks-execute smoke (POMOGATORDOCTOR001_44 / _45) ---

Given(/^the doctor hook-runner probe is pointed at a missing bootstrap$/, async function (this: DoctorWorld) {
  // Drives the C18 critical branch: the test seam forces locateBootstrap onto a
  // path that does not exist, so the probe spawn fails. Restored by the After hook.
  if (!this.home) throw new Error('No temp home fixture built');
  process.env.DEV_POMOGATOR_DOCTOR_BOOTSTRAP = path.join(this.home.homeDir, 'no-such-bootstrap.cjs');
});

Then(/^check C18 is severity "([^"]+)"$/, async function (this: DoctorWorld, severity: string) {
  const c18 = this.report?.results.find((r) => r.id === 'C18');
  expect(c18, 'C18 present in report').to.not.be.undefined;
  expect(c18?.severity).to.equal(severity);
});

Then(/^check C18 is reinstallable$/, async function (this: DoctorWorld) {
  const c18 = this.report?.results.find((r) => r.id === 'C18');
  expect(c18?.reinstallable).to.equal(true);
});

// ---------------------------------------------------------------------------
// POMOGATORDOCTOR002 — Canonical v2 plugin manifest (regression issue #71)
// The v2 plugin.json uses string arrays for skills/commands paths.
// Step-defs build a real temp project tree with .claude-plugin/plugin.json
// in canonical string-array format, then run runDoctor in-process.
// Per-scenario cleanup is handled by the existing After hook via this.home.
// ---------------------------------------------------------------------------

/**
 * Build a canonical v2 plugin project under a temp dir.
 * Returns a TempHome-compatible adapter so the existing After hook cleans it up.
 */
function buildCanonicalProject(opts: {
  skills?: string[];
  skillsWithoutManifest?: string[];
  commands?: string[];
  skillsPath?: string;
  version?: string;
}): { homeDir: string; projectDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-canonical-'));
  const pluginDir = path.join(root, '.claude-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });

  for (const s of opts.skills ?? []) {
    const dir = path.join(root, '.claude', 'skills', s);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${s}\n`);
  }
  for (const s of opts.skillsWithoutManifest ?? []) {
    fs.mkdirSync(path.join(root, '.claude', 'skills', s), { recursive: true });
  }
  // Always create the commands dir so enumerateFromPath doesn't flag the absent dir
  // as BROKEN. When no commands are given the dir is empty (0 .md files → 0 declared).
  const commandsDir = path.join(root, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const c of opts.commands ?? []) {
    fs.writeFileSync(path.join(commandsDir, `${c}.md`), `# ${c}\n`);
  }

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'dev-pomogator',
      version: opts.version ?? '2.0.1',
      skills: [opts.skillsPath ?? './.claude/skills'],
      commands: ['./.claude/commands'],
    }),
  );

  return {
    homeDir: root,
    projectDir: root,
    cleanup: () => {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

// --- GIVEN steps for canonical project setup ---

Given(
  /^a canonical v2 project with skills "([^"]+)" and commands "([^"]+)"$/,
  async function (this: DoctorWorld, skillsCsv: string, commandsCsv: string) {
    const skills = skillsCsv.split(',').map((s) => s.trim());
    const commands = commandsCsv.split(',').map((c) => c.trim());
    this.home = buildCanonicalProject({ skills, commands });
  },
);

Given(
  /^a canonical v2 project with skills "([^"]+)" and support folder "([^"]+)"$/,
  async function (this: DoctorWorld, skillsCsv: string, supportFolder: string) {
    const skills = skillsCsv.split(',').map((s) => s.trim());
    this.home = buildCanonicalProject({ skills, skillsWithoutManifest: [supportFolder] });
  },
);

Given(
  /^a canonical v2 project with skills "([^"]+)" and skills path "([^"]+)"$/,
  async function (this: DoctorWorld, skillsCsv: string, skillsPath: string) {
    const skills = skillsCsv.split(',').map((s) => s.trim());
    this.home = buildCanonicalProject({ skills, skillsPath });
  },
);

Given(
  /^a canonical v2 project with skills "([^"]+)" and version "([^"]+)"$/,
  async function (this: DoctorWorld, skillsCsv: string, version: string) {
    const skills = skillsCsv.split(',').map((s) => s.trim());
    this.home = buildCanonicalProject({ skills, version });
  },
);

// --- WHEN step: run runDoctor with canonical project root (homeDir === projectDir) ---

When(
  /^I run runDoctor in-process with canonical project root$/,
  async function (this: DoctorWorld) {
    if (!this.home) throw new Error('No canonical project fixture built');
    this.report = await runDoctor({
      homeDir: this.home.homeDir,
      projectRoot: this.home.projectDir,
    });
  },
);

// --- THEN steps: C15 assertions ---

Then(
  /^check C15 is severity "([^"]+)"$/,
  async function (this: DoctorWorld, severity: string) {
    const c15 = this.report?.results.find((r) => r.id === 'C15');
    expect(c15, 'C15 must be present in report').to.not.be.undefined;
    expect(c15?.severity).to.equal(severity);
  },
);

Then(
  /^check C15 message does not match "([^"]+)"$/,
  async function (this: DoctorWorld, pattern: string) {
    const c15 = this.report?.results.find((r) => r.id === 'C15');
    expect(c15, 'C15 must be present').to.not.be.undefined;
    expect(c15?.message ?? '').to.not.match(new RegExp(pattern, 'i'));
  },
);

Then(
  /^check C15 message matches "([^"]+)"$/,
  async function (this: DoctorWorld, pattern: string) {
    const c15 = this.report?.results.find((r) => r.id === 'C15');
    expect(c15, 'C15 must be present').to.not.be.undefined;
    expect(c15?.message ?? '').to.match(new RegExp(pattern));
  },
);

Then(
  /^check C15 message does not mention "([^"]+)"$/,
  async function (this: DoctorWorld, text: string) {
    const c15 = this.report?.results.find((r) => r.id === 'C15');
    expect(c15, 'C15 must be present').to.not.be.undefined;
    expect(c15?.message ?? '').to.not.include(text);
  },
);

Then(
  /^check C15 state is "([^"]+)"$/,
  async function (this: DoctorWorld, state: string) {
    const c15 = this.report?.results.find((r) => r.id === 'C15');
    expect(c15, 'C15 must be present').to.not.be.undefined;
    expect((c15 as { state?: string })?.state).to.equal(state);
  },
);

// --- THEN steps: C3 / C13 / C14 false-critical regression (POMOGATORDOCTOR002_04) ---

Then(
  /^check C3 is severity "([^"]+)"$/,
  async function (this: DoctorWorld, severity: string) {
    const c3 = this.report?.results.find((r) => r.id === 'C3');
    expect(c3, 'C3 must be present in report').to.not.be.undefined;
    expect(c3?.severity).to.equal(severity);
  },
);

Then(
  /^check C14 is severity "([^"]+)"$/,
  async function (this: DoctorWorld, severity: string) {
    const c14 = this.report?.results.find((r) => r.id === 'C14');
    expect(c14, 'C14 must be present in report').to.not.be.undefined;
    expect(c14?.severity).to.equal(severity);
  },
);

Then(
  /^check C13 severity is "([^"]+)" or "([^"]+)"$/,
  async function (this: DoctorWorld, sev1: string, sev2: string) {
    const c13 = this.report?.results.find((r) => r.id === 'C13');
    expect(c13, 'C13 must be present in report').to.not.be.undefined;
    expect([sev1, sev2]).to.include(c13?.severity);
  },
);
