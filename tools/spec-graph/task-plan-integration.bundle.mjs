// tools/spec-graph/task-plan-integration.ts
import fs from "node:fs";
import path from "node:path";

// tools/spec-graph/task-contract.ts
var TASK_CONTRACT_VERSION = "task/v1";
var STATUS_SET = /* @__PURE__ */ new Set(["TODO", "READY", "IN_PROGRESS", "DONE", "BLOCKED"]);
var KIND_SET = /* @__PURE__ */ new Set(["implementation", "test", "documentation", "investigation", "migration", "other"]);
var SURFACE_KINDS = /* @__PURE__ */ new Set([
  "file",
  "glob",
  "symbol",
  "api-contract",
  "schema",
  "data",
  "config",
  "generated-artifact",
  "test-resource",
  "runtime-resource",
  "external-contract"
]);
var ACCESS_SET = /* @__PURE__ */ new Set(["read", "write", "exclusive"]);
var DEPENDENCY_RELATIONS = /* @__PURE__ */ new Set(["depends-on", "blocks", "consumes"]);
var DEPENDENCY_STRENGTH = /* @__PURE__ */ new Set(["hard", "soft"]);
var EVIDENCE_SCOPES = /* @__PURE__ */ new Set(["full-suite", "selected", "scenario", "manual", "none"]);
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function normalizeTaskKey(value) {
  return value.normalize("NFKC").trim();
}
function normalizedTaskId(value) {
  return normalizeTaskKey(value).toLocaleLowerCase("en-US");
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const obj = value;
    return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, stableValue(obj[key])]));
  }
  return value;
}
function stableTaskJson(task) {
  const normalize = (entry) => ({
    ...entry,
    dependencies: [...entry.dependencies].sort((a, b) => normalizedTaskId(a.targetId).localeCompare(normalizedTaskId(b.targetId)) || a.relation.localeCompare(b.relation)),
    sourceSpan: {
      ...entry.sourceSpan,
      sourceText: void 0,
      startLine: 0,
      endLine: 0
    }
  });
  return JSON.stringify(stableValue(Array.isArray(task) ? task.map(normalize) : normalize(task)), null, 0);
}
function sourceSpan(file, startLine, endLine, sourceText) {
  return { file, startLine, endLine, ...sourceText === void 0 ? {} : { sourceText } };
}
function diagnostic(code, message, taskId, field, location, severity = "error", relatedLocations) {
  return { code, severity, message, ...taskId ? { taskId } : {}, ...field ? { field } : {}, ...location ? { location } : {}, ...relatedLocations?.length ? { relatedLocations } : {} };
}
function normalizeLink(value, kind) {
  if (typeof value === "string") {
    const id2 = normalizeTaskKey(value);
    return id2 ? { id: id2, kind, source: value } : null;
  }
  if (!value || typeof value !== "object") return null;
  const input = value;
  const id = normalizeTaskKey(text(input.id ?? input.qualifiedId ?? input.ref));
  return id ? { id, kind, ...text(input.source) ? { source: text(input.source) } : {} } : null;
}
function normalizeCriteria(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/).filter(Boolean) : [];
  return raw.map((item, index) => {
    if (typeof item === "string") return { text: item.trim(), order: index + 1, required: true };
    const obj = item && typeof item === "object" ? item : {};
    return {
      text: text(obj.text ?? obj.criterion ?? obj.description),
      order: Number.isSafeInteger(obj.order) ? Number(obj.order) : index + 1,
      required: obj.required !== false
    };
  }).filter((item) => item.text).sort((a, b) => a.order - b.order || a.text.localeCompare(b.text)).map((item, index) => ({ ...item, order: index + 1 }));
}
function normalizeDependency(value) {
  if (!value || typeof value !== "object") return null;
  const obj = value;
  const targetId = normalizeTaskKey(text(obj.targetId ?? obj.target ?? obj.id));
  const relation = text(obj.relation || "depends-on");
  const strength = text(obj.strength || "hard");
  const reason = text(obj.reason);
  if (!targetId || !DEPENDENCY_RELATIONS.has(relation) || !DEPENDENCY_STRENGTH.has(strength) || !reason) return null;
  return { targetId, relation, strength, reason };
}
function normalizeSurface(value) {
  if (!value || typeof value !== "object") return null;
  const obj = value;
  const kind = text(obj.kind);
  const access = text(obj.access || obj.mode);
  const locator = normalizeTaskKey(text(obj.locator ?? obj.path ?? obj.resource));
  const scope = normalizeTaskKey(text(obj.scope || "repository"));
  const rationale = text(obj.rationale || obj.reason);
  if (!SURFACE_KINDS.has(kind) || !ACCESS_SET.has(access) || !locator || !scope || !rationale) return null;
  return { kind, access, locator, scope, rationale };
}
function normalizeArtifact(value) {
  if (typeof value === "string") {
    const normalized = normalizeTaskKey(value);
    const match = normalized.match(/^(.*?)\s+\(([^()]+)\)$/);
    const path3 = normalizeTaskKey(match?.[1] ?? normalized);
    return path3 ? { path: path3, ...match ? { kind: match[2].trim() } : {}, required: true } : null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value;
  const path2 = normalizeTaskKey(text(obj.path ?? obj.locator));
  return path2 ? { path: path2, ...text(obj.kind) ? { kind: text(obj.kind) } : {}, required: obj.required !== false } : null;
}
function normalizeEvidence(value) {
  const obj = value && typeof value === "object" ? value : {};
  const scope = text(obj.scope || obj.proofScope || "full-suite");
  const commands = Array.isArray(obj.commands) ? obj.commands.map(text).filter(Boolean) : typeof obj.command === "string" ? [obj.command.trim()] : [];
  return {
    scope: EVIDENCE_SCOPES.has(scope) ? scope : "full-suite",
    commands: [...new Set(commands)].sort(),
    requiresFresh: obj.requiresFresh !== false,
    allowFiltered: obj.allowFiltered === true
  };
}
function extractUnknown(input) {
  const known = /* @__PURE__ */ new Set([
    "representationVersion",
    "version",
    "qualifiedId",
    "id",
    "title",
    "kind",
    "definitionRevision",
    "revision",
    "declaredStatus",
    "status",
    "estimateMinutes",
    "estimate",
    "requirements",
    "requirementLinks",
    "refs",
    "acceptanceCriteria",
    "acceptanceCriteriaLinks",
    "acLinks",
    "doneWhen",
    "criteria",
    "dependencies",
    "surfaces",
    "artifacts",
    "evidencePolicy",
    "unknownFields",
    "comments",
    "comment",
    "sourceSpan",
    "source"
  ]);
  const out = { ...input.unknownFields && typeof input.unknownFields === "object" ? input.unknownFields : {} };
  for (const [key, value] of Object.entries(input)) if (!known.has(key)) out[key] = value;
  return out;
}
function canonicalizeTask(input, options = {}) {
  const rawId = text(input.qualifiedId ?? input.id);
  const id = normalizeTaskKey(rawId);
  const spanInput = input.sourceSpan && typeof input.sourceSpan === "object" ? input.sourceSpan : {};
  const span = sourceSpan(
    text(spanInput.file ?? options.file) || "<memory>",
    Number.isSafeInteger(spanInput.startLine) ? Number(spanInput.startLine) : 1,
    Number.isSafeInteger(spanInput.endLine) ? Number(spanInput.endLine) : Number.isSafeInteger(spanInput.startLine) ? Number(spanInput.startLine) : 1,
    text(spanInput.sourceText) || void 0
  );
  const kind = text(input.kind || "implementation");
  const status = text((input.declaredStatus ?? input.status) || "TODO").toUpperCase();
  const revision = Number(input.definitionRevision ?? input.revision ?? 1);
  const estimate = Number(input.estimateMinutes ?? input.estimate ?? 0);
  const requirementsRaw = input.requirementLinks ?? input.requirements ?? input.refs ?? [];
  const acRaw = input.acceptanceCriteriaLinks ?? input.acceptanceCriteria ?? input.acLinks ?? [];
  const requirementLinks = (Array.isArray(requirementsRaw) ? requirementsRaw : [requirementsRaw]).map((v) => normalizeLink(v, "requirement")).filter((v) => Boolean(v));
  const acceptanceCriteriaLinks = (Array.isArray(acRaw) ? acRaw : [acRaw]).map((v) => normalizeLink(v, "acceptance-criterion")).filter((v) => Boolean(v));
  const dependencies = (Array.isArray(input.dependencies) ? input.dependencies : []).map(normalizeDependency).filter((v) => Boolean(v)).sort((a, b) => a.targetId.localeCompare(b.targetId) || a.relation.localeCompare(b.relation) || a.reason.localeCompare(b.reason));
  const surfaces = (Array.isArray(input.surfaces) ? input.surfaces : []).map(normalizeSurface).filter((v) => Boolean(v)).sort((a, b) => a.kind.localeCompare(b.kind) || a.access.localeCompare(b.access) || a.locator.localeCompare(b.locator));
  const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).map(normalizeArtifact).filter((v) => Boolean(v)).sort((a, b) => a.path.localeCompare(b.path));
  const comments = [...new Set((Array.isArray(input.comments) ? input.comments : typeof input.comment === "string" ? [input.comment] : []).map(text).filter(Boolean))];
  const task = {
    representationVersion: TASK_CONTRACT_VERSION,
    qualifiedId: id,
    title: text(input.title),
    kind,
    definitionRevision: revision,
    declaredStatus: status,
    estimateMinutes: Math.round(estimate * 100) / 100,
    requirementLinks: requirementLinks.sort((a, b) => a.id.localeCompare(b.id)),
    acceptanceCriteriaLinks: acceptanceCriteriaLinks.sort((a, b) => a.id.localeCompare(b.id)),
    doneWhen: normalizeCriteria(input.doneWhen ?? input.criteria),
    dependencies,
    surfaces,
    artifacts,
    evidencePolicy: normalizeEvidence(input.evidencePolicy),
    unknownFields: extractUnknown(input),
    comments,
    sourceSpan: span
  };
  const findings = [];
  if (!task.qualifiedId) findings.push(diagnostic("TASK_MISSING_FIELD", "qualifiedId is required", void 0, "qualifiedId", span));
  if (!task.title) findings.push(diagnostic("TASK_MISSING_FIELD", "title is required", task.qualifiedId, "title", span));
  if (!KIND_SET.has(task.kind)) findings.push(diagnostic("TASK_INVALID_FIELD", `unsupported kind: ${task.kind}`, task.qualifiedId, "kind", span));
  if (!STATUS_SET.has(task.declaredStatus)) findings.push(diagnostic("TASK_INVALID_FIELD", `unsupported declaredStatus: ${task.declaredStatus}`, task.qualifiedId, "declaredStatus", span));
  if (!Number.isFinite(task.definitionRevision) || task.definitionRevision < 1 || !Number.isInteger(task.definitionRevision)) findings.push(diagnostic("TASK_INVALID_FIELD", "definitionRevision must be a positive integer", task.qualifiedId, "definitionRevision", span));
  if (!Number.isFinite(task.estimateMinutes) || task.estimateMinutes < 0) findings.push(diagnostic("TASK_INVALID_FIELD", "estimateMinutes must be a non-negative number", task.qualifiedId, "estimateMinutes", span));
  if (task.doneWhen.length === 0) findings.push(diagnostic("TASK_MISSING_FIELD", "doneWhen must contain at least one measurable criterion", task.qualifiedId, "doneWhen", span));
  if (task.surfaces.length === 0) findings.push(diagnostic("TASK_MISSING_FIELD", "surfaces must contain at least one typed claim", task.qualifiedId, "surfaces", span));
  if (task.artifacts.length === 0) findings.push(diagnostic("TASK_MISSING_FIELD", "artifacts must contain at least one declared artifact", task.qualifiedId, "artifacts", span));
  if (!input.evidencePolicy) findings.push(diagnostic("TASK_MISSING_FIELD", "evidencePolicy is required", task.qualifiedId, "evidencePolicy", span));
  for (const dep of dependencies) if (dep.targetId === task.qualifiedId) findings.push(diagnostic("TASK_INVALID_FIELD", "self dependency is not allowed", task.qualifiedId, "dependencies", span));
  if (options.knownRequirements) {
    for (const link of task.requirementLinks) if (!hasNormalized(options.knownRequirements, link.id)) findings.push(diagnostic("TASK_UNRESOLVED_REQUIREMENT", `unresolved requirement link: ${link.id}`, task.qualifiedId, "requirementLinks", span));
  }
  if (options.knownAcceptanceCriteria) {
    for (const link of task.acceptanceCriteriaLinks) if (!hasNormalized(options.knownAcceptanceCriteria, link.id)) findings.push(diagnostic("TASK_UNRESOLVED_ACCEPTANCE_CRITERION", `unresolved acceptance criterion link: ${link.id}`, task.qualifiedId, "acceptanceCriteriaLinks", span));
  }
  return { task, findings };
}
function hasNormalized(values, value) {
  const target = normalizedTaskId(value);
  for (const candidate of values) if (normalizedTaskId(candidate) === target) return true;
  return false;
}

// tools/spec-graph/task-plan-integration.ts
var TASK_PLAN_VERSION = "task-plan/v1";
function compareText(left, right) {
  return left.localeCompare(right, "en-US");
}
function sortIds(values) {
  return [...new Set(values)].sort(compareText);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function stableValue2(value) {
  if (Array.isArray(value)) return value.map(stableValue2);
  if (value && typeof value === "object") {
    const object = value;
    return Object.fromEntries(Object.keys(object).sort(compareText).map((key) => [key, stableValue2(object[key])]));
  }
  return value;
}
function stableJson(value) {
  return JSON.stringify(stableValue2(value));
}
function diagnosticKey(value) {
  return stableJson(value);
}
function mergeDiagnostics(...groups) {
  const merged = /* @__PURE__ */ new Map();
  for (const item of groups.flat()) merged.set(diagnosticKey(item), item);
  return [...merged.values()].sort(
    (left, right) => compareText(left.code, right.code) || compareText(left.message, right.message) || compareText(left.taskIds.join("\0"), right.taskIds.join("\0"))
  );
}
function sourceIdForLegacy(record) {
  return record.candidateId ?? `legacy:${record.sourceSpan.file}:${record.sourceSpan.startLine}`;
}
function redactText(value) {
  return value.replace(/(process\.env\.)[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\s,;&]+/gi, "$1<redacted>=<redacted>").replace(/\b(token|secret|password|passwd|api[_-]?key|authorization)\s*[:=]\s*[^\s,;&]+/gi, "$1=<redacted>").replace(/([?&](?:token|secret|password|key|api[_-]?key|authorization)=)[^&\s]+/gi, "$1<redacted>").replace(/(^|[\s,;])(?:[A-Z_][A-Z0-9_]*)=(?:[^\s,;]+)/g, "$1<environment>=<redacted>");
}
function redactPlanText(value) {
  return redactText(value);
}
function redactUnknown(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item)]));
  }
  return value;
}
function redactTask(task) {
  return {
    ...clone(task),
    title: redactText(task.title),
    doneWhen: task.doneWhen.map((item) => ({ ...item, text: redactText(item.text) })),
    dependencies: task.dependencies.map((dependency) => ({ ...dependency, reason: redactText(dependency.reason) })),
    surfaces: task.surfaces.map((surface) => ({
      ...surface,
      locator: redactText(surface.locator),
      rationale: redactText(surface.rationale)
    })),
    unknownFields: redactUnknown(task.unknownFields),
    comments: task.comments.map(redactText)
  };
}
function finding(code, message, taskIds = [], sourceIds = [], action = "Inspect the canonical task record and retry.", location, severity = "error") {
  return {
    code,
    severity,
    message: redactText(message),
    taskIds: sortIds(taskIds),
    sourceIds: sortIds(sourceIds),
    action: redactText(action),
    ...location ? { location } : {}
  };
}
function normalizeEvidence2(records) {
  return [...records].map((record) => ({
    taskId: record.taskId,
    sourceId: record.sourceId,
    state: record.state,
    reason: record.reason,
    ...record.fingerprint ? { fingerprint: record.fingerprint } : {}
  })).sort((left, right) => compareText(left.taskId, right.taskId) || compareText(left.sourceId, right.sourceId));
}
function normalizeConflict(record) {
  const [leftTaskId, rightTaskId] = compareText(record.leftTaskId, record.rightTaskId) <= 0 ? [record.leftTaskId, record.rightTaskId] : [record.rightTaskId, record.leftTaskId];
  return {
    leftTaskId,
    rightTaskId,
    class: record.class,
    reason: record.reason,
    sourceIds: sortIds(record.sourceIds)
  };
}
function conflictKey(record) {
  return `${normalizedTaskId(record.leftTaskId)}|${normalizedTaskId(record.rightTaskId)}|${record.class}`;
}
function surfaceConflict(left, right) {
  if (normalizedTaskId(left.locator) !== normalizedTaskId(right.locator)) return null;
  if (left.kind === "api-contract" || left.kind === "schema" || right.kind === "api-contract" || right.kind === "schema") return "semantic-resource";
  if (left.access === "exclusive" || right.access === "exclusive") return "exclusive-overlap";
  if (left.access === "write" && right.access === "write") return "write-write";
  if (left.access === "write" || right.access === "write") return "read-write";
  return null;
}
function deriveTaskConflicts(tasks) {
  const records = [];
  const ordered = [...tasks].sort((left, right) => compareText(left.qualifiedId, right.qualifiedId));
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      for (const leftSurface of left.surfaces) {
        for (const rightSurface of right.surfaces) {
          const conflictClass = surfaceConflict(leftSurface, rightSurface);
          if (!conflictClass) continue;
          records.push(normalizeConflict({
            leftTaskId: left.qualifiedId,
            rightTaskId: right.qualifiedId,
            class: conflictClass,
            reason: `surface overlap on ${leftSurface.kind} locator`,
            sourceIds: [left.qualifiedId, right.qualifiedId]
          }));
        }
      }
    }
  }
  const unique = /* @__PURE__ */ new Map();
  for (const record of records) unique.set(conflictKey(record), record);
  return [...unique.values()].sort((left, right) => compareText(conflictKey(left), conflictKey(right)));
}
function validateDependencies(tasks) {
  const ids = /* @__PURE__ */ new Map();
  const diagnostics = [];
  for (const task of tasks) {
    const key = normalizedTaskId(task.qualifiedId);
    const prior = ids.get(key);
    if (prior) diagnostics.push(finding(
      "PLAN_DUPLICATE_TASK_ID",
      `duplicate canonical task ID after normalization: ${task.qualifiedId}`,
      [task.qualifiedId, prior.qualifiedId],
      [task.qualifiedId, prior.qualifiedId],
      "Keep one canonical record for the normalized task ID.",
      task.sourceSpan
    ));
    else ids.set(key, task);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(normalizedTaskId(dependency.targetId))) diagnostics.push(finding(
        "PLAN_UNRESOLVED_DEPENDENCY",
        `task ${task.qualifiedId} depends on unresolved task ${dependency.targetId}: ${dependency.reason}`,
        [task.qualifiedId, dependency.targetId],
        [task.qualifiedId, dependency.targetId],
        `Add ${dependency.targetId} as a canonical task or remove the dependency.`,
        task.sourceSpan
      ));
    }
  }
  const adjacency = /* @__PURE__ */ new Map();
  for (const task of tasks) adjacency.set(normalizedTaskId(task.qualifiedId), task.dependencies.map((dependency) => normalizedTaskId(dependency.targetId)));
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const path2 = [];
  const cycleKeys = /* @__PURE__ */ new Set();
  function visit(key) {
    if (visiting.has(key)) {
      const start = path2.indexOf(key);
      const cycle = path2.slice(start).concat(key);
      const cycleKey = cycle.join("|");
      if (!cycleKeys.has(cycleKey)) {
        cycleKeys.add(cycleKey);
        diagnostics.push(finding(
          "PLAN_DEPENDENCY_CYCLE",
          `dependency cycle: ${cycle.join(" -> ")}`,
          cycle,
          cycle,
          "Break the typed dependency cycle before scheduling."
        ));
      }
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    path2.push(key);
    for (const target of adjacency.get(key) ?? []) if (adjacency.has(target)) visit(target);
    path2.pop();
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of adjacency.keys()) visit(key);
  return diagnostics;
}
function normalizeTasks(tasks) {
  const normalized = [];
  const diagnostics = [];
  for (const task of tasks) {
    const result = canonicalizeTask(task, { file: task.sourceSpan.file });
    const errors = result.findings.filter((item) => item.severity === "error");
    if (errors.length > 0) diagnostics.push(...errors.map((item) => finding(
      "PLAN_INVALID_TASK",
      item.message,
      item.taskId ? [item.taskId] : [task.qualifiedId],
      [task.qualifiedId],
      `Correct the canonical task field ${item.field ?? "record"} before planning.`,
      item.location
    )));
    normalized.push(result.task);
  }
  return { tasks: normalized.sort((left, right) => compareText(left.qualifiedId, right.qualifiedId)), diagnostics };
}
function buildTaskPlanState(tasks, options = {}) {
  const normalized = normalizeTasks(tasks);
  const evidence = normalizeEvidence2(options.evidence ?? []);
  const diagnostics = mergeDiagnostics(
    normalized.diagnostics,
    validateDependencies(normalized.tasks),
    validateEvidence(normalized.tasks, evidence)
  );
  const supplied = (options.conflicts ?? []).map(normalizeConflict);
  const conflicts = /* @__PURE__ */ new Map();
  for (const record of [...deriveTaskConflicts(normalized.tasks), ...supplied]) conflicts.set(conflictKey(record), record);
  const state = {
    version: TASK_PLAN_VERSION,
    revision: options.revision ?? 1,
    tasks: normalized.tasks,
    evidence,
    conflicts: [...conflicts.values()].sort((left, right) => compareText(conflictKey(left), conflictKey(right))),
    legacy: clone([...options.legacy ?? []]),
    diagnostics,
    ...options.sourceFingerprint ? { sourceFingerprint: options.sourceFingerprint } : {}
  };
  return state;
}
function incrementalTaskPlanState(previous, changedTasks, options = {}) {
  const changedById = new Map(changedTasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const merged = previous.tasks.map((task) => changedById.get(normalizedTaskId(task.qualifiedId)) ?? task);
  for (const task of changedTasks) if (!previous.tasks.some((item) => normalizedTaskId(item.qualifiedId) === normalizedTaskId(task.qualifiedId))) merged.push(task);
  return buildTaskPlanState(merged, {
    revision: options.revision ?? previous.revision,
    evidence: options.evidence ?? previous.evidence,
    conflicts: options.conflicts ?? previous.conflicts,
    legacy: options.legacy ?? previous.legacy,
    sourceFingerprint: options.sourceFingerprint ?? previous.sourceFingerprint
  });
}
function serializeTaskPlanState(state) {
  return stableJson(state);
}
var canonicalTaskPlanJson = serializeTaskPlanState;
function restoreTaskPlanState(serialized) {
  const parsed = JSON.parse(serialized);
  if (parsed.version !== TASK_PLAN_VERSION || !Number.isSafeInteger(parsed.revision) || !Array.isArray(parsed.tasks)) {
    throw new Error("invalid task plan state version or shape");
  }
  return buildTaskPlanState(parsed.tasks, {
    revision: parsed.revision,
    evidence: parsed.evidence ?? [],
    conflicts: parsed.conflicts ?? [],
    legacy: parsed.legacy ?? [],
    sourceFingerprint: parsed.sourceFingerprint
  });
}
function persistTaskPlanState(adapter, state) {
  const serialized = serializeTaskPlanState(state);
  adapter.write(serialized, state);
  return serialized;
}
function compareAndSwapTaskPlanState(adapter, expectedRevision, state) {
  if (!adapter.compareAndSwap) throw new Error("plan persistence adapter does not support atomic compare-and-swap");
  return adapter.compareAndSwap(expectedRevision, serializeTaskPlanState(state), state);
}
function restorePersistedTaskPlanState(adapter) {
  const serialized = adapter.read();
  return serialized ? restoreTaskPlanState(serialized) : null;
}
var CAS_LOCK_RETRY_MS = 25;
var CAS_LOCK_TIMEOUT_MS = 15e3;
var CAS_STALE_LOCK_MS = 6e4;
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function atomicReplace(file, content) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, content, "utf8");
    fs.renameSync(temp, file);
  } finally {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
    }
  }
}
function createFileCasAdapter(planFile) {
  const lockFile = `${planFile}.lock`;
  const acquireLock = () => {
    const deadline = Date.now() + CAS_LOCK_TIMEOUT_MS;
    for (; ; ) {
      try {
        const fd = fs.openSync(lockFile, "wx");
        try {
          fs.writeSync(fd, String(process.pid));
        } finally {
          fs.closeSync(fd);
        }
        return;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let stale = false;
        try {
          stale = Date.now() - fs.statSync(lockFile).mtimeMs > CAS_STALE_LOCK_MS;
        } catch {
          continue;
        }
        if (stale) {
          try {
            fs.unlinkSync(lockFile);
          } catch {
          }
          continue;
        }
        if (Date.now() > deadline) throw new Error(`timed out acquiring task plan lock ${lockFile}`);
        sleepMs(CAS_LOCK_RETRY_MS);
      }
    }
  };
  const releaseLock = () => {
    try {
      fs.unlinkSync(lockFile);
    } catch {
    }
  };
  return {
    read() {
      try {
        return fs.readFileSync(planFile, "utf8");
      } catch {
        return void 0;
      }
    },
    write(serialized) {
      fs.mkdirSync(path.dirname(planFile), { recursive: true });
      atomicReplace(planFile, serialized);
    },
    compareAndSwap(expectedRevision, serialized) {
      acquireLock();
      try {
        let current;
        try {
          current = fs.readFileSync(planFile, "utf8");
        } catch {
          return false;
        }
        const parsed = JSON.parse(current);
        if (parsed.revision !== expectedRevision) return false;
        atomicReplace(planFile, serialized);
        return true;
      } finally {
        releaseLock();
      }
    }
  };
}
function taskById(state) {
  return new Map(state.tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
}
function conflictForSelected(state, selected) {
  return state.conflicts.filter((record) => selected.has(normalizedTaskId(record.leftTaskId)) && selected.has(normalizedTaskId(record.rightTaskId))).map((record) => ({
    ...record,
    reason: redactText(record.reason),
    sourceIds: sortIds(record.sourceIds)
  }));
}
function rolloutReport(records, mode) {
  const reportRecords = records.map((record) => {
    const sourceId = sourceIdForLegacy(record);
    if (mode === "enforce") {
      return {
        sourceId,
        ...record.candidateId ? { candidateId: record.candidateId } : {},
        status: "rejected",
        finding: finding(
          "PLAN_LEGACY_UNRESOLVED",
          `legacy task ${sourceId} is unresolved and cannot enter enforce mode`,
          record.candidateId ? [record.candidateId] : [],
          [sourceId],
          "Canonicalize this source record, then retry enforce mode.",
          record.sourceSpan,
          "error"
        )
      };
    }
    return {
      sourceId,
      ...record.candidateId ? { candidateId: record.candidateId } : {},
      status: "visible",
      ...mode === "warn" ? {
        finding: finding(
          "PLAN_LEGACY_RECORD",
          `legacy task ${sourceId} remains visible and needs canonicalization`,
          record.candidateId ? [record.candidateId] : [],
          [sourceId],
          "Canonicalize the record before enabling enforce mode.",
          record.sourceSpan,
          "warning"
        )
      } : {}
    };
  });
  return {
    mode,
    sourceCount: records.length,
    visibleCount: reportRecords.length,
    rejectedCount: reportRecords.filter((record) => record.status === "rejected").length,
    records: reportRecords
  };
}
function addDependencyEdges(state, selected) {
  const edges = [];
  for (const task of state.tasks) {
    if (!selected.has(normalizedTaskId(task.qualifiedId))) continue;
    for (const dependency of task.dependencies) {
      if (!selected.has(normalizedTaskId(dependency.targetId))) continue;
      edges.push({
        from: task.qualifiedId,
        to: dependency.targetId,
        type: "depends-on",
        reason: redactText(dependency.reason),
        sourceIds: sortIds([task.qualifiedId, dependency.targetId])
      });
    }
  }
  return edges;
}
function addConflictEdges(conflicts) {
  return conflicts.map((conflict) => ({
    from: conflict.leftTaskId,
    to: conflict.rightTaskId,
    type: "conflicts-with",
    reason: redactText(conflict.reason),
    sourceIds: sortIds(conflict.sourceIds)
  }));
}
function directDependents(tasks, selected, roots) {
  return sortIds(tasks.filter((task) => selected.has(normalizedTaskId(task.qualifiedId)) && !roots.has(normalizedTaskId(task.qualifiedId))).filter((task) => task.dependencies.some((dependency) => roots.has(normalizedTaskId(dependency.targetId)))).map((task) => task.qualifiedId));
}
function transitiveDependents(tasks, selected, roots) {
  const seen = /* @__PURE__ */ new Set();
  let frontier = [...roots];
  while (frontier.length > 0) {
    const next = directDependents(tasks, selected, new Set(frontier));
    frontier = next.filter((id) => !seen.has(normalizedTaskId(id)));
    for (const id of frontier) seen.add(normalizedTaskId(id));
  }
  return sortIds([...seen].map((key) => tasks.find((task) => normalizedTaskId(task.qualifiedId) === key)?.qualifiedId ?? key));
}
function schedule(tasks, selected, conflicts, evidence, invalidIds) {
  const byId = new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const remaining = /* @__PURE__ */ new Set([...selected]);
  const completed = /* @__PURE__ */ new Set();
  const waves = [];
  const unscheduled = [];
  for (const key of [...remaining].sort(compareText)) {
    if (!invalidIds.has(key)) continue;
    remaining.delete(key);
    const task = byId.get(key);
    if (!task) continue;
    unscheduled.push({
      taskId: task.qualifiedId,
      reason: "task failed canonical validation and cannot be scheduled",
      predecessorIds: [],
      sourceIds: [task.qualifiedId]
    });
  }
  const maxIterations = selected.size + 1;
  for (let iteration = 0; remaining.size > 0 && iteration < maxIterations; iteration += 1) {
    const available = [...remaining].map((key) => byId.get(key)).filter((task) => Boolean(task)).filter((task) => task.dependencies.every((dependency) => !selected.has(normalizedTaskId(dependency.targetId)) || completed.has(normalizedTaskId(dependency.targetId)))).sort((left, right) => compareText(left.qualifiedId, right.qualifiedId));
    if (available.length === 0) break;
    const wave = available.map((task) => task.qualifiedId);
    waves.push(wave);
    for (const task of available) {
      remaining.delete(normalizedTaskId(task.qualifiedId));
      completed.add(normalizedTaskId(task.qualifiedId));
    }
  }
  if (remaining.size > 0) {
    for (const key of [...remaining].sort(compareText)) {
      const task = byId.get(key);
      if (!task) continue;
      const predecessors = task.dependencies.map((dependency) => dependency.targetId).filter((id) => selected.has(normalizedTaskId(id)));
      unscheduled.push({
        taskId: task.qualifiedId,
        reason: "task remains unscheduled because its typed predecessors are unresolved, cyclic, or outside the selected graph",
        predecessorIds: sortIds(predecessors),
        sourceIds: sortIds([task.qualifiedId, ...predecessors])
      });
    }
  }
  const conflictPairs = new Set(conflicts.flatMap((conflict) => [
    `${normalizedTaskId(conflict.leftTaskId)}|${normalizedTaskId(conflict.rightTaskId)}`,
    `${normalizedTaskId(conflict.rightTaskId)}|${normalizedTaskId(conflict.leftTaskId)}`
  ]));
  const batches = waves.map((wave) => {
    const result = [];
    for (const taskId of wave) {
      let placed = false;
      for (const batch of result) {
        if (!batch.some((other) => conflictPairs.has(`${normalizedTaskId(taskId)}|${normalizedTaskId(other)}`))) {
          batch.push(taskId);
          placed = true;
          break;
        }
      }
      if (!placed) result.push([taskId]);
    }
    return result;
  });
  const frontier = [...selected].map((key) => byId.get(key)).filter((task) => Boolean(task)).sort((left, right) => compareText(left.qualifiedId, right.qualifiedId)).map((task) => {
    const invalid = invalidIds.has(normalizedTaskId(task.qualifiedId));
    const predecessors = task.dependencies.map((dependency) => dependency.targetId).filter((id) => selected.has(normalizedTaskId(id)) && byId.has(normalizedTaskId(id)) && byId.get(normalizedTaskId(id))?.declaredStatus !== "DONE");
    const stale = evidence.some((record) => normalizedTaskId(record.taskId) === normalizedTaskId(task.qualifiedId) && record.state !== "present");
    const blocked = task.declaredStatus === "BLOCKED" || predecessors.length > 0;
    return {
      taskId: task.qualifiedId,
      readiness: invalid ? "blocked" : stale ? "stale" : blocked ? "blocked" : "ready",
      predecessors: sortIds(predecessors),
      explanation: invalid ? "task failed canonical validation and cannot be scheduled or completed" : stale ? "task evidence is stale or missing and must be refreshed before execution verification" : blocked ? `blocked by typed predecessors: ${predecessors.join(", ") || task.declaredStatus}` : "no incomplete typed predecessor in the selected graph"
    };
  });
  return { waves, batches, frontier, unscheduled };
}
function criticalMetrics(tasks, selected) {
  const byId = new Map(tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const memo = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  function longest(key) {
    const cached = memo.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return { path: [], duration: 0 };
    visiting.add(key);
    const task = byId.get(key);
    if (!task) return { path: [], duration: 0 };
    let best = { path: [], duration: 0 };
    for (const dependency of task.dependencies) {
      const dependencyKey = normalizedTaskId(dependency.targetId);
      if (!selected.has(dependencyKey)) continue;
      const candidate = longest(dependencyKey);
      if (candidate.duration > best.duration || candidate.duration === best.duration && candidate.path.join("|") < best.path.join("|")) best = candidate;
    }
    const result = { path: [...best.path, task.qualifiedId], duration: Math.round((best.duration + task.estimateMinutes) * 100) / 100 };
    visiting.delete(key);
    memo.set(key, result);
    return result;
  }
  let critical = { path: [], duration: 0 };
  for (const key of selected) {
    const candidate = longest(key);
    if (candidate.duration > critical.duration || candidate.duration === critical.duration && candidate.path.join("|") < critical.path.join("|")) critical = candidate;
  }
  const slack = {};
  for (const task of tasks) if (selected.has(normalizedTaskId(task.qualifiedId))) {
    const duration = longest(normalizedTaskId(task.qualifiedId)).duration;
    slack[task.qualifiedId] = Math.max(0, Math.round((critical.duration - duration) * 100) / 100);
  }
  return { criticalPath: { taskIds: critical.path, totalMinutes: critical.duration }, slack: Object.fromEntries(Object.entries(slack).sort(([left], [right]) => compareText(left, right))) };
}
function queryTaskPlan(state, options = {}) {
  const byId = taskById(state);
  const requested = options.selectedTaskIds ? options.selectedTaskIds.map(normalizedTaskId) : state.tasks.map((task) => normalizedTaskId(task.qualifiedId));
  const selected = /* @__PURE__ */ new Set();
  const queryDiagnostics = [];
  for (const key of requested) {
    const task = byId.get(key);
    if (task) selected.add(key);
    else queryDiagnostics.push(finding("PLAN_UNKNOWN_TASK", `selected task ${key} does not exist`, [key], [key], "Select an existing canonical task ID."));
  }
  const selectedTasks = state.tasks.filter((task) => selected.has(normalizedTaskId(task.qualifiedId)));
  const conflicts = conflictForSelected(state, selected);
  const graphEdges = [...addDependencyEdges(state, selected), ...addConflictEdges(conflicts)];
  for (const task of selectedTasks) {
    for (const evidence of state.evidence.filter((record) => normalizedTaskId(record.taskId) === normalizedTaskId(task.qualifiedId))) {
      graphEdges.push({ from: task.qualifiedId, to: evidence.sourceId, type: "evidence", reason: redactText(evidence.reason), sourceIds: [evidence.sourceId, task.qualifiedId] });
    }
  }
  graphEdges.sort((left, right) => compareText(`${left.type}|${left.from}|${left.to}`, `${right.type}|${right.from}|${right.to}`));
  const graph = {
    nodes: selectedTasks.map((task) => ({ id: task.qualifiedId, type: "Task", status: task.declaredStatus, sourceId: task.qualifiedId, task: redactTask(task) })),
    edges: graphEdges
  };
  const impactRoots = new Set(selectedTasks.map((task) => normalizedTaskId(task.qualifiedId)));
  const direct = directDependents(state.tasks, new Set(state.tasks.map((task) => normalizedTaskId(task.qualifiedId))), impactRoots);
  const transitive = transitiveDependents(state.tasks, new Set(state.tasks.map((task) => normalizedTaskId(task.qualifiedId))), impactRoots).filter((id) => !direct.includes(id));
  const impactExplanations = direct.concat(transitive).map((taskId) => ({
    code: "TRANSITIVE_IMPACT",
    sourceTaskIds: [taskId, ...selectedTasks.map((task) => task.qualifiedId)],
    sourceIds: [taskId],
    message: `${taskId} consumes or depends on selected planning work`,
    action: "Review the downstream task before changing the selected task."
  }));
  const selectedEvidence = state.evidence.filter((record) => selected.has(normalizedTaskId(record.taskId)));
  const invalidIds = /* @__PURE__ */ new Set();
  for (const diagnostic2 of state.diagnostics ?? []) {
    if (diagnostic2.code === "PLAN_INVALID_TASK") {
      for (const taskId of diagnostic2.taskIds) invalidIds.add(normalizedTaskId(taskId));
    }
  }
  for (const diagnostic2 of normalizeTasks(selectedTasks).diagnostics) {
    for (const taskId of diagnostic2.taskIds) invalidIds.add(normalizedTaskId(taskId));
  }
  const scheduleResult = schedule(selectedTasks, selected, conflicts, selectedEvidence, invalidIds);
  queryDiagnostics.push(...validateDependencies(selectedTasks).filter((item) => item.severity === "error"));
  queryDiagnostics.push(...validateEvidence(selectedTasks, selectedEvidence));
  queryDiagnostics.push(...scheduleResult.unscheduled.map((entry) => finding("PLAN_SELECTED_UNSCHEDULED", entry.reason, [entry.taskId, ...entry.predecessorIds], entry.sourceIds, "Resolve the typed predecessor or include it in the selected graph.")));
  const stale = selectedEvidence.filter((record) => record.state !== "present").map((record) => ({ ...record, reason: redactText(record.reason) }));
  queryDiagnostics.push(...stale.map((record) => finding("PLAN_STALE_EVIDENCE", `evidence ${record.sourceId} for ${record.taskId} is ${record.state}`, [record.taskId], [record.sourceId], "Refresh or replace the evidence before treating the plan as complete.")));
  const staleReasons = stale.map((record) => ({ taskId: record.taskId, sourceId: record.sourceId, reason: record.reason }));
  const { criticalPath, slack } = criticalMetrics(selectedTasks, selected);
  const rollout = rolloutReport(state.legacy, options.rolloutMode ?? "observe");
  const rolloutFindings = rollout.records.flatMap((record) => record.finding ? [record.finding] : []);
  queryDiagnostics.push(...rolloutFindings);
  const diagnostics = mergeDiagnostics(state.diagnostics ?? [], queryDiagnostics);
  const explanations = [
    ...impactExplanations,
    ...conflicts.map((conflict) => ({
      code: conflict.class.toUpperCase(),
      sourceTaskIds: [conflict.leftTaskId, conflict.rightTaskId],
      sourceIds: conflict.sourceIds,
      message: `tasks ${conflict.leftTaskId} and ${conflict.rightTaskId} conflict because ${redactText(conflict.reason)}`,
      action: "Separate the tasks into different batches or add an audited resolution."
    })),
    ...stale.map((record) => ({
      code: "STALE_EVIDENCE",
      sourceTaskIds: [record.taskId],
      sourceIds: [record.sourceId],
      message: `evidence ${record.sourceId} for ${record.taskId} is ${record.state}: ${redactText(record.reason)}`,
      action: "Refresh or replace the evidence before treating the task as execution verified."
    })),
    ...scheduleResult.unscheduled.map((entry) => ({
      code: "UNSCHEDULED",
      sourceTaskIds: [entry.taskId, ...entry.predecessorIds],
      sourceIds: entry.sourceIds,
      message: redactText(entry.reason),
      action: "Resolve the predecessor chain and rerun the plan query."
    }))
  ];
  const risks = [
    ...rollout.records.filter((record) => record.status === "visible").map((record) => ({ code: "MIGRATION_DEBT", taskIds: record.candidateId ? [record.candidateId] : [], sourceIds: [record.sourceId], severity: "warning", explanation: `legacy source ${record.sourceId} remains queryable but is not canonical`, action: "Canonicalize the legacy record before enforce mode." })),
    ...conflicts.map((conflict) => ({ code: "CONFLICT", taskIds: [conflict.leftTaskId, conflict.rightTaskId], sourceIds: conflict.sourceIds, severity: "error", explanation: redactText(conflict.reason), action: "Separate conflicting tasks into different batches." })),
    ...impactExplanations.length > 2 ? [{ code: "BROAD_IMPACT", taskIds: [...direct, ...transitive], sourceIds: [...direct, ...transitive], severity: "warning", explanation: "selected work has broad downstream impact", action: "Review all direct and transitive dependents before applying a patch." }] : [],
    ...criticalPath.taskIds.length > 0 ? [{ code: "CRITICAL_WORK", taskIds: criticalPath.taskIds, sourceIds: criticalPath.taskIds, severity: "info", explanation: `critical path totals ${criticalPath.totalMinutes} minutes`, action: "Prioritize the critical path and monitor predecessor readiness." }] : [],
    ...stale.map((record) => ({ code: "STALE_EVIDENCE", taskIds: [record.taskId], sourceIds: [record.sourceId], severity: "error", explanation: redactText(record.reason), action: "Refresh evidence before execution verification." })),
    ...scheduleResult.unscheduled.map((entry) => ({ code: "UNSCHEDULED", taskIds: [entry.taskId], sourceIds: entry.sourceIds, severity: "error", explanation: redactText(entry.reason), action: "Resolve typed predecessors or expand selection." }))
  ];
  return {
    version: TASK_PLAN_VERSION,
    revision: state.revision,
    selectedTaskIds: selectedTasks.map((task) => task.qualifiedId),
    graph,
    impact: { direct, transitive, explanations: impactExplanations },
    conflicts,
    waves: scheduleResult.waves,
    batches: scheduleResult.batches,
    frontier: scheduleResult.frontier,
    unscheduledRemainder: scheduleResult.unscheduled,
    unscheduled: scheduleResult.unscheduled,
    complete: scheduleResult.unscheduled.length === 0 && stale.length === 0 && diagnostics.every((item) => item.severity !== "error"),
    criticalPath,
    slack,
    stale,
    staleReasons,
    diagnostics,
    explanations,
    reports: { risks, rollout }
  };
}
var executionPlanQuery = queryTaskPlan;
var queryExecutionPlan = queryTaskPlan;
function validateEvidence(tasks, evidence) {
  const ids = new Set(tasks.map((task) => normalizedTaskId(task.qualifiedId)));
  return evidence.filter((record) => !ids.has(normalizedTaskId(record.taskId))).map((record) => finding(
    "PLAN_UNRESOLVED_EVIDENCE",
    `evidence ${record.sourceId} refers to unresolved task ${record.taskId}`,
    [record.taskId],
    [record.sourceId],
    "Attach evidence to an existing canonical task."
  ));
}
function validateTaskPlanPatch(state, patch) {
  const findings = [];
  const current = new Map(state.tasks.map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const additions = patch.add ?? [];
  const replacements = patch.replace ?? [];
  const seenPatch = /* @__PURE__ */ new Set();
  for (const task of [...additions, ...replacements]) {
    const key = normalizedTaskId(task.qualifiedId);
    if (seenPatch.has(key)) findings.push(finding("PLAN_DUPLICATE_TASK_ID", `patch contains duplicate task ID ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], "Keep one add or replace operation per canonical task ID.", task.sourceSpan));
    seenPatch.add(key);
  }
  for (const task of additions) if (current.has(normalizedTaskId(task.qualifiedId))) findings.push(finding("PLAN_DUPLICATE_TASK_ID", `patch add duplicates existing task ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], "Use replace for an existing canonical task.", task.sourceSpan));
  for (const task of replacements) if (!current.has(normalizedTaskId(task.qualifiedId))) findings.push(finding("PLAN_UNKNOWN_TASK", `patch replace targets unknown task ${task.qualifiedId}`, [task.qualifiedId], [task.qualifiedId], "Use add for a new canonical task.", task.sourceSpan));
  const remove = new Set((patch.removeIds ?? []).map(normalizedTaskId));
  const nextTasks = state.tasks.filter((task) => !remove.has(normalizedTaskId(task.qualifiedId))).map((task) => {
    const replacement = replacements.find((candidate) => normalizedTaskId(candidate.qualifiedId) === normalizedTaskId(task.qualifiedId));
    return replacement ?? task;
  });
  nextTasks.push(...additions);
  const normalized = normalizeTasks(nextTasks);
  findings.push(...normalized.diagnostics);
  findings.push(...validateDependencies(normalized.tasks));
  findings.push(...validateEvidence(normalized.tasks, patch.evidence ?? state.evidence));
  return findings;
}
function applyTaskPlanPatch(state, patch, options) {
  const dryRun = options.dryRun === true;
  const before = clone(state);
  const casFinding = state.revision !== options.expectedRevision ? finding("PLAN_STALE_REVISION", `expected revision ${options.expectedRevision}, found ${state.revision}`, [], [], "Reload the canonical plan and retry with its current revision.") : null;
  const findings = casFinding ? [casFinding] : validateTaskPlanPatch(state, patch);
  if (findings.some((item) => item.severity === "error")) {
    return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings };
  }
  const remove = new Set((patch.removeIds ?? []).map(normalizedTaskId));
  const replacements = new Map((patch.replace ?? []).map((task) => [normalizedTaskId(task.qualifiedId), task]));
  const nextTasks = state.tasks.filter((task) => !remove.has(normalizedTaskId(task.qualifiedId))).map((task) => replacements.get(normalizedTaskId(task.qualifiedId)) ?? task);
  nextTasks.push(...patch.add ?? []);
  const nextState = buildTaskPlanState(nextTasks, {
    revision: state.revision + 1,
    evidence: patch.evidence ?? state.evidence,
    conflicts: state.conflicts,
    legacy: state.legacy,
    sourceFingerprint: state.sourceFingerprint
  });
  const nextSerialized = serializeTaskPlanState(nextState);
  if (!dryRun && options.persist) {
    try {
      const committed = options.persist(nextState, nextSerialized, options.expectedRevision);
      if (!committed) {
        const staleFinding = finding("PLAN_STALE_REVISION", `persisted revision changed before commit of ${options.expectedRevision}`, [], [], "Reload the persisted plan state and retry against its current revision.");
        return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings: [staleFinding] };
      }
    } catch (error) {
      const persistenceFinding = finding("PLAN_PERSISTENCE_FAILED", `persistence failed: ${error instanceof Error ? error.message : String(error)}`, [], [], "Leave the source unchanged, fix persistence, and retry the same CAS revision.");
      return { ok: false, committed: false, dryRun, revision: state.revision, state: before, plan: queryTaskPlan(before), findings: [persistenceFinding] };
    }
  }
  const resultState = clone(nextState);
  return { ok: true, committed: !dryRun, dryRun, revision: resultState.revision, state: resultState, plan: queryTaskPlan(resultState), findings: [] };
}
var applyExecutionPlanPatch = applyTaskPlanPatch;
var applyPlanPatch = applyTaskPlanPatch;
function reportTaskPlan(state, options = {}) {
  return queryTaskPlan(state, options).reports;
}
function taskPlanStateWithLegacy(tasks, legacy, options = {}) {
  return buildTaskPlanState(tasks, { ...options, legacy });
}
function planStateFingerprint(state) {
  return stableTaskJson(state.tasks);
}
function countTaskPlanRecords(state) {
  return state.tasks.length + state.legacy.length;
}
function legacyPlanReport(records, mode) {
  return rolloutReport(records, mode);
}
export {
  TASK_PLAN_VERSION,
  applyExecutionPlanPatch,
  applyPlanPatch,
  applyTaskPlanPatch,
  buildTaskPlanState,
  canonicalTaskPlanJson,
  compareAndSwapTaskPlanState,
  countTaskPlanRecords,
  createFileCasAdapter,
  deriveTaskConflicts,
  executionPlanQuery,
  incrementalTaskPlanState,
  legacyPlanReport,
  persistTaskPlanState,
  planStateFingerprint,
  queryExecutionPlan,
  queryTaskPlan,
  redactPlanText,
  reportTaskPlan,
  restorePersistedTaskPlanState,
  restoreTaskPlanState,
  serializeTaskPlanState,
  taskPlanStateWithLegacy,
  validateTaskPlanPatch
};
