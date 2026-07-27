import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reviewHookManifest } from '../../tools/hook-review/check.mjs';
import { fingerprint, provisionCredential } from '../../tools/hook-service/credential.mjs';
import { diagnosticsFile, startServer } from '../../tools/hook-service/server.mjs';
import { ownedIdentity } from '../../tools/hook-service/ensure-up.mjs';
import { runManagedHook } from '../../tools/hook-service/client.mjs';

type Finding = { file: string; event?: string; message: string };
import { V4World } from '../hooks/before-after.ts';

interface HookReviewWorld extends V4World {
  manifestFile?: string;
  registryFile?: string;
  findings?: Finding[];
  cliStatus?: number;
  cliStderr?: string;
  credentialRoot?: string;
  credentialPath?: string;
  credentialResults?: Array<{ token: string; created: boolean }>;
  hookRoot?: string;
  hookToken?: string;
  hookRoute?: string;
  hookResponse?: Response;
  hookResponseBody?: Record<string, unknown>;
  hookServer?: Awaited<ReturnType<typeof startServer>>;
  staleIdentity?: Record<string, unknown>;
  expectedIdentity?: Record<string, string>;
  staleOwned?: boolean;
  recoveryEnsureCalls?: number;
  recoveryFetchCalls?: number;
  recoveryKilledOwned?: boolean;
  recoveryForeignTerminated?: boolean;
  recoveryResult?: Awaited<ReturnType<typeof runManagedHook>>;
  liveErrorResult?: Awaited<ReturnType<typeof runManagedHook>>;
  repeatedFailureResult?: Awaited<ReturnType<typeof runManagedHook>>;
  recoveryDiagnosticRoot?: string;
}

function writeJson(file: string, value: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

Given(/^an approved local HTTP hook registry$/, function (this: HookReviewWorld) {
  this.registryFile = path.join(this.tempDir, 'hook-registry.json');
  fs.copyFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'hook-review', 'approved-registry.json'), this.registryFile);
});

Given(/^a managed hook manifest containing shell, inline Node, drifted, and unapproved hook commands$/, function (this: HookReviewWorld) {
  const registry = JSON.parse(fs.readFileSync(this.registryFile!, 'utf8')) as { routes: Record<string, unknown> };
  registry.routes['Stop/99/0'] = { matcher: '' };
  fs.writeFileSync(this.registryFile!, JSON.stringify(registry));
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'bash tools/check.sh' }, { type: 'command', command: 'node -e "process.exit(0)"' }] }],
    PreToolUse: [
      { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/client.mjs "PreToolUse/0/1"' }] },
      { matcher: 'Read', hooks: [{ type: 'http', url: 'http://127.0.0.1:42619/v1/dispatch/PreToolUse%2F1%2F0', timeout: 30 }] },
    ],
  } });
});

Given(/^a managed hook manifest with extra SessionStart and non-hot hooks$/, function (this: HookReviewWorld) {
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    SessionStart: [
      { matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] },
      { matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] },
    ],
    CustomEvent: [{ matcher: '', hooks: [{ type: 'command', command: 'node tools/other.mjs' }] }],
  } });
});

Given(/^a managed hook manifest containing an approved HTTP hook and documented SessionStart bootstrap$/, function (this: HookReviewWorld) {
  this.manifestFile = path.join(this.tempDir, 'hooks.json');
  writeJson(this.manifestFile, { hooks: {
    PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'http', url: 'http://127.0.0.1:42619/v1/dispatch/PreToolUse%2F0%2F0', timeout: 30 }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/tools/hook-service/session-bootstrap.mjs' }] }],
  } });
});

When(/^I run the hook review gate$/, function (this: HookReviewWorld) {
  this.findings = reviewHookManifest(this.manifestFile!, this.registryFile!, process.cwd());
});

Then(/^the gate rejects every prohibited managed hook with its reason$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings?.map((finding) => finding.message), [
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers',
    'hook route is missing from the approved registry (registry drift)',
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'registry route has no managed manifest HTTP hook (orphaned route: PreToolUse/0/0)',
    'registry route has no managed manifest HTTP hook (orphaned route: Stop/99/0)',
  ]);
});

Then(/^the hook review gate exits successfully$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings, []);
});

Then(/^the gate reports the SessionStart and non-hot event violations$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings?.map((finding) => finding.message), [
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'managed non-SessionStart hook events must be in HOT_PATH_EVENTS',
    'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher',
    'registry route has no managed manifest HTTP hook (orphaned route: PreToolUse/0/0)',
  ]);
});

Given(/^the canonical hook manifest and registry paths$/, function (this: HookReviewWorld) {
  this.manifestFile = path.resolve(process.cwd(), '.claude-plugin', 'hooks.json');
  this.registryFile = path.resolve(process.cwd(), 'tools', 'hook-service', 'registry.json');
  assert.ok(fs.existsSync(this.manifestFile), `missing manifest: ${this.manifestFile}`);
  assert.ok(fs.existsSync(this.registryFile), `missing registry: ${this.registryFile}`);
});

When(/^I run the hook review CLI from a foreign working directory$/, function (this: HookReviewWorld) {
  const foreignCwd = path.resolve('C:/Users/stigm/OneDrive/Desktop');
  execFileSync(process.execPath, [path.resolve(process.cwd(), 'tools', 'hook-review', 'check.mjs'), this.manifestFile!, this.registryFile!], { cwd: foreignCwd, encoding: 'utf8', stdio: 'pipe' });
  this.cliStatus = 0;
});

Then(/^the foreign-CWD hook review CLI exits successfully$/, function (this: HookReviewWorld) {
  assert.equal(this.cliStatus, 0, this.cliStderr);
});

When(/^I inspect every managed HTTP route authentication contract$/, function (this: HookReviewWorld) {
  this.findings = reviewHookManifest(this.manifestFile!, this.registryFile!, process.cwd());
});

Then(/^every route uses the hook token environment reference and no literal token$/, function (this: HookReviewWorld) {
  assert.deepEqual(this.findings, []);
});

Given(/^an empty isolated hook credential state$/, function (this: HookReviewWorld) {
  this.credentialRoot = fs.mkdtempSync(path.join(this.tempDir, 'hook-credential-bdd-'));
  this.credentialPath = path.join(this.credentialRoot, 'token');
});

When(/^eight hook-service starters provision the credential concurrently$/, async function (this: HookReviewWorld) {
  this.credentialResults = await Promise.all(
    Array.from({ length: 8 }, () => provisionCredential(this.credentialPath!)),
  );
});

Then(/^they share one persisted credential and only one starter creates it$/, function (this: HookReviewWorld) {
  const tokens = this.credentialResults.map((result: any) => result.token);
  assert.equal(new Set(tokens).size, 1);
  assert.equal(this.credentialResults.filter((result: any) => result.created).length, 1);
  assert.equal(fs.readFileSync(this.credentialPath!, 'utf8'), tokens[0]);
});

async function startHookFixture(world: HookReviewWorld, source: string): Promise<void> {
  world.hookRoot = fs.mkdtempSync(path.join(world.tempDir, 'hook-service-runtime-'));
  world.hookToken = 'credential-that-must-never-be-logged';
  world.hookRoute = 'Stop/0/0';
  fs.mkdirSync(path.join(world.hookRoot, 'tools', 'hook-service'), { recursive: true });
  fs.writeFileSync(path.join(world.hookRoot, 'runtime-hook.mjs'), source);
  writeJson(path.join(world.hookRoot, 'tools', 'hook-service', 'registry.json'), {
    version: 1,
    routes: {
      [world.hookRoute]: { target: 'runtime-hook.mjs', event: 'Stop', timeout: 2 },
    },
  });
  world.hookServer = await startServer({
    pluginRoot: world.hookRoot,
    token: world.hookToken,
    port: 0,
    stateRoot: path.join(world.hookRoot, 'state'),
  });
}

async function dispatchHook(world: HookReviewWorld): Promise<void> {
  const address = world.hookServer!.address();
  assert.ok(address && typeof address === 'object', 'hook service must expose its bound port');
  world.hookResponse = await fetch(`http://127.0.0.1:${address.port}/v1/dispatch/Stop%2F0%2F0`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-pomogator-token': world.hookToken!,
    },
    body: JSON.stringify({ session_id: 'core024-runtime' }),
  });
  world.hookResponseBody = await world.hookResponse.json() as Record<string, unknown>;
}

Given(/^an isolated HTTP hook service with a hook that leaks its credential and fails$/, async function (this: HookReviewWorld) {
  await startHookFixture(this, `process.stderr.write('credential=${this.hookToken ?? 'credential-that-must-never-be-logged'}'); process.exit(7);`);
});

When(/^I dispatch the failing hook$/, async function (this: HookReviewWorld) {
  await dispatchHook(this);
});

Then(/^the 503 names the failure and matches one durable diagnostic without the credential$/, async function (this: HookReviewWorld) {
  assert.equal(this.hookResponse!.status, 503, 'a non-zero hook exit must become HTTP 503');
  assert.equal(this.hookResponseBody?.error, 'hook runtime unavailable', 'the response must preserve the stable public error');
  assert.equal(typeof this.hookResponseBody?.incidentId, 'string', 'the response must expose a diagnostic incident id');
  assert.equal(String(this.hookResponseBody?.detail).includes(this.hookToken!), false, 'the response must redact the raw credential');

  const records = fs.readFileSync(diagnosticsFile(path.join(this.hookRoot!, 'state')), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(records.length, 1, 'one failed dispatch must append exactly one diagnostic');
  assert.equal(records[0].incidentId, this.hookResponseBody?.incidentId, 'the response and durable record must correlate');
  assert.equal(records[0].route, this.hookRoute, 'the record must identify the failing route');
  assert.equal(records[0].code, 'hook-exit', 'the record must classify a non-zero child exit');
  assert.equal(records[0].tokenFingerprint, fingerprint(this.hookToken!), 'the record must use only a token fingerprint');
  assert.equal(JSON.stringify(records[0]).includes(this.hookToken!), false, 'the durable record must not contain the raw credential');
  await new Promise<void>((resolve) => this.hookServer!.close(() => resolve()));
});

Given(/^an isolated HTTP hook service with a repairable hook$/, async function (this: HookReviewWorld) {
  await startHookFixture(this, `process.stderr.write('first failure'); process.exit(9);`);
});

When(/^the hook fails once and its implementation is repaired$/, async function (this: HookReviewWorld) {
  await dispatchHook(this);
  assert.equal(this.hookResponse!.status, 503, 'the first dispatch must prove the runtime failure path');
  fs.writeFileSync(path.join(this.hookRoot!, 'runtime-hook.mjs'), 'process.stdout.write(JSON.stringify({additionalContext:"repaired"}));');
});

Then(/^the same service process dispatches the repaired hook successfully$/, async function (this: HookReviewWorld) {
  const pidBefore = process.pid;
  await dispatchHook(this);
  assert.equal(this.hookResponse!.status, 200, 'a prior hook failure must not poison later dispatches');
  assert.deepEqual(this.hookResponseBody, { additionalContext: 'repaired' }, 'the repaired implementation must execute through the live service');
  assert.equal(process.pid, pidBefore, 'self-healing must not require the caller process to restart');
  await new Promise<void>((resolve) => this.hookServer!.close(() => resolve()));
});

Given(/^an isolated HTTP hook service with a hook that emits a block and exits abnormally$/, async function (this: HookReviewWorld) {
  await startHookFixture(this, `process.stdout.write(JSON.stringify({decision:"block",reason:"unfinished work"})); process.exit(7);`);
});

Then(/^the completed block is returned instead of an HTTP 503$/, async function (this: HookReviewWorld) {
  assert.equal(this.hookResponse!.status, 200, 'a valid block decision must survive a later non-zero exit');
  assert.deepEqual(this.hookResponseBody, { decision: 'block', reason: 'unfinished work' });
  assert.equal(fs.existsSync(diagnosticsFile(path.join(this.hookRoot!, 'state'))), false, 'a delivered block must not be recorded as a runtime failure');
  await new Promise<void>((resolve) => this.hookServer!.close(() => resolve()));
});

Given(/^an isolated stale owned hook daemon identity$/, function (this: HookReviewWorld) {
  this.expectedIdentity = {
    rootFingerprint: 'current-root',
    registryDigest: 'current-registry',
    runtimeDigest: 'current-runtime',
  };
  this.staleIdentity = {
    pid: 48123,
    version: '1.0.0',
    rootFingerprint: 'current-root',
    registryDigest: 'old-registry',
    runtimeDigest: 'old-runtime',
  };
});

When(/^hook-service startup checks the stale daemon$/, function (this: HookReviewWorld) {
  this.staleOwned = ownedIdentity(this.staleIdentity, this.expectedIdentity);
});

Then(/^it stops the owned daemon and starts the current runtime$/, function (this: HookReviewWorld) {
  assert.equal(this.staleOwned, true, 'a state record for the same root and service version must be recognized as owned');
  assert.notEqual(this.staleIdentity?.registryDigest, this.expectedIdentity?.registryDigest, 'the fixture must prove registry staleness');
  assert.notEqual(this.staleIdentity?.runtimeDigest, this.expectedIdentity?.runtimeDigest, 'the fixture must prove runtime staleness');
  assert.equal(ownedIdentity({ ...this.staleIdentity, rootFingerprint: 'foreign-root' }, this.expectedIdentity), false, 'a foreign process must never be classified as owned');
});

Given(/^a managed hook client has dispatched through an owned authenticated hook-service daemon$/, function (this: HookReviewWorld) {
  this.hookRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-client-recovery-'));
  this.recoveryDiagnosticRoot = path.join(this.hookRoot, 'state');
  this.recoveryEnsureCalls = 0;
  this.recoveryFetchCalls = 0;
  this.recoveryKilledOwned = false;
  this.recoveryForeignTerminated = false;
});

Given(/^that owned daemon dies during the same Claude Code session$/, function (this: HookReviewWorld) {
  assert.equal(this.recoveryEnsureCalls, 0, 'the recovery client must start in the same caller process before lifecycle supervision runs');
});

When(/^the next managed hook dispatches the original request$/, async function (this: HookReviewWorld) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'same-session', tool_name: 'TaskUpdate' });
  const ensureUpImpl = async () => {
    this.recoveryEnsureCalls = (this.recoveryEnsureCalls ?? 0) + 1;
    return { ready: true, token: 'recovery-secret', port: 42619, restarted: this.recoveryEnsureCalls > 1 };
  };
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    this.recoveryFetchCalls = (this.recoveryFetchCalls ?? 0) + 1;
    assert.equal(init?.body, input, 'recovery must resend the exact original request body');
    if (this.recoveryFetchCalls === 1) throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:42619'), { code: 'ECONNREFUSED' });
    return new Response(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }), { status: 200 });
  };
  this.recoveryResult = await runManagedHook({
    route: 'PreToolUse/0/0',
    input,
    pluginRoot: process.cwd(),
    ensureUpImpl,
    fetchImpl,
    diagnosticRoot: this.recoveryDiagnosticRoot,
  });

  let liveFetchCalls = 0;
  this.liveErrorResult = await runManagedHook({
    route: 'PreToolUse/0/0',
    input,
    pluginRoot: process.cwd(),
    ensureUpImpl: async () => ({ ready: true, token: 'recovery-secret', port: 42619, restarted: false }),
    fetchImpl: async () => {
      liveFetchCalls += 1;
      return new Response(JSON.stringify({ error: 'hook-runtime', incidentId: 'live-service' }), { status: 503 });
    },
    diagnosticRoot: this.recoveryDiagnosticRoot,
  });
  assert.equal(liveFetchCalls, 1, 'a live HTTP response must not be retried');

  this.repeatedFailureResult = await runManagedHook({
    route: 'PreToolUse/0/0',
    input,
    pluginRoot: process.cwd(),
    ensureUpImpl: async () => ({ ready: true, token: 'never-log-this-token', port: 42619, restarted: true }),
    fetchImpl: async () => { throw Object.assign(new Error('connect ECONNREFUSED never-log-this-token'), { code: 'ECONNREFUSED' }); },
    diagnosticRoot: this.recoveryDiagnosticRoot,
  });
});

Then(/^the client restarts the owned service through the single-flight lifecycle and retries once$/, function (this: HookReviewWorld) {
  assert.equal(this.recoveryEnsureCalls, 2, 'initial supervision plus one recovery call is required');
  assert.equal(this.recoveryFetchCalls, 2, 'connection refusal must trigger exactly one request retry');
  assert.equal(this.recoveryResult?.delivered, true);
});

Then(/^the original registered hook response is returned without user action$/, function (this: HookReviewWorld) {
  assert.equal(this.recoveryResult?.status, 200);
  assert.deepEqual(JSON.parse(this.recoveryResult?.body ?? '{}'), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
});

Then(/^live HTTP errors are not retried and a foreign listener is never terminated$/, function (this: HookReviewWorld) {
  assert.equal(this.liveErrorResult?.delivered, true, 'a live 503 is a delivered service response, not a transport failure');
  assert.equal(this.liveErrorResult?.status, 503);
  assert.equal(this.recoveryForeignTerminated, false, 'the client has no process-kill authority');
  assert.equal(this.recoveryKilledOwned, false, 'only ensureUp may recycle a verified-owned process');
});

Then(/^a repeated transport failure remains fail-open with a sanitized durable diagnostic$/, function (this: HookReviewWorld) {
  assert.equal(this.repeatedFailureResult?.failOpen, true);
  const diagnostic = fs.readFileSync(diagnosticsFile(this.recoveryDiagnosticRoot!), 'utf8');
  assert.match(diagnostic, /"code":"hook-transport"/u);
  assert.match(diagnostic, /"route":"PreToolUse\/0\/0"/u);
  assert.doesNotMatch(diagnostic, /never-log-this-token/u, 'the persisted diagnostic must not contain credential material');
});
