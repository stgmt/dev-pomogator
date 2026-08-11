// tools/subagent-watchdog/subagent_watchdog.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
var DEFAULT_STALE_MS = 30 * 6e4;
var DEFAULT_LOOKBACK_MS = 24 * 60 * 6e4;
var DEFAULT_MAX_ISSUES = 8;
var OUTPUT_FILE_RE = /(?:output_file|Output is being written to):\s*([A-Za-z]:[^\r\n]+?\.output)\b/i;
var AGENT_ID_RE = /agentId:\s*([A-Za-z0-9_-]+)/i;
var BG_ID_RE = /Command running in background with ID:\s*([A-Za-z0-9_-]+)/i;
var CLAUDE_API_FAILURE_RE = /\bAPI Error\b|Stream ended without receiving any events|Upstream service|Service temporarily unavailable|rate-limited|context window|max_output_tokens|Invalid value:|429|503|400/i;
function toMs(timestamp) {
  if (typeof timestamp !== "string" || timestamp.length === 0) return void 0;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : void 0;
}
function normalizePath(p) {
  return p.trim().replace(/^["']|["']$/g, "");
}
function readTextFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => readTextFromContent(item)).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    const record = content;
    if (typeof record.text === "string") return record.text;
    if (record.content !== void 0) return readTextFromContent(record.content);
  }
  return "";
}
function collectMessageTexts(record) {
  const message = record.message;
  const content = message?.content;
  const out = [];
  if (typeof content === "string") {
    out.push({ text: content });
    return out;
  }
  if (!Array.isArray(content)) return out;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part;
    const text = readTextFromContent(p.content ?? p.text);
    if (text) out.push({ text, toolUseId: typeof p.tool_use_id === "string" ? p.tool_use_id : void 0 });
  }
  return out;
}
function collectAttachmentTexts(record) {
  const attachment = record.attachment;
  if (!attachment) return [];
  const texts = [];
  for (const key of ["content", "stdout", "stderr"]) {
    const text = readTextFromContent(attachment[key]);
    if (text) texts.push({ text });
  }
  return texts;
}
function collectQueueTexts(record) {
  const content = record.content;
  const text = readTextFromContent(content);
  return text ? [{ text }] : [];
}
function xmlTag(block, tag) {
  const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = re.exec(block);
  return match?.[1]?.trim();
}
function notificationBlocks(text) {
  return Array.from(text.matchAll(/<task-notification\b[\s\S]*?<\/task-notification>/gi)).map((m) => m[0]);
}
function taskIdFromTaskOutput(text) {
  return xmlTag(text, "task-id") ?? xmlTag(text, "task_id") ?? /task[_-]id["'\s:=]+([A-Za-z0-9_-]+)/i.exec(text)?.[1];
}
function getOrCreate(states, taskId, kind) {
  const existing = states.get(taskId);
  if (existing) return existing;
  const created = { taskId, kind, toolUseIds: /* @__PURE__ */ new Set() };
  states.set(taskId, created);
  return created;
}
function updateOutputStats(state) {
  if (!state.outputFile) return;
  try {
    const stat = fs.statSync(state.outputFile);
    state.outputBytes = stat.size;
    const mtime = stat.mtimeMs;
    if (!state.lastSeenAt || mtime > state.lastSeenAt) state.lastSeenAt = mtime;
  } catch {
  }
}
function registerNotification(states, block, unknownStatuses, tsMs) {
  const taskId = xmlTag(block, "task-id");
  if (!taskId) return;
  const status = parseStatus(xmlTag(block, "status"), unknownStatuses);
  const summary = xmlTag(block, "summary");
  const outputFile = xmlTag(block, "output-file");
  const toolUseId = xmlTag(block, "tool-use-id");
  const kind = taskId.startsWith("a") ? "agent" : "background";
  const state = getOrCreate(states, taskId, kind);
  if (status) state.status = status;
  if (summary) {
    state.summary = summary;
    const agentTitle = /(?:Agent|agent) "([^"]+)"/.exec(summary)?.[1];
    if (agentTitle) state.title = agentTitle;
  }
  if (outputFile) state.outputFile = normalizePath(outputFile);
  if (toolUseId) state.toolUseIds.add(toolUseId);
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}
function registerAgentLaunch(states, launches, toolUseId, text, tsMs) {
  if (!/Async agent launched successfully|agent is working in the background/i.test(text)) return;
  const agentId = AGENT_ID_RE.exec(text)?.[1];
  if (!agentId) return;
  const launch = toolUseId ? launches.get(toolUseId) : void 0;
  if (!launch) return;
  const state = getOrCreate(states, agentId, "agent");
  state.status ??= "running";
  state.title ??= launch?.title;
  state.model ??= launch?.model;
  state.subagentType ??= launch?.subagentType;
  if (toolUseId) state.toolUseIds.add(toolUseId);
  state.launchedAt ??= launch?.launchedAt ?? tsMs;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  const outputFile = OUTPUT_FILE_RE.exec(text)?.[1];
  if (outputFile) state.outputFile = normalizePath(outputFile);
  updateOutputStats(state);
}
function registerBackgroundLaunch(states, bashToolUseIds, toolUseId, text, tsMs) {
  const taskId = BG_ID_RE.exec(text)?.[1];
  if (!taskId) return;
  if (!toolUseId || !bashToolUseIds.has(toolUseId)) return;
  const state = getOrCreate(states, taskId, "background");
  state.status ??= "running";
  if (toolUseId) state.toolUseIds.add(toolUseId);
  state.launchedAt ??= tsMs;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  const outputFile = OUTPUT_FILE_RE.exec(text)?.[1];
  if (outputFile) state.outputFile = normalizePath(outputFile);
  updateOutputStats(state);
}
function registerTaskOutput(states, text, tsMs) {
  if (!/<retrieval_status>\s*not_ready\s*<\/retrieval_status>/i.test(text) && !/<status>\s*running\s*<\/status>/i.test(text)) {
    return;
  }
  const taskId = taskIdFromTaskOutput(text);
  if (!taskId) return;
  const state = getOrCreate(states, taskId, taskId.startsWith("a") ? "agent" : "background");
  state.status ??= "running";
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}
function registerAssistantToolUses(record, launches, bashToolUseIds, tsMs) {
  const message = record.message;
  const content = message?.content;
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part;
    if (p.type !== "tool_use") continue;
    const id = typeof p.id === "string" ? p.id : void 0;
    const name = typeof p.name === "string" ? p.name : void 0;
    if (!id) continue;
    if (name === "Bash") {
      bashToolUseIds.add(id);
      continue;
    }
    if (name !== "Agent") continue;
    const input = p.input ?? {};
    launches.set(id, {
      toolUseId: id,
      kind: "agent",
      title: typeof input.description === "string" ? input.description : void 0,
      model: typeof input.model === "string" ? input.model : void 0,
      subagentType: typeof input.subagent_type === "string" ? input.subagent_type : void 0,
      launchedAt: tsMs
    });
  }
}
function registerSidechainAgent(states, record, tsMs) {
  const agentId = typeof record.agentId === "string" ? record.agentId : void 0;
  if (!agentId) return;
  const state = getOrCreate(states, agentId, "agent");
  state.status ??= "running";
  const message = record.message;
  if (typeof message?.model === "string") state.model ??= message.model;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}
var KNOWN_STATUSES = /* @__PURE__ */ new Set(["running", "completed", "failed", "stopped", "killed"]);
var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["completed", "failed", "stopped", "killed"]);
function parseStatus(raw, unknown) {
  if (!raw) return void 0;
  const value = raw.trim().toLowerCase();
  if (KNOWN_STATUSES.has(value)) return value;
  unknown.add(value);
  return "stopped";
}
function isFinal(status) {
  return status !== void 0 && TERMINAL_STATUSES.has(status);
}
function isClaudeApiFailure(summary) {
  return typeof summary === "string" && CLAUDE_API_FAILURE_RE.test(summary);
}
function issueFromState(state, nowMs, staleMs) {
  updateOutputStats(state);
  const last = state.lastSeenAt ?? state.launchedAt;
  if (!last) return void 0;
  const ageMs = Math.max(0, nowMs - last);
  const ageMinutes = Math.floor(ageMs / 6e4);
  if (state.status === "failed" && isClaudeApiFailure(state.summary)) {
    return {
      kind: "failed-api-error",
      taskId: state.taskId,
      taskKind: state.kind,
      title: state.title,
      status: state.status,
      ageMinutes,
      lastSeenAt: new Date(last).toISOString(),
      outputFile: state.outputFile,
      outputBytes: state.outputBytes,
      summary: state.summary,
      evidence: "Claude emitted a failed task-notification with an API/stream/context error; the child did not produce a trustworthy result and the parent must recover or report it explicitly."
    };
  }
  if (state.status === "stopped" && /No completion record/i.test(state.summary ?? "")) {
    return {
      kind: "lost-completion",
      taskId: state.taskId,
      taskKind: state.kind,
      title: state.title,
      status: state.status,
      ageMinutes,
      lastSeenAt: new Date(last).toISOString(),
      outputFile: state.outputFile,
      outputBytes: state.outputBytes,
      summary: state.summary,
      evidence: 'Claude emitted a stopped task-notification with "No completion record"; the main agent cannot assume this child completed.'
    };
  }
  if (isFinal(state.status)) return void 0;
  if (ageMs < staleMs) return void 0;
  return {
    kind: "stale-running",
    taskId: state.taskId,
    taskKind: state.kind,
    title: state.title,
    status: state.status ?? "running",
    ageMinutes,
    lastSeenAt: new Date(last).toISOString(),
    outputFile: state.outputFile,
    outputBytes: state.outputBytes,
    summary: state.summary,
    evidence: "No completed/failed/stopped task-notification after the last observed running activity; output file did not move within the stale threshold."
  };
}
function analyzeTranscript(transcriptPath, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
  const states = /* @__PURE__ */ new Map();
  const launches = /* @__PURE__ */ new Map();
  const bashToolUseIds = /* @__PURE__ */ new Set();
  const unknownStatuses = /* @__PURE__ */ new Set();
  const raw = fs.readFileSync(transcriptPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const tsMs = toMs(parsed.timestamp);
    registerAssistantToolUses(parsed, launches, bashToolUseIds, tsMs);
    registerSidechainAgent(states, parsed, tsMs);
    const texts = [
      ...collectMessageTexts(parsed),
      ...collectAttachmentTexts(parsed),
      ...collectQueueTexts(parsed)
    ];
    for (const part of texts) {
      registerAgentLaunch(states, launches, part.toolUseId, part.text, tsMs);
      registerBackgroundLaunch(states, bashToolUseIds, part.toolUseId, part.text, tsMs);
      registerTaskOutput(states, part.text, tsMs);
      for (const block of notificationBlocks(part.text)) {
        registerNotification(states, block, unknownStatuses, tsMs);
      }
    }
  }
  const issues = [];
  for (const state of states.values()) {
    const last = state.lastSeenAt ?? state.launchedAt ?? 0;
    if (last && nowMs - last > lookbackMs) continue;
    const issue = issueFromState(state, nowMs, staleMs);
    if (issue) issues.push(issue);
  }
  issues.sort((a, b) => issuePriority(a) - issuePriority(b) || issueAgeOrder(a) - issueAgeOrder(b));
  return {
    issues: issues.slice(0, maxIssues),
    observedTasks: states.size,
    transcriptPath,
    ...unknownStatuses.size > 0 ? { unknownStatuses: [...unknownStatuses] } : {}
  };
}
function issuePriority(issue) {
  if (issue.kind === "failed-api-error" && issue.taskKind === "agent") return 0;
  if (issue.kind === "lost-completion" && issue.taskKind === "agent") return 0;
  if (issue.kind === "failed-api-error") return 1;
  if (issue.kind === "lost-completion") return 1;
  if (issue.taskKind === "agent") return 2;
  return 3;
}
function issueAgeOrder(issue) {
  if (issue.kind === "stale-running") return -issue.ageMinutes;
  return issue.ageMinutes;
}
function formatIssues(issues) {
  return issues.map((issue) => {
    const title = issue.title ? ` "${issue.title}"` : "";
    const file = issue.outputFile ? ` output=${issue.outputFile}${issue.outputBytes !== void 0 ? ` (${issue.outputBytes} bytes)` : ""}` : "";
    return `- ${issue.taskKind} ${issue.taskId}${title}: ${issue.kind}, age=${issue.ageMinutes}m, status=${issue.status ?? "unknown"}.${file} Evidence: ${issue.evidence}`;
  }).join("\n");
}
function ackCommand(cwd) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const bootstrap = pluginRoot ? path.join(pluginRoot, "tools", "_shared", "bootstrap.cjs") : path.join("<CLAUDE_PLUGIN_ROOT>", "tools", "_shared", "bootstrap.cjs");
  return `node -e "require(${JSON.stringify(bootstrap)})" -- "tools/subagent-watchdog/subagent_watchdog.ts" --ack <task-id> --cwd ${JSON.stringify(cwd)} --reason "<what you did>"`;
}
function buildHookOutput(event, result, cwd = process.cwd()) {
  if (result.issues.length === 0) {
    if (event === "Stop") return { decision: "approve" };
    return { continue: true, suppressOutput: true };
  }
  const message = [
    "subagent-watchdog: unresolved background Claude work detected.",
    "The main agent must inspect/resume/stop the listed task(s) before claiming completion.",
    formatIssues(result.issues),
    "Actions: use TaskOutput/TaskStop when available, or inspect the named output file in bounded chunks.",
    `Only an ack clears this gate \u2014 reporting it in prose does not. Acknowledge with:
  ${ackCommand(cwd)}`
  ].join("\n");
  if (event === "Stop") {
    return { decision: "block", reason: message };
  }
  return { continue: true, additionalContext: message };
}
function readNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
var SYSTEM_ROOT_RE = /^[A-Za-z]:[\\/]+windows([\\/]|$)/i;
function isUnsafeStateRoot(dir) {
  return SYSTEM_ROOT_RE.test(path.resolve(dir));
}
function gitToplevel(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out || void 0;
  } catch {
    return void 0;
  }
}
function resolveStateRoot(explicit) {
  const candidates = [explicit, process.env.CLAUDE_PROJECT_DIR, process.cwd()];
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    if (candidate.includes("${")) continue;
    if (isUnsafeStateRoot(candidate)) continue;
    const root = gitToplevel(candidate);
    if (root && !isUnsafeStateRoot(root)) return root;
    return candidate;
  }
  return void 0;
}
function watchdogLogPath(cwd) {
  return path.join(cwd, ".dev-pomogator", ".subagent-watchdog.jsonl");
}
function watchdogAckPath(cwd) {
  return path.join(cwd, ".dev-pomogator", ".subagent-watchdog-ack.jsonl");
}
function readAckedTaskIds(cwd) {
  const acked = /* @__PURE__ */ new Set();
  try {
    const file = watchdogAckPath(cwd);
    if (!fs.existsSync(file)) return acked;
    for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (typeof row.taskId === "string" && row.taskId) acked.add(row.taskId);
      } catch {
        const taskId = line.trim().split(/\s+/)[0];
        if (taskId) acked.add(taskId);
      }
    }
  } catch {
  }
  return acked;
}
function appendAck(cwd, taskId, reason) {
  const file = watchdogAckPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), taskId, reason: reason ?? "" })}
`);
}
function appendWatchdogLog(cwd, event, result) {
  try {
    const file = watchdogLogPath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const row = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      event,
      transcriptPath: result.transcriptPath,
      observedTasks: result.observedTasks,
      issues: result.issues
    };
    fs.appendFileSync(file, `${JSON.stringify(row)}
`);
  } catch {
  }
}
function issueSetKey(result) {
  return result.issues.map((issue) => issue.taskId).sort().join(",");
}
function countConsecutiveBlocks(cwd, key) {
  if (!key) return 0;
  try {
    const file = watchdogLogPath(cwd);
    if (!fs.existsSync(file)) return 0;
    const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
    let count = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      let row;
      try {
        row = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (row.event !== "Stop") continue;
      const issues = row.issues ?? [];
      if (issues.length === 0) break;
      if (issues.map((issue) => issue.taskId).sort().join(",") !== key) break;
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    if (process.stdin.isTTY) resolve("");
  });
}
async function runHook(rawInput, argv = process.argv) {
  const ackIdx = argv.indexOf("--ack");
  if (ackIdx >= 0) {
    const taskId = argv[ackIdx + 1];
    if (!taskId) return { continue: true, suppressOutput: true };
    const cwdIdx = argv.indexOf("--cwd");
    const root = resolveStateRoot(cwdIdx >= 0 ? argv[cwdIdx + 1] : void 0);
    if (!root) {
      process.stderr.write(
        `subagent-watchdog: refusing to write the ack \u2014 no trustworthy project directory.
  cwd resolves to a system directory (${process.cwd()}), which happens on Windows when the
  project lives on a UNC path (\\\\wsl.localhost\\...). Pass the project explicitly:
    --ack <task-id> --cwd "<project dir>" --reason "<what you did>"
`
      );
      return { continue: true, suppressOutput: true };
    }
    const reasonIdx = argv.indexOf("--reason");
    appendAck(root, taskId, reasonIdx >= 0 ? argv[reasonIdx + 1] : void 0);
    return { continue: true, suppressOutput: true };
  }
  const eventIdx = argv.indexOf("--event");
  const event = eventIdx >= 0 ? argv[eventIdx + 1] : process.env.CLAUDE_HOOK_EVENT_NAME ?? "UserPromptSubmit";
  if (process.env.SUBAGENT_WATCHDOG_ENABLED === "false") {
    return event === "Stop" ? { decision: "approve" } : { continue: true, suppressOutput: true };
  }
  const cleaned = rawInput.replace(/^\uFEFF/, "").trim();
  const input = cleaned ? JSON.parse(cleaned) : {};
  const transcriptPath = input.transcript_path ?? input.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return event === "Stop" ? { decision: "approve" } : { continue: true, suppressOutput: true };
  }
  const result = analyzeTranscript(transcriptPath, {
    staleMs: readNumberEnv("SUBAGENT_WATCHDOG_STALE_MINUTES", 30) * 6e4,
    lookbackMs: readNumberEnv("SUBAGENT_WATCHDOG_LOOKBACK_HOURS", 24) * 60 * 6e4,
    maxIssues: readNumberEnv("SUBAGENT_WATCHDOG_MAX_ISSUES", DEFAULT_MAX_ISSUES)
  });
  const cwd = resolveStateRoot(input.cwd) ?? process.cwd();
  const acked = readAckedTaskIds(cwd);
  result.issues = result.issues.filter((issue) => !acked.has(issue.taskId));
  appendWatchdogLog(cwd, event, result);
  const maxBlocks = readNumberEnv("SUBAGENT_WATCHDOG_MAX_BLOCKS", 3);
  if (event === "Stop" && result.issues.length > 0 && maxBlocks > 0) {
    if (countConsecutiveBlocks(cwd, issueSetKey(result)) > maxBlocks) {
      return {
        continue: true,
        additionalContext: [
          `subagent-watchdog: the same ${result.issues.length} task(s) have now blocked Stop ${maxBlocks} times.`,
          "Downgrading to a warning so the session is not wedged. If this work really is unresolved, resolve it;",
          "if the watchdog is wrong, this is a bug in the watchdog \u2014 report it rather than fighting the gate.",
          formatIssues(result.issues)
        ].join("\n")
      };
    }
  }
  return buildHookOutput(event, result, cwd);
}
async function main() {
  const raw = await readStdin();
  try {
    const output = await runHook(raw);
    process.stdout.write(`${JSON.stringify(output)}
`);
  } catch (error) {
    process.stderr.write(`subagent-watchdog skipped: ${error instanceof Error ? error.message : String(error)}
`);
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + "\n");
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().finally(() => process.exit(0));
}

// tools/hook-service/worker-adapters/subagent-watchdog.ts
async function handle(input, request) {
  const event = request.event || input?.hook_event_name || "UserPromptSubmit";
  return runHook(JSON.stringify(input ?? {}), ["--event", event]);
}
export {
  handle
};
