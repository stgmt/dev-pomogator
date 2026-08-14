#!/usr/bin/env node
/** FR-84 — bounded multilayer spec analysis and MCP-authoritative remediation. */
import fs from 'node:fs';
import path from 'node:path';
import { runChecks, type AuditFinding as RealityFinding } from '../../.claude/skills/spec-reality-check/scripts/verify.ts';
import {
  analyzeSpec,
  renderVerdict,
  type ExternalVerdictFinding,
  type SpecVerdictResult,
} from './spec-verdict.ts';
import {
  applyProposedPatch,
  proposePatch,
  type PatchEdit,
  type PatchPreview,
  type TransactionResult,
} from '../spec-mcp-server/section-ops.ts';
import {
  dedupeFindings,
  findingFingerprint,
  sha256,
  type AffectedHashes,
  type NormalizedFinding,
  type RemediationReport,
  type RemediationRoundAttempt,
  type RemediationState,
  type RemediationStopReason,
  type RepairCandidate,
  type RepairClass,
  type SemanticFindingInput,
  type SpecSnapshot,
} from './spec-remediation-contract.ts';

export interface RemediationInput {
  repoRoot: string;
  spec: string;
  semanticFindings?: unknown;
  repairCandidates?: unknown;
  semanticRequired?: boolean;
}

export interface RemediationAnalysis {
  spec: string;
  snapshot: SpecSnapshot;
  verdict: SpecVerdictResult;
  findings: NormalizedFinding[];
  candidates: RepairCandidate[];
  refusals: Array<{ candidateId: string; reason: string }>;
}

export interface RemediationProposal {
  ok: boolean;
  spec: string;
  before: RemediationAnalysis;
  proposalId?: string;
  preview?: PatchPreview & { proposal_id: string };
  selectedCandidates: string[];
  refusals: Array<{ candidateId: string; reason: string }>;
  affectedHashes: AffectedHashes;
  stopReason?: RemediationStopReason;
}

export interface RemediationApply {
  ok: boolean;
  spec: string;
  proposalId: string;
  transaction: TransactionResult & { proposal_id: string };
  final: RemediationAnalysis;
  writes: number;
  affectedHashes: AffectedHashes;
  stopReason: RemediationStopReason;
}

export interface RemediationLoopOptions extends RemediationInput {
  mode?: 'check' | 'propose' | 'repair';
  maxRounds?: number;
}

interface ProposalMeta {
  repoRoot: string;
  spec: string;
  candidates: RepairCandidate[];
  before: RemediationAnalysis;
  semanticFindings?: unknown;
  semanticRequired?: boolean;
}

const proposalMeta = new Map<string, ProposalMeta>();
const REPAIR_CLASSES = new Set<RepairClass>([
  'SAFE_MCP_PATCH', 'SANCTIONED_FORM', 'PROPOSAL_ONLY', 'DECISION_REQUIRED', 'NONE',
]);
const SEMANTIC_REPAIR_CLASSES = new Set<RepairClass>(['PROPOSAL_ONLY', 'DECISION_REQUIRED', 'NONE']);
const ALLOWED_CANDIDATE_SOURCES = new Set(['mechanical', 'sanctioned-form']);

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveTarget(repoRootInput: string, specInput: string): { repoRoot: string; spec: string; specDir: string } {
  const repoRoot = path.resolve(repoRootInput);
  const normalized = specInput.replace(/\\/g, '/').replace(/^\.specs\//, '').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('UNSAFE_TARGET: spec must be a contained .specs/<slug> path');
  }
  const specsRoot = path.resolve(repoRoot, '.specs');
  const specDir = path.resolve(specsRoot, normalized);
  if (specDir !== specsRoot && !specDir.startsWith(`${specsRoot}${path.sep}`)) {
    throw new Error('UNSAFE_TARGET: spec path escapes .specs');
  }
  if (!fs.existsSync(specDir) || !fs.statSync(specDir).isDirectory()) {
    throw new Error(`SPEC_NOT_FOUND: ${normalized}`);
  }
  return { repoRoot, spec: normalized, specDir };
}

function severityOf(value: unknown): 'error' | 'warning' | 'info' {
  const normalized = String(value ?? 'warning').toLowerCase();
  return normalized === 'error' ? 'error' : normalized === 'info' ? 'info' : 'warning';
}

function repairClassOf(value: unknown, semantic: boolean): RepairClass {
  const parsed = REPAIR_CLASSES.has(value as RepairClass) ? value as RepairClass : (semantic ? 'DECISION_REQUIRED' : 'NONE');
  return semantic && !SEMANTIC_REPAIR_CLASSES.has(parsed) ? 'PROPOSAL_ONLY' : parsed;
}

function normalizedFinding(input: Omit<NormalizedFinding, 'fingerprint'>): NormalizedFinding {
  const finding = {
    evidence: [],
    owner: { kind: 'engine' },
    affected: {},
    dependencies: [],
    attempts: 0,
    state: 'OPEN',
    ...input,
    fingerprint: '',
  } as NormalizedFinding;
  finding.fingerprint = findingFingerprint(finding);
  return finding;
}

function normalizeReality(spec: string, finding: RealityFinding): NormalizedFinding {
  return normalizedFinding({
    layer: 'reality',
    code: finding.check,
    severity: severityOf(finding.severity),
    spec,
    doc: finding.file,
    location: { file: finding.file ?? `.specs/${spec}`, line: finding.line ?? 1 },
    message: finding.message,
    details: finding.details,
    repairClass: 'NONE',
    source: 'reality-check',
    evidence: [{ source: 'spec-reality-check', detail: finding.details ?? finding.message }],
  });
}

function normalizeSemantic(spec: string, raw: unknown, index: number): NormalizedFinding | null {
  const value = asObject(raw);
  if (!value) return null;
  const code = nonEmptyString(value.code);
  const message = nonEmptyString(value.message);
  if (!code || !message) return null;
  const locationValue = asObject(value.location);
  const doc = nonEmptyString(value.doc);
  const repairClass = repairClassOf(value.repairClass, true);
  return normalizedFinding({
    layer: nonEmptyString(value.layer) ?? 'semantic',
    code,
    severity: severityOf(value.severity),
    spec,
    doc,
    node: nonEmptyString(value.node),
    nodeId: nonEmptyString(value.nodeId),
    relatedId: nonEmptyString(value.relatedId),
    location: {
      file: nonEmptyString(locationValue?.file) ?? (doc ? `.specs/${spec}/${doc}` : `.specs/${spec}`),
      line: Number.isFinite(locationValue?.line) ? Math.max(1, Number(locationValue?.line)) : 1,
      ...(Number.isFinite(locationValue?.column) ? { column: Math.max(1, Number(locationValue?.column)) } : {}),
    },
    message,
    details: nonEmptyString(value.details),
    repairClass,
    source: nonEmptyString(value.source) ?? 'semantic-review',
    owner: asObject(value.owner) as NormalizedFinding['owner'] ?? { kind: 'human', required: repairClass === 'DECISION_REQUIRED' },
    evidence: Array.isArray(value.evidence) ? value.evidence as NormalizedFinding['evidence'] : [{ source: `semantic-envelope:${index}` }],
  });
}

function extractSemanticFindings(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  const value = asObject(input);
  return value && Array.isArray(value.findings) ? value.findings : [];
}

function externalFinding(finding: NormalizedFinding): ExternalVerdictFinding {
  return {
    code: finding.code,
    severity: finding.severity,
    message: finding.message,
    location: finding.location,
    nodeId: finding.nodeId ?? finding.node,
    relatedId: finding.relatedId,
    layer: finding.layer,
    spec: finding.spec,
  };
}

function normalizeVerdictFindings(spec: string, verdict: SpecVerdictResult): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];
  for (const finding of verdict.blocking) {
    if ('node' in finding && finding.code === 'UNVERIFIED_COMPLETION') {
      out.push(normalizedFinding({
        layer: 'task-truth', code: finding.code, severity: 'error', spec,
        node: finding.node, location: { file: `.specs/${spec}/TASKS.md`, line: 1 },
        message: `Unverified completion: ${finding.reasons.join(', ')}`,
        repairClass: 'NONE', source: 'spec-verdict',
      }));
      continue;
    }
    const graphFinding = finding as Exclude<typeof finding, { node: string }>;
    const message = graphFinding.message ?? graphFinding.code;
    if (message.startsWith('[reality:') || message.startsWith('[semantic:')) continue;
    out.push(normalizedFinding({
      layer: 'verdict', code: graphFinding.code, severity: graphFinding.severity,
      spec, nodeId: graphFinding.nodeId, relatedId: graphFinding.relatedId,
      location: graphFinding.location,
      message,
      repairClass: 'NONE', source: 'spec-verdict',
    }));
  }
  for (const gap of verdict.traceabilityGate.gaps) {
    out.push(normalizedFinding({
      layer: 'traceability', code: gap.class, severity: 'error', spec,
      nodeId: gap.nodeId, location: { file: gap.file, line: gap.line },
      message: `${gap.class}: ${gap.nodeId}`,
      repairClass: 'NONE', source: 'spec-verdict',
    }));
  }
  for (const debt of verdict.evidence.bddSync.debt) {
    out.push(normalizedFinding({
      layer: 'bdd-sync', code: 'BDD_SYNC_DEBT', severity: 'error', spec,
      location: { file: `.specs/${spec}`, line: 1 }, message: debt,
      repairClass: 'NONE', source: 'spec-verdict',
    }));
  }
  return out;
}

function normalizePatchEdit(raw: unknown): PatchEdit | null {
  const value = asObject(raw);
  if (!value) return null;
  const spec = nonEmptyString(value.spec);
  const doc = nonEmptyString(value.doc);
  if (!spec || !doc) return null;
  const section = asObject(value.section);
  const replace = asObject(value.replace);
  const edit: PatchEdit = { spec, doc };
  if (typeof value.content === 'string') edit.content = value.content;
  if (section) edit.section = section as unknown as PatchEdit['section'];
  if (replace) edit.replace = replace as unknown as PatchEdit['replace'];
  if (typeof value.expected_sha === 'string') edit.expected_sha = value.expected_sha;
  const variants = Number(edit.content !== undefined) + Number(Boolean(edit.section)) + Number(Boolean(edit.replace));
  return variants === 1 ? edit : null;
}

function normalizeCandidates(raw: unknown): RepairCandidate[] {
  const values = Array.isArray(raw) ? raw : (Array.isArray(asObject(raw)?.candidates) ? asObject(raw)!.candidates as unknown[] : []);
  const candidates: RepairCandidate[] = [];
  for (const item of values) {
    const value = asObject(item);
    if (!value) continue;
    const spec = nonEmptyString(value.spec);
    const source = nonEmptyString(value.source);
    const repairClass = repairClassOf(value.repairClass, source === 'semantic');
    const edits = Array.isArray(value.edits) ? value.edits.map(normalizePatchEdit).filter((edit): edit is PatchEdit => Boolean(edit)) : [];
    if (!spec || !source) continue;
    candidates.push({
      id: nonEmptyString(value.id) ?? nonEmptyString(value.candidateId),
      source,
      repairClass,
      spec,
      findingFingerprints: Array.isArray(value.findingFingerprints) ? value.findingFingerprints.filter((v): v is string => typeof v === 'string') : undefined,
      findingCodes: Array.isArray(value.findingCodes) ? value.findingCodes.filter((v): v is string => typeof v === 'string') : undefined,
      dependencies: Array.isArray(value.dependencies) ? value.dependencies.filter((v): v is string => typeof v === 'string') : undefined,
      reason: nonEmptyString(value.reason),
      edits,
    });
  }
  return candidates;
}

function candidateId(candidate: RepairCandidate, index: number): string {
  return candidate.id ?? candidate.candidateId ?? sha256({ index, source: candidate.source, repairClass: candidate.repairClass, spec: candidate.spec, edits: candidate.edits });
}

function selectCandidates(
  spec: string,
  findings: NormalizedFinding[],
  candidates: RepairCandidate[],
): { selected: RepairCandidate[]; refusals: Array<{ candidateId: string; reason: string }> } {
  const openFingerprints = new Set(findings.map((finding) => finding.fingerprint));
  const openCodes = new Set(findings.map((finding) => finding.code));
  const selectedIds = new Set<string>();
  const targets = new Set<string>();
  const selected: RepairCandidate[] = [];
  const refusals: Array<{ candidateId: string; reason: string }> = [];
  const refuse = (id: string, reason: string): void => { refusals.push({ candidateId: id, reason }); };

  candidates.forEach((candidate, index) => {
    const id = candidateId(candidate, index);
    if (!ALLOWED_CANDIDATE_SOURCES.has(candidate.source)) return refuse(id, 'UNTRUSTED_SOURCE');
    if (candidate.repairClass !== 'SAFE_MCP_PATCH' && candidate.repairClass !== 'SANCTIONED_FORM') return refuse(id, 'NOT_AUTO_APPLICABLE');
    if (candidate.spec !== spec) return refuse(id, 'SPEC_MISMATCH');
    if (candidate.edits.length === 0) return refuse(id, 'NO_EDITS');
    if (candidate.findingFingerprints?.length && !candidate.findingFingerprints.every((fingerprint) => openFingerprints.has(fingerprint))) return refuse(id, 'FINDING_NOT_OPEN');
    if (candidate.findingCodes?.length && !candidate.findingCodes.every((code) => openCodes.has(code))) return refuse(id, 'FINDING_NOT_OPEN');
    if (candidate.dependencies?.some((dependency) => !selectedIds.has(dependency))) return refuse(id, 'DEPENDENCY_NOT_SELECTED');
    const candidateTargets: string[] = [];
    for (const edit of candidate.edits) {
      const normalizedDoc = edit.doc.replace(/\\/g, '/');
      if (edit.spec !== spec || normalizedDoc === '.progress.json' || normalizedDoc.endsWith('/.progress.json')) return refuse(id, 'UNSAFE_TARGET');
      const target = `${edit.spec}/${normalizedDoc}`;
      if (targets.has(target) || candidateTargets.includes(target)) return refuse(id, 'OVERLAPPING_EDIT');
      candidateTargets.push(target);
    }
    selected.push(candidate);
    selectedIds.add(id);
    candidateTargets.forEach((target) => targets.add(target));
  });
  return { selected, refusals };
}

export async function analyzeRemediation(input: RemediationInput): Promise<RemediationAnalysis> {
  const target = resolveTarget(input.repoRoot, input.spec);
  const reality = runChecks(target.specDir, target.repoRoot).findings
    .filter((finding) => finding.check !== 'CODE_DRIFT_SKIPPED')
    .map((finding) => normalizeReality(target.spec, finding));
  const semanticRaw = extractSemanticFindings(input.semanticFindings);
  const semantic = semanticRaw.map((finding, index) => normalizeSemantic(target.spec, finding, index)).filter((finding): finding is NormalizedFinding => Boolean(finding));
  const semanticInvalid: NormalizedFinding[] = semanticRaw.length === semantic.length
    ? []
    : [normalizedFinding({
        layer: 'semantic', code: 'SEMANTIC_ENVELOPE_INVALID', severity: 'error', spec: target.spec,
        location: { file: `.specs/${target.spec}`, line: 1 },
        message: `${semanticRaw.length - semantic.length} semantic finding(s) failed schema validation`,
        repairClass: 'DECISION_REQUIRED', source: 'semantic-envelope', owner: { kind: 'human', required: true },
      })];
  if (input.semanticRequired && semanticRaw.length === 0) {
    semanticInvalid.push(normalizedFinding({
      layer: 'semantic', code: 'SEMANTIC_RESULT_REQUIRED', severity: 'error', spec: target.spec,
      location: { file: `.specs/${target.spec}`, line: 1 },
      message: 'The current phase requires a structured semantic review envelope; none was supplied.',
      repairClass: 'DECISION_REQUIRED', source: 'semantic-envelope', owner: { kind: 'human', required: true },
    }));
  }
  const external = dedupeFindings([...reality, ...semantic, ...semanticInvalid]);
  const verdict = await analyzeSpec(`.specs/${target.spec}`, {
    cwd: target.repoRoot,
    externalFindings: external.map(externalFinding),
  });
  const findings = dedupeFindings([...normalizeVerdictFindings(target.spec, verdict), ...external]);
  const normalizedCandidates = normalizeCandidates(input.repairCandidates);
  const selection = selectCandidates(target.spec, findings, normalizedCandidates);
  return {
    spec: target.spec,
    snapshot: { ...verdict.snapshot, snapshotSha: sha256(verdict.snapshot) },
    verdict,
    findings,
    candidates: selection.selected,
    refusals: selection.refusals,
  };
}

export async function proposeSpecRepairs(input: RemediationInput): Promise<RemediationProposal> {
  const before = await analyzeRemediation(input);
  const affectedHashes: AffectedHashes = { before: { graphSha: before.snapshot.graphSha, documentShas: before.snapshot.documentShas, snapshotSha: before.snapshot.snapshotSha } };
  if (before.candidates.length === 0) {
    return {
      ok: false, spec: before.spec, before, selectedCandidates: [], refusals: before.refusals,
      affectedHashes,
      stopReason: before.findings.some((finding) => finding.repairClass === 'DECISION_REQUIRED') ? 'DECISION_REQUIRED' : 'NO_CANDIDATES',
    };
  }
  const edits = before.candidates.flatMap((candidate) => candidate.edits).map((edit) => ({
    ...edit,
    expected_sha: edit.expected_sha ?? before.snapshot.documentShas[edit.doc.replace(/\\/g, '/')],
  }));
  const preview = proposePatch(path.resolve(input.repoRoot), edits);
  const selectedCandidates = before.candidates.map(candidateId);
  proposalMeta.set(preview.proposal_id, {
    repoRoot: path.resolve(input.repoRoot), spec: before.spec, candidates: before.candidates,
    before, semanticFindings: input.semanticFindings, semanticRequired: input.semanticRequired,
  });
  return {
    ok: preview.ok, spec: before.spec, before, proposalId: preview.proposal_id, preview,
    selectedCandidates, refusals: before.refusals, affectedHashes,
    stopReason: preview.ok ? undefined : 'VALIDATION_FAILED',
  };
}

export async function applySpecRepairs(repoRootInput: string, proposalId: string): Promise<RemediationApply> {
  const repoRoot = path.resolve(repoRootInput);
  const meta = proposalMeta.get(proposalId);
  if (!meta || meta.repoRoot !== repoRoot) {
    throw new Error('PROPOSAL_NOT_FOUND: proposal was not issued by this remediation process');
  }
  const transaction = applyProposedPatch(repoRoot, proposalId);
  if (!transaction.ok) {
    const stopReason: RemediationStopReason = transaction.error === 'ROLLBACK_FAILED'
      ? 'ROLLBACK_FAILED'
      : transaction.error === 'WRITE_FAILED'
        ? 'WRITE_FAILED'
        : transaction.error === 'PROPOSAL_NOT_FOUND'
          ? 'PROPOSAL_NOT_FOUND'
          : transaction.edits.some((edit) => edit.error === 'CAS_MISMATCH')
            ? 'CAS_CONFLICT'
            : 'VALIDATION_FAILED';
    return {
      ok: false,
      spec: meta.spec,
      proposalId,
      transaction,
      final: meta.before,
      writes: 0,
      affectedHashes: {
        before: {
          graphSha: meta.before.snapshot.graphSha,
          documentShas: meta.before.snapshot.documentShas,
          snapshotSha: meta.before.snapshot.snapshotSha,
        },
      },
      stopReason,
    };
  }
  const final = await analyzeRemediation({ repoRoot, spec: meta.spec, semanticFindings: meta.semanticFindings, semanticRequired: meta.semanticRequired });
  const affectedHashes: AffectedHashes = {
    before: { graphSha: meta.before.snapshot.graphSha, documentShas: meta.before.snapshot.documentShas, snapshotSha: meta.before.snapshot.snapshotSha },
    after: { graphSha: final.snapshot.graphSha, documentShas: final.snapshot.documentShas, snapshotSha: final.snapshot.snapshotSha },
  };
  proposalMeta.delete(proposalId);
  const ready = final.verdict.verdict === 'GREEN' && final.verdict.readiness.overall === 'READY' && !final.findings.some((finding) => finding.severity === 'error');
  return { ok: true, spec: meta.spec, proposalId, transaction, final, writes: transaction.edits.length, affectedHashes, stopReason: ready ? 'READY' : 'NOT_READY' };
}

function sameSnapshot(left: SpecSnapshot, right: SpecSnapshot): boolean {
  return left.graphSha === right.graphSha && sha256(left.documentShas) === sha256(right.documentShas);
}

function findingSet(findings: NormalizedFinding[]): string {
  return sha256(findings.map((finding) => finding.fingerprint).sort());
}

export async function runRemediationLoop(options: RemediationLoopOptions): Promise<RemediationReport> {
  const mode = options.mode ?? 'check';
  const maxRounds = Math.max(1, Math.min(3, Math.trunc(options.maxRounds ?? 3)));
  let analysis = await analyzeRemediation(options);
  const before = { snapshot: analysis.snapshot, findings: analysis.findings };
  const rounds: RemediationRoundAttempt[] = [];
  const proposalIds: string[] = [];
  const appliedCandidates: string[] = [];
  let writes = 0;
  let stopReason: RemediationStopReason = 'NOT_READY';

  if (mode === 'check') {
    stopReason = analysis.verdict.verdict === 'GREEN' && analysis.verdict.readiness.overall === 'READY' && !analysis.findings.some((finding) => finding.severity === 'error') ? 'READY' : 'NOT_READY';
  } else {
    for (let round = 1; round <= maxRounds; round++) {
      const proposal = await proposeSpecRepairs(options);
      const attempt: RemediationRoundAttempt = {
        round, state: proposal.proposalId ? 'PROPOSED' : 'CHECKED', before: analysis.snapshot,
        beforeFindings: analysis.findings, selectedCandidates: proposal.selectedCandidates,
        refusedCandidates: proposal.refusals.map((refusal) => ({ id: refusal.candidateId, reason: refusal.reason })),
        proposalId: proposal.proposalId, applied: false, writes: 0,
      };
      if (!proposal.proposalId || mode === 'propose') {
        rounds.push(attempt);
        stopReason = proposal.stopReason ?? 'NO_CANDIDATES';
        analysis = proposal.before;
        break;
      }
      const applied = await applySpecRepairs(options.repoRoot, proposal.proposalId);
      proposalIds.push(proposal.proposalId);
      appliedCandidates.push(...proposal.selectedCandidates);
      writes += applied.writes;
      attempt.applied = applied.ok;
      attempt.writes = applied.writes;
      attempt.after = applied.final.snapshot;
      attempt.afterFindings = applied.final.findings;
      attempt.affectedHashes = applied.affectedHashes;
      attempt.state = applied.ok ? 'APPLIED' : 'FAILED';
      attempt.stopReason = applied.stopReason;
      rounds.push(attempt);
      const previous = analysis;
      analysis = applied.final;
      if (!applied.ok) { stopReason = applied.stopReason; break; }
      if (analysis.verdict.verdict === 'GREEN' && analysis.verdict.readiness.overall === 'READY' && !analysis.findings.some((finding) => finding.severity === 'error')) { stopReason = 'READY'; break; }
      if (sameSnapshot(previous.snapshot, analysis.snapshot) && findingSet(previous.findings) === findingSet(analysis.findings)) { stopReason = 'NO_PROGRESS'; break; }
      if (analysis.findings.some((finding) => finding.repairClass === 'DECISION_REQUIRED') && analysis.candidates.length === 0) { stopReason = 'DECISION_REQUIRED'; break; }
      stopReason = round === maxRounds ? 'BUDGET_EXCEEDED' : 'NOT_READY';
    }
  }

  // Mandatory full pass after every mode/round sequence.
  const finalAnalysis = await analyzeRemediation(options);
  const ready = finalAnalysis.verdict.verdict === 'GREEN'
    && finalAnalysis.verdict.readiness.overall === 'READY'
    && !finalAnalysis.findings.some((finding) => finding.severity === 'error');
  if (ready) stopReason = 'READY';
  const state: RemediationState = ready ? 'READY'
    : stopReason === 'DECISION_REQUIRED' ? 'REFUSED'
      : mode === 'propose' ? 'PROPOSABLE'
        : 'NOT_READY';
  return {
    spec: finalAnalysis.spec,
    state,
    stopReason,
    before,
    applied: { writes, proposalIds, candidates: appliedCandidates },
    remaining: finalAnalysis.findings,
    final: {
      snapshot: finalAnalysis.snapshot, findings: finalAnalysis.findings,
      verdict: finalAnalysis.verdict.verdict, readiness: finalAnalysis.verdict.readiness.overall,
    },
    rounds,
    refusals: finalAnalysis.refusals,
    affectedHashes: {
      before: { graphSha: before.snapshot.graphSha, documentShas: before.snapshot.documentShas, snapshotSha: before.snapshot.snapshotSha },
      after: { graphSha: finalAnalysis.snapshot.graphSha, documentShas: finalAnalysis.snapshot.documentShas, snapshotSha: finalAnalysis.snapshot.snapshotSha },
    },
    evidence: { graphSha: finalAnalysis.snapshot.graphSha, documentShas: finalAnalysis.snapshot.documentShas, snapshotSha: finalAnalysis.snapshot.snapshotSha },
  };
}

interface CliOptions extends RemediationLoopOptions {
  format: 'human' | 'json';
}

function parseArgs(argv: string[]): CliOptions {
  let spec = '';
  let mode: CliOptions['mode'] = 'check';
  let format: CliOptions['format'] = 'human';
  let maxRounds = 3;
  let semanticFile: string | undefined;
  let repairsFile: string | undefined;
  let repoRoot = process.cwd();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--spec') spec = argv[++index] ?? '';
    else if (arg === '--mode') mode = argv[++index] as CliOptions['mode'];
    else if (arg === '--format') format = argv[++index] as CliOptions['format'];
    else if (arg === '--max-rounds') maxRounds = Number(argv[++index]);
    else if (arg === '--semantic-file') semanticFile = argv[++index];
    else if (arg === '--repairs-file') repairsFile = argv[++index];
    else if (arg === '--repo-root') repoRoot = argv[++index] ?? repoRoot;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!spec) throw new Error('Missing --spec <slug|.specs/slug>');
  if (!['check', 'propose', 'repair'].includes(mode ?? '')) throw new Error(`Invalid --mode: ${mode}`);
  if (!['human', 'json'].includes(format)) throw new Error(`Invalid --format: ${format}`);
  const readJson = (file: string | undefined): unknown => file ? JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) : undefined;
  return { repoRoot: path.resolve(repoRoot), spec, mode, format, maxRounds, semanticFindings: readJson(semanticFile), repairCandidates: readJson(repairsFile) };
}

function renderRemediation(report: RemediationReport): string {
  const lines = [
    `Spec remediation: ${report.spec}`,
    `Before: ${report.before.findings.length} finding(s)`,
    `Applied: ${report.applied.writes} write(s) through ${report.applied.proposalIds.length} proposal(s)`,
    `Remaining: ${report.remaining.length} finding(s)`,
    `Convergence: ${report.stopReason}`,
    `Final: ${report.final.verdict} / ${report.final.readiness}`,
  ];
  for (const finding of report.remaining.slice(0, 20)) lines.push(`  [${finding.severity}] ${finding.layer}/${finding.code}: ${finding.message}`);
  if (report.remaining.length > 20) lines.push(`  … and ${report.remaining.length - 20} more`);
  return lines.join('\n');
}

const isDirectRun = (() => {
  try {
    const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
    return /\/spec-remediation\.(?:ts|js|mjs)$/.test(entry);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await runRemediationLoop(options);
    process.stdout.write(options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : `${renderRemediation(report)}\n`);
    process.exit(report.stopReason === 'READY' ? 0 : 1);
  } catch (error) {
    process.stderr.write(`spec-remediation: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

export { renderRemediation, renderVerdict };
