/**
 * @feature32 step definitions (FR-32 — coverage rollup) — SPECGEN004_201+.
 *
 * P3-rollout migration of tools/spec-graph/__tests__/coverage.test.ts (23 pure cases, done by
 * describe-block in passes). This first block migrates `scenarioKey` — drives the REAL normaliser
 * in-process (pure, deterministic). The vitest twin stays until the gate-switch.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_201
 * @see tools/spec-graph/coverage.ts (scenarioKey)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  scenarioKey,
  bucketScenarios,
  mapTasksToScenarios,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from '../../tools/spec-graph/coverage.ts';
import { V4World } from '../hooks/before-after.ts';
import '../hooks/before-after.ts';

interface CovWorld extends V4World {
  covKeys?: Record<string, string | null>;
  covScenarios?: ScenarioLike[];
  covBuckets?: ReturnType<typeof bucketScenarios>;
  covMaps?: Record<string, string[] | undefined>;
}

Given('the coverage scenarioKey normaliser', function () {
  // pure function — applied in the When
});

When('it normalises a slug node id a raw Done-When mention a legacy-typo id and plain prose', function (this: CovWorld) {
  this.covKeys = {
    slug: scenarioKey('SCEN-specgen004-70-spec-status-derives'),
    mention: scenarioKey('@feature32 SPECGEN004_71 passes'),
    typo: scenarioKey('SCENGEN004_55 implements edges'),
    prose: scenarioKey('just some prose'),
  };
});

Then('it yields the canonical specgen004 id tolerates the legacy SCENGEN typo and returns null for prose', function (this: CovWorld) {
  const k = this.covKeys!;
  assert.equal(k.slug, 'specgen004_70', 'a slug node id normalises to the canonical id');
  assert.equal(k.mention, 'specgen004_71', 'a raw Done-When mention normalises');
  assert.equal(k.typo, 'specgen004_55', 'the legacy SCENGEN004 typo is tolerated');
  assert.equal(k.prose, null, 'plain prose with no id yields null');
});

// SPECGEN004_202 — bucketScenarios conservation + routing (migrated from coverage.test.ts).
Given('a set of scenarios with mixed results including an absent and an unknown one', function (this: CovWorld) {
  this.covScenarios = [
    { id: 'a', tags: [], result: 'PASSED' },
    { id: 'b', tags: [], result: 'passed' },
    { id: 'c', tags: [], result: 'PENDING' },
    { id: 'd', tags: [], result: 'UNDEFINED' },
    { id: 'e', tags: [], result: 'AMBIGUOUS' },
    { id: 'f', tags: [], result: 'FAILED' },
    { id: 'g', tags: [], result: 'SKIPPED' },
    { id: 'h', tags: [] },
    { id: 'i', tags: [], result: 'WEIRD' },
  ];
});

When('bucketScenarios partitions them', function (this: CovWorld) {
  this.covBuckets = bucketScenarios(this.covScenarios!);
});

Then(
  'every scenario lands in exactly one bucket the results route to the right buckets and an absent result is not_run while UNDEFINED-or-unknown stays undefined',
  function (this: CovWorld) {
    const b = this.covBuckets!;
    const total = (Object.keys(b) as Bucket[]).reduce((n, k) => n + b[k].length, 0);
    assert.equal(total, this.covScenarios!.length, 'sum of buckets === total (conservation invariant)');
    assert.deepEqual([...b.passed].sort(), ['a', 'b']);
    assert.deepEqual(b.pending, ['c']);
    assert.deepEqual(b.ambiguous, ['e']);
    assert.deepEqual(b.failed, ['f']);
    assert.deepEqual(b.skipped, ['g']);
    assert.deepEqual(b.not_run, ['h'], 'an absent result is not_run');
    assert.deepEqual([...b.undefined].sort(), ['d', 'i'], 'a real UNDEFINED result + an unknown enum stay undefined');
  },
);

// SPECGEN004_203 — mapTasksToScenarios core mapping (migrated from coverage.test.ts).
const MAP_SCENARIOS: ScenarioLike[] = [
  { id: 'SCEN-specgen004-70-x', tags: ['@feature32'], result: 'PASSED' },
  { id: 'SCEN-specgen004-71-y', tags: ['@feature32'], result: 'UNDEFINED' },
  { id: 'SCEN-specgen004-03-z', tags: ['@feature2'], result: 'PASSED' },
];

Given('a coverage scenario set tagged with SPECGEN ids @featureN tags and FR refs', function (this: CovWorld) {
  this.covScenarios = MAP_SCENARIOS;
});

When('tasks are mapped by explicit id by tag by FR-ref and by multiple overlapping sources', function (this: CovWorld) {
  const sc = this.covScenarios!;
  const map = (task: TaskLike) => mapTasksToScenarios([task], sc).get(task.id);
  this.covMaps = {
    byId: map({ id: 't1', doneWhen: 'SPECGEN004_70 passes', refs: [] }),
    byTag: map({ id: 't2', doneWhen: 'all @feature32 green', refs: [] }),
    byFr: map({ id: 't3', doneWhen: 'no explicit ids', refs: ['FR-2'] }),
    overlap: map({ id: 't4', doneWhen: '@feature32 SPECGEN004_70', refs: ['FR-32'] }),
  };
});

Then('each task resolves to the right scenarios and a scenario reached by overlapping sources appears once', function (this: CovWorld) {
  const m = this.covMaps!;
  assert.deepEqual(m.byId, ['SCEN-specgen004-70-x'], 'explicit SPECGEN id in Done-When');
  assert.deepEqual([...m.byTag!].sort(), ['SCEN-specgen004-70-x', 'SCEN-specgen004-71-y'], '@featureN tag in Done-When');
  assert.deepEqual(m.byFr, ['SCEN-specgen004-03-z'], 'FR ref → @feature<N>');
  assert.equal(new Set(m.overlap).size, m.overlap!.length, 'overlapping sources de-dupe');
  assert.ok(m.overlap!.includes('SCEN-specgen004-70-x'), 'the overlapping scenario is present (once)');
});
