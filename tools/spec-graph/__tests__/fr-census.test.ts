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
import { computeFrCensus, renderFrCensus } from '../fr-census.ts';

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

  it('an FR whose only task is READY (eligible, not yet started) is PLANNED, not IN_PROGRESS', () => {
    // FR-48a `ready` = chain assembled, eligible to start, NO work begun → pre-work.
    // Before the fix `noneStarted` omitted `ready`, so it read IN_PROGRESS (started).
    const g = {
      nodes: new Map<string, unknown>([
        [`${SLUG}:FR-9`, fr(9)],
        [`${SLUG}:T9`, task('T9', 9, 'ready', '')],
      ]),
      edges: [],
    } as unknown as SpecGraph;
    const row = computeFrCensus(g).rows.find((x) => x.frId === `${SLUG}:FR-9`);
    expect(row?.verdict).toBe('PLANNED');
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

describe('computeFrCensus — FR-47b trace-web completeness (webComplete)', () => {
  it('none of the legacy-shaped FRs are web-complete; the verdict counts 0/N', () => {
    // makeGraph FRs have AC/scenario/task at most — none has design/story/research,
    // so the 6-leg AND yields 0 web-complete. The honest "tasks done ≠ 100%" signal.
    const r = computeFrCensus(makeGraph());
    expect(r.webCompleteCount).toBe(0);
    expect(r.rows.every((row) => !row.webComplete)).toBe(true);
  });

  it('acCovers split bugfix: a covers edge to a Decision/Story is NOT counted as AC', () => {
    // Regression: before the split, ANY covers edge set hasAc → an FR with only a
    // design Decision read AC:✓. The edge target type must decide the leg.
    const nodes = new Map<string, unknown>([
      [`${SLUG}:FR-9`, fr(9)],
      [`${SLUG}:Decision-x`, { id: `${SLUG}:Decision-x`, type: 'Decision', file: `.specs/${SLUG}/DESIGN.md`, line: 1, title: 'x', parentFr: `${SLUG}:FR-9`, body: '' }],
      [`${SLUG}:Story-x`, { id: `${SLUG}:Story-x`, type: 'Story', file: `.specs/${SLUG}/USER_STORIES.md`, line: 1, title: 'x', parentFr: `${SLUG}:FR-9`, body: '' }],
    ]);
    const edges: Edge[] = [
      { from: `${SLUG}:FR-9`, to: `${SLUG}:Decision-x`, type: 'covers' },
      { from: `${SLUG}:FR-9`, to: `${SLUG}:Story-x`, type: 'covers' },
    ];
    const r = computeFrCensus({ nodes, edges } as unknown as SpecGraph);
    const row = r.rows.find((x) => x.frId === `${SLUG}:FR-9`)!;
    expect(row.hasAc).toBe(false); // the Decision/Story edges must NOT forge AC coverage
    expect(row.hasDesign).toBe(true);
    expect(row.hasStory).toBe(true);
    expect(row.missingLegs).toContain('AC');
  });

  it('research leg is N/A→present unless the FR is in the frsWithoutResearch set', () => {
    const r = computeFrCensus(makeGraph(), { frsWithoutResearch: new Set([`${SLUG}:FR-1`]) });
    const fr1 = r.rows.find((x) => x.frId === `${SLUG}:FR-1`)!;
    const fr2 = r.rows.find((x) => x.frId === `${SLUG}:FR-2`)!;
    expect(fr1.hasResearch).toBe(false); // explicitly flagged as lacking research
    expect(fr2.hasResearch).toBe(true); // not flagged → research leg N/A → present
  });
});

describe('renderFrCensus — the human report surfaces the verdict (text rendering)', () => {
  const report = computeFrCensus(makeGraph());
  report.corpusRoot = '/corpus';
  const out = renderFrCensus(report);

  it('the header names the tool and the report scope', () => {
    expect(out, 'header must name the tool').toContain('fr-census');
    expect(out, 'header must show the scope').toContain('[scope: ALL]');
    expect(out, 'header must echo corpusRoot').toContain('/corpus');
  });

  it('the count line shows every verdict with its own icon and count (one each in makeGraph)', () => {
    // makeGraph yields exactly one FR per verdict — pins the VERDICT_ICON map AND the counts.
    expect(out).toContain('🟢 IMPLEMENTED:1');
    expect(out).toContain('🔴 DONE_UNTESTED:1');
    expect(out).toContain('🟡 IN_PROGRESS:1');
    expect(out).toContain('⚪ PLANNED:1');
    expect(out).toContain('⚫ UNIMPLEMENTED:1');
  });

  it('the web-complete line reports the 6-leg AND count (0/5 for legacy-shaped FRs)', () => {
    expect(out).toContain('web-complete');
    expect(out, 'no makeGraph FR has all 6 legs').toContain('0/5');
  });

  it('each FR row carries its icon, id, verdict word, evidence ticks and title', () => {
    // FR-1 IMPLEMENTED has AC + scenario (✓✓); FR-2 PLANNED has neither (✗✗).
    expect(out, 'FR-1 row').toMatch(/🟢 demo:FR-1\s+IMPLEMENTED.*AC:✓ Scen:✓.*Requirement 1/);
    expect(out, 'FR-2 row').toMatch(/⚪ demo:FR-2\s+PLANNED.*AC:✗ Scen:✗.*Requirement 2/);
  });

  it('renders the FALSE-GREEN block listing each unproven-DONE FR', () => {
    expect(out).toContain('FALSE-GREEN');
    expect(out).toContain('1 FR(s) marked DONE');
    expect(out, 'FR-4 is the false-green one').toContain('demo:FR-4');
  });

  it('the final VERDICT line shows RED (hard + strict) when a DONE_UNTESTED exists', () => {
    // makeGraph has FR-4 DONE_UNTESTED ⇒ both hard and strict verdicts are RED.
    expect(out).toContain('VERDICT: 🔴 RED (hard: no DONE_UNTESTED)');
    expect(out).toContain('strict: 🔴 RED');
    expect(out, 'a RED report must NOT print a green verdict icon').not.toContain('VERDICT: 🟢');
  });

  it('a GREEN report omits the FALSE-GREEN block and shows the green verdict', () => {
    const g = makeGraph();
    g.nodes.delete(`${SLUG}:FR-4`);
    g.nodes.delete(`${SLUG}:T4`);
    const green = renderFrCensus(computeFrCensus(g));
    expect(green, 'no false-green ⇒ no FALSE-GREEN block').not.toContain('FALSE-GREEN');
    expect(green).toContain('VERDICT: 🟢 GREEN');
  });
});

describe('computeFrCensus — stable cross-spec ordering', () => {
  it('rows sort by spec then by NUMERIC FR id (FR-2 before FR-10, not lexical)', () => {
    const mk = (spec: string, n: number): [string, unknown] => [
      `${spec}:FR-${n}`,
      { id: `${spec}:FR-${n}`, type: 'FR', spec, file: `.specs/${spec}/FR.md`, line: n, title: `R${n}`, anchors: [], body: '' },
    ];
    // Insertion order is deliberately scrambled (b before a; 10 before 2) so a
    // no-op / lexical sort mutant produces a different order than asserted.
    const nodes = new Map<string, unknown>([mk('b-spec', 2), mk('a-spec', 10), mk('a-spec', 2)]);
    const r = computeFrCensus({ nodes, edges: [] } as unknown as SpecGraph);
    expect(r.rows.map((x) => x.frId), 'spec asc, then FR id numeric asc').toEqual([
      'a-spec:FR-2',
      'a-spec:FR-10',
      'b-spec:FR-2',
    ]);
  });
});
