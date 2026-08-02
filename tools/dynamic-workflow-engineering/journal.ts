import fs from 'node:fs';
import path from 'node:path';
import { assertAuthority, readRunState, runDirectory, TERMINAL_RUN_STATES, writeJsonAtomic } from './run-state.ts';
import { sha256, stableJson } from './packet.ts';

export type JournalStatus = 'start' | 'progress' | 'success' | 'failure' | 'blocked' | 'terminal';

export interface JournalEvent {
  schemaVersion: 1;
  runId: string;
  seq: number;
  at: string;
  ownerTaskId: string;
  ownerPid: number;
  worktree: string;
  phase: string;
  gateId: string | null;
  status: JournalStatus;
  logicalCallKey?: string;
  physicalAttempt?: number;
  counters?: Record<string, number>;
  inputHash?: string;
  strategyHash?: string;
  failureSignature?: string;
  outputRef?: string;
  outputHash?: string;
  ownerInstanceId: string;
  fencingToken: number;
  reasonCode?: string;
}

const SECRET = /\b(?:sk|or|ghp|gho|ghu|ghs|ghr|xox[baprs])-[A-Za-z0-9_-]{8,}\b|github_pat_[A-Za-z0-9_]{8,}/gi;

export function redactJournalValue(value: string): string {
  return value.replace(SECRET, '[REDACTED]').slice(0, 2_000);
}

export function createRunJournal(repoRoot: string, runId: string): string {
  const root = runDirectory(repoRoot, runId);
  fs.mkdirSync(path.join(root, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const progress = path.join(root, 'progress.jsonl');
  if (!fs.existsSync(progress)) fs.writeFileSync(progress, '', { flag: 'wx', mode: 0o600 });
  return root;
}

export function appendJournalEvent(repoRoot: string, event: Omit<JournalEvent, 'schemaVersion' | 'seq' | 'at'>): JournalEvent {
  const root = createRunJournal(repoRoot, event.runId);
  const target = path.join(root, 'progress.jsonl');
  const lock = `${target}.lock`;
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  try {
  const state = readRunState(repoRoot, event.runId);
  assertAuthority(state, event.ownerInstanceId, event.fencingToken);
  if (state.ownerProcess.pid !== event.ownerPid) throw new Error('DWE_STALE_JOURNAL_PROCESS');
  const rows = fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean);
  const previous = rows.length ? JSON.parse(rows.at(-1)!) as JournalEvent : undefined;
  if (previous && (previous.ownerInstanceId !== event.ownerInstanceId || previous.fencingToken !== event.fencingToken)) throw new Error('DWE_STALE_JOURNAL_WRITER');
  const next: JournalEvent = {
    ...event,
    schemaVersion: 1,
    seq: (previous?.seq ?? 0) + 1,
    at: new Date().toISOString(),
    ...(event.reasonCode ? { reasonCode: redactJournalValue(event.reasonCode) } : {}),
  };
  const appendFd = fs.openSync(target, 'a', 0o600);
  try {
    fs.writeFileSync(appendFd, `${JSON.stringify(next)}\n`, 'utf8');
    fs.fsyncSync(appendFd);
  } finally {
    fs.closeSync(appendFd);
  }
  return next;
  } finally {
    fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch { /* lock removal is best effort after close */ }
  }
}

export function journalInputFingerprint(value: unknown): string {
  return sha256(stableJson(value));
}

export function writeTerminal(repoRoot: string, runId: string, terminal: unknown, authority?: { ownerInstanceId: string; fencingToken: number }): string {
  if (!authority) throw new Error('DWE_TERMINAL_AUTHORITY_REQUIRED');
  const root = createRunJournal(repoRoot, runId);
  const lock = path.join(root, 'terminal.lock');
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  try {
    const state = readRunState(repoRoot, runId);
    assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
    if (!TERMINAL_RUN_STATES.has(state.state as never)) throw new Error(`DWE_TERMINAL_STATE_REQUIRED:${state.state}`);
    const target = path.join(root, 'terminal.json');
    writeJsonAtomic(target, terminal);
    return target;
  } finally {
    fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch { /* best effort after close */ }
  }
}
