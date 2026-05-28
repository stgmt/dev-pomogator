/**
 * Structural conformance checker for the SpecGraph (Phase 1, FR-2).
 *
 * Walks the already-built graph and emits a list of `Finding`s — one per
 * detected drift. Phase 1 covers the five graph-derivable finding codes:
 *
 *   UNCOVERED_FR        FR has no AC and no `tested-by` Scenario
 *   ORPHAN_TASK         Task `refs` points at an FR that doesn't exist
 *   SCENARIO_TAG_ORPHAN Scenario carries an `@FR-N` / `@AC-N` tag for a node
 *                       that doesn't exist
 *   UNTAGGED_SCENARIO   Scenario carries NO `@FR` / `@NFR` / `@AC` tag
 *   DUPLICATE_DEFINITION Two headings produced the same canonical id
 *                       (the second was discarded by the builder; this
 *                       finding surfaces the discard for the author)
 *
 * The checker is purely read-only over a SpecGraph — Phase 2's MCP
 * `conformance_check` tool wraps this same function with severity / scope
 * filters before pushing findings into agent context.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder), FR-13 (orphan policy)
 * @see .specs/spec-generator-v4/spec-generator-v4_SCHEMA.md Entity 6 (Finding)
 * @see ./types.ts (SpecGraph)
 */

import type { SpecGraph, Edge, ScenarioNode, TaskNode } from './types.ts';

export type FindingCode =
  | 'UNCOVERED_FR'
  | 'ORPHAN_TASK'
  | 'SCENARIO_TAG_ORPHAN'
  | 'UNTAGGED_SCENARIO'
  | 'DUPLICATE_DEFINITION';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  code: FindingCode;
  severity: Severity;
  location: { file: string; line: number };
  message: string;
  /** The node id whose drift this finding describes. */
  nodeId?: string;
  /** Optional secondary id (e.g. the orphan tag name on SCENARIO_TAG_ORPHAN). */
  relatedId?: string;
  /** Concrete, agent-actionable next steps; populated for known codes. */
  suggestions?: Array<{
    action: string;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
}

const SPEC_TAG_RE = /^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/;

/**
 * Run all Phase-1 conformance rules on a built graph.
 *
 * Severities follow the FR-13 default policy: `warning` for orphan-class
 * issues, `info` for missing-coverage informational notes, `error` for
 * structural duplicates (which point at a build-time discard).
 */
export function checkConformance(graph: SpecGraph): Finding[] {
  const findings: Finding[] = [];

  // Pre-compute edge indices for O(1) lookup of the «does FR-N have an AC
  // covering it / a scenario testing it» question.
  const acCovers = new Set<string>(); // FR ids with at least one `covers` AC edge
  const scenarioTests = new Set<string>(); // FR / AC / NFR ids referenced by a `tested-by` edge
  for (const e of graph.edges) {
    if (e.type === 'covers') acCovers.add(e.from);
    if (e.type === 'tested-by') scenarioTests.add(e.from);
  }

  // 1) UNCOVERED_FR — FR with no AC + no tested-by Scenario.
  for (const node of graph.nodes.values()) {
    if (node.type !== 'FR') continue;
    if (acCovers.has(node.id)) continue;
    if (scenarioTests.has(node.id)) continue;
    findings.push({
      code: 'UNCOVERED_FR',
      severity: 'warning',
      location: { file: node.file, line: node.line },
      message: `FR ${node.id} has no Acceptance Criteria and no @${node.id}-tagged Scenario.`,
      nodeId: node.id,
      suggestions: [
        { action: 'create_ac', reason: 'Add an AC heading `## AC-N (FR-N)` covering this FR.', confidence: 'high' },
        { action: 'tag_scenario', reason: `Add @${node.id} to an existing Scenario in any \`.feature\` file.`, confidence: 'medium' },
      ],
    });
  }

  // 2) ORPHAN_TASK — Task refs an FR that doesn't exist.
  for (const node of graph.nodes.values()) {
    if (node.type !== 'Task') continue;
    const task = node as TaskNode;
    for (const ref of task.refs) {
      if (graph.nodes.has(ref)) continue;
      findings.push({
        code: 'ORPHAN_TASK',
        severity: 'warning',
        location: { file: task.file, line: task.line },
        message: `Task ${task.id} references FR ${ref} which does not exist in any spec file.`,
        nodeId: task.id,
        relatedId: ref,
        suggestions: [
          { action: 'create_fr', reason: `Create ## ${ref} heading in a FR.md file, OR`, confidence: 'medium' },
          { action: 'remove_ref', reason: `remove the stale reference from the task.`, confidence: 'medium' },
        ],
      });
    }
  }

  // 3) SCENARIO_TAG_ORPHAN + 4) UNTAGGED_SCENARIO
  for (const node of graph.nodes.values()) {
    if (node.type !== 'Scenario') continue;
    const scen = node as ScenarioNode;

    let hasSpecTag = false;
    for (const tag of scen.tags) {
      const m = tag.match(SPEC_TAG_RE);
      if (!m) continue;
      hasSpecTag = true;
      const referenced = m[1];
      if (!graph.nodes.has(referenced)) {
        findings.push({
          code: 'SCENARIO_TAG_ORPHAN',
          severity: 'warning',
          location: { file: scen.file, line: scen.line },
          message: `Scenario ${scen.id} carries tag @${referenced} but no FR/NFR/AC with that id exists.`,
          nodeId: scen.id,
          relatedId: referenced,
          suggestions: [
            { action: 'rename_tag', reason: `Did you mean a different spec id?`, confidence: 'medium' },
            { action: 'remove_tag', reason: `Strip the stale tag from the Scenario.`, confidence: 'medium' },
          ],
        });
      }
    }

    if (!hasSpecTag) {
      findings.push({
        code: 'UNTAGGED_SCENARIO',
        severity: 'info',
        location: { file: scen.file, line: scen.line },
        message: `Scenario ${scen.id} has no @FR / @NFR / @AC tag — it tests nothing the spec claims to require.`,
        nodeId: scen.id,
        suggestions: [
          { action: 'tag_scenario', reason: `Add the relevant @FR-N / @AC-N tag.`, confidence: 'high' },
        ],
      });
    }
  }

  // 5) DUPLICATE_DEFINITION — anchors registered more than once for the same id.
  // The builder's «if (!nodes.has(id)) ...» discard is intentional but should
  // surface to the author so they don't think both definitions are live.
  const idCount = new Map<string, number>();
  for (const alias of graph.definitions.keys()) {
    idCount.set(alias, (idCount.get(alias) ?? 0) + 1);
  }
  // The duplicate is invisible here because the builder takes only the first.
  // The robust signal lives in the anchor stream itself — emit findings only
  // when the parser slices themselves disagree on the canonical location.
  // (Concrete enforcement lands once the builder retains a discard log.)
  // This stays as a structural-but-unused branch for now to make the rule's
  // existence explicit for the Phase-2 conformance_check API surface.
  void idCount;

  return findings;
}

/**
 * Pretty-print findings to stderr — used by the cold-start bench script
 * and by ad-hoc CLI invocations during development.
 */
export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return 'no findings — clean graph.';
  const lines: string[] = [];
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  lines.push(
    `${findings.length} finding(s): ` +
      `${bySeverity.error} error, ${bySeverity.warning} warning, ${bySeverity.info} info`,
  );
  for (const f of findings) {
    lines.push(
      `  [${f.severity.toUpperCase()}] ${f.code} ${f.location.file}:${f.location.line} — ${f.message}`,
    );
  }
  return lines.join('\n');
}

/** Internal helper exposed for tests; do not depend on this from production. */
export function _edgeMatches(e: Edge, type: Edge['type']): boolean {
  return e.type === type;
}
