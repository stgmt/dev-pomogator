import { normalizedTaskId, type CanonicalTask, type SurfaceAccess, type TaskSurface } from './task-contract.ts';
import { buildDependencyGraph, type DependencyGraph } from './task-dependencies.ts';
import { normalizeSurfaceLocator, validateSurfaceClaims, type SurfaceClaim } from './task-surfaces.ts';

export type ConflictClass = 'write-write' | 'read-write' | 'exclusive-overlap' | 'semantic-resource';

export interface ConflictClaim {
  taskId: string;
  kind: string;
  access: SurfaceAccess;
  locator: string;
  normalizedLocator: string;
  rationale: string;
}

export interface TaskConflict {
  id: string;
  leftTaskId: string;
  rightTaskId: string;
  classes: ConflictClass[];
  claims: ConflictClaim[];
  derivationRule: string;
  suppressedBy?: string;
}

export interface ConflictOverride {
  id: string;
  conflictId: string;
  scope: string;
  rationale: string;
  actor: string;
  createdAt: string;
  expiresAt: string;
  auditEventId: string;
}

export interface ConflictReport {
  representationVersion: 'task-conflicts/v1';
  conflicts: TaskConflict[];
  activeOverrides: string[];
  expiredOverrides: string[];
}

export interface ConflictQueryResult {
  conflict?: TaskConflict;
  override?: ConflictOverride;
  suppressed: boolean;
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

export function stableConflictJson(value: ConflictReport | TaskConflict | ConflictOverride): string {
  return JSON.stringify(stableValue(value));
}

function conflictId(left: string, right: string, locator: string, classes: readonly ConflictClass[]): string {
  return `conflict:${[left, right].sort(compareIds).join('|')}:${normalizeSurfaceLocator(locator)}:${[...classes].sort().join('+')}`;
}

function claimsFor(task: CanonicalTask): ConflictClaim[] {
  return task.surfaces.map((surface) => ({
    taskId: task.qualifiedId,
    kind: surface.kind,
    access: surface.access,
    locator: surface.locator,
    normalizedLocator: normalizeSurfaceLocator(surface.locator),
    rationale: surface.rationale,
  }));
}

function overlap(left: ConflictClaim, right: ConflictClaim): boolean {
  return left.normalizedLocator === right.normalizedLocator
    || left.normalizedLocator.endsWith(`/${right.normalizedLocator}`)
    || right.normalizedLocator.endsWith(`/${left.normalizedLocator}`);
}

function semanticKey(claim: ConflictClaim): string | null {
  if (claim.kind === 'api-contract' || claim.kind === 'schema' || claim.kind === 'external-contract') return claim.normalizedLocator.toLocaleLowerCase('en-US');
  return null;
}

function deriveClasses(left: ConflictClaim, right: ConflictClaim): ConflictClass[] {
  const classes: ConflictClass[] = [];
  const writeLeft = left.access === 'write';
  const writeRight = right.access === 'write';
  const exclusive = left.access === 'exclusive' || right.access === 'exclusive';
  if (exclusive) classes.push('exclusive-overlap');
  if (writeLeft && writeRight) classes.push('write-write');
  else if ((writeLeft && right.access === 'read') || (writeRight && left.access === 'read')) classes.push('read-write');
  if (semanticKey(left) && semanticKey(left) === semanticKey(right) && (writeLeft || writeRight || exclusive)) classes.push('semantic-resource');
  return [...new Set(classes)].sort();
}

function isAncestor(graph: DependencyGraph, left: string, right: string): boolean {
  const queue = [left];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (normalizedTaskId(current) === normalizedTaskId(right)) return true;
    const key = normalizedTaskId(current);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...graph.edges.filter((edge) => normalizedTaskId(edge.fromId) === key).map((edge) => edge.toId));
  }
  return false;
}

/** Derive pairwise conflicts from typed claims; no dependency edge is added. */
export function deriveConflicts(tasks: readonly CanonicalTask[], graph: DependencyGraph = buildDependencyGraph(tasks)): ConflictReport {
  const ordered = [...tasks].sort((left, right) => compareIds(left.qualifiedId, right.qualifiedId));
  const conflicts: TaskConflict[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const left = ordered[i];
      const right = ordered[j];
      // An ancestor relation remains a causal dependency, but overlapping write claims are still reported.
      const leftClaims = claimsFor(left);
      const rightClaims = claimsFor(right);
      for (const leftClaim of leftClaims) {
        for (const rightClaim of rightClaims) {
          const sameSemanticResource = semanticKey(leftClaim) && semanticKey(leftClaim) === semanticKey(rightClaim);
          if (!overlap(leftClaim, rightClaim) && !sameSemanticResource) continue;
          const classes = deriveClasses(leftClaim, rightClaim);
          if (!classes.length) continue;
          const id = conflictId(left.qualifiedId, right.qualifiedId, leftClaim.normalizedLocator, classes);
          conflicts.push({
            id,
            leftTaskId: left.qualifiedId,
            rightTaskId: right.qualifiedId,
            classes,
            claims: [leftClaim, rightClaim],
            derivationRule: sameSemanticResource ? 'same normalized semantic resource plus write/exclusive access' : 'normalized locator overlap plus incompatible access',
            ...(isAncestor(graph, left.qualifiedId, right.qualifiedId) || isAncestor(graph, right.qualifiedId, left.qualifiedId) ? { suppressedBy: 'causal-precedence-does-not-forge-batch-membership' } : {}),
          });
        }
      }
    }
  }
  const unique = new Map(conflicts.map((item) => [item.id, item]));
  return { representationVersion: 'task-conflicts/v1', conflicts: [...unique.values()].sort((left, right) => left.id.localeCompare(right.id)), activeOverrides: [], expiredOverrides: [] };
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid override timestamp: ${value}`);
  return parsed;
}

export function createConflictOverride(input: Omit<ConflictOverride, 'auditEventId'>): ConflictOverride {
  if (parseTime(input.expiresAt) <= parseTime(input.createdAt)) throw new Error('conflict override expiry must be after creation');
  return { ...input, auditEventId: `audit:${input.id}:${input.createdAt}` };
}

export function applyConflictOverrides(report: ConflictReport, overrides: readonly ConflictOverride[], now: string): ConflictReport {
  const at = parseTime(now);
  const active = overrides.filter((override) => parseTime(override.createdAt) <= at && at < parseTime(override.expiresAt));
  const activeIds = new Set(active.map((override) => override.conflictId));
  const expiredIds = overrides.filter((override) => parseTime(override.expiresAt) <= at).map((override) => override.id).sort();
  return {
    ...report,
    conflicts: report.conflicts.map((conflict) => activeIds.has(conflict.id) ? { ...conflict, suppressedBy: active.find((override) => override.conflictId === conflict.id)?.id } : conflict),
    activeOverrides: active.map((override) => override.id).sort(),
    expiredOverrides: expiredIds,
  };
}

export function queryConflict(report: ConflictReport, conflictIdValue: string, overrides: readonly ConflictOverride[] = [], now = new Date(0).toISOString()): ConflictQueryResult {
  const conflict = report.conflicts.find((item) => item.id === conflictIdValue);
  const override = overrides.find((item) => item.conflictId === conflictIdValue && parseTime(item.createdAt) <= parseTime(now) && parseTime(now) < parseTime(item.expiresAt));
  return { conflict, override, suppressed: Boolean(override) };
}

export function partitionConflictFreeTasks(taskIds: readonly string[], report: ConflictReport): string[][] {
  const ordered = [...new Set(taskIds)].sort(compareIds);
  const result: string[][] = [];
  for (const taskId of ordered) {
    let placed = false;
    for (const batch of result) {
      const unsafe = batch.some((candidate) => report.conflicts.some((conflict) => {
        const pair = [conflict.leftTaskId, conflict.rightTaskId].map(normalizedTaskId);
        return pair.includes(normalizedTaskId(candidate)) && pair.includes(normalizedTaskId(taskId)) && !conflict.suppressedBy;
      }));
      if (!unsafe) {
        batch.push(taskId);
        placed = true;
        break;
      }
    }
    if (!placed) result.push([taskId]);
  }
  return result.map((batch) => batch.sort(compareIds));
}

export function conflictsFor(tasks: readonly CanonicalTask[]): ConflictReport {
  const validated = validateSurfaceClaims(tasks);
  const safeTasks = tasks.filter((task) => !validated.findings.some((finding) => finding.taskId === task.qualifiedId));
  return deriveConflicts(safeTasks);
}

export const deriveTaskConflicts = deriveConflicts;
export const partitionConflictFreeBatches = partitionConflictFreeTasks;