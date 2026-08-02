export type FindingVerdict = 'CONFIRMED' | 'PLAUSIBLE' | 'REFUTED' | 'BLOCKED';

export interface BoundedFinding {
  id: string;
  location: string;
  allowedInput: string;
  expectedOutput: string;
  wrongOutput: string;
  reproductionEvidence: string[];
  surroundingGates: string[];
}

export interface VerificationResult {
  findingId: string;
  verdict: FindingVerdict;
  evidence: string[];
  unverifiedScope: string[];
}

export function verifyBoundedFinding(finding: BoundedFinding, probes: {
  locationExists: boolean;
  inputAllowed: boolean;
  reachable: boolean | null;
  reproduced: boolean | null;
  refutedByGate?: string;
  blockedReason?: string;
}): VerificationResult {
  if (probes.blockedReason) return { findingId: finding.id, verdict: 'BLOCKED', evidence: [probes.blockedReason], unverifiedScope: ['reproduction'] };
  if (!probes.locationExists || !probes.inputAllowed || probes.refutedByGate) {
    return { findingId: finding.id, verdict: 'REFUTED', evidence: [probes.refutedByGate ?? 'premise or input contract is false'], unverifiedScope: [] };
  }
  if (probes.reachable === false || probes.reproduced === false) return { findingId: finding.id, verdict: 'REFUTED', evidence: ['reachable wrong output was not reproduced'], unverifiedScope: [] };
  if (probes.reachable === true && probes.reproduced === true && finding.reproductionEvidence.length) {
    return { findingId: finding.id, verdict: 'CONFIRMED', evidence: finding.reproductionEvidence, unverifiedScope: [] };
  }
  return { findingId: finding.id, verdict: 'PLAUSIBLE', evidence: finding.reproductionEvidence, unverifiedScope: ['reachability or deterministic reproduction'] };
}
