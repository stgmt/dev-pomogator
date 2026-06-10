/**
 * P21-4 honest task census — the "what is NOT finished" signal, graph-only.
 *
 * Motivated by a real challenge (2026-06-10): "I don't believe all tasks are
 * done, and there's no hook that surfaces the unfinished ones." A naive counter
 * that greps `Status: TODO` / `- [ ]` would just reprint the SELF-REPORTED state
 * the user distrusts — and trust every `- [x]` blindly. This module instead
 * derives TWO signals that don't rely on the checkbox being honest:
 *
 *   - open       — tasks whose status is todo/in-progress/blocked. The author
 *                  ADMITS these aren't done; surfacing them is honest reporting.
 *   - doneButRed — tasks marked DONE that have ≥1 mapped scenario in a HARD-
 *                  NEGATIVE bucket (failed/undefined/ambiguous). This answers the
 *                  part the user led with — "я не верю что все ВЫПОЛНЕНЫ" — the
 *                  lie a bare checkbox count hides. It DELIBERATELY excludes
 *                  `not_run`: a filtered/stale cucumber run turns a scenario into
 *                  `not_run`, NEVER `failed` (the "partial cucumber poisons
 *                  NDJSON" hazard), so doneButRed survives a stale run instead of
 *                  false-flagging every done task. 0 today = a working smoke
 *                  detector, not a dead signal. The `not_run` "can't-verify" set
 *                  (marksman / legacy-v3) is real but ndjson-sensitive and stays
 *                  in /spec-status — out of the per-prompt banner.
 *
 * It reuses {@link mapTasksToScenarios} + {@link bucketScenarios} + {@link specOf}
 * — the SAME mapping/bucketing get_coverage uses — so the census never diverges
 * from the authoritative verdict.
 *
 * Produced on each spec edit by tools/spec-conformance-push (which already
 * cold-builds the graph for conformance; the census build adds ndjson so
 * scenario results are populated — `doneButRed` needs them), cached to
 * `.dev-pomogator/.task-census.json`, and read by the per-prompt banner
 * (tools/specs-validator/conformance-summary) — so the SpecGraph is NEVER built
 * on the hot UserPromptSubmit path (NFR-Performance-6).
 *
 * @see ./coverage.ts (mapTasksToScenarios / specOf — single source of truth)
 * @see tools/spec-conformance-push/spec-conformance-push.ts (producer)
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

export interface TaskCensus {
  /** Total Task nodes considered. */
  total: number;
  /** Count of tasks with status todo/in-progress/blocked (admitted not-done). */
  open: number;
  /** Count of DONE tasks with ≥1 hard-negative scenario (failed/undefined/ambiguous; not_run excluded). */
  doneButRed: number;
  /** First {@link CAP} open task ids — enough to act, bounded for the cache. */
  openIds: string[];
  /** First {@link CAP} done-but-red task ids. */
  doneButRedIds: string[];
}

/** Cap id arrays so the cached JSON stays small even on a huge corpus. */
const CAP = 25;

/**
 * Compute the honest census over a built graph. `spec` (optional) scopes to one
 * spec slug; omitted → whole corpus (every `.specs/<slug>/`). Pure — the caller
 * stamps a timestamp and writes the cache.
 */
export function computeTaskCensus(graph: SpecGraph, spec?: string): TaskCensus {
  const scenarios: ScenarioLike[] = [];
  const tasks: TaskLike[] = [];
  const taskNodes: TaskNode[] = [];
  for (const node of graph.nodes.values()) {
    const nodeSpec = specOf((node as { file: string }).file);
    if (spec && nodeSpec !== spec) continue;
    if (node.type === 'Scenario') {
      const s = node as ScenarioNode;
      scenarios.push({ id: s.id, tags: s.tags, result: s.lastResult, spec: nodeSpec });
    } else if (node.type === 'Task') {
      const t = node as TaskNode;
      tasks.push({ id: t.id, doneWhen: t.doneWhen ?? '', refs: t.refs, spec: nodeSpec });
      taskNodes.push(t);
    }
  }
  const map = mapTasksToScenarios(tasks, scenarios);
  const buckets = bucketScenarios(scenarios);
  const bucketById = new Map<string, Bucket>();
  for (const b of Object.keys(buckets) as Bucket[]) for (const id of buckets[b]) bucketById.set(id, b);
  // Hard-negative = a REAL bad result; `not_run` (absent from the last run) is
  // EXCLUDED so a filtered/stale cucumber run can't false-flag a done task.
  const HARD_NEGATIVE = new Set<Bucket>(['failed', 'undefined', 'ambiguous']);

  const openIds: string[] = [];
  const doneButRedIds: string[] = [];
  for (const t of taskNodes) {
    if (t.status === 'todo' || t.status === 'in-progress' || t.status === 'blocked') {
      openIds.push(t.id);
    } else if (t.status === 'done') {
      const sids = map.get(t.id) ?? [];
      if (sids.some((id) => HARD_NEGATIVE.has(bucketById.get(id) ?? 'not_run'))) {
        doneButRedIds.push(t.id);
      }
    }
  }
  return {
    total: taskNodes.length,
    open: openIds.length,
    doneButRed: doneButRedIds.length,
    openIds: openIds.slice(0, CAP),
    doneButRedIds: doneButRedIds.slice(0, CAP),
  };
}

/** On-disk cache the producer writes and the per-prompt banner reads. */
export interface TaskCensusCache extends TaskCensus {
  /** ISO timestamp of the producing build — shown so a stale census is visible. */
  ts: string;
}

const CACHE_REL = path.join('.dev-pomogator', '.task-census.json');

export function taskCensusCachePath(repoRoot: string): string {
  return path.join(repoRoot, CACHE_REL);
}

/**
 * Atomically persist the census (temp + rename, per atomic-config-save). Called
 * by the producer that already built the graph. Best-effort — a soft-tier hook
 * must never crash on a cache write.
 */
export function writeTaskCensusCache(repoRoot: string, census: TaskCensus, ts: string): void {
  const file = taskCensusCachePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...census, ts } satisfies TaskCensusCache, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/** Read the cached census. Returns null on missing / torn / malformed (banner stays silent). */
export function readTaskCensusCache(repoRoot: string): TaskCensusCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(taskCensusCachePath(repoRoot), 'utf-8'));
    if (typeof parsed?.open !== 'number' || typeof parsed?.doneButRed !== 'number') return null;
    return parsed as TaskCensusCache;
  } catch {
    return null;
  }
}
