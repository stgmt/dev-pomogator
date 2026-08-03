export interface LiveEvidenceValidationOptions {
  manifestPath: string;
  repoRoot?: string;
  expectedScenarios?: Record<string, 'PASSED'>;
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
