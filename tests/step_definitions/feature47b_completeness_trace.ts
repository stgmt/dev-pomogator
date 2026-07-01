/**
 * @feature47 step definitions (completeness verdict) — SPECGEN004_169. FR-47b:
 * fr-census marks an FR web-complete ONLY when ALL six trace-web legs are attached
 * (AC + scenario + task + design + story + research) — AND-aggregation, not OR
 * (rollup-completeness-all-not-any). This is the literal "доводят до 100%?" answer.
 * Drives the real computeFrCensus on a synthetic graph; the research leg is supplied
 * via the frsWithoutResearch set (research stays a text detector, not a graph node).
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_169
 * @see .specs/spec-generator-v4/FR.md FR-47 (FR-47b completeness verdict)
 * @see tools/spec-graph/fr-census.ts (computeFrCensus webComplete / missingLegs)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { computeFrCensus, type FrCensusReport } from '../../tools/spec-graph/fr-census.ts';

interface CompWorld extends V4World {
  cGraph?: unknown;
  cReport?: FrCensusReport;
}

// The full set of legs for one FR: AC + scenario + task + design + story (research
// is supplied separately via the frsWithoutResearch set, mirroring the real tool).
function leggedNodes(id: string): Array<[string, unknown]> {
  return [
    [`demo:${id}`, { id: `demo:${id}`, type: 'FR', file: 'FR.md', line: 1, title: id, anchors: [id], body: '' }],
    [`demo:AC-${id}`, { id: `demo:AC-${id}`, type: 'AC', file: 'AC.md', line: 1, parentFr: `demo:${id}`, ears: '' }],
    [`demo:SCEN-${id}`, { id: `demo:SCEN-${id}`, type: 'Scenario', file: 'x.feature', line: 1, tags: [`@${id}`], steps: [], lastResult: 'PASSED' }],
    [`demo:Task-${id}`, { id: `demo:Task-${id}`, type: 'Task', file: 'TASKS.md', line: 1, status: 'done', refs: [`demo:${id}`], doneWhen: '' }],
    [`demo:Decision-${id}`, { id: `demo:Decision-${id}`, type: 'Decision', file: 'DESIGN.md', line: 1, title: id, parentFr: `demo:${id}`, body: '' }],
    [`demo:Story-${id}`, { id: `demo:Story-${id}`, type: 'Story', file: 'USER_STORIES.md', line: 1, title: id, parentFr: `demo:${id}`, body: '' }],
  ];
}
function leggedEdges(id: string): Array<{ from: string; to: string; type: string }> {
  return [
    { from: `demo:${id}`, to: `demo:AC-${id}`, type: 'covers' },
    { from: `demo:${id}`, to: `demo:SCEN-${id}`, type: 'tested-by' },
    { from: `demo:${id}`, to: `demo:Decision-${id}`, type: 'covers' },
    { from: `demo:${id}`, to: `demo:Story-${id}`, type: 'covers' },
  ];
}

Given('a graph with a fully-legged FR and a sibling FR missing only its research leg', function (this: CompWorld) {
  const nodes = new Map<string, unknown>([...leggedNodes('FR-1'), ...leggedNodes('FR-2')]);
  const edges = [...leggedEdges('FR-1'), ...leggedEdges('FR-2')];
  this.cGraph = { version: 1, builtAt: '', definitions: new Map(), backlinks: new Map(), nodes, edges };
});

When('fr-census computes the completeness verdict', function (this: CompWorld) {
  // FR-2 cites no RESEARCH.md finding; FR-1 has every leg. Research is fed in as a
  // set (the real CLI computes it via findFrsWithoutResearch — research is a detector).
  this.cReport = computeFrCensus(this.cGraph as never, { frsWithoutResearch: new Set(['demo:FR-2']) });
});

Then(
  'the fully-legged FR is web-complete and the other FR misses only research',
  function (this: CompWorld) {
    const r1 = this.cReport!.rows.find((r) => r.frId === 'demo:FR-1')!;
    const r2 = this.cReport!.rows.find((r) => r.frId === 'demo:FR-2')!;
    assert.ok(r1.webComplete, `FR-1 has all six legs → web-complete (missing: ${r1.missingLegs.join(',')})`);
    assert.equal(r1.missingLegs.length, 0, 'FR-1 has no missing legs');
    // AND-aggregation: a single missing leg (research) ⇒ NOT web-complete — not OR.
    assert.equal(r2.webComplete, false, 'FR-2 missing research → NOT web-complete (AND, not OR)');
    assert.deepEqual(r2.missingLegs, ['research'], 'research is FR-2 ONLY missing leg');
    assert.equal(this.cReport!.webCompleteCount, 1, 'exactly one FR (FR-1) is web-complete');
  },
);
