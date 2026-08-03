/**
 * Task-owned execution evidence for the task/v1 contract.
 *
 * This module is deliberately independent from the SpecGraph builders. It keeps
 * evidence history visible while deriving a separate, conservative completion
 * decision. A fingerprint change invalidates only dependent descendants; it
 * never deletes the successful record that led to the stale decision.
 */

import crypto from 'node:crypto';
import type { CanonicalTask } from './task-contract.ts';

export const TASK_EVIDENCE_VERSION = 1 as const;

export type TaskEvidenceResult =
  | 'PASSED'
  | 'FAILED'
  | 'SKIPPED'
  | 'PENDING'
  | 'UNDEFINED'
  | 'AMBIGUOUS'
  | 'UNKNOWN';

export type EvidenceRunScope = 'full-suite' | 'filtered' | 'scenario' | 'manual';

export interface EvidenceOwner {
  id: string;
  kind?: string;
}

export type EvidenceEnvironmentValue = string | number | boolean | null;
export type EvidenceEnvironment = Readonly<Record<string, EvidenceEnvironmentValue>>;
export type FingerprintMap = Readonly<Record<string, string>>;

export interface TaskEvidenceInput {
  taskId: string;
  owner: string | EvidenceOwner;
  validatedIds: readonly string[];
  runId: string;
  /** Optional richer run metadata. `runId` remains the canonical identity. */
  run?: {
    id?: string;
    scope?: EvidenceRunScope;
    command?: string;
    filter?: string;
  };
  environment: EvidenceEnvironment;
  result: TaskEvidenceResult;
  /** Fingerprints of the evidence inputs and produced artifacts. */
  fingerprints: FingerprintMap;
  inputFingerprints?: FingerprintMap;
  outputFingerprints?: FingerprintMap;
  scope?: EvidenceRunScope;
  command?: string;
  filter?: string;
  recordedAt?: string;
}

export interface TaskEvidenceRecord {
  schemaVersion: typeof TASK_EVIDENCE_VERSION;
  evidenceId: string;
  taskId: string;
  owner: EvidenceOwner;
  validatedIds: string[];
  runId: string;
  runScope: EvidenceRunScope;
  command?: string;
  filter?: string;
  environment: Record<string, EvidenceEnvironmentValue>;
  result: TaskEvidenceResult;
  fingerprints: Record<string, string>;
  inputFingerprints: Record<string, string>;
  outputFingerprints: Record<string, string>;
  recordedAt: string;
  /** A stale record remains history, but is never completion proof. */
  stale: boolean;
  stalePaths: string[];
  staleReasons: string[];
  /** Policy acceptance is separate from visibility/history. */
  eligibleForCompletion: boolean;
  eligibilityReason?: string;
}

export interface EvidenceFinding {
  code:
    | 'EVIDENCE_INVALID'
    | 'EVIDENCE_UNKNOWN_TASK'
    | 'EVIDENCE_DUPLICATE'
    | 'EVIDENCE_FILTERED_NOT_FULL_SUITE'
    | 'EVIDENCE_STALE';
  message: string;
  taskId?: string;
  path?: string;
}

export interface TaskEvidenceSnapshot {
  schemaVersion: typeof TASK_EVIDENCE_VERSION;
  tasks: CanonicalTask[];
  records: TaskEvidenceRecord[];
  revision: number;
}

export interface TaskEvidenceProjection {
  taskId: string;
  evidenceId: string;
  owner: EvidenceOwner;
  validatedIds: string[];
  runId: string;
  environment: Record<string, EvidenceEnvironmentValue>;
  result: TaskEvidenceResult;
  fingerprints: Record<string, string>;
  inputFingerprints: Record<string, string>;
  outputFingerprints: Record<string, string>;
  runScope: EvidenceRunScope;
  stale: boolean;
  stalePaths: string[];
  staleReasons: string[];
  visibleInHistory: true;
  eligibleForCompletion: boolean;
  eligibilityReason?: string;
}

export interface TaskEvidenceViews {
  source: TaskEvidenceProjection[];
  incremental: TaskEvidenceProjection[];
  persisted: TaskEvidenceProjection[];
  mcp: TaskEvidenceProjection[];
}

export interface RecordTaskEvidenceResult {
  ok: boolean;
  committed: boolean;
  accepted: boolean;
  evidence: TaskEvidenceRecord;
  snapshot: TaskEvidenceSnapshot;
  findings: EvidenceFinding[];
}

export interface CompletionDecision {
  taskId: string;
  complete: boolean;
  evidenceId?: string;
  reasons: string[];
  historyVisible: boolean;
}

export interface FingerprintChange {
  taskId: string;
  paths: readonly string[];
  reason: string;
  previous?: FingerprintMap;
  current?: FingerprintMap;
}

const RESULT_SET = new Set<TaskEvidenceResult>([
  'PASSED', 'FAILED', 'SKIPPED', 'PENDING', 'UNDEFINED', 'AMBIGUOUS', 'UNKNOWN',
]);
const SCOPE_SET = new Set<EvidenceRunScope>(['full-suite', 'filtered', 'scenario', 'manual']);
const EPOCH = '1970-01-01T00:00:00.000Z';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedId(value: string): string {
  return text(value).normalize('NFKC').toLocaleLowerCase('en-US');
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sortedMap(values: FingerprintMap | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(values ?? {})
    .filter(([key, value]) => Boolean(text(key)) && Boolean(text(value)))
    .map(([key, value]) => [text(key), text(value)])
    .sort(([a], [b]) => a.localeCompare(b)));
}

function sortedEnvironment(values: EvidenceEnvironment): Record<string, EvidenceEnvironmentValue> {
  return Object.fromEntries(Object.entries(values)
    .filter(([key]) => Boolean(text(key)))
    .sort(([a], [b]) => a.localeCompare(b)));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableValue(object[key])]));
  }
  return value;
}

export function stableTaskEvidenceJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function taskEvidenceDigest(value: unknown): string {
  return crypto.createHash('sha256').update(stableTaskEvidenceJson(value)).digest('hex');
}

function ownerOf(owner: string | EvidenceOwner): EvidenceOwner {
  if (typeof owner === 'string') return { id: text(owner) };
  return { id: text(owner.id), ...(text(owner.kind) ? { kind: text(owner.kind) } : {}) };
}

function taskFor(snapshot: TaskEvidenceSnapshot, taskId: string): CanonicalTask | undefined {
  const wanted = normalizedId(taskId);
  return snapshot.tasks.find((task) => normalizedId(task.qualifiedId) === wanted);
}

function taskIdOf(snapshot: TaskEvidenceSnapshot, taskId: string): string {
  return taskFor(snapshot, taskId)?.qualifiedId ?? text(taskId);
}

function policyFor(task: CanonicalTask | undefined): { fullSuite: boolean; requiresFresh: boolean } {
  return {
    fullSuite: task?.evidencePolicy.scope === 'full-suite',
    requiresFresh: task?.evidencePolicy.requiresFresh !== false,
  };
}

function canonicalInput(input: TaskEvidenceInput): Omit<TaskEvidenceRecord, 'evidenceId' | 'stale' | 'stalePaths' | 'staleReasons' | 'eligibleForCompletion' | 'eligibilityReason'> {
  const owner = ownerOf(input.owner);
  const runScope = input.scope ?? input.run?.scope ?? (input.run?.filter || input.filter ? 'filtered' : 'full-suite');
  return {
    schemaVersion: TASK_EVIDENCE_VERSION,
    taskId: text(input.taskId),
    owner,
    validatedIds: sortedUnique(input.validatedIds),
    runId: text(input.runId || input.run?.id),
    ...(text(input.command ?? input.run?.command) ? { command: text(input.command ?? input.run?.command) } : {}),
    ...(text(input.filter ?? input.run?.filter) ? { filter: text(input.filter ?? input.run?.filter) } : {}),
    environment: sortedEnvironment(input.environment),
    result: input.result,
    fingerprints: sortedMap(input.fingerprints),
    inputFingerprints: sortedMap(input.inputFingerprints ?? input.fingerprints),
    outputFingerprints: sortedMap(input.outputFingerprints),
    runScope,
    recordedAt: text(input.recordedAt) || EPOCH,
  };
}

function validationFindings(input: TaskEvidenceInput, snapshot: TaskEvidenceSnapshot): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [];
  const normalized = canonicalInput(input);
  if (!taskFor(snapshot, normalized.taskId)) findings.push({ code: 'EVIDENCE_UNKNOWN_TASK', taskId: normalized.taskId, message: `evidence task is not in the canonical task set: ${normalized.taskId}` });
  if (!normalized.taskId || !normalized.owner.id || !normalized.runId || !normalized.validatedIds.length || !Object.keys(normalized.environment).length || !Object.keys(normalized.fingerprints).length) {
    findings.push({ code: 'EVIDENCE_INVALID', taskId: normalized.taskId, message: 'task evidence must bind owner, validated IDs, run ID, environment, result, and fingerprints' });
  }
  if (!RESULT_SET.has(normalized.result)) findings.push({ code: 'EVIDENCE_INVALID', taskId: normalized.taskId, message: `unsupported evidence result: ${String(normalized.result)}` });
  if (!SCOPE_SET.has(normalized.runScope)) findings.push({ code: 'EVIDENCE_INVALID', taskId: normalized.taskId, message: `unsupported evidence scope: ${String(normalized.runScope)}` });
  if (normalized.runScope === 'filtered' && !normalized.filter) findings.push({ code: 'EVIDENCE_INVALID', taskId: normalized.taskId, message: 'filtered evidence must identify its filter' });
  return findings;
}

export function validateTaskEvidence(input: TaskEvidenceInput, snapshot: TaskEvidenceSnapshot): { valid: boolean; findings: EvidenceFinding[] } {
  const findings = validationFindings(input, snapshot);
  return { valid: findings.length === 0, findings };
}

function completionEligibility(task: CanonicalTask | undefined, record: Omit<TaskEvidenceRecord, 'evidenceId' | 'stale' | 'stalePaths' | 'staleReasons' | 'eligibleForCompletion' | 'eligibilityReason'>): { eligible: boolean; reason?: string } {
  const policy = policyFor(task);
  if (record.result !== 'PASSED') return { eligible: false, reason: `evidence result is ${record.result}` };
  if (policy.fullSuite && record.runScope !== 'full-suite') return { eligible: false, reason: 'full-suite evidence policy rejects filtered proof' };
  if (!record.owner.id || !record.validatedIds.length || !record.runId || !Object.keys(record.environment).length || !Object.keys(record.fingerprints).length) {
    return { eligible: false, reason: 'evidence identity or fingerprint binding is incomplete' };
  }
  return { eligible: true };
}

function evidenceIdFor(record: Omit<TaskEvidenceRecord, 'evidenceId' | 'stale' | 'stalePaths' | 'staleReasons' | 'eligibleForCompletion' | 'eligibilityReason'>): string {
  return `TASK-EVIDENCE-${taskEvidenceDigest(record)}`;
}

function cloneRecord(record: TaskEvidenceRecord): TaskEvidenceRecord {
  return JSON.parse(JSON.stringify(record)) as TaskEvidenceRecord;
}

function cloneSnapshot(snapshot: TaskEvidenceSnapshot): TaskEvidenceSnapshot {
  return {
    schemaVersion: TASK_EVIDENCE_VERSION,
    tasks: snapshot.tasks.map((task) => JSON.parse(JSON.stringify(task)) as CanonicalTask),
    records: snapshot.records.map(cloneRecord),
    revision: snapshot.revision,
  };
}

export function createTaskEvidenceSnapshot(tasks: readonly CanonicalTask[], records: readonly TaskEvidenceRecord[] = []): TaskEvidenceSnapshot {
  const byId = new Map<string, CanonicalTask>();
  for (const task of tasks) byId.set(normalizedId(task.qualifiedId), JSON.parse(JSON.stringify(task)) as CanonicalTask);
  return {
    schemaVersion: TASK_EVIDENCE_VERSION,
    tasks: [...byId.values()].sort((a, b) => a.qualifiedId.localeCompare(b.qualifiedId)),
    records: records.map(cloneRecord).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
    revision: 0,
  };
}

export function recordTaskEvidence(snapshot: TaskEvidenceSnapshot, input: TaskEvidenceInput): RecordTaskEvidenceResult {
  const normalized = canonicalInput(input);
  const findings = validationFindings(input, snapshot);
  const task = taskFor(snapshot, normalized.taskId);
  const eligibility = completionEligibility(task, normalized);
  if (!eligibility.eligible && eligibility.reason === 'full-suite evidence policy rejects filtered proof') {
    findings.push({ code: 'EVIDENCE_FILTERED_NOT_FULL_SUITE', taskId: normalized.taskId, message: eligibility.reason });
  }
  const evidenceId = evidenceIdFor(normalized);
  const existing = snapshot.records.find((record) => record.evidenceId === evidenceId);
  if (existing) {
    findings.push({ code: 'EVIDENCE_DUPLICATE', taskId: normalized.taskId, message: `evidence already recorded: ${evidenceId}` });
    return { ok: findings.every((finding) => finding.code === 'EVIDENCE_DUPLICATE'), committed: false, accepted: existing.eligibleForCompletion, evidence: cloneRecord(existing), snapshot: cloneSnapshot(snapshot), findings };
  }
  const evidence: TaskEvidenceRecord = {
    ...normalized,
    taskId: taskIdOf(snapshot, normalized.taskId),
    evidenceId,
    stale: false,
    stalePaths: [],
    staleReasons: [],
    eligibleForCompletion: eligibility.eligible,
    ...(eligibility.reason ? { eligibilityReason: eligibility.reason } : {}),
  };
  if (findings.some((finding) => finding.code === 'EVIDENCE_INVALID' || finding.code === 'EVIDENCE_UNKNOWN_TASK')) {
    return { ok: false, committed: false, accepted: false, evidence, snapshot: cloneSnapshot(snapshot), findings };
  }
  const next = cloneSnapshot(snapshot);
  next.records.push(cloneRecord(evidence));
  next.records.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  next.revision += 1;
  return { ok: true, committed: true, accepted: evidence.eligibleForCompletion, evidence, snapshot: next, findings };
}

function dependencyTarget(task: CanonicalTask): string[] {
  return task.dependencies
    .filter((dependency) => dependency.relation === 'depends-on' || dependency.relation === 'blocks' || dependency.relation === 'consumes')
    .map((dependency) => dependency.targetId);
}

function descendantPaths(tasks: readonly CanonicalTask[], rootId: string, changedPaths: readonly string[]): Map<string, string[]> {
  const roots = normalizedId(rootId);
  const byTarget = new Map<string, CanonicalTask[]>();
  for (const task of tasks) {
    for (const target of dependencyTarget(task)) {
      const key = normalizedId(target);
      const list = byTarget.get(key) ?? [];
      list.push(task);
      byTarget.set(key, list);
    }
  }
  const paths = new Map<string, string[]>();
  const canonicalRoot = taskFor({ schemaVersion: 1, tasks: [...tasks], records: [], revision: 0 }, rootId)?.qualifiedId ?? rootId;
  paths.set(roots, [canonicalRoot]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: roots, path: [canonicalRoot] }];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const children = byTarget.get(current.id) ?? [];
    for (const child of children) {
      const childKey = normalizedId(child.qualifiedId);
      const nextPath = [...current.path, child.qualifiedId];
      const prior = paths.get(childKey);
      if (!prior || nextPath.length < prior.length) paths.set(childKey, nextPath);
      if (!seen.has(childKey)) {
        seen.add(childKey);
        queue.push({ id: childKey, path: nextPath });
      }
    }
  }
  // Keep changed paths in the path strings so consumers can explain the cause
  // without consulting a second source of truth.
  for (const [key, path] of paths) paths.set(key, [...path, ...changedPaths.map((entry) => `input:${entry}`)]);
  return paths;
}

export function markDependentEvidenceStale(snapshot: TaskEvidenceSnapshot, change: FingerprintChange): TaskEvidenceSnapshot {
  const paths = descendantPaths(snapshot.tasks, change.taskId, change.paths);
  if (!paths.size) return cloneSnapshot(snapshot);
  const next = cloneSnapshot(snapshot);
  let changed = false;
  for (const record of next.records) {
    const path = paths.get(normalizedId(record.taskId));
    if (!path) continue;
    const stalePath = path.join(' -> ');
    const reason = text(change.reason) || `input fingerprint changed for ${change.taskId}`;
    const stalePaths = sortedUnique([...record.stalePaths, stalePath]);
    const staleReasons = sortedUnique([...record.staleReasons, reason]);
    if (!record.stale || record.eligibleForCompletion || stalePaths.length !== record.stalePaths.length || staleReasons.length !== record.staleReasons.length) changed = true;
    record.stale = true;
    record.stalePaths = stalePaths;
    record.staleReasons = staleReasons;
    record.eligibleForCompletion = false;
    record.eligibilityReason = 'stale evidence cannot complete task';
  }
  if (changed) next.revision += 1;
  return next;
}

export function markInputFingerprintsChanged(snapshot: TaskEvidenceSnapshot, changes: readonly FingerprintChange[]): TaskEvidenceSnapshot {
  return changes.reduce((current, change) => markDependentEvidenceStale(current, change), cloneSnapshot(snapshot));
}

export function projectTaskEvidence(snapshot: TaskEvidenceSnapshot): TaskEvidenceProjection[] {
  return [...snapshot.records].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.evidenceId.localeCompare(b.evidenceId)).map((record) => ({
    taskId: record.taskId,
    evidenceId: record.evidenceId,
    owner: { ...record.owner },
    validatedIds: [...record.validatedIds],
    runId: record.runId,
    environment: { ...record.environment },
    result: record.result,
    fingerprints: { ...record.fingerprints },
    inputFingerprints: { ...record.inputFingerprints },
    outputFingerprints: { ...record.outputFingerprints },
    runScope: record.runScope,
    stale: record.stale,
    stalePaths: [...record.stalePaths],
    staleReasons: [...record.staleReasons],
    visibleInHistory: true,
    eligibleForCompletion: record.eligibleForCompletion,
    ...(record.eligibilityReason ? { eligibilityReason: record.eligibilityReason } : {}),
  }));
}

export function projectTaskEvidenceViews(snapshot: TaskEvidenceSnapshot): TaskEvidenceViews {
  const projection = projectTaskEvidence(snapshot);
  // All views are built from the same sorted projection. Callers may compare
  // their stable JSON digests to prove that restoration did not split truth.
  return {
    source: projection,
    incremental: projection.map((entry) => ({ ...entry, owner: { ...entry.owner }, validatedIds: [...entry.validatedIds], environment: { ...entry.environment }, fingerprints: { ...entry.fingerprints }, inputFingerprints: { ...entry.inputFingerprints }, outputFingerprints: { ...entry.outputFingerprints }, stalePaths: [...entry.stalePaths], staleReasons: [...entry.staleReasons] })),
    persisted: projection.map((entry) => JSON.parse(JSON.stringify(entry)) as TaskEvidenceProjection),
    mcp: projection.map((entry) => JSON.parse(JSON.stringify(entry)) as TaskEvidenceProjection),
  };
}

export function taskEvidenceSnapshotDigest(snapshot: TaskEvidenceSnapshot): string {
  return taskEvidenceDigest({ schemaVersion: snapshot.schemaVersion, tasks: snapshot.tasks, records: snapshot.records });
}

export function serializeTaskEvidence(snapshot: TaskEvidenceSnapshot): string {
  return stableTaskEvidenceJson({ schemaVersion: snapshot.schemaVersion, tasks: snapshot.tasks, records: snapshot.records, revision: snapshot.revision });
}

export function restoreTaskEvidence(serialized: string): TaskEvidenceSnapshot {
  const parsed = JSON.parse(serialized) as Partial<TaskEvidenceSnapshot>;
  if (parsed.schemaVersion !== TASK_EVIDENCE_VERSION || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.records)) throw new Error('invalid task evidence snapshot');
  const snapshot = createTaskEvidenceSnapshot(parsed.tasks as CanonicalTask[], parsed.records as TaskEvidenceRecord[]);
  snapshot.revision = Number.isSafeInteger(parsed.revision) ? Number(parsed.revision) : 0;
  return snapshot;
}

export function taskCompletionDecision(snapshot: TaskEvidenceSnapshot, taskId: string): CompletionDecision {
  const task = taskFor(snapshot, taskId);
  const history = snapshot.records.filter((record) => normalizedId(record.taskId) === normalizedId(taskId));
  const reasons: string[] = [];
  if (!task) reasons.push('task is not in the canonical task set');
  if (!history.length) reasons.push('no task-owned evidence exists');
  const eligible = history.filter((record) => record.result === 'PASSED' && record.eligibleForCompletion && !record.stale);
  if (!eligible.length && history.some((record) => record.stale)) reasons.push('stale successful history remains visible but cannot complete task');
  if (!eligible.length && history.some((record) => record.runScope !== 'full-suite' && task?.evidencePolicy.scope === 'full-suite')) reasons.push('full-suite evidence policy rejects filtered proof');
  if (!eligible.length && history.length && !reasons.length) reasons.push('no fresh successful full-proof evidence exists');
  const chosen = eligible.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.evidenceId.localeCompare(a.evidenceId))[0];
  return { taskId: task?.qualifiedId ?? taskId, complete: Boolean(chosen), ...(chosen ? { evidenceId: chosen.evidenceId } : {}), reasons, historyVisible: history.length > 0 };
}

export function recoverTaskStatus(snapshot: TaskEvidenceSnapshot, taskId: string): CanonicalTask['declaredStatus'] {
  const task = taskFor(snapshot, taskId);
  if (!task) return 'TODO';
  const decision = taskCompletionDecision(snapshot, taskId);
  if (decision.complete) return task.declaredStatus === 'DONE' ? 'DONE' : 'IN_PROGRESS';
  return task.declaredStatus === 'DONE' ? 'READY' : task.declaredStatus;
}

/** Mutable façade used by lifecycle/MCP-like consumers while preserving atomic snapshots. */
export class TaskEvidenceStore {
  private current: TaskEvidenceSnapshot;

  constructor(tasks: readonly CanonicalTask[], initial?: TaskEvidenceSnapshot) {
    this.current = initial ? cloneSnapshot(initial) : createTaskEvidenceSnapshot(tasks);
  }

  get snapshot(): TaskEvidenceSnapshot {
    return cloneSnapshot(this.current);
  }

  record(input: TaskEvidenceInput): RecordTaskEvidenceResult {
    const result = recordTaskEvidence(this.current, input);
    if (result.committed) this.current = result.snapshot;
    return { ...result, snapshot: cloneSnapshot(result.snapshot), evidence: cloneRecord(result.evidence) };
  }

  markStale(change: FingerprintChange): TaskEvidenceSnapshot {
    this.current = markDependentEvidenceStale(this.current, change);
    return this.snapshot;
  }

  completion(taskId: string): CompletionDecision {
    return taskCompletionDecision(this.current, taskId);
  }

  project(): TaskEvidenceViews {
    return projectTaskEvidenceViews(this.current);
  }

  serialize(): string {
    return serializeTaskEvidence(this.current);
  }
}

export const createTaskEvidenceStore = (tasks: readonly CanonicalTask[], initial?: TaskEvidenceSnapshot): TaskEvidenceStore => new TaskEvidenceStore(tasks, initial);
export const storeTaskEvidence = recordTaskEvidence;
export const invalidateDependentEvidence = markDependentEvidenceStale;
export const canCompleteTask = taskCompletionDecision;
export const restoreTaskEvidenceSnapshot = restoreTaskEvidence;
