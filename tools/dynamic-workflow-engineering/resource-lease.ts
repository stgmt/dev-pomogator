export interface ResourceIdentity {
  repositoryRoot: string;
  worktreeRoot: string;
  gitSha: string;
  runId: string;
  ownerInstanceId: string;
  leaseId: string;
  mountSource: string;
}

export function decideResourceReuse(expected: ResourceIdentity, actual: Partial<ResourceIdentity> | null): { action: 'reuse' | 'replace-owned-expired' | 'block-foreign'; reason: string } {
  if (!actual) return { action: 'replace-owned-expired', reason: 'resource absent' };
  const identityKeys: Array<keyof ResourceIdentity> = ['repositoryRoot', 'worktreeRoot', 'gitSha', 'runId', 'ownerInstanceId', 'leaseId', 'mountSource'];
  const matches = identityKeys.every((key) => actual[key] === expected[key]);
  if (matches) return { action: 'reuse', reason: 'ownership labels and actual mount source match' };
  const owned = actual.repositoryRoot === expected.repositoryRoot && actual.ownerInstanceId === expected.ownerInstanceId;
  return owned ? { action: 'replace-owned-expired', reason: 'owned identity is stale or mount source changed' } : { action: 'block-foreign', reason: 'foreign-owned resource must not be deleted or replaced' };
}
