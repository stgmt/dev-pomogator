import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { JournalEvent } from './journal.ts';
import { readRunState, runDirectory, TERMINAL_RUN_STATES } from './run-state.ts';

export interface ReplayResult {
  status: 'REPLAYED' | 'REPLAY_UNAVAILABLE';
  runId: string;
  completedOutputs: string[];
  missing: string[];
  reason?: string;
}

function contained(root: string, reference: string): string | null {
  if (!reference || path.isAbsolute(reference)) return null;
  const resolvedRoot = fs.realpathSync.native(root);
  const candidate = path.resolve(root, reference);
  const relative = path.relative(resolvedRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    const real = fs.realpathSync.native(candidate);
    const realRelative = path.relative(resolvedRoot, real);
    return !realRelative.startsWith('..') && !path.isAbsolute(realRelative) ? real : null;
  } catch {
    return null;
  }
}

function sha256(target: string): string {
  return createHash('sha256').update(fs.readFileSync(target)).digest('hex');
}

export function replayOffline(repoRoot: string, runId: string): ReplayResult {
  const root = runDirectory(repoRoot, runId);
  const journalPath = path.join(root, 'progress.jsonl');
  const terminalPath = path.join(root, 'terminal.json');
  if (!fs.existsSync(journalPath) || !fs.existsSync(terminalPath)) return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['progress.jsonl', 'terminal.json'], reason: 'producer evidence missing' };
  let state;
  try { state = readRunState(repoRoot, runId); } catch { return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['state.json'], reason: 'authoritative run state missing' }; }
  if (!TERMINAL_RUN_STATES.has(state.state as never)) return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['terminal run state'], reason: `run state is not terminal: ${state.state}` };
  const events = fs.readFileSync(journalPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as JournalEvent);
  let lastSeq = 0;
  for (const event of events) {
    if (event.runId !== runId || event.seq !== lastSeq + 1) return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['monotonic compatible journal'], reason: 'journal incompatible' };
    lastSeq = event.seq;
  }
  const terminal = JSON.parse(fs.readFileSync(terminalPath, 'utf8')) as { runId?: string; ownerStopped?: boolean; descendantsRemaining?: number; writersRemaining?: number };
  if (terminal.runId !== runId || terminal.ownerStopped !== true || terminal.descendantsRemaining !== 0 || terminal.writersRemaining !== 0) {
    return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['compatible terminal evidence'], reason: 'terminal evidence incompatible' };
  }
  if (events.some((event) => event.runId !== runId || event.ownerInstanceId !== state.ownerInstanceId || event.fencingToken !== state.fencingToken || event.ownerPid !== state.ownerProcess.pid)) {
    return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs: [], missing: ['fenced journal provenance'], reason: 'journal identity does not match authoritative state' };
  }
  const successful = events.filter((event) => event.status === 'success' && event.outputRef);
  const completedOutputs = successful.map((event) => event.outputRef!);
  const missing: string[] = [];
  for (const event of successful) {
    const target = contained(root, event.outputRef!);
    if (!target || !event.outputHash || sha256(target) !== event.outputHash) missing.push(event.outputRef!);
  }
  if (missing.length) return { status: 'REPLAY_UNAVAILABLE', runId, completedOutputs, missing, reason: 'referenced output is missing, outside the run, or hash-incompatible' };
  return { status: 'REPLAYED', runId, completedOutputs, missing: [] };
}
