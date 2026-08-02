#!/usr/bin/env node

// tools/dynamic-workflow-engineering/cli.ts
import fs6 from "node:fs";
import path7 from "node:path";
import { pathToFileURL } from "node:url";

// tools/dynamic-workflow-engineering/admission.ts
import fs from "node:fs";
import path2 from "node:path";

// tools/dynamic-workflow-engineering/packet.ts
import { createHash, randomUUID } from "node:crypto";
var ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var SHA = /^[a-f0-9]{7,64}$/i;
var DIGEST = /^[a-f0-9]{64}$/i;
var POSITIVE_CEILINGS = [
  "logicalCalls",
  "physicalAttempts",
  "concurrency",
  "discoveryRounds",
  "toolCalls",
  "findings",
  "inputBytes",
  "outputBytes",
  "responseTokens",
  "wallClockMs"
];
var MODES = /* @__PURE__ */ new Set(["hard admission", "hard cancellation", "monitored circuit", "best-effort", "unavailable"]);
function stableUnique(values) {
  return values.length > 0 && new Set(values).size === values.length && values.every((value) => ID.test(value));
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function populationDigest(scopeIds) {
  return sha256([...scopeIds].sort().join("\n"));
}
function packetFingerprint(packet) {
  return sha256(stableJson(packet));
}
function validatePacket(packet, nowMs = Date.now()) {
  const reasons = /* @__PURE__ */ new Set();
  if (packet.schemaVersion !== 1) reasons.add("DWE_PACKET_SCHEMA_UNSUPPORTED");
  if (!ID.test(packet.consumerId) || packet.operation !== "workflow") reasons.add("DWE_CONSUMER_INVALID");
  if (!stableUnique(packet.scopeIds)) reasons.add("DWE_SCOPE_NOT_FINITE");
  if (!DIGEST.test(packet.populationDigest) || packet.populationDigest !== populationDigest(packet.scopeIds)) {
    reasons.add("DWE_POPULATION_DIGEST_MISMATCH");
  }
  if (!stableUnique(packet.workPackages.map((work) => work.id))) reasons.add("DWE_WORK_PACKAGES_INVALID");
  const scopeSet = new Set(packet.scopeIds);
  const packageSet = new Set(packet.workPackages.map((work) => work.id));
  for (const work of packet.workPackages) {
    if (!work.scopeIds.length || work.scopeIds.some((scope) => !scopeSet.has(scope))) reasons.add("DWE_WORK_SCOPE_WIDENED");
    if (!work.prompt.trim() || Buffer.byteLength(work.prompt, "utf8") > packet.ceilings.inputBytes) reasons.add("DWE_WORK_PROMPT_INVALID");
    if (work.dependencies.some((dependency) => !packageSet.has(dependency) || dependency === work.id)) reasons.add("DWE_DEPENDENCY_INVALID");
    if (!Array.isArray(work.ownership.read) || !Array.isArray(work.ownership.write)) reasons.add("DWE_OWNERSHIP_MISSING");
  }
  if (packet.workPackages.length > packet.ceilings.logicalCalls) reasons.add("DWE_LOGICAL_CALL_CEILING_EXCEEDED");
  if (packet.ceilings.physicalAttempts < packet.ceilings.logicalCalls) reasons.add("DWE_ATTEMPT_CEILING_INVALID");
  for (const key of POSITIVE_CEILINGS) {
    const value = packet.ceilings[key];
    if (!Number.isSafeInteger(value) || value <= 0) reasons.add(`DWE_CEILING_INVALID:${key}`);
    if (!MODES.has(packet.controlModes[key])) reasons.add(`DWE_CONTROL_MODE_INVALID:${key}`);
  }
  if (packet.ceilings.concurrency > packet.ceilings.logicalCalls) reasons.add("DWE_CONCURRENCY_CEILING_INVALID");
  if (!packet.barriers.every((barrier) => ID.test(barrier.id) && barrier.justification.trim() && barrier.inputs.length > 1 && barrier.inputs.every((id) => packageSet.has(id)))) {
    reasons.add("DWE_BARRIER_INVALID");
  }
  if (!packet.evidenceStandard.trim() || !packet.outputSchema.trim() || !packet.stopCondition.trim()) reasons.add("DWE_EVIDENCE_OUTPUT_STOP_MISSING");
  if (!packet.blockedStates.length || !packet.droppedStates.length) reasons.add("DWE_BLOCKED_DROPPED_STATE_MISSING");
  if (!packet.expectedRoot || !packet.worktree.path || !SHA.test(packet.worktree.baseSha)) reasons.add("DWE_ROOT_WORKTREE_INVALID");
  if (!stableUnique(packet.requiredGates)) reasons.add("DWE_REQUIRED_GATES_INVALID");
  if (![packet.runId, packet.attemptId, packet.ownerTaskId, packet.ownerInstanceId].every((value) => ID.test(value))) reasons.add("DWE_RUNTIME_IDENTITY_INVALID");
  if (!Number.isSafeInteger(packet.ownerProcess.pid) || packet.ownerProcess.pid <= 0 || !Number.isFinite(Date.parse(packet.ownerProcess.startedAt))) reasons.add("DWE_OWNER_PROCESS_INVALID");
  const issued = Date.parse(packet.issuedAt);
  const expires = Date.parse(packet.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || nowMs >= expires) reasons.add("DWE_PACKET_EXPIRED");
  return { valid: reasons.size === 0, reasonCodes: [...reasons].sort() };
}
function mintRuntimeIdentity(ownerTaskId, now = /* @__PURE__ */ new Date()) {
  const issuedAt = now.toISOString();
  return {
    runId: `dwe-${randomUUID()}`,
    attemptId: `attempt-${randomUUID()}`,
    ownerTaskId,
    ownerInstanceId: `owner-${randomUUID()}`,
    ownerProcess: { pid: process.pid, startedAt: issuedAt },
    issuedAt
  };
}
function createRuntimeIssuance(packet, contract) {
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
    expiresAt: packet.expiresAt
  };
}
function validateRuntimeIssuance(packet, issuance, nowMs = Date.now(), contract) {
  return issuance?.schemaVersion === 1 && issuance.contractFingerprint === sha256(stableJson(contract ?? null)) && typeof issuance.capabilityToken === "string" && /^[0-9a-f-]{36}$/i.test(issuance.capabilityToken) && issuance.packetFingerprint === packetFingerprint(packet) && issuance.runId === packet.runId && issuance.attemptId === packet.attemptId && issuance.ownerTaskId === packet.ownerTaskId && issuance.ownerInstanceId === packet.ownerInstanceId && issuance.ownerProcess.pid === packet.ownerProcess.pid && issuance.ownerProcess.startedAt === packet.ownerProcess.startedAt && issuance.consumerId === packet.consumerId && issuance.contractVersion === packet.contractVersion && issuance.expectedRoot === packet.expectedRoot && issuance.worktreePath === packet.worktree.path && issuance.issuedAt === packet.issuedAt && issuance.expiresAt === packet.expiresAt && Date.parse(issuance.expiresAt) > nowMs;
}

// tools/dynamic-workflow-engineering/root-preflight.ts
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
function canonical(target) {
  const resolved = path.resolve(target);
  try {
    return realpathSync.native(resolved).replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  } catch {
    return resolved.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  }
}
function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function verifyRootPreflight(packet) {
  const expectedRoot = canonical(packet.expectedRoot);
  const expectedWorktree = canonical(packet.worktree.path);
  let actualRoot = null;
  let actualSha = null;
  let dirtyPaths = [];
  try {
    actualRoot = canonical(git(packet.worktree.path, ["rev-parse", "--show-toplevel"]));
    actualSha = git(packet.worktree.path, ["rev-parse", "HEAD"]);
    dirtyPaths = git(packet.worktree.path, ["status", "--porcelain=v1"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/\\/g, "/"));
  } catch {
    return { ok: false, reasonCode: "DWE_GIT_ROOT_UNAVAILABLE", expectedRoot, actualRoot, expectedWorktree, actualSha, dirtyPaths, unexpectedDirtyPaths: dirtyPaths };
  }
  const allowed = packet.dirtyPathAllowlist.map((entry) => entry.replace(/\\/g, "/"));
  const unexpectedDirtyPaths = dirtyPaths.filter((entry) => !allowed.some((allowedPath) => entry === allowedPath || entry.startsWith(`${allowedPath}/`)));
  let reasonCode = null;
  if (actualRoot !== expectedRoot || actualRoot !== expectedWorktree) reasonCode = "DWE_ROOT_WORKTREE_MISMATCH";
  else if (actualSha !== packet.worktree.baseSha) reasonCode = "DWE_BASE_SHA_MISMATCH";
  else if (unexpectedDirtyPaths.length) reasonCode = "DWE_DIRTY_PATH_OUTSIDE_ALLOWLIST";
  else if (packet.worktree.mode === "isolated") reasonCode = "DWE_ISOLATED_WORKTREE_UNPROVEN";
  return { ok: reasonCode === null, reasonCode, expectedRoot, actualRoot, expectedWorktree, actualSha, dirtyPaths, unexpectedDirtyPaths };
}

// tools/dynamic-workflow-engineering/admission.ts
function loadContracts(registryPath = path2.join(import.meta.dirname, "contracts.json")) {
  const value = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (value.schemaVersion !== 1 || !Array.isArray(value.contracts)) throw new Error("invalid Dynamic Workflow contract registry");
  return value;
}
function compareCeilings(packet, contract) {
  const reasons = [];
  for (const key of Object.keys(contract.ceilings)) {
    if (packet.ceilings[key] > contract.ceilings[key]) reasons.push(`DWE_CONTRACT_CEILING_EXCEEDED:${key}`);
  }
  return reasons;
}
function admitPacket(packet, options = {}) {
  const validation = validatePacket(packet, options.nowMs);
  const reasons = [...validation.reasonCodes];
  const registry = options.registry ?? loadContracts();
  const contract = registry.contracts.find((entry) => entry.consumerId === packet.consumerId && entry.version === packet.contractVersion);
  if (options.requireRuntimeIssuance !== false && !validateRuntimeIssuance(packet, options.issuance, options.nowMs, contract)) reasons.push("DWE_RUNTIME_ISSUANCE_INVALID");
  if (!contract) reasons.push("DWE_CONTRACT_NOT_FOUND");
  else {
    if (contract.operation !== packet.operation) reasons.push("DWE_OPERATION_FORBIDDEN");
    if (contract.outputSchema !== packet.outputSchema) reasons.push("DWE_OUTPUT_SCHEMA_MISMATCH");
    if (Date.parse(contract.reviewAfter) <= (options.nowMs ?? Date.now())) reasons.push("DWE_CONTRACT_EXPIRED");
    reasons.push(...compareCeilings(packet, contract));
  }
  const rootPreflight = reasons.length === 0 && options.verifyRoot !== false ? verifyRootPreflight(packet) : void 0;
  if (rootPreflight && !rootPreflight.ok && rootPreflight.reasonCode) reasons.push(rootPreflight.reasonCode);
  return {
    decision: reasons.length === 0 ? "allow" : "deny",
    reasonCodes: [...new Set(reasons)].sort(),
    consumerId: packet.consumerId || null,
    runId: packet.runId || null,
    attemptId: packet.attemptId || null,
    rootPreflight
  };
}

// tools/dynamic-workflow-engineering/agent-policy.ts
function classifyGuarantee(capabilities) {
  if (!capabilities.boundedRuntimeAvailable) return "UNAVAILABLE";
  if (capabilities.nativeAgentPreSpawnBoundary && capabilities.directNativeAgentDenyBeforeSpawn && capabilities.nestedNativeAgentDenyBeforeSpawn && capabilities.workflowNativeAgentAllowed && capabilities.protectedRouteFailClosed) return "ENFORCED";
  return "STEERING_ONLY";
}

// tools/dynamic-workflow-engineering/capability-matrix.ts
function evaluateCapabilityMatrix(input) {
  const host = {
    nativeAgentPreSpawnBoundary: input.nativeAgentPreSpawnBoundary === true,
    directNativeAgentDenyBeforeSpawn: input.directNativeAgentDenyBeforeSpawn === true,
    nestedNativeAgentDenyBeforeSpawn: input.nestedNativeAgentDenyBeforeSpawn === true,
    workflowNativeAgentAllowed: input.workflowNativeAgentAllowed === true,
    protectedRouteFailClosed: input.protectedRouteFailClosed === true,
    boundedRuntimeAvailable: input.boundedRuntimeAvailable === true || input.runtimeBundleLoads === true
  };
  const guaranteeTier = classifyGuarantee(host);
  const controls = {
    packetAdmission: { mode: host.boundedRuntimeAvailable ? "best-effort" : "unavailable", evidence: "runtime and workflow validators reject malformed packets, but trusted host origin is unavailable", verified: host.boundedRuntimeAvailable },
    rootWorktreePreflight: { mode: host.boundedRuntimeAvailable ? "hard admission" : "unavailable", evidence: "git top-level/base/dirty preflight", verified: host.boundedRuntimeAvailable },
    nativeAgentDeny: { mode: guaranteeTier === "ENFORCED" ? "hard admission" : "unavailable", evidence: "requires real direct and Workflow-nested deny-before-spawn proof", verified: guaranteeTier === "ENFORCED" },
    processTreeCancellation: { mode: "best-effort", evidence: "cross-platform process-tree signals exist; zero-descendant proof not yet host-verified", verified: false },
    tokenCeiling: { mode: "monitored circuit", evidence: "packet declares ceiling; host preemption unavailable until measured", verified: false },
    wallClock: { mode: host.boundedRuntimeAvailable ? "hard cancellation" : "unavailable", evidence: "captured process timeout plus process-tree signal escalation", verified: host.boundedRuntimeAvailable }
  };
  return { schemaVersion: 1, guaranteeTier, host, controls, protectedHookEligible: guaranteeTier === "ENFORCED" };
}

// tools/dynamic-workflow-engineering/consumer-census.ts
import fs2 from "node:fs";
import path3 from "node:path";
import { basename } from "node:path";
var IGNORED = /* @__PURE__ */ new Set(["dynamic-workflow-engineering"]);
var SCAN_ROOTS = [
  [".claude", "skills"],
  [".claude", "agents"],
  [".claude", "commands"],
  ["tools"]
];
function walk(root) {
  if (!fs2.existsSync(root)) return [];
  const out = [];
  for (const entry of fs2.readdirSync(root, { withFileTypes: true })) {
    const target = path3.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(target));
    else if (/\.(?:md|ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/.test(entry.name)) out.push(target);
  }
  return out;
}
function enumerateConsumers(repoRoot) {
  const records = [];
  const files = SCAN_ROOTS.flatMap((parts) => walk(path3.join(repoRoot, ...parts)));
  for (const file of files) {
    const relativeFile = path3.relative(repoRoot, file).replace(/\\/g, "/");
    if (relativeFile.startsWith("tools/dynamic-workflow-engineering/")) continue;
    const id = relativeFile.startsWith(".claude/skills/") ? relativeFile.split("/")[2] : path3.basename(file, path3.extname(file));
    if (IGNORED.has(id)) continue;
    const lines = fs2.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const native = /\bAgent\s*\(|Agent\(subagent_type|Call\s+`?Agent|Invoke Agent|Use Agent|через Agent\(\)|`Agent` tool|свежим под-агентом|functions\.Agent/.test(line);
      const workflow = /Workflow-native\s+`?agent\(\)|\bagent\(.*phase/i.test(line);
      if (!native && !workflow) return;
      records.push({
        id,
        subject: workflow ? "workflow-native-agent" : "native-Agent",
        file: path3.relative(repoRoot, file).replace(/\\/g, "/"),
        line: index + 1,
        contract: null,
        migrationReason: "Exact consumer decomposition, packet ceilings, workflow script contract, and executable real-path proof remain required before migration.",
        disposition: "blocked"
      });
    });
  }
  return records.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}
function verifyCensus(records, repoRoot) {
  const keys = records.map((record) => `${record.file}:${record.line}`);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  const missingArchitectureDecisionBuilder = !records.some((record) => record.id === "architecture-decision-builder");
  const unsupportedSurfaces = [];
  if (repoRoot) {
    for (const parts of SCAN_ROOTS) if (!fs2.existsSync(path3.join(repoRoot, ...parts))) unsupportedSurfaces.push(parts.join("/"));
  }
  const uncontractedConsumers = [...new Set(records.filter((record) => record.disposition === "migrated" && !record.contract).map((record) => record.id))];
  return { ok: duplicates.length === 0 && !missingArchitectureDecisionBuilder && unsupportedSurfaces.length === 0 && uncontractedConsumers.length === 0, missingArchitectureDecisionBuilder, duplicateLocations: [...new Set(duplicates)], unsupportedSurfaces, uncontractedConsumers };
}
async function main() {
  const root = path3.resolve(process.argv[2] || process.cwd());
  const records = enumerateConsumers(root);
  const verification = verifyCensus(records, root);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, records, verification }, null, 2)}
`);
  if (!verification.ok) process.exitCode = 2;
}
if (process.argv[1] && basename(process.argv[1]).replace(/\\/g, "/") === "consumer-census.ts") main();

// tools/dynamic-workflow-engineering/incident-exporter.ts
import fs3 from "node:fs";
import path4 from "node:path";
function parseJsonLines(target) {
  return fs3.readFileSync(target, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function transcriptBlocks(row) {
  const content = row?.message?.content;
  return Array.isArray(content) ? content : [];
}
function reconcileIncident(manifestPath) {
  const manifest = JSON.parse(fs3.readFileSync(manifestPath, "utf8"));
  if (!/tool_use_id/.test(manifest.provenance.derivation)) return { status: "REPLAY_UNAVAILABLE", manifest, reason: "producer derivation is not tool-use correlated" };
  const journalPath = manifest.provenance.journal_path_at_capture;
  if (!fs3.existsSync(journalPath)) return { status: "REPLAY_UNAVAILABLE", manifest, reason: "producer journal is missing" };
  const journal = parseJsonLines(journalPath);
  const resultRows = journal.filter((entry) => entry.type === "result");
  const completedGithub = resultRows.some((entry) => Array.isArray(entry.result?.issues) && entry.result.issues.length > 0);
  const workflowRoot = path4.dirname(journalPath);
  const agentIds = new Set(journal.filter((entry) => entry.agentId).map((entry) => entry.agentId));
  let calls = 0;
  let bytes = 0;
  for (const agentId of agentIds) {
    const transcript = path4.join(workflowRoot, `agent-${agentId}.jsonl`);
    if (!fs3.existsSync(transcript)) continue;
    const specToolIds = /* @__PURE__ */ new Set();
    for (const row of parseJsonLines(transcript)) {
      for (const block of transcriptBlocks(row)) {
        if (block.type === "tool_use" && block.id && block.name?.startsWith("mcp__dev-pomogator-specs__")) specToolIds.add(block.id);
        if (block.type === "tool_result" && block.tool_use_id && specToolIds.has(block.tool_use_id)) {
          calls += 1;
          bytes += Buffer.byteLength(typeof block.content === "string" ? block.content : JSON.stringify(block.content), "utf8");
        }
      }
    }
  }
  const githubResult = resultRows.find((entry) => Array.isArray(entry.result?.issues));
  const githubKey = githubResult?.key;
  const specStarts = journal.filter((entry) => entry.type === "started" && entry.key && entry.key !== githubKey);
  const specKeys = new Set(specStarts.map((entry) => entry.key));
  const attempts = specStarts.length;
  const structuredOutputs = journal.filter((entry) => entry.type === "result" && entry.key && specKeys.has(entry.key)).length;
  const byteDelta = Math.abs(bytes - manifest.ground_truth.aggregate_response_bytes);
  const bytesCorroborated = byteDelta <= Math.max(1, Math.floor(manifest.ground_truth.aggregate_response_bytes * 0.12));
  if (attempts !== manifest.ground_truth.spec_collector_attempts || calls !== manifest.ground_truth.spec_mcp_calls || !bytesCorroborated || !completedGithub || structuredOutputs !== manifest.ground_truth.spec_collector_structured_outputs) {
    return { status: "REPLAY_UNAVAILABLE", manifest, reason: `producer evidence mismatch (attempts=${attempts}, calls=${calls}, bytes=${bytes}, expectedBytes=${manifest.ground_truth.aggregate_response_bytes}, github=${completedGithub}, outputs=${structuredOutputs})` };
  }
  const targetMet = calls <= manifest.acceptance_target.maximum_mcp_calls && bytes <= manifest.acceptance_target.maximum_aggregate_response_bytes;
  return { status: "RECONCILED", manifest, historicalTargetMet: targetMet, observed: { attempts, calls, bytes, structuredOutputs } };
}

// tools/dynamic-workflow-engineering/replay-exporter.ts
import { createHash as createHash2 } from "node:crypto";
import fs5 from "node:fs";
import path6 from "node:path";

// tools/dynamic-workflow-engineering/run-state.ts
import fs4 from "node:fs";
import path5 from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
var ACTIVE_ORDER = ["CREATED", "ROOT_VERIFIED", "EXCLUSIVE_OWNERSHIP", "PREFLIGHT_GREEN", "PLAN_FROZEN", "RUNNING", "VERIFYING", "COMMITTING"];
var TERMINAL_RUN_STATES = /* @__PURE__ */ new Set(["DONE", "PARTIAL", "FAILED", "BLOCKED", "CANCELLED", "PAUSED_RESUMABLE", "TERMINATED_NO_RESUME", "HARNESS_REPAIR"]);
var TERMINAL = TERMINAL_RUN_STATES;
var CasMismatchError = class extends Error {
  code = "DWE_CAS_MISMATCH";
};
var FencingError = class extends Error {
  code = "DWE_STALE_FENCING_TOKEN";
};
function createRunState(packet) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    schemaVersion: 1,
    runId: packet.runId,
    state: "CREATED",
    stateVersion: 1,
    fencingToken: 1,
    ownerTaskId: packet.ownerTaskId,
    ownerInstanceId: packet.ownerInstanceId,
    ownerProcess: packet.ownerProcess,
    expectedRoot: packet.expectedRoot,
    worktree: packet.worktree,
    dirtyPathAllowlist: packet.dirtyPathAllowlist,
    requiredGates: packet.requiredGates,
    gateResults: packet.requiredGates.map((id) => ({ id, status: "pending" })),
    lockOrder: ["checkoutWriterLock", "externalRuntimeLease"],
    collections: { originalCandidates: [], staged: [], proven: [], rejected: [], deferred: [], unprovenApplied: [] },
    baselineHashes: {},
    createdAt: now,
    updatedAt: now
  };
}
function assertAuthority(state, ownerInstanceId, fencingToken) {
  if (state.ownerInstanceId !== ownerInstanceId || state.fencingToken !== fencingToken) throw new FencingError("owner instance or fencing token is stale");
}
function transitionRunState(state, target, expectedVersion, authority, nextOwner) {
  if (state.stateVersion !== expectedVersion) throw new CasMismatchError(`expected stateVersion ${expectedVersion}, found ${state.stateVersion}`);
  assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
  if (TERMINAL.has(state.state)) throw new Error(`terminal state cannot transition: ${state.state}`);
  if (!TERMINAL.has(target)) {
    const current = ACTIVE_ORDER.indexOf(state.state);
    const next = ACTIVE_ORDER.indexOf(target);
    if (next !== current + 1) throw new Error(`invalid transition ${state.state} -> ${target}`);
  }
  if (target === "RUNNING" && state.gateResults.some((gate) => gate.status === "failed" || gate.status === "blocked")) throw new Error("required gate blocks RUNNING");
  if ((target === "COMMITTING" || target === "DONE") && state.gateResults.some((gate) => gate.status !== "passed")) throw new Error("all required gates must pass before commit or completion");
  const ownershipChanged = nextOwner && nextOwner.ownerInstanceId !== state.ownerInstanceId;
  return {
    ...state,
    ...nextOwner,
    state: target,
    stateVersion: state.stateVersion + 1,
    fencingToken: ownershipChanged ? state.fencingToken + 1 : state.fencingToken,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function runDirectory(repoRoot, runId) {
  if (!/^dwe-[A-Za-z0-9-]+$/.test(runId)) throw new Error("invalid run id");
  return path5.join(repoRoot, ".dev-pomogator", "runtime", "runs", runId);
}
function writeJsonAtomic(target, value) {
  fs4.mkdirSync(path5.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID2()}`;
  const fd = fs4.openSync(temporary, "wx", 384);
  try {
    fs4.writeFileSync(fd, `${JSON.stringify(value, null, 2)}
`, "utf8");
    fs4.fsyncSync(fd);
  } finally {
    fs4.closeSync(fd);
  }
  try {
    fs4.renameSync(temporary, target);
  } catch (error) {
    try {
      fs4.unlinkSync(temporary);
    } catch {
    }
    throw error;
  }
}
function persistRunState(repoRoot, state) {
  const target = path5.join(runDirectory(repoRoot, state.runId), "state.json");
  writeJsonAtomic(target, state);
  return target;
}
function readRunState(repoRoot, runId) {
  return JSON.parse(fs4.readFileSync(path5.join(runDirectory(repoRoot, runId), "state.json"), "utf8"));
}

// tools/dynamic-workflow-engineering/replay-exporter.ts
function contained(root, reference) {
  if (!reference || path6.isAbsolute(reference)) return null;
  const resolvedRoot = fs5.realpathSync.native(root);
  const candidate = path6.resolve(root, reference);
  const relative = path6.relative(resolvedRoot, candidate);
  if (!relative || relative.startsWith("..") || path6.isAbsolute(relative)) return null;
  try {
    const real = fs5.realpathSync.native(candidate);
    const realRelative = path6.relative(resolvedRoot, real);
    return !realRelative.startsWith("..") && !path6.isAbsolute(realRelative) ? real : null;
  } catch {
    return null;
  }
}
function sha2562(target) {
  return createHash2("sha256").update(fs5.readFileSync(target)).digest("hex");
}
function replayOffline(repoRoot, runId) {
  const root = runDirectory(repoRoot, runId);
  const journalPath = path6.join(root, "progress.jsonl");
  const terminalPath = path6.join(root, "terminal.json");
  if (!fs5.existsSync(journalPath) || !fs5.existsSync(terminalPath)) return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["progress.jsonl", "terminal.json"], reason: "producer evidence missing" };
  let state;
  try {
    state = readRunState(repoRoot, runId);
  } catch {
    return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["state.json"], reason: "authoritative run state missing" };
  }
  if (!TERMINAL_RUN_STATES.has(state.state)) return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["terminal run state"], reason: `run state is not terminal: ${state.state}` };
  const events = fs5.readFileSync(journalPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  let lastSeq = 0;
  for (const event of events) {
    if (event.runId !== runId || event.seq !== lastSeq + 1) return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["monotonic compatible journal"], reason: "journal incompatible" };
    lastSeq = event.seq;
  }
  const terminal = JSON.parse(fs5.readFileSync(terminalPath, "utf8"));
  if (terminal.runId !== runId || terminal.ownerStopped !== true || terminal.descendantsRemaining !== 0 || terminal.writersRemaining !== 0) {
    return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["compatible terminal evidence"], reason: "terminal evidence incompatible" };
  }
  if (events.some((event) => event.runId !== runId || event.ownerInstanceId !== state.ownerInstanceId || event.fencingToken !== state.fencingToken || event.ownerPid !== state.ownerProcess.pid)) {
    return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs: [], missing: ["fenced journal provenance"], reason: "journal identity does not match authoritative state" };
  }
  const successful = events.filter((event) => event.status === "success" && event.outputRef);
  const completedOutputs = successful.map((event) => event.outputRef);
  const missing = [];
  for (const event of successful) {
    const target = contained(root, event.outputRef);
    if (!target || !event.outputHash || sha2562(target) !== event.outputHash) missing.push(event.outputRef);
  }
  if (missing.length) return { status: "REPLAY_UNAVAILABLE", runId, completedOutputs, missing, reason: "referenced output is missing, outside the run, or hash-incompatible" };
  return { status: "REPLAYED", runId, completedOutputs, missing: [] };
}

// tools/dynamic-workflow-engineering/cli.ts
function usage() {
  throw new Error("usage: cli.ts <prepare|capability|census|replay|incident> [input]");
}
function preparePacket(request) {
  const runtimeIdentity = mintRuntimeIdentity(request.ownerTaskId);
  const packet = { ...request, ...runtimeIdentity };
  const contract = loadContracts().contracts.find((entry) => entry.consumerId === packet.consumerId && entry.version === packet.contractVersion);
  const issuance = createRuntimeIssuance(packet, contract);
  const decision = admitPacket(packet, { issuance });
  if (decision.decision === "deny") return { decision };
  let state = createRunState(packet);
  state = transitionRunState(state, "ROOT_VERIFIED", state.stateVersion, { ownerInstanceId: state.ownerInstanceId, fencingToken: state.fencingToken });
  const statePath = persistRunState(packet.expectedRoot, state);
  const preparedPacketPath = path7.join(path7.dirname(statePath), "prepared-packet.json");
  fs6.writeFileSync(preparedPacketPath, `${JSON.stringify({ packet, issuance, contract }, null, 2)}
`, { flag: "wx", mode: 384 });
  return { decision, statePath, issuance, preparedPacketPath };
}
async function main2(argv = process.argv.slice(2)) {
  const command = argv[0] ?? usage();
  if (command === "capability") {
    process.stdout.write(`${JSON.stringify(evaluateCapabilityMatrix({ boundedRuntimeAvailable: true }), null, 2)}
`);
    return;
  }
  if (command === "prepare") {
    const packetPath = argv[1] ?? usage();
    const packet = JSON.parse(fs6.readFileSync(path7.resolve(packetPath), "utf8"));
    const result = preparePacket(packet);
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    if (result.decision.decision === "deny") process.exitCode = 2;
    return;
  }
  if (command === "census") {
    const root = path7.resolve(argv[1] || process.cwd());
    const records = enumerateConsumers(root);
    const verification = verifyCensus(records, root);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, records, verification }, null, 2)}
`);
    if (!verification.ok) process.exitCode = 2;
    return;
  }
  if (command === "replay") {
    const runId = argv[1] ?? usage();
    const root = path7.resolve(argv[2] || process.cwd());
    const result = replayOffline(root, runId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    if (result.status === "REPLAY_UNAVAILABLE") process.exitCode = 2;
    return;
  }
  if (command === "incident") {
    const manifestPath = argv[1] ?? usage();
    const result = reconcileIncident(path7.resolve(manifestPath));
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    if (result.status === "REPLAY_UNAVAILABLE") process.exitCode = 2;
    return;
  }
  usage();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main2().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  });
}
export {
  preparePacket
};
