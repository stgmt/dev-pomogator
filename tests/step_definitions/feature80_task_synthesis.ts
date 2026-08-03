/**
 * @feature80 — FR-80 deterministic pre-scheduling task synthesis.
 *
 * The scenarios exercise the production synthesis authority directly. Inputs
 * represent repository-verified claims and exact source locations; assertions
 * check invariants and projections rather than implementation source text.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  canonicalSynthesisJson,
  deterministicPreSchedulingSynthesis,
  evidenceBackedDone,
  evaluateLifecycleOutcome,
  finalizeSynthesis,
  projectTaskPlan,
  reviewSynthesis,
  stableSynthesisJson,
  synthesizeTasks,
  type AcceptanceLaneInput,
  type RepositoryReality,
  type SynthesisFindingCode,
  type SynthesisInput,
  type SynthesisResult,
  type TaskPlanResult,
} from '../../tools/spec-graph/task-synthesis.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface TaskSynthesisWorld extends V4World {
  input?: SynthesisInput;
  result?: SynthesisResult;
  secondResult?: SynthesisResult;
  plan?: TaskPlanResult;
  expectedFindingCodes?: SynthesisFindingCode[];
  lifecycle?: ReturnType<typeof evaluateLifecycleOutcome>;
}

const location = (file: string, line: number, symbol?: string) => ({ file, line, ...(symbol ? { symbol } : {}) });

function dddReality(): RepositoryReality {
  return {
    domainBoundary: { kind: 'domain-boundary' as const, name: 'task-synthesis', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    aggregate: { kind: 'aggregate' as const, name: 'TaskSynthesis', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    invariant: { kind: 'invariant' as const, name: 'one lane per acceptance criterion', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    contract: { kind: 'contract' as const, name: 'task/v1', verified: true, source: location('tools/spec-graph/task-contract.ts', 82) },
    surfaces: [
      { kind: 'file' as const, access: 'read' as const, locator: 'tools/spec-graph/task-contract.ts', scope: 'repository', rationale: 'canonical task contract input', exactInterface: 'CanonicalTask', verified: true },
      { kind: 'file' as const, access: 'write' as const, locator: 'tools/spec-graph/task-synthesis.ts', scope: 'repository', rationale: 'synthesis producer', exactInterface: 'synthesizeTasks', verified: true },
      { kind: 'test-resource' as const, access: 'exclusive' as const, locator: 'SPECGEN004_657', scope: 'scenario', rationale: 'isolated acceptance evidence', exactInterface: 'deterministicPreSchedulingSynthesis', verified: true },
    ],
    interfaces: [{ name: 'SynthesisAuthority', contract: 'task/v1', location: location('tools/spec-graph/task-synthesis.ts', 1, 'deterministicPreSchedulingSynthesis'), verified: true }],
  };
}

function noneReality(): RepositoryReality {
  return {
    contract: { kind: 'contract' as const, name: 'stable JSON contract', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    module: { kind: 'module' as const, name: 'CLI module', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    adapter: { kind: 'adapter' as const, name: 'filesystem adapter', verified: true, source: location('tools/spec-graph/task-synthesis.ts', 1) },
    surfaces: [
      { kind: 'file' as const, access: 'read' as const, locator: 'tools/spec-graph/task-synthesis.ts', scope: 'repository', rationale: 'module input', exactInterface: 'SynthesisInput', verified: true },
      { kind: 'file' as const, access: 'write' as const, locator: 'tools/spec-graph/task-synthesis.ts', scope: 'repository', rationale: 'adapter output', exactInterface: 'synthesizeTasks', verified: true },
      { kind: 'test-resource' as const, access: 'exclusive' as const, locator: 'SPECGEN004_658', scope: 'scenario', rationale: 'stable JSON fixture', exactInterface: 'stableSynthesisJson', verified: true },
    ],
    interfaces: [{ name: 'StableJsonContract', contract: 'stable JSON', location: location('tools/spec-graph/task-synthesis.ts', 1, 'stableSynthesisJson'), verified: true }],
  };
}

function lane(number: number, overrides: Partial<AcceptanceLaneInput> & { title?: string } = {}): AcceptanceLaneInput {
  const id = `FR-80:AC-80.${number}`;
  return {
    laneId: id,
    requirementId: 'FR-80',
    acceptanceCriterionId: `AC-80.${number}`,
    scenarioId: `SPECGEN004_${656 + number}`,
    scenarioTitle: `FR-80 lane ${number}`,
    applicable: true,
    requirementSource: location('.specs/spec-generator-v4/FR.md', 1299),
    acceptanceSource: location('.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md', 1),
    scenarioSource: location('.specs/spec-generator-v4/spec-generator-v4.feature', 4163 + number),
    evidence: { scenarioId: `SPECGEN004_${656 + number}`, scenarioTitle: `FR-80 lane ${number}`, commands: [`bash scripts/docker-bdd.sh --name SPECGEN004_${656 + number}`], source: location('.specs/spec-generator-v4/spec-generator-v4.feature', 4163 + number), result: 'PASSED' },
    estimateMinutes: 7,
    doneWhen: [`AC-80.${number} has passing tagged BDD evidence and an owned task/v1 record`],
    bddSteps: [
      { phase: 'RED', text: `Failing BDD scenario for AC-80.${number}`, estimateMinutes: 2, bddOnly: true },
      { phase: 'GREEN', text: `Smallest implementation for AC-80.${number}`, estimateMinutes: 3, bddOnly: true },
      { phase: 'REFACTOR', text: `Refactor AC-80.${number} without behavior change`, estimateMinutes: 2, bddOnly: true },
    ],
    ...overrides,
  };
}

function baseInput(reality: RepositoryReality = dddReality(), lanes: AcceptanceLaneInput[] = [lane(1)]): SynthesisInput {
  return {
    requirements: [{ id: 'FR-80', title: 'Deterministic pre-scheduling task synthesis', source: location('.specs/spec-generator-v4/FR.md', 1299) }],
    acceptanceCriteria: lanes.map((item) => ({ id: item.acceptanceCriterionId, requirementId: item.requirementId, text: item.doneWhen?.toString(), source: item.acceptanceSource, applicable: true })),
    acceptanceLanes: lanes,
    design: { revision: 80, digest: 'design-fr80-digest', source: location('.specs/spec-generator-v4/DESIGN.md', 1), approved: true, ownership: 'TaskSynthesis' },
    repositoryReality: reality,
    responsibilityMap: reality.interfaces,
  };
}

function run(this: TaskSynthesisWorld): SynthesisResult {
  assert.ok(this.input, 'synthesis input was not prepared');
  return synthesizeTasks(this.input!);
}

Given('repository reality identifies the {string} domain boundary, {string} aggregate, {string} invariant, and {string} contract', function (this: TaskSynthesisWorld, domain: string, aggregate: string, invariant: string, contract: string) {
  const reality = dddReality();
  reality.domainBoundary!.name = domain;
  reality.aggregate!.name = aggregate;
  reality.invariant!.name = invariant;
  reality.contract!.name = contract;
  this.input = baseInput(reality);
});

Given('FR-{int} has one applicable acceptance criterion and tagged BDD evidence', function (this: TaskSynthesisWorld, fr: number) {
  assert.equal(fr, 80);
  this.input ??= baseInput();
});

When('deterministic pre-scheduling synthesis runs', function (this: TaskSynthesisWorld) {
  this.result = deterministicPreSchedulingSynthesis(this.input!);
});

Then(/^it stores one `domainMode: ddd` canonical task\/v1 vertical slice with its requirement, acceptance criterion, scenario, evidence, estimate, doneWhen, dependencies, and declared surfaces$/, function (this: TaskSynthesisWorld) {
  const result = this.result!;
  assert.equal(result.accepted, true);
  assert.equal(result.domainMode, 'ddd');
  assert.equal(result.tasks.length, 1);
  const task = result.tasks[0];
  assert.equal(task.representationVersion, 'task/v1');
  assert.equal(task.domainMode, 'ddd');
  assert.deepEqual(task.requirementLinks.map((item) => item.id), ['FR-80']);
  assert.equal(task.acceptanceCriteriaLinks.length, 1);
  assert.equal(task.scenario.scenarioId, 'SPECGEN004_657');
  assert.equal(task.evidence.result, 'PASSED');
  assert.ok(task.estimateMinutes > 0 && task.doneWhen.length > 0 && task.dependencies && task.surfaces.length > 0);
  assert.deepEqual(task.boundaries.map((item) => item.name), ['task-synthesis', 'TaskSynthesis', 'one lane per acceptance criterion', 'task/v1']);
});

Then(/^no FR-(\d+)\.\.FR-(\d+) scheduling operation creates another planning graph$/, function (this: TaskSynthesisWorld, first: string, last: string) {
  assert.equal(Number(first), 72);
  assert.equal(Number(last), 79);
  assert.equal(this.result!.planningGraph, this.result!.graph);
  assert.equal(this.result!.authority, 'task-synthesis');
});

Given('repository reality identifies a CLI module, filesystem adapter, and stable JSON contract but no domain boundary', function (this: TaskSynthesisWorld) {
  this.input = baseInput(noneReality(), [lane(2, { scenarioId: 'SPECGEN004_658', scenarioTitle: 'infrastructure slice' })]);
});

Then(/^it stores `domainMode: none` with the module, adapter, and contract boundaries$/, function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.equal(this.result!.domainMode, 'none');
  assert.equal(task.domainMode, 'none');
  assert.deepEqual(task.boundaries.map((item) => item.name), ['CLI module', 'filesystem adapter', 'stable JSON contract']);
});

Then('the generated task has measurable doneWhen, an estimate, requirement and acceptance references, typed dependencies, and read, write, and exclusive surfaces', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.ok(task.doneWhen.every((item) => item.text.length > 0));
  assert.ok(task.estimateMinutes > 0);
  assert.equal(task.requirementLinks[0].id, 'FR-80');
  assert.equal(task.acceptanceCriteriaLinks[0].id, 'AC-80.2');
  assert.deepEqual(new Set(task.surfaces.map((item) => item.access)), new Set(['read', 'write', 'exclusive']));
  assert.ok(task.dependencies.every((item) => item.reason && item.relation));
});

Then('it does not create an entity, aggregate, or invariant', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.deepEqual(task.domainEntities, []);
  assert.deepEqual(task.boundaries.map((item) => item.kind), ['module', 'adapter', 'contract']);
});

Given('an applicable acceptance lane has no repository-supported implementation surface', function (this: TaskSynthesisWorld) {
  this.input = baseInput({ contract: noneReality().contract }, [lane(3, { surfaces: [], interfaces: [] })]);
});

Then('it creates a named BLOCKED investigation record that owns the acceptance lane', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.equal(task.declaredStatus, 'BLOCKED');
  assert.equal(task.kind, 'investigation');
  assert.ok(task.blockers.some((item) => /No repository-verified implementation surface/.test(item)));
  assert.equal(task.ownership.laneId, task.laneId);
  assert.ok(this.result!.findings.some((item) => item.code === 'UNKNOWN_IMPLEMENTATION_SURFACE'));
});

Then('task finalization is rejected until that investigation is resolved', function (this: TaskSynthesisWorld) {
  assert.equal(this.result!.accepted, false);
  assert.equal(projectTaskPlan(this.result!).accepted, false);
});

Given('ordered FR, acceptance-criterion, DESIGN, BDD, and repository-reality inputs contain three applicable acceptance lanes', function (this: TaskSynthesisWorld) {
  this.input = baseInput(dddReality(), [lane(1), lane(2), lane(3)]);
});

When('deterministic pre-scheduling synthesis runs twice', function (this: TaskSynthesisWorld) {
  this.result = run.call(this);
  this.secondResult = run.call(this);
});

Then(/^each result contains exactly three uniquely owned lanes and stable-key byte-equivalent canonical task\/v1 records$/, function (this: TaskSynthesisWorld) {
  assert.equal(this.result!.tasks.length, 3);
  assert.equal(this.secondResult!.tasks.length, 3);
  assert.equal(new Set(this.result!.graph.laneOwnership.map((item) => item.laneId)).size, 3);
  assert.equal(stableSynthesisJson(this.result!.tasks), stableSynthesisJson(this.secondResult!.tasks));
  assert.equal(canonicalSynthesisJson(this.result!.graph), canonicalSynthesisJson(this.secondResult!.graph));
});

Then('a missing or duplicate source claim produces a named deterministic finding instead of silent loss or duplication', function (this: TaskSynthesisWorld) {
  const duplicateInput = baseInput(dddReality(), [lane(1), lane(1)]);
  const duplicate = synthesizeTasks(duplicateInput);
  assert.ok(duplicate.findings.some((item) => item.code === 'DUPLICATE_ACCEPTANCE_LANE'));
  const missing = synthesizeTasks(baseInput(dddReality(), [lane(2, { requirementId: '' })]));
  assert.ok(missing.findings.some((item) => item.code === 'MISSING_SOURCE_CLAIM'));
});

Then('the stored SpecGraph is the direct input to FR-{int}..FR-{int} planning', function (this: TaskSynthesisWorld, first: number, last: number) {
  assert.equal(Number(first), 72);
  assert.equal(Number(last), 79);
  assert.strictEqual(this.result!.planningGraph, this.result!.graph);
});

Given('an acceptance lane has a vertical BDD slice with RED, GREEN, and REFACTOR work', function (this: TaskSynthesisWorld) {
  this.input = baseInput(dddReality(), [lane(4, { scenarioId: 'SPECGEN004_661', evidence: { scenarioId: 'SPECGEN004_661', scenarioTitle: 'FR-80 lane 4', commands: ['bash scripts/docker-bdd.sh --name SPECGEN004_661'], source: location('.specs/spec-generator-v4/spec-generator-v4.feature', 4194), result: 'PASSED' } })]);
});

When('deterministic pre-scheduling synthesis validates the slice', function (this: TaskSynthesisWorld) {
  this.result = run.call(this);
});

Then('the slice owns its requirement, acceptance criterion, scenario, and verification evidence', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.equal(task.ownership.owner, 'task-synthesis');
  assert.equal(task.ownership.requirementId, 'FR-80');
  assert.equal(task.ownership.acceptanceCriterionId, 'AC-80.4');
  assert.equal(task.ownership.scenarioId, 'SPECGEN004_661');
  assert.equal(task.evidence.scenarioId, 'SPECGEN004_661');
});

Then('it persists typed causal edges in RED then GREEN then REFACTOR order', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.deepEqual(task.causalSteps.map((item) => item.phase), ['RED', 'GREEN', 'REFACTOR']);
  assert.deepEqual(task.causalEdges.map((item) => item.phase), ['RED->GREEN', 'GREEN->REFACTOR']);
  assert.ok(task.causalSteps.every((item) => item.bddOnly && !item.schedulable));
});

Then('a reordered, missing, or cross-slice causal edge is rejected', function (this: TaskSynthesisWorld) {
  const invalidTask = { ...this.result!.graph.tasks[0], causalEdges: [{ ...this.result!.graph.tasks[0].causalEdges[0], phase: 'GREEN->RED' as const }] };
  const invalidGraph = { ...this.result!.graph, tasks: [invalidTask] };
  const review = reviewSynthesis(invalidGraph);
  assert.ok(review.findings.some((item) => item.code === 'REORDERED_CAUSAL_EDGE'));
});

Given(/^an approved design revision and digest plus a repository-verified component\/interface responsibility map$/, function (this: TaskSynthesisWorld) {
  this.input = baseInput(dddReality(), [lane(6, { scenarioId: 'SPECGEN004_662' })]);
});

When(/^deterministic task synthesis creates an AC\/BDD vertical outcome$/, function (this: TaskSynthesisWorld) {
  this.result = run.call(this);
});

Then(/^the stored SpecGraph contains one canonical task with exact source locations and interfaces$/, function (this: TaskSynthesisWorld) {
  const task = this.result!.graph.tasks[0];
  assert.equal(this.result!.graph.tasks.length, 1);
  assert.ok(task.sourceLocations.requirement.file && task.sourceLocations.acceptanceCriterion.file && task.sourceLocations.scenario.file);
  assert.ok(task.interfaces.every((item) => item.location.file && item.location.line > 0));
});

Then(/^its ordered (\d+)–(\d+)-minute BDD-only RED, GREEN, and REFACTOR steps are embedded in its brief rather than separately schedulable graph nodes$/, function (this: TaskSynthesisWorld, minimum: string, maximum: string) {
  const task = this.result!.tasks[0];
  assert.equal(Number(minimum), 2);
  assert.equal(Number(maximum), 5);
  assert.deepEqual(task.causalSteps.map((item) => item.phase), ['RED', 'GREEN', 'REFACTOR']);
  const minMinutes = Number(minimum);
  const maxMinutes = Number(maximum);
  assert.ok(task.causalSteps.every((item) => item.estimateMinutes >= minMinutes && item.estimateMinutes <= maxMinutes && item.bddOnly && !item.schedulable));
  assert.equal(this.result!.graph.tasks.length, 1);
  assert.ok(task.brief.includes('BDD-only steps'));
});

Then('conditional `domainMode: ddd` retains only verified boundaries while `domainMode: none` invents no domain entities', function (this: TaskSynthesisWorld) {
  assert.ok(this.result!.tasks[0].boundaries.every((item) => item.name));
  assert.deepEqual(this.result!.tasks[0].domainEntities, []);
  const none = synthesizeTasks(baseInput(noneReality(), [lane(6, { scenarioId: 'SPECGEN004_662' })]));
  assert.equal(none.domainMode, 'none');
  assert.deepEqual(none.tasks[0].domainEntities, []);
});

Given('a synthesized task set with a placeholder, an unconserved lane, missing ownership, no exact interface location, infeasible work, an untyped causal edge, and incomplete surfaces', function (this: TaskSynthesisWorld) {
  this.input = baseInput(dddReality(), [lane(3)]);
  const valid = synthesizeTasks(this.input);
  const task = {
    ...valid.graph.tasks[0],
    title: 'TODO placeholder task',
    declaredStatus: 'READY' as const,
    ownership: { ...valid.graph.tasks[0].ownership, laneId: '' },
    interfaces: [],
    infeasible: true,
    surfaces: valid.graph.tasks[0].surfaces.filter((item) => item.access === 'read'),
    causalEdges: [{ ...valid.graph.tasks[0].causalEdges[0], type: undefined }] as unknown as typeof valid.graph.tasks[0]['causalEdges'],
  };
  const graph = { ...valid.graph, tasks: [task], laneOwnership: [] };
  this.result = { ...valid, graph, planningGraph: graph, tasks: graph.tasks, findings: [] };
  this.expectedFindingCodes = ['PLACEHOLDER_TASK', 'UNCONSERVED_ACCEPTANCE_LANE', 'MISSING_OWNERSHIP', 'MISSING_EXACT_INTERFACE', 'INFEASIBLE_WORK', 'UNTYPED_CAUSAL_EDGE', 'INCOMPLETE_SURFACES'];
});

When('the deterministic pre-planner synthesis review runs', function (this: TaskSynthesisWorld) {
  assert.ok(this.result);
  this.result = { ...this.result!, review: reviewSynthesis(this.result!), accepted: false };
  this.result = { ...this.result!, findings: this.result!.review.findings };
});

Then('planning is rejected with stable named findings for every violation', function (this: TaskSynthesisWorld) {
  const codes = new Set(this.result!.findings.map((item) => item.code));
  assert.equal(this.result!.accepted, false);
  for (const code of this.expectedFindingCodes!) assert.ok(codes.has(code), `missing named finding ${code}`);
});

Then('a cyclic or reordered BDD-only RED to GREEN to REFACTOR edge is rejected before batching', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  const sourceEdge = task.causalEdges[0];
  assert.ok(sourceEdge, 'the invalid fixture must retain one typed causal edge');
  const invalidTask = { ...task, causalEdges: [...task.causalEdges, { ...sourceEdge, from: sourceEdge.to, to: sourceEdge.from }] };
  const invalidGraph = { ...this.result!.graph, tasks: [invalidTask] };
  const review = reviewSynthesis(invalidGraph);
  assert.ok(review.findings.some((item) => item.code === 'CYCLIC_CAUSAL_EDGE' || item.code === 'REORDERED_CAUSAL_EDGE'));
  assert.equal(projectTaskPlan(invalidGraph).batches.every((batch) => batch.safe), true);
});

Given('canonical tasks with exact source context, interfaces, typed dependencies, predecessor summaries, scenarios, evidence commands, blockers, and declared surfaces', function (this: TaskSynthesisWorld) {
  const first = lane(1, {
    laneId: 'lane-a',
    scenarioId: 'SPECGEN004_664-A',
    surfaces: [
      { kind: 'file', access: 'read', locator: 'tools/spec-graph/task-contract.ts', scope: 'repository', rationale: 'first lane input', exactInterface: 'CanonicalTask', verified: true },
      { kind: 'file', access: 'write', locator: 'tools/spec-graph/task-synthesis-a.ts', scope: 'repository', rationale: 'first lane output', exactInterface: 'synthesizeLaneA', verified: true },
      { kind: 'test-resource', access: 'exclusive', locator: 'SPECGEN004_664-A', scope: 'scenario', rationale: 'first lane evidence', exactInterface: 'laneA', verified: true },
    ],
  });
  const second = lane(2, {
    laneId: 'lane-b',
    scenarioId: 'SPECGEN004_664-B',
    surfaces: [
      { kind: 'file', access: 'read', locator: 'tools/spec-graph/task-scheduling.ts', scope: 'repository', rationale: 'second lane input', exactInterface: 'TaskSchedule', verified: true },
      { kind: 'file', access: 'write', locator: 'tools/spec-graph/task-synthesis-b.ts', scope: 'repository', rationale: 'second lane output', exactInterface: 'synthesizeLaneB', verified: true },
      { kind: 'test-resource', access: 'exclusive', locator: 'SPECGEN004_664-B', scope: 'scenario', rationale: 'second lane evidence', exactInterface: 'laneB', verified: true },
    ],
  });
  this.input = baseInput(dddReality(), [first, second]);
});

When('`TaskPlanResult` is projected for an AI agent', function (this: TaskSynthesisWorld) {
  this.result = run.call(this);
  this.plan = projectTaskPlan(this.result);
});

Then('each task brief is self-contained from the stored SpecGraph without a second plan authority or executor', function (this: TaskSynthesisWorld) {
  assert.equal(this.plan!.authority, 'task-synthesis');
  assert.equal(this.plan!.secondPlanAuthority, false);
  assert.equal(this.plan!.executor, null);
  assert.equal(this.plan!.briefs.length, 2);
  for (const brief of this.plan!.briefs) {
    assert.ok(brief.fullTaskText && brief.exactSourceLocations && brief.interfaces && brief.evidenceCommands && brief.machineNextAction);
  }
});

Then('a safe batch includes pairwise proof of no causal path in either direction and no conflict pair rather than an assertion in prose', function (this: TaskSynthesisWorld) {
  assert.ok(this.plan!.pairwiseProofs.length >= 1);
  const proof = this.plan!.pairwiseProofs[0];
  assert.equal(proof.proof.noCausalPathEitherDirection, true);
  assert.deepEqual(proof.causalPathLeftToRight, []);
  assert.deepEqual(proof.causalPathRightToLeft, []);
  assert.equal(proof.proof.noConflictPair, true);
  assert.equal(proof.conflictPair, null);
  assert.equal(proof.safe, true);
  assert.ok(this.plan!.batches.some((batch) => batch.taskIds.length === 2 && batch.safe && batch.pairwiseProofs.length === 1 && batch.pairwiseProofs[0].safe));
  assert.equal(new Set(this.plan!.batches.flatMap((batch) => batch.taskIds)).size, this.result!.tasks.length);
});

Given('strict synthesis receives unresolved registries dependency targets and blank causal step text', function (this: TaskSynthesisWorld) {
  const invalidLane = lane(12, {
    requirementId: 'FR-MISSING',
    acceptanceCriterionId: 'AC-MISSING',
    dependencies: [{ targetId: 'missing:task', relation: 'depends-on', strength: 'hard', reason: 'missing predecessor' }],
    bddSteps: [
      { phase: 'RED', text: ' ', estimateMinutes: 2, bddOnly: true },
      { phase: 'GREEN', text: 'Implementation', estimateMinutes: 3, bddOnly: true },
      { phase: 'REFACTOR', text: 'Refactor', estimateMinutes: 2, bddOnly: true },
    ],
  });
  this.input = baseInput(dddReality(), [invalidLane]);
  this.input.acceptanceCriteria = [{ id: 'AC-OTHER', requirementId: 'FR-80', text: 'other', source: invalidLane.acceptanceSource, applicable: true }];
});

When('deterministic pre-scheduling synthesis reviews the lanes', function (this: TaskSynthesisWorld) {
  this.result = synthesizeTasks(this.input!);
});

Then('named blocking findings reject every invalid reference and blank causal step', function (this: TaskSynthesisWorld) {
  const codes = new Set(this.result!.findings.map((item) => item.code));
  assert.equal(this.result!.accepted, false);
  assert.equal(this.result!.review.accepted, false);
  assert.equal(finalizeSynthesis(this.result!).accepted, false);
  assert.equal(projectTaskPlan(this.result!).accepted, false);
  assert.ok(codes.has('UNKNOWN_REQUIREMENT_REFERENCE'));
  assert.ok(codes.has('UNKNOWN_ACCEPTANCE_REFERENCE'));
  assert.ok(codes.has('UNRESOLVED_DEPENDENCY'));
  assert.ok(codes.has('BLANK_CAUSAL_STEP_TEXT'));
});

Given('strict synthesis receives a mismatched requirement lane and an inapplicable acceptance lane', function (this: TaskSynthesisWorld) {
  const mismatchLane = lane(70, { laneId: 'FR-80:AC-OTHER-REQ', acceptanceCriterionId: 'AC-OTHER-REQ' });
  const inapplicableLane = lane(71, { laneId: 'FR-80:AC-INAPPLICABLE', acceptanceCriterionId: 'AC-INAPPLICABLE' });
  this.input = baseInput(dddReality(), [mismatchLane, inapplicableLane]);
  this.input.acceptanceCriteria = [
    { id: 'AC-OTHER-REQ', requirementId: 'FR-81', text: 'belongs to another requirement', source: mismatchLane.acceptanceSource, applicable: true },
    { id: 'AC-INAPPLICABLE', requirementId: 'FR-80', text: 'waived for this revision', source: inapplicableLane.acceptanceSource, applicable: false },
  ];
});

When('deterministic synthesis finalizes and projects the mismatched plan', function (this: TaskSynthesisWorld) {
  this.result = synthesizeTasks(this.input!);
  this.plan = projectTaskPlan(this.result!);
});

Then('mismatched and inapplicable lanes are rejected without an accepted projection', function (this: TaskSynthesisWorld) {
  const mismatch = this.result!.findings.filter((item) => item.code === 'AC_REQUIREMENT_MISMATCH');
  const inapplicable = this.result!.findings.filter((item) => item.code === 'INAPPLICABLE_ACCEPTANCE_REFERENCE');
  assert.ok(mismatch.length >= 1, 'AC_REQUIREMENT_MISMATCH finding missing');
  assert.ok(inapplicable.length >= 1, 'INAPPLICABLE_ACCEPTANCE_REFERENCE finding missing');
  assert.ok([...mismatch, ...inapplicable].every((item) => item.severity === 'error'));
  assert.equal(this.result!.accepted, false);
  assert.equal(this.result!.review.accepted, false);
  assert.equal(finalizeSynthesis(this.result!).accepted, false);
  assert.equal(this.plan!.accepted, false, 'a rejected synthesis must not project an accepted plan');
  assert.ok(this.plan!.findings.some((item) => item.code === 'AC_REQUIREMENT_MISMATCH'));
  assert.ok(this.plan!.findings.some((item) => item.code === 'INAPPLICABLE_ACCEPTANCE_REFERENCE'));
});

Then('only evidence-backed `DONE` completes a task while `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, and `BLOCKED` retain diagnostics and create follow-up proposals', function (this: TaskSynthesisWorld) {
  const task = this.result!.tasks[0];
  assert.equal(evidenceBackedDone(task, task.evidence).completes, true);
  for (const outcome of ['DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'] as const) {
    const lifecycle = evaluateLifecycleOutcome(task, outcome, false, ['diagnostic retained']);
    assert.equal(lifecycle.completes, false);
    assert.ok(lifecycle.diagnostics.length > 0);
    assert.ok(lifecycle.followUpProposals.length > 0);
  }
  this.lifecycle = evaluateLifecycleOutcome(task, 'DONE', false);
  assert.equal(this.lifecycle.completes, false);
});
