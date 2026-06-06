/**
 * Traceability-completeness check (FR-37b, P14-2) — the cell→atom invariants
 * over the ONE composite-keyed graph (FR-36).
 *
 * Emits a PER-ITEM gap list for the graph-derivable invariant classes:
 *   UNCOVERED_FR        — FR with no AC and no tested-by Scenario
 *   TASK_UNTESTED       — Task marked DONE with zero linked scenarios
 *   UNTAGGED_SCENARIO   — Scenario not tagged up to any requirement
 *
 * The fourth FR-37b class — a stale FILE_CHANGES path — is NOT graph-derivable
 * here (the builder skips glob rows and unparsable tables), so the
 * authoritative verdict (`spec-verdict.ts`) merges it from `audit-spec`'s
 * FILE_CHANGES_VERIFY findings into the same gap list. Composition happens
 * there; this module owns the graph side only.
 *
 * Reuses `checkConformance` (single source of truth for the finding logic) —
 * this module scopes, reshapes, and labels; it does not re-derive.
 *
 * @see .specs/spec-generator-v4/FR.md FR-37b
 * @see tools/specs-generator/spec-verdict.ts (composition point)
 */

import { checkConformance } from './conformance.ts';
import type { SpecGraph } from './types.ts';

export type TraceabilityGapClass = 'UNCOVERED_FR' | 'TASK_UNTESTED' | 'UNTAGGED_SCENARIO';

export interface TraceabilityGap {
  class: TraceabilityGapClass;
  /** Composite node id the gap is about. */
  nodeId: string;
  file: string;
  line: number;
  /** Actionable, agent-facing description. */
  message: string;
}

const GAP_CLASSES: ReadonlySet<string> = new Set([
  'UNCOVERED_FR',
  'TASK_UNTESTED',
  'UNTAGGED_SCENARIO',
]);

/**
 * Per-item traceability gap list. `opts.spec` scopes to one spec slug (the
 * cell); absent → the whole corpus (the organism).
 */
export function checkTraceabilityCompleteness(
  graph: SpecGraph,
  opts: { spec?: string } = {},
): TraceabilityGap[] {
  const findings = checkConformance(graph);
  const gaps: TraceabilityGap[] = [];
  for (const f of findings) {
    if (!GAP_CLASSES.has(f.code)) continue;
    if (opts.spec && !String(f.location.file).replace(/\\/g, '/').includes(`.specs/${opts.spec}/`)) {
      continue;
    }
    gaps.push({
      class: f.code as TraceabilityGapClass,
      nodeId: f.nodeId ?? '(unknown)',
      file: f.location.file,
      line: f.location.line,
      message: f.message,
    });
  }
  return gaps;
}

/** Per-class counts — the measured-debt summary FR-37b asks to track. */
export function summariseGaps(gaps: TraceabilityGap[]): Record<TraceabilityGapClass, number> {
  const out: Record<TraceabilityGapClass, number> = {
    UNCOVERED_FR: 0,
    TASK_UNTESTED: 0,
    UNTAGGED_SCENARIO: 0,
  };
  for (const g of gaps) out[g.class]++;
  return out;
}
