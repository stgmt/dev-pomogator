export interface LiveEvidenceValidationOptions {
  manifestPath: string;
  repoRoot?: string;
  /** Scenario ids that must each have a PASSED record in the manifest. */
  expectedScenarios?: Record<string, 'PASSED'>;
  /** Scenario ids that must each have one record for the exact producer profile. */
  expectedProfiles?: Record<string, string>;
}

export interface LiveEvidenceIssue {
  code: string;
  message: string;
  path: string;
}

export interface LiveEvidenceValidationResult {
  ok: boolean;
  errors: LiveEvidenceIssue[];
  records: unknown[];
  traceRelative?: string | null;
}

export function validateLiveEvidence(options: LiveEvidenceValidationOptions): LiveEvidenceValidationResult;
export function assertLiveEvidence(options: LiveEvidenceValidationOptions): LiveEvidenceValidationResult;
export function digestWorkspace(repoRoot: string, files: string[]): string;
export function digestTraceEvent(event: Record<string, unknown>): string;
