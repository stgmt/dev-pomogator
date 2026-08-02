import { forceKillProcessTree, signalProcessTree } from '../_shared/process-tree.ts';

export interface OwnedProcessTree {
  ownerPid: number;
  descendantPids: number[];
  writerPids: number[];
  foreignPids: number[];
}

export interface TerminalProcessEvidence {
  ownerStopped: boolean;
  descendantsRemaining: number;
  writersRemaining: number;
  foreignProcessesUntouched: number;
  controlMode: 'hard cancellation' | 'best-effort';
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export async function stopOwnedProcessTree(tree: OwnedProcessTree, options: { graceMs?: number; hardCancellationProven?: boolean } = {}): Promise<TerminalProcessEvidence> {
  const graceMs = options.graceMs ?? 1_000;
  signalProcessTree(tree.ownerPid);
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  const stillOwned = [tree.ownerPid, ...tree.descendantPids, ...tree.writerPids].filter(alive);
  if (stillOwned.length) {
    forceKillProcessTree(tree.ownerPid);
    await new Promise((resolve) => setTimeout(resolve, Math.min(graceMs, 500)));
  }
  return {
    ownerStopped: !alive(tree.ownerPid),
    descendantsRemaining: tree.descendantPids.filter(alive).length,
    writersRemaining: tree.writerPids.filter(alive).length,
    foreignProcessesUntouched: tree.foreignPids.filter(alive).length,
    controlMode: options.hardCancellationProven ? 'hard cancellation' : 'best-effort',
  };
}
