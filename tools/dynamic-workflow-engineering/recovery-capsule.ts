export interface RecoveryCapsule {
  root: string;
  owner: string;
  baseSha: string;
  dirtyPaths: string[];
  acceptedEvidenceOrCommits: string[];
  unprovenWork: string[];
  lastGreenGate: string | null;
  blocker: string | null;
  nextAction: string;
  doNotTouch: string[];
}

export function createRecoveryCapsule(input: RecoveryCapsule, maxBytes = 3 * 1024): RecoveryCapsule {
  const normalized: RecoveryCapsule = {
    ...input,
    dirtyPaths: [...new Set(input.dirtyPaths)].slice(0, 50),
    acceptedEvidenceOrCommits: [...new Set(input.acceptedEvidenceOrCommits)].slice(0, 30),
    unprovenWork: [...new Set(input.unprovenWork)].slice(0, 30),
    doNotTouch: [...new Set(input.doNotTouch)].slice(0, 50),
    blocker: input.blocker?.slice(0, 512) ?? null,
    nextAction: input.nextAction.slice(0, 512),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > maxBytes) throw new Error('DWE_RECOVERY_CAPSULE_TOO_LARGE');
  return normalized;
}

export function assertResumeAllowed(stopState: 'PAUSED_RESUMABLE' | 'TERMINATED_NO_RESUME'): void {
  if (stopState === 'TERMINATED_NO_RESUME') throw new Error('DWE_OLD_CONTEXT_RESUME_DENIED');
}
