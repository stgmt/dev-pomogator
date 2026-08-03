import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { buildDependencyGraph, createPlanningTask, evaluateTaskReadiness, proposeDependency, projectDependencyGraph, restoreDependencyGraph, serializeDependencyGraph, type DependencyGraph, type TaskReadiness } from '../../tools/spec-graph/task-dependencies.ts';
import type { CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface DependencyWorld extends V4World {
  tasks?: CanonicalTask[];
  graph?: DependencyGraph;
  proposal?: ReturnType<typeof proposeDependency>;
  readiness?: TaskReadiness[];
  persisted?: string;
}

function task(id: string, overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return createPlanningTask(`spec-generator-v4:${id}`, overrides);
}

Given('task A depends-on task B because schema generation must finish', function (this: DependencyWorld) {
  this.tasks = [
    task('A', { dependencies: [{ targetId: 'spec-generator-v4:B', relation: 'depends-on', strength: 'hard', reason: 'schema generation must finish' }] }),
    task('B', { declaredStatus: 'DONE' }),
  ];
});

When('graph builds dependencies', function (this: DependencyWorld) {
  assert.ok(this.tasks);
  this.graph = buildDependencyGraph(this.tasks!);
});

Then('A has typed edge to B with that reason', function (this: DependencyWorld) {
  assert.ok(this.graph);
  assert.equal(this.graph!.edges.length, 1);
  assert.deepEqual(this.graph!.edges[0], {
    fromId: 'spec-generator-v4:A', toId: 'spec-generator-v4:B', relation: 'depends-on', strength: 'hard', reason: 'schema generation must finish',
  });
  assert.deepEqual(this.graph!.reverseBlockers['spec-generator-v4:B'], ['spec-generator-v4:A']);
});

Given('A depends-on B and B depends-on C', function (this: DependencyWorld) {
  this.tasks = [
    task('A', { dependencies: [{ targetId: 'spec-generator-v4:B', relation: 'depends-on', strength: 'hard', reason: 'A waits for B' }] }),
    task('B', { dependencies: [{ targetId: 'spec-generator-v4:C', relation: 'depends-on', strength: 'hard', reason: 'B waits for C' }] }),
    task('C'),
  ];
  this.graph = buildDependencyGraph(this.tasks);
});

When('dry-run proposes C depends-on A', function (this: DependencyWorld) {
  assert.ok(this.graph);
  const before = serializeDependencyGraph(this.graph!);
  this.proposal = proposeDependency(this.graph!, 'spec-generator-v4:C', { targetId: 'spec-generator-v4:A', relation: 'depends-on', strength: 'hard', reason: 'cycle test' });
  assert.equal(serializeDependencyGraph(this.graph!), before);
});

Then('response names cycle and DAG remains unchanged', function (this: DependencyWorld) {
  assert.ok(this.proposal && this.graph);
  assert.equal(this.proposal!.ok, false);
  assert.equal(this.proposal!.committed, false);
  assert.match(this.proposal!.message, /cycle/i);
  assert.equal(this.proposal!.graph, this.graph);
  assert.equal(this.graph!.edges.length, 2);
});

Given('task A depends-on incomplete B for contract publication', function (this: DependencyWorld) {
  this.tasks = [
    task('A', { dependencies: [{ targetId: 'spec-generator-v4:B', relation: 'depends-on', strength: 'hard', reason: 'contract publication requires predecessor' }] }),
    task('B', { declaredStatus: 'IN_PROGRESS' }),
  ];
});

When('task A is planned', function (this: DependencyWorld) {
  assert.ok(this.tasks);
  this.graph = buildDependencyGraph(this.tasks!);
  this.readiness = evaluateTaskReadiness(this.tasks!, this.graph);
});

Then('A shows B relation reason and state as blocker', function (this: DependencyWorld) {
  const result = this.readiness?.find((item) => item.taskId.endsWith(':A'));
  assert.ok(result);
  assert.equal(result!.state, 'BLOCKED');
  assert.deepEqual(result!.blockers.map((blocker) => ({ predecessorId: blocker.predecessorId, reason: blocker.reason, state: blocker.state })), [{ predecessorId: 'spec-generator-v4:B', reason: 'contract publication requires predecessor', state: 'BLOCKED' }]);
});

Given('task A says after B in prose and task C has unfinished typed predecessor', function (this: DependencyWorld) {
  this.tasks = [
    task('A', { comments: ['run after B'] }),
    task('B', { declaredStatus: 'DONE' }),
    task('C', { dependencies: [{ targetId: 'spec-generator-v4:B', relation: 'depends-on', strength: 'hard', reason: 'typed unfinished predecessor' }] }),
  ];
  this.tasks[1] = { ...this.tasks[1], declaredStatus: 'IN_PROGRESS' };
});

When('readiness is evaluated', function (this: DependencyWorld) {
  assert.ok(this.tasks);
  this.readiness = evaluateTaskReadiness(this.tasks!);
});

Then('A gets migration warning and C is not READY', function (this: DependencyWorld) {
  const a = this.readiness?.find((item) => item.taskId.endsWith(':A'));
  const c = this.readiness?.find((item) => item.taskId.endsWith(':C'));
  assert.ok(a && c);
  assert.equal(a!.state, 'MIGRATION_WARNING');
  assert.equal(a!.warnings[0].code, 'PROSE_ORDERING_MIGRATION');
  assert.equal(c!.state, 'BLOCKED');
});

Given('a valid typed DAG from TASKS.md', function (this: DependencyWorld) {
  this.tasks = [
    task('source'),
    task('middle', { dependencies: [{ targetId: 'spec-generator-v4:source', relation: 'depends-on', strength: 'hard', reason: 'source first' }] }),
    task('sink', { dependencies: [{ targetId: 'spec-generator-v4:middle', relation: 'depends-on', strength: 'hard', reason: 'middle first' }] }),
  ];
  this.graph = buildDependencyGraph(this.tasks);
  this.persisted = serializeDependencyGraph(this.graph);
});

When('source incremental and SQLite paths load it', function (this: DependencyWorld) {
  assert.ok(this.persisted && this.tasks);
  const source = restoreDependencyGraph(this.tasks!);
  const incremental = restoreDependencyGraph(this.persisted!);
  const sqliteProjection = projectDependencyGraph(incremental);
  assert.equal(serializeDependencyGraph(source), serializeDependencyGraph(incremental));
  this.graph = buildDependencyGraph(sqliteProjection.taskIds.map((id) => this.tasks!.find((candidate) => candidate.qualifiedId === id)!));
});

Then('ordered edges and reverse blockers match', function (this: DependencyWorld) {
  assert.ok(this.graph);
  assert.deepEqual(this.graph!.edges.map((edge) => `${edge.fromId}>${edge.toId}`), [
    'spec-generator-v4:middle>spec-generator-v4:source',
    'spec-generator-v4:sink>spec-generator-v4:middle',
  ]);
  assert.deepEqual(this.graph!.reverseBlockers['spec-generator-v4:source'], ['spec-generator-v4:middle']);
  assert.deepEqual(this.graph!.reverseBlockers['spec-generator-v4:middle'], ['spec-generator-v4:sink']);
});
