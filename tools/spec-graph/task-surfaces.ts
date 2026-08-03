import {
  normalizeTaskKey,
  normalizedTaskId,
  type CanonicalTask,
  type SurfaceAccess,
  type SurfaceKind,
  type TaskSurface,
} from './task-contract.ts';
import { buildDependencyGraph, type DependencyGraph } from './task-dependencies.ts';

export type SurfaceFindingCode =
  | 'TRAVERSAL'
  | 'ABSOLUTE_PATH'
  | 'UNC_PATH'
  | 'NORMALIZATION_MISMATCH'
  | 'SYMLINK_OR_JUNCTION'
  | 'UNBOUNDED_GLOB';

export interface SurfaceFinding {
  code: SurfaceFindingCode;
  severity: 'error' | 'warning';
  taskId: string;
  locator: string;
  message: string;
  redacted: true;
}

export interface SurfaceClaim {
  taskId: string;
  kind: SurfaceKind;
  access: SurfaceAccess;
  locator: string;
  normalizedLocator: string;
  scope: string;
  rationale: string;
}

export interface LocatorPathFacts {
  isSymlink?: boolean;
  isJunction?: boolean;
}

export interface SurfaceValidationOptions {
  /** Data supplied by an inventory producer; this function never probes the filesystem. */
  pathFacts?: Readonly<Record<string, LocatorPathFacts>>;
}

export interface SurfaceValidationReport {
  representationVersion: 'task-surfaces/v1';
  claims: SurfaceClaim[];
  findings: SurfaceFinding[];
  safe: boolean;
  executedCommands: 0;
}

export interface ActualArtifact {
  path: string;
  taskId?: string;
  kind?: string;
}

export interface ArtifactReconciliationReport {
  representationVersion: 'task-artifacts/v1';
  declared: string[];
  actual: string[];
  matched: string[];
  undeclaredActual: string[];
  missingDeclared: string[];
  byTask: Record<string, { declared: string[]; actual: string[]; undeclared: string[]; missing: string[] }>;
}

export type BlastRadiusRelation = 'direct' | 'transitive';

export interface BlastRadiusEntry {
  taskId: string;
  path: string;
  relation: BlastRadiusRelation;
  via: string[];
  explanation: string;
}

export interface BlastRadiusReport {
  representationVersion: 'task-blast-radius/v1';
  query: string;
  entries: BlastRadiusEntry[];
  directTaskIds: string[];
  transitiveTaskIds: string[];
}

function compareIds(left: string, right: string): number {
  return normalizedTaskId(left).localeCompare(normalizedTaskId(right)) || left.localeCompare(right);
}

function normalizePathText(value: string): string {
  const slashNormalized = value.replaceAll('\\', '/');
  const prefix = slashNormalized.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const part of slashNormalized.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push('..');
      continue;
    }
    parts.push(part);
  }
  return `${prefix}${parts.join('/')}` || '.';
}

export function normalizeSurfaceLocator(locator: string): string {
  return normalizePathText(normalizeTaskKey(locator));
}

function pathFactFor(options: SurfaceValidationOptions, locator: string): LocatorPathFacts | undefined {
  const facts = options.pathFacts ?? {};
  return facts[locator] ?? facts[normalizeSurfaceLocator(locator)];
}

function finding(code: SurfaceFindingCode, taskId: string, locator: string, message: string): SurfaceFinding {
  return { code, severity: 'error', taskId, locator: '<redacted>', message, redacted: true };
}

function isAbsolute(locator: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\/)/.test(locator);
}

function isUnc(locator: string): boolean {
  return /^(?:\\\\|\/\/)/.test(locator);
}

function hasTraversal(locator: string): boolean {
  return locator.replaceAll('\\', '/').split('/').some((part) => part === '..');
}

function hasUnboundedGlob(locator: string, kind: SurfaceKind): boolean {
  return kind === 'glob' && (locator.includes('**') || locator === '*' || locator.includes('{'));
}

function validateSurface(taskId: string, surface: TaskSurface, options: SurfaceValidationOptions): { claim: SurfaceClaim; findings: SurfaceFinding[] } {
  const locator = normalizeTaskKey(surface.locator);
  const normalizedLocator = normalizeSurfaceLocator(locator);
  const claim: SurfaceClaim = {
    taskId,
    kind: surface.kind,
    access: surface.access,
    locator,
    normalizedLocator,
    scope: normalizeTaskKey(surface.scope),
    rationale: surface.rationale.trim(),
  };
  const findings: SurfaceFinding[] = [];
  // external-contract is a typed boundary, not a local path. It is retained as data and never executed.
  if (surface.kind !== 'external-contract') {
    if (hasTraversal(locator)) findings.push(finding('TRAVERSAL', taskId, locator, 'locator contains parent traversal'));
    if (isAbsolute(locator)) findings.push(finding('ABSOLUTE_PATH', taskId, locator, 'absolute local locator is outside repository scope'));
    if (isUnc(locator)) findings.push(finding('UNC_PATH', taskId, locator, 'UNC locator is outside repository scope'));
    if (locator !== normalizedLocator) findings.push(finding('NORMALIZATION_MISMATCH', taskId, locator, 'locator is not in normalized repository form'));
    const facts = pathFactFor(options, locator);
    if (facts?.isSymlink || facts?.isJunction) findings.push(finding('SYMLINK_OR_JUNCTION', taskId, locator, 'inventory marks locator as symlink or junction'));
    if (hasUnboundedGlob(locator, surface.kind)) findings.push(finding('UNBOUNDED_GLOB', taskId, locator, 'glob must be bounded to a finite repository scope'));
  }
  return { claim, findings };
}

/** Validate claims as inert data. No filesystem, shell, glob, or realpath operation is performed. */
export function validateSurfaceClaims(tasks: readonly CanonicalTask[], options: SurfaceValidationOptions = {}): SurfaceValidationReport {
  const claims: SurfaceClaim[] = [];
  const findings: SurfaceFinding[] = [];
  for (const task of [...tasks].sort((left, right) => compareIds(left.qualifiedId, right.qualifiedId))) {
    for (const surface of task.surfaces) {
      const result = validateSurface(task.qualifiedId, surface, options);
      claims.push(result.claim);
      findings.push(...result.findings);
    }
  }
  claims.sort((left, right) => compareIds(left.taskId, right.taskId) || left.normalizedLocator.localeCompare(right.normalizedLocator) || left.access.localeCompare(right.access));
  findings.sort((left, right) => compareIds(left.taskId, right.taskId) || left.code.localeCompare(right.code));
  return {
    representationVersion: 'task-surfaces/v1',
    claims,
    findings,
    safe: findings.every((item) => item.severity !== 'error'),
    executedCommands: 0,
  };
}

function artifactPath(value: string): string {
  return normalizeSurfaceLocator(value);
}

function actualRecord(value: string | ActualArtifact): ActualArtifact {
  return typeof value === 'string' ? { path: value } : value;
}

export function reconcileArtifacts(tasks: readonly CanonicalTask[], actualArtifacts: readonly (string | ActualArtifact)[]): ArtifactReconciliationReport {
  const declaredByTask = new Map<string, string[]>();
  const actualByTask = new Map<string, string[]>();
  for (const task of tasks) declaredByTask.set(task.qualifiedId, task.artifacts.map((artifact) => artifactPath(artifact.path)).sort());
  for (const record of actualArtifacts.map(actualRecord)) {
    const path = artifactPath(record.path);
    if (record.taskId) {
      const recordTaskId = record.taskId;
      const taskId = tasks.find((task) => normalizedTaskId(task.qualifiedId) === normalizedTaskId(recordTaskId))?.qualifiedId ?? recordTaskId;
      actualByTask.set(taskId, [...(actualByTask.get(taskId) ?? []), path]);
    }
  }
  const declared = [...new Set([...declaredByTask.values()].flat())].sort();
  const actual = [...new Set(actualArtifacts.map((record) => artifactPath(actualRecord(record).path)))].sort();
  const declaredSet = new Set(declared);
  const actualSet = new Set(actual);
  const matched = actual.filter((path) => declaredSet.has(path));
  const undeclaredActual = actual.filter((path) => !declaredSet.has(path));
  const missingDeclared = declared.filter((path) => !actualSet.has(path));
  const byTask: ArtifactReconciliationReport['byTask'] = {};
  for (const task of [...tasks].sort((left, right) => compareIds(left.qualifiedId, right.qualifiedId))) {
    const taskDeclared = [...new Set(declaredByTask.get(task.qualifiedId) ?? [])].sort();
    const taskActual = [...new Set(actualByTask.get(task.qualifiedId) ?? actual.filter((path) => taskDeclared.includes(path)))].sort();
    byTask[task.qualifiedId] = {
      declared: taskDeclared,
      actual: taskActual,
      undeclared: taskActual.filter((path) => !taskDeclared.includes(path)),
      missing: taskDeclared.filter((path) => !taskActual.includes(path)),
    };
  }
  return { representationVersion: 'task-artifacts/v1', declared, actual, matched, undeclaredActual, missingDeclared, byTask };
}

function taskClaimPaths(task: CanonicalTask): string[] {
  return [...task.surfaces, ...task.artifacts.map((artifact) => ({ locator: artifact.path } as TaskSurface))]
    .map((claim) => normalizeSurfaceLocator(claim.locator))
    .filter(Boolean);
}

/** Find direct claims and dependency descendants without creating any dependency edge. */
export function calculateBlastRadius(tasks: readonly CanonicalTask[], query: string, graph: DependencyGraph = buildDependencyGraph(tasks)): BlastRadiusReport {
  const normalizedQuery = normalizeSurfaceLocator(query);
  const direct = tasks.filter((task) => taskClaimPaths(task).some((path) => path === normalizedQuery || path.endsWith(`/${normalizedQuery}`) || normalizedQuery.endsWith(`/${path}`)));
  const directTaskIds = direct.map((task) => task.qualifiedId).sort(compareIds);
  const entries = new Map<string, BlastRadiusEntry>();
  for (const task of direct) {
    entries.set(task.qualifiedId, {
      taskId: task.qualifiedId,
      path: normalizedQuery,
      relation: 'direct',
      via: [],
      explanation: `${task.qualifiedId} directly claims ${normalizedQuery}`,
    });
  }
  const queue = direct.map((task) => ({ id: task.qualifiedId, via: [task.qualifiedId] }));
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const key = normalizedTaskId(current.id);
    if (visited.has(key)) continue;
    visited.add(key);
    for (const downstreamId of graph.reverseBlockers[current.id] ?? []) {
      const downstream = tasks.find((task) => normalizedTaskId(task.qualifiedId) === normalizedTaskId(downstreamId));
      if (!downstream) continue;
      const via = [...current.via, downstream.qualifiedId];
      if (!entries.has(downstream.qualifiedId)) entries.set(downstream.qualifiedId, {
        taskId: downstream.qualifiedId,
        path: normalizedQuery,
        relation: 'transitive',
        via,
        explanation: `${downstream.qualifiedId} is downstream of ${current.id} through typed dependencies for ${normalizedQuery}`,
      });
      queue.push({ id: downstream.qualifiedId, via });
    }
  }
  const ordered = [...entries.values()].sort((left, right) => compareIds(left.taskId, right.taskId) || left.relation.localeCompare(right.relation));
  const transitiveTaskIds = ordered.filter((entry) => entry.relation === 'transitive').map((entry) => entry.taskId);
  return {
    representationVersion: 'task-blast-radius/v1',
    query: normalizedQuery,
    entries: ordered,
    directTaskIds,
    transitiveTaskIds,
  };
}

export const validateTaskSurfaces = validateSurfaceClaims;
export const reconcileTaskArtifacts = reconcileArtifacts;
export const queryBlastRadius = calculateBlastRadius;