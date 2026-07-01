import { describe, it, expect } from 'vitest';
import {
  scenarioKey,
  specOf,
  bucketScenarios,
  mapTasksToScenarios,
  verifiedStatus,
  computeCoverage,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from '../coverage.ts';

describe('scenarioKey', () => {
  it('normalises SPECGEN004 ids from a slug node id', () => {
    expect(scenarioKey('SCEN-specgen004-70-spec-status-derives')).toBe('specgen004_70');
  });
  it('normalises a raw Done-When mention', () => {
    expect(scenarioKey('@feature32 SPECGEN004_71 passes')).toBe('specgen004_71');
  });
  it('tolerates the legacy SCENGEN004 typo', () => {
    expect(scenarioKey('SCENGEN004_55 implements edges')).toBe('specgen004_55');
  });
  it('returns null when no id present', () => {
    expect(scenarioKey('just some prose')).toBeNull();
  });
});

describe('bucketScenarios — conservation invariant', () => {
  const scenarios: ScenarioLike[] = [
    { id: 'a', tags: [], result: 'PASSED' },
    { id: 'b', tags: [], result: 'passed' }, // case-insensitive
    { id: 'c', tags: [], result: 'PENDING' },
    { id: 'd', tags: [], result: 'UNDEFINED' },
    { id: 'e', tags: [], result: 'AMBIGUOUS' },
    { id: 'f', tags: [], result: 'FAILED' },
    { id: 'g', tags: [], result: 'SKIPPED' },
    { id: 'h', tags: [] }, // no result → undefined
    { id: 'i', tags: [], result: 'WEIRD' }, // unknown → undefined
  ];
  const buckets = bucketScenarios(scenarios);

  it('places each scenario in exactly one bucket (sum === total)', () => {
    const total = (Object.keys(buckets) as Bucket[]).reduce((n, b) => n + buckets[b].length, 0);
    expect(total).toBe(scenarios.length);
  });
  it('routes results to the right buckets', () => {
    expect(buckets.passed.sort()).toEqual(['a', 'b']);
    expect(buckets.pending).toEqual(['c']);
    expect(buckets.ambiguous).toEqual(['e']);
    expect(buckets.failed).toEqual(['f']);
    expect(buckets.skipped).toEqual(['g']);
  });
  it('separates not_run (ABSENT result) from undefined (UNDEFINED-steps or unknown present)', () => {
    // 2026-06-08 fix: a scenario absent from the last NDJSON (`h`) is `not_run`,
    // NOT `undefined`. `d` (real UNDEFINED result) + `i` (unknown present enum)
    // stay `undefined` — so a filtered run inflates not_run, not undefined.
    expect(buckets.not_run).toEqual(['h']);
    expect(buckets.undefined.sort()).toEqual(['d', 'i']);
  });
});

describe('mapTasksToScenarios', () => {
  const scenarios: ScenarioLike[] = [
    { id: 'SCEN-specgen004-70-x', tags: ['@feature32'], result: 'PASSED' },
    { id: 'SCEN-specgen004-71-y', tags: ['@feature32'], result: 'UNDEFINED' },
    { id: 'SCEN-specgen004-03-z', tags: ['@feature2'], result: 'PASSED' },
  ];

  it('maps via explicit SPECGEN id in Done-When', () => {
    const tasks: TaskLike[] = [{ id: 't1', doneWhen: 'SPECGEN004_70 passes', refs: [] }];
    expect(mapTasksToScenarios(tasks, scenarios).get('t1')).toEqual(['SCEN-specgen004-70-x']);
  });
  it('maps via @featureN tag in Done-When', () => {
    const tasks: TaskLike[] = [{ id: 't2', doneWhen: 'all @feature32 green', refs: [] }];
    expect(mapTasksToScenarios(tasks, scenarios).get('t2')!.sort()).toEqual([
      'SCEN-specgen004-70-x',
      'SCEN-specgen004-71-y',
    ]);
  });
  it('maps via FR ref → @feature<N>', () => {
    const tasks: TaskLike[] = [{ id: 't3', doneWhen: 'no explicit ids', refs: ['FR-2'] }];
    expect(mapTasksToScenarios(tasks, scenarios).get('t3')).toEqual(['SCEN-specgen004-03-z']);
  });
  it('de-dupes a scenario referenced by multiple sources', () => {
    // explicit _70 AND @feature32 (which also covers _70) → _70 appears once
    const tasks: TaskLike[] = [{ id: 't4', doneWhen: '@feature32 SPECGEN004_70', refs: ['FR-32'] }];
    const got = mapTasksToScenarios(tasks, scenarios).get('t4')!;
    expect(new Set(got).size).toBe(got.length); // no duplicates
    expect(got).toContain('SCEN-specgen004-70-x');
  });
});

describe('specOf', () => {
  it('derives the spec slug from a .specs/<slug>/ path (POSIX + Windows)', () => {
    expect(specOf('.specs/spec-generator-v4/TASKS.md')).toBe('spec-generator-v4');
    expect(specOf('.specs\\auth\\auth.feature')).toBe('auth');
  });
  it('returns undefined for paths outside .specs/', () => {
    expect(specOf('tests/features/plugins/x.feature')).toBeUndefined();
  });
});

describe('mapTasksToScenarios — same-spec scoping (cross-spec @featureN collision)', () => {
  // @feature2 exists in TWO specs; only specA's scenario is run (PASSED), specB's
  // is never run (UNDEFINED). A specA task must not be dragged down by specB.
  const scenarios: ScenarioLike[] = [
    { id: 'SCEN-a-2', tags: ['@feature2'], result: 'PASSED', spec: 'specA' },
    { id: 'SCEN-b-2', tags: ['@feature2'], result: 'UNDEFINED', spec: 'specB' },
  ];

  it('scopes FR-ref tag matches to the task’s own spec', () => {
    const task: TaskLike[] = [{ id: 't', doneWhen: '', refs: ['FR-2'], spec: 'specA' }];
    expect(mapTasksToScenarios(task, scenarios).get('t')).toEqual(['SCEN-a-2']);
  });

  it('scopes @featureN-in-DoneWhen matches to the task’s own spec', () => {
    const task: TaskLike[] = [{ id: 't', doneWhen: 'all @feature2 green', refs: [], spec: 'specA' }];
    expect(mapTasksToScenarios(task, scenarios).get('t')).toEqual(['SCEN-a-2']);
  });

  it('a specA task with FR-2 is DONE despite specB’s unrun @feature2 scenario', () => {
    const tasks: TaskLike[] = [{ id: 'cross', doneWhen: '', refs: ['FR-2'], spec: 'specA' }];
    expect(computeCoverage(tasks, scenarios).tasks['cross'].verified_status).toBe('DONE');
  });

  it('legacy behaviour preserved: an undefined task.spec is NOT scoped', () => {
    const tasks: TaskLike[] = [{ id: 'legacy', doneWhen: '', refs: ['FR-2'] }];
    // maps to both → one is undefined → IN_PROGRESS (old, un-scoped contract)
    expect(computeCoverage(tasks, scenarios).tasks['legacy'].verified_status).toBe('IN_PROGRESS');
  });

  it('explicit SPECGEN id is never scoped (unambiguous direct reference)', () => {
    const scen: ScenarioLike[] = [{ id: 'SCEN-specgen004-70-x', tags: [], result: 'PASSED', spec: 'specB' }];
    const task: TaskLike[] = [{ id: 't', doneWhen: 'SPECGEN004_70 passes', refs: [], spec: 'specA' }];
    expect(mapTasksToScenarios(task, scen).get('t')).toEqual(['SCEN-specgen004-70-x']);
  });
});

describe('verifiedStatus', () => {
  const bucketById = new Map<string, Bucket>([
    ['s1', 'passed'],
    ['s2', 'passed'],
    ['s3', 'undefined'],
  ]);
  it('unverified when no mapped scenarios', () => {
    expect(verifiedStatus([], bucketById)).toBe('unverified');
  });
  it('DONE only when every mapped scenario passed', () => {
    expect(verifiedStatus(['s1', 's2'], bucketById)).toBe('DONE');
  });
  it('IN_PROGRESS when any mapped scenario is non-green (never DONE)', () => {
    expect(verifiedStatus(['s1', 's3'], bucketById)).toBe('IN_PROGRESS');
  });
});

describe('computeCoverage — end to end', () => {
  const scenarios: ScenarioLike[] = [
    { id: 'SCEN-specgen004-70-x', tags: ['@feature32'], result: 'PASSED' },
    { id: 'SCEN-specgen004-71-y', tags: ['@feature32'], result: 'UNDEFINED' },
  ];
  const tasks: TaskLike[] = [
    { id: 'done-task', doneWhen: 'SPECGEN004_70 passes', refs: [] },
    { id: 'mixed-task', doneWhen: '@feature32 SPECGEN004_70 SPECGEN004_71', refs: [] },
    { id: 'orphan-task', doneWhen: 'no scenarios here', refs: [] },
  ];
  const report = computeCoverage(tasks, scenarios);

  it('totals reconcile with buckets', () => {
    const sum = (Object.keys(report.buckets) as Bucket[]).reduce((n, b) => n + report.totals[b], 0);
    expect(sum).toBe(report.totals.scenarios);
    expect(report.totals.scenarios).toBe(2);
  });
  it('honesty gate: a task with one undefined scenario is never DONE', () => {
    expect(report.tasks['done-task'].verified_status).toBe('DONE');
    expect(report.tasks['mixed-task'].verified_status).toBe('IN_PROGRESS');
    expect(report.tasks['orphan-task'].verified_status).toBe('unverified');
  });
});
