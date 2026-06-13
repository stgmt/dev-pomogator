/**
 * P21-6 honest task census — PER-SPEC "what is NOT finished", graph-only.
 *
 * Motivated by a real challenge (2026-06-10): "I don't believe all tasks are
 * done, there's no hook for the unfinished ones, and it must cover ALL specs."
 * A checkbox counter would just reprint the self-reported state. This derives
 * three signals that don't trust the `- [x]`, PER SPEC:
 *
 *   - open       — status todo/in-progress/blocked (author-admitted not-done).
 *   - doneRed    — status DONE but ≥1 mapped scenario in a HARD-NEGATIVE bucket
 *                  (failed/undefined/ambiguous). `not_run` is EXCLUDED so a
 *                  filtered/stale cucumber run can't false-flag (the "partial
 *                  cucumber poisons NDJSON" hazard) — a stale run turns a
 *                  scenario into not_run, never failed.
 *   - doneUnrun  — status DONE but NOT all scenarios passed and NOT red, i.e.
 *                  ≥1 not_run OR no scenario at all → "claimed done, can't
 *                  confirm". This is the "не запускался — тоже писать" signal:
 *                  surfaced, not hidden.
 *
 * Only the STRICT task format (parsed into Task nodes by the graph) is tracked;
 * loose-checkbox specs contribute nothing (a deliberate scope decision — they
 * get reworked to the strict format, not silently half-counted).
 *
 * GRAPH-ONLY (no NDJSON dependency for correctness): doneRed needs results but
 * excludes not_run, so it is right even on a skipNdjson build (→ 0). Reuses
 * mapTasksToScenarios + bucketScenarios + specOf — the SAME machinery
 * get_coverage uses — so the census never diverges from the verdict.
 *
 * Produced on every on-disk spec change by the MCP server's watcher (lifecycle,
 * the enforce-mode path) AND by spec-conformance-push (raw Write|Edit), cached
 * to `.dev-pomogator/.task-census.json` (+ `.prev` rotation for the history
 * line); read by the per-prompt banner — the graph is NEVER built on the hot
 * UserPromptSubmit path (NFR-Performance-6).
 *
 * @see ./coverage.ts (mapTasksToScenarios / bucketScenarios / specOf)
 * @see tools/spec-mcp-server/lifecycle.ts + tools/spec-conformance-push (producers)
 * @see tools/specs-validator/conformance-summary.ts (consumer — the banner)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SpecGraph, TaskNode, ScenarioNode } from './types.ts';
import {
  mapTasksToScenarios,
  bucketScenarios,
  specOf,
  type Bucket,
  type ScenarioLike,
  type TaskLike,
} from './coverage.ts';

/** Per-spec unfinished-work counts. */
export interface SpecCensus {
  slug: string;
  open: number;
  doneRed: number;
  doneUnrun: number;
  /**
   * FR-49a: the first OPEN task (todo/in-progress/blocked) in this spec — the
   * concrete «next step» the per-prompt banner names so «what's next» rides the
   * standing signal, not just counts. Undefined when the spec has no open task
   * (only doneRed/doneUnrun unfinished).
   */
  nextOpen?: { id: string; title: string };
}

export interface TaskCensus {
  /** Corpus totals across every tracked spec. */
  total: { open: number; doneRed: number; doneUnrun: number };
  /** Specs WITH unfinished work, sorted by (open+doneRed+doneUnrun) desc. */
  specs: SpecCensus[];
}

const HARD_NEGATIVE = new Set<Bucket>(['failed', 'undefined', 'ambiguous']);

/**
 * Compute the per-spec honest census over a built graph. Pure — the caller
 * stamps the timestamp and writes the cache.
 */
export function computeTaskCensus(graph: SpecGraph): TaskCensus {
  const scenarios: ScenarioLike[] = [];
  const tasks: TaskLike[] = [];
  const taskEntries: Array<{ node: TaskNode; slug: string }> = [];
  for (const node of graph.nodes.values()) {
    const nodeSpec = specOf((node as { file: string }).file);
    if (node.type === 'Scenario') {
      const s = node as ScenarioNode;
      scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: nodeSpec });
    } else if (node.type === 'Task') {
      const t = node as TaskNode;
      tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec });
      taskEntries.push({ node: t, slug: nodeSpec ?? '(no-spec)' });
    }
  }
  const map = mapTasksToScenarios(tasks, scenarios);
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);

  const per = new Map<string, SpecCensus>();
  const row = (slug: string): SpecCensus => {
    let r = per.get(slug);
    if (!r) { r = { slug, open: 0, doneRed: 0, doneUnrun: 0 }; per.set(slug, r); }
    return r;
  };
  for (const { node: t, slug } of taskEntries) {
    if (t.status === 'todo' || t.status === 'in-progress' || t.status === 'blocked') {
      const r = row(slug);
      r.open++;
      // FR-49a: capture the FIRST open task (document order) as the spec's «next step».
      if (!r.nextOpen) r.nextOpen = { id: t.id, title: t.title ?? t.id };
    } else if (t.status === 'done') {
      const sids = map.get(t.id) ?? [];
      const hasRed = sids.some((id) => HARD_NEGATIVE.has(bucketById.get(id) ?? 'not_run'));
      const allPassed = sids.length > 0 && sids.every((id) => bucketById.get(id) === 'passed');
      if (hasRed) row(slug).doneRed++;
      else if (!allPassed) row(slug).doneUnrun++; // ≥1 not_run OR no scenario → can't confirm
      // allPassed → genuinely confirmed → not surfaced
    }
  }

  const specs = [...per.values()]
    .filter((s) => s.open + s.doneRed + s.doneUnrun > 0)
    .sort((a, b) => (b.open + b.doneRed + b.doneUnrun) - (a.open + a.doneRed + a.doneUnrun));
  const total = specs.reduce(
    (acc, s) => ({ open: acc.open + s.open, doneRed: acc.doneRed + s.doneRed, doneUnrun: acc.doneUnrun + s.doneUnrun }),
    { open: 0, doneRed: 0, doneUnrun: 0 },
  );
  return { total, specs };
}

/** On-disk cache the producer writes and the per-prompt banner reads. */
export interface TaskCensusCache extends TaskCensus {
  /** ISO timestamp of the producing build — shown so a stale census is visible. */
  ts: string;
}

const CACHE_REL = path.join('.dev-pomogator', '.task-census.json');
const PREV_REL = path.join('.dev-pomogator', '.task-census.prev.json');

export function taskCensusCachePath(repoRoot: string): string {
  return path.join(repoRoot, CACHE_REL);
}
export function taskCensusPrevPath(repoRoot: string): string {
  return path.join(repoRoot, PREV_REL);
}

/**
 * Atomically persist the census (temp + rename, per atomic-config-save), AND
 * rotate the current cache into `.prev` first so the banner can show a
 * было→стало history line. Best-effort — never crash a soft-tier hook.
 */
export function writeTaskCensusCache(repoRoot: string, census: TaskCensus, ts: string): void {
  const file = taskCensusCachePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Rotate current → prev (only when the totals actually changed, so a no-op
  // rebuild doesn't erase a meaningful previous snapshot).
  try {
    const cur = readTaskCensusCache(repoRoot);
    if (cur && sumTotal(cur) !== sumTotal(census)) {
      fs.copyFileSync(file, taskCensusPrevPath(repoRoot));
    }
  } catch {
    /* no prior cache / unreadable — first write, no prev */
  }
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...census, ts } satisfies TaskCensusCache, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/** Sum of all unfinished counts — the single number the history line compares. */
export function sumTotal(c: TaskCensus): number {
  return c.total.open + c.total.doneRed + c.total.doneUnrun;
}

function readCacheFile(p: string): TaskCensusCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!parsed?.total || typeof parsed.total.open !== 'number') return null;
    return parsed as TaskCensusCache;
  } catch {
    return null;
  }
}

/** Read the current cached census. Null on missing / torn / malformed. */
export function readTaskCensusCache(repoRoot: string): TaskCensusCache | null {
  return readCacheFile(taskCensusCachePath(repoRoot));
}
/** Read the previous snapshot (for the было→стало line). Null if none. */
export function readTaskCensusPrev(repoRoot: string): TaskCensusCache | null {
  return readCacheFile(taskCensusPrevPath(repoRoot));
}
