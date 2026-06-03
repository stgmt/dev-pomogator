// spec-generator-orchestrator — feature map + drift guard (FR-33).
//
// The orchestrator owns ONLY this feature map: the routing/sequencing of the
// end-to-end workflow onto EXISTING workers (skills + MCP tools). It must not
// re-implement worker logic. The drift guard applies the FR-32 honesty
// discipline to the orchestrator itself: if a worker capability (MCP tool /
// worker skill) exists that the map doesn't reference, the guard fails and
// names it — so the orchestrator can't silently fall out of date.
//
// @see .specs/spec-generator-v4/FR.md FR-33
// @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-33.1, AC-33.5

export interface WorkflowStep {
  /** End-to-end workflow stage. */
  step: 'scaffold' | 'conformance' | 'coverage' | 'reconcile' | 'resolve' | 'honesty-gate' | 'trace' | 'backlog' | 'architecture';
  /** The worker this stage delegates to (skill name or MCP tool name). */
  worker: string;
  /** Whether the worker is an MCP tool or a worker skill. */
  kind: 'mcp-tool' | 'skill';
}

/**
 * The thin routing table. Every stage delegates to an existing worker; the
 * orchestrator body holds no re-implementation of any worker's logic.
 */
export const WORKFLOW: WorkflowStep[] = [
  { step: 'scaffold', worker: 'create-spec', kind: 'skill' },
  { step: 'architecture', worker: 'architecture-research-workflow', kind: 'skill' },
  { step: 'conformance', worker: 'conformance_check', kind: 'mcp-tool' },
  { step: 'coverage', worker: 'get_coverage', kind: 'mcp-tool' },
  { step: 'trace', worker: 'get_trace', kind: 'mcp-tool' },
  { step: 'reconcile', worker: 'cross-spec-reconcile', kind: 'skill' },
  { step: 'resolve', worker: 'cross-spec-resolve', kind: 'skill' },
  { step: 'backlog', worker: 'spec-backlog', kind: 'skill' },
  { step: 'honesty-gate', worker: 'get_coverage', kind: 'mcp-tool' },
];

/**
 * Every worker capability the orchestrator references. The drift guard checks
 * the live MCP tool registry + worker skills against this set. Keep in sync
 * when a tool/skill is added — that is exactly what the guard enforces.
 */
export const REFERENCED_CAPABILITIES: readonly string[] = [
  // MCP tools (tools/spec-mcp-server/tools.ts registry)
  'get_trace',
  'find_by_tags',
  'find_orphans',
  'find_refs',
  'get_coverage',
  'get_coverage_summary',
  'get_node',
  'get_test_result',
  'conformance_check',
  'list_phase_tasks',
  'list_specs',
  'search',
  'validate_anchor',
  // worker skills
  'create-spec',
  'architecture-research-workflow',
  'cross-spec-reconcile',
  'cross-spec-resolve',
  'spec-backlog',
];

export interface DriftResult {
  ok: boolean;
  /** Capabilities present at runtime that the feature map does not reference. */
  unreferenced: string[];
  message: string;
}

/**
 * AC-33.5: fail when an actual capability isn't referenced by the feature map.
 * `actual` is the live set (MCP tool names + worker skill names); anything in
 * it but not in `referenced` is drift the orchestrator must acknowledge.
 */
export function checkFeatureMapDrift(
  actual: readonly string[],
  referenced: readonly string[] = REFERENCED_CAPABILITIES,
): DriftResult {
  const known = new Set(referenced);
  const unreferenced = [...new Set(actual)].filter((c) => !known.has(c));
  return {
    ok: unreferenced.length === 0,
    unreferenced,
    message:
      unreferenced.length === 0
        ? 'feature-map references every live capability'
        : `orchestrator feature-map drift: ${unreferenced.length} unreferenced capability(ies): ${unreferenced.join(', ')}`,
  };
}
