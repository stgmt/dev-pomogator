/**
 * Coverage + evidence-derived task status (FR-32).
 *
 * Pure helpers that turn the latest BDD run (`.dev-pomogator/.last-test-run.ndjson`,
 * ingested into the SpecGraph as `ScenarioNode.lastResult`) into:
 *   - per-scenario coverage buckets (passed / pending / undefined / ambiguous / failed / skipped)
 *   - a task → scenario map (prefer own Done-When scenario ids like `SPECGEN004_NN` / `TESTQUAL001_NN`; fallback to `@featureN` tags + FR refs)
 *   - per-task `verified_status` (DONE iff EVERY mapped scenario PASSED — the honesty gate)
 *
 * No I/O here — callers (MCP `get_coverage`, `get_trace`, `spec-status`) supply
 * the scenario + task views they already hold. Keeps this module trivially
 * unit-testable and reusable across the three consumers.
 *
 * @see .specs/spec-generator-v4/FR.md FR-32
 * @see ./parsers/ndjson.ts (produces ScenarioNode.lastResult via the builder)
 */

import { formatIdentity } from './identity.ts';

// `not_run` (scenario absent from the last NDJSON) is DISTINCT from `undefined`
// (scenario ran but its steps are undefined/unimplemented). Conflating them made a
// filtered `cucumber --tags X` run silently inflate `undefined` and read as "the
// spec fell apart" (2026-06-08 incident). Separating them lets the verdict warn
// "PARTIAL run — N scenarios not_run" instead of mislabelling them unverified.
export type Bucket = 'passed' | 'stale' | 'pending' | 'undefined' | 'ambiguous' | 'failed' | 'skipped' | 'not_run';
export type VerifiedStatus = 'DONE' | 'IN_PROGRESS' | 'unverified';
/** Test-body quality verdict from the `strong-tests`/`spec-status` audit (FR-35a). */
export type TestQualityVerdict = 'STRONG' | 'WEAK' | 'FAKE-POSITIVE-RISK';

/** Map a Cucumber/SpecGraph result enum to a coverage bucket. */
const RESULT_TO_BUCKET: Record<string, Bucket> = {
  PASSED: 'passed',
  PENDING: 'pending',
  UNDEFINED: 'undefined',
  AMBIGUOUS: 'ambiguous',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export interface ScenarioLike {
  /** Scenario node id (slug, e.g. `SCEN-specgen004-70-...`). */
  id: string;
  /** Gherkin tags, e.g. `@feature32`. */
  tags: string[];
  /** Last run result enum (PASSED/FAILED/UNDEFINED/…). ABSENT (`result == null`)
   *  → the scenario was NOT in the last NDJSON/overlay → `not_run` bucket (NOT `undefined`,
   *  which is reserved for a real UNDEFINED-steps result). */
  result?: string;
  /** True when a PASSED overlay result is older than the scenario/step-def source. */
  stale?: boolean;
  /** Owning spec slug (from `.specs/<slug>/`). Enables same-spec tag scoping. */
  spec?: string;
  /** Effective evidence source (for example docker-bdd:full vs docker-bdd:filtered). */
  source?: string;
  /** Last result from canonical full-run NDJSON, before any newer overlay wins. */
  canonicalResult?: string;
  /** Timestamp of the canonical full-run result. */
  canonicalRunAt?: string;
}

export interface TaskLike {
  id: string;
  /** Raw Done-When text (carries own scenario ids like `SPECGEN004_NN` / `TESTQUAL001_NN` + `@featureN`). */
  doneWhen: string;
  /** FR/NFR ids the task implements (TaskNode.refs). */
  refs: string[];
  /** Owning spec slug (from `.specs/<slug>/`). Enables same-spec tag scoping. */
  spec?: string;
  /** Hand-set lifecycle status from TASKS.md, supplied when callers need truth-guard diagnostics. */
  status?: 'todo' | 'ready' | 'in-progress' | 'done' | 'blocked';
}

/**
 * Derive the owning spec slug from a node's file path: the FULL directory
 * path between `.specs/` and the file name — `.specs/spec-generator-v4/FR.md`
 * → `spec-generator-v4`, nested `.specs/backlog/honest-status-command/FR.md`
 * → `backlog/honest-status-command` (FR-36a: first-segment-only slugs made
 * all `.specs/backlog/<name>/` specs share one cell → 60 composite-key
 * collisions). Returns `undefined` for files outside `.specs/` (e.g.
 * `tests/features/...`), so they never satisfy a spec-scoped tag match.
 */
export function specOf(file: string): string | undefined {
  const m = file.replace(/\\/g, '/').match(/(?:^|\/)\.specs\/(.+)\/[^/]+$/);
  return m ? m[1] : undefined;
}

/**
 * FR-36a: qualify one parser slice with its owning spec slug — the node KEY
 * becomes `<slug>:<localId>` and the node records `spec`; reference fields
 * (edge endpoints, `TaskNode.refs`, `AcNode.parentFr`) are qualified too
 * (file-local by construction). Anchors stay BARE + file-scoped (FR-36b) —
 * callers never pass `slice.anchors` here. Slug-less slices (files outside
 * `.specs/`) are returned untouched.
 *
 * Lives in coverage.ts next to `specOf` (no parser/builder imports → no
 * cycles): the parsers self-qualify (P13-2), so the builder no longer
 * rewrites slices.
 */
export function qualifySlice(
  slice: {
    nodes: Array<{ id: string; spec?: string; type: string } & Record<string, unknown>>;
    edges: Array<{ from: string; to: string }>;
  },
  slug: string | undefined,
): void {
  if (!slug) return;
  for (const node of slice.nodes) {
    node.spec = slug;
    node.id = formatIdentity({ namespace: slug, localId: node.id });
    if (node.type === 'Task' && Array.isArray(node.refs)) {
      node.refs = (node.refs as string[]).map((r) => `${slug}:${r}`);
    } else if (node.type === 'AC' && typeof node.parentFr === 'string' && node.parentFr) {
      node.parentFr = `${slug}:${node.parentFr}`;
    }
  }
  for (const e of slice.edges) {
    e.from = `${slug}:${e.from}`;
    e.to = `${slug}:${e.to}`;
  }
}

export interface TaskTruthIssue {
  code: 'TASK_DONE_UNVERIFIED' | 'TASK_DONE_CHECKLIST_OPEN' | 'TASK_DONE_FILTERED_ONLY';
  taskId: string;
  message: string;
  scenarios: Array<{ id: string; bucket: Bucket | 'unverified'; source?: string }>;
}

export interface CoverageReport {
  /** Every scenario id grouped into exactly one bucket (conservation invariant). */
  buckets: Record<Bucket, string[]>;
  /** Per-task derived status + the scenarios it was derived from + the test-quality verdict applied (FR-35a). */
  tasks: Record<string, { verified_status: VerifiedStatus; scenarios: string[]; test_quality?: TestQualityVerdict; truth_issues?: TaskTruthIssue[] }>;
  totals: { scenarios: number } & Record<Bucket, number>;
}

/**
 * Extract the canonical scenario key `<PREFIX>_<N>` from any string (slug id,
 * scenario name, or Done-When mention), or `null`. Tolerates the `SCENGEN004`
 * typo seen in some legacy task blocks.
 */
export function scenarioKey(s: string): string | null {
  // Matches SPECGEN004 (S-P-E-C-…), the legacy SCENGEN004 typo (S-C-E-N-…),
  // and named non-v4 scenario ids such as TESTQUAL001_10 used by strong-tests.
  const m = s.match(/\b([a-z][a-z0-9]*(?:gen)?\d{3})[_-](\d+)\b/i);
  if (!m) return null;
  const prefix = m[1].toLowerCase() === 'scengen004' ? 'specgen004' : m[1].toLowerCase();
  return `${prefix}_${m[2]}`;
}

/** Group scenarios by last result. ABSENT result → `not_run` (not in the last
 *  NDJSON); a present-but-unknown enum → `undefined`. */
export function bucketScenarios(scenarios: ScenarioLike[]): Record<Bucket, string[]> {
  const out: Record<Bucket, string[]> = {
    passed: [],
    stale: [],
    pending: [],
    not_run: [],
    undefined: [],
    ambiguous: [],
    failed: [],
    skipped: [],
  };
  for (const s of scenarios) {
    // ABSENT result → not_run (filtered/never-run); present enum → its bucket
    // (an unknown present enum still falls to `undefined`, the genuine "ran but
    // unresolved" bucket). A stale pass is its own non-green bucket: it proves the
    // scenario once passed but the test source changed after that pass.
    const bucket: Bucket = s.result
      ? (s.stale && s.result.toUpperCase() === 'PASSED' ? 'stale' : (RESULT_TO_BUCKET[s.result.toUpperCase()] ?? 'undefined'))
      : 'not_run';
    out[bucket].push(s.id);
  }
  return out;
}

/**
 * Map each task to the scenario ids it depends on:
 *   1. explicit scenario ids mentioned in Done-When are the task's own proof and
 *      WIN (FR-52e) — do not drag in @manual/not-run siblings from the same broad
 *      `@featureN` tag once an own scenario is named,
 *   2. otherwise, `@featureN` tags mentioned in Done-When,
 *   3. otherwise, FR refs → scenarios tagged `@feature<N>` (FR-N ↔ @featureN convention).
 * De-dupes within the chosen source class (a scenario referenced twice maps once).
 *
 * Same-spec scoping: `@featureN` tags are NOT unique across specs (`@feature2`
 * lives in many `.specs/<slug>/*.feature` files). When a task's `spec` is known,
 * tag-based matches (sources 2 & 3) are restricted to scenarios in the SAME
 * spec, so a v4 task isn't flagged by an unrun `@feature2` scenario in another
 * spec. Explicit own scenario ids (source 1) are unambiguous and never
 * scoped. When `spec` is absent (caller didn't supply it) the legacy
 * un-scoped behaviour is preserved.
 */
export function mapTasksToScenarios(
  tasks: TaskLike[],
  scenarios: ScenarioLike[],
): Map<string, string[]> {
  const byTag = new Map<string, Set<string>>();
  const byKey = new Map<string, string>(); // specgen004_NN -> scenario id
  const scenarioSpec = new Map<string, string | undefined>();
  for (const s of scenarios) {
    scenarioSpec.set(s.id, s.spec);
    for (const tag of s.tags) {
      const key = tag.toLowerCase();
      if (!byTag.has(key)) byTag.set(key, new Set());
      byTag.get(key)!.add(s.id);
    }
    const k = scenarioKey(s.id);
    if (k) byKey.set(k, s.id);
  }

  const out = new Map<string, string[]>();
  for (const task of tasks) {
    const explicitIds = new Set<string>();
    const taggedIds = new Set<string>();
    const refIds = new Set<string>();
    // Tag matches respect the task's spec when known (FR-N ↔ @featureN tags
    // collide across specs). An undefined task.spec disables scoping (legacy).
    const sameSpec = (sid: string): boolean =>
      task.spec === undefined || scenarioSpec.get(sid) === task.spec;
    for (const m of task.doneWhen.matchAll(/\b[a-z][a-z0-9]*(?:gen)?\d{3}[_-]\d+\b/gi)) {
      const k = scenarioKey(m[0]);
      const sid = k && byKey.get(k);
      if (sid) explicitIds.add(sid); // explicit own scenario id — unambiguous, never scoped
    }
    for (const m of task.doneWhen.matchAll(/@feature\d+/gi)) {
      for (const sid of byTag.get(m[0].toLowerCase()) ?? []) if (sameSpec(sid)) taggedIds.add(sid);
    }
    for (const ref of task.refs) {
      const n = ref.match(/FR-(\d+)/i);
      if (n) for (const sid of byTag.get(`@feature${n[1]}`) ?? []) if (sameSpec(sid)) refIds.add(sid);
    }
    out.set(task.id, [...(explicitIds.size > 0 ? explicitIds : taggedIds.size > 0 ? taggedIds : refIds)]);
  }
  return out;
}

/**
 * Derive verified status from a task's mapped scenarios:
 *   - no mapped scenarios → `unverified` (caller falls back to hand-set status)
 *   - EVERY mapped scenario `passed` → `DONE`
 *   - otherwise → `IN_PROGRESS` (never DONE while any scenario is non-green)
 */
/**
 * Owner-attested live scenario: tagged `@live-evidence @live-attested` in the
 * feature source. The attestation is an explicit, auditable owner statement —
 * it satisfies DONE evidence in place of a machine-captured live result, and
 * nothing else may stand in for it.
 */
export function isLiveAttestedScenario(tags: readonly string[] | undefined): boolean {
  if (!tags) return false;
  const lower = tags.map((t) => t.toLowerCase());
  return lower.includes('@live-evidence') && lower.includes('@live-attested');
}

export function verifiedStatus(
  scenarioIds: string[],
  bucketById: Map<string, Bucket>,
  verdict?: TestQualityVerdict,
  isLiveAttested?: (scenarioId: string) => boolean,
): VerifiedStatus {
  if (scenarioIds.length === 0) return 'unverified';
  const satisfied = (id: string): boolean => bucketById.get(id) === 'passed' || Boolean(isLiveAttested?.(id));
  if (!scenarioIds.every(satisfied)) return 'IN_PROGRESS';
  // FR-35a: GREEN is necessary but NOT sufficient — a WEAK / FAKE-POSITIVE-RISK test
  // body cannot verify DONE. Fail-open on STRONG / unknown (NFR-Reliability-10: never
  // false-block a genuinely strong test; an absent auditor degrades to PASS/FAIL).
  if (verdict === 'WEAK' || verdict === 'FAKE-POSITIVE-RISK') return 'IN_PROGRESS';
  return 'DONE';
}

/**
 * Tie it together: buckets + per-task verified_status + totals.
 * `testQualityByTask` (FR-35a) — optional per-task test-body verdict from the
 * `strong-tests`/`spec-status` audit; a WEAK/FAKE-POSITIVE-RISK verdict caps an
 * otherwise-green task below DONE. Absent → current PASS/FAIL behaviour (fail-open).
 */
export function taskTruthIssues(
  task: TaskLike,
  scenarioIds: string[],
  bucketById: Map<string, Bucket>,
  scenarioById: Map<string, ScenarioLike>,
  verified: VerifiedStatus,
): TaskTruthIssue[] {
  if (task.status !== 'done') return [];
  const evidence = scenarioIds.map((id) => ({
    id,
    bucket: bucketById.get(id) ?? 'unverified' as Bucket | 'unverified',
    source: scenarioById.get(id)?.source,
  }));
  const issues: TaskTruthIssue[] = [];
  if (verified !== 'DONE') {
    issues.push({
      code: 'TASK_DONE_UNVERIFIED',
      taskId: task.id,
      message: scenarioIds.length > 0
        ? `Status: DONE but mapped scenario evidence is not all canonical PASSED (${evidence.map((s) => `${s.id}=${s.bucket}`).join(', ')})`
        : 'Status: DONE but no mapped scenario evidence exists',
      scenarios: evidence,
    });
  }
  if (/^\s*-\s*\[\s\]/m.test(task.doneWhen)) {
    issues.push({
      code: 'TASK_DONE_CHECKLIST_OPEN',
      taskId: task.id,
      message: 'Status: DONE but Done When contains unchecked checkbox item(s)',
      scenarios: evidence,
    });
  }
  const filteredOnly = scenarioIds.length > 0 && scenarioIds.every((id) => {
    const scenario = scenarioById.get(id);
    return bucketById.get(id) === 'passed' && scenario?.source?.includes('filtered') && scenario.canonicalResult?.toUpperCase() !== 'PASSED';
  });
  if (filteredOnly) {
    issues.push({
      code: 'TASK_DONE_FILTERED_ONLY',
      taskId: task.id,
      message: 'Status: DONE is backed only by filtered-run evidence; canonical full-run proof is required for DONE truth',
      scenarios: evidence,
    });
  }
  return issues;
}

export function computeCoverage(
  tasks: TaskLike[],
  scenarios: ScenarioLike[],
  testQualityByTask: Record<string, TestQualityVerdict> = {},
): CoverageReport {
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  const taskMap = mapTasksToScenarios(tasks, scenarios);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const tasksOut: CoverageReport['tasks'] = {};
  for (const [taskId, scenarioIds] of taskMap) {
    const verdict = testQualityByTask[taskId];
    const verified = verifiedStatus(
      scenarioIds,
      bucketById,
      verdict,
      (id) => isLiveAttestedScenario(scenarioById.get(id)?.tags),
    );
    const task = taskById.get(taskId);
    const issues = task ? taskTruthIssues(task, scenarioIds, bucketById, scenarioById, verified) : [];
    tasksOut[taskId] = {
      verified_status: issues.length > 0 ? 'IN_PROGRESS' : verified,
      scenarios: scenarioIds,
      ...(verdict ? { test_quality: verdict } : {}),
      ...(issues.length > 0 ? { truth_issues: issues } : {}),
    };
  }

  const totals = { scenarios: scenarios.length } as CoverageReport['totals'];
  for (const b of Object.keys(buckets) as Bucket[]) totals[b] = buckets[b].length;

  return { buckets, tasks: tasksOut, totals };
}
