/**
 * @feature72 — canonical task/v1 contract integration steps (SPECGEN004_616..620).
 *
 * These steps drive the production task-contract parser/renderer/mutation and
 * shared projection code directly. They intentionally assert collection
 * conservation, byte-stable canonical JSON, source preservation, and atomic
 * rejection rather than checking a hand-authored fixture shape.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  applyTaskContractMutation,
  canonicalTaskJson,
  parseTaskContract,
  parseTaskDocument,
  projectTaskViews,
  renderTaskContract,
  type CanonicalTask,
  type TaskDocument,
  type TaskMutationResult,
  type TaskProjectionViews,
} from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface TaskContractWorld extends V4World {
  taskInput?: CanonicalTask;
  parsed?: CanonicalTask;
  roundTrip?: CanonicalTask;
  document?: TaskDocument;
  projections?: TaskProjectionViews;
  snapshot?: CanonicalTask[];
  mutation?: TaskMutationResult;
  rendered?: string;
}

function canonicalInput(overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return {
    representationVersion: 'task/v1',
    qualifiedId: 'spec-generator-v4:task-contract-616',
    title: 'Preserve the canonical task contract',
    kind: 'implementation',
    definitionRevision: 7,
    declaredStatus: 'READY',
    estimateMinutes: 25,
    requirementLinks: [{ id: 'FR-72', kind: 'requirement', source: 'FR-72' }],
    acceptanceCriteriaLinks: [{ id: 'AC-72.1', kind: 'acceptance-criterion', source: 'AC-72.1' }],
    doneWhen: [
      { text: 'canonical fields are queryable', order: 1, required: true },
      { text: 'task/v1 round-trip is byte-stable', order: 2, required: true },
    ],
    dependencies: [{ targetId: 'spec-generator-v4:task-contract-predecessor', relation: 'depends-on', strength: 'hard', reason: 'contract fixture must exist first' }],
    surfaces: [
      { kind: 'file', access: 'read', locator: 'tools/spec-graph/task-contract.ts', scope: 'repository', rationale: 'read the canonical producer' },
      { kind: 'file', access: 'write', locator: 'tools/spec-graph/task-contract.ts', scope: 'repository', rationale: 'implement the contract producer' },
      { kind: 'test-resource', access: 'exclusive', locator: 'task-contract-616', scope: 'scenario', rationale: 'isolate the integration fixture' },
    ],
    artifacts: [{ path: 'tools/spec-graph/task-contract.ts', kind: 'source', required: true }],
    evidencePolicy: { scope: 'full-suite', commands: ['bash scripts/docker-bdd.sh --name SPECGEN004_616'], requiresFresh: true, allowFiltered: false },
    unknownFields: { OwnerHint: 'canonical-task-planner' },
    comments: ['preserve this comment through render'],
    sourceSpan: { file: '.specs/spec-generator-v4/TASKS.md', startLine: 616, endLine: 640, sourceText: 'authored task block' },
    ...overrides,
  };
}

function renderedTask(task: CanonicalTask): string {
  return renderTaskContract(task);
}

Given('a strict task declares identity, revision, typed links, criteria, surfaces, artifacts, and evidence policy', function (this: TaskContractWorld) {
  this.taskInput = canonicalInput();
});

When('the execution planner parses it', function (this: TaskContractWorld) {
  assert.ok(this.taskInput, 'strict canonical input was not prepared');
  this.rendered = renderedTask(this.taskInput);
  this.parsed = parseTaskContract(this.rendered, {
    file: this.taskInput.sourceSpan.file,
    knownRequirements: new Set(['FR-72']),
    knownAcceptanceCriteria: new Set(['AC-72.1']),
  });
});

Then('the query returns every declared canonical field', function (this: TaskContractWorld) {
  assert.ok(this.parsed);
  assert.equal(this.parsed!.representationVersion, 'task/v1');
  for (const key of [
    'qualifiedId', 'title', 'kind', 'definitionRevision', 'declaredStatus', 'estimateMinutes',
    'requirementLinks', 'acceptanceCriteriaLinks', 'doneWhen', 'dependencies', 'surfaces',
    'artifacts', 'evidencePolicy', 'unknownFields', 'comments', 'sourceSpan',
  ] as const) assert.notEqual(this.parsed![key], undefined, `${key} must be present in the canonical query`);
  assert.equal(this.parsed!.qualifiedId, this.taskInput!.qualifiedId);
  assert.equal(this.parsed!.definitionRevision, 7);
  assert.equal(this.parsed!.declaredStatus, 'READY');
  assert.deepEqual(this.parsed!.requirementLinks.map((link) => link.id), ['FR-72']);
  assert.deepEqual(this.parsed!.acceptanceCriteriaLinks.map((link) => link.id), ['AC-72.1']);
  assert.equal(this.parsed!.dependencies[0].reason, 'contract fixture must exist first');
  assert.equal(this.parsed!.surfaces.length, 3);
  assert.equal(this.parsed!.artifacts[0].path, 'tools/spec-graph/task-contract.ts');
  assert.equal(this.parsed!.evidencePolicy.scope, 'full-suite');
});

Given('a canonical READY task with ordered dependencies and criteria', function (this: TaskContractWorld) {
  this.taskInput = canonicalInput({
    qualifiedId: 'Spec-Generator-V4:Task-Contract-617',
    unknownFields: { ReviewerNote: 'must survive', x_custom: { stable: true } },
    comments: ['comment survives Unicode normalization: café'],
    doneWhen: [
      { text: 'first criterion', order: 2, required: true },
      { text: 'second criterion', order: 1, required: true },
    ],
    dependencies: [
      { targetId: 'spec-generator-v4:task-z', relation: 'depends-on', strength: 'hard', reason: 'z contract' },
      { targetId: 'spec-generator-v4:task-a', relation: 'consumes', strength: 'soft', reason: 'optional artifact' },
    ],
  });
});

When('it is parsed rendered and parsed again', function (this: TaskContractWorld) {
  assert.ok(this.taskInput);
  const first = parseTaskContract(renderedTask(this.taskInput!), { file: this.taskInput!.sourceSpan.file });
  const second = parseTaskContract(renderedTask(first), { file: first.sourceSpan.file });
  this.parsed = first;
  this.roundTrip = second;
});

Then(/^canonical stable-key JSON is byte-equivalent after Unicode\/case normalization and READY, unknown fields, comments, and source spans remain equal$/, function (this: TaskContractWorld) {
  assert.ok(this.parsed && this.roundTrip);
  assert.equal(canonicalTaskJson(this.parsed!), canonicalTaskJson(this.roundTrip!));
  assert.equal(this.roundTrip!.declaredStatus, 'READY');
  assert.deepEqual(this.roundTrip!.unknownFields, this.parsed!.unknownFields);
  assert.deepEqual(this.roundTrip!.comments, this.parsed!.comments);
  assert.deepEqual(this.roundTrip!.sourceSpan, this.parsed!.sourceSpan);
  assert.deepEqual(this.roundTrip!.doneWhen, [
    { text: 'first criterion', order: 1, required: true },
    { text: 'second criterion', order: 2, required: true },
  ]);
});

Given('strict TASKS.md contains a loose legacy item', function (this: TaskContractWorld) {
  const canonical = renderedTask(canonicalInput({ qualifiedId: 'spec-generator-v4:canonical-618' }));
  const loose = '- [ ] Legacy task without canonical identity or status\n  **Done When:** migrate this task safely';
  this.document = parseTaskDocument(`# Tasks\n\n${canonical}\n${loose}\n`, { file: '.specs/spec-generator-v4/TASKS.md' });
});

When('census loads it', function (this: TaskContractWorld) {
  assert.ok(this.document, 'task document was not loaded');
  // The census-facing value is the canonical document: no separate parser may drop legacy rows.
  this.document = { ...this.document!, tasks: [...this.document!.tasks], legacy: [...this.document!.legacy] };
});

Then('the item remains visible with actionable migration finding', function (this: TaskContractWorld) {
  assert.ok(this.document);
  assert.equal(this.document!.tasks.length, 1, 'the canonical task remains queryable');
  assert.equal(this.document!.legacy.length, 1, 'the loose task is retained, not silently dropped');
  assert.equal(this.document!.legacy[0].sourceSpan.file, '.specs/spec-generator-v4/TASKS.md');
  assert.ok(this.document!.diagnostics.some((finding) => finding.code === 'TASK_LEGACY_RECORD'));
  assert.match(this.document!.legacy[0].diagnostics[0].message, /legacy|loose|canonical/i);
});

Given('a canonical task revision and READY status', function (this: TaskContractWorld) {
  this.taskInput = canonicalInput({ qualifiedId: 'spec-generator-v4:projection-619', definitionRevision: 11, declaredStatus: 'READY' });
});

When('Graph MCP lifecycle census and summary query it', function (this: TaskContractWorld) {
  assert.ok(this.taskInput);
  this.projections = projectTaskViews([this.taskInput!]);
});

Then('each view reports equal ID revision and status', function (this: TaskContractWorld) {
  assert.ok(this.projections);
  const views = Object.values(this.projections!);
  assert.equal(views.length, 5);
  for (const view of views) {
    assert.equal(view.length, 1);
    assert.deepEqual(view[0], {
      qualifiedId: 'spec-generator-v4:projection-619',
      representationVersion: 'task/v1',
      definitionRevision: 11,
      declaredStatus: 'READY',
      diagnostics: [],
    });
  }
  assert.equal(new Set(views.flat().map((entry) => `${entry.qualifiedId}|${entry.definitionRevision}|${entry.declaredStatus}`)).size, 1);
});

Given('a persisted canonical task snapshot', function (this: TaskContractWorld) {
  this.snapshot = [canonicalInput({ qualifiedId: 'spec-generator-v4:persisted-620', definitionRevision: 3 })];
});

When('apply proposes duplicate ID and unresolved AC link', function (this: TaskContractWorld) {
  assert.ok(this.snapshot);
  const duplicate = canonicalInput({
    qualifiedId: 'SPEC-GENERATOR-V4:PERSISTED-620',
    acceptanceCriteriaLinks: [{ id: 'AC-72.999', kind: 'acceptance-criterion', source: 'AC-72.999' }],
    sourceSpan: { file: '.specs/spec-generator-v4/TASKS.md', startLine: 620, endLine: 630, sourceText: 'invalid proposed task' },
  });
  this.mutation = applyTaskContractMutation(this.snapshot!, [duplicate], {
    knownRequirements: new Set(['FR-72']),
    knownAcceptanceCriteria: new Set(['AC-72.1']),
  });
});

Then('field findings return and snapshot is unchanged', function (this: TaskContractWorld) {
  assert.ok(this.mutation && this.snapshot);
  assert.equal(this.mutation!.ok, false);
  assert.equal(this.mutation!.committed, false);
  assert.deepEqual(this.mutation!.tasks, this.snapshot);
  assert.ok(this.mutation!.findings.some((finding) => finding.code === 'TASK_DUPLICATE_ID' && finding.field === 'qualifiedId'));
  assert.ok(this.mutation!.findings.some((finding) => finding.code === 'TASK_UNRESOLVED_ACCEPTANCE_CRITERION' && finding.field === 'acceptanceCriteriaLinks'));
  assert.equal(this.mutation!.findings.filter((finding) => finding.severity === 'error').length, 2);
});
