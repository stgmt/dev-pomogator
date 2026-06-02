/**
 * Coverage + evidence-derived task status (FR-32).
 *
 * Pure helpers that turn the latest BDD run (`.dev-pomogator/.last-test-run.ndjson`,
 * ingested into the SpecGraph as `ScenarioNode.lastResult`) into:
 *   - per-scenario coverage buckets (passed / pending / undefined / ambiguous / failed / skipped)
 *   - a task → scenario map (from Done-When `SPECGEN004_NN` ids + `@featureN` tags + FR refs)
 *   - per-task `verified_status` (DONE iff EVERY mapped scenario PASSED — the honesty gate)
 *
 * No I/O here — callers (MCP `get_coverage`, `get_trace`, `spec-status`) supply
 * the scenario + task views they already hold. Keeps this module trivially
 * unit-testable and reusable across the three consumers.
 *
 * @see .specs/spec-generator-v4/FR.md FR-32
 * @see ./parsers/ndjson.ts (produces ScenarioNode.lastResult via the builder)
 */

export type Bucket = 'passed' | 'pending' | 'undefined' | 'ambiguous' | 'failed' | 'skipped';
export type VerifiedStatus = 'DONE' | 'IN_PROGRESS' | 'unverified';

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
  /** Last run result; `undefined` → not run yet → counted as `undefined`. */
  result?: string;
}

export interface TaskLike {
  id: string;
  /** Raw Done-When text (carries `SPECGEN004_NN` refs + `@featureN`). */
  doneWhen: string;
  /** FR/NFR ids the task implements (TaskNode.refs). */
  refs: string[];
}

export interface CoverageReport {
  /** Every scenario id grouped into exactly one bucket (conservation invariant). */
  buckets: Record<Bucket, string[]>;
  /** Per-task derived status + the scenarios it was derived from. */
  tasks: Record<string, { verified_status: VerifiedStatus; scenarios: string[] }>;
  totals: { scenarios: number } & Record<Bucket, number>;
}

/**
 * Extract the canonical scenario key `specgen004_NN` from any string (slug id,
 * scenario name, or Done-When mention), or `null`. Tolerates the `SCENGEN004`
 * typo seen in some legacy task blocks.
 */
export function scenarioKey(s: string): string | null {
  // Matches both SPECGEN004 (S-P-E-C-…) and the legacy SCENGEN004 typo (S-C-E-N-…).
  const m = s.match(/s[pc]e[cn]gen004[_-](\d+)/i);
  return m ? `specgen004_${m[1]}` : null;
}

/** Group scenarios by last result. Missing/unknown result → `undefined` bucket. */
export function bucketScenarios(scenarios: ScenarioLike[]): Record<Bucket, string[]> {
  const out: Record<Bucket, string[]> = {
    passed: [],
    pending: [],
    undefined: [],
    ambiguous: [],
    failed: [],
    skipped: [],
  };
  for (const s of scenarios) {
    const bucket = s.result ? (RESULT_TO_BUCKET[s.result.toUpperCase()] ?? 'undefined') : 'undefined';
    out[bucket].push(s.id);
  }
  return out;
}

/**
 * Map each task to the scenario ids it depends on, via the union of:
 *   1. explicit `SPECGEN004_NN` ids mentioned in Done-When,
 *   2. `@featureN` tags mentioned in Done-When,
 *   3. FR refs → scenarios tagged `@feature<N>` (FR-N ↔ @featureN convention).
 * De-dupes across all three sources (a scenario referenced twice maps once).
 */
export function mapTasksToScenarios(
  tasks: TaskLike[],
  scenarios: ScenarioLike[],
): Map<string, string[]> {
  const byTag = new Map<string, Set<string>>();
  const byKey = new Map<string, string>(); // specgen004_NN -> scenario id
  for (const s of scenarios) {
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
    const ids = new Set<string>();
    for (const m of task.doneWhen.matchAll(/s[pc]e[cn]gen004[_-]\d+/gi)) {
      const k = scenarioKey(m[0]);
      const sid = k && byKey.get(k);
      if (sid) ids.add(sid);
    }
    for (const m of task.doneWhen.matchAll(/@feature\d+/gi)) {
      for (const sid of byTag.get(m[0].toLowerCase()) ?? []) ids.add(sid);
    }
    for (const ref of task.refs) {
      const n = ref.match(/FR-(\d+)/i);
      if (n) for (const sid of byTag.get(`@feature${n[1]}`) ?? []) ids.add(sid);
    }
    out.set(task.id, [...ids]);
  }
  return out;
}

/**
 * Derive verified status from a task's mapped scenarios:
 *   - no mapped scenarios → `unverified` (caller falls back to hand-set status)
 *   - EVERY mapped scenario `passed` → `DONE`
 *   - otherwise → `IN_PROGRESS` (never DONE while any scenario is non-green)
 */
export function verifiedStatus(scenarioIds: string[], bucketById: Map<string, Bucket>): VerifiedStatus {
  if (scenarioIds.length === 0) return 'unverified';
  return scenarioIds.every((id) => bucketById.get(id) === 'passed') ? 'DONE' : 'IN_PROGRESS';
}

/** Tie it together: buckets + per-task verified_status + totals. */
export function computeCoverage(tasks: TaskLike[], scenarios: ScenarioLike[]): CoverageReport {
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);

  const taskMap = mapTasksToScenarios(tasks, scenarios);
  const tasksOut: CoverageReport['tasks'] = {};
  for (const [taskId, scenarioIds] of taskMap) {
    tasksOut[taskId] = {
      verified_status: verifiedStatus(scenarioIds, bucketById),
      scenarios: scenarioIds,
    };
  }

  const totals = { scenarios: scenarios.length } as CoverageReport['totals'];
  for (const b of Object.keys(buckets) as Bucket[]) totals[b] = buckets[b].length;

  return { buckets, tasks: tasksOut, totals };
}
