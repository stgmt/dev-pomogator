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
  specOf,
  bucketScenarios,
  mapTasksToScenarios,
  computeCoverage,
  verifiedStatus,
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
  covSpecOf?: Record<string, string | undefined>;
  covScope?: { frRef?: string[]; tag?: string[]; explicit?: string[]; crossDone?: string; legacy?: string };
  covVerified?: Record<string, string>;
  covReport?: ReturnType<typeof computeCoverage>;
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

// SPECGEN004_204 — specOf slug-from-path (migrated from coverage.test.ts).
Given('the coverage specOf path helper', function () {
  // pure function — applied in the When
});

When('it reads a POSIX spec path a Windows spec path and a path outside the specs tree', function (this: CovWorld) {
  this.covSpecOf = {
    posix: specOf('.specs/spec-generator-v4/TASKS.md'),
    win: specOf('.specs\\auth\\auth.feature'),
    outside: specOf('tests/features/plugins/x.feature'),
  };
});

Then('it derives the slug for both separators and returns undefined outside the specs tree', function (this: CovWorld) {
  const s = this.covSpecOf!;
  assert.equal(s.posix, 'spec-generator-v4', 'POSIX .specs/<slug>/ path');
  assert.equal(s.win, 'auth', 'Windows .specs\\<slug>\\ path');
  assert.equal(s.outside, undefined, 'a path outside the specs tree is undefined');
});

// SPECGEN004_205 — same-spec scoping (cross-spec featureN collision); migrated from coverage.test.ts.
const SCOPE_SCENARIOS: ScenarioLike[] = [
  { id: 'SCEN-a-2', tags: ['@feature2'], result: 'PASSED', spec: 'specA' },
  { id: 'SCEN-b-2', tags: ['@feature2'], result: 'UNDEFINED', spec: 'specB' },
];

Given("two specs sharing a featureN tag where only the first spec's scenario ran", function (this: CovWorld) {
  this.covScenarios = SCOPE_SCENARIOS;
});

When('a task in the first spec is mapped by FR-ref by tag by explicit id and as a legacy unscoped task', function (this: CovWorld) {
  const sc = this.covScenarios!;
  this.covScope = {
    frRef: mapTasksToScenarios([{ id: 't', doneWhen: '', refs: ['FR-2'], spec: 'specA' }], sc).get('t'),
    tag: mapTasksToScenarios([{ id: 't', doneWhen: 'all @feature2 green', refs: [], spec: 'specA' }], sc).get('t'),
    crossDone: computeCoverage([{ id: 'cross', doneWhen: '', refs: ['FR-2'], spec: 'specA' }], sc).tasks['cross'].verified_status,
    legacy: computeCoverage([{ id: 'legacy', doneWhen: '', refs: ['FR-2'] }], sc).tasks['legacy'].verified_status,
    explicit: mapTasksToScenarios(
      [{ id: 't', doneWhen: 'SPECGEN004_70 passes', refs: [], spec: 'specA' }],
      [{ id: 'SCEN-specgen004-70-x', tags: [], result: 'PASSED', spec: 'specB' }],
    ).get('t'),
  };
});

Then(
  'FR-ref and tag matches scope to the first spec its task is DONE an explicit id is never scoped and a legacy unscoped task stays IN_PROGRESS',
  function (this: CovWorld) {
    const s = this.covScope!;
    assert.deepEqual(s.frRef, ['SCEN-a-2'], 'FR-ref tag match scoped to specA');
    assert.deepEqual(s.tag, ['SCEN-a-2'], '@featureN-in-DoneWhen match scoped to specA');
    assert.equal(s.crossDone, 'DONE', 'a specA task is DONE despite specB unrun @feature2');
    assert.equal(s.legacy, 'IN_PROGRESS', 'a legacy undefined-spec task is NOT scoped (old contract)');
    assert.deepEqual(s.explicit, ['SCEN-specgen004-70-x'], 'an explicit SPECGEN id is never scoped');
  },
);

// SPECGEN004_206 — verifiedStatus DONE-only-when-all-passed (migrated from coverage.test.ts).
Given('a bucket-by-id map with two passed scenarios and one undefined', function () {
  // the map is built in the When (kept local — verifiedStatus is pure)
});

When('verifiedStatus is asked for no scenarios for the two passed and for a passed-plus-undefined mix', function (this: CovWorld) {
  const bucketById = new Map<string, Bucket>([
    ['s1', 'passed'],
    ['s2', 'passed'],
    ['s3', 'undefined'],
  ]);
  this.covVerified = {
    none: verifiedStatus([], bucketById),
    allPassed: verifiedStatus(['s1', 's2'], bucketById),
    mixed: verifiedStatus(['s1', 's3'], bucketById),
  };
});

Then('it is unverified with none DONE with all passed and IN_PROGRESS as soon as one is non-green', function (this: CovWorld) {
  const v = this.covVerified!;
  assert.equal(v.none, 'unverified', 'no mapped scenarios → unverified');
  assert.equal(v.allPassed, 'DONE', 'every mapped scenario passed → DONE');
  assert.equal(v.mixed, 'IN_PROGRESS', 'any non-green mapped scenario → IN_PROGRESS (never DONE)');
});

// SPECGEN004_207 — computeCoverage end-to-end (migrated from coverage.test.ts); completes the file.
When('computeCoverage scores them end to end', function (this: CovWorld) {
  const scenarios: ScenarioLike[] = [
    { id: 'SCEN-specgen004-70-x', tags: ['@feature32'], result: 'PASSED' },
    { id: 'SCEN-specgen004-71-y', tags: ['@feature32'], result: 'UNDEFINED' },
  ];
  const tasks: TaskLike[] = [
    { id: 'done-task', doneWhen: 'SPECGEN004_70 passes', refs: [] },
    { id: 'mixed-task', doneWhen: '@feature32 SPECGEN004_70 SPECGEN004_71', refs: [] },
    { id: 'orphan-task', doneWhen: 'no scenarios here', refs: [] },
  ];
  this.covReport = computeCoverage(tasks, scenarios);
});

Given('a coverage run over one passed and one undefined scenario with a done a mixed and an orphan task', function () {
  // inputs + computeCoverage applied in the When (kept together — pure)
});

Then(
  'the bucket totals reconcile with the scenario count and the done task is DONE the mixed task IN_PROGRESS and the orphan task unverified',
  function (this: CovWorld) {
    const r = this.covReport!;
    const sum = (Object.keys(r.buckets) as Bucket[]).reduce((n, b) => n + r.totals[b], 0);
    assert.equal(sum, r.totals.scenarios, 'bucket totals reconcile with the scenario count');
    assert.equal(r.totals.scenarios, 2);
    assert.equal(r.tasks['done-task'].verified_status, 'DONE', 'all mapped scenarios passed → DONE');
    assert.equal(r.tasks['mixed-task'].verified_status, 'IN_PROGRESS', 'one undefined scenario → never DONE (honesty gate)');
    assert.equal(r.tasks['orphan-task'].verified_status, 'unverified', 'no mapped scenarios → unverified');
  },
);
