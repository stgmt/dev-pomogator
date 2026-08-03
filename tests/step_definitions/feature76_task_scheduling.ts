import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createPlanningTask, buildDependencyGraph } from '../../tools/spec-graph/task-dependencies.ts';
import { deriveConflicts } from '../../tools/spec-graph/task-conflicts.ts';
import { calculateCriticalPath, partitionWaves, planSchedule, roundEstimateHalfUp, runSchedulingPerformanceHarness, type CriticalPathMetrics, type SchedulePlan, type ScheduleWave } from '../../tools/spec-graph/task-scheduling.ts';
import type { CanonicalTask } from '../../tools/spec-graph/task-contract.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface SchedulingWorld extends V4World {
  tasks?: CanonicalTask[];
  plan?: SchedulePlan;
  waves?: ScheduleWave[];
  metrics?: CriticalPathMetrics;
  cold?: SchedulePlan;
  warm?: SchedulePlan;
  harness?: ReturnType<typeof runSchedulingPerformanceHarness>;
}

function task(id: string, estimateMinutes: number, overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return createPlanningTask(`spec-generator-v4:${id}`, { estimateMinutes, ...overrides });
}

Given('A precedes B and C is independent', function (this: SchedulingWorld) {
  this.tasks = [
    task('A-636', 5),
    task('B-636', 10, { dependencies: [{ targetId: 'spec-generator-v4:A-636', relation: 'depends-on', strength: 'hard', reason: 'A must complete first' }] }),
    task('C-636', 3),
  ];
});

When('selected subgraph is planned', function (this: SchedulingWorld) {
  assert.ok(this.tasks);
  this.plan = planSchedule(this.tasks!);
});

Then('A and C occur before B in labelled waves', function (this: SchedulingWorld) {
  assert.ok(this.plan);
  assert.deepEqual(this.plan!.waves.map((wave) => wave.taskIds), [['spec-generator-v4:A-636', 'spec-generator-v4:C-636'], ['spec-generator-v4:B-636']]);
  assert.equal(this.plan!.waves[0].wave, 0);
  assert.equal(this.plan!.waves[1].wave, 1);
});

Given('a wave has two conflicting tasks and one independent task', function (this: SchedulingWorld) {
  this.tasks = [
    task('left-637', 5, { surfaces: [{ kind: 'file', access: 'write', locator: 'src/shared-637.ts', scope: 'repository', rationale: 'left wave claim' }] }),
    task('right-637', 5, { surfaces: [{ kind: 'file', access: 'write', locator: 'src/shared-637.ts', scope: 'repository', rationale: 'right wave claim' }] }),
    task('independent-637', 5, { surfaces: [{ kind: 'file', access: 'write', locator: 'src/independent-637.ts', scope: 'repository', rationale: 'independent wave claim' }] }),
  ];
});

When('planner partitions it', function (this: SchedulingWorld) {
  assert.ok(this.tasks);
  const graph = buildDependencyGraph(this.tasks!);
  this.waves = partitionWaves(this.tasks!, graph, this.tasks!.map((task) => task.qualifiedId), deriveConflicts(this.tasks!));
});

Then('each batch is conflict free and union equals wave', function (this: SchedulingWorld) {
  assert.ok(this.waves);
  assert.equal(this.waves!.length, 1);
  const wave = this.waves![0];
  assert.equal(new Set(wave.batches.flat()).size, wave.taskIds.length);
  assert.deepEqual([...wave.batches.flat()].sort(), [...wave.taskIds].sort());
  assert.equal(wave.batches.length, 2);
  for (const batch of wave.batches) for (const left of batch) for (const right of batch) if (left !== right) assert.equal(left.includes('left-637') && right.includes('right-637'), false);
});

Given('acyclic graph with estimates and one documented default', function (this: SchedulingWorld) {
  this.tasks = [
    task('critical-a-638', 2),
    task('critical-b-638', 0, { dependencies: [{ targetId: 'spec-generator-v4:critical-a-638', relation: 'depends-on', strength: 'hard', reason: 'critical predecessor' }] }),
    task('side-638', 8),
  ];
});

When('metrics calculate', function (this: SchedulingWorld) {
  assert.ok(this.tasks);
  this.metrics = calculateCriticalPath(this.tasks!, buildDependencyGraph(this.tasks!), undefined, { defaultEstimateMinutes: 7 });
});

Then('weighted critical path slack and default marker return', function (this: SchedulingWorld) {
  assert.ok(this.metrics);
  assert.deepEqual(this.metrics!.criticalPath, ['spec-generator-v4:critical-a-638', 'spec-generator-v4:critical-b-638']);
  assert.equal(this.metrics!.criticalPathMinutes, 9);
  assert.equal(this.metrics!.defaultEstimateTaskIds.includes('spec-generator-v4:critical-b-638'), true);
  assert.equal(this.metrics!.slack['spec-generator-v4:critical-a-638'], 0);
  assert.equal(this.metrics!.slack['spec-generator-v4:critical-b-638'], 0);
  assert.equal(this.metrics!.slack['spec-generator-v4:side-638'], 1);
});

Given('blocked task lies on critical path', function (this: SchedulingWorld) {
  this.tasks = [
    task('blocked-a-639', 5, { declaredStatus: 'IN_PROGRESS' }),
    task('blocked-b-639', 5, { declaredStatus: 'BLOCKED', dependencies: [{ targetId: 'spec-generator-v4:blocked-a-639', relation: 'depends-on', strength: 'hard', reason: 'blocked predecessor is required' }] }),
    task('blocked-c-639', 5, { dependencies: [{ targetId: 'spec-generator-v4:blocked-b-639', relation: 'depends-on', strength: 'hard', reason: 'downstream critical work' }] }),
  ];
});

When('plan reports schedule', function (this: SchedulingWorld) {
  assert.ok(this.tasks);
  this.plan = planSchedule(this.tasks!);
});

Then('blocker reason and affected downstream path are shown', function (this: SchedulingWorld) {
  assert.ok(this.plan);
  const blocked = this.plan!.blockers.find((item) => item.taskId.endsWith('blocked-b-639'));
  assert.ok(blocked);
  assert.equal(blocked!.blockers[0].reason, 'blocked predecessor is required');
  assert.deepEqual(blocked!.affectedDownstreamTaskIds, ['spec-generator-v4:blocked-c-639']);
  assert.equal(blocked!.affectedCriticalPath, true);
});

Given('unchanged selected graph with equal candidates', function (this: SchedulingWorld) {
  this.tasks = Array.from({ length: 6 }, (_, index) => task(`tie-${String(index).padStart(2, '0')}-640`, index % 2 === 0 ? 2.345 : 2.355));
});

When('cold and warm planning run', function (this: SchedulingWorld) {
  assert.ok(this.tasks);
  this.cold = planSchedule(this.tasks!);
  this.warm = planSchedule(this.tasks!);
  this.harness = runSchedulingPerformanceHarness(this.tasks!, { edgeCount: 450, claimCount: 1500, budgetMs: 300 });
});

Then(/^stable-key JSON for waves, batches, critical path, slack, normalized-ID tie order, and half-up estimate rounding is byte-equivalent and warm p95 meets the 300-task\/450-edge\/1500-claim harness budget$/, function (this: SchedulingWorld) {
  assert.ok(this.cold && this.warm && this.harness);
  assert.equal(this.cold!.stableKeyJson, this.warm!.stableKeyJson);
  assert.deepEqual(this.cold!.normalizedIdTieOrder, this.tasks!.map((task) => task.qualifiedId).sort((left, right) => left.localeCompare(right)));
  assert.equal(roundEstimateHalfUp(2.345), 2.35);
  assert.equal(roundEstimateHalfUp(2.355), 2.36);
  assert.equal(this.harness!.stable, true);
  assert.equal(this.harness!.edgeCount, 450);
  assert.equal(this.harness!.claimCount, 1500);
  assert.equal(this.harness!.withinBudget, true);
});
