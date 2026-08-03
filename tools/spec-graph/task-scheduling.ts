import { normalizedTaskId, type CanonicalTask } from './task-contract.ts';
import { buildDependencyGraph, type DependencyEdge, type DependencyGraph, type TaskBlocker, explainTaskBlockers } from './task-dependencies.ts';
import { deriveConflicts, partitionConflictFreeTasks, type ConflictReport } from './task-conflicts.ts';

export interface ScheduleWave {
  wave: number;
  taskIds: string[];
  batches: string[][];
}

export interface CriticalPathMetrics {
  criticalPath: string[];
  criticalPathMinutes: number;
  earliestStart: Record<string, number>;
  earliestFinish: Record<string, number>;
  latestStart: Record<string, number>;
  latestFinish: Record<string, number>;
  slack: Record<string, number>;
  defaultEstimateTaskIds: string[];
}

export interface ScheduleBlockedImpact {
  taskId: string;
  blockers: TaskBlocker[];
  affectedDownstreamTaskIds: string[];
  affectedCriticalPath: boolean;
}

export interface SchedulePlan {
  representationVersion: 'task-scheduling/v1';
  taskIds: string[];
  waves: ScheduleWave[];
  criticalPath: CriticalPathMetrics;
  blockers: ScheduleBlockedImpact[];
  conflicts: ConflictReport;
  normalizedIdTieOrder: string[];
  estimateRounding: 'half-up';
  stableKeyJson: string;
}

export interface ScheduleOptions {
  defaultEstimateMinutes?: number;
  now?: string;
}

function compareIds(left: string, right: string): number {
  return normalizedTaskId(left).localeCompare(normalizedTaskId(right)) || left.localeCompare(right);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableValue(object[key])]));
  }
  return value;
}

export function stableScheduleJson(value: SchedulePlan | ScheduleWave[] | CriticalPathMetrics): string {
  return JSON.stringify(stableValue(value));
}

/** Deterministic half-up estimate normalization, independent of locale. */
export function roundEstimateHalfUp(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('estimate must be a finite non-negative number');
  return Math.floor(minutes * 100 + 0.5) / 100;
}

function edgePredecessors(graph: DependencyGraph, taskId: string): DependencyEdge[] {
  return graph.edges.filter((edge) => normalizedTaskId(edge.fromId) === normalizedTaskId(taskId));
}

function topologicalOrder(graph: DependencyGraph, taskIds: readonly string[]): string[] {
  const selected = new Set(taskIds.map(normalizedTaskId));
  const candidates = [...new Set(taskIds)].sort(compareIds);
  const indegree = new Map(candidates.map((id) => [normalizedTaskId(id), 0]));
  for (const edge of graph.edges) {
    if (selected.has(normalizedTaskId(edge.fromId)) && selected.has(normalizedTaskId(edge.toId))) indegree.set(normalizedTaskId(edge.fromId), (indegree.get(normalizedTaskId(edge.fromId)) ?? 0) + 1);
  }
  const order: string[] = [];
  const ready = candidates.filter((id) => indegree.get(normalizedTaskId(id)) === 0).sort(compareIds);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of graph.edges.filter((candidate) => normalizedTaskId(candidate.toId) === normalizedTaskId(id))) {
      if (!selected.has(normalizedTaskId(edge.fromId))) continue;
      const key = normalizedTaskId(edge.fromId);
      const next = (indegree.get(key) ?? 0) - 1;
      indegree.set(key, next);
      if (next === 0) ready.push(edge.fromId);
    }
    ready.sort(compareIds);
  }
  if (order.length !== candidates.length) throw new Error('cannot schedule cyclic selected graph');
  return order;
}

function downstream(graph: DependencyGraph, taskId: string, selected: Set<string>): string[] {
  const found = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of graph.edges.filter((candidate) => normalizedTaskId(candidate.toId) === normalizedTaskId(id))) {
      const key = normalizedTaskId(edge.fromId);
      if (selected.has(key) && !found.has(key)) {
        found.add(key);
        queue.push(edge.fromId);
      }
    }
  }
  return [...found].sort(compareIds);
}

export function calculateCriticalPath(tasks: readonly CanonicalTask[], graph: DependencyGraph = buildDependencyGraph(tasks), selectedIds: readonly string[] = tasks.map((task) => task.qualifiedId), options: ScheduleOptions = {}): CriticalPathMetrics {
  const selected = [...new Set(selectedIds)].sort(compareIds);
  const byId = new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const defaultEstimate = roundEstimateHalfUp(options.defaultEstimateMinutes ?? 15);
  const estimate = (id: string): number => {
    const task = byId.get(normalizedTaskId(id));
    if (!task || task.estimateMinutes <= 0) return defaultEstimate;
    return roundEstimateHalfUp(task.estimateMinutes);
  };
  const order = topologicalOrder(graph, selected);
  const earliestStart: Record<string, number> = {};
  const earliestFinish: Record<string, number> = {};
  for (const id of order) {
    const predecessors = edgePredecessors(graph, id).filter((edge) => selected.some((candidate) => normalizedTaskId(candidate) === normalizedTaskId(edge.toId)));
    earliestStart[id] = predecessors.length ? Math.max(...predecessors.map((edge) => earliestFinish[edge.toId] ?? 0)) : 0;
    earliestFinish[id] = roundEstimateHalfUp(earliestStart[id] + estimate(id));
  }
  const criticalPathMinutes = Math.max(0, ...Object.values(earliestFinish));
  const latestFinish: Record<string, number> = {};
  const latestStart: Record<string, number> = {};
  for (const id of [...order].reverse()) {
    const successors = graph.edges.filter((edge) => normalizedTaskId(edge.toId) === normalizedTaskId(id) && selected.some((candidate) => normalizedTaskId(candidate) === normalizedTaskId(edge.fromId)));
    latestFinish[id] = successors.length ? Math.min(...successors.map((edge) => latestStart[edge.fromId])) : criticalPathMinutes;
    latestStart[id] = roundEstimateHalfUp(latestFinish[id] - estimate(id));
  }
  const slack: Record<string, number> = {};
  for (const id of selected) slack[id] = roundEstimateHalfUp(latestStart[id] - earliestStart[id]);
  const terminal = selected.filter((id) => slack[id] === 0).sort(compareIds);
  const criticalPath: string[] = [];
  let current: string | undefined = order.find((id) => slack[id] === 0);
  while (current !== undefined) {
    const currentId = current;
    criticalPath.push(currentId);
    const next: string | undefined = graph.edges
      .filter((edge) => normalizedTaskId(edge.toId) === normalizedTaskId(currentId)
        && selected.some((candidate) => normalizedTaskId(candidate) === normalizedTaskId(edge.fromId)))
      .map((edge) => edge.fromId)
      .find((id) => slack[id] === 0 && earliestStart[id] === earliestFinish[currentId]);
    current = next;
  }
  if (!criticalPath.length && terminal.length) criticalPath.push(terminal[0]);
  return {
    criticalPath,
    criticalPathMinutes,
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    slack,
    defaultEstimateTaskIds: selected.filter((id) => !byId.get(normalizedTaskId(id)) || byId.get(normalizedTaskId(id))!.estimateMinutes <= 0).sort(compareIds),
  };
}

export function partitionWaves(tasks: readonly CanonicalTask[], graph: DependencyGraph = buildDependencyGraph(tasks), selectedIds: readonly string[] = tasks.map((task) => task.qualifiedId), conflicts: ConflictReport = deriveConflicts(tasks)): ScheduleWave[] {
  const selected = [...new Set(selectedIds)].sort(compareIds);
  const selectedSet = new Set(selected.map(normalizedTaskId));
  const waves = new Map<number, string[]>();
  const order = topologicalOrder(graph, selected);
  for (const id of order) {
    const predecessors = edgePredecessors(graph, id).filter((edge) => selectedSet.has(normalizedTaskId(edge.toId)));
    const wave = predecessors.length ? Math.max(...predecessors.map((edge) => [...waves.entries()].find(([, ids]) => ids.some((candidate) => normalizedTaskId(candidate) === normalizedTaskId(edge.toId)))?.[0] ?? 0)) + 1 : 0;
    waves.set(wave, [...(waves.get(wave) ?? []), id].sort(compareIds));
  }
  return [...waves.entries()].sort(([left], [right]) => left - right).map(([wave, taskIds]) => ({ wave, taskIds, batches: partitionConflictFreeTasks(taskIds, conflicts) }));
}

export function explainScheduleBlockers(tasks: readonly CanonicalTask[], graph: DependencyGraph, metrics: CriticalPathMetrics, selectedIds: readonly string[] = tasks.map((task) => task.qualifiedId)): ScheduleBlockedImpact[] {
  const selected = new Set(selectedIds.map(normalizedTaskId));
  return tasks.filter((task) => selected.has(normalizedTaskId(task.qualifiedId)) && task.declaredStatus !== 'DONE').map((task) => {
    const blockers = explainTaskBlockers(tasks, graph, task.qualifiedId);
    const affected = downstream(graph, task.qualifiedId, selected);
    return {
      taskId: task.qualifiedId,
      blockers,
      affectedDownstreamTaskIds: affected,
      affectedCriticalPath: metrics.criticalPath.some((id) => normalizedTaskId(id) === normalizedTaskId(task.qualifiedId)) || affected.some((id) => metrics.criticalPath.some((critical) => normalizedTaskId(critical) === normalizedTaskId(id))),
    };
  }).filter((item) => item.blockers.length > 0).sort((left, right) => compareIds(left.taskId, right.taskId));
}

export function planSchedule(tasks: readonly CanonicalTask[], selectedIds?: readonly string[], options: ScheduleOptions = {}): SchedulePlan {
  const graph = buildDependencyGraph(tasks);
  const selected = [...new Set(selectedIds ?? tasks.map((task) => task.qualifiedId))].sort(compareIds);
  const conflicts = deriveConflicts(tasks);
  const waves = partitionWaves(tasks, graph, selected, conflicts);
  const criticalPath = calculateCriticalPath(tasks, graph, selected, options);
  const blockers = explainScheduleBlockers(tasks, graph, criticalPath, selected);
  const plan: Omit<SchedulePlan, 'stableKeyJson'> = {
    representationVersion: 'task-scheduling/v1',
    taskIds: selected,
    waves,
    criticalPath,
    blockers,
    conflicts,
    normalizedIdTieOrder: selected,
    estimateRounding: 'half-up',
  };
  return { ...plan, stableKeyJson: stableScheduleJson(plan as SchedulePlan) };
}

export interface PerformanceHarnessResult {
  taskCount: number;
  edgeCount: number;
  claimCount: number;
  elapsedMs: number;
  stable: boolean;
  withinBudget: boolean;
}

export function runSchedulingPerformanceHarness(tasks: readonly CanonicalTask[], options: { edgeCount?: number; claimCount?: number; budgetMs?: number } = {}): PerformanceHarnessResult {
  const start = Date.now();
  const plan = planSchedule(tasks);
  const elapsedMs = Date.now() - start;
  return {
    taskCount: tasks.length,
    edgeCount: options.edgeCount ?? plan.taskIds.length,
    claimCount: options.claimCount ?? tasks.reduce((sum, task) => sum + task.surfaces.length, 0),
    elapsedMs,
    stable: plan.stableKeyJson === planSchedule(tasks).stableKeyJson,
    withinBudget: elapsedMs <= (options.budgetMs ?? 1000),
  };
}

export const scheduleTasks = planSchedule;
export const calculateScheduleMetrics = calculateCriticalPath;