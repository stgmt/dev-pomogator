/**
 * Unit: P21-5 deterministic per-FR roll-call (tools/spec-graph/fr-census.ts).
 *
 * Synthetic graph (no real corpus). Pins the anti-false-green verdict semantics
 * that close META-finding #0 (v4-deep-gap-analysis 2026-06-10 — an LLM census
 * reported FR-43 IMPLEMENTED while its tasks were todo):
 *   - IMPLEMENTED   ⇔ EVERY task done AND verified (mapped scenario PASSED),
 *   - DONE_UNTESTED ⇔ all tasks done but a mapped scenario is not green,
 *   - IN_PROGRESS   ⇔ a done/in-progress task coexists with an OPEN task
 *                     (the FR-43 case — ONE done task must NOT false-green it),
 *   - PLANNED       ⇔ all tasks todo/blocked,
 *   - UNIMPLEMENTED ⇔ no task references the FR,
 * plus output invariants (conservation, one row per FR) and the RED gate.
 */
import { describe, it, expect } from 'vitest';
import type { SpecGraph, Edge } from '../types.ts';
import { computeFrCensus } from '../fr-census.ts';

const SLUG = 'demo';

function fr(n: number) {
  return {
    id: `${SLUG}:FR-${n}`,
    type: 'FR' as const,
    spec: SLUG,
    file: `.specs/${SLUG}/FR.md`,
    line: n,
    title: `Requirement ${n}`,
    anchors: [`fr-${n}`],
    body: '',
  };
}
function task(local: string, frN: number, status: string, doneWhen: string) {
  return {
    id: `${SLUG}:${local}`,
    type: 'Task' as const,
    status,
    refs: [`${SLUG}:FR-${frN}`],
    doneWhen,
    file: `.specs/${SLUG}/TASKS.md`,
  };
}
function scen(id: string, result?: string) {
  return { id, type: 'Scenario' as const, tags: [], lastResult: result, file: `.specs/${SLUG}/x.feature` };
}

/**
 * FR-1 IMPLEMENTED — one done task, its scenario PASSED.
 * FR-2 PLANNED — one todo task, nothing started.
 * FR-3 IN_PROGRESS — a verified-done task AND a todo task (the META-#0 trap:
 *                    a single done task must NOT read IMPLEMENTED).
 * FR-4 DONE_UNTESTED — all tasks done but the mapped scenario FAILED.
 * FR-5 UNIMPLEMENTED — no task references it.
 */
function makeGraph(): SpecGraph {
  const nodes = new Map<string, unknown>([
    [`${SLUG}:FR-1`, fr(1)],
    [`${SLUG}:FR-2`, fr(2)],
    [`${SLUG}:FR-3`, fr(3)],
    [`${SLUG}:FR-4`, fr(4)],
    [`${SLUG}:FR-5`, fr(5)],
    // scenarios (mapped by SPECGEN id in Done-When)
    ['SCEN-specgen004-01-pass', scen('SCEN-specgen004-01-pass', 'PASSED')],
    ['SCEN-specgen004-03-pass', scen('SCEN-specgen004-03-pass', 'PASSED')],
    ['SCEN-specgen004-04-fail', scen('SCEN-specgen004-04-fail', 'FAILED')],
    // tasks
    [`${SLUG}:T1`, task('T1', 1, 'done', 'closed by SPECGEN004_01')],
    [`${SLUG}:T2`, task('T2', 2, 'todo', '')],
    [`${SLUG}:T3a`, task('T3a', 3, 'done', 'closed by SPECGEN004_03')],
    [`${SLUG}:T3b`, task('T3b', 3, 'todo', '')],
    [`${SLUG}:T4`, task('T4', 4, 'done', 'closed by SPECGEN004_04')],
  ]);
  const edges: Edge[] = [
    { from: `${SLUG}:FR-1`, to: `${SLUG}:AC-1`, type: 'covers' },
    { from: `${SLUG}:FR-1`, to: 'SCEN-specgen004-01-pass', type: 'tested-by' },
  ];
  return { nodes, edges } as unknown as SpecGraph;
}

describe('computeFrCensus — deterministic per-FR verdict', () => {
  const report = computeFrCensus(makeGraph());
  const byId = Object.fromEntries(report.rows.map((r) => [r.frId, r]));

  it('a fully done + verified FR is IMPLEMENTED', () => {
    expect(byId[`${SLUG}:FR-1`].verdict).toBe('IMPLEMENTED');
    expect(byId[`${SLUG}:FR-1`].tested).toBe(true);
    expect(byId[`${SLUG}:FR-1`].hasAc).toBe(true);
    expect(byId[`${SLUG}:FR-1`].hasScenario).toBe(true);
  });

  it('an FR with only todo tasks is PLANNED', () => {
    expect(byId[`${SLUG}:FR-2`].verdict).toBe('PLANNED');
  });

  it('META-#0: a single done task among open tasks is IN_PROGRESS, NEVER IMPLEMENTED', () => {
    // FR-43 in the real corpus: tasks [todo,todo,done,in-progress] — the LLM
    // census called it IMPLEMENTED. The deterministic census must not.
    expect(byId[`${SLUG}:FR-3`].verdict).toBe('IN_PROGRESS');
    expect(byId[`${SLUG}:FR-3`].verdict).not.toBe('IMPLEMENTED');
    expect(byId[`${SLUG}:FR-3`].tested).toBe(false);
  });

  it('an all-done FR whose scenario is not green is DONE_UNTESTED (the false-green class)', () => {
    expect(byId[`${SLUG}:FR-4`].verdict).toBe('DONE_UNTESTED');
    expect(report.falseGreen).toContain(`${SLUG}:FR-4`);
  });

  it('an FR no task references is UNIMPLEMENTED', () => {
    expect(byId[`${SLUG}:FR-5`].verdict).toBe('UNIMPLEMENTED');
    expect(byId[`${SLUG}:FR-5`].taskIds).toEqual([]);
  });
});

describe('computeFrCensus — output invariants + gate', () => {
  const report = computeFrCensus(makeGraph());

  it('conservation: the per-verdict counts sum to exactly the row count', () => {
    const sum = Object.values(report.byVerdict).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.rows.length);
    expect(report.rows.length).toBe(5);
  });

  it('cardinality: every FR node appears exactly once (no duplicates, none dropped)', () => {
    const ids = report.rows.map((r) => r.frId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([1, 2, 3, 4, 5].map((n) => `${SLUG}:FR-${n}`)));
  });

  it('the hard verdict is RED iff a DONE_UNTESTED exists', () => {
    expect(report.byVerdict.DONE_UNTESTED).toBe(1);
    expect(report.verdict).toBe('RED');
  });

  it('a corpus with no DONE_UNTESTED reads GREEN', () => {
    // drop FR-4 (the only false-green) → the gate clears.
    const g = makeGraph();
    g.nodes.delete(`${SLUG}:FR-4`);
    g.nodes.delete(`${SLUG}:T4`);
    const r = computeFrCensus(g);
    expect(r.byVerdict.DONE_UNTESTED).toBe(0);
    expect(r.verdict).toBe('GREEN');
  });

  it('scope filter narrows reported rows without losing cross-spec coverage input', () => {
    const r = computeFrCensus(makeGraph(), { spec: 'other-spec' });
    expect(r.rows).toEqual([]);
    expect(r.scope).toBe('other-spec');
  });
});
