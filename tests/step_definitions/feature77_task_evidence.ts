import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createTaskEvidenceSnapshot,
  markDependentEvidenceStale,
  projectTaskEvidenceViews,
  recordTaskEvidence,
  restoreTaskEvidence,
  serializeTaskEvidence,
  taskCompletionDecision,
  type TaskEvidenceInput,
} from '../../tools/spec-graph/task-evidence.ts';
import { parseTaskContract, type CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';

interface EvidenceWorld extends V4World {
  tasks?: CanonicalTask[];
  snapshot?: ReturnType<typeof createTaskEvidenceSnapshot>;
  input?: TaskEvidenceInput;
  result?: ReturnType<typeof recordTaskEvidence>;
  restored?: ReturnType<typeof restoreTaskEvidence>;
  decision?: ReturnType<typeof taskCompletionDecision>;
}

function task(id: string, dependencies: CanonicalTask['dependencies'] = [], policy: CanonicalTask['evidencePolicy']['scope'] = 'full-suite'): CanonicalTask {
  return parseTaskContract({
    qualifiedId: id,
    title: id,
    kind: 'implementation',
    definitionRevision: 1,
    declaredStatus: 'READY',
    estimateMinutes: 5,
    requirementLinks: [{ id: 'FR-77', kind: 'requirement' }],
    acceptanceCriteriaLinks: [{ id: 'AC-77.1', kind: 'acceptance-criterion' }],
    doneWhen: [{ text: 'evidence is current', order: 1, required: true }],
    dependencies,
    surfaces: [{ kind: 'file', access: 'read', locator: `${id}.ts`, scope: 'repository', rationale: 'fixture input' }],
    artifacts: [{ path: `${id}.json`, required: true }],
    evidencePolicy: { scope: policy, commands: ['docker-bdd'], requiresFresh: true, allowFiltered: false },
    sourceSpan: { file: 'fixture/TASKS.md', startLine: 1, endLine: 10 },
  });
}

function input(taskId: string, overrides: Partial<TaskEvidenceInput> = {}): TaskEvidenceInput {
  const fingerprint = crypto.createHash('sha256').update(taskId).digest('hex');
  return {
    taskId,
    owner: { id: 'validator-77', kind: 'agent' },
    validatedIds: ['AC-77.1', 'SCEN-specgen004-641'],
    runId: 'run-77',
    environment: { platform: 'docker-linux', node: '20' },
    result: 'PASSED',
    fingerprints: { [`${taskId}.input`]: fingerprint },
    inputFingerprints: { [`${taskId}.input`]: fingerprint },
    outputFingerprints: { [`${taskId}.output`]: fingerprint },
    scope: 'full-suite',
    recordedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

Given('a validation run owns scenario and artifact evidence', function (this: EvidenceWorld) {
  this.tasks = [task('fixture:A')];
  this.snapshot = createTaskEvidenceSnapshot(this.tasks);
  this.input = input('fixture:A');
});

When('evidence stores', function (this: EvidenceWorld) {
  this.result = recordTaskEvidence(this.snapshot!, this.input!);
  this.snapshot = this.result.snapshot;
});

Then('owner validated IDs run environment result and fingerprints persist', function (this: EvidenceWorld) {
  assert.equal(this.result!.ok, true);
  assert.equal(this.result!.evidence.owner.id, 'validator-77');
  assert.deepEqual(this.result!.evidence.validatedIds, ['AC-77.1', 'SCEN-specgen004-641']);
  assert.equal(this.result!.evidence.runId, 'run-77');
  assert.equal(this.result!.evidence.environment.platform, 'docker-linux');
  assert.equal(this.result!.evidence.result, 'PASSED');
  assert.equal(Object.keys(this.result!.evidence.fingerprints).length, 1);
});

Given('B consumes artifact from A and C depends on B', function (this: EvidenceWorld) {
  this.tasks = [
    task('fixture:A'),
    task('fixture:B', [{ targetId: 'fixture:A', relation: 'consumes', strength: 'hard', reason: 'A artifact' }]),
    task('fixture:C', [{ targetId: 'fixture:B', relation: 'depends-on', strength: 'hard', reason: 'B result' }]),
  ];
  this.snapshot = createTaskEvidenceSnapshot(this.tasks);
  for (const id of ['fixture:B', 'fixture:C']) this.snapshot = recordTaskEvidence(this.snapshot, input(id)).snapshot;
});

When('A fingerprint changes', function (this: EvidenceWorld) {
  this.snapshot = markDependentEvidenceStale(this.snapshot!, { taskId: 'fixture:A', paths: ['fixture:A.input'], reason: 'producer fingerprint changed' });
});

Then('B and C become stale with paths and reasons', function (this: EvidenceWorld) {
  const stale = this.snapshot!.records.filter((record) => record.stale);
  assert.deepEqual(stale.map((record) => record.taskId).sort(), ['fixture:B', 'fixture:C']);
  assert.ok(stale.every((record) => record.stalePaths.some((path) => path.includes('fixture:A') && path.includes('input:fixture:A.input'))));
  assert.ok(stale.every((record) => record.staleReasons.includes('producer fingerprint changed')));
});

Given('successful evidence becomes stale', function (this: EvidenceWorld) {
  this.tasks = [task('fixture:stale', [], 'full-suite')];
  this.snapshot = recordTaskEvidence(createTaskEvidenceSnapshot(this.tasks), input('fixture:stale')).snapshot;
  this.snapshot = markDependentEvidenceStale(this.snapshot, { taskId: 'fixture:stale', paths: ['fixture:stale.input'], reason: 'input changed' });
});

When('lifecycle recovers task', function (this: EvidenceWorld) {
  this.decision = taskCompletionDecision(this.snapshot!, 'fixture:stale');
});

Then('history stays visible and task is not DONE before READY or in-progress', function (this: EvidenceWorld) {
  assert.equal(this.decision!.historyVisible, true);
  assert.equal(this.decision!.complete, false);
  assert.ok(this.decision!.reasons.some((reason) => reason.includes('stale')));
});

Given('evidence policy requires full suite', function (this: EvidenceWorld) {
  this.tasks = [task('fixture:filtered', [], 'full-suite')];
  this.snapshot = createTaskEvidenceSnapshot(this.tasks);
  this.input = input('fixture:filtered', { scope: 'filtered', filter: 'SPECGEN004_644' });
});

When('only filtered passing run attaches', function (this: EvidenceWorld) {
  this.result = recordTaskEvidence(this.snapshot!, this.input!);
  this.snapshot = this.result.snapshot;
  this.decision = taskCompletionDecision(this.snapshot, 'fixture:filtered');
});

Then('run remains visible and task is not DONE', function (this: EvidenceWorld) {
  assert.equal(this.result!.ok, true);
  assert.equal(this.result!.accepted, false);
  assert.equal(this.decision!.historyVisible, true);
  assert.equal(this.decision!.complete, false);
  assert.ok(this.result!.findings.some((finding) => finding.code === 'EVIDENCE_FILTERED_NOT_FULL_SUITE'));
});

Given('current historical evidence and stale reasons', function (this: EvidenceWorld) {
  this.tasks = [task('fixture:restore')];
  this.snapshot = recordTaskEvidence(createTaskEvidenceSnapshot(this.tasks), input('fixture:restore')).snapshot;
  this.snapshot = markDependentEvidenceStale(this.snapshot, { taskId: 'fixture:restore', paths: ['artifact.json'], reason: 'artifact changed' });
});

When('graph persists restores and MCP queries', function (this: EvidenceWorld) {
  this.restored = restoreTaskEvidence(serializeTaskEvidence(this.snapshot!));
});

Then('ownership result fingerprints and reasons agree', function (this: EvidenceWorld) {
  assert.deepEqual(projectTaskEvidenceViews(this.snapshot!).source, projectTaskEvidenceViews(this.restored!).mcp);
  assert.equal(this.restored!.records[0].owner.id, 'validator-77');
  assert.equal(this.restored!.records[0].stale, true);
  assert.deepEqual(this.restored!.records[0].staleReasons, ['artifact changed']);
});
