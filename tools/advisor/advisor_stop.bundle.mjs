import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// tools/advisor/advisor_stop.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// tools/claim-evidence-gate/transcript_events.ts
function blocksOf(value) {
  const message = value && typeof value === "object" ? value.message : void 0;
  const content = message && typeof message === "object" ? message.content : void 0;
  if (!Array.isArray(content)) return [];
  return content.filter((block) => Boolean(block && typeof block === "object"));
}
function transcriptText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(transcriptText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value;
  if (typeof record.text === "string") return record.text;
  if (record.content !== void 0) return transcriptText(record.content);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
function parseTranscriptEvents(rawTranscript) {
  const events = [];
  const toolUses = /* @__PURE__ */ new Map();
  const toolResults = /* @__PURE__ */ new Map();
  const lines = rawTranscript.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line?.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const blocks = blocksOf(raw);
      const event = {
        seq: events.length,
        line: index + 1,
        type: String(raw.type ?? ""),
        raw,
        blocks,
        text: transcriptText(raw.message?.content),
        isSidechain: raw.isSidechain === true
      };
      events.push(event);
      for (const block of blocks) {
        if (block.type === "tool_use" && block.id) toolUses.set(block.id, { ...event, block });
        if (block.type === "tool_result" && block.tool_use_id) toolResults.set(block.tool_use_id, { ...event, block });
      }
    } catch {
    }
  }
  return { raw: rawTranscript, events, toolUses, toolResults };
}

// tools/_shared/hook-utils.ts
function log(level, prefix, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  process.stderr.write(`[${ts}] [${prefix}] [${level}] ${message}
`);
}

// tools/advisor/session-summary.mjs
import fs from "node:fs";
import path from "node:path";
var DEFAULT_TEMPLATE = `# Session Title
_A short and distinctive 5-10 word descriptive title for the session. Super info dense, no filler_

# Current State
_What is actively being worked on right now? Pending tasks not yet completed. Immediate next steps._

# Task specification
_What did the user ask to build? Any design decisions or other explanatory context_

# Files and Functions
_What are the important files? In short, what do they contain and why are they relevant?_

# Workflow
_What bash commands are usually run and in what order? How to interpret their output if not obvious?_

# Errors & Corrections
_Errors encountered and how they were fixed. What did the user correct? What approaches failed and should not be tried again?_

# Codebase and System Documentation
_What are the important system components? How do they work/fit together?_

# Learnings
_What has worked well? What has not? What to avoid? Do not duplicate items from other sections_

# Key results
_If the user asked a specific output such as an answer to a question, a table, or other document, repeat the exact result here_

# Worklog
_Step by step, what was attempted, done? Very terse summary for each step_
`;
var SECTION_RE = /^(#{1,2}\s+.+)$/gm;
var MIN_TOKENS_TO_INIT = 5e3;
var MIN_TOKENS_BETWEEN_UPDATE = 5e3;
var TOOL_CALLS_BETWEEN_UPDATES = 3;
var MAX_TOTAL_TOKENS = 12e3;
var HAIKU_SUMMARIZER = "gpt-5.6-luna";
var CHARS_PER_TOKEN = 4;
function roughTokenEstimate(text) {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}
function contentTokensOfMessage(content) {
  if (typeof content === "string") return roughTokenEstimate(content);
  if (Array.isArray(content)) {
    let total = 0;
    for (const b of content) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "text") total += roughTokenEstimate(b.text);
      else if (b.type === "tool_use") total += roughTokenEstimate(JSON.stringify(b.input ?? {}));
      else if (b.type === "tool_result") total += roughTokenEstimate(String(typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "")));
    }
    return total;
  }
  return 0;
}
function isToolUseTurn(entry) {
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && b.type === "tool_use");
}
function parseTranscript(raw) {
  const entries = [];
  let contentTokens = 0;
  let apiTokens = 0;
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const type = String(o.type ?? "");
    if (type !== "user" && type !== "assistant") continue;
    contentTokens += contentTokensOfMessage(o.message?.content);
    if (type === "assistant" && o.message?.usage) {
      const u = o.message.usage;
      apiTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0);
    } else {
      apiTokens += contentTokensOfMessage(o.message?.content);
    }
    entries.push(o);
  }
  return { entries, apiTokens, contentTokens };
}
function shouldUpdate(state, contentTokens, toolCallsSince, lastTurnHasToolCalls) {
  if (!state.initialized) {
    if (contentTokens < MIN_TOKENS_TO_INIT) return { pass: false, reason: "init_below_threshold" };
    state.initialized = true;
  }
  const growth = contentTokens - state.content_tokens_at_last_extraction;
  if (growth < MIN_TOKENS_BETWEEN_UPDATE) return { pass: false, reason: "growth_below_threshold" };
  const fired = toolCallsSince >= TOOL_CALLS_BETWEEN_UPDATES || !lastTurnHasToolCalls;
  if (!fired) return { pass: false, reason: "tool_activity_insufficient" };
  return { pass: true, reason: "passed" };
}
function advisorRoot(repoRoot) {
  return path.join(repoRoot ?? process.cwd(), ".dev-pomogator", "advisor");
}
function summaryFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), "summary", `${sanitize(sessionId)}.md`);
}
function stateFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), "state", `${sanitize(sessionId)}.json`);
}
function lockFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), "locks", `${sanitize(sessionId)}.lock`);
}
function sanitize(s) {
  return String(s ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
}
function readState(repoRoot, sessionId) {
  const p = stateFilePath(repoRoot, sessionId);
  const defaults = {
    session_id: sessionId,
    initialized: false,
    content_tokens_at_last_extraction: 0,
    api_tokens_at_last_extraction: 0,
    last_extraction_line_count: 0,
    last_extraction_timestamp: null,
    extraction_count: 0,
    consecutive_failures: 0
  };
  try {
    if (fs.existsSync(p)) return { ...defaults, ...JSON.parse(fs.readFileSync(p, "utf-8")) };
  } catch {
  }
  return defaults;
}
function writeStateAtomic(repoRoot, sessionId, state) {
  const p = stateFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}
function tryLock(repoRoot, sessionId) {
  const p = lockFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  try {
    const fd = fs.openSync(p, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return () => {
      try {
        fs.unlinkSync(p);
      } catch {
      }
    };
  } catch {
    return null;
  }
}
function readOrCreateSummary(repoRoot, sessionId) {
  const p = summaryFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (fs.existsSync(p)) return { summary: fs.readFileSync(p, "utf-8"), created: false, path: p };
  fs.writeFileSync(p + ".init.tmp", DEFAULT_TEMPLATE);
  fs.writeFileSync(p, DEFAULT_TEMPLATE);
  try {
    fs.unlinkSync(p + ".init.tmp");
  } catch {
  }
  return { summary: DEFAULT_TEMPLATE, created: true, path: p };
}
function writeSummaryAtomic(repoRoot, sessionId, summary) {
  const p = summaryFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, summary);
  fs.renameSync(tmp, p);
}
function sliceDelta(entries, lastExtractionLine, allLines) {
  if (!lastExtractionLine || !allLines) return entries;
  const fractionNew = Math.max(0, allLines - lastExtractionLine) / allLines;
  const startIdx = Math.max(0, Math.floor(entries.length * (1 - fractionNew)));
  return entries.slice(startIdx);
}
function flattenDelta(entries) {
  return entries.map((o) => {
    const type = String(o.type ?? "");
    const c = o.message?.content ?? "";
    if (typeof c === "string") return `[${type.toUpperCase()}] ${c.replace(/\s+/g, " ")}`;
    if (!Array.isArray(c)) return "";
    const parts = [];
    for (const b of c) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "text" && b.text) parts.push(b.text.replace(/\s+/g, " "));
      else if (b.type === "tool_use") parts.push(`[tool ${b.name}] ${JSON.stringify(b.input ?? {}).slice(0, 300)}`);
      else if (b.type === "tool_result") parts.push(`[result${b.is_error ? " ERROR" : ""}] ${typeof b.content === "string" ? b.content.replace(/\s+/g, " ").slice(0, 300) : "\u2026"}`);
    }
    return `[${type.toUpperCase()}] ${parts.join(" ")}`;
  }).filter(Boolean);
}
function buildUpdatePrompt(currentSummary, deltaText) {
  return `Update the session notes below based ONLY on the NEW conversation delta. Structure must keep every '#' section header unchanged; the _italic description_ lines are section carriers \u2014 you MAY replace their placeholder text with a real description, but never delete a header. Keep each section concise, total \u2264 ~${MAX_TOTAL_TOKENS} tokens; if over, condense older sections and prioritise 'Current State' and 'Errors & Corrections'. Do not add new sections, do not reference this task, no filler. Return the FULL updated notes (whole file), no commentary.

## CURRENT SESSION NOTES
${currentSummary}

## NEW CONVERSATION DELTA
${deltaText}`;
}
async function updateSummaryViaModel(currentSummary, deltaText, { model = HAIKU_SUMMARIZER, callModel } = {}) {
  const prompt = buildUpdatePrompt(currentSummary, deltaText);
  if (typeof callModel === "function") {
    return callModel(prompt, { model, maxTokens: 4e3 });
  }
  const base = (process.env.ANTHROPIC_BASE_URL ?? "").trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!base || !key) return { ok: false, error: "no ANTHROPIC_BASE_URL/token" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.ADVISOR_TIMEOUT_MS || 3e4));
  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, authorization: `Bearer ${key}`, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 4e3, thinking: { type: "disabled" }, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "empty" };
  } catch (e) {
    return { ok: false, error: String(e?.name === "AbortError" ? "timeout" : e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}
function verifyStructure(text) {
  const need = [...DEFAULT_TEMPLATE.matchAll(SECTION_RE)].map((m) => m[1].trim());
  const have = [...String(text ?? "").matchAll(SECTION_RE)].map((m) => m[1].trim());
  const missing = need.filter((h) => !have.includes(h));
  return { ok: missing.length === 0, missing };
}
async function maybeUpdateSummary({ transcriptPath, repoRoot, sessionId, force = false, callModel } = {}) {
  if (!transcriptPath || !sessionId) return { ok: false, reason: "no transcript/session" };
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf-8");
  } catch (e) {
    return { ok: false, reason: `read: ${e.message}` };
  }
  const { entries, apiTokens, contentTokens } = parseTranscript(raw);
  if (!entries.length) return { ok: false, reason: "no conversation entries" };
  const allLines = raw.split(/\r?\n/).length;
  let state = readState(repoRoot, sessionId);
  const wasInit = state.initialized;
  const growth = contentTokens - state.content_tokens_at_last_extraction;
  const toolCallsSince = countToolCalls(sliceDelta(entries, state.last_extraction_line_count, allLines));
  const lastTurnHasTools = isToolUseTurn(entries[entries.length - 1]);
  let gate = shouldUpdate({ ...state }, contentTokens, toolCallsSince, lastTurnHasTools);
  let update = force || gate.pass;
  if (force) gate = { pass: true, reason: `forced_bypass(${gate.reason})`, forced: true };
  if (!update) return { ok: true, updated: false, state, summary: readOrCreateSummary(repoRoot, sessionId).summary, gate, delta: [], growth, toolCallsSince };
  const delta = sliceDelta(entries, state.last_extraction_line_count, allLines);
  if (!delta.length && !force) return { ok: true, updated: false, state, summary: readOrCreateSummary(repoRoot, sessionId).summary, gate, delta, growth, toolCallsSince };
  const { summary, path: summaryPath } = readOrCreateSummary(repoRoot, sessionId);
  const MAX_DELTA_EVENTS = 40;
  const flat = flattenDelta(delta.slice(-MAX_DELTA_EVENTS)).join("\n");
  const updateRes = await updateSummaryViaModel(summary, flat, { callModel });
  if (!updateRes.ok) {
    state.consecutive_failures = (state.consecutive_failures ?? 0) + 1;
    writeStateAtomic(repoRoot, sessionId, state);
    return { ok: false, reason: `update: ${updateRes.error}`, updated: false, state, gate, summary, delta: flat };
  }
  const updated = updateRes.text;
  const struct = verifyStructure(updated);
  if (!struct.ok) {
    state.consecutive_failures = (state.consecutive_failures ?? 0) + 1;
    writeStateAtomic(repoRoot, sessionId, state);
    return { ok: false, reason: `structure lost: ${struct.missing.join(", ")}`, updated: false, state, gate, summary, delta: flat };
  }
  writeSummaryAtomic(repoRoot, sessionId, updated);
  state.initialized = true;
  state.content_tokens_at_last_extraction = contentTokens;
  state.api_tokens_at_last_extraction = apiTokens;
  state.last_extraction_line_count = allLines;
  state.last_extraction_timestamp = Date.now();
  state.extraction_count = (state.extraction_count ?? 0) + 1;
  state.consecutive_failures = 0;
  writeStateAtomic(repoRoot, sessionId, state);
  return { ok: true, updated: true, state, gate, summary: updated, delta: flat, summaryPath, growth, toolCallsSince };
}
function countToolCalls(entries) {
  let n = 0;
  for (const o of entries) if (isToolUseTurn(o)) n++;
  return n;
}

// tools/advisor/advisor_stop.ts
var LOG_PREFIX = "ADVISOR";
var MARKER_DIR = ".dev-pomogator";
var FIRES_FILENAME = ".advisor-fires.jsonl";
var MARKER_FILENAME = ".advisor-marker.json";
var COOLDOWN_MS = Number(process.env.ADVISOR_COOLDOWN_MS || 3e5);
var TIMEOUT_MS = Number(process.env.ADVISOR_TIMEOUT_MS || 3e4);
var MAX_RECENT_EVENTS = 40;
var MAX_MSG_CHARS = 1500;
var DONE_SIGNAL = /(готово|готова|готов\b|сделал[аи]?|закоммит|закрыл|закрыт\b|реализован[аоы]?|работает|вс[её]\s+готово|done|fixed|finished|shipped|landed|wrapped\s+up|complete|создан[аоы]?\b)/i;
var ERROR_SHELL = /(error|exception|failed|fail|ошибк|не\s+наш[её]|crash|Э\s+.+exit)/i;
function errorSignature(ev) {
  if (ev.isSidechain) return null;
  for (const block of ev.blocks) {
    if (block.type === "tool_result") {
      const text = String(block.content ?? "");
      const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && ERROR_SHELL.test(l));
      const key = `${ev.type}|${block.is_error === true ? "ERR" : "ok|" + (line ?? "").slice(0, 160).toLowerCase()}`;
      void key;
      if (block.is_error === true) {
        return `${ev.raw.promptSource ?? ""}|tool_error|${(line ?? text).slice(0, 160).toLowerCase()}`;
      }
      if (line && ERROR_SHELL.test(line)) {
        return `stderr|${line.slice(0, 160).toLowerCase()}`;
      }
    }
  }
  return null;
}
function detectKeyPoint(input, events) {
  const final = (input.last_assistant_message ?? "").replace(/\s+/g, " ").slice(0, 2e3);
  const conversational = events.filter((ev) => ev.type === "user" || ev.type === "assistant");
  const recent = conversational.slice(-MAX_RECENT_EVENTS);
  const planTool = recent.some((ev) => ev.blocks.some((b) => b.type === "tool_use" && (b.name === "ExitPlanMode" || /plan/i.test(String(b.name ?? "")))));
  if (planTool) return { kind: "PLAN_APPROACH", reason: "ExitPlanMode / plan tool use in the recent window", evidence: ["ExitPlanMode seen"] };
  const sigs = /* @__PURE__ */ new Map();
  for (const ev of recent) {
    const s = errorSignature(ev);
    if (s) sigs.set(s, (sigs.get(s) ?? 0) + 1);
  }
  let worst = null;
  for (const [sig, count] of sigs) {
    if (count >= 2 && (!worst || count > worst.count)) worst = { sig, count };
  }
  if (worst) return { kind: "RECURRING_ERROR", reason: `\u043E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u0441\u0431\u043E\u0439 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u0442\u0441\u044F (${worst.count}x): ${worst.sig.slice(0, 120)}`, evidence: [worst.sig] };
  const usedToolThisTurn = recent.slice(-12).some((ev) => ev.blocks.some((b) => b.type === "tool_use"));
  if (DONE_SIGNAL.test(final) && usedToolThisTurn) {
    return { kind: "DONE_CLAIM", reason: "\u0444\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u0435\u043A\u043B\u0430\u0440\u0438\u0440\u0443\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u044B", evidence: [final.slice(0, 200)] };
  }
  return null;
}
function buildPacket(input, events) {
  const lines = [`# Advisor consultation (session ${input.session_id ?? "unknown"})`, ""];
  const conversational = events.filter((ev) => ev.type === "user" || ev.type === "assistant");
  const recent = conversational.slice(-MAX_RECENT_EVENTS);
  for (const ev of recent) {
    const role = ev.type === "user" ? "USER" : ev.type === "assistant" ? "ASSISTANT" : String(ev.type).toUpperCase();
    if (ev.text.trim()) {
      lines.push(`[${role}] ${ev.text.replace(/\s+/g, " ").slice(0, 400)}`);
      continue;
    }
    for (const block of ev.blocks) {
      if (block.type === "tool_use") {
        const inp = JSON.stringify(block.input ?? {}).slice(0, 240);
        lines.push(`[TOOL ${block.name}] input=${inp}`);
      } else if (block.type === "tool_result") {
        const text = String(block.content ?? "").replace(/\s+/g, " ").slice(0, 240);
        lines.push(`[TOOL_RESULT${block.is_error === true ? " ERROR" : ""}] ${text}`);
      }
    }
  }
  lines.push("");
  lines.push(`## Final assistant message:
${input.last_assistant_message ?? ""}`);
  return lines.join("\n");
}
function buildAdvisorPrompt(packet, key) {
  return `You are an independent ADVISOR consulted at a key moment of an AI coding task.
Moment: ${key.kind} \u2014 ${key.reason}.
Below is a bounded slice of the recent conversation (tool calls, results, messages).
Give concise, concrete guidance as 2-5 bullets: what is risky, what to double-check before proceeding or declaring completion, what the agent may have missed. Reference concrete files/tools/evidence when possible. If the work looks sound, say so briefly and name the ONE thing most worth verifying. Plain text, no JSON.

` + packet;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
function approve(message) {
  process.stdout.write(message ? JSON.stringify({ decision: "approve", systemMessage: message }) : "{}");
}
function resolveEnv() {
  const base = (process.env.ANTHROPIC_BASE_URL ?? "").trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!base || !key) {
    log("WARN", LOG_PREFIX, "\u043D\u0435\u0442 ANTHROPIC_BASE_URL/\u0442\u043E\u043A\u0435\u043D\u0430 \u2014 \u0430\u0434\u0432\u0438\u0437\u043E\u0440 \u043C\u043E\u043B\u0447\u0438\u0442 (fail-open)");
    return null;
  }
  return { base, key };
}
async function consultAdvisor(packet, key) {
  const env = resolveEnv();
  if (!env) return null;
  if (typeof globalThis.fetch !== "function") {
    log("WARN", LOG_PREFIX, "fetch \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 \u0430\u0434\u0432\u0438\u0437\u043E\u0440 \u043C\u043E\u043B\u0447\u0438\u0442");
    return null;
  }
  const model = process.env.ADVISOR_MODEL?.trim() || "gpt-5.6-sol";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${env.base}/v1/messages`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env.key,
        authorization: `Bearer ${env.key}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: buildAdvisorPrompt(packet, key) }]
      })
    });
    if (!r.ok) {
      log("WARN", LOG_PREFIX, `HTTP ${r.status} ${r.statusText} \u043E\u0442 ${env.base}`);
      const body = await r.text().catch(() => "");
      log("DEBUG", LOG_PREFIX, `body: ${body.slice(0, 200)}`);
      return null;
    }
    const j = await r.json();
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return text || null;
  } catch (e) {
    const msg = e instanceof Error ? e.name === "AbortError" ? `\u0442\u0430\u0439\u043C\u0430\u0443\u0442 ${TIMEOUT_MS}ms` : e.message : String(e);
    log("WARN", LOG_PREFIX, `\u0432\u044B\u0437\u043E\u0432 \u043D\u0435 \u0443\u0434\u0430\u043B\u0441\u044F: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function readMarker(repoRoot, sessionId) {
  try {
    const p = path2.join(repoRoot, MARKER_DIR, MARKER_FILENAME);
    if (!fs2.existsSync(p)) return null;
    const j = JSON.parse(fs2.readFileSync(p, "utf-8"));
    return j[sessionId] ?? null;
  } catch {
    return null;
  }
}
function writeMarkerAtomic(repoRoot, sessionId, ts) {
  try {
    const dir = path2.join(repoRoot, MARKER_DIR);
    fs2.mkdirSync(dir, { recursive: true });
    const p = path2.join(dir, MARKER_FILENAME);
    let map = {};
    try {
      map = JSON.parse(fs2.readFileSync(p, "utf-8"));
    } catch {
      map = {};
    }
    map[sessionId] = ts;
    const tmp = `${p}.${process.pid}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify(map));
    fs2.renameSync(tmp, p);
  } catch {
  }
}
function logFire(repoRoot, entry) {
  try {
    const dir = path2.join(repoRoot, MARKER_DIR);
    fs2.mkdirSync(dir, { recursive: true });
    fs2.appendFileSync(path2.join(dir, FIRES_FILENAME), JSON.stringify(entry) + "\n");
  } catch {
  }
}
async function main() {
  const mode = (process.env.ADVISOR_ENABLED ?? "true").toLowerCase();
  if (mode === "false") return approve();
  let raw = "";
  try {
    raw = await readStdin();
  } catch {
    return approve();
  }
  if (!raw.trim()) return approve();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return approve();
  }
  const repoRoot = input.cwd || process.cwd();
  const sessionId = input.session_id ?? "";
  if (input.last_assistant_message && /ADVISOR_INTEGRATED|advisor:/.test(input.last_assistant_message)) return approve();
  const lastFire = sessionId ? readMarker(repoRoot, sessionId) : null;
  if (lastFire !== null && Date.now() - lastFire < COOLDOWN_MS) return approve();
  let events = [];
  if (input.transcript_path) {
    try {
      const parsed = parseTranscriptEvents(fs2.readFileSync(input.transcript_path, "utf-8"));
      events = parsed.events;
    } catch {
      events = [];
    }
  }
  let key = null;
  try {
    key = detectKeyPoint(input, events);
  } catch (e) {
    log("WARN", LOG_PREFIX, `detection failed: ${String(e)}`);
  }
  logFire(repoRoot, { ts: (/* @__PURE__ */ new Date()).toISOString(), sessionId, kind: key?.kind ?? "NO_FIRE", reason: key?.reason ?? "no key point", debug: { events: events.length, hadTranscript: Boolean(input.transcript_path), last: (input.last_assistant_message ?? "").slice(0, 120) } });
  if ((process.env.ADVISOR_SESSION_SUMMARY ?? "0") === "1" && input.transcript_path && sessionId) {
    try {
      const lock = tryLock(repoRoot, sessionId);
      if (lock) {
        try {
          const up = await maybeUpdateSummary({
            transcriptPath: input.transcript_path,
            repoRoot,
            sessionId,
            force: (process.env.ADVISOR_SUMMARY_FORCE ?? "0") === "1"
          });
          if (up?.updated) log("INFO", LOG_PREFIX, `session summary updated (extract #${up.state?.extraction_count ?? "?"})`);
          else if (up && !up.ok) log("WARN", LOG_PREFIX, `session summary update skipped: ${up.reason ?? "?"}`);
        } finally {
          lock();
        }
      }
    } catch (e) {
      log("WARN", LOG_PREFIX, `session summary update failed: ${String(e)}`);
    }
  }
  if (!key) return approve();
  const packet = buildPacket(input, events);
  let guidance = null;
  try {
    guidance = await consultAdvisor(packet, key);
  } catch {
    guidance = null;
  }
  const entry = { ts: (/* @__PURE__ */ new Date()).toISOString(), sessionId, key: key.kind, reason: key.reason, guidance };
  logFire(repoRoot, entry);
  if (sessionId) writeMarkerAtomic(repoRoot, sessionId, Date.now());
  if (mode === "shadow") {
    log("INFO", LOG_PREFIX, `[shadow] ${key.kind} \u2014 guidance=${guidance ? guidance.slice(0, 200) : "(unavailable)"}`);
    return approve();
  }
  if (!guidance) return approve();
  const message = `\u{1F9ED} Advisor (${key.kind}): ${guidance.replace(/\s+/g, " ").slice(0, MAX_MSG_CHARS)}`;
  return approve(message);
}
var entryUrl = process.argv[1] ? path2.resolve(process.argv[1]).replace(/\\/g, "/") : "";
var thisUrl = fileURLToPath(import.meta.url).replace(/\\/g, "/");
var isDirect = !entryUrl || thisUrl.endsWith(entryUrl);
if (isDirect) {
  main().catch(() => process.stdout.write("{}"));
}
export {
  buildAdvisorPrompt,
  buildPacket,
  detectKeyPoint
};
