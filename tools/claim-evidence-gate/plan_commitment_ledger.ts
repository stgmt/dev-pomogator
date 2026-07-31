import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { CommitmentVerdict } from './meridian-judge.ts';
import type { ResultConfirmedEvidence } from './transcript_events.ts';

export interface PlanCommitmentSeed {
  id: string;
  title: string;
  ordinal: number;
}

export interface PlanApprovalSeed {
  sessionId: string;
  planHash: string;
  planPath: string;
  approvalToolUseId: string;
  approvalResultSeq: number;
  approvalResultLine: number;
  commitments: PlanCommitmentSeed[];
}

export interface PlanLedgerCommitment extends PlanCommitmentSeed {
  state: 'open' | 'complete';
  evidenceIds: string[];
  completedAt?: string;
}

export interface ApprovedPlanLedger {
  schemaVersion: 1;
  sessionId: string;
  planHash: string;
  planPath: string;
  approvalToolUseId: string;
  approvalResultSeq: number;
  approvalResultLine: number;
  supersededBy?: string;
  commitments: PlanLedgerCommitment[];
  updatedAt: string;
}

const STORE_DIR = path.join('.dev-pomogator', 'claim-evidence-plan-ledger');
const LOCK_WAIT_MS = 2_000;
const STALE_LOCK_MS = 30_000;

export function fullSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeSessionId(sessionId: string): string {
  return `${sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'unknown'}-${fullSha256(sessionId).slice(0, 12)}`;
}

function storeDir(repoRoot: string, sessionId: string): string | null {
  const base = path.resolve(repoRoot);
  const root = path.resolve(base, STORE_DIR);
  if (!root.startsWith(base + path.sep)) return null;
  const dir = path.resolve(root, safeSessionId(sessionId));
  return dir.startsWith(root + path.sep) ? dir : null;
}

function ledgerPath(repoRoot: string, sessionId: string, planHash: string): string | null {
  const dir = storeDir(repoRoot, sessionId);
  if (!dir || !/^[a-f0-9]{64}$/i.test(planHash)) return null;
  const target = path.resolve(dir, `${planHash.toLowerCase()}.json`);
  return target.startsWith(dir + path.sep) ? target : null;
}

function parseLedger(raw: string, sessionId: string, planHash: string): ApprovedPlanLedger | null {
  try {
    const value = JSON.parse(raw) as ApprovedPlanLedger;
    if (value.schemaVersion !== 1 || value.sessionId !== sessionId || value.planHash !== planHash) return null;
    if (!Array.isArray(value.commitments)) return null;
    return value;
  } catch {
    return null;
  }
}

export function readPlanLedger(repoRoot: string, sessionId: string, planHash: string): ApprovedPlanLedger | null {
  const target = ledgerPath(repoRoot, sessionId, planHash);
  if (!target) return null;
  try {
    return parseLedger(fs.readFileSync(target, 'utf-8'), sessionId, planHash);
  } catch {
    return null;
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLedgerLock<T>(target: string, action: () => T): T {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const lockPath = `${target}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let lockFd: number | null = null;
  while (lockFd === null) {
    try {
      lockFd = fs.openSync(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS) fs.unlinkSync(lockPath);
      } catch {
        // The lock disappeared between checks; retry.
      }
      if (Date.now() >= deadline) throw new Error('plan ledger lock timeout');
      sleep(10);
    }
  }
  try {
    return action();
  } finally {
    try { fs.closeSync(lockFd); } catch { /* best effort */ }
    try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
  }
}

function writeLedgerAtomic(target: string, ledger: ApprovedPlanLedger): void {
  const temp = `${target}.${process.pid}.${fullSha256(`${ledger.updatedAt}:${ledger.planHash}`).slice(0, 12)}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2), { encoding: 'utf-8', flag: 'wx' });
  try {
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* best effort */ }
    throw error;
  }
}

function initialLedger(seed: PlanApprovalSeed): ApprovedPlanLedger {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    sessionId: seed.sessionId,
    planHash: seed.planHash,
    planPath: seed.planPath,
    approvalToolUseId: seed.approvalToolUseId,
    approvalResultSeq: seed.approvalResultSeq,
    approvalResultLine: seed.approvalResultLine,
    commitments: seed.commitments.map((commitment) => ({ ...commitment, state: 'open', evidenceIds: [] })),
    updatedAt: now,
  };
}

export function ensureApprovedPlanLedger(repoRoot: string, seed: PlanApprovalSeed): ApprovedPlanLedger | null {
  if (!seed.sessionId || !/^[a-f0-9]{64}$/i.test(seed.planHash)) return null;
  const target = ledgerPath(repoRoot, seed.sessionId, seed.planHash);
  const dir = storeDir(repoRoot, seed.sessionId);
  if (!target || !dir) return null;
  try {
    return withLedgerLock(target, () => {
      const current = readPlanLedger(repoRoot, seed.sessionId, seed.planHash);
      if (current) return current;
      const ledger = initialLedger(seed);
      writeLedgerAtomic(target, ledger);

      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.json') || name === path.basename(target)) continue;
        const oldPath = path.join(dir, name);
        try {
          const oldHash = name.slice(0, -5);
          const old = parseLedger(fs.readFileSync(oldPath, 'utf-8'), seed.sessionId, oldHash);
          if (!old || old.supersededBy || old.approvalResultSeq >= ledger.approvalResultSeq) continue;
          old.supersededBy = ledger.planHash;
          old.updatedAt = ledger.updatedAt;
          writeLedgerAtomic(oldPath, old);
        } catch {
          // A corrupt or concurrently changing previous ledger cannot invalidate the new approval.
        }
      }
      return ledger;
    });
  } catch {
    return null;
  }
}

export function planLedgerIsActive(ledger: ApprovedPlanLedger): boolean {
  return !ledger.supersededBy && ledger.commitments.some((commitment) => commitment.state !== 'complete');
}

export function reconcilePlanVerdict(
  repoRoot: string,
  sessionId: string,
  planHash: string,
  verdicts: CommitmentVerdict[] | undefined,
  evidence: ResultConfirmedEvidence[],
): ApprovedPlanLedger | null {
  const target = ledgerPath(repoRoot, sessionId, planHash);
  if (!target || !verdicts?.length) return readPlanLedger(repoRoot, sessionId, planHash);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const seen = new Set<string>();
  const valid = new Map<string, string[]>();
  for (const verdict of verdicts) {
    if (seen.has(verdict.id)) return readPlanLedger(repoRoot, sessionId, planHash);
    seen.add(verdict.id);
    if (verdict.state !== 'complete') continue;
    const ids = [...new Set(verdict.evidenceIds)].filter((id) => evidenceIds.has(id));
    if (ids.length === 0 || ids.length !== verdict.evidenceIds.length) return readPlanLedger(repoRoot, sessionId, planHash);
    valid.set(verdict.id, ids);
  }
  if (valid.size === 0) return readPlanLedger(repoRoot, sessionId, planHash);

  try {
    return withLedgerLock(target, () => {
      const ledger = readPlanLedger(repoRoot, sessionId, planHash);
      if (!ledger || ledger.supersededBy) return ledger;
      const known = new Set(ledger.commitments.map((commitment) => commitment.id));
      if ([...seen].some((id) => !known.has(id))) return ledger;
      const now = new Date().toISOString();
      for (const commitment of ledger.commitments) {
        const ids = valid.get(commitment.id);
        if (!ids || commitment.state === 'complete') continue;
        commitment.state = 'complete';
        commitment.evidenceIds = [...new Set([...commitment.evidenceIds, ...ids])];
        commitment.completedAt = now;
      }
      ledger.updatedAt = now;
      writeLedgerAtomic(target, ledger);
      return ledger;
    });
  } catch {
    return readPlanLedger(repoRoot, sessionId, planHash);
  }
}
