/**
 * Deterministic, proposal-only task discovery for task/v1.
 *
 * Discovery has no write authority. It returns a canonical proposal and a
 * stable digest; applying that proposal is a separate all-or-nothing operation
 * with duplicate, ceiling, approval, and cycle guards.
 */

import crypto from 'node:crypto';
import {
  canonicalizeTask,
  type CanonicalTask,
  type TaskDependency,
} from './task-contract.ts';

export const TASK_DISCOVERY_VERSION = 'discovery/v1' as const;

export type DiscoveryState = 'proposed' | 'no_children' | 'approval-required' | 'rejected' | 'accepted';
export type DiscoveryImpact = 'low' | 'medium' | 'high';

export interface DiscoveryLimits {
  maxChildren: number;
  maxWrites: number;
  maxScopeUnits: number;
}

export interface DiscoveryCandidate {
  semanticKey: string;
  title?: string;
  task?: Partial<CanonicalTask> & Record<string, unknown>;
  impact?: DiscoveryImpact;
  requiresApproval?: boolean;
  /** Declared paths/resources used to enforce the scope ceiling. */
  scope?: readonly string[];
  /** Declared write paths/resources used to enforce the write ceiling. */
  writes?: readonly string[];
}

export interface DiscoveryRequest {
  parent: CanonicalTask | string;
  candidates?: readonly DiscoveryCandidate[];
  limits?: Partial<DiscoveryLimits>;
  /** A caller may provide accepted digests to make replay status explicit. */
  acceptedDigests?: readonly string[];
}

export interface DiscoveryRejectedCandidate {
  semanticKey: string;
  childId: string;
  reasons: string[];
}

export interface DiscoveryProposalEdge {
  from: string;
  to: string;
  relation: TaskDependency['relation'];
}

export interface DiscoveryProposal {
  schemaVersion: typeof TASK_DISCOVERY_VERSION;
  parentId: string;
  state: DiscoveryState;
  candidateCount: number;
  children: CanonicalTask[];
  edges: DiscoveryProposalEdge[];
  rejected: DiscoveryRejectedCandidate[];
  limits: DiscoveryLimits;
  used: { children: number; writes: number; scopeUnits: number };
  highImpact: boolean;
  approvalRequired: boolean;
  noChildren: boolean;
  replayNoOp: boolean;
  digest: string;
}

export interface DiscoveryFinding {
  code:
    | 'DISCOVERY_INVALID'
    | 'DISCOVERY_PARENT_NOT_FOUND'
    | 'DISCOVERY_DUPLICATE_TASK'
    | 'DISCOVERY_DUPLICATE_EDGE'
    | 'DISCOVERY_CEILING_EXCEEDED'
    | 'DISCOVERY_APPROVAL_REQUIRED'
    | 'DISCOVERY_CYCLE'
    | 'DISCOVERY_REPLAY_NOOP';
  message: string;
  taskId?: string;
  relatedIds?: string[];
}

export interface DiscoverySnapshot {
  schemaVersion: typeof TASK_DISCOVERY_VERSION;
  tasks: CanonicalTask[];
  edges: DiscoveryProposalEdge[];
  acceptedDigests: string[];
  revision: number;
}

export interface ApplyDiscoveryOptions {
  approve?: boolean;
  dryRun?: boolean;
}

export interface ApplyDiscoveryResult {
  ok: boolean;
  committed: boolean;
  noOp: boolean;
  snapshot: DiscoverySnapshot;
  findings: DiscoveryFinding[];
}

const DEFAULT_LIMITS: DiscoveryLimits = Object.freeze({ maxChildren: 100, maxWrites: 200, maxScopeUnits: 500 });
const RELATIONS = new Set<TaskDependency['relation']>(['depends-on', 'blocks', 'consumes']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function key(value: string): string {
  return text(value).normalize('NFKC').toLocaleLowerCase('en-US');
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function slug(value: string): string {
  const result = text(value).normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return result || 'child';
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((entry) => [entry, stableValue(object[entry])]));
  }
  return value;
}

export function stableTaskDiscoveryJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function taskDiscoveryDigest(value: unknown): string {
  return crypto.createHash('sha256').update(stableTaskDiscoveryJson(value)).digest('hex');
}

export function deterministicChildTaskId(parentId: string, semanticKey: string): string {
  const parent = text(parentId);
  const semantic = text(semanticKey).normalize('NFKC');
  const suffix = taskDiscoveryDigest({ parentId: parent, semanticKey: semantic }).slice(0, 16);
  return `${parent}:child-${slug(semantic)}-${suffix}`;
}

export function defaultDiscoveryLimits(limits: Partial<DiscoveryLimits> = {}): DiscoveryLimits {
  const result: DiscoveryLimits = {
    maxChildren: limits.maxChildren ?? DEFAULT_LIMITS.maxChildren,
    maxWrites: limits.maxWrites ?? DEFAULT_LIMITS.maxWrites,
    maxScopeUnits: limits.maxScopeUnits ?? DEFAULT_LIMITS.maxScopeUnits,
  };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
  }
  return result;
}

function parentIdOf(parent: CanonicalTask | string): string {
  return typeof parent === 'string' ? text(parent) : text(parent.qualifiedId);
}

function parentTask(parent: CanonicalTask | string): CanonicalTask | undefined {
  return typeof parent === 'string' ? undefined : parent;
}

function candidateScope(candidate: DiscoveryCandidate, task?: CanonicalTask): string[] {
  return sortedUnique([
    ...(candidate.scope ?? []),
    ...(task?.surfaces ?? []).map((surface) => surface.locator),
  ]);
}

function candidateWrites(candidate: DiscoveryCandidate, task?: CanonicalTask): string[] {
  return sortedUnique([
    ...(candidate.writes ?? []),
    ...(task?.surfaces ?? []).filter((surface) => surface.access === 'write' || surface.access === 'exclusive').map((surface) => surface.locator),
  ]);
}

function parentDefaults(parent: CanonicalTask | undefined): Record<string, unknown> {
  if (!parent) {
    return {
      kind: 'implementation',
      declaredStatus: 'TODO',
      definitionRevision: 1,
      requirementLinks: [],
      acceptanceCriteriaLinks: [],
      doneWhen: [{ text: 'discovered child work has an evidence-backed completion result', order: 1, required: true }],
      dependencies: [],
      surfaces: [{ kind: 'generated-artifact', access: 'write', locator: 'task-discovery/generated', scope: 'repository', rationale: 'discovered task output' }],
      artifacts: [{ path: 'task-discovery/generated', kind: 'task', required: true }],
      evidencePolicy: { scope: 'full-suite', commands: [], requiresFresh: true, allowFiltered: false },
    };
  }
  return {
    kind: parent.kind,
    declaredStatus: 'TODO',
    definitionRevision: parent.definitionRevision,
    requirementLinks: parent.requirementLinks,
    acceptanceCriteriaLinks: parent.acceptanceCriteriaLinks,
    doneWhen: parent.doneWhen,
    dependencies: [],
    surfaces: parent.surfaces,
    artifacts: parent.artifacts,
    evidencePolicy: parent.evidencePolicy,
    sourceSpan: parent.sourceSpan,
  };
}

function childTask(parent: CanonicalTask | string, candidate: DiscoveryCandidate): { task?: CanonicalTask; childId: string; findings: DiscoveryFinding[]; scope: string[]; writes: string[] } {
  const parentId = parentIdOf(parent);
  const childId = deterministicChildTaskId(parentId, candidate.semanticKey);
  const parentShape = parentDefaults(parentTask(parent));
  const raw = candidate.task ?? {};
  const parentTaskDependencies = parentTask(parent) ? [{
    targetId: parentId,
    relation: 'depends-on' as const,
    strength: 'hard' as const,
    reason: 'discovered child is owned by its parent task',
  }] : [];
  const rawDependencies = Array.isArray(raw.dependencies) ? raw.dependencies : [];
  const hasParentDependency = rawDependencies.some((dependency) => dependency && typeof dependency === 'object' && key(text((dependency as unknown as Record<string, unknown>).targetId ?? (dependency as unknown as Record<string, unknown>).target)) === key(parentId));
  const input: Partial<CanonicalTask> & Record<string, unknown> = {
    ...parentShape,
    ...raw,
    qualifiedId: childId,
    title: text(candidate.title ?? raw.title) || `Discovered child: ${candidate.semanticKey}`,
    dependencies: hasParentDependency ? rawDependencies : [...rawDependencies, ...parentTaskDependencies],
    sourceSpan: raw.sourceSpan ?? parentTask(parent)?.sourceSpan ?? { file: '<discovery>', startLine: 1, endLine: 1 },
  };
  const sourceSpan = input.sourceSpan && typeof input.sourceSpan === 'object' ? input.sourceSpan as unknown as { file?: unknown } : undefined;
  const normalized = canonicalizeTask(input, { file: sourceSpan ? String(sourceSpan.file ?? '<discovery>') : '<discovery>' });
  const findings: DiscoveryFinding[] = normalized.findings.filter((finding) => finding.severity === 'error').map((finding) => ({
    code: 'DISCOVERY_INVALID',
    message: finding.message,
    taskId: childId,
  }));
  return { task: findings.length ? undefined : normalized.task, childId, findings, scope: candidateScope(candidate, findings.length ? undefined : normalized.task), writes: candidateWrites(candidate, findings.length ? undefined : normalized.task) };
}

function proposalPayload(proposal: Omit<DiscoveryProposal, 'digest' | 'replayNoOp' | 'state'>): unknown {
  return {
    schemaVersion: proposal.schemaVersion,
    parentId: proposal.parentId,
    candidateCount: proposal.candidateCount,
    children: proposal.children,
    edges: proposal.edges,
    rejected: proposal.rejected,
    limits: proposal.limits,
    used: proposal.used,
    highImpact: proposal.highImpact,
    approvalRequired: proposal.approvalRequired,
    noChildren: proposal.noChildren,
  };
}

function digestForProposal(proposal: Omit<DiscoveryProposal, 'digest' | 'replayNoOp' | 'state'>): string {
  return taskDiscoveryDigest(proposalPayload(proposal));
}

export function discoveryProposalDigest(proposal: Omit<DiscoveryProposal, 'digest' | 'replayNoOp' | 'state'>): string {
  return digestForProposal(proposal);
}

function edgeKey(edge: DiscoveryProposalEdge): string {
  return `${key(edge.from)}|${key(edge.to)}|${edge.relation}`;
}

function dependencyEdges(task: CanonicalTask): DiscoveryProposalEdge[] {
  return task.dependencies.filter((dependency) => RELATIONS.has(dependency.relation)).map((dependency) => ({ from: task.qualifiedId, to: dependency.targetId, relation: dependency.relation }));
}

function sortEdges(edges: readonly DiscoveryProposalEdge[]): DiscoveryProposalEdge[] {
  return [...edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
}

function hasCycle(tasks: readonly CanonicalTask[], edges: readonly DiscoveryProposalEdge[]): string[] | undefined {
  const nodes = new Set(tasks.map((task) => key(task.qualifiedId)));
  const adjacency = new Map<string, DiscoveryProposalEdge[]>();
  for (const edge of edges) {
    if (!nodes.has(key(edge.from)) || !nodes.has(key(edge.to))) continue;
    const list = adjacency.get(key(edge.from)) ?? [];
    list.push(edge);
    adjacency.set(key(edge.from), list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const trail: string[] = [];
  const visit = (id: string): string[] | undefined => {
    if (visiting.has(id)) {
      const index = trail.indexOf(id);
      return [...trail.slice(index), id];
    }
    if (visited.has(id)) return undefined;
    visiting.add(id);
    trail.push(id);
    for (const edge of adjacency.get(id) ?? []) {
      const cycle = visit(key(edge.to));
      if (cycle) return cycle;
    }
    trail.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };
  for (const id of nodes) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return undefined;
}

function cloneTask(task: CanonicalTask): CanonicalTask {
  return JSON.parse(JSON.stringify(task)) as CanonicalTask;
}

function cloneSnapshot(snapshot: DiscoverySnapshot): DiscoverySnapshot {
  return {
    schemaVersion: TASK_DISCOVERY_VERSION,
    tasks: snapshot.tasks.map(cloneTask),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    acceptedDigests: [...snapshot.acceptedDigests],
    revision: snapshot.revision,
  };
}

export function createDiscoverySnapshot(tasks: readonly CanonicalTask[] = [], edges: readonly DiscoveryProposalEdge[] = [], acceptedDigests: readonly string[] = []): DiscoverySnapshot {
  const byId = new Map<string, CanonicalTask>();
  for (const task of tasks) byId.set(key(task.qualifiedId), cloneTask(task));
  const uniqueEdges = new Map<string, DiscoveryProposalEdge>();
  for (const edge of edges) uniqueEdges.set(edgeKey(edge), { ...edge });
  return {
    schemaVersion: TASK_DISCOVERY_VERSION,
    tasks: [...byId.values()].sort((a, b) => a.qualifiedId.localeCompare(b.qualifiedId)),
    edges: sortEdges([...uniqueEdges.values()]),
    acceptedDigests: sortedUnique(acceptedDigests),
    revision: 0,
  };
}

/**
 * Discover candidate children without mutating the parent, task set, or any
 * caller-owned object.
 */
export function discoverTasks(request: DiscoveryRequest): DiscoveryProposal {
  const parentId = parentIdOf(request.parent);
  const candidates = [...(request.candidates ?? [])];
  const limits = defaultDiscoveryLimits(request.limits);
  const rejected: DiscoveryRejectedCandidate[] = [];
  const children: CanonicalTask[] = [];
  const edges: DiscoveryProposalEdge[] = [];
  const seenSemantic = new Set<string>();
  let writes = 0;
  let scopeUnits = 0;
  let highImpact = false;

  for (const candidate of candidates) {
    const semantic = text(candidate.semanticKey);
    const semanticKey = key(semantic);
    const childId = deterministicChildTaskId(parentId, semantic);
    const reasons: string[] = [];
    if (!semantic) reasons.push('semanticKey is required');
    if (seenSemantic.has(semanticKey)) reasons.push('duplicate semantic key');
    seenSemantic.add(semanticKey);
    const built = reasons.length ? { task: undefined, childId, findings: [], scope: [], writes: [] } : childTask(request.parent, candidate);
    reasons.push(...built.findings.map((finding) => finding.message));
    if (children.length >= limits.maxChildren) reasons.push(`maxChildren ceiling exceeded (${limits.maxChildren})`);
    if (writes + built.writes.length > limits.maxWrites) reasons.push(`maxWrites ceiling exceeded (${limits.maxWrites})`);
    if (scopeUnits + built.scope.length > limits.maxScopeUnits) reasons.push(`maxScopeUnits ceiling exceeded (${limits.maxScopeUnits})`);
    if (!reasons.length && built.task) {
      children.push(built.task);
      writes += built.writes.length;
      scopeUnits += built.scope.length;
      highImpact ||= candidate.impact === 'high' || candidate.requiresApproval === true;
      edges.push(...dependencyEdges(built.task));
      if (!built.task.dependencies.some((dependency) => key(dependency.targetId) === key(parentId))) {
        edges.push({ from: built.task.qualifiedId, to: parentId, relation: 'depends-on' });
      }
    } else {
      rejected.push({ semanticKey: semantic, childId, reasons: sortedUnique(reasons) });
    }
  }

  const noChildren = candidates.length === 0;
  const approvalRequired = children.length > 0 && highImpact;
  const base: Omit<DiscoveryProposal, 'digest' | 'replayNoOp' | 'state'> = {
    schemaVersion: TASK_DISCOVERY_VERSION,
    parentId,
    candidateCount: candidates.length,
    children: children.sort((a, b) => a.qualifiedId.localeCompare(b.qualifiedId)),
    edges: sortEdges([...new Map(edges.map((edge) => [edgeKey(edge), edge])).values()]),
    rejected: rejected.sort((a, b) => a.childId.localeCompare(b.childId)),
    limits,
    used: { children: children.length, writes, scopeUnits },
    highImpact,
    approvalRequired,
    noChildren,
  };
  const digest = digestForProposal(base);
  const replayNoOp = (request.acceptedDigests ?? []).some((candidate) => candidate.toLowerCase() === digest);
  let state: DiscoveryState = noChildren ? 'no_children' : children.length === 0 ? 'rejected' : approvalRequired ? 'approval-required' : 'proposed';
  if (replayNoOp) state = 'accepted';
  return { ...base, state, replayNoOp, digest };
}

function finding(code: DiscoveryFinding['code'], message: string, taskId?: string, relatedIds?: string[]): DiscoveryFinding {
  return { code, message, ...(taskId ? { taskId } : {}), ...(relatedIds?.length ? { relatedIds } : {}) };
}

/** Validate and apply a proposal as one atomic state transition. */
export function applyDiscoveryProposal(snapshot: DiscoverySnapshot, proposal: DiscoveryProposal, options: ApplyDiscoveryOptions = {}): ApplyDiscoveryResult {
  const original = cloneSnapshot(snapshot);
  const findings: DiscoveryFinding[] = [];
  if (snapshot.schemaVersion !== TASK_DISCOVERY_VERSION || proposal.schemaVersion !== TASK_DISCOVERY_VERSION) {
    findings.push(finding('DISCOVERY_INVALID', 'discovery schema version mismatch'));
    return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  }
  const expectedDigest = digestForProposal(proposal);
  if (proposal.digest !== expectedDigest) {
    findings.push(finding('DISCOVERY_INVALID', 'discovery proposal digest does not match its payload'));
    return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  }
  const expectedState: DiscoveryState = proposal.noChildren
    ? 'no_children'
    : proposal.children.length === 0
      ? 'rejected'
      : proposal.approvalRequired || proposal.highImpact
        ? 'approval-required'
        : 'proposed';
  if (!proposal.replayNoOp && proposal.state !== expectedState) {
    findings.push(finding('DISCOVERY_INVALID', `discovery proposal state ${proposal.state} does not match derived state ${expectedState}`));
    return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  }
  if (snapshot.acceptedDigests.includes(proposal.digest) || proposal.replayNoOp) {
    findings.push(finding('DISCOVERY_REPLAY_NOOP', `accepted discovery digest replayed: ${proposal.digest}`));
    return { ok: true, committed: false, noOp: true, snapshot: original, findings };
  }
  if (proposal.noChildren || proposal.state === 'no_children') return { ok: true, committed: false, noOp: true, snapshot: original, findings };
  if (proposal.state === 'approval-required' && options.approve !== true) {
    findings.push(finding('DISCOVERY_APPROVAL_REQUIRED', 'high-impact discovery awaits explicit approval'));
    return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  }
  if (proposal.state === 'rejected') {
    findings.push(finding('DISCOVERY_INVALID', 'rejected discovery proposal cannot be applied'));
    return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  }

  const parent = snapshot.tasks.find((task) => key(task.qualifiedId) === key(proposal.parentId));
  if (!parent) {
    findings.push(finding('DISCOVERY_PARENT_NOT_FOUND', `parent task is not present: ${proposal.parentId}`, proposal.parentId));
  }
  const existingIds = new Set(snapshot.tasks.map((task) => key(task.qualifiedId)));
  const proposalIds = new Set<string>();
  for (const task of proposal.children) {
    const id = key(task.qualifiedId);
    if (existingIds.has(id) || proposalIds.has(id)) findings.push(finding('DISCOVERY_DUPLICATE_TASK', `duplicate task ID: ${task.qualifiedId}`, task.qualifiedId));
    proposalIds.add(id);
  }
  const existingEdges = new Set(snapshot.edges.map(edgeKey));
  const proposalEdges = new Set<string>();
  for (const edge of proposal.edges) {
    const edgeId = edgeKey(edge);
    if (existingEdges.has(edgeId) || proposalEdges.has(edgeId)) findings.push(finding('DISCOVERY_DUPLICATE_EDGE', `duplicate discovery edge: ${edge.from} -> ${edge.to}`, undefined, [edge.from, edge.to]));
    proposalEdges.add(edgeId);
    if (!RELATIONS.has(edge.relation)) findings.push(finding('DISCOVERY_INVALID', `unsupported edge relation: ${edge.relation}`, undefined, [edge.from, edge.to]));
  }
  const nextTasks = [...snapshot.tasks.map(cloneTask), ...proposal.children.map(cloneTask)];
  const nextEdges = [...snapshot.edges.map((edge) => ({ ...edge })), ...proposal.edges.map((edge) => ({ ...edge }))];
  const endpointIds = new Set(nextTasks.map((task) => key(task.qualifiedId)));
  for (const edge of nextEdges) {
    if (!endpointIds.has(key(edge.from)) || !endpointIds.has(key(edge.to))) findings.push(finding('DISCOVERY_INVALID', `edge endpoint is not a task: ${edge.from} -> ${edge.to}`, undefined, [edge.from, edge.to]));
  }
  const cycle = hasCycle(nextTasks, nextEdges);
  if (cycle) findings.push(finding('DISCOVERY_CYCLE', `discovery dependency cycle rejected: ${cycle.join(' -> ')}`, undefined, cycle));
  if (findings.length) return { ok: false, committed: false, noOp: false, snapshot: original, findings };
  if (options.dryRun) return { ok: true, committed: false, noOp: false, snapshot: original, findings };
  const next = createDiscoverySnapshot(nextTasks, nextEdges, [...snapshot.acceptedDigests, proposal.digest]);
  next.revision = snapshot.revision + 1;
  return { ok: true, committed: true, noOp: false, snapshot: next, findings };
}

export function serializeDiscoverySnapshot(snapshot: DiscoverySnapshot): string {
  return stableTaskDiscoveryJson(snapshot);
}

export function restoreDiscoverySnapshot(serialized: string): DiscoverySnapshot {
  const parsed = JSON.parse(serialized) as DiscoverySnapshot;
  if (parsed.schemaVersion !== TASK_DISCOVERY_VERSION || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.acceptedDigests)) throw new Error('invalid discovery snapshot');
  const restored = createDiscoverySnapshot(parsed.tasks, parsed.edges, parsed.acceptedDigests);
  restored.revision = Number.isSafeInteger(parsed.revision) ? parsed.revision : 0;
  return restored;
}

export const discoverTaskChildren = discoverTasks;
export const applyTaskDiscoveryProposal = applyDiscoveryProposal;
export const deterministicDiscoveredTaskId = deterministicChildTaskId;
