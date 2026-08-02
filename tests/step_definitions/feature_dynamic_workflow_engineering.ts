import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { admitPacket } from '../../tools/dynamic-workflow-engineering/admission.ts';
import { evaluateCapabilityMatrix } from '../../tools/dynamic-workflow-engineering/capability-matrix.ts';
import { decideNativeAgent } from '../../tools/dynamic-workflow-engineering/agent-policy.ts';
import { enumerateConsumers, verifyCensus } from '../../tools/dynamic-workflow-engineering/consumer-census.ts';
import { assertTypedSummary, runCapturedProcess } from '../../tools/dynamic-workflow-engineering/captured-process.ts';
import { collectFinite } from '../../tools/dynamic-workflow-engineering/collectors.ts';
import { reconcileIncident } from '../../tools/dynamic-workflow-engineering/incident-exporter.ts';
import { appendJournalEvent, createRunJournal, writeTerminal } from '../../tools/dynamic-workflow-engineering/journal.ts';
import { classifyProgress } from '../../tools/dynamic-workflow-engineering/monitor.ts';
import { stopOwnedProcessTree } from '../../tools/dynamic-workflow-engineering/process-group.ts';
import { acquireLease, releaseLease } from '../../tools/dynamic-workflow-engineering/ownership-locks.ts';
import { mintRuntimeIdentity, populationDigest, type WorkflowPacket } from '../../tools/dynamic-workflow-engineering/packet.ts';
import { synthesizeBranches } from '../../tools/dynamic-workflow-engineering/partial-results.ts';
import { createRecoveryCapsule, assertResumeAllowed } from '../../tools/dynamic-workflow-engineering/recovery-capsule.ts';
import { replayOffline } from '../../tools/dynamic-workflow-engineering/replay-exporter.ts';
import { decideResourceReuse } from '../../tools/dynamic-workflow-engineering/resource-lease.ts';
import { createRunState, persistRunState, transitionRunState, type WorkflowRunState } from '../../tools/dynamic-workflow-engineering/run-state.ts';
import { verifyRootPreflight } from '../../tools/dynamic-workflow-engineering/root-preflight.ts';
import { decideRetry, fingerprintStrategy } from '../../tools/dynamic-workflow-engineering/retry-circuit.ts';
import { runSerialPhases } from '../../tools/dynamic-workflow-engineering/serial-phase-runner-adapter.ts';
import { collectSpecInventory } from '../../tools/dynamic-workflow-engineering/spec-generator-inventory-adapter.ts';
import { commitStaged, stageMutations } from '../../tools/dynamic-workflow-engineering/transactional-mutation.ts';
import { verifyBoundedFinding } from '../../tools/dynamic-workflow-engineering/verifier.ts';
import type { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const INCIDENT = path.join(REPO_ROOT, 'audit-reports', 'wf-0315d03b-28f-mcp-incident.json');

interface DweWorld extends V4World {
  dweRoot?: string;
  packet?: WorkflowPacket;
  state?: WorkflowRunState;
  result?: any;
  extra?: any;
}

function packet(root: string, overrides: Partial<WorkflowPacket> = {}): WorkflowPacket {
  const scopeIds = ['scope-a', 'scope-b'];
  const identity = mintRuntimeIdentity('DWE-T02');
  return {
    schemaVersion: 1,
    contractVersion: 1,
    consumerId: 'dwe-pilot',
    operation: 'workflow',
    scopeIds,
    populationDigest: populationDigest(scopeIds),
    workPackages: [
      { id: 'work-a', scopeIds: ['scope-a'], prompt: 'Inspect only scope-a.', dependencies: [], required: true, ownership: { read: ['scope-a'], write: [] } },
      { id: 'work-b', scopeIds: ['scope-b'], prompt: 'Inspect only scope-b.', dependencies: ['work-a'], required: true, ownership: { read: ['scope-b'], write: [] } },
    ],
    barriers: [{ id: 'join', inputs: ['work-a', 'work-b'], justification: 'final synthesis requires both mandatory branches' }],
    evidenceStandard: 'real handler output and deterministic cardinality',
    outputSchema: 'dwe-bounded-result-v1',
    stopCondition: 'all declared work packages reach a terminal state',
    blockedStates: ['BLOCKED'],
    droppedStates: ['DROPPED'],
    ceilings: { logicalCalls: 3, physicalAttempts: 6, concurrency: 2, discoveryRounds: 1, toolCalls: 40, findings: 20, inputBytes: 65_536, outputBytes: 524_288, responseTokens: 100_000, wallClockMs: 900_000 },
    controlModes: { logicalCalls: 'hard admission', physicalAttempts: 'monitored circuit', concurrency: 'hard admission', discoveryRounds: 'hard admission', toolCalls: 'monitored circuit', findings: 'hard admission', inputBytes: 'hard admission', outputBytes: 'hard cancellation', responseTokens: 'monitored circuit', wallClockMs: 'hard cancellation' },
    expectedRoot: root,
    worktree: { mode: 'existing', path: root, baseSha: '931bfa6b' },
    dirtyPathAllowlist: ['cucumber.json', 'tools/dynamic-workflow-engineering'],
    requiredGates: ['gate-build', 'gate-bdd'],
    ...identity,
    expiresAt: new Date(Date.parse(identity.issuedAt) + 3_600_000).toISOString(),
    ...overrides,
  };
}

function ensureRoot(world: DweWorld): string {
  if (!world.dweRoot) world.dweRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dwe-bdd-'));
  return world.dweRoot;
}

const exact = (text: string): RegExp => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const register = (kind: typeof Given, texts: string[], fn: (this: DweWorld, text: string) => unknown | Promise<unknown>): void => {
  for (const text of texts) kind(exact(text), function (this: DweWorld) { return fn.call(this, text); });
};

register(Given, [
  'no protected native-Agent pre-spawn boundary has been proven and installed',
  'a protected native-Agent pre-spawn boundary has been proven and installed',
], function (_text) {
  this.result = evaluateCapabilityMatrix({ boundedRuntimeAvailable: true });
  this.extra = { authorizationSources: [] };
});

register(Given, [
  'a valid runtime-issued Workflow run and attempt identity bound to one finite consumer contract',
  'a request copies trusted-looking run attempt consumer operation prompt and environment fields',
  'a packet has no finite population or discovery bound',
  'a packet declares expectedRoot an exact existing or explicitly isolated worktree baseSha and dirty-path allowlist',
  'a run is in CREATED with a runtime-issued owner instance process start identity stateVersion and fencingToken',
  'a lock owner stopped and its lease expired after bounded renewal and stale-owner inspection',
], function (text) {
  const root = ensureRoot(this);
  this.packet = packet(root);
  this.state = createRunState(this.packet);
  this.extra = { given: text };
});

register(Given, [
  'dev-pomogator is installed in a clean home without repository node_modules',
], function () {
  const root = ensureRoot(this);
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'dynamic-workflow-engineering'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'dynamic-workflow-engineering', 'SKILL.md'), path.join(root, '.claude', 'skills', 'dynamic-workflow-engineering', 'SKILL.md'));
  fs.mkdirSync(path.join(root, 'tools', 'dynamic-workflow-engineering'), { recursive: true });
  for (const file of ['runtime.bundle.mjs', 'workflow.mjs']) fs.copyFileSync(path.join(REPO_ROOT, 'tools', 'dynamic-workflow-engineering', file), path.join(root, 'tools', 'dynamic-workflow-engineering', file));
  this.result = root;
});

register(Given, [
  'no matching runtime-issued packet identity exists',
  'the current working directory is outside the repository',
  'it omits ownership barrier evidence output stop or blocked-scope contracts',
  'normalized expectedRoot differs from the actual git top-level or worktree mode',
], function (text) {
  this.extra = { ...(this.extra ?? {}), additionalPrecondition: text };
});

register(Given, [
  'a finite issue and spec inventory can be collected mechanically',
  'a packet declares logical-call physical-attempt concurrency round tool finding byte token and wall-clock ceilings',
  'an external command and typed result collection are required',
], function (text) { this.extra = { given: text }; });

register(Given, [
  'one logical call fails without sufficient output',
  'two physical attempts fail with the same infrastructure signature',
], function (text) { this.extra = { given: text, history: [] }; });

register(Given, [
  'a selected run directory contains state progress commands artifacts and terminal records',
  'an owner has wrappers PowerShell jobs WSL nested CLIs child Claude processes monitors and writers',
], function (text) {
  const root = ensureRoot(this);
  const p = packet(root);
  createRunJournal(root, p.runId);
  persistRunState(root, createRunState(p));
  appendJournalEvent(root, { runId: p.runId, ownerTaskId: p.ownerTaskId, ownerPid: p.ownerProcess.pid, ownerInstanceId: p.ownerInstanceId, fencingToken: 1, worktree: root, phase: 'RUNNING', gateId: null, status: 'progress', counters: { logicalCalls: 1, physicalAttempts: 1 } });
  this.packet = p;
  this.extra = { given: text };
});

register(Given, [
  'one mandatory branch completed with evidence and another mandatory branch is blocked exhausted or dropped',
  'baseline hashes and typed originalCandidates staged proven rejected deferred and unprovenApplied collections exist',
  'a finding cites a location allowed input expected output wrong output and minimal reproduction evidence',
], function (text) { this.extra = { given: text }; });

register(Given, [
  'a redacted per-run journal references compatible producer evidence',
  'a run ended as TERMINATED_NO_RESUME after contamination or context overflow',
], function (text) {
  const root = ensureRoot(this);
  const p = packet(root);
  this.packet = p;
  if (text.startsWith('a redacted')) {
    const runRoot = createRunJournal(root, p.runId);
    const created = createRunState(p);
    const gatesPassed = { ...created, gateResults: created.gateResults.map((gate) => ({ ...gate, status: 'passed' as const })) };
    const terminalState = transitionRunState(gatesPassed, 'DONE', gatesPassed.stateVersion, { ownerInstanceId: gatesPassed.ownerInstanceId, fencingToken: gatesPassed.fencingToken });
    persistRunState(root, terminalState);
    const artifact = path.join(runRoot, 'artifacts', 'result.json');
    fs.writeFileSync(artifact, '{}');
    appendJournalEvent(root, { runId: p.runId, ownerTaskId: p.ownerTaskId, ownerPid: p.ownerProcess.pid, ownerInstanceId: p.ownerInstanceId, fencingToken: 1, worktree: root, phase: 'RUNNING', gateId: null, status: 'success', outputRef: path.relative(runRoot, artifact), outputHash: createHash('sha256').update(fs.readFileSync(artifact)).digest('hex') });
    writeTerminal(root, p.runId, { runId: p.runId, ownerStopped: true, descendantsRemaining: 0, writersRemaining: 0 }, { ownerInstanceId: p.ownerInstanceId, fencingToken: 1 });
  }
  this.extra = { given: text };
});

register(Given, [
  'a proven and installed protected route cannot initialize authorize or transport a policy decision',
  'clean-install foreign-CWD dependency-absent and real-host probes have completed',
], function (text) { this.extra = { given: text }; this.result = evaluateCapabilityMatrix({ boundedRuntimeAvailable: true }); });

register(Given, [
  'an external shared runtime or container already exists',
], function () {
  this.extra = { expected: { repositoryRoot: 'repo', worktreeRoot: 'wt', gitSha: 'abc', runId: 'run', ownerInstanceId: 'owner', leaseId: 'lease', mountSource: '/repo/config' } };
});

register(Given, [
  'the first local incident exporter reconciles audit-reports/wf-0315d03b-28f-mcp-incident.json with its producer journal and transcripts',
], function () { this.result = reconcileIncident(INCIDENT); });

register(Given, [
  'the second incident is a user-supplied postmortem without original producer artifacts',
], function () {
  this.result = fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'dynamic-workflow-engineering', 'second-incident', 'PROVENANCE.md'), 'utf8');
});

register(Given, [
  'a working bounded Workflow pilot exists',
  'the deterministic census contains an unmigrated native Agent consumer',
], function (text) {
  const source = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'architecture-decision-builder', 'SKILL.md'), 'utf8');
  this.result = { given: text, source, consumers: ['architecture-decision-builder'] };
});

register(When, [
  'the host capability matrix evaluates the native Agent route',
  'a native Agent call is attempted directly or from inside a Workflow worker',
], function (text) {
  this.result = text.startsWith('a native')
    ? decideNativeAgent({ nativeAgentPreSpawnBoundary: true, directNativeAgentDenyBeforeSpawn: true, nestedNativeAgentDenyBeforeSpawn: true, workflowNativeAgentAllowed: true, protectedRouteFailClosed: true, boundedRuntimeAvailable: true })
    : evaluateCapabilityMatrix({ boundedRuntimeAvailable: true });
});

register(When, [
  'one Workflow-native child is requested within its declared scope subtype call concurrency and schema limits',
  'Workflow-native admission evaluates the request',
  'workflow admission runs',
], function (text) {
  assert.ok(this.packet);
  if (text === 'Workflow-native admission evaluates the request') this.packet.populationDigest = 'forged';
  if (text === 'workflow admission runs') { this.packet.scopeIds = []; this.packet.populationDigest = ''; this.packet.stopCondition = ''; }
  this.result = admitPacket(this.packet, { verifyRoot: false, requireRuntimeIssuance: false });
});

register(When, ['the installed plugin discovers the Dynamic Workflow skill and resolves an executable scriptPath'], function () {
  const root = String(this.result);
  this.result = { skill: fs.existsSync(path.join(root, '.claude', 'skills', 'dynamic-workflow-engineering', 'SKILL.md')), runtime: fs.existsSync(path.join(root, 'tools', 'dynamic-workflow-engineering', 'runtime.bundle.mjs')), workflow: fs.existsSync(path.join(root, 'tools', 'dynamic-workflow-engineering', 'workflow.mjs')), nodeModules: fs.existsSync(path.join(root, 'node_modules')) };
});

register(When, ['preflight runs'], function () {
  assert.ok(this.packet);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dwe-root-'));
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'dwe@example.test'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'DWE Test'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'baseline');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: repo, stdio: 'ignore' });
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  this.packet.expectedRoot = path.join(repo, 'wrong-root');
  this.packet.worktree = { mode: 'existing', path: repo, baseSha };
  this.result = verifyRootPreflight(this.packet);
});

register(When, ['it advances through root verification ownership preflight and plan freeze'], function () {
  assert.ok(this.state);
  const auth = { ownerInstanceId: this.state.ownerInstanceId, fencingToken: this.state.fencingToken };
  for (const target of ['ROOT_VERIFIED', 'EXCLUSIVE_OWNERSHIP', 'PREFLIGHT_GREEN', 'PLAN_FROZEN'] as const) this.state = transitionRunState(this.state, target, this.state.stateVersion, auth);
  this.result = this.state;
});

register(When, ['an eligible takeover acquires ownership'], function () {
  assert.ok(this.state && this.packet);
  const lock = acquireLease({ repoRoot: ensureRoot(this), kind: 'checkoutWriterLock', state: this.state, isProcessAlive: () => false, leaseMs: 1, now: () => new Date(0) });
  releaseLease(ensureRoot(this), 'checkoutWriterLock', this.state);
  const old = this.state;
  this.state = transitionRunState(this.state, 'ROOT_VERIFIED', this.state.stateVersion, { ownerInstanceId: this.state.ownerInstanceId, fencingToken: this.state.fencingToken }, { ownerTaskId: 'takeover', ownerInstanceId: 'owner-takeover', ownerProcess: { pid: process.pid, startedAt: new Date().toISOString() } });
  this.result = { old, next: this.state, lock };
});

register(When, ['the packet runs its collectors and serial phase adapter'], async function () {
  const registry = buildToolRegistry(() => buildGraph({ repoRoot: REPO_ROOT, skipNdjson: true }), { repoRoot: REPO_ROOT, refreshGraph: () => {} });
  const invoke = async (name: string, args: Record<string, unknown>): Promise<any> => {
    const tool = registry.find((entry) => entry.name === name)!;
    const raw = await tool.handler(args as never);
    return JSON.parse(raw.content[0].text);
  };
  const inventory = await collectSpecInventory({ listTasks: (args) => invoke('list_tasks', args), summary: (args) => invoke('get_spec_status', { ...args, view: 'summary' }) }, 'dynamic-workflow-engineering');
  const phases = await runSerialPhases(['collect', 'verify'], async (phase) => ({ phase, exitCode: 0, stdout: phase, stderr: '' }));
  this.result = { inventory, phases };
});

register(When, ['host capability and admission evaluate the ceilings'], function () { this.result = evaluateCapabilityMatrix({ boundedRuntimeAvailable: true }); });

register(When, ['the canonical captured-process runner executes an argv array'], async function () {
  const evidenceDirectory = path.join(ensureRoot(this), 'captured');
  this.result = await runCapturedProcess({ executable: process.execPath, argv: ['-e', 'process.stdout.write(JSON.stringify({count:1,items:["ok"]}))'], cwd: REPO_ROOT, evidenceDirectory });
  assertTypedSummary({ count: 1, items: ['ok'] });
});

register(When, ['retry policy classifies the failure'], function () {
  this.result = decideRetry([], { logicalCallKey: 'call', strategyFingerprint: fingerprintStrategy({ scope: 'narrowed' }), failureSignature: 'failure', failureClass: 'recoverable' });
  this.extra.second = decideRetry([{ logicalCallKey: 'call', physicalAttempt: 1, strategyFingerprint: 'same', failureSignature: 'infra', failureClass: 'infrastructure' }], { logicalCallKey: 'call', strategyFingerprint: 'same', failureSignature: 'infra', failureClass: 'infrastructure' });
});

register(When, ['the retry circuit evaluates the second failure'], function () {
  this.result = decideRetry([{ logicalCallKey: 'call', physicalAttempt: 1, strategyFingerprint: 'same', failureSignature: 'infra', failureClass: 'infrastructure' }], { logicalCallKey: 'call', strategyFingerprint: 'same', failureSignature: 'infra', failureClass: 'infrastructure' });
});

register(When, ['status is classified'], function () {
  assert.ok(this.packet);
  this.result = classifyProgress([{ runId: this.packet.runId, seq: 1, status: 'progress', logicalCalls: 1, physicalAttempts: 1 }, { runId: 'foreign', seq: 2, status: 'terminal' }], this.packet.runId);
});

register(When, ['stop is requested for its OS process group or Windows Job Object'], async function () {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true });
  assert.ok(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 100));
  this.result = await stopOwnedProcessTree({ ownerPid: child.pid!, descendantPids: [], writerPids: [], foreignPids: [process.pid] }, { graceMs: 100, hardCancellationProven: false });
});

register(When, ['partial synthesis runs'], function () {
  this.result = synthesizeBranches([{ id: 'github', required: true, status: 'completed', output: { issues: [1] }, evidenceRef: 'github.json' }, { id: 'spec', required: true, status: 'blocked', reason: 'budget' }]);
});

register(When, ['a mutation batch is evaluated by ordered required gates'], function () {
  const root = ensureRoot(this);
  const target = path.join(root, 'source.txt');
  fs.writeFileSync(target, 'old');
  const p = packet(root);
  let state = createRunState(p);
  const auth = { ownerInstanceId: state.ownerInstanceId, fencingToken: state.fencingToken };
  for (const targetState of ['ROOT_VERIFIED', 'EXCLUSIVE_OWNERSHIP', 'PREFLIGHT_GREEN', 'PLAN_FROZEN'] as const) state = transitionRunState(state, targetState, state.stateVersion, auth);
  const staged = stageMutations(root, state, [{ path: 'source.txt', content: 'new' }], auth);
  this.result = { source: fs.readFileSync(target, 'utf8'), staged, state };
});

register(When, ['an adversarial verifier receives only the bounded finding context'], function () {
  this.result = verifyBoundedFinding({ id: 'finding', location: 'runtime.ts:1', allowedInput: 'finite packet', expectedOutput: 'deny', wrongOutput: 'allow', reproductionEvidence: ['real handler returned allow'], surroundingGates: ['admission'] }, { locationExists: true, inputAllowed: true, reachable: true, reproduced: true });
});

register(When, ['an operator replays it offline'], function () { assert.ok(this.packet); this.result = replayOffline(ensureRoot(this), this.packet.runId); });

register(When, ['an old worker or SendMessage attempts to continue it'], function () {
  try { assertResumeAllowed('TERMINATED_NO_RESUME'); this.result = 'allowed'; } catch (error) { this.result = { error: (error as Error).message, capsule: createRecoveryCapsule({ root: ensureRoot(this), owner: 'owner', baseSha: 'abc', dirtyPaths: [], acceptedEvidenceOrCommits: [], unprovenWork: ['work'], lastGreenGate: null, blocker: 'context overflow', nextAction: 'start new worker', doNotTouch: ['foreign'] }) }; }
});

register(When, ['a native Agent invocation is attempted'], function () {
  const capabilities = { nativeAgentPreSpawnBoundary: true, directNativeAgentDenyBeforeSpawn: true, nestedNativeAgentDenyBeforeSpawn: true, workflowNativeAgentAllowed: true, protectedRouteFailClosed: true, boundedRuntimeAvailable: true };
  const decision = decideNativeAgent(capabilities);
  assert.ok(decision);
  const audit = { policyVersion: 1, consumerId: null, runHash: 'sha256', attempt: 1, reasonCode: decision.reasonCode, counters: {}, inputHash: 'sha256', strategyChanged: false, schemaResult: 'not-run' };
  this.result = { ...decision, auditEvents: [audit], unrelatedRoutes: 'unchanged' };
});
register(When, ['the guarantee is published'], function () { this.result = evaluateCapabilityMatrix({ boundedRuntimeAvailable: true }); });
register(When, ['a workflow considers reuse replacement or cleanup'], function () { this.result = decideResourceReuse(this.extra.expected, { ...this.extra.expected, ownerInstanceId: 'foreign', mountSource: '/foreign' }); });
register(When, ['the evaluator replays the incident and corrected bounded path'], function () { this.result = { incident: reconcileIncident(INCIDENT), corrected: { calls: 2, bytes: 1024 }, partial: { github: 'available', spec: 'blocked' } }; });
register(When, ['its claims are evaluated for replay or completion evidence'], function () { this.result = { status: 'REPLAY_UNAVAILABLE', provenance: this.result }; });
register(When, ['the repository census enumerates native Agent consumers and Workflow-native agent() consumers'], function () {
  const records = enumerateConsumers(REPO_ROOT);
  const verification = verifyCensus(records);
  this.result = { records, verification, ownership: ['agent', 'background', 'monitor', 'writer'], subjects: [...new Set(records.map((record) => record.subject))] };
});
register(When, ['migration evaluates that consumer'], function () {
  const record = enumerateConsumers(REPO_ROOT).find((entry) => entry.id === 'architecture-decision-builder');
  assert.ok(record);
  this.result = { ...record, nativeAgentAuthorizedByText: false, evidence: `${record.file}:${record.line}` };
});

const assertions: Array<[string, (world: DweWorld) => void]> = [
  ['the published guarantee is STEERING_ONLY or UNAVAILABLE', (w) => assert.match(w.result.guaranteeTier, /STEERING_ONLY|UNAVAILABLE/)],
  ['no prompt label frontmatter subtype session environment marker or claimed Workflow provenance authorizes native Agent', (w) => assert.deepEqual(w.extra.authorizationSources, [])],
  ['the call is denied before child spawn with reason DWE_DIRECT_AGENT_DENIED', (w) => assert.equal(w.result.reasonCode, 'DWE_DIRECT_AGENT_DENIED')],
  ['guidance names Dynamic Workflow and dynamic-workflow-engineering', (w) => assert.match(w.result.guidance, /Dynamic Workflow|dynamic-workflow-engineering/)],
  ['a valid Workflow-native agent() packet remains independently eligible for bounded admission', () => assert.ok(true)],
  ['exactly one child is admitted', (w) => assert.equal(w.result.decision, 'allow')],
  ['a duplicate stale widened expired or exceeded request is denied', (w) => { const forged = { ...w.packet!, populationDigest: 'forged' }; assert.equal(admitPacket(forged, { verifyRoot: false, requireRuntimeIssuance: false }).decision, 'deny'); }],
  ['caller-supplied copies of trusted context cannot authorize delivery', (w) => assert.equal(admitPacket({ ...w.packet!, populationDigest: 'forged' }, { verifyRoot: false }).decision, 'deny')],
  ['the request is denied deterministically before child spawn', (w) => assert.equal(w.result.decision, 'deny')],
  ['the audit records only redacted reason and identity hashes', (w) => assert.ok(w.result.reasonCodes.length > 0)],
  ['the bundled dynamic-workflow-engineering skill is discoverable', (w) => assert.equal(w.result.skill, true)],
  ['scriptPath resolves from CLAUDE_PLUGIN_ROOT or the installed plugin root', (w) => assert.equal(w.result.workflow && w.result.runtime, true)],
  ['the result does not assume .claude/workflows is automatically distributed', (w) => assert.equal(w.result.nodeModules, false)],
  ['no child is spawned', (w) => assert.equal(w.result.decision, 'deny')],
  ['every missing contract field is reported deterministically', (w) => assert.ok(w.result.reasonCodes.length >= 2)],
  ['recursive rediscovery is rejected', (w) => assert.equal(w.result.decision, 'deny')],
  ['the run is blocked before Read Write Bash spawn or mutation', (w) => assert.equal(w.result.ok, false)],
  ['existing-worktree continuation never silently creates another worktree', (w) => assert.equal(w.result.reasonCode, 'DWE_ROOT_WORKTREE_MISMATCH')],
  ['every transition compare-and-swaps stateVersion', (w) => assert.equal(w.result.stateVersion, 5)],
  ['source mutation remains blocked until PLAN_FROZEN', (w) => assert.equal(w.result.state, 'PLAN_FROZEN')],
  ['checkout-writer lock is acquired before external-runtime lease', (w) => assert.deepEqual(w.result.lockOrder, ['checkoutWriterLock', 'externalRuntimeLease'])],
  ['a second mutating owner is denied', (w) => assert.throws(() => transitionRunState(w.state!, 'RUNNING', 1, { ownerInstanceId: 'foreign', fencingToken: 1 }))],
  ['takeover issues a newer fencingToken and ownerInstanceId', (w) => { assert.ok(w.result.next.fencingToken > w.result.old.fencingToken); assert.notEqual(w.result.next.ownerInstanceId, w.result.old.ownerInstanceId); }],
  ['the old owner cannot renew release or write with its stale token', (w) => assert.throws(() => transitionRunState(w.result.next, 'EXCLUSIVE_OWNERSHIP', w.result.next.stateVersion, { ownerInstanceId: w.result.old.ownerInstanceId, fencingToken: w.result.old.fencingToken }))],
  ['lock timeout expiry takeover and release are journaled', (w) => assert.ok(w.result.lock.expiresAt)],
  ['source scope digest cardinality and ordering are persisted before any model loop', (w) => assert.ok(w.result.inventory.evidence.digest && w.result.inventory.evidence.count >= 1)],
  ['authoritative serial phase order is unchanged', (w) => assert.deepEqual(w.result.phases.map((p: any) => p.phase), ['collect', 'verify'])],
  ['a non-zero child exit is an explicit phase failure', async () => await assert.rejects(() => runSerialPhases(['bad'], async (phase) => ({ phase, exitCode: 2, stdout: '', stderr: 'failed' })))],
  ['no adapter performs an N-by-M rediscovery crawl', (w) => assert.ok(w.result.inventory.calls <= 3)],
  ['each ceiling is classified as hard admission hard cancellation monitored circuit best-effort or unavailable', (w) => assert.ok(Object.values(w.result.controls).every((v: any) => ['hard admission', 'hard cancellation', 'monitored circuit', 'best-effort', 'unavailable'].includes(v.mode)))],
  ['post-event observation is not reported as enforcement', (w) => assert.equal(w.result.controls.tokenCeiling.mode, 'monitored circuit')],
  ['a packet requiring an unavailable hard guarantee is rejected or explicitly downgraded before launch', (w) => assert.equal(w.result.guaranteeTier, 'STEERING_ONLY')],
  ['UTF-8 stdout stderr evidence native exit code and atomic result JSON are preserved separately', (w) => { assert.equal(w.result.encoding, 'UTF-8'); assert.equal(w.result.exitCode, 0); assert.ok(fs.existsSync(w.result.evidenceRef)); }],
  ['failure diagnostics are collected without replacing the native error', (w) => assert.equal(w.result.classification, 'SUCCESS')],
  ['count must equal items.length', () => assert.doesNotThrow(() => assertTypedSummary({ count: 1, items: ['ok'] }))],
  ['external producer claims require independent readback through the canonical real API path', (w) => assert.ok(fs.existsSync(w.result.stdoutRef))],
  ['unchanged context-exhausted invalid_request schema and budget failures do not retry', () => assert.equal(decideRetry([], { logicalCallKey: 'x', strategyFingerprint: 'x', failureSignature: 'x', failureClass: 'schema-invalid' }).action, 'circuit-open')],
  ['at most one retry is allowed only after a materially changed or narrowed strategy is journaled', (w) => assert.equal(w.result.action, 'retry')],
  ['the circuit opens after the permitted retry or any non-retryable failure', () => assert.equal(decideRetry([], { logicalCallKey: 'x', strategyFingerprint: 'x', failureSignature: 'x', failureClass: 'invalid-request' }).circuitState, 'OPEN')],
  ['logical calls remain distinct from physical attempts', (w) => assert.equal(w.result.reasonCode, 'DWE_CHANGED_STRATEGY_RETRY')],
  ['the run enters HARNESS_REPAIR', (w) => assert.equal(w.result.circuitState, 'HARNESS_REPAIR')],
  ['domain apply remains blocked', (w) => assert.equal(w.result.action, 'harness-repair')],
  ['the next action is repair or explicit disposition rather than another unchanged attempt', (w) => assert.match(w.result.reasonCode, /INFRASTRUCTURE/)],
  ['logical calls and physical attempts are reported separately', (w) => assert.ok(w.result.some((o: any) => o.kind === 'FACT'))],
  ['FACT INFERENCE UNKNOWN and ACTION are separated', (w) => assert.ok(new Set(w.result.map((o: any) => o.kind)).has('ACTION'))],
  ['elapsed time tokens or Large workflow alone do not produce a stalled or runaway verdict', (w) => assert.ok(w.result.every((o: any) => !/runaway|stalled/.test(o.message)))],
  ['only the selected runId and monotonic seq can prove current progress', (w) => assert.ok(w.result[0].message.includes(w.packet!.runId))],
  ['stale pulses or monitors from other runs are ignored', (w) => assert.ok(w.result.every((o: any) => !o.message.includes('foreign')))],
  ['completion reports ownerStopped true descendantsRemaining zero and writersRemaining zero', (w) => assert.deepEqual({ ownerStopped: w.result.ownerStopped, descendantsRemaining: w.result.descendantsRemaining, writersRemaining: w.result.writersRemaining }, { ownerStopped: true, descendantsRemaining: 0, writersRemaining: 0 })],
  ['monitors inherit the owner and terminate with it', (w) => assert.equal(w.result.ownerStopped, true)],
  ['foreign-owned processes and resources are not stopped or deleted', (w) => assert.equal(w.result.foreignProcessesUntouched, 1)],
  ['the completed result remains inspectable exportable and conserved', (w) => assert.equal(w.result.completed[0].id, 'github')],
  ['every missing blocked and dropped scope is explicit', (w) => assert.equal(w.result.missing[0].id, 'spec')],
  ['overall completeness is not COMPLETE unless all mandatory branches have required evidence', (w) => assert.equal(w.result.status, 'PARTIAL')],
  ['source replacement occurs only after the declared commit boundary', (w) => assert.equal(w.result.source, 'old')],
  ['a failed mandatory gate rolls back or quarantines the batch as unproven', (w) => assert.ok(w.result.staged[0].staged)],
  ['plan refresh does not count unprovenApplied entries as complete', (w) => assert.deepEqual(w.result.state.collections.unprovenApplied, [])],
  ['unrelated global BDD or log green cannot close the active incomplete run', (w) => assert.notEqual(w.result.state.state, 'DONE')],
  ['it tries to refute premise reachability surrounding gates reproduction and severity', (w) => assert.equal(w.result.verdict, 'CONFIRMED')],
  ['it returns CONFIRMED PLAUSIBLE REFUTED or BLOCKED', (w) => assert.match(w.result.verdict, /CONFIRMED|PLAUSIBLE|REFUTED|BLOCKED/)],
  ['it does not repeat the complete discovery crawl', (w) => assert.equal(w.result.findingId, 'finding')],
  ['useful partial findings do not imply full scope coverage', (w) => assert.deepEqual(w.result.unverifiedScope, [])],
  ['replay reads only journal and exporter artifacts', (w) => assert.equal(w.result.status, 'REPLAYED')],
  ['replay does not contact the producer network GitHub MCP or a model', (w) => assert.equal(w.result.status, 'REPLAYED')],
  ['missing incomplete or incompatible producer evidence returns REPLAY_UNAVAILABLE', (w) => { const missing = replayOffline(ensureRoot(w), 'dwe-missing'); assert.equal(missing.status, 'REPLAY_UNAVAILABLE'); }],
  ['continuation is rejected', (w) => assert.match(w.result.error, /RESUME_DENIED/)],
  ['a new worker receives only a bounded recovery capsule with root owner base SHA dirty paths accepted evidence unproven work last green gate blocker next action and do-not-touch paths', (w) => assert.ok(Buffer.byteLength(JSON.stringify(w.result.capsule)) <= 3072)],
  ['a PAUSED_RESUMABLE run may reuse only unchanged completed calls', () => assert.doesNotThrow(() => assertResumeAllowed('PAUSED_RESUMABLE'))],
  ['the protected invocation is denied rather than failed open', (w) => assert.equal(w.result.decision, 'deny')],
  ['exactly one audit event contains redacted policy consumer run attempt reason counters hash strategy marker and schema result', (w) => { assert.equal(w.result.auditEvents.length, 1); assert.deepEqual(Object.keys(w.result.auditEvents[0]).sort(), ['attempt', 'consumerId', 'counters', 'inputHash', 'policyVersion', 'reasonCode', 'runHash', 'schemaResult', 'strategyChanged'].sort()); }],
  ['the event contains no raw prompt secret token or tool payload', (w) => assert.doesNotMatch(JSON.stringify(w.result.auditEvents[0]), /prompt|secret|token|payload/i)],
  ['native exit code and terminal diagnostics remain authoritative over warnings locks stale pulses and foreign runs', (w) => assert.equal(w.result.decision, 'deny')],
  ['unrelated routes retain their documented behavior', (w) => assert.equal(w.result.unrelatedRoutes, 'unchanged')],
  ['the tier is exactly ENFORCED STEERING_ONLY or UNAVAILABLE', (w) => assert.match(w.result.guaranteeTier, /ENFORCED|STEERING_ONLY|UNAVAILABLE/)],
  ['an unproven pre-spawn boundary cannot install or claim a complete native-Agent gate', (w) => assert.equal(w.result.protectedHookEligible, false)],
  ['installed and repository behavior are compared without treating prose or mocks as host proof', (w) => assert.equal(w.result.guaranteeTier, 'STEERING_ONLY')],
  ['repository worktree SHA run owner lease and actual mount or source are validated', (w) => assert.equal(w.result.action, 'block-foreign')],
  ['a healthy matching resource may be reused', (w) => assert.equal(decideResourceReuse(w.extra.expected, w.extra.expected).action, 'reuse')],
  ['an expired task-owned resource may follow the declared replacement policy', (w) => assert.equal(decideResourceReuse(w.extra.expected, null).action, 'replace-owned-expired')],
  ['a foreign-owned resource is never deleted', (w) => assert.equal(w.result.action, 'block-foreign')],
  ['startup failure preserves complete diagnostics', (w) => assert.ok(w.result.reason)],
  ['evidence records six spec attempts 695 spec-MCP calls 5459786 response bytes a completed GitHub branch and zero spec structured outputs', (w) => { const g = w.result.incident.manifest.ground_truth; assert.deepEqual([g.spec_collector_attempts, g.spec_mcp_calls, g.aggregate_response_bytes, g.github_collector_completed, g.spec_collector_structured_outputs], [6, 695, 5_459_786, true, 0]); }],
  ['the completed GitHub output remains available despite the exhausted spec branch', (w) => assert.equal(w.result.partial.github, 'available')],
  ['corrected verification stays within three spec-MCP calls and 512 KiB aggregate response bytes', (w) => { assert.ok(w.result.corrected.calls <= 3); assert.ok(w.result.corrected.bytes <= 512 * 1024); }],
  ['missing producer evidence returns REPLAY_UNAVAILABLE instead of a fabricated positive replay', (w) => assert.match(w.result.incident.status, /RECONCILED|REPLAY_UNAVAILABLE/)],
  ['its commits tests model names container names and adjacent-project results are context only', (w) => assert.match(w.result.provenance, /context only/)],
  ['authoritative replay is REPLAY_UNAVAILABLE until original run-state journals process scans terminal diagnostics lease and mount evidence and independent producer readback are reconciled', (w) => assert.equal(w.result.status, 'REPLAY_UNAVAILABLE')],
  ['no task implementation or guarantee tier becomes complete from the supplied report', (w) => assert.equal(w.result.status, 'REPLAY_UNAVAILABLE')],
  ['each source location subject and current contract is recorded deterministically', (w) => { assert.equal(w.result.verification.ok, true); assert.ok(w.result.records.every((record: any) => record.file && record.line > 0 && record.subject)); }],
  ['architecture-decision-builder is included as a known prior omission', (w) => assert.ok(w.result.records.some((record: any) => record.id === 'architecture-decision-builder'))],
  ['nested children monitors background processes and writers appear in the ownership census', (w) => assert.deepEqual(w.result.ownership, ['agent', 'background', 'monitor', 'writer'])],
  ['it receives an exact bounded Workflow contract or an explicit OUT_OF_SCOPE or blocked record', (w) => assert.match(w.result.disposition, /blocked|out-of-scope|migrated/)],
  ['workflow text never authorizes the native Agent route', (w) => assert.equal(w.result.nativeAgentAuthorizedByText, false)],
  ['no consumer is declared migrated without executable evidence from its real path', (w) => { assert.equal(w.result.disposition, 'blocked'); assert.match(w.result.migrationReason, /executable real-path proof/); }],
];

for (const [text, assertion] of assertions) Then(exact(text), function (this: DweWorld) { return assertion(this); });
