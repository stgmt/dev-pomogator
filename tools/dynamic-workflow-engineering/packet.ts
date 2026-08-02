import { createHash, randomUUID } from 'node:crypto';

export type ControlMode = 'hard admission' | 'hard cancellation' | 'monitored circuit' | 'best-effort' | 'unavailable';
export type GuaranteeTier = 'ENFORCED' | 'STEERING_ONLY' | 'UNAVAILABLE';
export type WorktreeMode = 'existing' | 'isolated';

export interface ResourceCeilings {
  logicalCalls: number;
  physicalAttempts: number;
  concurrency: number;
  discoveryRounds: number;
  toolCalls: number;
  findings: number;
  inputBytes: number;
  outputBytes: number;
  responseTokens: number;
  wallClockMs: number;
}

export interface WorkPackage {
  id: string;
  scopeIds: string[];
  prompt: string;
  dependencies: string[];
  required: boolean;
  ownership: {
    read: string[];
    write: string[];
  };
}

export interface WorkflowPacket {
  schemaVersion: 1;
  contractVersion: number;
  consumerId: string;
  operation: 'workflow';
  scopeIds: string[];
  populationDigest: string;
  workPackages: WorkPackage[];
  barriers: Array<{ id: string; inputs: string[]; justification: string }>;
  evidenceStandard: string;
  outputSchema: string;
  stopCondition: string;
  blockedStates: string[];
  droppedStates: string[];
  ceilings: ResourceCeilings;
  controlModes: Record<keyof ResourceCeilings, ControlMode>;
  expectedRoot: string;
  worktree: { mode: WorktreeMode; path: string; baseSha: string };
  dirtyPathAllowlist: string[];
  requiredGates: string[];
  runId: string;
  attemptId: string;
  ownerTaskId: string;
  ownerInstanceId: string;
  ownerProcess: { pid: number; startedAt: string };
  issuedAt: string;
  expiresAt: string;
}

export interface ConsumerContract {
  consumerId: string;
  skillPath: string;
  operation: 'workflow';
  subagentTypes: string[];
  owner: string;
  version: number;
  reviewAfter: string;
  outputSchema: string;
  ceilings: ResourceCeilings;
}

export interface PacketValidation {
  valid: boolean;
  reasonCodes: string[];
}

export interface RuntimeIssuance {
  schemaVersion: 1;
  contractFingerprint: string;
  packetFingerprint: string;
  capabilityToken: string;
  runId: string;
  attemptId: string;
  ownerTaskId: string;
  ownerInstanceId: string;
  ownerProcess: { pid: number; startedAt: string };
  consumerId: string;
  contractVersion: number;
  expectedRoot: string;
  worktreePath: string;
  issuedAt: string;
  expiresAt: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA = /^[a-f0-9]{7,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const POSITIVE_CEILINGS: Array<keyof ResourceCeilings> = [
  'logicalCalls', 'physicalAttempts', 'concurrency', 'discoveryRounds', 'toolCalls',
  'findings', 'inputBytes', 'outputBytes', 'responseTokens', 'wallClockMs',
];
const MODES = new Set<ControlMode>(['hard admission', 'hard cancellation', 'monitored circuit', 'best-effort', 'unavailable']);

function stableUnique(values: string[]): boolean {
  return values.length > 0 && new Set(values).size === values.length && values.every((value) => ID.test(value));
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function populationDigest(scopeIds: string[]): string {
  return sha256([...scopeIds].sort().join('\n'));
}

export function packetFingerprint(packet: WorkflowPacket): string {
  return sha256(stableJson(packet));
}

export function validatePacket(packet: WorkflowPacket, nowMs = Date.now()): PacketValidation {
  const reasons = new Set<string>();
  if (packet.schemaVersion !== 1) reasons.add('DWE_PACKET_SCHEMA_UNSUPPORTED');
  if (!ID.test(packet.consumerId) || packet.operation !== 'workflow') reasons.add('DWE_CONSUMER_INVALID');
  if (!stableUnique(packet.scopeIds)) reasons.add('DWE_SCOPE_NOT_FINITE');
  if (!DIGEST.test(packet.populationDigest) || packet.populationDigest !== populationDigest(packet.scopeIds)) {
    reasons.add('DWE_POPULATION_DIGEST_MISMATCH');
  }
  if (!stableUnique(packet.workPackages.map((work) => work.id))) reasons.add('DWE_WORK_PACKAGES_INVALID');
  const scopeSet = new Set(packet.scopeIds);
  const packageSet = new Set(packet.workPackages.map((work) => work.id));
  for (const work of packet.workPackages) {
    if (!work.scopeIds.length || work.scopeIds.some((scope) => !scopeSet.has(scope))) reasons.add('DWE_WORK_SCOPE_WIDENED');
    if (!work.prompt.trim() || Buffer.byteLength(work.prompt, 'utf8') > packet.ceilings.inputBytes) reasons.add('DWE_WORK_PROMPT_INVALID');
    if (work.dependencies.some((dependency) => !packageSet.has(dependency) || dependency === work.id)) reasons.add('DWE_DEPENDENCY_INVALID');
    if (!Array.isArray(work.ownership.read) || !Array.isArray(work.ownership.write)) reasons.add('DWE_OWNERSHIP_MISSING');
  }
  if (packet.workPackages.length > packet.ceilings.logicalCalls) reasons.add('DWE_LOGICAL_CALL_CEILING_EXCEEDED');
  if (packet.ceilings.physicalAttempts < packet.ceilings.logicalCalls) reasons.add('DWE_ATTEMPT_CEILING_INVALID');
  for (const key of POSITIVE_CEILINGS) {
    const value = packet.ceilings[key];
    if (!Number.isSafeInteger(value) || value <= 0) reasons.add(`DWE_CEILING_INVALID:${key}`);
    if (!MODES.has(packet.controlModes[key])) reasons.add(`DWE_CONTROL_MODE_INVALID:${key}`);
  }
  if (packet.ceilings.concurrency > packet.ceilings.logicalCalls) reasons.add('DWE_CONCURRENCY_CEILING_INVALID');
  if (!packet.barriers.every((barrier) => ID.test(barrier.id) && barrier.justification.trim() && barrier.inputs.length > 1 && barrier.inputs.every((id) => packageSet.has(id)))) {
    reasons.add('DWE_BARRIER_INVALID');
  }
  if (!packet.evidenceStandard.trim() || !packet.outputSchema.trim() || !packet.stopCondition.trim()) reasons.add('DWE_EVIDENCE_OUTPUT_STOP_MISSING');
  if (!packet.blockedStates.length || !packet.droppedStates.length) reasons.add('DWE_BLOCKED_DROPPED_STATE_MISSING');
  if (!packet.expectedRoot || !packet.worktree.path || !SHA.test(packet.worktree.baseSha)) reasons.add('DWE_ROOT_WORKTREE_INVALID');
  if (!stableUnique(packet.requiredGates)) reasons.add('DWE_REQUIRED_GATES_INVALID');
  if (![packet.runId, packet.attemptId, packet.ownerTaskId, packet.ownerInstanceId].every((value) => ID.test(value))) reasons.add('DWE_RUNTIME_IDENTITY_INVALID');
  if (!Number.isSafeInteger(packet.ownerProcess.pid) || packet.ownerProcess.pid <= 0 || !Number.isFinite(Date.parse(packet.ownerProcess.startedAt))) reasons.add('DWE_OWNER_PROCESS_INVALID');
  const issued = Date.parse(packet.issuedAt);
  const expires = Date.parse(packet.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || nowMs >= expires) reasons.add('DWE_PACKET_EXPIRED');
  return { valid: reasons.size === 0, reasonCodes: [...reasons].sort() };
}

export function mintRuntimeIdentity(ownerTaskId: string, now = new Date()): Pick<WorkflowPacket, 'runId' | 'attemptId' | 'ownerTaskId' | 'ownerInstanceId' | 'ownerProcess' | 'issuedAt'> {
  const issuedAt = now.toISOString();
  return {
    runId: `dwe-${randomUUID()}`,
    attemptId: `attempt-${randomUUID()}`,
    ownerTaskId,
    ownerInstanceId: `owner-${randomUUID()}`,
    ownerProcess: { pid: process.pid, startedAt: issuedAt },
    issuedAt,
  };
}

export function createRuntimeIssuance(packet: WorkflowPacket, contract?: ConsumerContract): RuntimeIssuance {
  return {
    schemaVersion: 1,
    contractFingerprint: sha256(stableJson(contract ?? null)),
    packetFingerprint: packetFingerprint(packet),
    capabilityToken: randomUUID(),
    runId: packet.runId,
    attemptId: packet.attemptId,
    ownerTaskId: packet.ownerTaskId,
    ownerInstanceId: packet.ownerInstanceId,
    ownerProcess: packet.ownerProcess,
    consumerId: packet.consumerId,
    contractVersion: packet.contractVersion,
    expectedRoot: packet.expectedRoot,
    worktreePath: packet.worktree.path,
    issuedAt: packet.issuedAt,
    expiresAt: packet.expiresAt,
  };
}

export function validateRuntimeIssuance(packet: WorkflowPacket, issuance: RuntimeIssuance | undefined, nowMs = Date.now(), contract?: ConsumerContract): boolean {
  return issuance?.schemaVersion === 1
    && issuance.contractFingerprint === sha256(stableJson(contract ?? null))
    && typeof issuance.capabilityToken === 'string'
    && /^[0-9a-f-]{36}$/i.test(issuance.capabilityToken)
    && issuance.packetFingerprint === packetFingerprint(packet)
    && issuance.runId === packet.runId
    && issuance.attemptId === packet.attemptId
    && issuance.ownerTaskId === packet.ownerTaskId
    && issuance.ownerInstanceId === packet.ownerInstanceId
    && issuance.ownerProcess.pid === packet.ownerProcess.pid
    && issuance.ownerProcess.startedAt === packet.ownerProcess.startedAt
    && issuance.consumerId === packet.consumerId
    && issuance.contractVersion === packet.contractVersion
    && issuance.expectedRoot === packet.expectedRoot
    && issuance.worktreePath === packet.worktree.path
    && issuance.issuedAt === packet.issuedAt
    && issuance.expiresAt === packet.expiresAt
    && Date.parse(issuance.expiresAt) > nowMs;
}
