#!/usr/bin/env node
/**
 * AC-36.6 migration-phase completion gate.
 *
 * The gate consumes evidence rather than inferring readiness from flags. It
 * emits one bounded JSON object and only returns ALLOW when every required
 * phase proof is present, fresh, unfiltered, and tied to the current commit.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface MigrationGateInput {
  repoRoot: string;
  phase: string;
  headSha: string;
  worktreeClean: boolean;
  machineIds: string[];
  requiredMachinePrefix?: string;
  collisionFree: boolean;
  docker: { passed: boolean; filtered: boolean; commitSha: string };
  canonicalEvidence: { exists: boolean; commitSha: string; generatedAt: string };
  now?: string;
  maxEvidenceAgeMs?: number;
}

export interface MigrationGateResult {
  decision: 'ALLOW' | 'DENY';
  phase: string;
  headSha: string;
  checks: {
    worktreeClean: boolean;
    qualifiedMachineIds: boolean;
    collisionsClear: boolean;
    dockerFullPass: boolean;
    canonicalEvidenceFresh: boolean;
  };
  reasons: string[];
}

const SHA = /^[0-9a-f]{7,64}$/i;

export function evaluateMigrationPhase(input: MigrationGateInput): MigrationGateResult {
  const now = Date.parse(input.now ?? new Date().toISOString());
  const prefix = input.requiredMachinePrefix ?? 'machine-';
  const qualifiedMachineIds = input.machineIds.length > 0 && input.machineIds.every((id) => id.startsWith(prefix) && id.length > prefix.length);
  const evidenceTime = Date.parse(input.canonicalEvidence.generatedAt);
  const maxAge = input.maxEvidenceAgeMs ?? 24 * 60 * 60 * 1000;
  const canonicalEvidenceFresh = input.canonicalEvidence.exists
    && SHA.test(input.canonicalEvidence.commitSha)
    && input.canonicalEvidence.commitSha === input.headSha
    && Number.isFinite(evidenceTime)
    && evidenceTime <= now
    && now - evidenceTime <= maxAge;
  const checks = {
    worktreeClean: input.worktreeClean,
    qualifiedMachineIds,
    collisionsClear: input.collisionFree,
    dockerFullPass: input.docker.passed && !input.docker.filtered && input.docker.commitSha === input.headSha,
    canonicalEvidenceFresh,
  };
  const reasons: string[] = [];
  if (!SHA.test(input.headSha)) reasons.push('HEAD_SHA_INVALID');
  if (!checks.worktreeClean) reasons.push('WORKTREE_DIRTY');
  if (!checks.qualifiedMachineIds) reasons.push('MACHINE_ID_UNQUALIFIED');
  if (!checks.collisionsClear) reasons.push('COLLISIONS_PRESENT');
  if (!checks.dockerFullPass) reasons.push(input.docker.filtered ? 'DOCKER_PROOF_FILTERED' : 'DOCKER_PROOF_STALE_OR_FAILED');
  if (!checks.canonicalEvidenceFresh) reasons.push('CANONICAL_EVIDENCE_STALE_OR_MISSING');
  return { decision: reasons.length === 0 ? 'ALLOW' : 'DENY', phase: input.phase, headSha: input.headSha, checks, reasons };
}

function main(): void {
  const file = process.argv[2];
  if (!file) throw new Error('usage: migration-phase-gate.ts <evidence.json>');
  const input = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as MigrationGateInput;
  const result = evaluateMigrationPhase(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.decision === 'DENY') process.exitCode = 2;
}

if (process.argv[1]?.endsWith('migration-phase-gate.ts')) main();
