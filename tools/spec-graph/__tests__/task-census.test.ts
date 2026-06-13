/**
 * Unit: P21-6 per-spec honest task census (tools/spec-graph/task-census.ts).
 *
 * Synthetic 2-spec graph (no real corpus needed). Pins the signal semantics:
 *   - per-spec grouping + corpus totals,
 *   - open = todo/in-progress/blocked,
 *   - doneRed = DONE + a genuinely FAILED scenario,
 *   - doneUnrun = DONE + not_run OR no-scenario (can't confirm),
 *   - not_run EXCLUDED from doneRed (filtered-run poison resistance),
 *   - red wins over not_run (precedence),
 *   - all-passed DONE task is silent (genuinely confirmed),
 * plus the cache write/read + .prev rotation for the история line.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SpecGraph } from '../types.ts';
import {
  computeTaskCensus,
  writeTaskCensusCache,
  readTaskCensusCache,
  readTaskCensusPrev,
  taskCensusCachePath,
  sumTotal,
} from '../task-census.ts';

function makeGraph(): SpecGraph {
  const scen = (id: string, slug: string, result?: string) => ({ id, type: 'Scenario', tags: [], lastResult: result, file: `.specs/${slug}/x.feature` });
  const task = (id: string, slug: string, status: string, doneWhen: string) => ({ id, type: 'Task', status, refs: [], doneWhen, file: `.specs/${slug}/TASKS.md` });
  const nodes = new Map<string, unknown>([
    // demoA scenarios with distinct results
    ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'demoA', 'PASSED')],
    ['SCEN-specgen004-02-fail', scen('SCEN-specgen004-02-fail', 'demoA', 'FAILED')],
    ['SCEN-specgen004-03-notrun', scen('SCEN-specgen004-03-notrun', 'demoA', undefined)],
    // demoA tasks
    ['demoA:T-todo', task('demoA:T-todo', 'demoA', 'todo', '')],
    ['demoA:T-pass', task('demoA:T-pass', 'demoA', 'done', 'closed by SPECGEN004_01')], // confirmed → silent
    ['demoA:T-fail', task('demoA:T-fail', 'demoA', 'done', 'closed by SPECGEN004_02')], // red
    ['demoA:T-notrun', task('demoA:T-notrun', 'demoA', 'done', 'closed by SPECGEN004_03')], // unrun
    ['demoA:T-mixed', task('demoA:T-mixed', 'demoA', 'done', 'SPECGEN004_02 and SPECGEN004_03')], // red wins
    // demoB tasks
    ['demoB:T-inprog', task('demoB:T-inprog', 'demoB', 'in-progress', '')],
    ['demoB:T-noscen', task('demoB:T-noscen', 'demoB', 'done', 'pure docs, no scenario')], // unrun (no scen)
  ]);
  return { nodes } as unknown as SpecGraph;
}

describe('computeTaskCensus — per-spec signals', () => {
  it('groups by spec with correct open/doneRed/doneUnrun', () => {
    const c = computeTaskCensus(makeGraph());
    const a = c.specs.find((s) => s.slug === 'demoA')!;
    const b = c.specs.find((s) => s.slug === 'demoB')!;
    expect(a).toMatchObject({ open: 1, doneRed: 2, doneUnrun: 1 }); // T-fail + T-mixed red; T-notrun unrun; T-pass silent
    expect(b).toMatchObject({ open: 1, doneRed: 0, doneUnrun: 1 }); // T-noscen unrun
  });

  it('aggregates corpus totals and sorts specs by unfinished count desc', () => {
    const c = computeTaskCensus(makeGraph());
    expect(c.total).toEqual({ open: 2, doneRed: 2, doneUnrun: 2 });
    expect(c.specs[0].slug).toBe('demoA'); // 4 unfinished > demoB's 2
  });

  it('excludes not_run from doneRed (filtered-run poison resistance) and lets red win over not_run', () => {
    const c = computeTaskCensus(makeGraph());
    const a = c.specs.find((s) => s.slug === 'demoA')!;
    // T-notrun (only a not_run scenario) is doneUnrun, NOT doneRed
    expect(a.doneUnrun).toBe(1);
    // T-mixed (failed + not_run) counts as red, not double-counted
    expect(a.doneRed).toBe(2);
  });

  it('an all-passed DONE task is silent (genuinely confirmed)', () => {
    const c = computeTaskCensus(makeGraph());
    // demoA has 5 tasks; T-pass contributes to none of the three buckets
    const a = c.specs.find((s) => s.slug === 'demoA')!;
    expect(a.open + a.doneRed + a.doneUnrun).toBe(4); // not 5
  });
});

describe('FR-49a — nextOpen (the «next step» the banner names)', () => {
  it('captures the FIRST open task per spec, preferring its title', () => {
    const nodes = new Map<string, unknown>([
      ['s:T1', { id: 's:T1', type: 'Task', status: 'done', refs: [], doneWhen: '', file: '.specs/s/TASKS.md' }],
      ['s:T2', { id: 's:T2', type: 'Task', status: 'in-progress', refs: [], doneWhen: '', title: 'Wire the gate', file: '.specs/s/TASKS.md' }],
      ['s:T3', { id: 's:T3', type: 'Task', status: 'todo', refs: [], doneWhen: '', title: 'Second open', file: '.specs/s/TASKS.md' }],
    ]);
    const c = computeTaskCensus({ nodes } as unknown as SpecGraph);
    const s = c.specs.find((x) => x.slug === 's')!;
    expect(s.open).toBe(2);
    expect(s.nextOpen).toEqual({ id: 's:T2', title: 'Wire the gate' }); // first open in doc order, title used
  });

  it('falls back to the id when the open task has no title', () => {
    const nodes = new Map<string, unknown>([
      ['s:T1', { id: 's:T1', type: 'Task', status: 'todo', refs: [], doneWhen: '', file: '.specs/s/TASKS.md' }],
    ]);
    const c = computeTaskCensus({ nodes } as unknown as SpecGraph);
    expect(c.specs[0].nextOpen).toEqual({ id: 's:T1', title: 's:T1' });
  });

  it('a spec with only done-but-unconfirmed work has no nextOpen', () => {
    const nodes = new Map<string, unknown>([
      ['s:T1', { id: 's:T1', type: 'Task', status: 'done', refs: [], doneWhen: 'no scenario', file: '.specs/s/TASKS.md' }],
    ]);
    const c = computeTaskCensus({ nodes } as unknown as SpecGraph);
    expect(c.specs[0].doneUnrun).toBe(1);
    expect(c.specs[0].nextOpen).toBeUndefined();
  });
});

describe('task-census cache + история rotation', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `task-census-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes then reads the same census', () => {
    const c = computeTaskCensus(makeGraph());
    writeTaskCensusCache(root, c, '2026-06-10T00:00:00Z');
    expect(fs.existsSync(taskCensusCachePath(root))).toBe(true);
    const back = readTaskCensusCache(root)!;
    expect(back.total).toEqual(c.total);
    expect(back.ts).toBe('2026-06-10T00:00:00Z');
  });

  it('rotates current → prev ONLY when the total changed', () => {
    const c = computeTaskCensus(makeGraph());
    writeTaskCensusCache(root, c, 't1');
    expect(readTaskCensusPrev(root)).toBeNull(); // first write → no prev
    // identical totals → no rotation
    writeTaskCensusCache(root, c, 't2');
    expect(readTaskCensusPrev(root)).toBeNull();
    // changed total → rotation captures the previous snapshot
    const fewer: typeof c = { total: { open: 1, doneRed: 0, doneUnrun: 0 }, specs: [{ slug: 'demoA', open: 1, doneRed: 0, doneUnrun: 0 }] };
    writeTaskCensusCache(root, fewer, 't3');
    const prev = readTaskCensusPrev(root)!;
    expect(sumTotal(prev)).toBe(6); // the t2 snapshot (2+2+2)
    expect(sumTotal(readTaskCensusCache(root)!)).toBe(1);
  });

  it('readTaskCensusCache returns null on missing / malformed', () => {
    expect(readTaskCensusCache(root)).toBeNull();
    fs.mkdirSync(path.dirname(taskCensusCachePath(root)), { recursive: true });
    fs.writeFileSync(taskCensusCachePath(root), '{ not json', 'utf-8');
    expect(readTaskCensusCache(root)).toBeNull();
  });
});
