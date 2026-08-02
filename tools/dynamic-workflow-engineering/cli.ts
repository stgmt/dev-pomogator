#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { admitPacket, loadContracts } from './admission.ts';
import { evaluateCapabilityMatrix } from './capability-matrix.ts';
import { enumerateConsumers, verifyCensus } from './consumer-census.ts';
import { reconcileIncident } from './incident-exporter.ts';
import { replayOffline } from './replay-exporter.ts';
import { createRunState, persistRunState, transitionRunState } from './run-state.ts';
import { mintRuntimeIdentity, createRuntimeIssuance, type RuntimeIssuance, type WorkflowPacket } from './packet.ts';

function usage(): never {
  throw new Error('usage: cli.ts <prepare|capability|census|replay|incident> [input]');
}

export function preparePacket(request: WorkflowPacket): { decision: ReturnType<typeof admitPacket>; statePath?: string; issuance?: RuntimeIssuance; preparedPacketPath?: string } {
  const runtimeIdentity = mintRuntimeIdentity(request.ownerTaskId);
  const packet: WorkflowPacket = { ...request, ...runtimeIdentity };
  const contract = loadContracts().contracts.find((entry) => entry.consumerId === packet.consumerId && entry.version === packet.contractVersion);
  const issuance = createRuntimeIssuance(packet, contract);
  const decision = admitPacket(packet, { issuance });
  if (decision.decision === 'deny') return { decision };
  let state = createRunState(packet);
  state = transitionRunState(state, 'ROOT_VERIFIED', state.stateVersion, { ownerInstanceId: state.ownerInstanceId, fencingToken: state.fencingToken });
  const statePath = persistRunState(packet.expectedRoot, state);
  const preparedPacketPath = path.join(path.dirname(statePath), 'prepared-packet.json');
  fs.writeFileSync(preparedPacketPath, `${JSON.stringify({ packet, issuance, contract }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { decision, statePath, issuance, preparedPacketPath };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0] ?? usage();
  if (command === 'capability') {
    process.stdout.write(`${JSON.stringify(evaluateCapabilityMatrix({ boundedRuntimeAvailable: true }), null, 2)}\n`);
    return;
  }
  if (command === 'prepare') {
    const packetPath = argv[1] ?? usage();
    const packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), 'utf8')) as WorkflowPacket;
    const result = preparePacket(packet);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.decision.decision === 'deny') process.exitCode = 2;
    return;
  }
  if (command === 'census') {
    const root = path.resolve(argv[1] || process.cwd());
    const records = enumerateConsumers(root);
    const verification = verifyCensus(records, root);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, records, verification }, null, 2)}\n`);
    if (!verification.ok) process.exitCode = 2;
    return;
  }
  if (command === 'replay') {
    const runId = argv[1] ?? usage();
    const root = path.resolve(argv[2] || process.cwd());
    const result = replayOffline(root, runId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'REPLAY_UNAVAILABLE') process.exitCode = 2;
    return;
  }
  if (command === 'incident') {
    const manifestPath = argv[1] ?? usage();
    const result = reconcileIncident(path.resolve(manifestPath));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'REPLAY_UNAVAILABLE') process.exitCode = 2;
    return;
  }
  usage();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
