/**
 * Canonical task/v1 contract producer.
 *
 * TASKS.md remains the authored source, but every consumer receives this one
 * normalized record. The module is intentionally dependency-free so it also
 * works in the installed MCP bundle and in the migration/observe path where
 * no graph has been built yet.
 */

export const TASK_CONTRACT_VERSION = 'task/v1' as const;

export type TaskKind = 'implementation' | 'test' | 'documentation' | 'investigation' | 'migration' | 'other';
export type TaskDeclaredStatus = 'TODO' | 'READY' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type TaskLinkKind = 'requirement' | 'acceptance-criterion';
export type DependencyRelation = 'depends-on' | 'blocks' | 'consumes';
export type DependencyStrength = 'hard' | 'soft';
export type SurfaceKind =
  | 'file'
  | 'glob'
  | 'symbol'
  | 'api-contract'
  | 'schema'
  | 'data'
  | 'config'
  | 'generated-artifact'
  | 'test-resource'
  | 'runtime-resource'
  | 'external-contract';
export type SurfaceAccess = 'read' | 'write' | 'exclusive';
export type EvidenceScope = 'full-suite' | 'selected' | 'scenario' | 'manual' | 'none';

export interface TaskSourceSpan {
  file: string;
  startLine: number;
  endLine: number;
  /** The exact authored block, including comments and unknown keys. */
  sourceText?: string;
}

export interface TaskLink {
  id: string;
  kind: TaskLinkKind;
  /** Stable local source spelling is retained for diagnostics. */
  source?: string;
}

export interface DoneWhenCriterion {
  text: string;
  order: number;
  required: boolean;
}

export interface TaskDependency {
  targetId: string;
  relation: DependencyRelation;
  strength: DependencyStrength;
  reason: string;
  source?: TaskSourceSpan;
}

export interface TaskSurface {
  kind: SurfaceKind;
  access: SurfaceAccess;
  locator: string;
  scope: string;
  rationale: string;
}

export interface TaskArtifact {
  path: string;
  kind?: string;
  required: boolean;
}

export interface EvidencePolicy {
  scope: EvidenceScope;
  commands: string[];
  requiresFresh: boolean;
  allowFiltered: boolean;
}

export interface CanonicalTask {
  representationVersion: typeof TASK_CONTRACT_VERSION;
  qualifiedId: string;
  title: string;
  kind: TaskKind;
  definitionRevision: number;
  declaredStatus: TaskDeclaredStatus;
  estimateMinutes: number;
  requirementLinks: TaskLink[];
  acceptanceCriteriaLinks: TaskLink[];
  doneWhen: DoneWhenCriterion[];
  dependencies: TaskDependency[];
  surfaces: TaskSurface[];
  artifacts: TaskArtifact[];
  evidencePolicy: EvidencePolicy;
  unknownFields: Record<string, unknown>;
  comments: string[];
  sourceSpan: TaskSourceSpan;
}

export interface TaskDiagnostic {
  code:
    | 'TASK_MISSING_FIELD'
    | 'TASK_INVALID_FIELD'
    | 'TASK_DUPLICATE_ID'
    | 'TASK_NORMALIZATION_DUPLICATE_ID'
    | 'TASK_UNRESOLVED_REQUIREMENT'
    | 'TASK_UNRESOLVED_ACCEPTANCE_CRITERION'
    | 'TASK_LEGACY_RECORD'
    | 'TASK_PROJECTION_DIVERGENCE';
  severity: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  location?: TaskSourceSpan;
  relatedLocations?: TaskSourceSpan[];
  taskId?: string;
}

export interface LegacyTaskRecord {
  sourceText: string;
  sourceSpan: TaskSourceSpan;
  candidateId?: string;
  diagnostics: TaskDiagnostic[];
}

export interface TaskDocument {
  representationVersion: typeof TASK_CONTRACT_VERSION;
  tasks: CanonicalTask[];
  legacy: LegacyTaskRecord[];
  diagnostics: TaskDiagnostic[];
}

export interface ParseTaskOptions {
  file?: string;
  knownRequirements?: ReadonlySet<string>;
  knownAcceptanceCriteria?: ReadonlySet<string>;
}

export interface ApplyTaskOptions {
  knownRequirements?: ReadonlySet<string>;
  knownAcceptanceCriteria?: ReadonlySet<string>;
  file?: string;
}

export interface TaskMutationResult {
  ok: boolean;
  tasks: CanonicalTask[];
  rejected: CanonicalTask[];
  findings: TaskDiagnostic[];
  /** True only when the caller may replace its snapshot. */
  committed: boolean;
}

export interface TaskProjection {
  qualifiedId: string;
  representationVersion: typeof TASK_CONTRACT_VERSION;
  definitionRevision: number;
  declaredStatus: TaskDeclaredStatus;
  diagnostics: TaskDiagnostic[];
}

export interface TaskProjectionViews {
  graph: TaskProjection[];
  mcp: TaskProjection[];
  lifecycle: TaskProjection[];
  census: TaskProjection[];
  summary: TaskProjection[];
}

const STATUS_SET = new Set<TaskDeclaredStatus>(['TODO', 'READY', 'IN_PROGRESS', 'DONE', 'BLOCKED']);
const KIND_SET = new Set<TaskKind>(['implementation', 'test', 'documentation', 'investigation', 'migration', 'other']);
const SURFACE_KINDS = new Set<SurfaceKind>([
  'file', 'glob', 'symbol', 'api-contract', 'schema', 'data', 'config',
  'generated-artifact', 'test-resource', 'runtime-resource', 'external-contract',
]);
const ACCESS_SET = new Set<SurfaceAccess>(['read', 'write', 'exclusive']);
const DEPENDENCY_RELATIONS = new Set<DependencyRelation>(['depends-on', 'blocks', 'consumes']);
const DEPENDENCY_STRENGTH = new Set<DependencyStrength>(['hard', 'soft']);
const EVIDENCE_SCOPES = new Set<EvidenceScope>(['full-suite', 'selected', 'scenario', 'manual', 'none']);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** NFKC is applied before case-folding for duplicate checks and stable ordering. */
export function normalizeTaskKey(value: string): string {
  return value.normalize('NFKC').trim();
}

export function normalizedTaskId(value: string): string {
  return normalizeTaskKey(value).toLocaleLowerCase('en-US');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, stableValue(obj[key])]));
  }
  return value;
}

/** Canonical JSON is the comparison key used by cold/warm and round-trip checks. */
export function stableTaskJson(task: CanonicalTask | CanonicalTask[]): string {
  const normalize = (entry: CanonicalTask): CanonicalTask => ({
    ...entry,
    dependencies: [...entry.dependencies].sort((a, b) =>
      normalizedTaskId(a.targetId).localeCompare(normalizedTaskId(b.targetId))
      || a.relation.localeCompare(b.relation)),
    sourceSpan: {
      ...entry.sourceSpan,
      sourceText: undefined,
      startLine: 0,
      endLine: 0,
    },
  });
  return JSON.stringify(stableValue(Array.isArray(task) ? task.map(normalize) : normalize(task)), null, 0);
}

function sourceSpan(file: string, startLine: number, endLine: number, sourceText?: string): TaskSourceSpan {
  return { file, startLine, endLine, ...(sourceText === undefined ? {} : { sourceText }) };
}

function diagnostic(
  code: TaskDiagnostic['code'],
  message: string,
  taskId?: string,
  field?: string,
  location?: TaskSourceSpan,
  severity: TaskDiagnostic['severity'] = 'error',
  relatedLocations?: TaskSourceSpan[],
): TaskDiagnostic {
  return { code, severity, message, ...(taskId ? { taskId } : {}), ...(field ? { field } : {}), ...(location ? { location } : {}), ...(relatedLocations?.length ? { relatedLocations } : {}) };
}

function normalizeLink(value: unknown, kind: TaskLinkKind): TaskLink | null {
  if (typeof value === 'string') {
    const id = normalizeTaskKey(value);
    return id ? { id, kind, source: value } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const id = normalizeTaskKey(text(input.id ?? input.qualifiedId ?? input.ref));
  return id ? { id, kind, ...(text(input.source) ? { source: text(input.source) } : {}) } : null;
}

function normalizeCriteria(value: unknown): DoneWhenCriterion[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/).filter(Boolean) : [];
  return raw.map((item, index) => {
    if (typeof item === 'string') return { text: item.trim(), order: index + 1, required: true };
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      text: text(obj.text ?? obj.criterion ?? obj.description),
      order: Number.isSafeInteger(obj.order) ? Number(obj.order) : index + 1,
      required: obj.required !== false,
    };
  }).filter((item) => item.text).sort((a, b) => a.order - b.order || a.text.localeCompare(b.text)).map((item, index) => ({ ...item, order: index + 1 }));
}

function normalizeDependency(value: unknown): TaskDependency | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const targetId = normalizeTaskKey(text(obj.targetId ?? obj.target ?? obj.id));
  const relation = text(obj.relation || 'depends-on') as DependencyRelation;
  const strength = text(obj.strength || 'hard') as DependencyStrength;
  const reason = text(obj.reason);
  if (!targetId || !DEPENDENCY_RELATIONS.has(relation) || !DEPENDENCY_STRENGTH.has(strength) || !reason) return null;
  return { targetId, relation, strength, reason };
}

function normalizeSurface(value: unknown): TaskSurface | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const kind = text(obj.kind) as SurfaceKind;
  const access = text(obj.access || obj.mode) as SurfaceAccess;
  const locator = normalizeTaskKey(text(obj.locator ?? obj.path ?? obj.resource));
  const scope = normalizeTaskKey(text(obj.scope || 'repository'));
  const rationale = text(obj.rationale || obj.reason);
  if (!SURFACE_KINDS.has(kind) || !ACCESS_SET.has(access) || !locator || !scope || !rationale) return null;
  return { kind, access, locator, scope, rationale };
}

function normalizeArtifact(value: unknown): TaskArtifact | null {
  if (typeof value === 'string') {
    const normalized = normalizeTaskKey(value);
    const match = normalized.match(/^(.*?)\s+\(([^()]+)\)$/);
    const path = normalizeTaskKey(match?.[1] ?? normalized);
    return path ? { path, ...(match ? { kind: match[2].trim() } : {}), required: true } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const path = normalizeTaskKey(text(obj.path ?? obj.locator));
  return path ? { path, ...(text(obj.kind) ? { kind: text(obj.kind) } : {}), required: obj.required !== false } : null;
}

function normalizeEvidence(value: unknown): EvidencePolicy {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const scope = text(obj.scope || obj.proofScope || 'full-suite') as EvidenceScope;
  const commands = Array.isArray(obj.commands) ? obj.commands.map(text).filter(Boolean) : typeof obj.command === 'string' ? [obj.command.trim()] : [];
  return {
    scope: EVIDENCE_SCOPES.has(scope) ? scope : 'full-suite',
    commands: [...new Set(commands)].sort(),
    requiresFresh: obj.requiresFresh !== false,
    allowFiltered: obj.allowFiltered === true,
  };
}

function extractUnknown(input: Record<string, unknown>): Record<string, unknown> {
  const known = new Set([
    'representationVersion', 'version', 'qualifiedId', 'id', 'title', 'kind', 'definitionRevision', 'revision',
    'declaredStatus', 'status', 'estimateMinutes', 'estimate', 'requirements', 'requirementLinks', 'refs',
    'acceptanceCriteria', 'acceptanceCriteriaLinks', 'acLinks', 'doneWhen', 'criteria', 'dependencies',
    'surfaces', 'artifacts', 'evidencePolicy', 'unknownFields', 'comments', 'comment', 'sourceSpan', 'source',
  ]);
  const out: Record<string, unknown> = { ...(input.unknownFields && typeof input.unknownFields === 'object' ? input.unknownFields as Record<string, unknown> : {}) };
  for (const [key, value] of Object.entries(input)) if (!known.has(key)) out[key] = value;
  return out;
}

export function canonicalizeTask(input: Partial<CanonicalTask> & Record<string, unknown>, options: ParseTaskOptions = {}): { task: CanonicalTask; findings: TaskDiagnostic[] } {
  const rawId = text(input.qualifiedId ?? input.id);
  const id = normalizeTaskKey(rawId);
  const spanInput = (input.sourceSpan && typeof input.sourceSpan === 'object' ? input.sourceSpan : {}) as Record<string, unknown>;
  const span = sourceSpan(
    text(spanInput.file ?? options.file) || '<memory>',
    Number.isSafeInteger(spanInput.startLine) ? Number(spanInput.startLine) : 1,
    Number.isSafeInteger(spanInput.endLine) ? Number(spanInput.endLine) : Number.isSafeInteger(spanInput.startLine) ? Number(spanInput.startLine) : 1,
    text(spanInput.sourceText) || undefined,
  );
  const kind = text(input.kind || 'implementation') as TaskKind;
  const status = text((input.declaredStatus ?? input.status) || 'TODO').toUpperCase() as TaskDeclaredStatus;
  const revision = Number(input.definitionRevision ?? input.revision ?? 1);
  const estimate = Number(input.estimateMinutes ?? input.estimate ?? 0);
  const requirementsRaw = input.requirementLinks ?? input.requirements ?? input.refs ?? [];
  const acRaw = input.acceptanceCriteriaLinks ?? input.acceptanceCriteria ?? input.acLinks ?? [];
  const requirementLinks = (Array.isArray(requirementsRaw) ? requirementsRaw : [requirementsRaw]).map((v) => normalizeLink(v, 'requirement')).filter((v): v is TaskLink => Boolean(v));
  const acceptanceCriteriaLinks = (Array.isArray(acRaw) ? acRaw : [acRaw]).map((v) => normalizeLink(v, 'acceptance-criterion')).filter((v): v is TaskLink => Boolean(v));
  const dependencies = (Array.isArray(input.dependencies) ? input.dependencies : []).map(normalizeDependency).filter((v): v is TaskDependency => Boolean(v)).sort((a, b) => a.targetId.localeCompare(b.targetId) || a.relation.localeCompare(b.relation) || a.reason.localeCompare(b.reason));
  const surfaces = (Array.isArray(input.surfaces) ? input.surfaces : []).map(normalizeSurface).filter((v): v is TaskSurface => Boolean(v)).sort((a, b) => a.kind.localeCompare(b.kind) || a.access.localeCompare(b.access) || a.locator.localeCompare(b.locator));
  const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).map(normalizeArtifact).filter((v): v is TaskArtifact => Boolean(v)).sort((a, b) => a.path.localeCompare(b.path));
  const comments = [...new Set((Array.isArray(input.comments) ? input.comments : typeof input.comment === 'string' ? [input.comment] : []).map(text).filter(Boolean))];
  const task: CanonicalTask = {
    representationVersion: TASK_CONTRACT_VERSION,
    qualifiedId: id,
    title: text(input.title),
    kind,
    definitionRevision: revision,
    declaredStatus: status,
    estimateMinutes: Math.round(estimate * 100) / 100,
    requirementLinks: requirementLinks.sort((a, b) => a.id.localeCompare(b.id)),
    acceptanceCriteriaLinks: acceptanceCriteriaLinks.sort((a, b) => a.id.localeCompare(b.id)),
    doneWhen: normalizeCriteria(input.doneWhen ?? input.criteria),
    dependencies,
    surfaces,
    artifacts,
    evidencePolicy: normalizeEvidence(input.evidencePolicy),
    unknownFields: extractUnknown(input),
    comments,
    sourceSpan: span,
  };

  const findings: TaskDiagnostic[] = [];
  if (!task.qualifiedId) findings.push(diagnostic('TASK_MISSING_FIELD', 'qualifiedId is required', undefined, 'qualifiedId', span));
  if (!task.title) findings.push(diagnostic('TASK_MISSING_FIELD', 'title is required', task.qualifiedId, 'title', span));
  if (!KIND_SET.has(task.kind)) findings.push(diagnostic('TASK_INVALID_FIELD', `unsupported kind: ${task.kind}`, task.qualifiedId, 'kind', span));
  if (!STATUS_SET.has(task.declaredStatus)) findings.push(diagnostic('TASK_INVALID_FIELD', `unsupported declaredStatus: ${task.declaredStatus}`, task.qualifiedId, 'declaredStatus', span));
  if (!Number.isFinite(task.definitionRevision) || task.definitionRevision < 1 || !Number.isInteger(task.definitionRevision)) findings.push(diagnostic('TASK_INVALID_FIELD', 'definitionRevision must be a positive integer', task.qualifiedId, 'definitionRevision', span));
  if (!Number.isFinite(task.estimateMinutes) || task.estimateMinutes < 0) findings.push(diagnostic('TASK_INVALID_FIELD', 'estimateMinutes must be a non-negative number', task.qualifiedId, 'estimateMinutes', span));
  if (task.doneWhen.length === 0) findings.push(diagnostic('TASK_MISSING_FIELD', 'doneWhen must contain at least one measurable criterion', task.qualifiedId, 'doneWhen', span));
  if (task.surfaces.length === 0) findings.push(diagnostic('TASK_MISSING_FIELD', 'surfaces must contain at least one typed claim', task.qualifiedId, 'surfaces', span));
  if (task.artifacts.length === 0) findings.push(diagnostic('TASK_MISSING_FIELD', 'artifacts must contain at least one declared artifact', task.qualifiedId, 'artifacts', span));
  if (!input.evidencePolicy) findings.push(diagnostic('TASK_MISSING_FIELD', 'evidencePolicy is required', task.qualifiedId, 'evidencePolicy', span));
  for (const dep of dependencies) if (dep.targetId === task.qualifiedId) findings.push(diagnostic('TASK_INVALID_FIELD', 'self dependency is not allowed', task.qualifiedId, 'dependencies', span));
  if (options.knownRequirements) for (const link of task.requirementLinks) if (!hasNormalized(options.knownRequirements, link.id)) findings.push(diagnostic('TASK_UNRESOLVED_REQUIREMENT', `unresolved requirement link: ${link.id}`, task.qualifiedId, 'requirementLinks', span));
  if (options.knownAcceptanceCriteria) for (const link of task.acceptanceCriteriaLinks) if (!hasNormalized(options.knownAcceptanceCriteria, link.id)) findings.push(diagnostic('TASK_UNRESOLVED_ACCEPTANCE_CRITERION', `unresolved acceptance criterion link: ${link.id}`, task.qualifiedId, 'acceptanceCriteriaLinks', span));
  return { task, findings };
}

function hasNormalized(values: ReadonlySet<string>, value: string): boolean {
  const target = normalizedTaskId(value);
  for (const candidate of values) if (normalizedTaskId(candidate) === target) return true;
  return false;
}

function parseListValue(value: string): string[] {
  return value.split(/[,|]/).map((part) => part.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
}

function parseStructuredBlock(block: string, span: TaskSourceSpan, options: ParseTaskOptions): { task?: CanonicalTask; findings: TaskDiagnostic[] } {
  const lines = block.split(/\r?\n/);
  const header = lines[0] ?? '';
  const match = header.match(/^\s*-\s*\[[ xX~]\]\s+(.+?)\s+—\s*id:\s*([^\s—|]+)\s+—\s*Status:\s*([A-Za-z_-]+)(?:\s*\|\s*Est:\s*([0-9]+(?:\.[0-9]+)?)m)?/);
  if (!match) return { findings: [diagnostic('TASK_LEGACY_RECORD', 'task header is loose or missing canonical id/status', undefined, undefined, span, 'warning')] };
  const input: Record<string, unknown> = {
    qualifiedId: match[2], title: match[1].trim(), declaredStatus: match[3], estimateMinutes: match[4] ? Number(match[4]) : 0,
    sourceSpan: span,
  };
  const criteria: string[] = [];
  const dependencies: TaskDependency[] = [];
  const surfaces: TaskSurface[] = [];
  const artifacts: TaskArtifact[] = [];
  const requirements: string[] = [];
  const acceptanceCriteria: string[] = [];
  const comments: string[] = [];
  let evidence: Record<string, unknown> | undefined;
  let section = '';
  for (const line of lines.slice(1)) {
    const key = line.match(/^\s*\*\*([^:*]+):\*\*\s*(.*)$/);
    if (key) {
      section = key[1].trim().toLowerCase();
      const value = key[2].trim();
      if (/revision|definition revision/.test(section)) input.definitionRevision = Number(value);
      else if (/kind/.test(section)) input.kind = value.toLowerCase();
      else if (/requirement/.test(section)) requirements.push(...parseListValue(value));
      else if (/acceptance/.test(section)) acceptanceCriteria.push(...parseListValue(value));
      else if (/evidence policy/.test(section)) evidence = { ...(evidence ?? {}), scope: value || 'full-suite' };
      else if (/evidence command/.test(section)) evidence = { ...(evidence ?? {}), scope: (evidence as { scope?: string } | undefined)?.scope ?? 'full-suite', commands: [...((evidence as { commands?: string[] } | undefined)?.commands ?? []), value] };
      else if (/comment/.test(section) && value) comments.push(value);
      else if (value) {
        const unknown = input.unknownFields && typeof input.unknownFields === 'object'
          ? input.unknownFields as Record<string, unknown>
          : {};
        let parsedValue: unknown = value;
        try { parsedValue = JSON.parse(value); } catch { /* preserve non-JSON unknown text */ }
        unknown[key[1].trim()] = parsedValue;
        input.unknownFields = unknown;
      }
      continue;
    }
    const item = line.match(/^\s*-\s*(?:\[[ xX]\]\s*)?(.*\S)\s*$/)?.[1]?.trim();
    if (!item) continue;
    if (/done when|criteria|acceptance/.test(section)) criteria.push(item);
    else if (/dependenc/.test(section)) {
      const dep = item.match(/^(depends-on|blocks|consumes)\s+([^|]+?)\s*\|\s*(hard|soft)\s*\|\s*(?:reason\s*:\s*)?(.+)$/i);
      if (dep) dependencies.push({ targetId: dep[2].trim(), relation: dep[1].toLowerCase() as DependencyRelation, strength: dep[3].toLowerCase() as DependencyStrength, reason: dep[4].trim() });
    } else if (/surface/.test(section)) {
      const surface = item.match(/^(file|glob|symbol|api-contract|schema|data|config|generated-artifact|test-resource|runtime-resource|external-contract)\s+(read|write|exclusive)\s+([^|]+)\s*\|\s*scope\s*:\s*([^|]+)\s*\|\s*rationale\s*:\s*(.+)$/i);
      if (surface) surfaces.push({ kind: surface[1].toLowerCase() as SurfaceKind, access: surface[2].toLowerCase() as SurfaceAccess, locator: surface[3].trim(), scope: surface[4].trim(), rationale: surface[5].trim() });
    } else if (/artifact/.test(section)) {
      const artifact = normalizeArtifact(item);
      if (artifact) artifacts.push(artifact);
    }
    else if (/comment/.test(section)) comments.push(item);
  }
  input.requirementLinks = requirements;
  input.acceptanceCriteriaLinks = acceptanceCriteria;
  input.doneWhen = criteria;
  input.dependencies = dependencies;
  input.surfaces = surfaces;
  input.artifacts = artifacts;
  input.comments = comments;
  if (evidence) input.evidencePolicy = evidence;
  const result = canonicalizeTask(input, options);
  return { task: result.task, findings: result.findings };
}

/** Parse a single canonical record, object or rendered Markdown task block. */
export function parseTaskContract(input: string | (Partial<CanonicalTask> & Record<string, unknown>), options: ParseTaskOptions = {}): CanonicalTask {
  if (typeof input !== 'string') {
    const result = canonicalizeTask(input, options);
    if (result.findings.some((finding) => finding.severity === 'error')) throw new TaskContractError(result.findings);
    return result.task;
  }
  const span = sourceSpan(options.file ?? '<memory>', 1, input.split(/\r?\n/).length, input);
  const result = parseStructuredBlock(input, span, options);
  if (!result.task || result.findings.some((finding) => finding.severity === 'error')) throw new TaskContractError(result.findings);
  return result.task;
}

export class TaskContractError extends Error {
  readonly findings: TaskDiagnostic[];
  constructor(findings: TaskDiagnostic[]) {
    super(findings.map((finding) => finding.message).join('; ') || 'invalid task contract');
    this.name = 'TaskContractError';
    this.findings = findings;
  }
}

/** Parse all task bullets while retaining every loose/legacy item. */
export function parseTaskDocument(content: string, options: ParseTaskOptions = {}): TaskDocument {
  const lines = content.split(/\r?\n/);
  const tasks: CanonicalTask[] = [];
  const legacy: LegacyTaskRecord[] = [];
  const diagnostics: TaskDiagnostic[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!/^-\s*\[[ xX~]\]/.test(lines[index])) { index++; continue; }
    const start = index;
    const blockLines = [lines[index++]];
    while (index < lines.length && !/^-\s*\[[ xX~]\]/.test(lines[index]) && !/^#{1,6}\s/.test(lines[index])) blockLines.push(lines[index++]);
    const block = blockLines.join('\n');
    const span = sourceSpan(options.file ?? '<memory>', start + 1, start + blockLines.length, block);
    const parsed = parseStructuredBlock(block, span, options);
    if (!parsed.task) {
      const candidate = block.match(/\bid:\s*([^\s—|]+)/)?.[1];
      const finding = parsed.findings[0] ?? diagnostic('TASK_LEGACY_RECORD', 'legacy task record retained', candidate, undefined, span, 'warning');
      const item: LegacyTaskRecord = { sourceText: block, sourceSpan: span, ...(candidate ? { candidateId: candidate } : {}), diagnostics: [finding] };
      legacy.push(item);
      diagnostics.push(finding);
    } else {
      tasks.push(parsed.task);
      diagnostics.push(...parsed.findings);
    }
  }
  const seen = new Map<string, CanonicalTask>();
  for (const task of tasks) {
    const key = normalizedTaskId(task.qualifiedId);
    const prior = seen.get(key);
    if (prior) {
      const finding = diagnostic('TASK_NORMALIZATION_DUPLICATE_ID', `duplicate qualified ID after case/Unicode normalization: ${task.qualifiedId}`, task.qualifiedId, 'qualifiedId', task.sourceSpan, 'error', [prior.sourceSpan]);
      diagnostics.push(finding);
    } else seen.set(key, task);
  }
  return { representationVersion: TASK_CONTRACT_VERSION, tasks, legacy, diagnostics };
}

/** Deterministically render a canonical task back to authored Markdown. */
export function renderTaskContract(task: CanonicalTask): string {
  const lines = [
    `- [${task.declaredStatus === 'DONE' ? 'x' : ' '}] ${task.title} — id: ${task.qualifiedId} — Status: ${task.declaredStatus} | Est: ${task.estimateMinutes}m`,
    `  **Revision:** ${task.definitionRevision}`,
    `  **Kind:** ${task.kind}`,
    `  **Requirements:** ${task.requirementLinks.map((link) => link.id).join(', ')}`,
    `  **Acceptance Criteria:** ${task.acceptanceCriteriaLinks.map((link) => link.id).join(', ')}`,
    '  **Done When:**',
    ...task.doneWhen.map((criterion) => `  - [${criterion.required ? ' ' : 'x'}] ${criterion.text}`),
    '  **Dependencies:**',
    ...[...task.dependencies]
      .sort((a, b) => normalizedTaskId(a.targetId).localeCompare(normalizedTaskId(b.targetId)) || a.relation.localeCompare(b.relation))
      .map((dependency) => `  - ${dependency.relation} ${dependency.targetId} | ${dependency.strength} | reason: ${dependency.reason}`),
    '  **Surfaces:**',
    ...task.surfaces.map((surface) => `  - ${surface.kind} ${surface.access} ${surface.locator} | scope: ${surface.scope} | rationale: ${surface.rationale}`),
    '  **Artifacts:**',
    ...task.artifacts.map((artifact) => `  - ${artifact.path}${artifact.kind ? ` (${artifact.kind})` : ''}`),
    `  **Evidence Policy:** ${task.evidencePolicy.scope}`,
    ...task.evidencePolicy.commands.map((command) => `  **Evidence Command:** ${command}`),
    ...task.comments.map((comment) => `  **Comment:** ${comment}`),
  ];
  for (const key of Object.keys(task.unknownFields).sort()) {
    const value = task.unknownFields[key];
    lines.push(`  **${key}:** ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  return lines.join('\n');
}

/** All-or-nothing canonical mutation with field-level duplicate/link findings. */
export function applyTaskContractMutation(snapshot: readonly CanonicalTask[], proposed: readonly CanonicalTask[], options: ApplyTaskOptions = {}): TaskMutationResult {
  const findings: TaskDiagnostic[] = [];
  const accepted: CanonicalTask[] = [];
  const rejected: CanonicalTask[] = [];
  const byId = new Map<string, CanonicalTask>();
  for (const task of snapshot) byId.set(normalizedTaskId(task.qualifiedId), task);
  for (const task of proposed) {
    const key = normalizedTaskId(task.qualifiedId);
    const prior = byId.get(key);
    const checked = canonicalizeTask(task as Partial<CanonicalTask> & Record<string, unknown>, { file: options.file, knownRequirements: options.knownRequirements, knownAcceptanceCriteria: options.knownAcceptanceCriteria });
    if (prior) {
      findings.push(diagnostic('TASK_DUPLICATE_ID', `duplicate qualified ID: ${task.qualifiedId}`, task.qualifiedId, 'qualifiedId', task.sourceSpan, 'error', [prior.sourceSpan]));
      rejected.push(task);
      findings.push(...checked.findings);
      continue;
    }
    findings.push(...checked.findings);
    if (checked.findings.some((finding) => finding.severity === 'error')) rejected.push(task);
    else { accepted.push(checked.task); byId.set(key, checked.task); }
  }
  if (findings.some((finding) => finding.severity === 'error')) return { ok: false, tasks: snapshot.map((task) => task), rejected: [...rejected, ...accepted], findings, committed: false };
  return { ok: true, tasks: [...snapshot, ...accepted], rejected: [], findings, committed: true };
}

function projection(task: CanonicalTask, diagnostics: TaskDiagnostic[]): TaskProjection {
  return { qualifiedId: task.qualifiedId, representationVersion: task.representationVersion, definitionRevision: task.definitionRevision, declaredStatus: task.declaredStatus, diagnostics: diagnostics.filter((finding) => finding.taskId === task.qualifiedId) };
}

/** Shared identity/revision/status projection used by graph, MCP, lifecycle, census and summary. */
export function projectTaskViews(tasks: readonly CanonicalTask[], diagnostics: readonly TaskDiagnostic[] = []): TaskProjectionViews {
  const build = (): TaskProjection[] => [...tasks].sort((a, b) => a.qualifiedId.localeCompare(b.qualifiedId)).map((task) => projection(task, [...diagnostics]));
  return { graph: build(), mcp: build(), lifecycle: build(), census: build(), summary: build() };
}

export const parseCanonicalTask = parseTaskContract;
export const renderCanonicalTask = renderTaskContract;
export const parseCanonicalTaskDocument = parseTaskDocument;
export const applyCanonicalTaskMutation = applyTaskContractMutation;
export const canonicalTaskJson = stableTaskJson;
