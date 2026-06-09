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
 *   TASK_NO_REQUIREMENT Task references no requirement at all (empty refs +
 *                       no FR/SPECGEN/@feature in Done-When) — reverse gap,
 *                       INFO (FR-44/GT-3; non-gating to avoid legacy-debt flood)
 *   DUPLICATE_DEFINITION Two headings produced the same canonical id — code is
 *                       declared HERE (shared vocabulary) but NOT emitted by this
 *                       walk: the builder's dedup hides the duplicate before we run.
 *                       Owners: spec-conformance-guard (write-time deny) +
 *                       corpus-health raw pre-map collision scan (see check 5 note)
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
import { computeCoverage, specOf, type Bucket, type ScenarioLike, type TaskLike, type TestQualityVerdict } from './coverage.ts';

export type FindingCode =
  | 'UNCOVERED_FR'
  | 'ORPHAN_TASK'
  | 'SCENARIO_TAG_ORPHAN'
  | 'UNTAGGED_SCENARIO'
  | 'TAG_BULK_SUSPECT'
  | 'DUPLICATE_DEFINITION'
  | 'TASK_STATUS_UNVERIFIED'
  | 'TASK_UNTESTED'
  | 'TASK_TEST_QUALITY'
  | 'TASK_NO_REQUIREMENT'
  | 'ORPHAN_PROJECT_TEST'
  | 'FR_NO_RESEARCH';

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
 * FR-36a: the bare local id of a node (`spec-generator-v4:FR-2` → `FR-2`).
 * Hand-built test graphs and files outside `.specs/` carry bare ids — for
 * those the id IS the local id.
 */
function localIdOf(node: { id: string; spec?: string }): string {
  return node.spec ? node.id.slice(node.spec.length + 1) : node.id;
}

/**
 * FR-36a: resolve a BARE tag reference (`@FR-2`) against composite-keyed
 * nodes. Tags stay bare in `.feature` files (same-spec convention):
 *   1. scenario's own spec defines it → `<spec>:<ref>`;
 *   2. bare node with that id exists (hand-built graphs, non-.specs files);
 *   3. spec-less scenario (tests/features) → satisfied if ANY spec defines
 *      the local id (cross-spec ambiguity tolerated at warning level).
 */
function tagResolves(
  graph: SpecGraph,
  scenSpec: string | undefined,
  ref: string,
  specLocalIds: ReadonlySet<string>,
): boolean {
  if (scenSpec && graph.nodes.has(`${scenSpec}:${ref}`)) return true;
  if (graph.nodes.has(ref)) return true;
  return !scenSpec && specLocalIds.has(ref);
}

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
  opts: {
    orphanPolicy?: { scenario_tag_orphan?: 'warn' | 'block' };
    /** FR-35a — per-task test-body verdict; WEAK/FAKE-POSITIVE-RISK on a green task → TASK_TEST_QUALITY. */
    testQualityByTask?: Record<string, TestQualityVerdict>;
  } = {},
): Finding[] {
  const findings: Finding[] = [];
  // FR-13: orphan severity is config-driven — default `warn`, escalated to
  // `error` when `.spec-config.json::orphan_policy.scenario_tag_orphan = "block"`.
  const tagOrphanSeverity: Severity =
    opts.orphanPolicy?.scenario_tag_orphan === 'block' ? 'error' : 'warning';
  const specNodes = [...graph.nodes.values()].filter(
    (n) => n.type === 'FR' || n.type === 'NFR' || n.type === 'AC',
  );
  // FR-36a: bare local ids across all specs — tag resolution for spec-less
  // scenarios + did-you-mean suggestions speak the author's (bare) language.
  const specLocalIds = new Set(specNodes.map((n) => localIdOf(n)));

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
    // Tag hints speak the author's bare-tag language (`@FR-2`), not the
    // composite node key — tags stay bare in `.feature` files (FR-36b).
    const bareTag = localIdOf(node);
    findings.push({
      code: 'UNCOVERED_FR',
      severity: 'warning',
      location: { file: node.file, line: node.line },
      message: `FR ${node.id} has no Acceptance Criteria and no @${bareTag}-tagged Scenario.`,
      nodeId: node.id,
      suggestions: [
        { action: 'create_ac', reason: 'Add an AC heading `## AC-N (FR-N)` covering this FR.', confidence: 'high' },
        { action: 'tag_scenario', reason: `Add @${bareTag} to an existing Scenario in any \`.feature\` file.`, confidence: 'medium' },
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

  // 2a) TASK_NO_REQUIREMENT (FR-44 GT-3, reverse traceability) — a Task that
  // references NO requirement at all: empty `refs` AND its Done-When names no
  // FR-N / SPECGEN id / @feature tag, so nothing ties it to a spec atom. INFO
  // (not gating): the real corpus carries pre-existing untraced tasks (24 on
  // spec-generator-v4), so promoting this to the hard gate would flood RED on
  // legacy debt — surface it, decide promote-vs-keep-advisory after cleanup (P20-5).
  for (const node of graph.nodes.values()) {
    if (node.type !== 'Task') continue;
    const task = node as TaskNode;
    if (task.refs.length > 0) continue;
    if (/\bFR-\d+|SPECGEN\d+_\d+|@feature\d+/i.test(task.doneWhen ?? '')) continue;
    findings.push({
      code: 'TASK_NO_REQUIREMENT',
      severity: 'info',
      location: { file: task.file, line: task.line },
      message: `Task ${task.id} references NO requirement — empty refs and its Done-When names no FR-N / SPECGEN id / @feature tag. A task with no upstream requirement cannot be traced (reverse-traceability gap, FR-44/GT-3).`,
      nodeId: task.id,
      suggestions: [
        { action: 'add_requirement_ref', reason: 'Add a _Requirements: [FR-N](FR.md#fr-n)_ line, or reference a SPECGEN id / @feature tag in Done-When.', confidence: 'high' },
      ],
    });
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
    const cov = computeCoverage(taskLikes, scenarioLikes, opts.testQualityByTask);
    const bucketById = new Map<string, Bucket>();
    for (const b of Object.keys(cov.buckets) as Bucket[]) for (const id of cov.buckets[b]) bucketById.set(id, b);
    for (const node of graph.nodes.values()) {
      if (node.type !== 'Task') continue;
      const task = node as TaskNode;
      if (task.status !== 'done') continue;
      const entry = cov.tasks[task.id];
      if (!entry) continue;
      if (entry.verified_status === 'IN_PROGRESS') {
        const allGreen = entry.scenarios.length > 0 && entry.scenarios.every((id) => bucketById.get(id) === 'passed');
        if (allGreen && (entry.test_quality === 'WEAK' || entry.test_quality === 'FAKE-POSITIVE-RISK')) {
          // FR-35a: every mapped scenario is green, but the test BODY audits as weak /
          // fake-positive — a passing-but-worthless test cannot verify DONE.
          findings.push({
            code: 'TASK_TEST_QUALITY',
            severity: 'warning',
            location: { file: task.file, line: task.line },
            message: `Task ${task.id} is marked DONE and its scenarios are green, but the test body audits as ${entry.test_quality} — a passing-but-${entry.test_quality} test cannot verify DONE.`,
            nodeId: task.id,
            relatedId: entry.test_quality,
            suggestions: [
              { action: 'strengthen_test', reason: 'Strengthen the test (real assertions, no over-mocking) until strong-tests reports STRONG, or set Status back to IN_PROGRESS.', confidence: 'high' },
            ],
          });
        } else {
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
        }
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
    const scenSpec = scen.spec ?? specOf(scen.file);
    for (const tag of scen.tags) {
      // FR-36c/FR-37b (P14-2): `@featureN` builds a REAL same-spec tested-by
      // edge since P13-2 — when its FR-N actually exists, the scenario IS
      // tagged up to a requirement. A non-resolving @featureN (no FR-N in
      // this spec) stays untagged — a dangling convention is not coverage.
      const f = tag.match(/^@feature(\d+)$/i);
      if (f && tagResolves(graph, scenSpec, `FR-${f[1]}`, specLocalIds)) {
        hasSpecTag = true;
        continue;
      }
      const m = tag.match(SPEC_TAG_RE);
      if (!m) continue;
      hasSpecTag = true;
      const referenced = m[1];
      if (!tagResolves(graph, scenSpec, referenced, specLocalIds)) {
        const similar = topSimilarIds(referenced, [...specLocalIds], 3);
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

  // 4b) TAG_BULK_SUSPECT — one requirement tag blanketing many scenarios.
  //
  // Producer-guard (2026-06-06 incident): a feature-level `@FR-19` was
  // blanket-applied to 28 legacy scenarios to clear the UNTAGGED gate; the
  // FR-8 judge then flagged 11 semantic drifts — the tag overreached. A
  // single requirement tag claiming 10+ scenarios in one file is a smell:
  // the gate invites tag-gaming, so the graph itself must raise the flag
  // and point at the judge BEFORE the drift inventory does.
  {
    const BULK_THRESHOLD = 10;
    const byFileTag = new Map<string, { count: number; file: string; line: number; tag: string }>();
    for (const node of graph.nodes.values()) {
      if (node.type !== 'Scenario') continue;
      const scen = node as ScenarioNode;
      for (const tag of scen.tags) {
        if (!SPEC_TAG_RE.test(tag)) continue;
        const key = `${scen.file}|${tag}`;
        const cur = byFileTag.get(key);
        if (cur) cur.count++;
        else byFileTag.set(key, { count: 1, file: scen.file, line: scen.line, tag });
      }
    }
    for (const { count, file, line, tag } of byFileTag.values()) {
      if (count < BULK_THRESHOLD) continue;
      findings.push({
        code: 'TAG_BULK_SUSPECT',
        severity: 'info',
        location: { file, line },
        message: `Tag ${tag} blankets ${count} scenarios in one file — verify the semantic fit per scenario (run the FR-8 judge); a blanket tag that clears UNTAGGED without testing the requirement is tag-gaming.`,
        nodeId: tag,
        suggestions: [
          { action: 'run_semantic_judge', reason: `spec-verdict.ts with semantic ON will judge each ${tag}↔scenario pair.`, confidence: 'high' },
          { action: 'retag_per_scenario', reason: 'Map each scenario to the requirement it actually tests.', confidence: 'medium' },
        ],
      });
    }
  }

  // 5) DUPLICATE_DEFINITION — NOT emitted here, by design (P19-5 LOW resolution,
  // 2026-06-10). A duplicate is invisible to a graph walk: the builder's
  // «if (!nodes.has(id))» dedup keeps the FIRST definition, so by the time this
  // checker runs the second one no longer exists. The code stays in FindingCode —
  // it is the shared vocabulary of the surfaces that DO own the contract:
  //   - write-time: spec-conformance-guard.ts denies the Write/Edit that would
  //     create the duplicate (the real enforcement; SHAPE003 / SPECGEN004_09 bind it);
  //   - corpus-wide: corpus-health's RAW pre-map collision scan sees what the
  //     map dedup hides (the FR-36 «47-of-470» disease class).
  // (The previous dead `idCount` over graph.definitions.keys() counted Map keys —
  // unique by definition, every count was 1 — and was removed as unreachable.)

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
