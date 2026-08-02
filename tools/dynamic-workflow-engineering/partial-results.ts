export type BranchStatus = 'completed' | 'failed' | 'blocked' | 'dropped';

export interface BranchResult<T = unknown> {
  id: string;
  required: boolean;
  status: BranchStatus;
  output?: T;
  evidenceRef?: string;
  reason?: string;
}

export interface SynthesisResult<T = unknown> {
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  completed: BranchResult<T>[];
  missing: BranchResult<T>[];
  blocked: BranchResult<T>[];
  dropped: BranchResult<T>[];
}

export function synthesizeBranches<T>(results: BranchResult<T>[]): SynthesisResult<T> {
  const ids = results.map((result) => result.id);
  if (new Set(ids).size !== ids.length) throw new Error('DWE_DUPLICATE_BRANCH_RESULT');
  const completed = results.filter((result) => result.status === 'completed');
  for (const result of completed) {
    if (result.output === undefined || !result.evidenceRef) throw new Error(`DWE_COMPLETED_BRANCH_UNPROVEN:${result.id}`);
  }
  const missing = results.filter((result) => result.required && result.status !== 'completed');
  const blocked = results.filter((result) => result.status === 'blocked');
  const dropped = results.filter((result) => result.status === 'dropped');
  return {
    status: missing.length === 0 ? 'COMPLETE' : completed.length ? 'PARTIAL' : 'FAILED',
    completed,
    missing,
    blocked,
    dropped,
  };
}
