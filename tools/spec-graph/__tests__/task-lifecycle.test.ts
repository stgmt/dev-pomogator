/**
 * Unit: FR-48 task lifecycle (tools/spec-graph/task-lifecycle.ts).
 *
 * Pins the pure-function edges the @feature48 BDD does not exhaust:
 *   - isLegalTransition: the full legal/illegal matrix (no skip-to-finish),
 *   - isSpecAuthoringPhase: explicit [spec-phase] marker, default impl (fail-safe),
 *   - chainAssembledFor: research is NOT required to START (grounding leg),
 *   - canEnterWorkingStatus: a multi-ref impl task is blocked by ANY unassembled FR.
 */
import { describe, it, expect } from 'vitest';
import type { SpecGraph } from '../types.ts';
import {
  isLegalTransition,
  isSpecAuthoringPhase,
  chainAssembledFor,
  canEnterWorkingStatus,
  WORKING_STATUSES,
} from '../task-lifecycle.ts';

/** A graph where `fr` has AC + scenario + design + story, but NO research citation. */
function fullyLeggedExceptResearch(fr: string): SpecGraph {
  const nodes = new Map<string, unknown>([
    [fr, { id: fr, type: 'FR', file: 'FR.md', line: 1, title: 'x', anchors: [fr], body: '' }],
    [`${fr}-ac`, { id: `${fr}-ac`, type: 'AC', file: 'AC.md', line: 1, parentFr: fr, ears: '' }],
    [`${fr}-scen`, { id: `${fr}-scen`, type: 'Scenario', file: 'x.feature', line: 1, tags: [], lastResult: 'PASSED' }],
    [`${fr}-dec`, { id: `${fr}-dec`, type: 'Decision', file: 'DESIGN.md', line: 1, title: 'd', parentFr: fr, body: '' }],
    [`${fr}-story`, { id: `${fr}-story`, type: 'Story', file: 'US.md', line: 1, title: 's', parentFr: fr, body: '' }],
  ]);
  const edges = [
    { from: fr, to: `${fr}-ac`, type: 'covers' as const },
    { from: fr, to: `${fr}-scen`, type: 'tested-by' as const },
    { from: fr, to: `${fr}-dec`, type: 'covers' as const },
    { from: fr, to: `${fr}-story`, type: 'covers' as const },
  ];
  return { nodes, edges } as unknown as SpecGraph;
}

describe('isLegalTransition — the lifecycle matrix', () => {
  it('accepts the forward spine and the deliberate reverse edges', () => {
    expect(isLegalTransition('todo', 'ready')).toBe(true);
    expect(isLegalTransition('ready', 'in-progress')).toBe(true);
    expect(isLegalTransition('in-progress', 'done')).toBe(true);
    expect(isLegalTransition('done', 'in-progress')).toBe(true); // reopen
    expect(isLegalTransition('in-progress', 'blocked')).toBe(true);
    expect(isLegalTransition('blocked', 'in-progress')).toBe(true); // recover
    expect(isLegalTransition('in-progress', 'in-progress')).toBe(true); // idempotent no-op
  });

  it('rejects skip-to-finish and other illegal moves', () => {
    expect(isLegalTransition('todo', 'done')).toBe(false); // must pass in-progress
    expect(isLegalTransition('ready', 'done')).toBe(false);
    expect(isLegalTransition('done', 'todo')).toBe(false); // reopen goes through in-progress
    expect(isLegalTransition('blocked', 'done')).toBe(false);
  });
});

describe('isSpecAuthoringPhase — explicit marker, default impl', () => {
  it('detects the [spec-phase] marker in doneWhen or phase', () => {
    expect(isSpecAuthoringPhase({ doneWhen: 'author DESIGN [spec-phase]', phase: '' })).toBe(true);
    expect(isSpecAuthoringPhase({ doneWhen: '', phase: 'Phase 23 [spec-phase]' })).toBe(true);
  });
  it('defaults to impl (NOT spec) when the marker is absent — fail-safe', () => {
    expect(isSpecAuthoringPhase({ doneWhen: 'write the code', phase: 'Phase 9' })).toBe(false);
    expect(isSpecAuthoringPhase({ doneWhen: '', phase: '' })).toBe(false);
  });
});

describe('chainAssembledFor — research is NOT required to start', () => {
  it('an FR with AC + scenario + design + story is assembled even with no research', () => {
    const g = fullyLeggedExceptResearch('demo:FR-1');
    const r = chainAssembledFor(g, 'demo:FR-1', new Set(['demo:FR-1'])); // flagged as lacking research
    expect(r.assembled).toBe(true); // research is a grounding leg, not a start gate
    expect(r.missing).toEqual([]);
  });
  it('lists exactly the absent upstream legs', () => {
    const g = fullyLeggedExceptResearch('demo:FR-1');
    // strip the design + story edges → only AC + scenario remain
    (g as unknown as { edges: Array<{ type: string; to: string }> }).edges =
      (g as unknown as { edges: Array<{ type: string; to: string }> }).edges.filter((e) => e.type === 'tested-by' || e.to.endsWith('-ac'));
    const r = chainAssembledFor(g, 'demo:FR-1');
    expect(r.assembled).toBe(false);
    expect(r.missing.sort()).toEqual(['design', 'story']);
  });
});

describe('canEnterWorkingStatus — phase + multi-ref', () => {
  it('a spec-authoring task is always allowed (anti-deadlock)', () => {
    const g = fullyLeggedExceptResearch('demo:FR-1');
    (g as unknown as { edges: unknown[] }).edges = []; // strip every leg
    const r = canEnterWorkingStatus(g, { refs: ['demo:FR-1'], doneWhen: 'author [spec-phase]', phase: '' });
    expect(r.allowed).toBe(true);
    expect(r.specPhase).toBe(true);
  });
  it('an impl task is blocked when ANY referenced FR is unassembled', () => {
    const g = fullyLeggedExceptResearch('demo:FR-1'); // FR-1 fully legged; FR-2 absent → unassembled
    const r = canEnterWorkingStatus(g, { refs: ['demo:FR-1', 'demo:FR-2'], doneWhen: 'code', phase: '' });
    expect(r.allowed).toBe(false);
    expect(r.missing.some((m) => m.startsWith('demo:FR-2'))).toBe(true);
    expect(r.missing.some((m) => m.startsWith('demo:FR-1'))).toBe(false); // FR-1 is fine
  });
  it('WORKING_STATUSES are the gated entry states', () => {
    expect([...WORKING_STATUSES].sort()).toEqual(['in-progress', 'ready']);
  });
});
