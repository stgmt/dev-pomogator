/**
 * Step definitions for CMEM001: the v2 claude-mem bootstrap (SessionStart hook) + doctor
 * detection. Drives REAL code only — no mocks:
 *   - the pure decision fn `claudeMemBootstrapDecision` (imported in-process),
 *   - the real hook `tools/claude-mem-bootstrap/install-claude-mem.ts` spawned through its real
 *     bootstrap launcher, with a recorded-launcher seam so the installer command is asserted
 *     without ever hitting the network,
 *   - the real doctor checks `claudeMemPluginCheck` + `mcpParseCheck` run with a crafted ctx.
 * Per-scenario isolation comes from the V4World fresh `tempDir`, used as a fake HOME.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import {
  claudeMemBootstrapDecision,
  type BootstrapDecision,
} from '../../tools/claude-mem-bootstrap/install-claude-mem.ts';
import { resolveClaudeMemHome } from '../../tools/claude-mem-bootstrap/claude-mem-state.ts';
import { claudeMemPluginCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts';
import { mcpParseCheck } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts';

const REPO = process.env.APP_DIR || process.cwd();
const HOOK_REL = 'tools/claude-mem-bootstrap/install-claude-mem.ts';
const STUB = 'tests/fixtures/claude-mem-bootstrap/record-launcher.cjs';

interface CmemWorld extends V4World {
  decisionInput: { installed: boolean; optOut: boolean; lockFresh: boolean };
  decision: BootstrapDecision;
  recordPath: string;
  installerRecord: { argv: string[]; env: Record<string, string>; home: string; packageSpecifier: string; outcome: string };
  hookExit: number;
  hookStdout: string;
  checkSeverity: string;
  mcpMessage: string;
  windowsProfile: string;
  windowsHome: string;
  resolvedHome: string;
}

function craftCtx(homeDir: string, projectRoot: string, referenced: string[] = []) {
  return {
    config: null,
    configError: null,
    referencedMcpServers: new Set(referenced),
    installedExtensions: [],
    projectRoot,
    homeDir,
    signal: new AbortController().signal,
    packageVersion: null,
  };
}

/** Spawn the real hook through its real bootstrap launcher with a SessionStart-ish stdin. */
function runHook(
  world: CmemWorld,
  stdin: string,
  extraEnv: Record<string, string> = {},
): void {
  const recordPath = path.join(world.tempDir, 'record.json');
  world.recordPath = recordPath;
  const res = spawnSync(
    process.execPath,
    ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", '--', HOOK_REL],
    {
      input: stdin,
      encoding: 'utf-8',
      cwd: REPO,
      timeout: 30000,
      env: {
        ...process.env,
        HOME: world.tempDir,
        USERPROFILE: world.tempDir,
        CLAUDE_PLUGIN_ROOT: REPO,
        CLAUDE_MEM_INSTALL_LAUNCHER: path.join(REPO, STUB),
        CLAUDE_MEM_RECORD: recordPath,
        ...extraEnv,
      },
    },
  );
  world.hookExit = res.status ?? 1;
  world.hookStdout = res.stdout || '';
}

function readInstallerRecord(world: CmemWorld): void {
  assert.ok(fs.existsSync(world.recordPath), 'an installer invocation should have been recorded');
  world.installerRecord = JSON.parse(fs.readFileSync(world.recordPath, 'utf-8')) as CmemWorld['installerRecord'];
}

function writeInstalledPlugin(homeDir: string): void {
  const dir = path.join(homeDir, '.claude', 'plugins');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'claude-mem@thedotmack': [{ scope: 'global' }] } }),
  );
}

// ---- @feature1: pure decision ----
Given<CmemWorld>(
  /^bootstrap state installed=(\w+) optOut=(\w+) lockFresh=(\w+)$/,
  function (installed: string, optOut: string, lockFresh: string) {
    this.decisionInput = {
      installed: installed === 'true',
      optOut: optOut === 'true',
      lockFresh: lockFresh === 'true',
    };
  },
);

When<CmemWorld>(/^the claude-mem bootstrap decision is computed$/, function () {
  this.decision = claudeMemBootstrapDecision(this.decisionInput);
});

Then<CmemWorld>(/^the decision is "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.decision, expected);
});

// ---- @feature2 / @feature3 / @feature4: hook integration ----
Given<CmemWorld>(/^a clean fake home with no claude-mem plugin$/, function () {
  // V4World gave a fresh tempDir; nothing installed.
});

Given<CmemWorld>(/^a fake home where the claude-mem plugin is already installed$/, function () {
  writeInstalledPlugin(this.tempDir);
});

When<CmemWorld>(/^the claude-mem bootstrap hook runs$/, function () {
  runHook(this, '{"hook_event_name":"SessionStart"}');
});

When<CmemWorld>(/^the claude-mem bootstrap hook runs with DEV_POMOGATOR_CLAUDE_MEM=off$/, function () {
  runHook(this, '{"hook_event_name":"SessionStart"}', { DEV_POMOGATOR_CLAUDE_MEM: 'off' });
});

When<CmemWorld>(/^the claude-mem bootstrap hook runs with garbage stdin$/, function () {
  runHook(this, 'not json {{{');
});

Then<CmemWorld>(/^the recorded installer invocation targets "claude-mem install" non-interactively$/, function () {
  readInstallerRecord(this);
  const argv = this.installerRecord.argv;
  // npx -y claude-mem install ... (cmd /c prefix on Windows)
  assert.ok(argv.includes('claude-mem'), `argv must invoke claude-mem: ${argv.join(' ')}`);
  assert.ok(argv.includes('install'), 'argv must run install');
  for (const pair of [
    ['--ide', 'claude-code'],
    ['--provider', 'claude'],
    ['--model', 'claude-haiku-4-5-20251001'],
    ['--runtime', 'worker'],
  ]) {
    const i = argv.indexOf(pair[0]);
    assert.ok(i !== -1 && argv[i + 1] === pair[1], `expected ${pair[0]} ${pair[1]} in ${argv.join(' ')}`);
  }
});

Then<CmemWorld>(/^the recorded installer environment disables telemetry$/, function () {
  readInstallerRecord(this);
  assert.strictEqual(this.installerRecord.env.DO_NOT_TRACK, '1', 'DO_NOT_TRACK must be set');
  assert.strictEqual(this.installerRecord.env.CLAUDE_MEM_ONLINE_OPTIN, 'false', 'online opt-in must be off');
});

Then<CmemWorld>(/^the installer provenance records a package specifier and outcome$/, function () {
  readInstallerRecord(this);
  assert.strictEqual(this.installerRecord.packageSpecifier, 'claude-mem');
  assert.strictEqual(this.installerRecord.outcome, 'recorded-offline');
  assert.strictEqual(this.installerRecord.home, this.tempDir, 'recorder must expose the effective state home');
});

Then<CmemWorld>(/^no installer invocation is recorded$/, function () {
  assert.ok(!fs.existsSync(this.recordPath), `no install expected, but record exists: ${this.recordPath}`);
});

Then<CmemWorld>(/^the hook exits 0 with a continue payload$/, function () {
  assert.strictEqual(this.hookExit, 0, `expected exit 0, got ${this.hookExit}. stdout: ${this.hookStdout}`);
  assert.match(this.hookStdout, /"continue"\s*:\s*true/, 'continue payload required');
});

Given<CmemWorld>(/^a Windows profile "([^"]+)" and a different HOME "([^"]+)"$/, function (userProfile: string, home: string) {
  this.windowsProfile = userProfile;
  this.windowsHome = home;
});

When<CmemWorld>(/^the claude-mem state home is resolved$/, function () {
  this.resolvedHome = resolveClaudeMemHome(
    'win32',
    { USERPROFILE: this.windowsProfile, HOME: this.windowsHome },
    this.windowsHome,
  );
});

Then<CmemWorld>(/^the state home is the Windows profile "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.resolvedHome, expected, 'Windows state must be rooted in USERPROFILE, not HOME');
});

// ---- @feature5: doctor claude-mem check ----
When<CmemWorld>(/^the doctor claude-mem check runs$/, async function () {
  const res = await claudeMemPluginCheck.run(craftCtx(this.tempDir, REPO) as never);
  this.checkSeverity = Array.isArray(res) ? res[0].severity : res!.severity;
});

Then<CmemWorld>(/^the claude-mem check severity is "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.checkSeverity, expected);
});

// ---- @feature6: doctor reads ~/.claude.json ----
Given<CmemWorld>(
  /^a referenced MCP server "([^"]+)" registered in the global "~\/\.claude\.json"$/,
  function (name: string) {
    fs.writeFileSync(
      path.join(this.tempDir, '.claude.json'),
      JSON.stringify({ mcpServers: { [name]: { command: 'npx', args: ['-y', `${name}-mcp@latest`] } } }),
    );
  },
);

When<CmemWorld>(/^the doctor MCP-parse check runs for referenced server "([^"]+)"$/, async function (name: string) {
  const ctx = craftCtx(this.tempDir, this.tempDir, [name]);
  const res = await mcpParseCheck.run(ctx as never);
  this.mcpMessage = (Array.isArray(res) ? res[0] : res!).message;
});

Then<CmemWorld>(/^the MCP-parse check reports "([^"]+)" as configured$/, function (name: string) {
  assert.doesNotMatch(this.mcpMessage, new RegExp(`not configured.*${name}`), `"${name}" must be configured: ${this.mcpMessage}`);
  assert.match(this.mcpMessage, /all configured/, `expected all-configured: ${this.mcpMessage}`);
});
