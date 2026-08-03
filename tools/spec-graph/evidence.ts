import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { EvidenceNode, FrNode, SpecGraph } from './types.ts';
import type { DeliveryDemand, RequirementMetadata } from './metadata-schema.ts';

export type EvidenceState = 'PRESENT' | 'MISSING';

export interface EvidenceManifestInput {
  schemaVersion: 1;
  path: string;
  kind: string;
  mediaType: string;
  sha256: string;
  byteSize: number;
  producer: string;
  runId: string;
  finalizedAt: string;
  subjectRevision: string;
  reviewer?: string;
  judgeInvocation?: string;
  reviewedDigest?: string;
  reviewStatus?: EvidenceNode['reviewStatus'];
}

export interface EvidenceEvaluation {
  state: EvidenceState;
  reason: string;
  manifest: EvidenceManifestInput;
}

const HEX_SHA256 = /^[a-f0-9]{64}$/i;

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function withinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function reviewState(manifest: EvidenceManifestInput): { ok: boolean; reason?: string } {
  if (manifest.reviewStatus === undefined) return { ok: true };
  if (manifest.reviewer && manifest.reviewer === manifest.producer) return { ok: false, reason: 'reviewer equals producer' };
  if (!manifest.reviewer || !manifest.producer) return { ok: false, reason: 'review identity missing' };
  if (manifest.reviewedDigest !== manifest.sha256) return { ok: false, reason: 'review digest mismatch' };
  if (manifest.reviewStatus !== 'CONFIRMED') return { ok: false, reason: `review status ${manifest.reviewStatus}` };
  return { ok: true };
}

export function evaluateEvidence(repoRoot: string, spec: string, manifest: EvidenceManifestInput, expectedSubjectRevision?: string): EvidenceEvaluation {
  const attachmentRoot = path.resolve(repoRoot, '.specs', spec, 'attachments');
  const candidate = path.resolve(attachmentRoot, manifest.path);
  let reason = 'valid';
  let state: EvidenceState = 'PRESENT';
  if (manifest.schemaVersion !== 1) reason = 'schema version mismatch';
  else if (!manifest.path || path.isAbsolute(manifest.path) || !withinRoot(attachmentRoot, candidate)) reason = 'path outside attachment root';
  else if (!Number.isSafeInteger(manifest.byteSize) || manifest.byteSize <= 0) reason = 'invalid byte size';
  else if (!HEX_SHA256.test(manifest.sha256)) reason = 'invalid sha256';
  else if (!manifest.finalizedAt) reason = 'artifact not finalized';
  else if (!fs.existsSync(candidate)) reason = 'artifact missing';
  else {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) reason = 'artifact is not regular';
    else if (stat.size <= 0) reason = 'artifact is empty';
    else if (stat.size !== manifest.byteSize) reason = 'byte size mismatch';
    else if (sha256File(candidate).toLowerCase() !== manifest.sha256.toLowerCase()) reason = 'digest mismatch';
    else if (expectedSubjectRevision && manifest.subjectRevision !== expectedSubjectRevision) reason = 'stale for subject revision';
    else {
      const review = reviewState(manifest);
      if (!review.ok) reason = review.reason ?? 'invalid independent review';
    }
  }
  if (reason !== 'valid') state = 'MISSING';
  return { state, reason, manifest };
}

export function evidenceNodeId(manifest: EvidenceManifestInput): string {
  return `EVIDENCE-${manifest.sha256.toLowerCase()}`;
}

export function addEvidence(graph: SpecGraph, repoRoot: string, spec: string, subjectId: string, manifest: EvidenceManifestInput, expectedSubjectRevision?: string): EvidenceEvaluation {
  const evaluation = evaluateEvidence(repoRoot, spec, manifest, expectedSubjectRevision);
  const node: EvidenceNode = {
    id: evidenceNodeId(manifest), type: 'Evidence', spec, file: `.specs/${spec}/attachments/${manifest.path}`, line: 1,
    ...manifest, state: evaluation.state, stateReason: evaluation.reason === 'valid' ? undefined : evaluation.reason,
  };
  graph.nodes.set(node.id, node);
  graph.edges.push({ from: subjectId, to: node.id, type: 'evidenced-by' });
  return evaluation;
}

export function impliedOperationalProof(metadata: RequirementMetadata | undefined): DeliveryDemand | null {
  const method = metadata?.verificationMethod;
  if ((method !== 'demonstration' && method !== 'inspection') || metadata?.demands.some((d) => d.type === 'operational-proof')) return null;
  return { type: 'operational-proof', obligation: 'required', rationale: `implied by verification method ${method}` };
}

export function evidenceReadyForRequirement(node: FrNode, graph: SpecGraph): boolean {
  const operational = [...(node.metadata?.demands ?? []), ...(impliedOperationalProof(node.metadata) ? [impliedOperationalProof(node.metadata)!] : [])]
    .filter((d) => d.type === 'operational-proof' && d.obligation === 'required');
  if (operational.length === 0) return true;
  return graph.edges.some((e) => e.from === node.id && e.type === 'evidenced-by' && graph.nodes.get(e.to)?.type === 'Evidence' && (graph.nodes.get(e.to) as EvidenceNode).state === 'PRESENT');
}
