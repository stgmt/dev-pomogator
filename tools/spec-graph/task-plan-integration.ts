/**
 * Canonical task-plan integration authority (FR-79 / SPECGEN004_651..656).
 *
 * This module is an adapter over task-contract's CanonicalTask records. It does
 * not define a second task model: dependencies, surfaces, evidence policy,
 * source spans, and unknown fields remain owned by task-contract. Planning
 * records are derived views and are intentionally serializable so the same
 * query can be restored by a caller's persistence adapter (including SQLite)
 * without importing a non-builtin dependency into the installed bundle.
 */

import type {
  CanonicalTask,
  LegacyTaskRecord,
  TaskDependency,
  TaskSourceSpan,
  TaskSurface,
} from './task-contract.ts';
import {
  canonicalizeTask,
  normalizedTaskId,
  stableTaskJson,
} from './task-contract.ts';

export const TASK_PLAN_VERSION = 'task-plan/v1' as const;

export type RolloutMode = 'observe' | 'warn' | 'enforce';
export type PlanSeverity = 'error' | 'warning' | 'info';

export interface PlanDiagnostic {
  code:
    | 'PLAN_UNKNOWN_TASK'
    | 'PLAN_UNRESOLVED_DEPENDENCY'
    | 'PLAN_DEPENDENCY_CYCLE'
    | 'PLAN_DUPLICATE_TASK_ID'
    | 'PLAN_INVALID_TASK'
    | 'PLAN_UNRESOLVED_EVIDENCE'
    | 'PLAN_STALE_REVISION'
    | 'PLAN_PERSISTENCE_FAILED'
    | 'PLAN_LEGACY_RECORD'
    | 'PLAN_LEGACY_UNRESOLVED'
    | 'PLAN_SELECTED_UNSCHEDULED'
    | 'PLAN_STALE_EVIDENCE';
  severity: PlanSeverity;
  message: string;
  taskIds: string[];
  sourceIds: string[];
  action: string;
  location?: TaskSourceSpan;
}

export interface TaskEvidenceRecord {
  taskId: string;
  sourceId: string;
  state: 'present' | 'stale' | 'missing';
  reason: string;
  fingerprint?: string;
}

export type ConflictClass = 'write-write' | 'read-write' | 'exclusive-overlap' | 'semantic-resource';

export interface TaskConflictRecord {
  leftTaskId: string;
  rightTaskId: string;
  class: ConflictClass;
  reason: string;
  sourceIds: string[];
}

export interface TaskPlanState {
  version: typeof TASK_PLAN_VERSION;
  revision: number;
  tasks: CanonicalTask[];
  evidence: TaskEvidenceRecord[];
  conflicts: TaskConflictRecord[];
  legacy: LegacyTaskRecord[];
  diagnostics: PlanDiagnostic[];
  sourceFingerprint?: string;
}

export interface PlanStateOptions {
  revision?: number;
  evidence?: readonly TaskEvidenceRecord[];
  conflicts?: readonly TaskConflictRecord[];
  legacy?: readonly LegacyTaskRecord[];
  sourceFingerprint?: string;
}

export interface PlanSelectionOptions {
  selectedTaskIds?: readonly string[];
  rolloutMode?: RolloutMode;
}

export interface PlanGraphNode {
  id: string;
  type: 'Task';
  status: CanonicalTask['declaredStatus'];
  sourceId: string;
  task: CanonicalTask;
}

export interface PlanGraphEdge {
  from: string;
  to: string;
  type: 'depends-on' | 'conflicts-with' | 'evidence';
  reason: string;
  sourceIds: string[];
}

export interface PlanExplanation {
  code: string;
  sourceTaskIds: string[];
  sourceIds: string[];
  message: string;
  action: string;
}

export interface PlanImpact {
  direct: string[];
  transitive: string[];
  explanations: PlanExplanation[];
}

export interface PlanFrontierEntry {
  taskId: string;
  readiness: 'ready' | 'blocked' | 'stale' | 'not-selected';
  predecessors: string[];
  explanation: string;
}

export interface PlanUnscheduledEntry {
  taskId: string;
  reason: string;
  predecessorIds: string[];
  sourceIds: string[];
}

export interface PlanRisk {
  code: 'MIGRATION_DEBT' | 'CONFLICT' | 'BROAD_IMPACT' | 'CRITICAL_WORK' | 'STALE_EVIDENCE' | 'UNSCHEDULED';
  taskIds: string[];
  sourceIds: string[];
  severity: PlanSeverity;
  explanation: string;
  action: string;
}

export interface PlanRolloutRecord {
  sourceId: string;
  candidateId?: string;
  status: 'visible' | 'rejected';
  finding?: PlanDiagnostic;
}

export interface PlanRolloutReport {
  mode: RolloutMode;
  sourceCount: number;
  visibleCount: number;
  rejectedCount: number;
  records: PlanRolloutRecord[];
}

export interface TaskPlanResult {
  version: typeof TASK_PLAN_VERSION;
  revision: number;
  selectedTaskIds: string[];
  graph: { nodes: PlanGraphNode[]; edges: PlanGraphEdge[] };
  impact: PlanImpact;
  conflicts: TaskConflictRecord[];
  waves: string[][];
  batches: string[][][];
  frontier: PlanFrontierEntry[];
  unscheduledRemainder: PlanUnscheduledEntry[];
  /** Alias kept explicit for consumers that use the shorter planning vocabulary. */
  unscheduled: PlanUnscheduledEntry[];
  complete: boolean;
  criticalPath: { taskIds: string[]; totalMinutes: number };
  slack: Record<string, number>;
  stale: TaskEvidenceRecord[];
  /** Alias retained so report clients do not need to infer stale reasons. */
  staleReasons: Array<{ taskId: string; sourceId: string; reason: string }>;
  diagnostics: PlanDiagnostic[];
  explanations: PlanExplanation[];
  reports: { risks: PlanRisk[]; rollout: PlanRolloutReport };
}

export interface TaskPlanPatch {
  add?: readonly CanonicalTask[];
  replace?: readonly CanonicalTask[];
  removeIds?: readonly string[];
  evidence?: readonly TaskEvidenceRecord[];
}

export interface PlanPersistenceAdapter {
  write(serialized: string, state: TaskPlanState): void;
  read(): string | undefined;
  compareAndSwap?(
    expectedRevision: number,
    serialized: string,
    state: TaskPlanState,
  ): boolean;
}

export interface TaskPlanMutationOptions {
  expectedRevision: number;
  dryRun?: boolean;
  persist?: (
    state: TaskPlanState,
    serialized: string,
    expectedRevision: number,
  ) => boolean;
}

export interface TaskPlanMutationResult {
  ok: boolean;
  committed: boolean;
  dryRun: boolean;
  revision: number;
  state: TaskPlanState;
  plan: TaskPlanResult;
  findings: PlanDiagnostic[];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en-US');
}

function sortIds(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort(compareText).map((key) => [key, stableValue(object[key])]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function diagnosticKey(value: PlanDiagnostic): string {
  return stableJson(value);
}

function mergeDiagnostics(...groups: readonly PlanDiagnostic[][]): PlanDiagnostic[] {
  const merged = new Map<string, PlanDiagnostic>();
  for (const item of groups.flat()) merged.set(diagnosticKey(item), item);
  return [...merged.values()].sort((left, right) =>
    compareText(left.code, right.code)
    || compareText(left.message, right.message)
    || compareText(left.taskIds.join('\0'), right.taskIds.join('\0')),
  );
}

function sourceIdForLegacy(record: LegacyTaskRecord): string {
  return record.candidateId
    ?? `legacy:${record.sourceSpan.file}:${record.sourceSpan.startLine}`;
}

function redactText(value: string): string {
  return value
    .replace(/(process\.env\.)[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s,;&]+/gi, '$1<redacted>=<redacted>')
    .replace(/\b(token|secret|password|passwd|api[_-]?key|authorization)\s*[:=]\s*[^\s,;&]+/gi, '$1=<redacted>')
    .replace(/([?&](?:token|secret|password|key|api[_-]?key|authorization)=)[^&\s]+/gi, '$1<redacted>')
    .replace(/(^|[\s,;])(?:[A-Z_][A-Z0-9_]*)=(?:[^\s,;]+)/g, '$1<environment>=<redacted>');
}

/** Redaction is applied at the projection boundary, never to canonical source records. */
export function redactPlanText(value: string): string {
  return redactText(value);
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}

function redactTask(task: CanonicalTask): CanonicalTask {
  return {
    ...clone(task),
    title: redactText(task.title),
    doneWhen: task.doneWhen.map((item) => ({ ...item, text: redactText(item.text) })),
    dependencies: task.dependencies.map((dependency) => ({ ...dependency, reason: redactText(dependency.reason) })),
    surfaces: task.surfaces.map((surface) => ({
      ...surface,
      locator: redactText(surface.locator),
      rationale: redactText(surface.rationale),
    })),
    unknownFields: redactUnknown(task.unknownFields) as Record<string, unknown>,
    comments: task.comments.map(redactText),
  };
}

function finding(
  code: PlanDiagnostic['code'],
  message: string,
  taskIds: readonly string[] = [],
  sourceIds: readonly string[] = [],
  action = 'Inspect the canonical task record and retry.',
  location?: TaskSourceSpan,
  severity: PlanSeverity = 'error',
): PlanDiagnostic {
  return {
    code,
    severity,
    message: redactText(message),
    taskIds: sortIds(taskIds),
    sourceIds: sortIds(sourceIds),
    action: redactText(action),
    ...(location ? { location } : {}),
  };
}

function normalizeEvidence(records: readonly TaskEvidenceRecord[]): TaskEvidenceRecord[] {
  return [...records]
    .map((record) => ({
      taskId: record.taskId,
      sourceId: record.sourceId,
      state: record.state,
      reason: record.reason,
      ...(record.fingerprint ? { fingerprint: record.fingerprint } : {}),
    }))
    .sort((left, right) => compareText(left.taskId, right.taskId) || compareText(left.sourceId, right.sourceId));
}

function normalizeConflict(record: TaskConflictRecord): TaskConflictRecord {
  const [leftTaskId, rightTaskId] = compareText(record.leftTaskId, record.rightTaskId) <= 0
    ? [record.leftTaskId, record.rightTaskId]
    : [record.rightTaskId, record.leftTaskId];
  return {
    leftTaskId,
    rightTaskId,
    class: record.class,
    reason: record.reason,
    sourceIds: sortIds(record.sourceIds),
  };
}

function conflictKey(record: TaskConflictRecord): string {
  return `${normalizedTaskId(record.leftTaskId)}|${normalizedTaskId(record.rightTaskId)}|${record.class}`;
}

function surfaceConflict(left: TaskSurface, right: TaskSurface): ConflictClass | null {
  if (normalizedTaskId(left.locator) !== normalizedTaskId(right.locator)) return null;
  if (left.kind === 'api-contract' || left.kind === 'schema' || right.kind === 'api-contract' || right.kind === 'schema') return 'semantic-resource';
  if (left.access === 'exclusive' || right.access === 'exclusive') return 'exclusive-overlap';
  if (left.access === 'write' && right.access === 'write') return 'write-write';
  if (left.access === 'write' || right.access === 'write') return 'read-write';
  return null;
}

/** Derive conflicts once from canonical surfaces; callers may add audited records explicitly. */
export function deriveTaskConflicts(tasks: readonly CanonicalTask[]): TaskConflictRecord[] {
  const records: TaskConflictRecord[] = [];
  const ordered = [...tasks].sort((left, right) => compareText(left.qualifiedId, right.qualifiedId));
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      for (const leftSurface of left.surfaces) {
        for (const rightSurface of right.surfaces) {
          const conflictClass = surfaceConflict(leftSurface, rightSurface);
          if (!conflictClass) continue;
          records.push(normalizeConflict({
            leftTaskId: left.qualifiedId,
            rightTaskId: right.qualifiedId,
            class: conflictClass,
            reason: `surface overlap on ${leftSurface.kind} locator`,
            sourceIds: [left.qualifiedId, right.qualifiedId],
          }));
        }
      }
    }
  }
  const unique = new Map<string, TaskConflictRecord>();
  for (const record of records) unique.set(conflictKey(record), record);
  return [...unique.values()].sort((left, right) => compareText(conflictKey(left), conflictKey(right)));
}

function validateDependencies(tasks: readonly CanonicalTask[]): PlanDiagnostic[] {
  const ids = new Map<string, CanonicalTask>();
  const diagnostics: PlanDiagnostic[] = [];
  for (const task of tasks) {
    const key = normalizedTaskId(task.qualifiedId);
    const prior = ids.get(key);
    if (prior) diagnostics.push(finding(
      'PLAN_DUPLICATE_TASK_ID',
      `duplicate canonical task ID after normalization: ${task.qualifiedId}`,
      [task.qualifiedId, prior.qualifiedId],
      [task.qualifiedId, prior.qualifiedId],
      'Keep one canonical record for the normalized task ID.',
      task.sourceSpan,
    ));
    else ids.set(key, task);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(normalizedTaskId(dependency.targetId))) diagnostics.push(finding(
        'PLAN_UNRESOLVED_DEPENDENCY',
        `task ${task.qualifiedId} depends on unresolved task ${dependency.targetId}: ${dependency.reason}`,
        [task.qualifiedId, dependency.targetId],
        [task.qualifiedId, dependency.targetId],
        `Add ${dependency.targetId} as a canonical task or remove the dependency.`,
        task.sourceSpan,
      ));
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const task of tasks) adjacency.set(normalizedTaskId(task.qualifiedId), task.dependencies.map((dependency) => normalizedTaskId(dependency.targetId)));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const cycleKeys = new Set<string>();
  function visit(key: string): void {
    if (visiting.has(key)) {
      const start = path.indexOf(key);
      const cycle = path.slice(start).concat(key);
      const cycleKey = cycle.join('|');
      if (!cycleKeys.has(cycleKey)) {
        cycleKeys.add(cycleKey);
        diagnostics.push(finding(
          'PLAN_DEPENDENCY_CYCLE',
          `dependency cycle: ${cycle.join(' -> ')}`,
          cycle,
          cycle,
          'Break the typed dependency cycle before scheduling.',
        ));
      }
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    path.push(key);
    for (const target of adjacency.get(key) ?? []) if (adjacency.has(target)) visit(target);
    path.pop();
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of adjacency.keys()) visit(key);
  return diagnostics;
}

function normalizeTasks(tasks: readonly CanonicalTask[]): { tasks: CanonicalTask[]; diagnostics: PlanDiagnostic[] } {
  const normalized: CanonicalTask[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  for (const task of tasks) {
    const result = canonicalizeTask(task as Partial<CanonicalTask> & Record<string, unknown>, { file: task.sourceSpan.file });
    const errors = result.findings.filter((item) => item.severity === 'error');
    if (errors.length > 0) diagnostics.push(...errors.map((item) => finding(
      'PLAN_INVALID_TASK',
      item.message,
      item.taskId ? [item.taskId] : [task.qualifiedId],
      [task.qualifiedId],
      `Correct the canonical task field ${item.field ?? 'record'} before planning.`,
      item.location,
    )));
    normalized.push(result.task);
  }
  return { tasks: normalized.sort((left, right) => compareText(left.qualifiedId, right.qualifiedId)), diagnostics };
}

export function buildTaskPlanState(tasks: readonly CanonicalTask[], options: PlanStateOptions = {}): TaskPlanState {
  const normalized = normalizeTasks(tasks);
  const evidence = normalizeEvidence(options.evidence ?? []);
  const diagnostics = mergeDiagnostics(
    normalized.diagnostics,
    validateDependencies(normalized.tasks),
    validateEvidence(normalized.tasks, evidence),
  );
  const supplied = (options.conflicts ?? []).map(normalizeConflict);
  const conflicts = new Map<string, TaskConflictRecord>();
  for (const record of [...deriveTaskConflicts(normalized.tasks), ...supplied]) conflicts.set(conflictKey(record), record);
  const state: TaskPlanState = {
    version: TASK_PLAN_VERSION,
    revision: options.revision ?? 1,
    tasks: normalized.tasks,
    evidence,
    conflicts: [...conflicts.values()].sort((left, right) => compareText(conflictKey(left), conflictKey(right))),
    legacy: clone([...(options.legacy ?? [])]),
    diagnostics,
    ...(options.sourceFingerprint ? { sourceFingerprint: options.sourceFingerprint } : {}),
  };
  return state;
}

/** Rebuild from the same canonical task source after one or more file slices changed. */
export function incrementalTaskPlanState(previous: TaskPlanState, changedTasks: readonly CanonicalTask[], options: PlanStateOptions = {}): TaskPlanState {
  const changedById = new Map(changedTasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const merged = previous.tasks.map((task) => changedById.get(normalizedTaskId(task.qualifiedId)) ?? task);
  for (const task of changedTasks) if (!previous.tasks.some((item) => normalizedTaskId(item.qualifiedId) === normalizedTaskId(task.qualifiedId))) merged.push(task);
  return buildTaskPlanState(merged, {
    revision: options.revision ?? previous.revision,
    evidence: options.evidence ?? previous.evidence,
    conflicts: options.conflicts ?? previous.conflicts,
    legacy: options.legacy ?? previous.legacy,
    sourceFingerprint: options.sourceFingerprint ?? previous.sourceFingerprint,
  });
}

export function serializeTaskPlanState(state: TaskPlanState): string {
  return stableJson(state);
}

export const canonicalTaskPlanJson = serializeTaskPlanState;

export function restoreTaskPlanState(serialized: string): TaskPlanState {
  const parsed = JSON.parse(serialized) as TaskPlanState;
  if (parsed.version !== TASK_PLAN_VERSION || !Number.isSafeInteger(parsed.revision) || !Array.isArray(parsed.tasks)) {
    throw new Error('invalid task plan state version or shape');
  }
  return buildTaskPlanState(parsed.tasks, {
    revision: parsed.revision,
    evidence: parsed.evidence ?? [],
    conflicts: parsed.conflicts ?? [],
    legacy: parsed.legacy ?? [],
    sourceFingerprint: parsed.sourceFingerprint,
  });
}

export function persistTaskPlanState(adapter: PlanPersistenceAdapter, state: TaskPlanState): string {
  const serialized = serializeTaskPlanState(state);
  adapter.write(serialized, state);
  return serialized;
}

export function compareAndSwapTaskPlanState(
  adapter: PlanPersistenceAdapter,
  expectedRevision: number,
  state: TaskPlanState,
): boolean {
  if (!adapter.compareAndSwap) throw new Error('plan persistence adapter does not support atomic compare-and-swap');
  return adapter.compareAndSwap(expectedRevision, serializeTaskPlanState(state), state);
}

export function restorePersistedTaskPlanState(adapter: PlanPersistenceAdapter): TaskPlanState | null {
  const serialized = adapter.read();
  return serialized ? restoreTaskPlanState(serialized) : null;
}

function taskById(state: TaskPlanState): Map<string, CanonicalTask> {
  return new Map(state.tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
}

function dependencyMap(tasks: readonly CanonicalTask[]): Map<string, string[]> {
  return new Map(tasks.map((task) => [task.qualifiedId, task.dependencies.map((dependency) => dependency.targetId)]));
}

function conflictForSelected(state: TaskPlanState, selected: Set<string>): TaskConflictRecord[] {
  return state.conflicts.filter((record) => selected.has(normalizedTaskId(record.leftTaskId)) && selected.has(normalizedTaskId(record.rightTaskId))).map((record) => ({
    ...record,
    reason: redactText(record.reason),
    sourceIds: sortIds(record.sourceIds),
  }));
}

function rolloutReport(records: readonly LegacyTaskRecord[], mode: RolloutMode): PlanRolloutReport {
  const reportRecords: PlanRolloutRecord[] = records.map((record) => {
    const sourceId = sourceIdForLegacy(record);
    if (mode === 'enforce') {
      return {
        sourceId,
        ...(record.candidateId ? { candidateId: record.candidateId } : {}),
        status: 'rejected',
        finding: finding(
          'PLAN_LEGACY_UNRESOLVED',
          `legacy task ${sourceId} is unresolved and cannot enter enforce mode`,
          record.candidateId ? [record.candidateId] : [],
          [sourceId],
          'Canonicalize this source record, then retry enforce mode.',
          record.sourceSpan,
          'error',
        ),
      };
    }
    return {
      sourceId,
      ...(record.candidateId ? { candidateId: record.candidateId } : {}),
      status: 'visible',
      ...(mode === 'warn' ? {
        finding: finding(
          'PLAN_LEGACY_RECORD',
          `legacy task ${sourceId} remains visible and needs canonicalization`,
          record.candidateId ? [record.candidateId] : [],
          [sourceId],
          'Canonicalize the record before enabling enforce mode.',
          record.sourceSpan,
          'warning',
        ),
      } : {}),
    };
  });
  return {
    mode,
    sourceCount: records.length,
    visibleCount: reportRecords.length,
    rejectedCount: reportRecords.filter((record) => record.status === 'rejected').length,
    records: reportRecords,
  };
}

function addDependencyEdges(state: TaskPlanState, selected: Set<string>): PlanGraphEdge[] {
  const edges: PlanGraphEdge[] = [];
  for (const task of state.tasks) {
    if (!selected.has(normalizedTaskId(task.qualifiedId))) continue;
    for (const dependency of task.dependencies) {
      if (!selected.has(normalizedTaskId(dependency.targetId))) continue;
      edges.push({
        from: task.qualifiedId,
        to: dependency.targetId,
        type: 'depends-on',
        reason: redactText(dependency.reason),
        sourceIds: sortIds([task.qualifiedId, dependency.targetId]),
      });
    }
  }
  return edges;
}

function addConflictEdges(conflicts: readonly TaskConflictRecord[]): PlanGraphEdge[] {
  return conflicts.map((conflict) => ({
    from: conflict.leftTaskId,
    to: conflict.rightTaskId,
    type: 'conflicts-with' as const,
    reason: redactText(conflict.reason),
    sourceIds: sortIds(conflict.sourceIds),
  }));
}

function directDependents(tasks: readonly CanonicalTask[], selected: Set<string>, roots: Set<string>): string[] {
  return sortIds(tasks
    .filter((task) => selected.has(normalizedTaskId(task.qualifiedId)) && !roots.has(normalizedTaskId(task.qualifiedId)))
    .filter((task) => task.dependencies.some((dependency) => roots.has(normalizedTaskId(dependency.targetId))))
    .map((task) => task.qualifiedId));
}

function transitiveDependents(tasks: readonly CanonicalTask[], selected: Set<string>, roots: Set<string>): string[] {
  const seen = new Set<string>();
  let frontier = [...roots];
  while (frontier.length > 0) {
    const next = directDependents(tasks, selected, new Set(frontier));
    frontier = next.filter((id) => !seen.has(normalizedTaskId(id)));
    for (const id of frontier) seen.add(normalizedTaskId(id));
  }
  return sortIds([...seen].map((key) => tasks.find((task) => normalizedTaskId(task.qualifiedId) === key)?.qualifiedId ?? key));
}

function schedule(tasks: readonly CanonicalTask[], selected: Set<string>, conflicts: readonly TaskConflictRecord[], evidence: readonly TaskEvidenceRecord[]): {
  waves: string[][];
  batches: string[][][];
  frontier: PlanFrontierEntry[];
  unscheduled: PlanUnscheduledEntry[];
} {
  const byId = new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const remaining = new Set([...selected]);
  const completed = new Set<string>();
  const waves: string[][] = [];
  const unscheduled: PlanUnscheduledEntry[] = [];
  const maxIterations = selected.size + 1;
  for (let iteration = 0; remaining.size > 0 && iteration < maxIterations; iteration += 1) {
    const available = [...remaining]
      .map((key) => byId.get(key))
      .filter((task): task is CanonicalTask => Boolean(task))
      .filter((task) => task.dependencies.every((dependency) => !selected.has(normalizedTaskId(dependency.targetId)) || completed.has(normalizedTaskId(dependency.targetId))))
      .sort((left, right) => compareText(left.qualifiedId, right.qualifiedId));
    if (available.length === 0) break;
    const wave = available.map((task) => task.qualifiedId);
    waves.push(wave);
    for (const task of available) {
      remaining.delete(normalizedTaskId(task.qualifiedId));
      completed.add(normalizedTaskId(task.qualifiedId));
    }
  }
  if (remaining.size > 0) {
    for (const key of [...remaining].sort(compareText)) {
      const task = byId.get(key);
      if (!task) continue;
      const predecessors = task.dependencies.map((dependency) => dependency.targetId).filter((id) => selected.has(normalizedTaskId(id)));
      unscheduled.push({
        taskId: task.qualifiedId,
        reason: 'task remains unscheduled because its typed predecessors are unresolved, cyclic, or outside the selected graph',
        predecessorIds: sortIds(predecessors),
        sourceIds: sortIds([task.qualifiedId, ...predecessors]),
      });
    }
  }

  const conflictPairs = new Set(conflicts.flatMap((conflict) => [
    `${normalizedTaskId(conflict.leftTaskId)}|${normalizedTaskId(conflict.rightTaskId)}`,
    `${normalizedTaskId(conflict.rightTaskId)}|${normalizedTaskId(conflict.leftTaskId)}`,
  ]));
  const batches: string[][][] = waves.map((wave) => {
    const result: string[][] = [];
    for (const taskId of wave) {
      let placed = false;
      for (const batch of result) {
        if (!batch.some((other) => conflictPairs.has(`${normalizedTaskId(taskId)}|${normalizedTaskId(other)}`))) {
          batch.push(taskId);
          placed = true;
          break;
        }
      }
      if (!placed) result.push([taskId]);
    }
    return result;
  });
  const frontier: PlanFrontierEntry[] = [...selected]
    .map((key) => byId.get(key))
    .filter((task): task is CanonicalTask => Boolean(task))
    .sort((left, right) => compareText(left.qualifiedId, right.qualifiedId))
    .map((task) => {
      const predecessors = task.dependencies.map((dependency) => dependency.targetId).filter((id) => selected.has(normalizedTaskId(id)) && byId.has(normalizedTaskId(id)) && byId.get(normalizedTaskId(id))?.declaredStatus !== 'DONE');
      const stale = evidence.some((record) => normalizedTaskId(record.taskId) === normalizedTaskId(task.qualifiedId) && record.state !== 'present');
      const blocked = task.declaredStatus === 'BLOCKED' || predecessors.length > 0;
      return {
        taskId: task.qualifiedId,
        readiness: stale ? 'stale' : blocked ? 'blocked' : 'ready',
        predecessors: sortIds(predecessors),
        explanation: stale
          ? 'task evidence is stale or missing and must be refreshed before execution verification'
          : blocked
            ? `blocked by typed predecessors: ${predecessors.join(', ') || task.declaredStatus}`
            : 'no incomplete typed predecessor in the selected graph',
      };
    });
  return { waves, batches, frontier, unscheduled };
}

function criticalMetrics(tasks: readonly CanonicalTask[], selected: Set<string>): { criticalPath: { taskIds: string[]; totalMinutes: number }; slack: Record<string, number> } {
  const byId = new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const memo = new Map<string, { path: string[]; duration: number }>();
  const visiting = new Set<string>();
  function longest(key: string): { path: string[]; duration: number } {
    const cached = memo.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return { path: [], duration: 0 };
    visiting.add(key);
    const task = byId.get(key);
    if (!task) return { path: [], duration: 0 };
    let best = { path: [] as string[], duration: 0 };
    for (const dependency of task.dependencies) {
      const dependencyKey = normalizedTaskId(dependency.targetId);
      if (!selected.has(dependencyKey)) continue;
      const candidate = longest(dependencyKey);
      if (candidate.duration > best.duration || (candidate.duration === best.duration && candidate.path.join('|') < best.path.join('|'))) best = candidate;
    }
    const result = { path: [...best.path, task.qualifiedId], duration: Math.round((best.duration + task.estimateMinutes) * 100) / 100 };
    visiting.delete(key);
    memo.set(key, result);
    return result;
  }
  let critical = { path: [] as string[], duration: 0 };
  for (const key of selected) {
    const candidate = longest(key);
    if (candidate.duration > critical.duration || (candidate.duration === critical.duration && candidate.path.join('|') < critical.path.join('|'))) critical = candidate;
  }
  const slack: Record<string, number> = {};
  for (const task of tasks) if (selected.has(normalizedTaskId(task.qualifiedId))) {
    const duration = longest(normalizedTaskId(task.qualifiedId)).duration;
    slack[task.qualifiedId] = Math.max(0, Math.round((critical.duration - duration) * 100) / 100);
  }
  return { criticalPath: { taskIds: critical.path, totalMinutes: critical.duration }, slack: Object.fromEntries(Object.entries(slack).sort(([left], [right]) => compareText(left, right))) };
}

export function queryTaskPlan(state: TaskPlanState, options: PlanSelectionOptions = {}): TaskPlanResult {
  const byId = taskById(state);
  const requested = options.selectedTaskIds ? options.selectedTaskIds.map(normalizedTaskId) : state.tasks.map((task) => normalizedTaskId(task.qualifiedId));
  const selected = new Set<string>();
  const queryDiagnostics: PlanDiagnostic[] = [];
  for (const key of requested) {
    const task = byId.get(key);
    if (task) selected.add(key);
    else queryDiagnostics.push(finding('PLAN_UNKNOWN_TASK', `selected task ${key} does not exist`, [key], [key], 'Select an existing canonical task ID.'));
  }
  const selectedTasks = state.tasks.filter((task) => selected.has(normalizedTaskId(task.qualifiedId)));
  const conflicts = conflictForSelected(state, selected);
  const graphEdges = [...addDependencyEdges(state, selected), ...addConflictEdges(conflicts)];
  for (const task of selectedTasks) {
    for (const evidence of state.evidence.filter((record) => normalizedTaskId(record.taskId) === normalizedTaskId(task.qualifiedId))) {
      graphEdges.push({ from: task.qualifiedId, to: evidence.sourceId, type: 'evidence', reason: redactText(evidence.reason), sourceIds: [evidence.sourceId, task.qualifiedId] });
    }
  }
  graphEdges.sort((left, right) => compareText(`${left.type}|${left.from}|${left.to}`, `${right.type}|${right.from}|${right.to}`));
  const graph = {
    nodes: selectedTasks.map((task) => ({ id: task.qualifiedId, type: 'Task' as const, status: task.declaredStatus, sourceId: task.qualifiedId, task: redactTask(task) })),
    edges: graphEdges,
  };
  const impactRoots = new Set(selectedTasks.map((task) => normalizedTaskId(task.qualifiedId)));
  const direct = directDependents(state.tasks, new Set(state.tasks.map((task) => normalizedTaskId(task.qualifiedId))), impactRoots);
  const transitive = transitiveDependents(state.tasks, new Set(state.tasks.map((task) => normalizedTaskId(task.qualifiedId))), impactRoots).filter((id) => !direct.includes(id));
  const impactExplanations = direct.concat(transitive).map((taskId) => ({
    code: 'TRANSITIVE_IMPACT',
    sourceTaskIds: [taskId, ...selectedTasks.map((task) => task.qualifiedId)],
    sourceIds: [taskId],
    message: `${taskId} consumes or depends on selected planning work`,
    action: 'Review the downstream task before changing the selected task.',
  }));
  const selectedEvidence = state.evidence.filter((record) => selected.has(normalizedTaskId(record.taskId)));
  const scheduleResult = schedule(selectedTasks, selected, conflicts, selectedEvidence);
  queryDiagnostics.push(...validateDependencies(selectedTasks).filter((item) => item.severity === 'error'));
  queryDiagnostics.push(...validateEvidence(selectedTasks, selectedEvidence));
  queryDiagnostics.push(...scheduleResult.unscheduled.map((entry) => finding('PLAN_SELECTED_UNSCHEDULED', entry.reason, [entry.taskId, ...entry.predecessorIds], entry.sourceIds, 'Resolve the typed predecessor or include it in the selected graph.')));
  const stale = selectedEvidence.filter((record) => record.state !== 'present').map((record) => ({ ...record, reason: redactText(record.reason) }));
  queryDiagnostics.push(...stale.map((record) => finding('PLAN_STALE_EVIDENCE', `evidence ${record.sourceId} for ${record.taskId} is ${record.state}`, [record.taskId], [record.sourceId], 'Refresh or replace the evidence before treating the plan as complete.')));
  const staleReasons = stale.map((record) => ({ taskId: record.taskId, sourceId: record.sourceId, reason: record.reason }));
  const { criticalPath, slack } = criticalMetrics(selectedTasks, selected);
  const rollout = rolloutReport(state.legacy, options.rolloutMode ?? 'observe');
  const rolloutFindings = rollout.records.flatMap((record) => record.finding ? [record.finding] : []);
  queryDiagnostics.push(...rolloutFindings);
  const diagnostics = mergeDiagnostics(state.diagnostics ?? [], queryDiagnostics);
  const explanations: PlanExplanation[] = [
    ...impactExplanations,
    ...conflicts.map((conflict) => ({
      code: conflict.class.toUpperCase(),
      sourceTaskIds: [conflict.leftTaskId, conflict.rightTaskId],
      sourceIds: conflict.sourceIds,
      message: `tasks ${conflict.leftTaskId} and ${conflict.rightTaskId} conflict because ${redactText(conflict.reason)}`,
      action: 'Separate the tasks into different batches or add an audited resolution.',
    })),
    ...stale.map((record) => ({
      code: 'STALE_EVIDENCE',
      sourceTaskIds: [record.taskId],
      sourceIds: [record.sourceId],
      message: `evidence ${record.sourceId} for ${record.taskId} is ${record.state}: ${redactText(record.reason)}`,
      action: 'Refresh or replace the evidence before treating the task as execution verified.',
    })),
    ...scheduleResult.unscheduled.map((entry) => ({
      code: 'UNSCHEDULED',
      sourceTaskIds: [entry.taskId, ...entry.predecessorIds],
      sourceIds: entry.sourceIds,
      message: redactText(entry.reason),
      action: 'Resolve the predecessor chain and rerun the plan query.',
    })),
  ];
  const risks: PlanRisk[] = [
    ...rollout.records.filter((record) => record.status === 'visible').map((record) => ({ code: 'MIGRATION_DEBT' as const, taskIds: record.candidateId ? [record.candidateId] : [], sourceIds: [record.sourceId], severity: 'warning' as const, explanation: `legacy source ${record.sourceId} remains queryable but is not canonical`, action: 'Canonicalize the legacy record before enforce mode.' })),
    ...conflicts.map((conflict) => ({ code: 'CONFLICT' as const, taskIds: [conflict.leftTaskId, conflict.rightTaskId], sourceIds: conflict.sourceIds, severity: 'error' as const, explanation: redactText(conflict.reason), action: 'Separate conflicting tasks into different batches.' })),
    ...(impactExplanations.length > 2 ? [{ code: 'BROAD_IMPACT' as const, taskIds: [...direct, ...transitive], sourceIds: [...direct, ...transitive], severity: 'warning' as const, explanation: 'selected work has broad downstream impact', action: 'Review all direct and transitive dependents before applying a patch.' }] : []),
    ...(criticalPath.taskIds.length > 0 ? [{ code: 'CRITICAL_WORK' as const, taskIds: criticalPath.taskIds, sourceIds: criticalPath.taskIds, severity: 'info' as const, explanation: `critical path totals ${criticalPath.totalMinutes} minutes`, action: 'Prioritize the critical path and monitor predecessor readiness.' }] : []),
    ...stale.map((record) => ({ code: 'STALE_EVIDENCE' as const, taskIds: [record.taskId], sourceIds: [record.sourceId], severity: 'error' as const, explanation: redactText(record.reason), action: 'Refresh evidence before execution verification.' })),
    ...scheduleResult.unscheduled.map((entry) => ({ code: 'UNSCHEDULED' as const, taskIds: [entry.taskId], sourceIds: entry.sourceIds, severity: 'error' as const, explanation: redactText(entry.reason), action: 'Resolve typed predecessors or expand selection.' })),
  ];
  return {
    version: TASK_PLAN_VERSION,
    revision: state.revision,
    selectedTaskIds: selectedTasks.map((task) => task.qualifiedId),
    graph,
    impact: { direct, transitive, explanations: impactExplanations },
    conflicts,
    waves: scheduleResult.waves,
    batches: scheduleResult.batches,
    frontier: scheduleResult.frontier,
    unscheduledRemainder: scheduleResult.unscheduled,
    unscheduled: scheduleResult.unscheduled,
    complete: scheduleResult.unscheduled.length === 0 && stale.length === 0 && diagnostics.every((item) => item.severity !== 'error'),
    criticalPath,
    slack,
    stale,
    staleReasons,
    diagnostics,
    explanations,
    reports: { risks, rollout },
  };
}

export const executionPlanQuery = queryTaskPlan;
export const queryExecutionPlan = queryTaskPlan;

function validateEvidence(tasks: readonly CanonicalTask[], evidence: readonly TaskEvidenceRecord[]): PlanDiagnostic[] {
  const ids = new Set(tasks.map((task) => normalizedTaskId(task.qualifiedId)));
  return evidence.filter((record) => !ids.has(normalizedTaskId(record.taskId))).map((record) => finding(
    'PLAN_UNRESOLVED_EVIDENCE',
    `evidence ${record.sourceId} refers to unresolved task ${record.taskId}`,
    [record.taskId],
    [record.sourceId],
    'Attach evidence to an existing canonical task.',
  ));
}

export function validateTaskPlanPatch(state: TaskPlanState, patch: TaskPlanPatch): PlanDiagnostic[] {
  const findings: PlanDiagnostic[] = [];
  const current = new Map(state.tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const additions = patch.add ?? [];
  const replacements = patch.replace ?? [];
  const seenPatch = new Set<string>();
  for (const task of [...additions, ...replacements]) {
    const key = normalizedTaskId(task.qualifiedId);
    if (seenPatch.has(key)) findings.push(finding('PLAN_DUPLICATE_TASK_ID', `patch contains duplicate task ID ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], 'Keep one add or replace operation per canonical task ID.', task.sourceSpan));
    seenPatch.add(key);
  }
  for (const task of additions) if (current.has(normalizedTaskId(task.qualifiedId))) findings.push(finding('PLAN_DUPLICATE_TASK_ID', `patch add duplicates existing task ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], 'Use replace for an existing canonical task.', task.sourceSpan));
  for (const task of replacements) if (!current.has(normalizedTaskId(task.qualifiedId))) findings.push(finding('PLAN_UNKNOWN_TASK', `patch replace targets unknown task ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], 'Use add for a new canonical task.', task.sourceSpan));
  const remove = new Set((patch.removeIds ?? []).map(normalizedTaskId));
  const nextTasks = state.tasks.filter((task) => !remove.has(normalizedTaskId(task.qualifiedId))).map((task) => {
    const replacement = replacements.find((candidate) => normalizedTaskId(candidate.qualifiedId) === normalizedTaskId(task.qualifiedId));
    return replacement ?? task;
  });
  nextTasks.push(...additions);
  const normalized = normalizeTasks(nextTasks);
  findings.push(...normalized.diagnostics);
  findings.push(...validateDependencies(normalized.tasks));
  findings.push(...validateEvidence(normalized.tasks, patch.evidence ?? state.evidence));
  return findings;
}

export function applyTaskPlanPatch(state: TaskPlanState, patch: TaskPlanPatch, options: TaskPlanMutationOptions): TaskPlanMutationResult {
  const dryRun = options.dryRun === true;
  const before = clone(state);
  const casFinding = state.revision !== options.expectedRevision
    ? finding('PLAN_STALE_REVISION', `expected revision ${options.expectedRevision}, found ${state.revision}`, [], [], 'Reload the canonical plan and retry with its current revision.')
    : null;
  const findings = casFinding ? [casFinding] : validateTaskPlanPatch(state, patch);
  if (findings.some((item) => item.severity === 'error')) {
    return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings };
  }
  const remove = new Set((patch.removeIds ?? []).map(normalizedTaskId));
  const replacements = new Map((patch.replace ?? []).map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const nextTasks = state.tasks
    .filter((task) => !remove.has(normalizedTaskId(task.qualifiedId)))
    .map((task) => replacements.get(normalizedTaskId(task.qualifiedId)) ?? task);
  nextTasks.push(...(patch.add ?? []));
  const nextState = buildTaskPlanState(nextTasks, {
    revision: state.revision + 1,
    evidence: patch.evidence ?? state.evidence,
    conflicts: state.conflicts,
    legacy: state.legacy,
    sourceFingerprint: state.sourceFingerprint,
  });
  const nextSerialized = serializeTaskPlanState(nextState);
  if (!dryRun && options.persist) {
    try {
      const committed = options.persist(nextState, nextSerialized, options.expectedRevision);
      if (!committed) {
        const staleFinding = finding('PLAN_STALE_REVISION', `persisted revision changed before commit of ${options.expectedRevision}`, [], [], 'Reload the persisted plan state and retry against its current revision.');
        return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings: [staleFinding] };
      }
    } catch (error) {
      const persistenceFinding = finding('PLAN_PERSISTENCE_FAILED', `persistence failed: ${error instanceof Error ? error.message : String(error)}`, [], [], 'Leave the source unchanged, fix persistence, and retry the same CAS revision.');
      return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings: [persistenceFinding] };
    }
  }
  const resultState = clone(nextState);
  return { ok: true, committed: !dryRun, dryRun, revision: resultState.revision, state: resultState, plan: queryTaskPlan(resultState), findings: [] };
}

export const applyExecutionPlanPatch = applyTaskPlanPatch;
export const applyPlanPatch = applyTaskPlanPatch;

export function reportTaskPlan(state: TaskPlanState, options: PlanSelectionOptions = {}): TaskPlanResult['reports'] {
  return queryTaskPlan(state, options).reports;
}

export function taskPlanStateWithLegacy(tasks: readonly CanonicalTask[], legacy: readonly LegacyTaskRecord[], options: Omit<PlanStateOptions, 'legacy'> = {}): TaskPlanState {
  return buildTaskPlanState(tasks, { ...options, legacy });
}

export function planStateFingerprint(state: TaskPlanState): string {
  return stableTaskJson(state.tasks);
}

export function countTaskPlanRecords(state: TaskPlanState): number {
  return state.tasks.length + state.legacy.length;
}

export function legacyPlanReport(records: readonly LegacyTaskRecord[], mode: RolloutMode): PlanRolloutReport {
  return rolloutReport(records, mode);
}
