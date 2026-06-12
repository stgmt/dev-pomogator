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
  step: 'scaffold' | 'conformance' | 'coverage' | 'test-quality' | 'reconcile' | 'resolve' | 'honesty-gate' | 'trace' | 'backlog' | 'architecture' | 'legacy-triage';
  /** The worker this stage delegates to (skill name, MCP tool name, or engine CLI). */
  worker: string;
  /** Whether the worker is an MCP tool, a worker skill, or an engine CLI. */
  kind: 'mcp-tool' | 'skill' | 'engine-cli';
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
  // FR-35b: test-quality stage BETWEEN coverage and honesty-gate. strong-tests +
  // spec-status audit the test BODY (STRONG/WEAK/FAKE-POSITIVE-RISK) so a fake-positive
  // GREEN test cannot reach DONE; the worst verdict feeds get_coverage's honesty-gate.
  { step: 'test-quality', worker: 'strong-tests', kind: 'skill' },
  { step: 'test-quality', worker: 'spec-status', kind: 'skill' },
  // FR-43: legacy/drift triage. The ORCHESTRATOR runs it (it has Bash; the phase
  // agents are MCP-only and cannot spawn a CLI). `legacy-triage --judge` flags
  // abandoned specs (SUPERSEDED/REMOVED/DRIFTED/ABSORBED) via the LLM judge —
  // SUSPICION only, a human confirms (FR-43c), never auto-retire.
  { step: 'legacy-triage', worker: 'legacy-triage', kind: 'engine-cli' },
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
  'get_spec_status', // FR-38 lifecycle — consumed by spec-status / spec-graph-query skills
  // FR-39a (P17-1) read door — consumed by spec-graph-query today; the create-spec
  // phase agents (FR-41) become the primary consumers when the wave lands.
  'list_spec_docs',
  'read_spec_doc',
  'read_attachment', // FR-39a/P19-6 binary attachment read door — consumed by spec-graph-query
  // FR-40 (P17-2) mutation door — primary consumer: create-spec workflow (FR-42c)
  // + the FR-41 phase agents when the wave lands.
  'propose_spec_change',
  'apply_spec_change',
  'create_spec',
  'delete_spec_doc', // P19-4 the D of the CRUD door — doc-level, FR-43 guards whole-spec retirement
  'rename_spec_doc', // P21-5 rename/move door — anchors-aware, same create-spec owner
  'get_archival_proof', // FR-45a archival safety proof (graph + prose inbound refs)
  'archive_spec', // FR-45b gated whole-spec move into archive/ — consumed by spec-archive
  // worker skills
  'create-spec',
  'architecture-research-workflow',
  'cross-spec-reconcile',
  'cross-spec-resolve',
  'spec-backlog',
  // FR-35b — test-quality stage workers (enforced: drift guard fails if a live
  // strong-tests/spec-status capability is dropped from the map).
  'strong-tests',
  'spec-status',
  // FR-43 — legacy/drift triage. An engine CLI (`tools/specs-generator/legacy-triage.ts
  // --judge`), not an MCP tool nor a worker skill, so it is NOT in the live
  // capability surface (liveCapabilities = MCP registry + WORKER_SKILLS); listing
  // it here keeps the WORKFLOW worker referenced. The orchestrator runs it because
  // it has Bash; the phase agents are MCP-only (FR-41a) and cannot spawn a CLI.
  'legacy-triage',
];

/**
 * FR-42a/b — the «MCP tool → skill consumer(s)» table (thin skill, thick
 * server). Every USER-FACING MCP tool must have a skill that knows how to
 * drive it; a live tool absent from this table is a layering violation (a
 * "naked MCP tool" with no skill wrapper). The drift guard enforces it.
 * Mirror of the orchestrator feature-map discipline, one level down.
 */
export const TOOL_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  get_trace: ['spec-graph-query'],
  find_by_tags: ['spec-graph-query'],
  conformance_check: ['spec-graph-query', 'cross-spec-reconcile'],
  search: ['spec-graph-query'],
  get_node: ['spec-graph-query'],
  list_phase_tasks: ['spec-graph-query'],
  get_test_result: ['spec-graph-query'],
  find_orphans: ['spec-graph-query'],
  get_coverage: ['spec-graph-query'],
  get_coverage_summary: ['spec-graph-query'],
  get_spec_status: ['spec-graph-query'],
  validate_anchor: ['spec-graph-query'],
  list_specs: ['spec-graph-query'],
  find_refs: ['spec-graph-query'],
  // FR-39a read door
  list_spec_docs: ['spec-graph-query'],
  read_spec_doc: ['spec-graph-query'],
  read_attachment: ['spec-graph-query'], // FR-39a/P19-6 binary attachment read door
  // FR-40 mutation door — create-spec is the user entry (FR-42c)
  propose_spec_change: ['create-spec'],
  apply_spec_change: ['create-spec'],
  create_spec: ['create-spec'],
  delete_spec_doc: ['create-spec'], // P19-4 D-door — same mutation-door owner
  rename_spec_doc: ['create-spec'], // P21-5 rename/move door — same mutation-door owner (FR-42c)
  get_archival_proof: ['spec-archive'], // FR-45a — the archival agent drives the proof
  archive_spec: ['spec-archive'], // FR-45b — the archival agent drives the gated move
};

export interface ConsumerDriftResult {
  ok: boolean;
  /** Live tools with no declared skill consumer (FR-42a violations). */
  unconsumed: string[];
  message: string;
}

/**
 * FR-42a: every live MCP tool must appear in TOOL_CONSUMERS with ≥1 consumer.
 * `actualTools` = the live registry tool names.
 */
export function checkToolConsumers(
  actualTools: readonly string[],
  consumers: Readonly<Record<string, readonly string[]>> = TOOL_CONSUMERS,
): ConsumerDriftResult {
  const unconsumed = [...new Set(actualTools)].filter(
    (t) => !consumers[t] || consumers[t].length === 0,
  );
  return {
    ok: unconsumed.length === 0,
    unconsumed,
    message:
      unconsumed.length === 0
        ? 'every live MCP tool has a skill consumer (FR-42a)'
        : `FR-42a violation — ${unconsumed.length} MCP tool(s) with no skill consumer: ${unconsumed.join(', ')}`,
  };
}

export interface TruthResult {
  ok: boolean;
  /** "skill credited for tool X but its SKILL.md never mentions X". */
  lies: string[];
  message: string;
}

/**
 * FR-42b hardening (caught 2026-06-07 by «сам проверил?»): a non-empty
 * TOOL_CONSUMERS entry is NOT enough — the declared consumer skill must
 * REALLY reference the tool, else the table lies and the guard rubber-stamps
 * it. `readSkill(name)` returns the skill's SKILL.md body (or null if absent);
 * injectable so the check is pure + unit-testable.
 */
export function verifyConsumerTruthfulness(
  readSkill: (skill: string) => string | null,
  consumers: Readonly<Record<string, readonly string[]>> = TOOL_CONSUMERS,
): TruthResult {
  const lies: string[] = [];
  for (const [tool, skills] of Object.entries(consumers)) {
    for (const skill of skills) {
      const body = readSkill(skill);
      if (body === null) {
        lies.push(`${skill} (missing SKILL.md) credited for ${tool}`);
      } else if (!body.includes(tool)) {
        lies.push(`${skill} credited for ${tool} but its SKILL.md never mentions it`);
      }
    }
  }
  return {
    ok: lies.length === 0,
    lies,
    message:
      lies.length === 0
        ? 'every declared tool→skill consumer is truthful (FR-42b)'
        : `FR-42b: ${lies.length} false consumer declaration(s): ${lies.join('; ')}`,
  };
}

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
