/**
 * FR-84 — stable contracts for bounded spec remediation.
 *
 * This module deliberately contains only data contracts and deterministic helpers.
 * It does not read or write spec documents, build a graph, or decide whether a
 * repair is safe. The remediation engine and the canonical verdict own those
 * operations respectively.
 */
import { createHash } from 'node:crypto';
import type { PatchEdit } from '../spec-mcp-server/section-ops.ts';

/** A repair class is a policy decision, not a confidence score. */
export type RepairClass =
  | 'SAFE_MCP_PATCH'
  | 'SANCTIONED_FORM'
  | 'PROPOSAL_ONLY'
  | 'DECISION_REQUIRED'
  | 'NONE';

/** Stable remediation lifecycle states exposed to direct and MCP consumers. */
export type RemediationState =
  | 'CHECKED'
  | 'PROPOSABLE'
  | 'PROPOSED'
  | 'APPLIED'
  | 'READY'
  | 'NOT_READY'
  | 'REFUSED'
  | 'FAILED';

/** Explicit reasons why a bounded remediation run stopped. */
export type RemediationStopReason =
  | 'READY'
  | 'NO_PROGRESS'
  | 'DECISION_REQUIRED'
  | 'BUDGET_EXCEEDED'
  | 'NO_CANDIDATES'
  | 'INVALID_INPUT'
  | 'UNSAFE_TARGET'
  | 'PROPOSAL_NOT_FOUND'
  | 'CAS_CONFLICT'
  | 'VALIDATION_FAILED'
  | 'WRITE_FAILED'
  | 'ROLLBACK_FAILED'
  | 'PROVIDER_FAILURE'
  | 'NOT_READY';

export interface FindingLocation {
  file: string;
  line: number;
  column?: number;
}

/** Evidence attached to a finding without making the finding message unstable. */
export interface FindingEvidence {
  source: string;
  reference?: string;
  detail?: string;
  hashes?: EvidenceHashes;
}

/** Optional owner/decision information for findings that cannot be automated. */
export interface FindingOwner {
  kind?: 'agent' | 'human' | 'team' | 'system';
  id?: string;
  name?: string;
  required?: boolean;
  decision?: string;
}

/** Stable hashes used to prove the evidence a finding or proposal observed. */
export interface EvidenceHashes {
  graphSha?: string;
  documentShas?: Record<string, string>;
  snapshotSha?: string;
  findingSha?: string;
}

/** Hashes of documents/graph before and after a proposal or write. */
export interface AffectedHashes {
  before?: EvidenceHashes;
  after?: EvidenceHashes;
  documents?: Record<string, { before?: string; after?: string }>;
  graphBefore?: string;
  graphAfter?: string;
}

/** A normalized cross-layer finding. Message/details are intentionally non-key fields. */
export interface NormalizedFinding {
  fingerprint: string;
  layer: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  spec: string;
  doc?: string;
  node?: string;
  nodeId?: string;
  relatedId?: string;
  location: FindingLocation;
  message: string;
  details?: string;
  repairClass: RepairClass;
  source?: string;
  evidence?: FindingEvidence[];
  owner?: FindingOwner;
  candidateIds?: string[];
}

/** Stable fields used by findingFingerprint; no prose or runtime timestamps enter the key. */
export interface StableFindingFields {
  layer: string;
  code: string;
  spec: string;
  doc?: string;
  node?: string;
  nodeId?: string;
  location: FindingLocation;
  repairClass: RepairClass;
}

/** Input shape accepted from semantic/reality adapters before normalization. */
export interface SemanticFindingInput {
  layer?: string;
  code: string;
  severity?: 'error' | 'warning' | 'info' | 'ERROR' | 'WARNING' | 'INFO';
  spec?: string;
  doc?: string;
  node?: string;
  nodeId?: string;
  relatedId?: string;
  location?: Partial<FindingLocation>;
  message: string;
  details?: string;
  repairClass?: RepairClass | string;
  source?: string;
  evidence?: FindingEvidence[];
  owner?: FindingOwner;
  candidate?: RepairCandidate;
  candidateIds?: string[];
}

/** One immutable view of the graph and mutable spec documents. */
export interface SpecSnapshot {
  spec: string;
  graphSha: string;
  documentShas: Record<string, string>;
  /** SHA of the canonical snapshot payload; useful for no-progress comparisons. */
  snapshotSha?: string;
}

/** A candidate supplied by a mechanical or sanctioned form producer. */
export interface RepairCandidate {
  id?: string;
  candidateId?: string;
  source: 'mechanical' | 'sanctioned-form' | 'semantic' | string;
  repairClass: RepairClass;
  spec: string;
  findingFingerprints?: string[];
  fingerprints?: string[];
  findingCodes?: string[];
  edits: PatchEdit[];
  dependencies?: string[];
  reason?: string;
  evidence?: FindingEvidence[];
  owner?: FindingOwner;
}

/** Result of one analyze → propose/apply pass. */
export interface RemediationRoundAttempt {
  round: number;
  state: RemediationState;
  before: SpecSnapshot;
  after?: SpecSnapshot;
  beforeFindings: NormalizedFinding[];
  afterFindings?: NormalizedFinding[];
  selectedCandidates: string[];
  refusedCandidates: Array<{ id: string; reason: string }>;
  proposalId?: string;
  applied: boolean;
  writes: number;
  affectedHashes?: AffectedHashes;
  stopReason?: RemediationStopReason;
}

/** Bounded result shared by CLI, direct consumers, and MCP surfaces. */
export interface RemediationReport {
  spec: string;
  state: RemediationState;
  stopReason: RemediationStopReason;
  before: {
    snapshot: SpecSnapshot;
    findings: NormalizedFinding[];
  };
  applied: {
    writes: number;
    proposalIds: string[];
    candidates: string[];
    affectedHashes?: AffectedHashes;
  };
  remaining: NormalizedFinding[];
  final: {
    snapshot: SpecSnapshot;
    findings: NormalizedFinding[];
    verdict: 'GREEN' | 'RED' | 'NOT_READY';
    readiness: 'READY' | 'NOT_READY';
  };
  rounds: RemediationRoundAttempt[];
  proposals?: Array<{
    proposalId: string;
    preview: unknown;
    affectedHashes?: AffectedHashes;
  }>;
  refusals: Array<{ candidateId: string; reason: string }>;
  affectedHashes?: AffectedHashes;
  /** Compact evidence for callers that cannot retain the full normalized list. */
  evidence: EvidenceHashes;
}

/** Canonicalize object keys recursively while preserving array order. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

/** Deterministic JSON representation used by hashes and stable comparisons. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Hash a canonical JSON payload with SHA-256. */
export function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalStringify(value)).digest('hex');
}

/**
 * Fingerprint only stable identity fields. In particular, message/details,
 * evidence, ownership and timestamps are excluded so wording changes do not
 * manufacture a new remediation target.
 */
export function findingFingerprint(input: StableFindingFields | NormalizedFinding): string {
  const stable: StableFindingFields = {
    layer: String(input.layer ?? ''),
    code: String(input.code ?? ''),
    spec: String(input.spec ?? ''),
    ...(input.doc ? { doc: String(input.doc) } : {}),
    ...(input.node || input.nodeId ? { node: String(input.node ?? input.nodeId) } : {}),
    location: {
      file: String(input.location?.file ?? ''),
      line: Number.isFinite(input.location?.line) ? Number(input.location.line) : 0,
      ...(input.location?.column !== undefined ? { column: Number(input.location.column) } : {}),
    },
    repairClass: input.repairClass,
  };
  return sha256(stable);
}

function findingCompare(a: NormalizedFinding, b: NormalizedFinding): number {
  return a.fingerprint.localeCompare(b.fingerprint)
    || a.layer.localeCompare(b.layer)
    || a.code.localeCompare(b.code)
    || a.spec.localeCompare(b.spec)
    || (a.doc ?? '').localeCompare(b.doc ?? '')
    || (a.node ?? a.nodeId ?? '').localeCompare(b.node ?? b.nodeId ?? '')
    || a.location.file.localeCompare(b.location.file)
    || a.location.line - b.location.line;
}

/** Return findings in deterministic fingerprint order without mutating the input. */
export function sortFindings(findings: readonly NormalizedFinding[]): NormalizedFinding[] {
  return [...findings].sort(findingCompare);
}

/** Alias used by consumers that call the operation a canonical sort. */
export const canonicalSortFindings = sortFindings;

/** Dedupe by the stable fingerprint, retaining the first complete record. */
export function dedupeFindings(findings: readonly NormalizedFinding[]): NormalizedFinding[] {
  const byFingerprint = new Map<string, NormalizedFinding>();
  for (const finding of findings) {
    const fingerprint = finding.fingerprint || findingFingerprint(finding);
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, { ...finding, fingerprint });
  }
  return sortFindings([...byFingerprint.values()]);
}

/** Alias for callers that use the noun form. */
export const canonicalDedupeFindings = dedupeFindings;
