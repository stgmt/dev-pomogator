/**
 * Unit: P21-4 honest task census (tools/spec-graph/task-census.ts).
 *
 * The signal that matters is robustness: a DONE task whose scenario genuinely
 * FAILED must be flagged (doneButRed), but a DONE task whose scenario is merely
 * `not_run` (absent from a filtered/stale cucumber run — the "partial cucumber
 * poisons NDJSON" hazard) must NOT be flagged. That exclusion is what lets the
 * per-prompt banner survive a stale run instead of false-flagging every task.
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
  taskCensusCachePath,
} from '../task-census.ts';

/** Minimal graph: nodes Map only — computeTaskCensus reads nothing else. */
function makeGraph(): SpecGraph {
  const FEAT = '.specs/demo/demo.feature';
  const TASKS = '.specs/demo/TASKS.md';
  const scen = (id: string, result?: string) => ({ id, type: 'Scenario', tags: [], lastResult: result, file: FEAT });
  const task = (id: string, status: string, doneWhen: string) => ({ id, type: 'Task', status, refs: [], doneWhen, file: TASKS });
  const nodes = new Map<string, unknown>([
    // scenarios with distinct last-run results
    ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'PASSED')],
    ['SCEN-specgen004-02-fail', scen('SCEN-specgen004-02-fail', 'FAILED')],
    ['SCEN-specgen004-03-notrun', scen('SCEN-specgen004-03-notrun', undefined)], // absent from last run
    // tasks (mapped to scenarios by explicit SPECGEN id in Done-When)
    ['demo:TASK-todo', task('demo:TASK-todo', 'todo', '')],
    ['demo:TASK-inprog', task('demo:TASK-inprog', 'in-progress', '')],
    ['demo:TASK-donepass', task('demo:TASK-donepass', 'done', 'closed by SPECGEN004_01')],
    ['demo:TASK-donefail', task('demo:TASK-donefail', 'done', 'closed by SPECGEN004_02')],
    ['demo:TASK-donenotrun', task('demo:TASK-donenotrun', 'done', 'closed by SPECGEN004_03')],
    ['demo:TASK-donenoscen', task('demo:TASK-donenoscen', 'done', 'pure docs task, no scenario')],
  ]);
  return { nodes } as unknown as SpecGraph;
}

describe('computeTaskCensus', () => {
  it('counts todo/in-progress as open', () => {
    const c = computeTaskCensus(makeGraph());
    expect(c.open).toBe(2);
    expect(c.openIds.sort()).toEqual(['demo:TASK-inprog', 'demo:TASK-todo']);
  });

  it('flags a DONE task whose scenario FAILED (doneButRed)', () => {
    const c = computeTaskCensus(makeGraph());
    expect(c.doneButRedIds).toContain('demo:TASK-donefail');
  });

  it('does NOT flag a DONE task whose scenario is not_run (filtered-run poison resistance)', () => {
    const c = computeTaskCensus(makeGraph());
    expect(c.doneButRedIds).not.toContain('demo:TASK-donenotrun');
  });

  it('does NOT flag a DONE task whose scenario PASSED or that has no scenario', () => {
    const c = computeTaskCensus(makeGraph());
    expect(c.doneButRedIds).not.toContain('demo:TASK-donepass');
    expect(c.doneButRedIds).not.toContain('demo:TASK-donenoscen');
    // exactly one done-but-red: the genuine FAILED one
    expect(c.doneButRed).toBe(1);
  });

  it('reports total task count', () => {
    expect(computeTaskCensus(makeGraph()).total).toBe(6);
  });
});

describe('task-census cache round-trip', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `task-census-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes then reads the same census (atomic temp+rename)', () => {
    const census = computeTaskCensus(makeGraph());
    writeTaskCensusCache(root, census, '2026-06-10T00:00:00Z');
    expect(fs.existsSync(taskCensusCachePath(root))).toBe(true);
    const back = readTaskCensusCache(root)!;
    expect(back.open).toBe(census.open);
    expect(back.doneButRed).toBe(census.doneButRed);
    expect(back.ts).toBe('2026-06-10T00:00:00Z');
  });

  it('readTaskCensusCache returns null on missing / malformed', () => {
    expect(readTaskCensusCache(root)).toBeNull(); // missing
    fs.mkdirSync(path.dirname(taskCensusCachePath(root)), { recursive: true });
    fs.writeFileSync(taskCensusCachePath(root), '{ not json', 'utf-8');
    expect(readTaskCensusCache(root)).toBeNull(); // torn
  });
});
