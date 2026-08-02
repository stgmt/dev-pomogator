import fs from 'node:fs';
import path from 'node:path';
import type { ConsumerContract, RuntimeIssuance, WorkflowPacket } from './packet.ts';
import { validatePacket, validateRuntimeIssuance } from './packet.ts';
import { verifyRootPreflight, type RootPreflightEvidence } from './root-preflight.ts';

interface ContractRegistry { schemaVersion: 1; contracts: ConsumerContract[] }

export interface AdmissionDecision {
  decision: 'allow' | 'deny';
  reasonCodes: string[];
  consumerId: string | null;
  runId: string | null;
  attemptId: string | null;
  rootPreflight?: RootPreflightEvidence;
}

export function loadContracts(registryPath = path.join(import.meta.dirname, 'contracts.json')): ContractRegistry {
  const value = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ContractRegistry;
  if (value.schemaVersion !== 1 || !Array.isArray(value.contracts)) throw new Error('invalid Dynamic Workflow contract registry');
  return value;
}

function compareCeilings(packet: WorkflowPacket, contract: ConsumerContract): string[] {
  const reasons: string[] = [];
  for (const key of Object.keys(contract.ceilings) as Array<keyof ConsumerContract['ceilings']>) {
    if (packet.ceilings[key] > contract.ceilings[key]) reasons.push(`DWE_CONTRACT_CEILING_EXCEEDED:${key}`);
  }
  return reasons;
}

export function admitPacket(packet: WorkflowPacket, options: { registry?: ContractRegistry; verifyRoot?: boolean; nowMs?: number; issuance?: RuntimeIssuance; requireRuntimeIssuance?: boolean } = {}): AdmissionDecision {
  const validation = validatePacket(packet, options.nowMs);
  const reasons = [...validation.reasonCodes];
  const registry = options.registry ?? loadContracts();
  const contract = registry.contracts.find((entry) => entry.consumerId === packet.consumerId && entry.version === packet.contractVersion);
  if (options.requireRuntimeIssuance !== false && !validateRuntimeIssuance(packet, options.issuance, options.nowMs, contract)) reasons.push('DWE_RUNTIME_ISSUANCE_INVALID');
  if (!contract) reasons.push('DWE_CONTRACT_NOT_FOUND');
  else {
    if (contract.operation !== packet.operation) reasons.push('DWE_OPERATION_FORBIDDEN');
    if (contract.outputSchema !== packet.outputSchema) reasons.push('DWE_OUTPUT_SCHEMA_MISMATCH');
    if (Date.parse(contract.reviewAfter) <= (options.nowMs ?? Date.now())) reasons.push('DWE_CONTRACT_EXPIRED');
    reasons.push(...compareCeilings(packet, contract));
  }
  const rootPreflight = reasons.length === 0 && options.verifyRoot !== false ? verifyRootPreflight(packet) : undefined;
  if (rootPreflight && !rootPreflight.ok && rootPreflight.reasonCode) reasons.push(rootPreflight.reasonCode);
  return {
    decision: reasons.length === 0 ? 'allow' : 'deny',
    reasonCodes: [...new Set(reasons)].sort(),
    consumerId: packet.consumerId || null,
    runId: packet.runId || null,
    attemptId: packet.attemptId || null,
    rootPreflight,
  };
}
