/**
 * FR-64 release inventory: pure, graph-adjacent evidence controls for a release
 * candidate.  This deliberately accepts concrete producer output rather than
 * inferring success from documentation or a source-tree test run.
 */
import type { EvidenceOutcome } from './readiness-inventory.ts';

export type ReleaseArtifactClass =
  | 'source'
  | 'spec-test'
  | 'generated'
  | 'temporary'
  | 'smoke'
  | 'unclassified'
  | 'silent';

export interface ReleaseArtifact {
  path: string;
  tracked: boolean;
  classification?: ReleaseArtifactClass;
  intentional?: boolean;
  traceability_edges?: string[];
}

export interface ReleaseUnit {
  id: string;
  outcome: EvidenceOutcome | 'NOT_RUN';
  in_scope: boolean;
  source?: string;
  run_id?: string;
}

export interface InstalledRuntimeEvidence {
  baseline_sha: string;
  run_id: string;
  evidence_source: 'installed-runtime' | 'source-tree';
  dependencies_absent: boolean;
  missing_runtime?: 'import' | 'bundle' | 'asset';
  outcome: EvidenceOutcome | 'NOT_RUN';
}

export interface ReleaseCandidateControl {
  candidate: { pr?: string; github_release?: string; tag?: string; commit: string };
  documentation: { readme: boolean; tasks: boolean; changelog: boolean; release_notes: boolean };
  owner?: string;
  monitoring_signal?: string;
  rollback_action?: string;
  follow_up_verification?: string;
  evidence?: InstalledRuntimeEvidence;
}

export interface ReleaseInventoryInput {
  baseline_sha: string;
  pre_tracked: string[];
  post_tracked: string[];
  artifacts: ReleaseArtifact[];
  units: ReleaseUnit[];
  candidate?: ReleaseCandidateControl;
}

export interface ReleaseInventoryResult {
  status: 'READY' | 'NOT_READY';
  baseline_sha: string;
  artifacts: Array<Required<Pick<ReleaseArtifact, 'path' | 'tracked' | 'classification' | 'intentional' | 'traceability_edges'>>>;
  outcomes: Record<string, number>;
  additions: string[];
  removals: string[];
  duplicates: string[];
  violations: string[];
}

const KNOWN_OUTCOMES = ['PASSED', 'FAILED', 'PENDING', 'UNDEFINED', 'AMBIGUOUS', 'NOT_RUN', 'not_recorded'] as const;
const CLEAN_ARTIFACTS = new Set<ReleaseArtifactClass>(['source', 'spec-test', 'generated', 'temporary', 'smoke']);

/** Classify a path conservatively; unknown paths must be explicitly approved. */
export function classifyReleaseArtifact(path: string): ReleaseArtifactClass {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  if (/(?:^|\/)(?:\.specs\/|tests?\/)|\.(?:feature|test\.[cm]?[jt]s|spec\.[cm]?[jt]s)$/.test(normalized)) return 'spec-test';
  if (/(?:^|\/)(?:dist|coverage|build)\//.test(normalized)) return 'generated';
  if (/(?:^|\/)(?:\.tmp|tmp|temp)\//.test(normalized) || /(?:~|\.tmp)$/.test(normalized)) return 'temporary';
  if (/(?:^|\/)(?:\.docker-status|smoke)(?:\/|$)/.test(normalized)) return 'smoke';
  if (/\.(?:ts|mts|cts|js|mjs|cjs|json|ya?ml|md|ps1|sh)$/.test(normalized)) return 'source';
  return 'unclassified';
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * All-unit AND gate. It preserves every outcome, rejects unknown/silent
 * artifacts, verifies pre/post tracked conservation and requires candidate
 * operations evidence where a candidate is supplied.
 */
export function evaluateReleaseInventory(input: ReleaseInventoryInput): ReleaseInventoryResult {
  const violations: string[] = [];
  const pathCounts = new Map<string, number>();
  const artifacts = input.artifacts.map((artifact) => {
    const classification = artifact.classification ?? classifyReleaseArtifact(artifact.path);
    const record = {
      path: artifact.path.replace(/\\/g, '/'),
      tracked: artifact.tracked,
      classification,
      intentional: artifact.intentional === true,
      traceability_edges: artifact.traceability_edges ?? [],
    };
    pathCounts.set(record.path, (pathCounts.get(record.path) ?? 0) + 1);
    if (classification === 'unclassified' || classification === 'silent') {
      violations.push(`UNCLASSIFIED_ARTIFACT:${record.path}`);
    } else if (!CLEAN_ARTIFACTS.has(classification) || !record.intentional || record.traceability_edges.length === 0) {
      violations.push(`UNPROVEN_ARTIFACT:${record.path}`);
    }
    if (!record.tracked && (classification === 'unclassified' || classification === 'silent')) {
      violations.push(`UNTRACKED_UNCLASSIFIED:${record.path}`);
    }
    return record;
  });
  const duplicates = [...pathCounts].filter(([, count]) => count > 1).map(([path]) => path).sort();
  if (duplicates.length) violations.push(`DUPLICATE_ARTIFACTS:${duplicates.join(',')}`);

  const pre = new Set(input.pre_tracked.map((p) => p.replace(/\\/g, '/')));
  const post = new Set(input.post_tracked.map((p) => p.replace(/\\/g, '/')));
  const additions = [...post].filter((p) => !pre.has(p)).sort();
  const removals = [...pre].filter((p) => !post.has(p)).sort();
  if (additions.length || removals.length) violations.push(`TRACKED_CONSERVATION:add=${additions.join(',')};remove=${removals.join(',')}`);

  const outcomes = Object.fromEntries(KNOWN_OUTCOMES.map((outcome) => [outcome, 0])) as Record<string, number>;
  for (const unit of input.units.filter((u) => u.in_scope)) {
    outcomes[unit.outcome] = (outcomes[unit.outcome] ?? 0) + 1;
    if (unit.outcome !== 'PASSED') violations.push(`NON_PASS_UNIT:${unit.id}:${unit.outcome}`);
  }

  const candidate = input.candidate;
  if (candidate) {
    if (!candidate.candidate.commit || (!candidate.candidate.pr && !candidate.candidate.github_release && !candidate.candidate.tag)) violations.push('CANDIDATE_IDENTITY_MISSING');
    if (!Object.values(candidate.documentation).every(Boolean)) violations.push('CANDIDATE_DOCUMENTATION_MISSING');
    for (const [key, value] of Object.entries({ owner: candidate.owner, monitoring: candidate.monitoring_signal, rollback: candidate.rollback_action, follow_up: candidate.follow_up_verification })) {
      if (!value) violations.push(`CANDIDATE_${key.toUpperCase()}_MISSING`);
    }
    const evidence = candidate.evidence;
    if (!evidence) violations.push('INSTALLED_RUNTIME_NOT_RECORDED');
    else {
      if (evidence.baseline_sha !== input.baseline_sha || !evidence.run_id || evidence.evidence_source !== 'installed-runtime') violations.push('INSTALLED_RUNTIME_PROVENANCE_INVALID');
      if (!evidence.dependencies_absent || evidence.outcome !== 'PASSED' || evidence.missing_runtime) violations.push(`INSTALLED_RUNTIME_NON_PASS:${evidence.outcome}`);
    }
  }
  return { status: violations.length === 0 ? 'READY' : 'NOT_READY', baseline_sha: input.baseline_sha, artifacts, outcomes, additions, removals, duplicates, violations: stableUnique(violations) };
}
