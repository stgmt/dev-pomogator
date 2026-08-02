import fs from 'node:fs';
import path from 'node:path';
import type { LeaseState, WorkflowRunState } from './run-state.ts';
import { assertAuthority, writeJsonAtomic } from './run-state.ts';

export type LockKind = 'checkoutWriterLock' | 'externalRuntimeLease';

export interface AcquireLeaseOptions {
  repoRoot: string;
  kind: LockKind;
  state: WorkflowRunState;
  timeoutMs?: number;
  leaseMs?: number;
  now?: () => Date;
  isProcessAlive?: (pid: number, startedAt: string) => boolean;
}

export class LockBusyError extends Error {
  readonly code = 'DWE_LOCK_BUSY';
}

function lockPath(repoRoot: string, runId: string, kind: LockKind): string {
  const suffix = kind === 'checkoutWriterLock' ? 'checkout-writer.lock' : 'external-runtime.lease';
  return path.join(repoRoot, '.dev-pomogator', 'runtime', 'locks', `${runId}.${suffix}`);
}

function defaultAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, ms));
}

function readLease(target: string): LeaseState | null {
  try { return JSON.parse(fs.readFileSync(target, 'utf8')) as LeaseState; } catch { return null; }
}

function ensureLockOrder(kind: LockKind, state: WorkflowRunState): void {
  if (kind === 'externalRuntimeLease' && !state.checkoutWriterLock) throw new Error('checkoutWriterLock must be acquired before externalRuntimeLease');
}

export function acquireLease(options: AcquireLeaseOptions): LeaseState {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const leaseMs = options.leaseMs ?? 30_000;
  const now = options.now ?? (() => new Date());
  const isAlive = options.isProcessAlive ?? ((pid) => defaultAlive(pid));
  const target = lockPath(options.repoRoot, options.state.runId, options.kind);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  ensureLockOrder(options.kind, options.state);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const at = now();
    const lease: LeaseState = {
      ownerInstanceId: options.state.ownerInstanceId,
      ownerPid: options.state.ownerProcess.pid,
      ownerStartedAt: options.state.ownerProcess.startedAt,
      fencingToken: options.state.fencingToken,
      acquiredAt: at.toISOString(),
      renewedAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + leaseMs).toISOString(),
    };
    try {
      fs.writeFileSync(target, `${JSON.stringify(lease, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      return lease;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = readLease(target);
      const expired = !existing || Date.parse(existing.expiresAt) <= at.getTime();
      const stale = !existing || !isAlive(existing.ownerPid, existing.ownerStartedAt);
      if (expired && stale) {
        try { fs.unlinkSync(target); } catch { /* raced; retry */ }
        continue;
      }
      if (Date.now() >= deadline) throw new LockBusyError(`${options.kind} held by ${existing?.ownerInstanceId ?? 'unknown'}`);
      sleep(25);
    }
  }
}

export function renewLease(repoRoot: string, kind: LockKind, state: WorkflowRunState, leaseMs = 30_000, now = new Date()): LeaseState {
  const target = lockPath(repoRoot, state.runId, kind);
  const existing = readLease(target);
  if (!existing) throw new Error(`${kind} is absent`);
  assertAuthority(state, existing.ownerInstanceId, existing.fencingToken);
  if (existing.ownerPid !== state.ownerProcess.pid || existing.ownerStartedAt !== state.ownerProcess.startedAt) throw new Error('owner process identity changed');
  const next = { ...existing, renewedAt: now.toISOString(), expiresAt: new Date(now.getTime() + leaseMs).toISOString() };
  writeJsonAtomic(target, next);
  return next;
}

export function releaseLease(repoRoot: string, kind: LockKind, state: WorkflowRunState): boolean {
  const target = lockPath(repoRoot, state.runId, kind);
  const existing = readLease(target);
  if (!existing) return false;
  assertAuthority(state, existing.ownerInstanceId, existing.fencingToken);
  if (existing.ownerPid !== state.ownerProcess.pid || existing.ownerStartedAt !== state.ownerProcess.startedAt) throw new Error('stale process cannot release lease');
  fs.unlinkSync(target);
  return true;
}
