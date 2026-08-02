/* global args, phase, pipeline, agent */
export const meta = {
  name: 'dynamic-workflow-engineering',
  description: 'Run finite Dynamic Workflow work packages with bounded outputs',
  phases: [{ title: 'Execute', detail: 'one bounded child per declared work package' }],
}

const preparedPath = args?.preparedPacketPath
if (typeof preparedPath !== 'string' || !/[/\\]\.dev-pomogator[/\\]runtime[/\\]runs[/\\]dwe-[A-Za-z0-9-]+[/\\]prepared-packet\.json$/.test(preparedPath)) {
  throw new Error('DWE_PREPARED_PACKET_PATH_REQUIRED')
}
const [{readFile, realpath}, {createHash}, pathModule] = await Promise.all([import('node:fs/promises'), import('node:crypto'), import('node:path')])
const actualPreparedPath = await realpath(preparedPath)
if (actualPreparedPath !== preparedPath) throw new Error('DWE_PREPARED_PACKET_SYMLINK')
const prepared = JSON.parse(await readFile(actualPreparedPath, 'utf8'))
const packet = prepared?.packet
const issuance = prepared?.issuance
const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const packetFingerprint = createHash('sha256').update(stableJson(packet)).digest('hex')
const contractFingerprint = createHash('sha256').update(stableJson(prepared.contract)).digest('hex')
const statePath = pathModule.join(pathModule.dirname(actualPreparedPath), 'state.json')
const state = JSON.parse(await readFile(statePath, 'utf8'))
if (!packet || !issuance || packet.operation !== 'workflow' || !Array.isArray(packet.workPackages)) {
  throw new Error('DWE_PREPARED_PACKET_REQUIRED')
}
if (issuance.schemaVersion !== 1
  || !/^[0-9a-f-]{36}$/i.test(issuance.capabilityToken || '')
  || issuance.packetFingerprint !== packetFingerprint
  || issuance.contractFingerprint !== contractFingerprint
  || prepared.contract?.consumerId !== packet.consumerId
  || prepared.contract?.version !== packet.contractVersion
  || prepared.contract?.operation !== packet.operation
  || prepared.contract?.outputSchema !== packet.outputSchema
  || state.runId !== packet.runId
  || state.state !== 'ROOT_VERIFIED'
  || state.ownerInstanceId !== packet.ownerInstanceId
  || state.ownerProcess?.pid !== packet.ownerProcess?.pid
  || state.ownerProcess?.startedAt !== packet.ownerProcess?.startedAt
  || state.fencingToken !== 1
  || issuance.runId !== packet.runId
  || issuance.attemptId !== packet.attemptId
  || issuance.ownerTaskId !== packet.ownerTaskId
  || issuance.ownerInstanceId !== packet.ownerInstanceId
  || issuance.ownerProcess?.pid !== packet.ownerProcess?.pid
  || issuance.ownerProcess?.startedAt !== packet.ownerProcess?.startedAt
  || issuance.consumerId !== packet.consumerId
  || issuance.contractVersion !== packet.contractVersion
  || issuance.expectedRoot !== packet.expectedRoot
  || issuance.worktreePath !== packet.worktree?.path
  || issuance.issuedAt !== packet.issuedAt
  || issuance.expiresAt !== packet.expiresAt
  || Date.parse(issuance.expiresAt) <= Date.now()) {
  throw new Error('DWE_RUNTIME_ISSUANCE_INVALID')
}
for (const [key, value] of Object.entries(packet.ceilings || {})) {
  if (!Number.isFinite(value) || value <= 0 || value > prepared.contract?.ceilings?.[key]) throw new Error(`DWE_CONTRACT_CEILING_EXCEEDED:${key}`)
}
if (packet.workPackages.length > packet.ceilings.logicalCalls || packet.workPackages.length > packet.ceilings.physicalAttempts) {
  throw new Error('DWE_LOGICAL_CALL_CEILING_EXCEEDED')
}
if (!Array.isArray(packet.scopeIds) || packet.scopeIds.length === 0 || !Array.isArray(packet.workPackages) || packet.workPackages.length === 0 || !packet.stopCondition) {
  throw new Error('DWE_PACKET_INCOMPLETE')
}
if (new Set(packet.workPackages.map(work => work.id)).size !== packet.workPackages.length) {
  throw new Error('DWE_DUPLICATE_WORK_PACKAGE')
}
const scopeSet = new Set(packet.scopeIds)
for (const work of packet.workPackages) {
  if (!work.scopeIds?.length || work.scopeIds.some(scope => !scopeSet.has(scope))) {
    throw new Error(`DWE_WORK_SCOPE_WIDENED:${work.id}`)
  }
}

const WORK_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'changed_paths', 'focused_commands', 'evidence', 'open_risks_or_questions', 'stop_reason'],
  properties: {
    status: {enum: ['completed', 'blocked', 'failed']},
    changed_paths: {type: 'array', items: {type: 'string'}},
    focused_commands: {type: 'array', items: {type: 'string'}},
    evidence: {type: 'array', items: {type: 'string'}},
    open_risks_or_questions: {type: 'array', items: {type: 'string'}},
    stop_reason: {type: ['string', 'null']},
  },
}

phase('Execute')
const completed = await pipeline(packet.workPackages, work => {
  const exactPaths = [...new Set([...(work.ownership?.read || []), ...(work.ownership?.write || [])])]
  return agent([
    'Coordinator ownership manifest:',
    `- package_id: ${packet.runId}:${work.id}`,
    `- owner: ${packet.consumerId}`,
    `- role: bounded Dynamic Workflow worker for ${work.id}`,
    `- paths: ${exactPaths.length ? exactPaths.join('; ') : work.scopeIds.join('; ')}`,
    `- focused_tests: ${work.focusedTests?.length ? work.focusedTests.join('; ') : 'none; read-only or packet-defined verification'}`,
    `- acceptance: ${packet.evidenceStandard}; stop after ${packet.stopCondition}`,
    '',
    `Scope IDs: ${work.scopeIds.join(', ')}.`,
    `Question: ${work.prompt}`,
    'Constraints: operate only inside declared ownership; do not widen scope or spawn native Agent.',
    `Output contract: ${packet.outputSchema}; return completed only when acceptance evidence exists.`,
    `Stop condition: ${packet.stopCondition}.`,
  ].join('\n'), {
    label: `dwe:${work.id}`,
    phase: 'Execute',
    agentType: 'workflow-subagent',
    schema: WORK_RESULT_SCHEMA,
  }).then(result => ({
    id: work.id,
    required: work.required,
    status: result?.status || 'failed',
    result,
  }))
})

const results = completed.filter(Boolean)
const required = packet.workPackages.filter(work => work.required).map(work => work.id)
const completedRequired = new Set(results.filter(result => result.status === 'completed').map(result => result.id))
const missing = required.filter(id => !completedRequired.has(id))
const failed = results.filter(result => result.status === 'failed').map(result => result.id)
const blocked = results.filter(result => result.status === 'blocked').map(result => result.id)
return {
  runId: packet.runId,
  attemptId: packet.attemptId,
  status: missing.length === 0 ? 'COMPLETE' : results.some(result => result.status === 'completed') ? 'PARTIAL' : 'FAILED',
  results,
  missingRequired: missing,
  failed,
  blocked,
}
