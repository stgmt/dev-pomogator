import type { Finding, FindingCode } from './conformance.ts';
import {
  evaluateReadiness,
  type ReadinessCandidate,
  type ReadinessEvaluation,
} from './readiness-inventory.ts';

/** The only top-level completion vocabulary exposed to CLI/MCP consumers. */
export type SpecVerdict = 'GREEN' | 'RED' | 'NOT_READY';

/** Why an authored completion claim is not backed by canonical evidence. */
export interface UnverifiedCompletion {
  code: 'UNVERIFIED_COMPLETION';
  severity: 'error';
  node: string;
  reasons: Array<'EVIDENCE_STALE' | 'BODY_WEAK' | 'NO_SCENARIO' | 'FILTERED_ONLY' | 'NON_PASSING_EVIDENCE'>;
  source_codes: FindingCode[];
}

export interface CanonicalSpecVerdict {
  schema: 'spec-verdict@1';
  verdict: SpecVerdict;
  readiness: ReadinessEvaluation;
  blocking: Array<Finding | UnverifiedCompletion>;
}

const COMPLETION_FINDING_CODES = new Set<FindingCode>([
  'UNVERIFIED_COMPLETION',
  'TASK_STATUS_UNVERIFIED',
  'TASK_UNTESTED',
  'TASK_TEST_QUALITY',
]);

/**
 * Collapse the several task-level ways of saying “DONE without proof” into one
 * stable public finding while retaining the original source codes and reasons.
 */
export function unverifiedCompletions(findings: Finding[]): UnverifiedCompletion[] {
  type CompletionReason = UnverifiedCompletion['reasons'][number];
  const byNode = new Map<string, { reasons: CompletionReason[]; sourceCodes: Set<FindingCode> }>();
  const reasonFor = (finding: Finding): CompletionReason => {
    if (finding.relatedId === 'NO_SCENARIO' || finding.code === 'TASK_UNTESTED') return 'NO_SCENARIO';
    if (finding.relatedId === 'FILTERED_ONLY') return 'FILTERED_ONLY';
    if (finding.relatedId === 'EVIDENCE_STALE') return 'EVIDENCE_STALE';
    if (finding.relatedId === 'BODY_WEAK' || finding.code === 'TASK_TEST_QUALITY') return 'BODY_WEAK';
    return 'NON_PASSING_EVIDENCE';
  };
  for (const finding of findings) {
    if (!COMPLETION_FINDING_CODES.has(finding.code)) continue;
    const node = finding.nodeId ?? `${finding.location.file}:${finding.location.line}`;
    const entry = byNode.get(node) ?? { reasons: [], sourceCodes: new Set<FindingCode>() };
    entry.reasons.push(reasonFor(finding));
    entry.sourceCodes.add(finding.code);
    byNode.set(node, entry);
  }
  return [...byNode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([node, entry]) => ({
      code: 'UNVERIFIED_COMPLETION',
      severity: 'error',
      node,
      reasons: [...new Set(entry.reasons)],
      source_codes: [...entry.sourceCodes].sort(),
    }));
}

/**
 * Canonical AND-composed verdict. A graph can be structurally RED, or clean but
 * NOT_READY; GREEN is reserved for a graph whose mandatory readiness lanes all
 * have positive evidence.
 */
export function computeSpecVerdict(
  candidate: ReadinessCandidate,
  findings: Finding[] = [],
): CanonicalSpecVerdict {
  const readiness = evaluateReadiness(candidate);
  const completionDebt = unverifiedCompletions(findings);
  const errors = findings.filter((finding) => finding.severity === 'error' && finding.code !== 'UNVERIFIED_COMPLETION');
  const blocking: Array<Finding | UnverifiedCompletion> = [...errors, ...completionDebt];
  const verdict: SpecVerdict = errors.length > 0
    ? 'RED'
    : readiness.overall === 'READY' && completionDebt.length === 0
      ? 'GREEN'
      : 'NOT_READY';
  return { schema: 'spec-verdict@1', verdict, readiness, blocking };
}
