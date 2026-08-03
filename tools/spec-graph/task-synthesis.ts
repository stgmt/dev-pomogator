/**
 * Deterministic pre-scheduling task synthesis (FR-80 / SPECGEN004_657..664).
 *
 * This module is the single producer for the AC/BDD vertical task records used
 * by the execution surfaces. It deliberately has no filesystem or scheduler
 * side effects: repository reality, spec ownership, and evidence are inputs;
 * the returned graph is the planning source of truth.
 */

import { createHash } from 'node:crypto';
import {
  stableTaskJson,
  type CanonicalTask,
  type DependencyStrength,
  type DependencyRelation,
  type TaskDependency,
  type TaskSurface,
  type TaskSourceSpan,
} from './task-contract.ts';

export const TASK_SYNTHESIS_VERSION = 'task-synthesis/v1' as const;
export const SYNTHESIS_AUTHORITY = 'task-synthesis' as const;

export type DomainMode = 'ddd' | 'none';
export type CausalPhase = 'RED' | 'GREEN' | 'REFACTOR';
export type SynthesisSeverity = 'error' | 'warning' | 'info';
export type LifecycleOutcome = 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_CONTEXT' | 'BLOCKED';
export type SynthesisEdgeType = DependencyRelation | 'causes' | 'owns';

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  symbol?: string;
}

export interface VerifiedBoundary {
  kind: 'domain-boundary' | 'aggregate' | 'invariant' | 'contract' | 'module' | 'adapter';
  name: string;
  verified: boolean;
  source: SourceLocation;
}

export interface InterfaceResponsibility {
  name: string;
  contract: string;
  location: SourceLocation;
  owner?: string;
  verified?: boolean;
}

export interface ImplementationSurfaceInput {
  kind: TaskSurface['kind'];
  access: TaskSurface['access'];
  locator: string;
  scope?: string;
  rationale: string;
  source?: SourceLocation;
  exactInterface?: string;
  verified?: boolean;
}

export interface RepositoryReality {
  domainBoundary?: VerifiedBoundary;
  aggregate?: VerifiedBoundary;
  invariant?: VerifiedBoundary;
  contract?: VerifiedBoundary;
  module?: VerifiedBoundary;
  adapter?: VerifiedBoundary;
  surfaces?: ImplementationSurfaceInput[];
  interfaces?: InterfaceResponsibility[];
}

export interface RequirementInput {
  id: string;
  title?: string;
  source?: SourceLocation;
}

export interface AcceptanceCriterionInput {
  id: string;
  requirementId: string;
  text?: string;
  source?: SourceLocation;
  applicable?: boolean;
}

export interface BddStepInput {
  phase: CausalPhase;
  text: string;
  estimateMinutes?: number;
  id?: string;
  bddOnly?: boolean;
}

export interface EvidenceInput {
  scenarioId: string;
  scenarioTitle?: string;
  commands: string[];
  source?: SourceLocation;
  result?: 'PASSED' | 'FAILED' | 'PENDING' | 'UNDEFINED' | 'UNKNOWN';
}

export interface AcceptanceLaneInput {
  laneId?: string;
  requirementId: string;
  acceptanceCriterionId: string;
  scenarioId: string;
  scenarioTitle?: string;
  applicable?: boolean;
  requirementSource?: SourceLocation;
  acceptanceSource?: SourceLocation;
  scenarioSource?: SourceLocation;
  evidence?: EvidenceInput;
  estimateMinutes?: number;
  doneWhen?: string | string[];
  dependencies?: Array<{
    targetId: string;
    relation?: DependencyRelation;
    strength?: DependencyStrength;
    reason: string;
  }>;
  surfaces?: ImplementationSurfaceInput[];
  interfaces?: InterfaceResponsibility[];
  bddSteps?: BddStepInput[];
  feasible?: boolean;
  blocker?: string;
}

export interface ApprovedDesign {
  revision: number;
  digest: string;
  source: SourceLocation;
  approved: boolean;
  ownership?: string;
}

export interface SynthesisInput {
  requirements?: RequirementInput[];
  acceptanceCriteria?: AcceptanceCriterionInput[];
  acceptanceLanes: AcceptanceLaneInput[];
  design?: ApprovedDesign;
  repositoryReality: RepositoryReality;
  responsibilityMap?: InterfaceResponsibility[];
}

export interface SynthesisBoundary {
  kind: VerifiedBoundary['kind'];
  name: string;
  source: SourceLocation;
}

export interface SynthesisCausalStep {
  id: string;
  phase: CausalPhase;
  text: string;
  estimateMinutes: number;
  bddOnly: true;
  schedulable: false;
}

export interface SynthesisCausalEdge {
  from: string;
  to: string;
  type: 'causes';
  phase: `${CausalPhase}->${CausalPhase}`;
  laneId: string;
}

export interface SynthesisOwnership {
  laneId: string;
  owner: typeof SYNTHESIS_AUTHORITY;
  requirementId: string;
  acceptanceCriterionId: string;
  scenarioId: string;
}

export interface SynthesisTask extends CanonicalTask {
  synthesisVersion: typeof TASK_SYNTHESIS_VERSION;
  laneId: string;
  domainMode: DomainMode;
  boundaries: SynthesisBoundary[];
  domainEntities: string[];
  ownership: SynthesisOwnership;
  sourceLocations: {
    requirement: SourceLocation;
    acceptanceCriterion: SourceLocation;
    scenario: SourceLocation;
    design?: SourceLocation;
    interfaces: SourceLocation[];
  };
  interfaces: InterfaceResponsibility[];
  scenario: EvidenceInput;
  evidence: EvidenceInput;
  causalSteps: SynthesisCausalStep[];
  causalEdges: SynthesisCausalEdge[];
  blockers: string[];
  infeasible: boolean;
  brief: string;
}

export interface SynthesisEdge {
  from: string;
  to: string;
  type: SynthesisEdgeType;
  reason?: string;
  laneId?: string;
}

export interface LaneOwnership {
  laneId: string;
  taskId: string;
  requirementId: string;
  acceptanceCriterionId: string;
  scenarioId: string;
}

export type SynthesisFindingCode =
  | 'PLACEHOLDER_TASK'
  | 'UNCONSERVED_ACCEPTANCE_LANE'
  | 'MISSING_OWNERSHIP'
  | 'MISSING_EXACT_INTERFACE'
  | 'INFEASIBLE_WORK'
  | 'UNTYPED_CAUSAL_EDGE'
  | 'CYCLIC_CAUSAL_EDGE'
  | 'REORDERED_CAUSAL_EDGE'
  | 'INCOMPLETE_SURFACES'
  | 'DUPLICATE_ACCEPTANCE_LANE'
  | 'MISSING_SOURCE_CLAIM'
  | 'UNKNOWN_IMPLEMENTATION_SURFACE'
  | 'DESIGN_NOT_APPROVED'
  | 'DESIGN_DIGEST_MISSING'
  | 'MISSING_REQUIREMENT_REGISTRY'
  | 'MISSING_ACCEPTANCE_REGISTRY'
  | 'UNKNOWN_REQUIREMENT_REFERENCE'
  | 'UNKNOWN_ACCEPTANCE_REFERENCE'
  | 'AC_REQUIREMENT_MISMATCH'
  | 'INAPPLICABLE_ACCEPTANCE_REFERENCE'
  | 'UNRESOLVED_DEPENDENCY'
  | 'BLANK_CAUSAL_STEP_TEXT';

export interface SynthesisFinding {
  code: SynthesisFindingCode;
  severity: SynthesisSeverity;
  message: string;
  laneId?: string;
  taskId?: string;
  source?: SourceLocation;
}

export interface SynthesisGraph {
  representationVersion: typeof TASK_SYNTHESIS_VERSION;
  authority: typeof SYNTHESIS_AUTHORITY;
  revision: string;
  domainMode: DomainMode;
  tasks: SynthesisTask[];
  edges: SynthesisEdge[];
  laneOwnership: LaneOwnership[];
  expectedLaneIds: string[];
}

export interface SynthesisReview {
  accepted: boolean;
  findings: SynthesisFinding[];
}

export interface SynthesisResult {
  representationVersion: typeof TASK_SYNTHESIS_VERSION;
  authority: typeof SYNTHESIS_AUTHORITY;
  domainMode: DomainMode;
  graph: SynthesisGraph;
  /** Alias for consumers that call the stored graph the planning input. */
  planningGraph: SynthesisGraph;
  tasks: SynthesisTask[];
  findings: SynthesisFinding[];
  review: SynthesisReview;
  accepted: boolean;
}

export interface TaskPairwiseProof {
  leftTaskId: string;
  rightTaskId: string;
  causalPathLeftToRight: string[];
  causalPathRightToLeft: string[];
  conflictPair: { locator: string; reason: string } | null;
  proof: {
    noCausalPathEitherDirection: boolean;
    noConflictPair: boolean;
  };
  safe: boolean;
}

export interface SafeBatch {
  id: string;
  taskIds: string[];
  pairwiseProofs: TaskPairwiseProof[];
  safe: boolean;
}

export interface TaskBrief {
  taskId: string;
  title: string;
  fullTaskText: string;
  requirementId: string;
  acceptanceCriterionId: string;
  scenario: EvidenceInput;
  exactSourceLocations: SynthesisTask['sourceLocations'];
  interfaces: InterfaceResponsibility[];
  dependencies: TaskDependency[];
  predecessorSummaries: Array<{ taskId: string; title: string; reason: string }>;
  evidenceCommands: string[];
  safeBatchId?: string;
  blockers: string[];
  machineNextAction: string;
  proofOfIndependence: TaskPairwiseProof[];
}

export interface TaskPlanResult {
  representationVersion: typeof TASK_SYNTHESIS_VERSION;
  authority: typeof SYNTHESIS_AUTHORITY;
  graphRevision: string;
  accepted: boolean;
  briefs: TaskBrief[];
  batches: SafeBatch[];
  pairwiseProofs: TaskPairwiseProof[];
  findings: SynthesisFinding[];
  secondPlanAuthority: false;
  executor: null;
}

export interface LifecycleResult {
  taskId: string;
  outcome: LifecycleOutcome;
  completes: boolean;
  diagnostics: string[];
  followUpProposals: string[];
}

const PHASES: readonly CausalPhase[] = ['RED', 'GREEN', 'REFACTOR'];
const PLACEHOLDER_RE = /(?:\b(?:todo|tbd|placeholder|fill\s+me|unknown)\b|<[^>]+>)/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim();
}

function key(value: string): string {
  return normalized(value).toLocaleLowerCase('en-US');
}

function source(value: SourceLocation | undefined, fallbackFile: string, fallbackLine: number): SourceLocation {
  return {
    file: text(value?.file) || fallbackFile,
    line: Number.isSafeInteger(value?.line) && (value?.line ?? 0) > 0 ? Number(value!.line) : fallbackLine,
    ...(Number.isSafeInteger(value?.column) && (value?.column ?? 0) > 0 ? { column: Number(value!.column) } : {}),
    ...(text(value?.symbol) ? { symbol: text(value!.symbol) } : {}),
  };
}

function sourceSpan(location: SourceLocation, endLine = location.line): TaskSourceSpan {
  return { file: location.file, startLine: location.line, endLine };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en-US');
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))].sort(compareText);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort(compareText).map((name) => [name, stableValue(object[name])]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function finding(
  code: SynthesisFindingCode,
  message: string,
  laneId?: string,
  taskId?: string,
  sourceLocation?: SourceLocation,
  severity: SynthesisSeverity = 'error',
): SynthesisFinding {
  return { code, severity, message, ...(laneId ? { laneId } : {}), ...(taskId ? { taskId } : {}), ...(sourceLocation ? { source: sourceLocation } : {}) };
}

function findingKey(item: SynthesisFinding): string {
  return [item.code, item.laneId ?? '', item.taskId ?? '', item.message].join('|');
}

function sortedFindings(items: readonly SynthesisFinding[]): SynthesisFinding[] {
  const unique = new Map<string, SynthesisFinding>();
  for (const item of items) unique.set(findingKey(item), item);
  return [...unique.values()].sort((a, b) =>
    compareText(a.code, b.code) || compareText(a.laneId ?? '', b.laneId ?? '') || compareText(a.taskId ?? '', b.taskId ?? '') || compareText(a.message, b.message));
}

function claimList(reality: RepositoryReality, mode: DomainMode): SynthesisBoundary[] {
  const claims = mode === 'ddd'
    ? [reality.domainBoundary, reality.aggregate, reality.invariant, reality.contract]
    : [reality.module, reality.adapter, reality.contract];
  return claims.filter((item): item is VerifiedBoundary => Boolean(item?.name && item.verified)).map((item) => ({
    kind: item.kind,
    name: normalized(item.name),
    source: source(item.source, '<repository-reality>', 1),
  }));
}

function hasVerifiedDddReality(reality: RepositoryReality): boolean {
  return Boolean(reality.domainBoundary?.verified && reality.aggregate?.verified && reality.invariant?.verified && reality.contract?.verified);
}

function normalizeSurface(item: ImplementationSurfaceInput, index: number): ImplementationSurfaceInput {
  return {
    kind: item.kind,
    access: item.access,
    locator: normalized(item.locator),
    scope: normalized(item.scope ?? 'repository'),
    rationale: text(item.rationale) || 'repository-verified implementation surface',
    ...(item.source ? { source: source(item.source, '<repository-reality>', index + 1) } : {}),
    ...(text(item.exactInterface) ? { exactInterface: text(item.exactInterface) } : {}),
    verified: item.verified !== false,
  };
}

function taskSurface(item: ImplementationSurfaceInput): TaskSurface {
  return {
    kind: item.kind,
    access: item.access,
    locator: item.locator,
    scope: item.scope ?? 'repository',
    rationale: item.rationale,
  };
}

function normalizeInterface(item: InterfaceResponsibility, index: number): InterfaceResponsibility {
  return {
    name: normalized(item.name),
    contract: normalized(item.contract),
    location: source(item.location, '<interface-map>', index + 1),
    ...(text(item.owner) ? { owner: text(item.owner) } : {}),
    verified: item.verified !== false,
  };
}

function normalizedSteps(lane: AcceptanceLaneInput, laneKey: string, scenarioTitle: string): SynthesisCausalStep[] {
  const supplied = lane.bddSteps ?? [];
  const sourceSteps: BddStepInput[] = supplied.length > 0
    ? supplied
    : [
      { phase: 'RED', text: `Write the failing BDD scenario for ${scenarioTitle}`, estimateMinutes: 2 },
      { phase: 'GREEN', text: `Implement the smallest behavior that passes ${scenarioTitle}`, estimateMinutes: 3 },
      { phase: 'REFACTOR', text: `Refactor the passing ${scenarioTitle} slice without changing behavior`, estimateMinutes: 2 },
    ];
  return sourceSteps.map((item, index) => ({
    id: normalized(item.id ?? `${laneKey}:bdd:${item.phase.toLowerCase()}`),
    phase: item.phase,
    text: text(item.text),
    estimateMinutes: Number.isFinite(item.estimateMinutes) ? Number(item.estimateMinutes) : 0,
    bddOnly: true as const,
    schedulable: false as const,
  })).sort((a, b) => (PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase)) || compareText(a.id, b.id)).map((item, index) => ({
    ...item,
    id: item.id || `${laneKey}:bdd:${index + 1}`,
  }));
}

function normalizedEvidence(lane: AcceptanceLaneInput, fallbackSource: SourceLocation): EvidenceInput {
  const evidence = lane.evidence ?? {
    scenarioId: lane.scenarioId,
    scenarioTitle: lane.scenarioTitle,
    commands: [],
    source: lane.scenarioSource,
  };
  return {
    scenarioId: normalized(evidence.scenarioId || lane.scenarioId),
    ...(text(evidence.scenarioTitle ?? lane.scenarioTitle) ? { scenarioTitle: text(evidence.scenarioTitle ?? lane.scenarioTitle) } : {}),
    commands: uniqueSorted(evidence.commands ?? []),
    source: source(evidence.source ?? fallbackSource, fallbackSource.file, fallbackSource.line),
    ...(evidence.result ? { result: evidence.result } : {}),
  };
}

function doneWhenValues(lane: AcceptanceLaneInput, acId: string, scenario: EvidenceInput): Array<{ text: string; order: number; required: boolean }> {
  const raw = Array.isArray(lane.doneWhen) ? lane.doneWhen : typeof lane.doneWhen === 'string' ? [lane.doneWhen] : [];
  const values = raw.map(text).filter(Boolean);
  if (values.length === 0) values.push(`${acId} scenario ${scenario.scenarioId} passes with its evidence command`);
  return values.map((item, index) => ({ text: item, order: index + 1, required: true }));
}

function canonicalId(laneId: string): string {
  return `spec-generator-v4:task-synthesis:${laneId}`;
}

function taskBrief(task: SynthesisTask): string {
  return [
    `Task ${task.qualifiedId}: ${task.title}`,
    `Owns lane ${task.laneId} (${task.ownership.requirementId} / ${task.ownership.acceptanceCriterionId} / ${task.ownership.scenarioId}).`,
    `Mode: ${task.domainMode}. Boundaries: ${task.boundaries.map((item) => `${item.kind}=${item.name}`).join(', ') || 'none'}.`,
    `Exact interfaces: ${task.interfaces.map((item) => `${item.name} @ ${item.location.file}:${item.location.line}`).join(', ') || 'none'}.`,
    `BDD-only steps: ${task.causalSteps.map((item) => `${item.phase}(${item.estimateMinutes}m): ${item.text}`).join(' -> ')}.`,
    `Evidence: ${task.evidence.commands.join(' ; ') || 'scenario evidence required'}.`,
    `Surfaces: ${task.surfaces.map((item) => `${item.access} ${item.locator}`).join(', ')}.`,
    `Next action: ${task.blockers.length > 0 ? task.blockers[0] : 'execute RED, GREEN, REFACTOR in order and attach evidence'}.`,
  ].join('\n');
}

function surfaceForBlocked(laneKey: string): ImplementationSurfaceInput[] {
  return [{
    kind: 'file',
    access: 'exclusive',
    locator: `investigations/${laneKey}/unknown-implementation-surface.md`,
    scope: 'repository',
    rationale: 'named investigation owns the unknown implementation surface',
    verified: true,
  }];
}

function hasAllAccesses(surfaces: readonly TaskSurface[]): boolean {
  const accesses = new Set(surfaces.map((item) => item.access));
  return accesses.has('read') && accesses.has('write') && accesses.has('exclusive');
}

function causalEdgesFor(task: Pick<SynthesisTask, 'causalSteps' | 'laneId'>): SynthesisCausalEdge[] {
  const edges: SynthesisCausalEdge[] = [];
  for (let index = 0; index < task.causalSteps.length - 1; index += 1) {
    const from = task.causalSteps[index];
    const to = task.causalSteps[index + 1];
    edges.push({ from: from.id, to: to.id, type: 'causes', phase: `${from.phase}->${to.phase}`, laneId: task.laneId });
  }
  return edges;
}

function laneInputSource(lane: AcceptanceLaneInput, index: number, field: 'requirementSource' | 'acceptanceSource' | 'scenarioSource'): SourceLocation {
  return source(lane[field], `.specs/spec-generator-v4/${field.replace('Source', '')}.md`, index + 1);
}

function isValidSurface(item: ImplementationSurfaceInput): boolean {
  return Boolean(item.verified !== false && item.locator && item.rationale && item.scope);
}

function sourceClaimFindings(lane: AcceptanceLaneInput, laneId: string, index: number): SynthesisFinding[] {
  const result: SynthesisFinding[] = [];
  if (!text(lane.requirementId)) result.push(finding('MISSING_SOURCE_CLAIM', 'requirement source claim is missing', laneId, undefined, laneInputSource(lane, index, 'requirementSource')));
  if (!text(lane.acceptanceCriterionId)) result.push(finding('MISSING_SOURCE_CLAIM', 'acceptance-criterion source claim is missing', laneId, undefined, laneInputSource(lane, index, 'acceptanceSource')));
  if (!text(lane.scenarioId)) result.push(finding('MISSING_SOURCE_CLAIM', 'BDD scenario source claim is missing', laneId, undefined, laneInputSource(lane, index, 'scenarioSource')));
  return result;
}

function makeTask(
  lane: AcceptanceLaneInput,
  laneId: string,
  index: number,
  input: SynthesisInput,
  mode: DomainMode,
  boundaries: SynthesisBoundary[],
  initialFindings: SynthesisFinding[],
): SynthesisTask {
  const requirementId = normalized(lane.requirementId || 'UNKNOWN-REQUIREMENT');
  const acId = normalized(lane.acceptanceCriterionId || `UNKNOWN-AC-${index + 1}`);
  const scenarioId = normalized(lane.scenarioId || `UNKNOWN-SCENARIO-${index + 1}`);
  const reqSource = laneInputSource(lane, index, 'requirementSource');
  const acSource = laneInputSource(lane, index, 'acceptanceSource');
  const scenarioSource = laneInputSource(lane, index, 'scenarioSource');
  const scenario = normalizedEvidence(lane, scenarioSource);
  const realitySurfaces = (lane.surfaces ?? input.repositoryReality.surfaces ?? []).map(normalizeSurface).filter(isValidSurface);
  const unknownSurface = realitySurfaces.length === 0;
  const surfacesInput = unknownSurface ? surfaceForBlocked(laneId) : realitySurfaces;
  const surfaces = surfacesInput.map(taskSurface);
  const interfaceInputs = (lane.interfaces ?? input.responsibilityMap ?? input.repositoryReality.interfaces ?? []).map(normalizeInterface).filter((item) => Boolean(item.name && item.contract && item.verified));
  const causalSteps = normalizedSteps(lane, laneId, scenario.scenarioTitle ?? scenarioId);
  const causalEdges = causalEdgesFor({ causalSteps, laneId });
  const blockers = [...(text(lane.blocker) ? [text(lane.blocker)] : []), ...(unknownSurface ? [`No repository-verified implementation surface owns acceptance lane ${laneId}`] : [])];
  const status: CanonicalTask['declaredStatus'] = unknownSurface || lane.feasible === false ? 'BLOCKED' : 'READY';
  if (unknownSurface) initialFindings.push(finding('UNKNOWN_IMPLEMENTATION_SURFACE', `unknown implementation surface; BLOCKED investigation owns lane ${laneId}`, laneId, canonicalId(laneId), scenarioSource));
  if (lane.feasible === false) initialFindings.push(finding('INFEASIBLE_WORK', `lane ${laneId} is marked infeasible`, laneId, canonicalId(laneId), scenarioSource));
  const ownership: SynthesisOwnership = { laneId, owner: SYNTHESIS_AUTHORITY, requirementId, acceptanceCriterionId: acId, scenarioId };
  const sourceLocations = {
    requirement: reqSource,
    acceptanceCriterion: acSource,
    scenario: scenarioSource,
    ...(input.design ? { design: source(input.design.source, '<design>', input.design.revision) } : {}),
    interfaces: interfaceInputs.map((item) => item.location),
  };
  const dependencies: TaskDependency[] = [...(lane.dependencies ?? [])].map((item) => ({
    targetId: normalized(item.targetId),
    relation: item.relation ?? 'depends-on',
    strength: item.strength ?? 'hard',
    reason: text(item.reason) || 'typed predecessor relation',
  })).filter((item) => item.targetId && item.reason).sort((a, b) => compareText(a.targetId, b.targetId) || compareText(a.relation, b.relation) || compareText(a.reason, b.reason));
  const taskId = canonicalId(laneId);
  const task: SynthesisTask = {
    representationVersion: 'task/v1',
    qualifiedId: taskId,
    title: `${mode === 'ddd' ? 'DDD' : 'Infrastructure'} vertical slice ${acId}`,
    kind: status === 'BLOCKED' ? 'investigation' : 'implementation',
    definitionRevision: input.design?.revision ?? 1,
    declaredStatus: status,
    estimateMinutes: Number.isFinite(lane.estimateMinutes) && (lane.estimateMinutes ?? 0) > 0 ? Number(lane.estimateMinutes) : causalSteps.reduce((sum, item) => sum + item.estimateMinutes, 0),
    requirementLinks: [{ id: requirementId, kind: 'requirement', source: requirementId }],
    acceptanceCriteriaLinks: [{ id: acId, kind: 'acceptance-criterion', source: acId }],
    doneWhen: doneWhenValues(lane, acId, scenario),
    dependencies,
    surfaces,
    artifacts: surfaces.filter((item) => item.access !== 'read').map((item) => ({ path: item.locator, kind: item.kind, required: true })),
    evidencePolicy: { scope: 'scenario', commands: scenario.commands, requiresFresh: true, allowFiltered: false },
    unknownFields: {
      authority: SYNTHESIS_AUTHORITY,
      laneId,
      domainMode: mode,
      ...(input.design ? { designRevision: input.design.revision, designDigest: input.design.digest } : {}),
    },
    comments: ['BDD-only RED -> GREEN -> REFACTOR steps are embedded instructions, not schedulable graph nodes.'],
    sourceSpan: sourceSpan(reqSource),
    synthesisVersion: TASK_SYNTHESIS_VERSION,
    laneId,
    domainMode: mode,
    boundaries,
    domainEntities: [],
    ownership,
    sourceLocations,
    interfaces: interfaceInputs,
    scenario,
    evidence: scenario,
    causalSteps,
    causalEdges,
    blockers,
    infeasible: lane.feasible === false,
    brief: '',
  };
  task.brief = taskBrief(task);
  if (!hasAllAccesses(task.surfaces) && status !== 'BLOCKED') initialFindings.push(finding('INCOMPLETE_SURFACES', `lane ${laneId} must declare read, write, and exclusive surfaces`, laneId, taskId, scenarioSource));
  return task;
}

function cyclePath(edges: readonly { from: string; to: string }[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (node: string): string[] | null => {
    if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (visited.has(node)) return null;
    visiting.add(node);
    path.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const result = visit(next);
      if (result) return result;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };
  for (const node of new Set([...adjacency.keys(), ...[...adjacency.values()].flat()])) {
    const result = visit(node);
    if (result) return result;
  }
  return null;
}

function reviewTask(task: SynthesisTask): SynthesisFinding[] {
  const result: SynthesisFinding[] = [];
  const taskSource = task.sourceLocations.scenario;
  const titleText = [task.title, task.brief, ...task.doneWhen.map((item) => item.text), ...task.causalSteps.map((item) => item.text)].join(' ');
  if (PLACEHOLDER_RE.test(titleText)) result.push(finding('PLACEHOLDER_TASK', `placeholder text remains in task ${task.qualifiedId}`, task.laneId, task.qualifiedId, taskSource));
  if (
    !task.ownership?.laneId ||
    task.ownership.laneId !== task.laneId ||
    task.ownership.owner !== SYNTHESIS_AUTHORITY ||
    !task.ownership.requirementId ||
    !task.ownership.acceptanceCriterionId ||
    !task.ownership.scenarioId
  ) {
    result.push(finding('MISSING_OWNERSHIP', `task ${task.qualifiedId} has no complete acceptance-lane ownership`, task.laneId, task.qualifiedId, taskSource));
  }
  const exactInterfaces = task.interfaces.filter((item) => item.name && item.contract && item.verified !== false && item.location.file && item.location.line > 0);
  if (task.declaredStatus !== 'BLOCKED' && exactInterfaces.length === 0) result.push(finding('MISSING_EXACT_INTERFACE', `task ${task.qualifiedId} has no exact verified interface location`, task.laneId, task.qualifiedId, taskSource));
  if (task.infeasible || task.estimateMinutes <= 0 || task.causalSteps.some((item) => item.estimateMinutes < 2 || item.estimateMinutes > 5)) result.push(finding('INFEASIBLE_WORK', `task ${task.qualifiedId} has infeasible estimate or work`, task.laneId, task.qualifiedId, taskSource));
  if (task.declaredStatus !== 'BLOCKED' && !hasAllAccesses(task.surfaces)) result.push(finding('INCOMPLETE_SURFACES', `task ${task.qualifiedId} lacks read/write/exclusive surface claims`, task.laneId, task.qualifiedId, taskSource));
  if (task.causalSteps.some((item) => !text(item.text))) result.push(finding('BLANK_CAUSAL_STEP_TEXT', `task ${task.qualifiedId} contains blank RED/GREEN/REFACTOR work`, task.laneId, task.qualifiedId, taskSource));
  const stepById = new Map(task.causalSteps.map((item) => [item.id, item]));
  const causalEdges = task.causalEdges as Array<Partial<SynthesisCausalEdge> & { from?: string; to?: string }>;
  if (causalEdges.some((edge) => edge.type !== 'causes' || !edge.from || !edge.to || !edge.phase)) result.push(finding('UNTYPED_CAUSAL_EDGE', `task ${task.qualifiedId} contains an untyped causal edge`, task.laneId, task.qualifiedId, taskSource));
  const phaseEdges = causalEdges.filter((edge): edge is SynthesisCausalEdge => Boolean(edge.from && edge.to && edge.type === 'causes'));
  const causalCycle = cyclePath(phaseEdges);
  if (causalCycle) result.push(finding('CYCLIC_CAUSAL_EDGE', `task ${task.qualifiedId} contains causal cycle ${causalCycle.join(' -> ')}`, task.laneId, task.qualifiedId, taskSource));
  const expectedEdges = task.causalSteps.slice(0, -1).map((from, index) => {
    const to = task.causalSteps[index + 1];
    return { from: from.id, to: to.id, phase: `${from.phase}->${to.phase}` };
  });
  if (
    task.causalSteps.map((item) => item.phase).join('->') !== PHASES.join('->') ||
    phaseEdges.length !== expectedEdges.length ||
    phaseEdges.some((edge, index) => {
      const expected = expectedEdges[index];
      return !expected || edge.laneId !== task.laneId || edge.from !== expected.from || edge.to !== expected.to || edge.phase !== expected.phase || !stepById.has(edge.from) || !stepById.has(edge.to);
    })
  ) {
    result.push(finding('REORDERED_CAUSAL_EDGE', `task ${task.qualifiedId} does not preserve RED -> GREEN -> REFACTOR causal order`, task.laneId, task.qualifiedId, taskSource));
  }
  return result;
}

export function reviewSynthesis(input: SynthesisResult | SynthesisGraph): SynthesisReview {
  const graph = 'graph' in input ? input.graph : input;
  const initial = 'graph' in input ? input.findings : [];
  const findings: SynthesisFinding[] = [...initial];
  const counts = new Map<string, number>();
  const taskById = new Map(graph.tasks.map((task) => [task.qualifiedId, task]));
  for (const ownership of graph.laneOwnership) {
    const laneKey = key(ownership.laneId);
    const task = taskById.get(ownership.taskId);
    const validOwnership = Boolean(
      task &&
      key(task.laneId) === laneKey &&
      task.ownership.laneId === task.laneId &&
      ownership.requirementId === task.ownership.requirementId &&
      ownership.acceptanceCriterionId === task.ownership.acceptanceCriterionId &&
      ownership.scenarioId === task.ownership.scenarioId,
    );
    if (validOwnership) counts.set(laneKey, (counts.get(laneKey) ?? 0) + 1);
    else findings.push(finding('MISSING_OWNERSHIP', `acceptance lane ${ownership.laneId} has an invalid ownership record`, ownership.laneId, ownership.taskId));
  }
  for (const laneId of graph.expectedLaneIds) {
    const count = counts.get(key(laneId)) ?? 0;
    if (count !== 1) findings.push(finding('UNCONSERVED_ACCEPTANCE_LANE', `acceptance lane ${laneId} has ${count} valid owners; expected exactly one`, laneId));
    if (count === 0) findings.push(finding('MISSING_OWNERSHIP', `acceptance lane ${laneId} has no valid task owner`, laneId));
  }
  for (const [laneKey, count] of counts) {
    if (!graph.expectedLaneIds.some((laneId) => key(laneId) === laneKey)) findings.push(finding('UNCONSERVED_ACCEPTANCE_LANE', `unexpected acceptance lane owner ${laneKey} is not in the source lanes`, laneKey));
    if (count > 1) findings.push(finding('UNCONSERVED_ACCEPTANCE_LANE', `acceptance lane ${laneKey} has duplicate ownership`, laneKey));
  }
  const taskIds = new Set(graph.tasks.map((task) => key(task.qualifiedId)));
  for (const task of graph.tasks) {
    findings.push(...reviewTask(task));
    for (const dependency of task.dependencies) {
      if (!taskIds.has(key(dependency.targetId))) findings.push(finding('UNRESOLVED_DEPENDENCY', `task ${task.qualifiedId} depends on unresolved synthesized task ${dependency.targetId}`, task.laneId, task.qualifiedId, task.sourceLocations.scenario));
    }
  }
  return { accepted: sortedFindings(findings).every((item) => item.severity !== 'error'), findings: sortedFindings(findings) };
}

export function synthesizeTasks(input: SynthesisInput): SynthesisResult {
  const reality = input.repositoryReality ?? {};
  const mode: DomainMode = hasVerifiedDddReality(reality) ? 'ddd' : 'none';
  const boundaries = claimList(reality, mode);
  const findings: SynthesisFinding[] = [];
  if (input.design && !input.design.approved) findings.push(finding('DESIGN_NOT_APPROVED', 'approved design revision is required before task synthesis'));
  if (input.design && !text(input.design.digest)) findings.push(finding('DESIGN_DIGEST_MISSING', 'approved design digest is required for task synthesis'));
  const requirementRegistry = new Map((input.requirements ?? []).map((item) => [key(item.id), item]));
  const acceptanceRegistry = new Map((input.acceptanceCriteria ?? []).map((item) => [key(item.id), item]));
  if (!input.requirements?.length) findings.push(finding('MISSING_REQUIREMENT_REGISTRY', 'strict task synthesis requires a non-empty requirement registry'));
  if (!input.acceptanceCriteria?.length) findings.push(finding('MISSING_ACCEPTANCE_REGISTRY', 'strict task synthesis requires a non-empty acceptance-criteria registry'));
  const applicable = input.acceptanceLanes.filter((lane) => lane.applicable !== false);
  for (const [index, lane] of applicable.entries()) {
    const laneId = normalized(lane.laneId || `${lane.requirementId}:${lane.acceptanceCriterionId}` || `lane-${index + 1}`);
    const requirement = requirementRegistry.get(key(lane.requirementId));
    const acceptance = acceptanceRegistry.get(key(lane.acceptanceCriterionId));
    if (!requirement) findings.push(finding('UNKNOWN_REQUIREMENT_REFERENCE', `lane ${laneId} references unknown requirement ${lane.requirementId}`, laneId, undefined, laneInputSource(lane, index, 'requirementSource')));
    if (!acceptance) findings.push(finding('UNKNOWN_ACCEPTANCE_REFERENCE', `lane ${laneId} references unknown acceptance criterion ${lane.acceptanceCriterionId}`, laneId, undefined, laneInputSource(lane, index, 'acceptanceSource')));
    if (acceptance && key(acceptance.requirementId) !== key(lane.requirementId)) findings.push(finding('AC_REQUIREMENT_MISMATCH', `acceptance criterion ${lane.acceptanceCriterionId} belongs to ${acceptance.requirementId}, not ${lane.requirementId}`, laneId, undefined, laneInputSource(lane, index, 'acceptanceSource')));
    if (acceptance?.applicable === false) findings.push(finding('INAPPLICABLE_ACCEPTANCE_REFERENCE', `lane ${laneId} references inapplicable acceptance criterion ${lane.acceptanceCriterionId}`, laneId, undefined, laneInputSource(lane, index, 'acceptanceSource')));
  }
  const expectedLaneIds: string[] = [];
  const seenLaneIds = new Set<string>();
  const tasks: SynthesisTask[] = [];
  const edges: SynthesisEdge[] = [];
  for (const [index, lane] of applicable.entries()) {
    const laneId = normalized(lane.laneId || `${lane.requirementId}:${lane.acceptanceCriterionId}` || `lane-${index + 1}`);
    const normalizedLaneKey = key(laneId);
    if (seenLaneIds.has(normalizedLaneKey)) {
      findings.push(finding('DUPLICATE_ACCEPTANCE_LANE', `duplicate acceptance lane ${laneId} was not scheduled twice`, laneId));
      continue;
    }
    seenLaneIds.add(normalizedLaneKey);
    expectedLaneIds.push(laneId);
    findings.push(...sourceClaimFindings(lane, laneId, index));
    const task = makeTask(lane, laneId, index, input, mode, boundaries, findings);
    tasks.push(task);
    edges.push({ from: task.qualifiedId, to: task.laneId, type: 'owns', laneId: task.laneId });
    for (const dependency of task.dependencies) edges.push({ from: task.qualifiedId, to: dependency.targetId, type: dependency.relation as SynthesisEdgeType, reason: dependency.reason, laneId: task.laneId });
  }
  const taskIds = new Set(tasks.map((task) => key(task.qualifiedId)));
  const laneTaskIds = new Map(tasks.map((task) => [key(task.laneId), task.qualifiedId]));
  for (const task of tasks) {
    task.dependencies = task.dependencies.map((dependency) => ({
      ...dependency,
      targetId: laneTaskIds.get(key(dependency.targetId)) ?? dependency.targetId,
    }));
    for (const dependency of task.dependencies) {
      if (!taskIds.has(key(dependency.targetId))) findings.push(finding('UNRESOLVED_DEPENDENCY', `task ${task.qualifiedId} depends on unresolved synthesized task ${dependency.targetId}`, task.laneId, task.qualifiedId, task.sourceLocations.scenario));
    }
  }
  const normalizedEdges = [
    ...edges.filter((edge) => edge.type === 'owns'),
    ...tasks.flatMap((task) => task.dependencies.map((dependency) => ({
      from: task.qualifiedId,
      to: dependency.targetId,
      type: dependency.relation as SynthesisEdgeType,
      reason: dependency.reason,
      laneId: task.laneId,
    }))),
  ];
  const laneOwnership = tasks.map((task) => ({ laneId: task.laneId, taskId: task.qualifiedId, requirementId: task.ownership.requirementId, acceptanceCriterionId: task.ownership.acceptanceCriterionId, scenarioId: task.ownership.scenarioId }));
  const graphWithoutRevision: Omit<SynthesisGraph, 'revision'> = {
    representationVersion: TASK_SYNTHESIS_VERSION,
    authority: SYNTHESIS_AUTHORITY,
    domainMode: mode,
    tasks: [...tasks].sort((a, b) => compareText(a.qualifiedId, b.qualifiedId)),
    edges: normalizedEdges.sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to) || compareText(a.type, b.type)),
    laneOwnership: [...laneOwnership].sort((a, b) => compareText(a.laneId, b.laneId)),
    expectedLaneIds: [...expectedLaneIds],
  };
  const graph: SynthesisGraph = { ...graphWithoutRevision, revision: digest(graphWithoutRevision) };
  const draft: SynthesisResult = {
    representationVersion: TASK_SYNTHESIS_VERSION,
    authority: SYNTHESIS_AUTHORITY,
    domainMode: mode,
    graph,
    planningGraph: graph,
    tasks: graph.tasks,
    findings: sortedFindings(findings),
    review: { accepted: false, findings: [] },
    accepted: false,
  };
  const review = reviewSynthesis(draft);
  return { ...draft, findings: review.findings, review, accepted: review.accepted };
}

export const synthesizeTaskPlan = synthesizeTasks;
export const deterministicPreSchedulingSynthesis = synthesizeTasks;

export function stableSynthesisJson(value: SynthesisResult | SynthesisGraph | SynthesisTask | readonly SynthesisTask[]): string {
  return stableJson(value);
}

export const canonicalSynthesisJson = stableSynthesisJson;

export function finalizeSynthesis(result: SynthesisResult): SynthesisResult {
  const review = reviewSynthesis(result);
  if (!review.accepted || result.tasks.some((task) => task.declaredStatus === 'BLOCKED')) return { ...result, review, findings: review.findings, accepted: false };
  return { ...result, review, findings: review.findings, accepted: true };
}

function pathBetween(graph: SynthesisGraph, from: string, to: string): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === 'depends-on' || edge.type === 'blocks' || edge.type === 'consumes') adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }
  const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node === to) return current.path;
    if (visited.has(current.node)) continue;
    visited.add(current.node);
    for (const next of adjacency.get(current.node) ?? []) queue.push({ node: next, path: [...current.path, next] });
  }
  return [];
}

function surfaceConflict(left: SynthesisTask, right: SynthesisTask): { locator: string; reason: string } | null {
  for (const a of left.surfaces) {
    for (const b of right.surfaces) {
      if (a.locator !== b.locator) continue;
      const writeLike = (access: TaskSurface['access']) => access === 'write' || access === 'exclusive';
      if (writeLike(a.access) || writeLike(b.access)) return { locator: a.locator, reason: `${a.access}/${b.access} overlap on ${a.locator}` };
    }
  }
  return null;
}

function pairwiseProof(graph: SynthesisGraph, left: SynthesisTask, right: SynthesisTask): TaskPairwiseProof {
  const leftToRight = pathBetween(graph, left.qualifiedId, right.qualifiedId);
  const rightToLeft = pathBetween(graph, right.qualifiedId, left.qualifiedId);
  const conflictPair = surfaceConflict(left, right);
  return {
    leftTaskId: left.qualifiedId,
    rightTaskId: right.qualifiedId,
    causalPathLeftToRight: leftToRight,
    causalPathRightToLeft: rightToLeft,
    conflictPair,
    proof: { noCausalPathEitherDirection: leftToRight.length === 0 && rightToLeft.length === 0, noConflictPair: conflictPair === null },
    safe: leftToRight.length === 0 && rightToLeft.length === 0 && conflictPair === null,
  };
}

function allPairwiseProofs(graph: SynthesisGraph, tasks: readonly SynthesisTask[]): TaskPairwiseProof[] {
  const sorted = [...tasks].sort((a, b) => compareText(a.qualifiedId, b.qualifiedId));
  const result: TaskPairwiseProof[] = [];
  for (let left = 0; left < sorted.length; left += 1) for (let right = left + 1; right < sorted.length; right += 1) result.push(pairwiseProof(graph, sorted[left], sorted[right]));
  return result;
}

export function projectTaskPlan(input: SynthesisResult | SynthesisGraph): TaskPlanResult {
  const graph = 'graph' in input ? input.graph : input;
  const findings = 'graph' in input ? input.findings : reviewSynthesis(graph).findings;
  const tasks = [...graph.tasks].sort((a, b) => compareText(a.qualifiedId, b.qualifiedId));
  const proofs = allPairwiseProofs(graph, tasks);
  const batches: SafeBatch[] = [];
  for (const task of tasks) {
    if (task.declaredStatus === 'BLOCKED') continue;
    let selected: SafeBatch | undefined;
    for (const batch of batches) {
      const compatible = batch.taskIds.every((taskId) => proofs.find((proof) => (proof.leftTaskId === taskId && proof.rightTaskId === task.qualifiedId) || (proof.leftTaskId === task.qualifiedId && proof.rightTaskId === taskId))?.safe === true);
      if (compatible) { selected = batch; break; }
    }
    if (!selected) { selected = { id: `batch-${batches.length + 1}`, taskIds: [], pairwiseProofs: [], safe: true }; batches.push(selected); }
    selected.taskIds.push(task.qualifiedId);
  }
  for (const batch of batches) {
    batch.taskIds.sort(compareText);
    batch.pairwiseProofs = proofs.filter((proof) => batch.taskIds.includes(proof.leftTaskId) && batch.taskIds.includes(proof.rightTaskId));
    batch.safe = batch.pairwiseProofs.every((proof) => proof.safe);
  }
  const batchByTask = new Map<string, string>();
  for (const batch of batches) for (const taskId of batch.taskIds) batchByTask.set(taskId, batch.id);
  const briefs: TaskBrief[] = tasks.map((task) => ({
    taskId: task.qualifiedId,
    title: task.title,
    fullTaskText: stableJson(task),
    requirementId: task.ownership.requirementId,
    acceptanceCriterionId: task.ownership.acceptanceCriterionId,
    scenario: task.scenario,
    exactSourceLocations: task.sourceLocations,
    interfaces: task.interfaces,
    dependencies: task.dependencies,
    predecessorSummaries: task.dependencies.map((dependency) => {
      const predecessor = graph.tasks.find((candidate) => candidate.qualifiedId === dependency.targetId);
      return { taskId: dependency.targetId, title: predecessor?.title ?? dependency.targetId, reason: dependency.reason };
    }),
    evidenceCommands: task.evidence.commands,
    ...(batchByTask.has(task.qualifiedId) ? { safeBatchId: batchByTask.get(task.qualifiedId) } : {}),
    blockers: task.blockers,
    machineNextAction: task.declaredStatus === 'BLOCKED' ? 'resolve the named implementation-surface investigation before finalization' : 'execute the embedded RED step and attach scenario evidence',
    proofOfIndependence: proofs.filter((proof) => proof.leftTaskId === task.qualifiedId || proof.rightTaskId === task.qualifiedId),
  }));
  return {
    representationVersion: TASK_SYNTHESIS_VERSION,
    authority: SYNTHESIS_AUTHORITY,
    graphRevision: graph.revision,
    accepted: ('graph' in input ? input.accepted : reviewSynthesis(graph).accepted) && findings.every((item) => item.severity !== 'error'),
    briefs,
    batches,
    pairwiseProofs: proofs,
    findings: sortedFindings(findings),
    secondPlanAuthority: false,
    executor: null,
  };
}

export const createTaskPlanResult = projectTaskPlan;
export const buildTaskPlanResult = projectTaskPlan;

export function evaluateLifecycleOutcome(
  task: Pick<SynthesisTask, 'qualifiedId'>,
  outcome: LifecycleOutcome,
  evidenceBacked = false,
  diagnostics: readonly string[] = [],
): LifecycleResult {
  const baseDiagnostics = uniqueSorted(diagnostics);
  if (outcome === 'DONE' && evidenceBacked) return { taskId: task.qualifiedId, outcome, completes: true, diagnostics: baseDiagnostics, followUpProposals: [] };
  const reason = outcome === 'DONE' ? 'DONE requires fresh evidence-backed proof' : `${outcome} does not complete the task`;
  const followUp = outcome === 'BLOCKED' ? 'resolve blocker and rerun the owned acceptance lane' : outcome === 'NEEDS_CONTEXT' ? 'supply the missing context and rerun the owned acceptance lane' : outcome === 'DONE_WITH_CONCERNS' ? 'review concerns and attach follow-up evidence' : 'attach evidence-backed proof before finalization';
  return {
    taskId: task.qualifiedId,
    outcome,
    completes: false,
    diagnostics: uniqueSorted([...baseDiagnostics, reason]),
    followUpProposals: [followUp],
  };
}

export const applyLifecycleOutcome = evaluateLifecycleOutcome;
export const resolveLifecycleOutcome = evaluateLifecycleOutcome;

export function evidenceBackedDone(task: Pick<SynthesisTask, 'qualifiedId'>, evidence: EvidenceInput | undefined): LifecycleResult {
  return evaluateLifecycleOutcome(task, 'DONE', Boolean(evidence?.result === 'PASSED' && evidence.commands.length > 0));
}
