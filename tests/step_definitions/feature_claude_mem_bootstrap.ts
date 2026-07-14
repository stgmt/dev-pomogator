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
import { After, Given, When, Then } from '@cucumber/cucumber';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
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
import { claudeMemWorkerCheck, readWorkerPort } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-worker.ts';
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
  installationMessage: string;
  workerCheckMessage: string;
  workerCheckDetails: Record<string, unknown>;
  mcpMessage: string;
  windowsProfile: string;
  windowsHome: string;
  resolvedHome: string;
  workerServer: http.Server;
  workerPort: number;
  healthHookExit: number;
  healthHookStdout: string;
  healthHookStderr: string;
  healthHookElapsedMs: number;
}

After(async function (this: CmemWorld) {
  await closeWorker(this);
});

function workerSettings(world: CmemWorld): void {
  const settingsDir = path.join(world.tempDir, '.claude-mem');
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({ CLAUDE_MEM_WORKER_PORT: world.workerPort }));
}

async function closeWorker(world: CmemWorld): Promise<void> {
  if (world.workerServer?.listening) await new Promise<void>((resolve) => world.workerServer.close(() => resolve()));
}

async function invokeHealthHook(world: CmemWorld): Promise<void> {
  const started = Date.now();
  const child = spawn(process.execPath, ['-e', "require(require('path').resolve('tools/_shared/bootstrap.cjs'))", 'tools/claude-mem-health/health-check.ts'], {
    cwd: REPO,
    env: { ...process.env, HOME: world.tempDir, CLAUDE_MEM_REAPER_HOME: world.tempDir, CLAUDE_MEM_REAPER_SNAPSHOT: JSON.stringify({ platform: 'win32', portListening: false, portOwnerAlive: false, procs: [] }) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  await new Promise<void>((resolve) => child.once('close', () => resolve()));
  world.healthHookElapsedMs = Date.now() - started;
  world.healthHookExit = child.exitCode ?? -1;
  world.healthHookStdout = stdout;
  world.healthHookStderr = stderr;
  // The feature's shared hook assertion predates the health scenarios.
  world.hookExit = world.healthHookExit;
  world.hookStdout = world.healthHookStdout;
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

Given<CmemWorld>('the offline default Docker BDD profile', function () {
  // runHook below injects the test-only recorder seam; the production hook is still spawned.
});

When<CmemWorld>('the claude-mem lifecycle scenarios run', function () {
  runHook(this, '{"hook_event_name":"SessionStart"}');
});

Then<CmemWorld>('no real package download or installation is attempted', function () {
  readInstallerRecord(this);
  assert.strictEqual(this.installerRecord.outcome, 'recorded-offline');
  assert.strictEqual(this.installerRecord.packageSpecifier, 'claude-mem');
});

Then<CmemWorld>('only recorded launchers and local worker fixtures are used', function () {
  assert.strictEqual(this.installerRecord.home, this.tempDir);
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

Given<CmemWorld>(/^a local claude-mem worker that is (refusing connections|returning non-200|accepting silently)$/, async function (workerState: string) {
  const server = http.createServer((_req, res) => {
    if (workerState === 'returning non-200') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unavailable' }));
    }
  });
  if (workerState === 'refusing connections') {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => server.close(() => resolve())));
  } else {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.workerServer = server;
    this.workerPort = (server.address() as { port: number }).port;
  }
  if (workerState === 'refusing connections') {
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => {
      this.workerPort = (probe.address() as { port: number }).port;
      probe.close(() => resolve());
    }));
  }
  workerSettings(this);
});

When<CmemWorld>(/^the bounded claude-mem health hook runs$/, async function () {
  await invokeHealthHook(this);
});

Then<CmemWorld>(/^no claude-mem context is emitted$/, function () {
  const payload = JSON.parse(this.healthHookStdout) as { continue?: unknown; suppressOutput?: unknown; additionalContext?: unknown };
  assert.deepStrictEqual(payload, { continue: true, suppressOutput: true }, 'fail-open health hook must only emit its continue control payload');
  assert.strictEqual(payload.additionalContext, undefined, 'fail-open health hook must not fabricate memory context');
  assert.strictEqual(this.healthHookStderr.trim(), '', 'fail-open health hook must not emit an error payload');
});

Then<CmemWorld>(/^no worker request handle remains$/, function () {
  assert.strictEqual(this.healthHookExit, 0);
  assert.ok(this.healthHookElapsedMs < 5_000, `health hook ran ${this.healthHookElapsedMs}ms rather than releasing its request`);
});

Then<CmemWorld>(/^the state home is the Windows profile "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.resolvedHome, expected, 'Windows state must be rooted in USERPROFILE, not HOME');
});

// ---- @feature5: doctor claude-mem check ----
When<CmemWorld>(/^the doctor claude-mem check runs$/, async function () {
  const res = await claudeMemPluginCheck.run(craftCtx(this.tempDir, REPO) as never);
  const check = Array.isArray(res) ? res[0] : res!;
  this.checkSeverity = check.severity;
  this.installationMessage = check.message;
});

Then<CmemWorld>(/^the claude-mem check severity is "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.checkSeverity, expected);
});

Then<CmemWorld>(/^the installation diagnostic says claude-mem is installed$/, function () {
  assert.match(this.installationMessage, /installed/i);
});

// ---- @feature5: doctor worker diagnostic ----
Given<CmemWorld>(/^a doctor-visible claude-mem installation$/, function () {
  fs.mkdirSync(path.join(this.tempDir, '.claude-mem'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.claude-mem', '.worker.pid'), '4242');
});

Given<CmemWorld>(/^a doctor-visible claude-mem worker that is (healthy|unreachable) on port "(\d+)"$/, async function (state: string, port: string) {
  this.workerPort = Number(port);
  workerSettings(this);
  if (state === 'healthy') {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: 'test-worker-v1' }));
    });
    await new Promise<void>((resolve) => server.listen(this.workerPort, '127.0.0.1', resolve));
    this.workerServer = server;
  }
});

Given<CmemWorld>(/^a malformed claude-mem worker configuration$/, function () {
  fs.mkdirSync(path.join(this.tempDir, '.claude-mem'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, '.claude-mem', 'settings.json'), '{not-json');
  assert.deepStrictEqual(readWorkerPort(this.tempDir), { port: 37777, configuration: 'malformed' });
});

When<CmemWorld>(/^the doctor claude-mem worker check runs$/, async function () {
  const res = await claudeMemWorkerCheck.run(craftCtx(this.tempDir, REPO) as never);
  const check = Array.isArray(res) ? res[0] : res!;
  this.checkSeverity = check.severity;
  this.workerCheckMessage = check.message;
  this.workerCheckDetails = (check.details ?? {}) as Record<string, unknown>;
});

Then<CmemWorld>(/^the worker diagnostic reports "([^"]+)" with port "(\d+)"$/, function (condition: string, port: string) {
  assert.strictEqual(this.workerCheckDetails.port, Number(port), 'worker diagnostic must expose its resolved port');
  if (condition === 'malformed-config') {
    assert.match(this.workerCheckMessage, /configuration is malformed/i, this.workerCheckMessage);
    assert.strictEqual(this.workerCheckDetails.configuration, 'malformed');
    return;
  }
  assert.match(this.workerCheckMessage, new RegExp(condition), `expected ${condition}: ${this.workerCheckMessage}`);
});

Given<CmemWorld>(/^a fake claude-mem home in (absent|installed and healthy|malformed config|installed unreachable) state$/, async function (state: string) {
  if (state === 'absent') return;
  fs.mkdirSync(path.join(this.tempDir, '.claude-mem'), { recursive: true });
  if (state === 'malformed config') {
    fs.writeFileSync(path.join(this.tempDir, '.claude-mem', 'settings.json'), '{not-json');
    return;
  }
  fs.writeFileSync(path.join(this.tempDir, '.claude-mem', '.worker.pid'), '4242');
  this.workerPort = state === 'installed and healthy' ? 37778 : 37779;
  workerSettings(this);
  if (state === 'installed and healthy') {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: 'test-worker-v1' }));
    });
    await new Promise<void>((resolve) => server.listen(this.workerPort, '127.0.0.1', resolve));
    this.workerServer = server;
  }
});

When<CmemWorld>(/^the doctor claude-mem checks run$/, async function () {
  const [installation, worker] = await Promise.all([
    claudeMemPluginCheck.run(craftCtx(this.tempDir, REPO) as never),
    claudeMemWorkerCheck.run(craftCtx(this.tempDir, REPO) as never),
  ]);
  const installCheck = Array.isArray(installation) ? installation[0] : installation!;
  const workerCheck = Array.isArray(worker) ? worker[0] : worker!;
  this.checkSeverity = installCheck.severity;
  this.installationMessage = installCheck.message;
  this.workerCheckMessage = workerCheck.message;
  this.workerCheckDetails = (workerCheck.details ?? {}) as Record<string, unknown>;
});

Then<CmemWorld>(/^the claude-mem installation check reports "([^"]+)"$/, function (expected: string) {
  assert.strictEqual(this.checkSeverity, expected);
});

Then<CmemWorld>(/^the worker diagnostic reports "([^"]+)"$/, function (condition: string) {
  const expected = condition === 'malformed-config' ? /configuration is malformed/i
    : condition === 'absent' || condition === 'unreachable-worker' ? /not reachable|unreachable/i
    : /healthy/i;
  assert.match(this.workerCheckMessage, expected, this.workerCheckMessage);
  assert.ok(Number.isFinite(this.workerCheckDetails.port as number), 'worker result must include resolved port evidence');
});

// ---- @feature6: doctor reads ~/.claude.json ----
Given<CmemWorld>(
  /^a referenced MCP server "([^"]+)" registered in global "~\/\.claude\.json"$/,
  function (name: string) {
    fs.writeFileSync(
      path.join(this.tempDir, '.claude.json'),
      JSON.stringify({ mcpServers: { [name]: { command: 'npx', args: ['-y', `${name}-mcp@latest`] } } }),
    );
  },
);

Given<CmemWorld>(/^a separate project MCP configuration$/, function () {
  fs.writeFileSync(
    path.join(this.tempDir, '.mcp.json'),
    JSON.stringify({ mcpServers: { 'project-only': { command: 'node', args: ['worker.cjs'] } } }),
  );
});

When<CmemWorld>(/^the doctor MCP-parse check runs for referenced server "([^"]+)"$/, async function (name: string) {
  const ctx = craftCtx(this.tempDir, this.tempDir, [name]);
  const res = await mcpParseCheck.run(ctx as never);
  this.mcpMessage = (Array.isArray(res) ? res[0] : res!).message;
});

Then<CmemWorld>(/^the MCP-parse check reports "([^"]+)" as configured$/, function (name: string) {
  assert.doesNotMatch(this.mcpMessage, new RegExp(`not configured.*${name}`), `"${name}" must be configured: ${this.mcpMessage}`);
  assert.match(this.mcpMessage, /all configured/, `expected all-configured: ${this.mcpMessage}`);
});
