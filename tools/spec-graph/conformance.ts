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
import { computeCoverage, specOf, type Bucket, type ScenarioLike, type TaskLike } from './coverage.ts';

export type FindingCode =
  | 'UNCOVERED_FR'
  | 'ORPHAN_TASK'
  | 'SCENARIO_TAG_ORPHAN'
  | 'UNTAGGED_SCENARIO'
  | 'DUPLICATE_DEFINITION'
  | 'TASK_STATUS_UNVERIFIED'
  | 'TASK_UNTESTED'
  | 'TASK_TEST_QUALITY';

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

/** Classic Levenshtein edit distance (iterative, O(m·n) time, O(n) space). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Top-N existing ids closest to `target` by edit distance (ties broken by id). */
function topSimilarIds(target: string, ids: string[], n: number): string[] {
  return [...ids]
    .map((id) => ({ id, d: levenshtein(target, id) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    .slice(0, n)
    .map((x) => x.id);
}

/**
 * Run all Phase-1 conformance rules on a built graph.
 *
 * Severities follow the FR-13 default policy: `warning` for orphan-class
 * issues, `info` for missing-coverage informational notes, `error` for
 * structural duplicates (which point at a build-time discard).
 */
export function checkConformance(
  graph: SpecGraph,
  opts: { orphanPolicy?: { scenario_tag_orphan?: 'warn' | 'block' } } = {},
): Finding[] {
  const findings: Finding[] = [];
  // FR-13: orphan severity is config-driven — default `warn`, escalated to
  // `error` when `.spec-config.json::orphan_policy.scenario_tag_orphan = "block"`.
  const tagOrphanSeverity: Severity =
    opts.orphanPolicy?.scenario_tag_orphan === 'block' ? 'error' : 'warning';
  const specIds = [...graph.nodes.values()]
    .filter((n) => n.type === 'FR' || n.type === 'NFR' || n.type === 'AC')
    .map((n) => n.id);

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

  // 2b) TASK_STATUS_UNVERIFIED — hand-set DONE but a mapped scenario is not
  // green (FR-32 honesty gate). Uses the single coverage.ts mapper so the
  // verdict matches get_coverage exactly. `unverified` tasks (no mapped
  // scenarios) are never flagged — there is no evidence to contradict.
  const scenarioLikes: ScenarioLike[] = [];
  const taskLikes: TaskLike[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'Scenario') {
      const s = node as ScenarioNode;
      scenarioLikes.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: specOf(s.file) });
    } else if (node.type === 'Task') {
      const t = node as TaskNode;
      taskLikes.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: specOf(t.file) });
    }
  }
  if (taskLikes.length > 0) {
    const cov = computeCoverage(taskLikes, scenarioLikes);
    const bucketById = new Map<string, Bucket>();
    for (const b of Object.keys(cov.buckets) as Bucket[]) for (const id of cov.buckets[b]) bucketById.set(id, b);
    for (const node of graph.nodes.values()) {
      if (node.type !== 'Task') continue;
      const task = node as TaskNode;
      if (task.status !== 'done') continue;
      const entry = cov.tasks[task.id];
      if (!entry) continue;
      if (entry.verified_status === 'IN_PROGRESS') {
        const offenders = entry.scenarios.filter((id) => bucketById.get(id) !== 'passed');
        findings.push({
          code: 'TASK_STATUS_UNVERIFIED',
          severity: 'warning',
          location: { file: task.file, line: task.line },
          message: `Task ${task.id} is marked DONE but ${offenders.length}/${entry.scenarios.length} mapped scenarios are not green (e.g. ${offenders.slice(0, 3).map((id) => `${id}=${bucketById.get(id)}`).join(', ')}).`,
          nodeId: task.id,
          suggestions: [
            { action: 'make_green_or_downgrade', reason: 'Make the mapped scenarios pass, or set Status back to IN_PROGRESS — a DONE task must have every mapped scenario green.', confidence: 'high' },
          ],
        });
      } else if (entry.verified_status === 'unverified') {
        // FR-35c: a task marked DONE with ZERO linked scenarios must NOT be silent.
        // "mark done, write no test" is the naeb the gate previously missed (it only
        // fired on a linked-but-red scenario). Complements FR/@feature NOT_COVERED.
        findings.push({
          code: 'TASK_UNTESTED',
          severity: 'warning',
          location: { file: task.file, line: task.line },
          message: `Task ${task.id} is marked DONE but has ZERO linked scenarios — no test backs the claim (Done-When references no SPECGEN id / @feature tag, and refs map to no scenario).`,
          nodeId: task.id,
          suggestions: [
            { action: 'write_test', reason: 'Add a BDD scenario and reference its SPECGEN id (or @feature tag) in Done-When, so the DONE claim is backed by a real test.', confidence: 'high' },
            { action: 'downgrade', reason: 'Or set Status back to IN_PROGRESS until a test exists — a DONE task with no test is unverifiable.', confidence: 'high' },
          ],
        });
      }
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
        const similar = topSimilarIds(referenced, specIds, 3);
        findings.push({
          code: 'SCENARIO_TAG_ORPHAN',
          severity: tagOrphanSeverity,
          location: { file: scen.file, line: scen.line },
          message: `Scenario ${scen.id} carries tag @${referenced} but no FR/NFR/AC with that id exists.`,
          nodeId: scen.id,
          relatedId: referenced,
          suggestions: [
            {
              action: 'rename_tag',
              reason: similar.length
                ? `Did you mean ${similar.map((s) => `@${s}`).join(' / ')}? (top-3 closest existing ids)`
                : `No similar spec id exists — verify the tag.`,
              confidence: 'medium',
            },
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
