import {
  canonicalizeTask,
  normalizeTaskKey,
  normalizedTaskId,
  type CanonicalTask,
  type DependencyRelation,
  type DependencyStrength,
  type TaskDependency,
} from './task-contract.ts';

export interface DependencyEdge {
  fromId: string;
  toId: string;
  relation: DependencyRelation;
  strength: DependencyStrength;
  reason: string;
}

export interface DependencyGraph {
  representationVersion: 'task-dependencies/v1';
  tasks: CanonicalTask[];
  edges: DependencyEdge[];
  reverseBlockers: Record<string, string[]>;
  unresolved: string[];
}

export interface DependencyProjection {
  representationVersion: 'task-dependencies/v1';
  taskIds: string[];
  edges: DependencyEdge[];
  reverseBlockers: Record<string, string[]>;
  unresolved: string[];
}

export interface DependencyProposalResult {
  ok: boolean;
  committed: boolean;
  graph: DependencyGraph;
  cycle: string[];
  message: string;
}

export interface TaskBlocker {
  taskId: string;
  predecessorId: string;
  relation: DependencyRelation;
  reason: string;
  predecessorStatus: CanonicalTask['declaredStatus'] | 'MISSING';
  state: 'BLOCKED';
}

export interface ProseOrderingWarning {
  taskId: string;
  referencedText: string;
  code: 'PROSE_ORDERING_MIGRATION';
  message: string;
}

export interface TaskReadiness {
  taskId: string;
  state: 'READY' | 'BLOCKED' | 'MIGRATION_WARNING';
  blockers: TaskBlocker[];
  warnings: ProseOrderingWarning[];
}

const GRAPH_VERSION = 'task-dependencies/v1' as const;

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

export function stableDependencyJson(value: DependencyGraph | DependencyProjection | DependencyProposalResult): string {
  return JSON.stringify(stableValue(value));
}

function taskByNormalizedId(tasks: readonly CanonicalTask[]): Map<string, CanonicalTask> {
  return new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
}

function canonicalTaskId(tasks: readonly CanonicalTask[], id: string): string {
  return taskByNormalizedId(tasks).get(normalizedTaskId(id))?.qualifiedId ?? normalizeTaskKey(id);
}

/** Build the dependency DAG without mutating authored task records. */
export function buildDependencyGraph(tasks: readonly CanonicalTask[]): DependencyGraph {
  const orderedTasks = [...tasks].sort((left, right) => compareIds(left.qualifiedId, right.qualifiedId));
  const byId = taskByNormalizedId(orderedTasks);
  const edges: DependencyEdge[] = [];
  const unresolved = new Set<string>();

  for (const task of orderedTasks) {
    for (const dependency of task.dependencies) {
      const target = byId.get(normalizedTaskId(dependency.targetId));
      if (!target) {
        unresolved.add(normalizeTaskKey(dependency.targetId));
        continue;
      }
      edges.push({
        fromId: task.qualifiedId,
        toId: target.qualifiedId,
        relation: dependency.relation,
        strength: dependency.strength,
        reason: dependency.reason,
      });
    }
  }

  edges.sort((left, right) => compareIds(left.fromId, right.fromId)
    || compareIds(left.toId, right.toId)
    || left.relation.localeCompare(right.relation)
    || left.reason.localeCompare(right.reason));
  const reverseBlockers: Record<string, string[]> = {};
  for (const task of orderedTasks) reverseBlockers[task.qualifiedId] = [];
  for (const edge of edges) reverseBlockers[edge.toId].push(edge.fromId);
  for (const ids of Object.values(reverseBlockers)) ids.sort(compareIds);

  return {
    representationVersion: GRAPH_VERSION,
    tasks: orderedTasks,
    edges,
    reverseBlockers,
    unresolved: [...unresolved].sort(compareIds),
  };
}

function outgoing(graph: DependencyGraph, fromId: string): DependencyEdge[] {
  const key = normalizedTaskId(fromId);
  return graph.edges.filter((edge) => normalizedTaskId(edge.fromId) === key);
}

function findPath(graph: DependencyGraph, startId: string, targetId: string): string[] | null {
  const target = normalizedTaskId(targetId);
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const currentKey = normalizedTaskId(current.id);
    if (currentKey === target) return current.path;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    for (const edge of outgoing(graph, current.id)) {
      if (!visited.has(normalizedTaskId(edge.toId))) queue.push({ id: edge.toId, path: [...current.path, edge.toId] });
    }
  }
  return null;
}

/** Return deterministic cycles as task-id paths, including the repeated start. */
export function findDependencyCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const walk = (id: string): void => {
    const key = normalizedTaskId(id);
    const stackIndex = stack.findIndex((candidate) => normalizedTaskId(candidate) === key);
    if (stackIndex >= 0) {
      const cycle = [...stack.slice(stackIndex), id];
      if (!cycles.some((candidate) => stableDependencyJson(candidate as unknown as DependencyProjection) === stableDependencyJson(cycle as unknown as DependencyProjection))) cycles.push(cycle);
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    stack.push(id);
    for (const edge of outgoing(graph, id)) walk(edge.toId);
    stack.pop();
    visiting.delete(key);
    visited.add(key);
  };
  for (const task of graph.tasks) if (!visited.has(normalizedTaskId(task.qualifiedId))) walk(task.qualifiedId);
  return cycles.sort((left, right) => compareIds(left[0] ?? '', right[0] ?? ''));
}

/** Dry-run a typed edge. A rejected cycle returns the exact original graph object. */
export function proposeDependency(
  graph: DependencyGraph,
  fromId: string,
  dependency: Pick<TaskDependency, 'targetId' | 'relation' | 'strength' | 'reason'>,
): DependencyProposalResult {
  const from = canonicalTaskId(graph.tasks, fromId);
  const target = canonicalTaskId(graph.tasks, dependency.targetId);
  if (!graph.tasks.some((task) => normalizedTaskId(task.qualifiedId) === normalizedTaskId(from))) {
    return { ok: false, committed: false, graph, cycle: [], message: `unknown source task: ${fromId}` };
  }
  if (!graph.tasks.some((task) => normalizedTaskId(task.qualifiedId) === normalizedTaskId(target))) {
    return { ok: false, committed: false, graph, cycle: [], message: `unknown predecessor task: ${dependency.targetId}` };
  }
  if (normalizedTaskId(from) === normalizedTaskId(target)) {
    return { ok: false, committed: false, graph, cycle: [from, target], message: `cycle refused: ${from} -> ${target} -> ${from}` };
  }
  const candidate: DependencyGraph = {
    ...graph,
    edges: [...graph.edges, { fromId: from, toId: target, relation: dependency.relation, strength: dependency.strength, reason: dependency.reason }],
    reverseBlockers: Object.fromEntries(Object.entries(graph.reverseBlockers).map(([key, ids]) => [key, [...ids]])),
  };
  candidate.edges.sort((left, right) => compareIds(left.fromId, right.fromId) || compareIds(left.toId, right.toId) || left.relation.localeCompare(right.relation) || left.reason.localeCompare(right.reason));
  candidate.reverseBlockers[target] = [...(candidate.reverseBlockers[target] ?? []), from].sort(compareIds);
  const path = findPath(graph, target, from);
  if (path) {
    const cycle = [from, ...path];
    return { ok: false, committed: false, graph, cycle, message: `cycle refused: ${cycle.join(' -> ')}` };
  }
  return { ok: true, committed: true, graph: candidate, cycle: [], message: `dependency accepted: ${from} -> ${target}` };
}

function textForProse(task: CanonicalTask): string {
  return [task.title, ...task.comments, task.sourceSpan.sourceText ?? ''].join(' ');
}

function proseWarnings(tasks: readonly CanonicalTask[], task: CanonicalTask): ProseOrderingWarning[] {
  const knownIds = tasks.map((candidate) => candidate.qualifiedId);
  const warnings: ProseOrderingWarning[] = [];
  const expression = /\bafter\s+([A-Za-z0-9_.:-]+)/gi;
  for (const match of textForProse(task).matchAll(expression)) {
    const referencedText = match[1];
    if (!knownIds.some((candidate) => normalizedTaskId(candidate) === normalizedTaskId(referencedText) || normalizedTaskId(candidate).endsWith(`:${normalizedTaskId(referencedText)}`))) continue;
    warnings.push({ taskId: task.qualifiedId, referencedText, code: 'PROSE_ORDERING_MIGRATION', message: `${task.qualifiedId} expresses ordering in prose; migrate "after ${referencedText}" to a typed dependency` });
  }
  return warnings;
}

export function explainTaskBlockers(tasks: readonly CanonicalTask[], graph = buildDependencyGraph(tasks), taskId?: string): TaskBlocker[] {
  const byId = taskByNormalizedId(tasks);
  const selected = taskId ? graph.edges.filter((edge) => normalizedTaskId(edge.fromId) === normalizedTaskId(taskId)) : graph.edges;
  const blockers: TaskBlocker[] = selected
    .filter((edge) => byId.get(normalizedTaskId(edge.toId))?.declaredStatus !== 'DONE')
    .map((edge): TaskBlocker => ({
      taskId: edge.fromId,
      predecessorId: edge.toId,
      relation: edge.relation,
      reason: edge.reason,
      predecessorStatus: byId.get(normalizedTaskId(edge.toId))?.declaredStatus ?? 'MISSING',
      state: 'BLOCKED',
    }));
  return blockers.sort((left, right) => compareIds(left.taskId, right.taskId) || compareIds(left.predecessorId, right.predecessorId));
}

export function evaluateTaskReadiness(tasks: readonly CanonicalTask[], graph = buildDependencyGraph(tasks)): TaskReadiness[] {
  return [...tasks].sort((left, right) => compareIds(left.qualifiedId, right.qualifiedId)).map((task) => {
    const blockers = explainTaskBlockers(tasks, graph, task.qualifiedId);
    const warnings = proseWarnings(tasks, task);
    return {
      taskId: task.qualifiedId,
      state: task.declaredStatus === 'BLOCKED' || blockers.length > 0 ? 'BLOCKED' : warnings.length > 0 ? 'MIGRATION_WARNING' : 'READY',
      blockers,
      warnings,
    };
  });
}

export function projectDependencyGraph(graph: DependencyGraph): DependencyProjection {
  return {
    representationVersion: GRAPH_VERSION,
    taskIds: graph.tasks.map((task) => task.qualifiedId).sort(compareIds),
    edges: graph.edges.map((edge) => ({ ...edge })).sort((left, right) => compareIds(left.fromId, right.fromId) || compareIds(left.toId, right.toId) || left.relation.localeCompare(right.relation) || left.reason.localeCompare(right.reason)),
    reverseBlockers: Object.fromEntries(Object.entries(graph.reverseBlockers).sort(([left], [right]) => compareIds(left, right)).map(([key, ids]) => [key, [...ids].sort(compareIds)])),
    unresolved: [...graph.unresolved].sort(compareIds),
  };
}

export function serializeDependencyGraph(graph: DependencyGraph): string {
  return stableDependencyJson({ ...projectDependencyGraph(graph), tasks: graph.tasks });
}

/** Restore through the canonical task records, never through a second edge authority. */
export function restoreDependencyGraph(tasks: readonly CanonicalTask[] | string): DependencyGraph {
  if (typeof tasks === 'string') {
    const parsed = JSON.parse(tasks) as { tasks?: CanonicalTask[] };
    if (Array.isArray(parsed.tasks)) return buildDependencyGraph(parsed.tasks);
    throw new Error('persisted dependency projection does not contain canonical tasks');
  }
  return buildDependencyGraph(tasks);
}

export function createPlanningTask(id: string, overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  const result = canonicalizeTask({
    qualifiedId: id,
    title: `Planning task ${id}`,
    kind: 'implementation',
    definitionRevision: 1,
    declaredStatus: 'READY',
    estimateMinutes: 1,
    requirementLinks: [],
    acceptanceCriteriaLinks: [],
    doneWhen: [{ text: 'observable result is recorded', order: 1, required: true }],
    dependencies: [],
    surfaces: [{ kind: 'file', access: 'read', locator: `src/${id}.ts`, scope: 'repository', rationale: 'planning fixture input' }],
    artifacts: [{ path: `src/${id}.ts`, kind: 'source', required: true }],
    evidencePolicy: { scope: 'selected', commands: [], requiresFresh: true, allowFiltered: true },
    comments: [],
    sourceSpan: { file: 'TASKS.md', startLine: 1, endLine: 1 },
    ...overrides,
  });
  return result.task;
}