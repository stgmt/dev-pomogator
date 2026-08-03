#!/usr/bin/env node
/**
 * Concurrent CAS writer child for SPECGEN004_689.
 *
 * Args: <planFile> <barrierDir> <writerId> <evidenceSourceId>
 *
 * Both children signal readiness via barrier files, wait until every peer is
 * ready, then race a real storage-level compare-and-swap on the same persisted
 * revision. Prints one JSON line: { writerId, committed, findings }.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  applyTaskPlanPatch,
  createFileCasAdapter,
  restorePersistedTaskPlanState,
} from '../../tools/spec-graph/task-plan-integration.ts';

const [planFile, barrierDir, writerId, evidenceSourceId] = process.argv.slice(2);
if (!planFile || !barrierDir || !writerId || !evidenceSourceId) {
  console.error('usage: task-plan-cas-writer.mjs <planFile> <barrierDir> <writerId> <evidenceSourceId>');
  process.exit(2);
}

const adapter = createFileCasAdapter(planFile);
const state = restorePersistedTaskPlanState(adapter);
if (!state) {
  console.log(JSON.stringify({ writerId, committed: false, findings: ['PLAN_FILE_MISSING'] }));
  process.exit(0);
}

// Barrier: announce readiness, then wait (bounded) for every peer to be ready
// so both compare-and-swap attempts are genuinely simultaneous.
fs.writeFileSync(path.join(barrierDir, `ready-${writerId}`), String(process.pid));
const deadline = Date.now() + 10_000;
for (;;) {
  const ready = fs.readdirSync(barrierDir).filter((name) => name.startsWith('ready-'));
  if (ready.length >= 2) break;
  if (Date.now() > deadline) {
    console.log(JSON.stringify({ writerId, committed: false, findings: ['BARRIER_TIMEOUT'] }));
    process.exit(2);
  }
  await new Promise((resolve) => { setTimeout(resolve, 20); });
}

const taskId = state.tasks[0].qualifiedId;
const reason = `${writerId} concurrent CAS evidence`;
const patch = {
  evidence: [{
    taskId,
    sourceId: evidenceSourceId,
    state: 'present',
    reason,
    fingerprint: crypto.createHash('sha256').update(`${taskId}:${evidenceSourceId}:${reason}`).digest('hex'),
  }],
};
const mutation = applyTaskPlanPatch(state, patch, {
  expectedRevision: state.revision,
  persist: (nextState, serialized, expectedRevision) => adapter.compareAndSwap(expectedRevision, serialized, nextState),
});
console.log(JSON.stringify({ writerId, committed: mutation.committed, findings: mutation.findings.map((finding) => finding.code) }));
