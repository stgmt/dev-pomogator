/**
 * Trace-web leg indices (FR-47b / FR-48b) — the single leg-truth, in a LIGHT module
 * (types-only import) so both `fr-census` (the verdict tool, which also pulls the
 * builder) and `conformance` → `task-lifecycle` (bundled into the door, must stay
 * lean) can share it WITHOUT a heavy or circular import. A census row and a gate
 * decision read the same indices, so they can never disagree about an FR's legs.
 *
 * @see .specs/spec-generator-v4/FR.md FR-47 (legs as nodes) · FR-48 (start gate)
 */
import type { SpecGraph } from './types.ts';

/** The five trace-web legs an FR can have wired (research N/A→present unless flagged). */
export interface FrLegSet {
  hasAc: boolean;
  hasScenario: boolean;
  hasDesign: boolean;
  hasStory: boolean;
  hasResearch: boolean;
}

/**
 * Build the FR→leg edge indices in one pass — `covers` SPLIT by target type (a
 * Decision/Story edge must NOT count as AC coverage) + `tested-by`. Mirrors the
 * edge pre-compute in conformance.ts::UNCOVERED_FR.
 */
export function buildLegIndices(graph: SpecGraph): {
  acCovers: Set<string>;
  designCovers: Set<string>;
  storyCovers: Set<string>;
  directlyTested: Set<string>;
} {
  const acCovers = new Set<string>();
  const designCovers = new Set<string>();
  const storyCovers = new Set<string>();
  const directlyTested = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === 'covers') {
      const toType = graph.nodes.get(e.to)?.type;
      if (toType === 'Decision') designCovers.add(e.from);
      else if (toType === 'Story') storyCovers.add(e.from);
      else acCovers.add(e.from);
    } else if (e.type === 'tested-by') directlyTested.add(e.from);
  }
  return { acCovers, designCovers, storyCovers, directlyTested };
}

/** The trace-web legs present for ONE FR. Research is N/A→true unless `frsWithoutResearch` flags it. */
export function frLegsOf(graph: SpecGraph, frId: string, frsWithoutResearch?: Set<string>): FrLegSet {
  const idx = buildLegIndices(graph);
  return {
    hasAc: idx.acCovers.has(frId),
    hasScenario: idx.directlyTested.has(frId),
    hasDesign: idx.designCovers.has(frId),
    hasStory: idx.storyCovers.has(frId),
    hasResearch: !(frsWithoutResearch?.has(frId) ?? false),
  };
}
