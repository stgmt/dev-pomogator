/**
 * @feature79 — canonical task-plan integration steps (SPECGEN004_651..656).
 *
 * These scenarios construct task-contract records, then drive the task-plan
 * integration authority. Persistence uses a real temporary file and the
 * dependency-absence scenario starts a real Node child process, rather than
 * using mocks or scanning source text.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyTaskPlanPatch,
  buildTaskPlanState,
  countTaskPlanRecords,
  createFileCasAdapter,
  legacyPlanReport,
  persistTaskPlanState,
  queryTaskPlan,
  restorePersistedTaskPlanState,
  taskPlanStateWithLegacy,
  type PlanPersistenceAdapter,
  type TaskConflictRecord,
  type TaskEvidenceRecord,
  type TaskPlanMutationResult,
  type TaskPlanResult,
  type TaskPlanState,
} from '../../tools/spec-graph/task-plan-integration.ts';
import { canonicalizeTask, type CanonicalTask, type LegacyTaskRecord } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface TaskPlanWorld extends V4World {
  state?: TaskPlanState;
  plan?: TaskPlanResult;
  mutation?: TaskPlanMutationResult;
  restored?: TaskPlanState | null;
  coldPlanJson?: string;
  warmPlanJson?: string;
  childOutput?: string;
  legacy?: LegacyTaskRecord[];
  rolloutReports?: ReturnType<typeof legacyPlanReport>[];
  explicitConflict?: TaskConflictRecord;
  competingState?: TaskPlanState;
  persistenceFile?: string;
  secondMutation?: TaskPlanMutationResult;
  casResults?: Array<{ writerId: string; committed: boolean; findings: string[] }>;
}

interface CasWriterResult {
  writerId: string;
  committed: boolean;
  findings: string[];
}

/** Cucumber runs from the repository root; child writers resolve fixtures relative to it. */
const REPO_ROOT_FOR_CAS = process.cwd();

function collectChild(child: ReturnType<typeof spawn>): Promise<{ stdout: string; stderr: string; status: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ stdout, stderr, status }));
  });
}

function makeTask(
  id: string,
  title: string,
  overrides: Partial<CanonicalTask> = {},
): CanonicalTask {
  const sourceSpan = overrides.sourceSpan ?? {
    file: '.specs/fixture/TASKS.md',
    startLine: 1,
    endLine: 20,
    sourceText: `${id} canonical task`,
  };
  const result = canonicalizeTask({
    qualifiedId: id,
    title,
    kind: 'implementation',
    definitionRevision: 1,
    declaredStatus: 'READY',
    estimateMinutes: 10,
    requirementLinks: [{ id: 'FR-79', kind: 'requirement', source: 'FR-79' }],
    acceptanceCriteriaLinks: [{ id: 'AC-79.1', kind: 'acceptance-criterion', source: 'AC-79.1' }],
    doneWhen: [{ text: `${id} has execution evidence`, order: 1, required: true }],
    dependencies: [],
    surfaces: [{ kind: 'file', access: 'read', locator: `${id}.ts`, scope: 'repository', rationale: 'canonical fixture input' }],
    artifacts: [{ path: `${id}.ts`, kind: 'source', required: true }],
    evidencePolicy: { scope: 'selected', commands: [`node verify-${id}`], requiresFresh: true, allowFiltered: false },
    unknownFields: {},
    comments: [],
    sourceSpan,
    ...overrides,
  });
  assert.deepEqual(result.findings, [], `fixture ${id} must be a valid canonical task`);
  return result.task;
}

function filePersistence(file: string): PlanPersistenceAdapter {
  return {
    write(serialized) {
      fs.writeFileSync(file, serialized, 'utf8');
    },
    read() {
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
    },
    compareAndSwap(expectedRevision, serialized) {
      const current = this.read();
      if (!current) return false;
      const parsed = JSON.parse(current) as { revision?: unknown };
      if (parsed.revision !== expectedRevision) return false;
      fs.writeFileSync(file, serialized, 'utf8');
      return true;
    },
  };
}

function evidence(taskId: string, sourceId: string, state: TaskEvidenceRecord['state'], reason: string): TaskEvidenceRecord {
  return { taskId, sourceId, state, reason, fingerprint: crypto.createHash('sha256').update(`${taskId}:${sourceId}:${reason}`).digest('hex') };
}

Given('selected graph has dependencies surfaces conflicts and stale evidence', function (this: TaskPlanWorld) {
  const predecessor = makeTask('fixture:task-b', 'Prepare the schema', {
    declaredStatus: 'DONE',
    estimateMinutes: 5,
    surfaces: [{ kind: 'schema', access: 'read', locator: 'billing.v2', scope: 'repository', rationale: 'read the published schema' }],
  });
  const selected = makeTask('fixture:task-a', 'Publish the plan', {
    estimateMinutes: 20,
    dependencies: [{ targetId: predecessor.qualifiedId, relation: 'depends-on', strength: 'hard', reason: 'schema must be published first' }],
    surfaces: [{ kind: 'schema', access: 'write', locator: 'billing.v2', scope: 'repository', rationale: 'publish the canonical schema' }],
  });
  const conflicting = makeTask('fixture:task-c', 'Validate billing contract', {
    estimateMinutes: 15,
    surfaces: [{ kind: 'api-contract', access: 'read', locator: 'billing.v2', scope: 'repository', rationale: 'validate the API contract' }],
  });
  const direct = makeTask('fixture:task-d', 'Generate the client', {
    dependencies: [{ targetId: selected.qualifiedId, relation: 'consumes', strength: 'hard', reason: 'consume the published plan' }],
  });
  const transitive = makeTask('fixture:task-e', 'Run the release check', {
    dependencies: [{ targetId: direct.qualifiedId, relation: 'depends-on', strength: 'hard', reason: 'client generation must finish' }],
  });
  this.state = buildTaskPlanState([selected, predecessor, conflicting, direct, transitive], {
    revision: 7,
    evidence: [evidence(selected.qualifiedId, 'evidence:task-a-run-1', 'stale', 'source revision changed after the successful run')],
  });
});

When('agent queries execution plan', function (this: TaskPlanWorld) {
  assert.ok(this.state);
  this.plan = queryTaskPlan(this.state!, { selectedTaskIds: ['fixture:task-b', 'fixture:task-a', 'fixture:task-c'] });
});

Then('typed graph impact conflicts waves batches path slack stale reasons and explanations return', function (this: TaskPlanWorld) {
  assert.ok(this.plan);
  assert.deepEqual(this.plan!.selectedTaskIds, ['fixture:task-a', 'fixture:task-b', 'fixture:task-c']);
  assert.equal(this.plan!.graph.nodes.length, 3);
  assert.ok(this.plan!.graph.edges.some((edge) => edge.type === 'depends-on' && edge.from === 'fixture:task-a' && edge.to === 'fixture:task-b'));
  assert.ok(this.plan!.graph.edges.some((edge) => edge.type === 'conflicts-with' && edge.sourceIds.includes('fixture:task-a') && edge.sourceIds.includes('fixture:task-c')));
  assert.ok(this.plan!.waves.length >= 2);
  assert.ok(this.plan!.batches.length >= 2);
  assert.deepEqual(this.plan!.impact.direct, ['fixture:task-d']);
  assert.deepEqual(this.plan!.impact.transitive, ['fixture:task-e']);
  assert.deepEqual(this.plan!.criticalPath.taskIds, ['fixture:task-b', 'fixture:task-a']);
  assert.equal(this.plan!.criticalPath.totalMinutes, 25);
  assert.equal(this.plan!.staleReasons[0].sourceId, 'evidence:task-a-run-1');
  assert.ok(this.plan!.slack['fixture:task-a'] !== undefined);
  assert.ok(this.plan!.explanations.every((explanation) => explanation.message && explanation.action));
});

Given('graph revision and patch with invalid change', function (this: TaskPlanWorld) {
  const task = makeTask('fixture:cas-base', 'CAS base task');
  this.state = buildTaskPlanState([task], { revision: 11 });
});

When('dry-run and CAS apply request', function (this: TaskPlanWorld) {
  assert.ok(this.state);
  const invalid = makeTask('fixture:cas-invalid', 'Invalid dependency task', {
    dependencies: [{ targetId: 'fixture:missing', relation: 'depends-on', strength: 'hard', reason: 'missing predecessor' }],
  });
  const file = path.join(this.tempDir, 'plan-state.json');
  const adapter = filePersistence(file);
  persistTaskPlanState(adapter, this.state!);
  const beforeBytes = fs.readFileSync(file, 'utf8');
  const dryRun = applyTaskPlanPatch(this.state!, { add: [invalid] }, {
    expectedRevision: 11,
    dryRun: true,
    persist: (_nextState, _serialized, expectedRevision) => adapter.compareAndSwap!(expectedRevision, _serialized, _nextState),
  });
  assert.equal(dryRun.ok, false);
  assert.equal(dryRun.committed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), beforeBytes);
  this.mutation = applyTaskPlanPatch(this.state!, { add: [invalid] }, {
    expectedRevision: 11,
    persist: (nextState, serialized, expectedRevision) => adapter.compareAndSwap!(expectedRevision, serialized, nextState),
  });
});

Then('dry-run writes nothing and apply leaves all records unchanged', function (this: TaskPlanWorld) {
  assert.ok(this.state && this.mutation);
  assert.equal(this.mutation!.ok, false);
  assert.equal(this.mutation!.committed, false);
  assert.equal(this.mutation!.state.revision, 11);
  assert.deepEqual(this.mutation!.state.tasks, this.state!.tasks);
  assert.ok(this.mutation!.findings.some((finding) => finding.code === 'PLAN_UNRESOLVED_DEPENDENCY'));
});

Given('canonical tasks claims evidence and plan persist', function (this: TaskPlanWorld) {
  const task = makeTask('fixture:persisted', 'Persist planning truth', { definitionRevision: 3 });
  this.state = buildTaskPlanState([task], {
    revision: 23,
    evidence: [evidence(task.qualifiedId, 'evidence:persisted', 'present', 'fresh canonical evidence')],
  });
});

When('cold and warm restore occur', function (this: TaskPlanWorld) {
  assert.ok(this.state);
  const file = path.join(this.tempDir, 'persisted-plan.json');
  const adapter = filePersistence(file);
  persistTaskPlanState(adapter, this.state!);
  this.coldPlanJson = JSON.stringify(queryTaskPlan(this.state!));
  this.restored = restorePersistedTaskPlanState(adapter);
  assert.ok(this.restored);
  this.warmPlanJson = JSON.stringify(queryTaskPlan(this.restored!));
});

Then('model edges plan stale state and reports are equivalent', function (this: TaskPlanWorld) {
  assert.ok(this.restored);
  assert.equal(this.warmPlanJson, this.coldPlanJson);
  assert.deepEqual(this.restored!.tasks, this.state!.tasks);
  assert.deepEqual(this.restored!.evidence, this.state!.evidence);
  assert.deepEqual(this.restored!.conflicts, this.state!.conflicts);
  assert.equal(this.restored!.revision, this.state!.revision);
});

Given('installed bundle launches without project node_modules', function (this: TaskPlanWorld) {
  const task = makeTask('fixture:deps-absent', 'Run without project dependencies');
  const moduleUrl = pathToFileURL(path.resolve('tools/spec-graph/task-plan-integration.bundle.mjs')).href;
  const script = `import { buildTaskPlanState, queryTaskPlan } from ${JSON.stringify(moduleUrl)};\nconst task = ${JSON.stringify(task)};\nconst state = buildTaskPlanState([task], { revision: 31 });\nconst plan = queryTaskPlan(state);\nprocess.stdout.write(JSON.stringify({ version: plan.version, selected: plan.selectedTaskIds, complete: plan.complete }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: this.tempDir,
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  this.childOutput = result.stdout.trim();
});

When('plan query and validation run against real data', function (this: TaskPlanWorld) {
  assert.ok(this.childOutput);
  const parsed = JSON.parse(this.childOutput!) as { version: string; selected: string[]; complete: boolean };
  assert.equal(parsed.version, 'task-plan/v1');
  assert.deepEqual(parsed.selected, ['fixture:deps-absent']);
  assert.equal(parsed.complete, true);
});

Then('expected results return without silent dependency skip', function (this: TaskPlanWorld) {
  assert.ok(this.childOutput);
  assert.match(this.childOutput!, /task-plan\/v1/);
  assert.match(this.childOutput!, /fixture:deps-absent/);
});

Given('plan has migration debt conflicts broad impact critical work and stale evidence', function (this: TaskPlanWorld) {
  const first = makeTask('fixture:risk-a', 'Risk task A', {
    surfaces: [{ kind: 'schema', access: 'write', locator: 'billing.v2?token=secret-value', scope: 'repository', rationale: 'process.env.DEPLOY_TOKEN=super-secret' }],
  });
  const second = makeTask('fixture:risk-b', 'Risk task B', {
    surfaces: [{ kind: 'api-contract', access: 'read', locator: 'billing.v2?token=secret-value', scope: 'repository', rationale: 'inspect the shared contract' }],
  });
  this.legacy = [{
    sourceText: '- [ ] Legacy task with TOKEN=legacy-secret',
    sourceSpan: { file: '.specs/fixture/TASKS.md', startLine: 90, endLine: 90, sourceText: 'legacy source' },
    candidateId: 'fixture:legacy-risk',
    diagnostics: [],
  }];
  this.state = taskPlanStateWithLegacy([first, second], this.legacy, {
    revision: 41,
    evidence: [evidence(first.qualifiedId, 'evidence:risk-a', 'stale', 'environment changed after verification')],
  });
});

When('reports query', function (this: TaskPlanWorld) {
  assert.ok(this.state);
  this.plan = queryTaskPlan(this.state!);
});

Then('source task IDs and actionable redacted explanations return without exposing secret locator or environment values', function (this: TaskPlanWorld) {
  assert.ok(this.plan);
  const serialized = JSON.stringify(this.plan);
  assert.match(serialized, /fixture:risk-a/);
  assert.match(serialized, /evidence:risk-a/);
  assert.ok(this.plan!.reports.risks.length >= 3);
  assert.ok(this.plan!.explanations.every((explanation) => explanation.action.length > 0));
  assert.doesNotMatch(serialized, /secret-value|super-secret|legacy-secret|DEPLOY_TOKEN/);
  assert.match(serialized, /redacted|refresh|separate|canonicalize/i);
});

Given('legacy task source in observe warn and enforce modes', function (this: TaskPlanWorld) {
  this.legacy = [{
    sourceText: '- [ ] Legacy task without canonical identity',
    sourceSpan: { file: '.specs/fixture/TASKS.md', startLine: 120, endLine: 120, sourceText: 'legacy task source' },
    candidateId: 'fixture:legacy-656',
    diagnostics: [],
  }];
  this.state = taskPlanStateWithLegacy([], this.legacy);
});

When('reports generate', function (this: TaskPlanWorld) {
  assert.ok(this.state && this.legacy);
  this.rolloutReports = [
    legacyPlanReport(this.legacy!, 'observe'),
    legacyPlanReport(this.legacy!, 'warn'),
    legacyPlanReport(this.legacy!, 'enforce'),
  ];
});

Then('count is preserved and enforce explicitly rejects unresolved record', function (this: TaskPlanWorld) {
  assert.ok(this.state && this.rolloutReports);
  assert.equal(countTaskPlanRecords(this.state!), 1);
  assert.deepEqual(this.rolloutReports!.map((report) => report.sourceCount), [1, 1, 1]);
  assert.deepEqual(this.rolloutReports!.map((report) => report.visibleCount), [1, 1, 1]);
  assert.deepEqual(this.rolloutReports!.map((report) => report.rejectedCount), [0, 0, 1]);
  assert.equal(this.rolloutReports![2].records[0].status, 'rejected');
  assert.equal(this.rolloutReports![2].records[0].finding?.code, 'PLAN_LEGACY_UNRESOLVED');
});

Given('a selected ready task has stale evidence', function (this: TaskPlanWorld) {
  const selected = makeTask('fixture:stale-selected', 'Refresh stale execution evidence');
  this.state = buildTaskPlanState([selected], {
    revision: 51,
    evidence: [evidence(selected.qualifiedId, 'evidence:stale-selected', 'stale', 'input fingerprint changed')],
  });
});

When('execution plan readiness evaluates', function (this: TaskPlanWorld) {
  this.plan = queryTaskPlan(this.state!);
});

Then('the task is not ready and the plan is incomplete with a stale-evidence finding', function (this: TaskPlanWorld) {
  assert.equal(this.plan!.frontier.length, 1);
  assert.equal(this.plan!.frontier[0].taskId, 'fixture:stale-selected');
  assert.equal(this.plan!.frontier[0].readiness, 'stale');
  assert.equal(this.plan!.complete, false);
  assert.ok(this.plan!.diagnostics.some((diagnostic) => diagnostic.code === 'PLAN_STALE_EVIDENCE'));
});

Given('a plan has an explicit externally audited conflict', function (this: TaskPlanWorld) {
  const first = makeTask('fixture:explicit-a', 'Explicit conflict A');
  const second = makeTask('fixture:explicit-b', 'Explicit conflict B');
  this.explicitConflict = {
    leftTaskId: first.qualifiedId,
    rightTaskId: second.qualifiedId,
    class: 'semantic-resource',
    reason: 'external audit identified a shared semantic resource',
    sourceIds: ['audit:explicit-conflict'],
  };
  this.state = buildTaskPlanState([first, second], { revision: 61, conflicts: [this.explicitConflict] });
});

When('an unrelated valid patch commits', function (this: TaskPlanWorld) {
  this.mutation = applyTaskPlanPatch(this.state!, { evidence: [] }, { expectedRevision: 61 });
});

Then('the explicit conflict remains in the next plan state', function (this: TaskPlanWorld) {
  assert.equal(this.mutation!.ok, true);
  assert.equal(this.mutation!.committed, true);
  assert.deepEqual(this.mutation!.state.conflicts, [this.explicitConflict]);
  assert.ok(queryTaskPlan(this.mutation!.state).graph.edges.some((edge) => edge.type === 'conflicts-with' && edge.sourceIds.includes('audit:explicit-conflict')));
});

Given('a malformed canonical task reaches plan state construction', function (this: TaskPlanWorld) {
  const malformed = makeTask('fixture:malformed-plan', 'Malformed plan task');
  malformed.doneWhen = [];
  this.state = buildTaskPlanState([malformed], { revision: 71 });
});

When('the canonical task plan is queried and restored', function (this: TaskPlanWorld) {
  this.plan = queryTaskPlan(this.state!);
  this.restored = restorePersistedTaskPlanState({
    write() {},
    read: () => JSON.stringify(this.state),
  });
});

Then('the plan remains incomplete with a retained invalid-task finding', function (this: TaskPlanWorld) {
  assert.equal(this.plan!.complete, false);
  assert.ok(this.plan!.diagnostics.some((item) => item.code === 'PLAN_INVALID_TASK'));
  const restoredPlan = queryTaskPlan(this.restored!);
  assert.equal(restoredPlan.complete, false);
  assert.ok(restoredPlan.diagnostics.some((item) => item.code === 'PLAN_INVALID_TASK'));
});

Given('two task plan writers read the same persisted revision', function (this: TaskPlanWorld) {
  const task = makeTask('fixture:cas-writer', 'CAS writer task');
  this.state = buildTaskPlanState([task], { revision: 81 });
  this.persistenceFile = path.join(this.tempDir, 'cas-plan.json');
  persistTaskPlanState(createFileCasAdapter(this.persistenceFile), this.state);
});

When('both writers apply different valid patches', async function (this: TaskPlanWorld) {
  const barrierDir = path.join(this.tempDir, 'cas-barrier');
  fs.mkdirSync(barrierDir, { recursive: true });
  const writerScript = path.resolve('tests/fixtures/task-plan-cas-writer.mjs');
  const spawnWriter = (writerId: string, evidenceSourceId: string) => spawn(
    process.execPath,
    ['--import', 'tsx', writerScript, this.persistenceFile!, barrierDir, writerId, evidenceSourceId],
    { cwd: REPO_ROOT_FOR_CAS, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
  );
  const results = await Promise.all([
    collectChild(spawnWriter('writer-1', 'evidence:first')),
    collectChild(spawnWriter('writer-2', 'evidence:second')),
  ]);
  this.casResults = results.map((result, index) => {
    assert.equal(result.status, 0, `CAS writer exited ${result.status}: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim()) as CasWriterResult;
    assert.equal(parsed.writerId, index === 0 ? 'writer-1' : 'writer-2');
    return parsed;
  });
});

Then('only the first storage compare-and-swap commits and the second reports stale revision', function (this: TaskPlanWorld) {
  const committed = this.casResults!.filter((result) => result.committed);
  const rejected = this.casResults!.filter((result) => !result.committed);
  assert.equal(committed.length, 1, `exactly one writer may commit, got: ${JSON.stringify(this.casResults)}`);
  assert.equal(rejected.length, 1, `double-stale means the adapter lost both writes: ${JSON.stringify(this.casResults)}`);
  assert.ok(rejected[0].findings.includes('PLAN_STALE_REVISION'), rejected[0].findings.join(','));
  const persisted = restorePersistedTaskPlanState(createFileCasAdapter(this.persistenceFile!));
  assert.deepEqual(persisted!.evidence.map((item) => item.sourceId), [committed[0].writerId === 'writer-1' ? 'evidence:first' : 'evidence:second']);
  assert.equal(persisted!.revision, 82);
});

Given('a malformed canonical task is selected for planning', function (this: TaskPlanWorld) {
  const malformed = makeTask('fixture:invalid-plan', 'Invalid plan task');
  malformed.doneWhen = [];
  this.state = buildTaskPlanState([malformed], { revision: 91 });
});

When('the plan schedules and a completion patch is applied', function (this: TaskPlanWorld) {
  this.plan = queryTaskPlan(this.state!, { selectedTaskIds: ['fixture:invalid-plan'] });
  this.mutation = applyTaskPlanPatch(this.state!, { evidence: [evidence('fixture:invalid-plan', 'evidence:invalid-completion', 'present', 'attempt to complete an invalid task')] }, {
    expectedRevision: 91,
  });
});

Then('the invalid task is unscheduled, blocked, and cannot complete', function (this: TaskPlanWorld) {
  assert.equal(this.plan!.complete, false);
  assert.deepEqual(this.plan!.waves.flat().filter((taskId) => taskId === 'fixture:invalid-plan'), []);
  assert.ok(this.plan!.unscheduledRemainder.some((entry) => entry.taskId === 'fixture:invalid-plan'));
  assert.ok(this.plan!.frontier.some((entry) => entry.taskId === 'fixture:invalid-plan' && entry.readiness === 'blocked'));
  assert.ok(this.plan!.diagnostics.some((item) => item.code === 'PLAN_INVALID_TASK'));
  assert.equal(this.mutation!.ok, false);
  assert.equal(this.mutation!.committed, false);
  assert.equal(this.mutation!.state.revision, 91);
  assert.ok(this.mutation!.findings.some((item) => item.code === 'PLAN_INVALID_TASK'));
});
