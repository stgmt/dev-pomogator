/**
 * @feature1..9 step definitions for context-mode integration.
 *
 * These scenarios drive the real context-mode setup/health helpers against
 * real-shaped filesystem fixtures. They intentionally avoid source scanning:
 * success is observable through status objects, written settings, backups, and
 * rendered user guidance.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  INSTALL_INSTRUCTIONS,
  claudeGlobalSettingsPath,
  claudePluginsRegistryPath,
  writeJsonAtomic,
} from '../../tools/context-mode-setup/state.ts';
import {
  McpOnlyResult,
  SetupDecision,
  applyMcpOnlyContextModeConfig,
  buildContextModeInstallInvocation,
  getContextModeSetupDecision,
  runContextModeSessionStart,
  runContextModeSetupHook,
} from '../../tools/context-mode-setup/setup.ts';
import {
  ContextModeDoctorReport,
  ContextModeDoctorStatus,
  renderRecoveryGuidance,
  runContextModeDoctor,
} from '../../tools/context-mode-health/check.ts';
import { HookDecision, evaluateContextModeHook } from '../../tools/context-mode-health/hook-safety.ts';
import { renderWindowsContextModeGuidance } from '../../tools/context-mode-health/windows-guidance.ts';
import { renderContextModeValueBoundary } from '../../tools/context-mode-health/value-boundary.ts';
import { sweepStaleContextModeWorkers } from '../../tools/context-mode-setup/stale-workers.ts';
import { installerSpawnOptions } from '../../tools/context-mode-setup/worker.ts';
import { allChecks } from '../../.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'context-mode');
const DOC_PATH = path.join(REPO_ROOT, 'docs', 'context-mode-integration.md');
const CONTEXT_MODE_SETUP_TARGET = 'tools/context-mode-setup/setup.ts';
const DOCTOR_BUNDLE_PATH = path.join(REPO_ROOT, '.claude', 'skills', 'pomogator-doctor', 'scripts', 'engine', 'doctor.bundle.mjs');

interface ContextModeWorld extends V4World {
  contextModeHome: string;
  pluginRoot: string;
  setupDecision?: SetupDecision;
  sessionStartResult?: ReturnType<typeof runContextModeSessionStart>;
  installCapturePath?: string;
  setupHookRuns?: Array<{ exitCode: 0; decision: SetupDecision }>;
  mcpOnlyResult?: McpOnlyResult;
  settingsBefore?: Record<string, unknown>;
  doctorResult?: ContextModeDoctorReport;
  recoveryGuidance?: string[];
  hookInput?: Record<string, unknown>;
  hookDecision?: HookDecision;
  forceCtxEnv?: NodeJS.ProcessEnv;
  guidanceText?: string;
  docsText?: string;
  workerSpawnOptions?: ReturnType<typeof installerSpawnOptions>;
  staleSweep?: {
    now?: number;
    stale?: string;
    fresh?: string;
    snapshot?: Array<{ pid: number; commandLine: string }>;
    result?: ReturnType<typeof sweepStaleContextModeWorkers>;
    killed?: number[];
  } | ReturnType<typeof sweepStaleContextModeWorkers>;
}

function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, name);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function copyFixture(name: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(fixturePath(name), target);
}

function writeRegistryFixture(world: ContextModeWorld, name: string): void {
  copyFixture(name, claudePluginsRegistryPath(world.contextModeHome));
}

function createPluginRoot(world: ContextModeWorld): void {
  world.pluginRoot = path.join(world.tempDir, 'context-mode-plugin');
  const mcpPath = path.join(world.pluginRoot, '.codex-plugin', 'mcp.json');
  copyFixture('plugin.manifest.json', mcpPath);
}

function assertIncludesInOrder(text: string, fragments: string[]): void {
  assert.ok(fragments.length > 0, 'fragments must not be empty');
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment);
    assert.notEqual(next, -1, `expected text to include "${fragment}"`);
    assert.ok(next > cursor, `expected "${fragment}" after previous recovery step`);
    cursor = next;
  }
}

Given(/^an isolated Claude home for context-mode integration tests$/, function (this: ContextModeWorld) {
  this.contextModeHome = path.join(this.tempDir, 'home');
  fs.mkdirSync(this.contextModeHome, { recursive: true });
  createPluginRoot(this);
});

Given(/^dev-pomogator context-mode fixtures are available$/, function () {
  const expected = [
    'installed_plugins.healthy.json',
    'installed_plugins.poisoned.json',
    'installed_plugins.malformed.json',
    'plugin.manifest.json',
    'process.dead.json',
    'hook.ctx-unavailable.json',
  ];
  assert.ok(expected.length > 0, 'fixture list must not be empty');
  for (const name of expected) {
    const filePath = fixturePath(name);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 10, `${name} must be a non-empty real-shaped fixture`);
  }
  const healthy = readJson<{ enabledPlugins: Record<string, boolean> }>(fixturePath('installed_plugins.healthy.json'));
  assert.equal(healthy.enabledPlugins['context-mode@context-mode'], true, 'healthy fixture must use enabledPlugins context-mode shape');
});

Given(/^context-mode plugin registration is missing$/, function (this: ContextModeWorld) {
  fs.rmSync(claudePluginsRegistryPath(this.contextModeHome), { force: true });
});

When(/^the context-mode setup decision runs$/, function (this: ContextModeWorld) {
  this.setupDecision = getContextModeSetupDecision({ homeRoot: this.contextModeHome });
});

Then(/^the setup status is "([^"]+)"$/, function (this: ContextModeWorld, status: SetupDecision['status']) {
  assert.equal(this.setupDecision?.status, status, `setup decision status must be ${status}`);
});

Then(/^the setup output includes exact plugin install instructions$/, function (this: ContextModeWorld) {
  assert.deepEqual(this.setupDecision?.instructions, INSTALL_INSTRUCTIONS, 'missing install must print exact user-run plugin commands');
});

Then(/^no interactive plugin command is launched from shell$/, function (this: ContextModeWorld) {
  assert.equal(this.setupDecision?.launchedInteractiveCommand, false, 'setup hook must not shell out to interactive /plugin commands');
  assert.equal(this.setupDecision?.exitCode, 0, 'setup decision must be fail-open for SessionStart');
});

Then(/^SessionStart fires the non-interactive context-mode installer$/, function (this: ContextModeWorld) {
  const launcher = path.join(this.tempDir, 'capture-context-mode-install.mjs');
  this.installCapturePath = path.join(this.tempDir, 'context-mode-install.jsonl');
  fs.writeFileSync(
    launcher,
    [
      "import fs from 'node:fs';",
      "fs.appendFileSync(process.env.CONTEXT_MODE_INSTALL_CAPTURE, JSON.stringify(process.argv.slice(2)) + '\\n');",
    ].join('\n'),
  );

  this.sessionStartResult = runContextModeSessionStart({
    homeRoot: this.contextModeHome,
    nowMs: Date.parse('2026-07-22T00:00:00.000Z'),
    env: {
      ...process.env,
      DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER: launcher,
      CONTEXT_MODE_INSTALL_CAPTURE: this.installCapturePath,
    },
  });

  assert.equal(this.sessionStartResult.decision.status, 'INSTALL_MISSING');
  assert.equal(this.sessionStartResult.decision.launchedInteractiveCommand, false);
  assert.equal(this.sessionStartResult.decision.launchedInstallerCommand, true);
  assert.match(this.sessionStartResult.output.additionalContext ?? '', /started the context-mode installer in the background/);

  const captured = fs.readFileSync(this.installCapturePath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
  const expected = buildContextModeInstallInvocation(process.platform);
  assert.deepEqual(captured[0], [expected.cmd, ...expected.args], 'installer must use the non-interactive Claude plugin CLI flow');
});

Then(/^the shipped SessionStart runtime registers the context-mode setup hook$/, function () {
  const legacyHooks = readJson<{ hooks?: { SessionStart?: Array<{ hooks?: Array<{ command?: string }> }> } }>(
    path.join(REPO_ROOT, '.claude-plugin', 'hooks.legacy.json'),
  );
  const httpHooks = readJson<{ hooks?: { SessionStart?: Array<{ hooks?: Array<{ command?: string }> }> } }>(
    path.join(REPO_ROOT, '.claude-plugin', 'hooks.json'),
  );
  const registry = readJson<{ routes?: Record<string, { event?: string; target?: string }> }>(
    path.join(REPO_ROOT, 'tools', 'hook-service', 'registry.json'),
  );
  const legacyCommands = legacyHooks.hooks?.SessionStart?.flatMap((group) => group.hooks?.map((hook) => hook.command ?? '') ?? []) ?? [];
  const httpCommands = httpHooks.hooks?.SessionStart?.flatMap((group) => group.hooks?.map((hook) => hook.command ?? '') ?? []) ?? [];
  const registryTargets = Object.values(registry.routes ?? {})
    .filter((route) => route.event === 'SessionStart')
    .map((route) => route.target ?? '');

  const codexHooksPath = path.join(REPO_ROOT, '.Codex', 'hooks.json');
  if (fs.existsSync(codexHooksPath)) {
    const codexHooks = readJson<{ hooks?: { SessionStart?: Array<{ hooks?: Array<{ command?: string }> }> } }>(codexHooksPath);
    const codexCommands = codexHooks.hooks?.SessionStart?.flatMap((group) => group.hooks?.map((hook) => hook.command ?? '') ?? []) ?? [];
    assert.ok(codexCommands.some((command) => command.includes(CONTEXT_MODE_SETUP_TARGET)), '.Codex/hooks.json must dogfood the context-mode setup hook');
  }
  assert.ok(
    legacyCommands.some((command) => command.includes(CONTEXT_MODE_SETUP_TARGET)),
    '.claude-plugin/hooks.legacy.json must ship the context-mode setup hook',
  );
  assert.ok(httpCommands.some((command) => command.includes('tools/hook-service/session-bootstrap.mjs')), '.claude-plugin/hooks.json must enter hook-service through session-bootstrap');
  assert.ok(registryTargets.includes(CONTEXT_MODE_SETUP_TARGET), 'hook-service registry must expose the context-mode setup target');
});

Given(/^global Claude settings contain unrelated hooks and MCP servers$/, function (this: ContextModeWorld) {
  this.settingsBefore = {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node keep-me.mjs' }] }],
    },
    mcpServers: {
      unrelated: { command: 'node', args: ['unrelated-server.mjs'] },
    },
    userPreference: 'preserve-me',
  };
  writeJsonAtomic(claudeGlobalSettingsPath(this.contextModeHome), this.settingsBefore);
});

When(/^MCP-only context-mode config is applied$/, function (this: ContextModeWorld) {
  this.mcpOnlyResult = applyMcpOnlyContextModeConfig({
    homeRoot: this.contextModeHome,
    pluginRoot: this.pluginRoot,
    now: new Date('2026-07-21T20:00:00.000Z'),
  });
});

Then(/^a settings backup is created$/, function (this: ContextModeWorld) {
  assert.ok(this.mcpOnlyResult?.backupPath, 'MCP-only writer must create a timestamped backup before editing settings');
  assert.ok(fs.existsSync(this.mcpOnlyResult.backupPath), `backup must exist: ${this.mcpOnlyResult.backupPath}`);
  assert.deepEqual(readJson(this.mcpOnlyResult.backupPath), this.settingsBefore, 'backup must preserve the pre-edit settings exactly');
});

Then(/^unrelated hooks and MCP servers are preserved$/, function (this: ContextModeWorld) {
  const after = this.mcpOnlyResult?.settings as Record<string, unknown>;
  assert.deepEqual(after.hooks, this.settingsBefore?.hooks, 'unrelated hook chains must be preserved');
  assert.deepEqual((after.mcpServers as Record<string, unknown>).unrelated, (this.settingsBefore?.mcpServers as Record<string, unknown>).unrelated);
  assert.equal(after.userPreference, 'preserve-me', 'unrelated top-level settings must be preserved');
});

Then(/^context-mode MCP registration is present$/, function (this: ContextModeWorld) {
  const after = this.mcpOnlyResult?.settings as Record<string, unknown>;
  const mcpServers = after.mcpServers as Record<string, { command?: string; args?: string[]; cwd?: string }>;
  assert.equal(mcpServers['context-mode'].command, 'node', 'MCP-only registration must use the context-mode manifest command');
  assert.deepEqual(mcpServers['context-mode'].args, ['./start.mjs'], 'MCP-only registration must use the context-mode manifest args');
  assert.equal(mcpServers['context-mode'].cwd, path.resolve(this.pluginRoot), 'MCP-only registration must point at the plugin root');
});

Given(/^context-mode setup sees an opt-out or malformed registry$/, function (this: ContextModeWorld) {
  const malformedHome = path.join(this.tempDir, 'malformed-home');
  fs.mkdirSync(malformedHome, { recursive: true });
  copyFixture('installed_plugins.malformed.json', claudePluginsRegistryPath(malformedHome));
  this.setupHookRuns = [
    runContextModeSetupHook({
      homeRoot: path.join(this.tempDir, 'optout-home'),
      env: { ...process.env, DEV_POMOGATOR_CONTEXT_MODE: 'off' },
    }),
    runContextModeSetupHook({ homeRoot: malformedHome }),
  ];
});

When(/^the setup hook runs$/, function () {
  // The setup hook was run by the previous Given so both opt-out and malformed
  // registry cases are asserted by the shared Then steps.
});

Then(/^the context-mode setup hook exits with code 0$/, function (this: ContextModeWorld) {
  assert.equal(this.setupHookRuns?.length, 2, 'scenario must exercise opt-out and malformed registry cases');
  for (const run of this.setupHookRuns!) {
    assert.equal(run.exitCode, 0, `setup hook must exit 0 for ${run.decision.status}`);
    assert.equal(run.decision.exitCode, 0, `setup decision must record fail-open exit for ${run.decision.status}`);
  }
});

Then(/^the result records a non-success status without blocking the session$/, function (this: ContextModeWorld) {
  assert.equal(this.setupHookRuns?.length, 2, 'non-success assertion must cover both setup cases');
  const statuses = this.setupHookRuns!.map((run) => run.decision.status);
  assert.deepEqual(statuses, ['SKIP_OPTOUT', 'ERROR_FAIL_OPEN'], 'opt-out and malformed registry must be explicit non-success statuses');
});

Given(/^context-mode plugin files exist$/, function (this: ContextModeWorld) {
  createPluginRoot(this);
  assert.equal(fs.existsSync(path.join(this.pluginRoot, '.codex-plugin', 'mcp.json')), true, 'plugin manifest fixture must exist');
});

Given(/^the plugin registry is poisoned$/, function (this: ContextModeWorld) {
  writeRegistryFixture(this, 'installed_plugins.poisoned.json');
});

When(/^the context-mode doctor check runs$/, function (this: ContextModeWorld) {
  this.doctorResult = runContextModeDoctor({
    homeRoot: this.contextModeHome,
    pluginRoot: this.pluginRoot,
    handshakeResult: { skipped: true },
    hookSafety: 'safe',
  });
});

Then(/^the doctor status is "([^"]+)"$/, function (this: ContextModeWorld, status: ContextModeDoctorStatus) {
  assert.equal(this.doctorResult?.status, status, `doctor must classify root cause as ${status}`);
});

Then(/^pomogator-doctor includes the context-mode health check$/, function () {
  assert.ok(allChecks.some((check) => check.id === 'C-CMODE'), 'doctor allChecks must include C-CMODE');
  assert.match(fs.readFileSync(DOCTOR_BUNDLE_PATH, 'utf-8'), /C-CMODE/, 'doctor.bundle.mjs must include the context-mode check');
});

Then(/^pomogator-doctor can launch the context-mode repair installer$/, async function (this: ContextModeWorld) {
  const check = allChecks.find((candidate) => candidate.id === 'C-CMODE');
  assert.ok(check, 'C-CMODE check must be registered');

  const launcher = path.join(this.tempDir, 'capture-context-mode-doctor-install.mjs');
  this.installCapturePath = path.join(this.tempDir, 'context-mode-doctor-install.jsonl');
  fs.writeFileSync(
    launcher,
    [
      "import fs from 'node:fs';",
      "fs.appendFileSync(process.env.CONTEXT_MODE_INSTALL_CAPTURE, JSON.stringify(process.argv.slice(2)) + '\\n');",
    ].join('\n'),
  );

  const previousLauncher = process.env.DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER;
  const previousCapture = process.env.CONTEXT_MODE_INSTALL_CAPTURE;
  process.env.DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER = launcher;
  process.env.CONTEXT_MODE_INSTALL_CAPTURE = this.installCapturePath;
  try {
    const controller = new AbortController();
    const result = await check.run({
      config: null,
      configError: null,
      referencedMcpServers: new Set(),
      installedExtensions: [],
      projectRoot: REPO_ROOT,
      homeDir: this.contextModeHome,
      signal: controller.signal,
      packageVersion: null,
      fix: true,
    });
    assert.ok(result && !Array.isArray(result), 'C-CMODE check must return one result');
    assert.equal(result.reinstallable, true, 'missing context-mode must be marked reinstallable/repairable');
    assert.equal(result.details?.fixAction, 'context-mode-install');
    assert.equal(result.details?.fixAttempted, true);
    assert.equal(result.details?.fixLaunched, true);
  } finally {
    if (previousLauncher === undefined) delete process.env.DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER;
    else process.env.DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER = previousLauncher;
    if (previousCapture === undefined) delete process.env.CONTEXT_MODE_INSTALL_CAPTURE;
    else process.env.CONTEXT_MODE_INSTALL_CAPTURE = previousCapture;
  }

  const captured = fs.readFileSync(this.installCapturePath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
  const expected = buildContextModeInstallInvocation(process.platform);
  assert.deepEqual(captured[0], [expected.cmd, ...expected.args], 'doctor repair must use the same non-interactive installer');
});

When(/^the registry is healthy but the MCP process snapshot is dead$/, function (this: ContextModeWorld) {
  writeRegistryFixture(this, 'installed_plugins.healthy.json');
  this.doctorResult = runContextModeDoctor({
    homeRoot: this.contextModeHome,
    pluginRoot: this.pluginRoot,
    processSnapshotPath: fixturePath('process.dead.json'),
    handshakeResult: { skipped: true },
    hookSafety: 'safe',
  });
});

Given(/^context-mode doctor has status "([^"]+)"$/, function (this: ContextModeWorld, status: ContextModeDoctorStatus) {
  this.doctorResult = {
    status,
    registration: 'present',
    manifestCommand: 'node ./start.mjs',
    process: status === 'MCP_DEAD_IN_SESSION' ? 'dead' : 'unknown',
    handshake: 'skipped',
    hookSafety: 'safe',
    remediation: renderRecoveryGuidance(status),
    evidence: ['scenario-provided status'],
  };
});

When(/^recovery guidance is rendered$/, function (this: ContextModeWorld) {
  this.recoveryGuidance = renderRecoveryGuidance(this.doctorResult!.status);
});

Then(/^it recommends the heal step$/, function (this: ContextModeWorld) {
  assert.match(this.recoveryGuidance!.join('\n'), /idempotent context-mode heal step/);
});

Then(/^it recommends reconnecting context-mode through "\/mcp"$/, function (this: ContextModeWorld) {
  assert.match(this.recoveryGuidance!.join('\n'), /reconnect context-mode through \/mcp/);
});

Then(/^it lists full session restart only as a last resort$/, function (this: ContextModeWorld) {
  assertIncludesInOrder(this.recoveryGuidance!.join('\n'), [
    'idempotent context-mode heal step',
    'reconnect context-mode through /mcp',
    'verify ctx tools',
    'restart the full Claude Code session only as the last resort',
  ]);
});

Given(/^ctx tools are unavailable in the current session$/, function (this: ContextModeWorld) {
  this.hookInput = readJson<Record<string, unknown>>(fixturePath('hook.ctx-unavailable.json'));
  assert.equal(this.hookInput.ctxToolsAvailable, false, 'fixture must represent unavailable ctx tools');
});

When(/^the context-mode hook evaluates a Bash operation$/, function (this: ContextModeWorld) {
  const operation = this.hookInput!.operation as { toolName: string };
  this.hookDecision = evaluateContextModeHook({
    toolName: operation.toolName,
    ctxToolsAvailable: this.hookInput!.ctxToolsAvailable as boolean,
    forceCtx: true,
  });
});

Then(/^the hook allows native tooling$/, function (this: ContextModeWorld) {
  assert.equal(this.hookDecision?.permissionDecision, 'allow', 'hook must fail open when ctx tools are unavailable');
});

Then(/^the hook does not redirect to dead ctx tools$/, function (this: ContextModeWorld) {
  assert.doesNotMatch(this.hookDecision!.reason, /CASE-A|ctx_execute_file|ctx_batch_execute/, 'dead ctx tools must not be named as a redirect target');
});

Given(/^ctx tools are available$/, function (this: ContextModeWorld) {
  this.hookInput = { ctxToolsAvailable: true };
});

Given(/^"FORCE_CTX_OFF" is not set$/, function (this: ContextModeWorld) {
  const env = { ...process.env };
  delete env.FORCE_CTX_OFF;
  this.forceCtxEnv = env;
});

When(/^force-ctx evaluates a generated log path$/, function (this: ContextModeWorld) {
  this.hookDecision = evaluateContextModeHook({
    toolName: 'Read',
    filePath: path.join(this.tempDir, 'build', 'huge-run.ndjson'),
    ctxToolsAvailable: this.hookInput!.ctxToolsAvailable as boolean,
    forceCtx: true,
    env: this.forceCtxEnv,
  });
});

Then(/^it emits a CASE-A redirect to a ctx tool$/, function (this: ContextModeWorld) {
  assert.equal(this.hookDecision?.permissionDecision, 'deny', 'generated/log artifacts should be redirected when ctx tools are healthy');
  assert.match(this.hookDecision.reason, /CASE-A/);
  assert.match(this.hookDecision.reason, /ctx_execute_file|ctx_batch_execute/);
});

When(/^force-ctx evaluates a source file path$/, function (this: ContextModeWorld) {
  this.hookDecision = evaluateContextModeHook({
    toolName: 'Read',
    filePath: path.join(REPO_ROOT, 'tools', 'context-mode-setup', 'setup.ts'),
    ctxToolsAvailable: this.hookInput!.ctxToolsAvailable as boolean,
    forceCtx: true,
    env: this.forceCtxEnv,
  });
});

Then(/^it allows native read-to-edit access$/, function (this: ContextModeWorld) {
  assert.equal(this.hookDecision?.permissionDecision, 'allow', 'source reads must remain available for edit workflows');
  assert.equal(this.hookDecision.pathClass, 'source', 'source path must be classified as source, not generated data');
});

Given(/^the platform is Windows$/, function () {
  // Guidance is deterministic text; no platform mutation is needed.
});

When(/^context-mode guidance is rendered$/, function (this: ContextModeWorld) {
  this.guidanceText = renderWindowsContextModeGuidance();
});

Then(/^it states that shell language runs bash$/, function (this: ContextModeWorld) {
  assert.match(this.guidanceText!, /language: shell.*bash/i);
});

Then(/^it shows explicit "pwsh -NoProfile" invocation$/, function (this: ContextModeWorld) {
  assert.match(this.guidanceText!, /pwsh -NoProfile/);
});

Then(/^it recommends ctx_batch_execute for paths outside project root$/, function (this: ContextModeWorld) {
  assert.match(this.guidanceText!, /ctx_batch_execute/);
  assert.match(this.guidanceText!, /outside the active project root/);
});

Given(/^context-mode user documentation is rendered$/, function (this: ContextModeWorld) {
  this.docsText = `${fs.readFileSync(DOC_PATH, 'utf-8')}\n${renderContextModeValueBoundary()}`;
});

When(/^the value boundary section is inspected$/, function () {
  // The Given step renders the documentation; assertions below inspect it.
});

Then(/^it names large raw artifacts and session survival as value cases$/, function (this: ContextModeWorld) {
  assert.match(this.docsText!, /large raw artifacts/);
  assert.match(this.docsText!, /session survival/);
});

Then(/^it states that disciplined grep or pipe usage can be parity$/, function (this: ContextModeWorld) {
  assert.match(this.docsText!, /Disciplined `rg`, shell pipes, and targeted reads can be parity/);
});

Then(/^it does not claim universal daily usage reduction$/, function (this: ContextModeWorld) {
  assert.doesNotMatch(this.docsText!, /-99% daily usage/i);
  assert.match(this.docsText!, /Do not claim universal daily usage reduction/);
});

Given(/^a stale context-mode owned worker and unrelated runtimes$/, function (this: ContextModeWorld) {
  const stale = path.join(this.tempDir, '.ctx-mode-stale', 'script');
  const fresh = path.join(this.tempDir, '.ctx-mode-fresh', 'script');
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.mkdirSync(path.dirname(fresh), { recursive: true });
  fs.writeFileSync(stale, 'owned');
  fs.writeFileSync(fresh, 'owned');
  const now = Date.now();
  fs.utimesSync(stale, new Date(now - 20 * 60 * 1000), new Date(now - 20 * 60 * 1000));
  this.staleSweep = { now, stale, fresh, snapshot: [
    { pid: 101, commandLine: `node tools/context-mode-setup/worker.ts --worker-script ${stale}` },
    { pid: 102, commandLine: `node tools/context-mode-setup/worker.ts --worker-script ${fresh}` },
    { pid: 103, commandLine: 'python C:\\Users\\stigm\\.codex\\scan.py' },
  ] };
});

When(/^SessionStart self-heal sweeps the stale workers$/, function (this: ContextModeWorld) {
  const sweep = this.staleSweep as NonNullable<ContextModeWorld['staleSweep']> & { snapshot: Array<{ pid: number; commandLine: string }>; now: number };
  const killed: number[] = [];
  const result = sweepStaleContextModeWorkers({
    snapshot: sweep.snapshot, nowMs: sweep.now, ageMs: 15 * 60 * 1000,
    platform: 'win32', homeRoot: this.contextModeHome,
    killTree: pid => { killed.push(pid); },
  });
  this.staleSweep = { ...sweep, result, killed };
});

Then(/^only the stale owned process tree is terminated$/, function (this: ContextModeWorld) {
  const sweep = this.staleSweep as NonNullable<ContextModeWorld['staleSweep']> & { result: ReturnType<typeof sweepStaleContextModeWorkers>; killed: number[]; stale: string };
  assert.deepEqual(sweep.killed, [101], 'only the stale owned root must be tree-killed');
  assert.equal(sweep.result.killed[0].pid, 101, 'kill report must name the stale owned root');
  assert.equal(sweep.result.killed[0].scriptPath, sweep.stale, 'identity must bind to the private temp script');
});

Then(/^fresh and unrelated runtime processes are preserved$/, function (this: ContextModeWorld) {
  const sweep = this.staleSweep as NonNullable<ContextModeWorld['staleSweep']> & { killed: number[] };
  assert.equal(sweep.killed.includes(102), false, 'fresh owned worker must remain alive');
  assert.equal(sweep.killed.includes(103), false, 'unrelated python must never be selected');
});

When(/^the process APIs are unavailable$/, function (this: ContextModeWorld) {
  this.staleSweep = sweepStaleContextModeWorkers({ listProcesses: () => { throw new Error('missing process API'); } });
});

Then(/^SessionStart self-heal fails open without killing a process$/, function (this: ContextModeWorld) {
  const result = this.staleSweep as ReturnType<typeof sweepStaleContextModeWorkers>;
  assert.equal(result.failOpen, true, 'process API failure must fail open');
  assert.deepEqual(result.killed, [], 'fail-open branch must not kill any process');
  assert.match(result.skipped[0], /missing process API/, 'diagnostic must preserve the cause');
});

When(/^a bounded self-heal sweep receives too many stale owned workers$/, function (this: ContextModeWorld) {
  const now = Date.now();
  const snapshot = Array.from({ length: 4 }, (_, index) => {
    const script = path.join(this.tempDir, `.ctx-mode-cap-${index}`, 'script');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, 'owned');
    fs.utimesSync(script, new Date(now - 20 * 60 * 1000), new Date(now - 20 * 60 * 1000));
    return { pid: 200 + index, commandLine: `node tools/context-mode-setup/worker.ts --worker-script ${script}` };
  });
  const killed: number[] = [];
  this.staleSweep = sweepStaleContextModeWorkers({ snapshot, nowMs: now, candidateCap: 2, killTree: pid => { killed.push(pid); } });
  (this.staleSweep as ReturnType<typeof sweepStaleContextModeWorkers> & { killedPids?: number[] }).killedPids = killed;
});

Then(/^it kills only the capped roots and reports the untouched remainder$/, function (this: ContextModeWorld) {
  const result = this.staleSweep as ReturnType<typeof sweepStaleContextModeWorkers> & { killedPids: number[] };
  assert.deepEqual(result.killedPids, [200, 201], 'candidate cap must bound kill calls');
  assert.match(result.skipped.join('\n'), /candidate cap 2 reached; 2 owned stale worker\(s\) left untouched/, 'cap skip must be explicit');
});

When(/^a bounded self-heal sweep reaches its deadline before a second kill$/, function (this: ContextModeWorld) {
  const now = Date.now();
  const snapshot = [0, 1].map(index => {
    const script = path.join(this.tempDir, `.ctx-mode-deadline-${index}`, 'script');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, 'owned');
    fs.utimesSync(script, new Date(now - 20 * 60 * 1000), new Date(now - 20 * 60 * 1000));
    return { pid: 300 + index, commandLine: `node tools/context-mode-setup/worker.ts --worker-script ${script}` };
  });
  const ticks = [now, now, now + 5_001];
  const killed: number[] = [];
  this.staleSweep = sweepStaleContextModeWorkers({ snapshot, nowMs: now, deadlineMs: 5_000, clock: () => ticks.shift() ?? now + 5_001, killTree: pid => { killed.push(pid); } });
  (this.staleSweep as ReturnType<typeof sweepStaleContextModeWorkers> & { killedPids?: number[] }).killedPids = killed;
});

Then(/^it skips the remaining root with a deadline diagnostic$/, function (this: ContextModeWorld) {
  const result = this.staleSweep as ReturnType<typeof sweepStaleContextModeWorkers> & { killedPids: number[] };
  assert.deepEqual(result.killedPids, [300], 'deadline must prevent the second kill');
  assert.match(result.skipped.join('\n'), /sweep deadline 5000ms reached; 1 selected owned stale worker\(s\) left untouched/, 'deadline skip must be explicit');
});

When(/^a context-mode installer worker starts on POSIX$/, function (this: ContextModeWorld) {
  this.workerSpawnOptions = installerSpawnOptions();
});

Then(/^its installer stays in the owned worker process group$/, function (this: ContextModeWorld) {
  assert.equal(this.workerSpawnOptions.detached, false, 'installer must inherit the detached outer worker group');
  assert.equal(this.workerSpawnOptions.stdio, 'ignore', 'worker remains non-interactive');
  assert.equal(this.workerSpawnOptions.env.CI, '1', 'installer keeps non-interactive environment');
});
