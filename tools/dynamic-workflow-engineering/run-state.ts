import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkflowPacket } from './packet.ts';

export type ActiveRunState = 'CREATED' | 'ROOT_VERIFIED' | 'EXCLUSIVE_OWNERSHIP' | 'PREFLIGHT_GREEN' | 'PLAN_FROZEN' | 'RUNNING' | 'VERIFYING' | 'COMMITTING';
export type TerminalRunState = 'DONE' | 'PARTIAL' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'PAUSED_RESUMABLE' | 'TERMINATED_NO_RESUME' | 'HARNESS_REPAIR';
export type RunStateName = ActiveRunState | TerminalRunState;

export interface LeaseState {
  ownerInstanceId: string;
  ownerPid: number;
  ownerStartedAt: string;
  fencingToken: number;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
}

export interface WorkflowRunState {
  schemaVersion: 1;
  runId: string;
  state: RunStateName;
  stateVersion: number;
  fencingToken: number;
  ownerTaskId: string;
  ownerInstanceId: string;
  ownerProcess: { pid: number; startedAt: string };
  expectedRoot: string;
  worktree: WorkflowPacket['worktree'];
  dirtyPathAllowlist: string[];
  requiredGates: string[];
  gateResults: Array<{ id: string; status: 'pending' | 'passed' | 'failed' | 'blocked'; evidenceRef?: string }>;
  checkoutWriterLock?: LeaseState;
  externalRuntimeLease?: LeaseState;
  lockOrder: ['checkoutWriterLock', 'externalRuntimeLease'];
  collections: {
    originalCandidates: unknown[];
    staged: unknown[];
    proven: unknown[];
    rejected: unknown[];
    deferred: unknown[];
    unprovenApplied: unknown[];
  };
  baselineHashes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

const ACTIVE_ORDER: ActiveRunState[] = ['CREATED', 'ROOT_VERIFIED', 'EXCLUSIVE_OWNERSHIP', 'PREFLIGHT_GREEN', 'PLAN_FROZEN', 'RUNNING', 'VERIFYING', 'COMMITTING'];
export const TERMINAL_RUN_STATES = new Set<TerminalRunState>(['DONE', 'PARTIAL', 'FAILED', 'BLOCKED', 'CANCELLED', 'PAUSED_RESUMABLE', 'TERMINATED_NO_RESUME', 'HARNESS_REPAIR']);
const TERMINAL = TERMINAL_RUN_STATES;

export class CasMismatchError extends Error {
  readonly code = 'DWE_CAS_MISMATCH';
}

export class FencingError extends Error {
  readonly code = 'DWE_STALE_FENCING_TOKEN';
}

export function createRunState(packet: WorkflowPacket): WorkflowRunState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: packet.runId,
    state: 'CREATED',
    stateVersion: 1,
    fencingToken: 1,
    ownerTaskId: packet.ownerTaskId,
    ownerInstanceId: packet.ownerInstanceId,
    ownerProcess: packet.ownerProcess,
    expectedRoot: packet.expectedRoot,
    worktree: packet.worktree,
    dirtyPathAllowlist: packet.dirtyPathAllowlist,
    requiredGates: packet.requiredGates,
    gateResults: packet.requiredGates.map((id) => ({ id, status: 'pending' })),
    lockOrder: ['checkoutWriterLock', 'externalRuntimeLease'],
    collections: { originalCandidates: [], staged: [], proven: [], rejected: [], deferred: [], unprovenApplied: [] },
    baselineHashes: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function assertAuthority(state: WorkflowRunState, ownerInstanceId: string, fencingToken: number): void {
  if (state.ownerInstanceId !== ownerInstanceId || state.fencingToken !== fencingToken) throw new FencingError('owner instance or fencing token is stale');
}

export function transitionRunState(state: WorkflowRunState, target: RunStateName, expectedVersion: number, authority: { ownerInstanceId: string; fencingToken: number }, nextOwner?: { ownerTaskId: string; ownerInstanceId: string; ownerProcess: { pid: number; startedAt: string } }): WorkflowRunState {
  if (state.stateVersion !== expectedVersion) throw new CasMismatchError(`expected stateVersion ${expectedVersion}, found ${state.stateVersion}`);
  assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
  if (TERMINAL.has(state.state as TerminalRunState)) throw new Error(`terminal state cannot transition: ${state.state}`);
  if (!TERMINAL.has(target as TerminalRunState)) {
    const current = ACTIVE_ORDER.indexOf(state.state as ActiveRunState);
    const next = ACTIVE_ORDER.indexOf(target as ActiveRunState);
    if (next !== current + 1) throw new Error(`invalid transition ${state.state} -> ${target}`);
  }
  if (target === 'RUNNING' && state.gateResults.some((gate) => gate.status === 'failed' || gate.status === 'blocked')) throw new Error('required gate blocks RUNNING');
  if ((target === 'COMMITTING' || target === 'DONE') && state.gateResults.some((gate) => gate.status !== 'passed')) throw new Error('all required gates must pass before commit or completion');
  const ownershipChanged = nextOwner && nextOwner.ownerInstanceId !== state.ownerInstanceId;
  return {
    ...state,
    ...nextOwner,
    state: target,
    stateVersion: state.stateVersion + 1,
    fencingToken: ownershipChanged ? state.fencingToken + 1 : state.fencingToken,
    updatedAt: new Date().toISOString(),
  };
}

export function runDirectory(repoRoot: string, runId: string): string {
  if (!/^dwe-[A-Za-z0-9-]+$/.test(runId)) throw new Error('invalid run id');
  return path.join(repoRoot, '.dev-pomogator', 'runtime', 'runs', runId);
}

export function writeJsonAtomic(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

export function persistRunState(repoRoot: string, state: WorkflowRunState): string {
  const target = path.join(runDirectory(repoRoot, state.runId), 'state.json');
  writeJsonAtomic(target, state);
  return target;
}

export function readRunState(repoRoot: string, runId: string): WorkflowRunState {
  return JSON.parse(fs.readFileSync(path.join(runDirectory(repoRoot, runId), 'state.json'), 'utf8')) as WorkflowRunState;
}
