/** AC-36.6 — deterministic migration-phase completion gate policy. */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { evaluateMigrationPhase, type MigrationGateResult } from '../../scripts/migration-phase-gate.ts';
import type { V4World } from '../hooks/before-after.ts';

interface GateWorld extends V4World {
  gateResult?: MigrationGateResult;
}

const baseEvidence = {
  phase: 'marksman-migration',
  headSha: '0123456789abcdef0123456789abcdef01234567',
  worktreeClean: true,
  machineIds: ['machine-docker-test'],
  collisionFree: true,
  docker: { passed: true, filtered: false, commitSha: '0123456789abcdef0123456789abcdef01234567' },
  canonicalEvidence: {
    exists: true,
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-08-08T00:00:00.000Z',
  },
  now: '2026-08-08T01:00:00.000Z',
};

Given('a migration phase with clean qualified full evidence', function (this: GateWorld) {
  this.gateResult = evaluateMigrationPhase(baseEvidence);
});

Given('a migration phase has dirty or stale evidence', function (this: GateWorld) {
  this.gateResult = evaluateMigrationPhase({
    ...baseEvidence,
    worktreeClean: false,
    docker: { ...baseEvidence.docker, filtered: true },
    canonicalEvidence: { ...baseEvidence.canonicalEvidence, commitSha: 'fedcba9876543210fedcba9876543210fedcba98' },
  });
});

When('the migration-phase gate evaluates all completion evidence', function (this: GateWorld) {
  assert.ok(this.gateResult, 'gate must produce machine-readable output');
});

Then('the migration-phase gate returns ALLOW', function (this: GateWorld) {
  assert.equal(this.gateResult?.decision, 'ALLOW');
  assert.deepEqual(this.gateResult?.reasons, []);
});

Then('the migration-phase gate returns DENY with explicit reasons', function (this: GateWorld) {
  assert.equal(this.gateResult?.decision, 'DENY');
  assert.deepEqual(this.gateResult!.reasons, [
    'WORKTREE_DIRTY',
    'DOCKER_PROOF_FILTERED',
    'CANONICAL_EVIDENCE_STALE_OR_MISSING',
  ]);
});
