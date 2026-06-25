#!/usr/bin/env npx tsx
import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// tools/claim-evidence-gate/claim_evidence_gate_stop.ts
import fs4 from "node:fs";
import path4 from "node:path";

// tools/_shared/hook-utils.ts
function log(level, prefix, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  process.stderr.write(`[${ts}] [${prefix}] [${level}] ${message}
`);
}
function normalizePath(p) {
  if (!p) return p;
  if (process.platform === "win32" && /^\/[a-zA-Z]:\//.test(p)) {
    const drive = p[1].toUpperCase();
    return `${drive}:${p.slice(2).replace(/\//g, "\\")}`;
  }
  return p;
}

// tools/_shared/marker-utils.ts
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
function markerPath(repoRoot, markerDir, markerFilename) {
  return path.join(repoRoot, markerDir, markerFilename);
}
function readMarker(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data && typeof data.hash === "string" && typeof data.timestamp === "string") {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
function writeMarkerAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
function isWithinCooldown(timestamp, cooldownMinutes) {
  const markerTime = new Date(timestamp).getTime();
  if (isNaN(markerTime)) return false;
  const elapsed = (Date.now() - markerTime) / 6e4;
  return elapsed < cooldownMinutes;
}
function hashFileList(files) {
  return createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16);
}

// tools/claim-evidence-gate/turn_window.ts
var MAX_LINE_BYTES = 1e6;
function parseLines(raw) {
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.length > MAX_LINE_BYTES) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function role(e) {
  return e.type ?? e.message?.role;
}
function contentBlocks(e) {
  const c = e.message?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}
function isRealUser(e) {
  if (role(e) !== "user") return false;
  const c = e.message?.content;
  if (typeof c === "string") return c.trim().length > 0;
  if (!Array.isArray(c)) return false;
  const hasText = c.some((b) => b?.type === "text" && typeof b.text === "string" && b.text.trim());
  const hasToolResult = c.some((b) => b?.type === "tool_result");
  return hasText && !hasToolResult;
}
function assistantText(e) {
  return contentBlocks(e).filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}
function extractTurnWindow(rawTranscript) {
  const lines = parseLines(rawTranscript);
  let boundary = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].isSidechain && isRealUser(lines[i])) {
      boundary = i;
      break;
    }
  }
  const mainWindow = lines.slice(boundary + 1).filter((e) => !e.isSidechain);
  let claimText = "";
  for (let i = mainWindow.length - 1; i >= 0; i--) {
    if (role(mainWindow[i]) === "assistant") {
      const t = assistantText(mainWindow[i]);
      if (t.trim()) {
        claimText = t;
        break;
      }
    }
  }
  const toolUses = [];
  for (const e of mainWindow) {
    if (role(e) !== "assistant") continue;
    for (const b of contentBlocks(e)) {
      if (b?.type === "tool_use") {
        let input = "";
        try {
          input = JSON.stringify(b.input ?? "").toLowerCase();
        } catch {
          input = "";
        }
        toolUses.push({ name: String(b.name ?? "").toLowerCase(), input });
      }
    }
  }
  return { claimText, toolUses };
}
var BG_COMPLETION_RE = /<status>\s*completed\s*<\/status>|background command[^<]{0,200}?completed\s*\(exit code/i;
function bgInFlightInWindow(rawTranscript) {
  const lines = parseLines(rawTranscript);
  let boundary = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].isSidechain && isRealUser(lines[i])) {
      boundary = i;
      break;
    }
  }
  const win = lines.slice(boundary + 1).filter((e) => !e.isSidechain);
  let launched = 0;
  let completed = 0;
  for (const e of win) {
    if (role(e) === "assistant") {
      for (const b of contentBlocks(e)) {
        const bb = b;
        if (bb?.type === "tool_use") {
          const inp = bb.input;
          if (inp && typeof inp === "object" && inp.run_in_background === true) launched++;
        }
      }
    }
    let serialized = "";
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = "";
    }
    if (serialized && BG_COMPLETION_RE.test(serialized)) completed++;
  }
  return launched > completed;
}
function bgCommandInFlight(rawTranscript) {
  const lines = parseLines(rawTranscript);
  let lastLaunchIdx = -1;
  let lastCompletionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    if (e.isSidechain) continue;
    if (role(e) === "assistant") {
      for (const b of contentBlocks(e)) {
        const bb = b;
        if (bb?.type !== "tool_use") continue;
        const nm = String(bb.name ?? "").toLowerCase();
        if (nm !== "bash" && nm !== "powershell") continue;
        const inp = bb.input;
        if (inp && typeof inp === "object" && inp.run_in_background === true) lastLaunchIdx = i;
      }
    }
    let serialized = "";
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = "";
    }
    if (serialized && BG_COMPLETION_RE.test(serialized)) lastCompletionIdx = i;
  }
  return lastLaunchIdx >= 0 && lastLaunchIdx > lastCompletionIdx;
}
var BG_RESULT_DONE_RE = /completed|came to rest|exit code|finished/i;
var BG_TAG_ID_RE = /<tool-use-id>([^<]+)<\/tool-use-id>/g;
function agentBgInFlightCount(rawTranscript) {
  const lines = parseLines(rawTranscript);
  const inFlight = /* @__PURE__ */ new Set();
  for (const e of lines) {
    if (e.isSidechain || role(e) !== "assistant") continue;
    for (const b of contentBlocks(e)) {
      const bb = b;
      if (bb?.type !== "tool_use") continue;
      const nm = String(bb.name ?? "").toLowerCase();
      if (nm !== "agent" && nm !== "task") continue;
      const inp = bb.input;
      if (!inp || typeof inp !== "object" || inp.run_in_background !== true) continue;
      const id = typeof bb.id === "string" ? bb.id : "";
      if (id) inFlight.add(id);
    }
  }
  if (inFlight.size === 0) return 0;
  for (const e of lines) {
    for (const b of contentBlocks(e)) {
      const bb = b;
      if (bb?.type !== "tool_result" || typeof bb.tool_use_id !== "string" || !inFlight.has(bb.tool_use_id)) continue;
      let content = "";
      try {
        content = typeof bb.content === "string" ? bb.content : JSON.stringify(bb.content ?? "");
      } catch {
        content = "";
      }
      if (BG_RESULT_DONE_RE.test(content)) inFlight.delete(bb.tool_use_id);
    }
    let serialized = "";
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = "";
    }
    if (serialized && BG_RESULT_DONE_RE.test(serialized)) {
      BG_TAG_ID_RE.lastIndex = 0;
      let m;
      while ((m = BG_TAG_ID_RE.exec(serialized)) !== null) inFlight.delete(m[1]);
    }
  }
  return inFlight.size;
}
var HOOK_INJECTION_RE = /^\s*(📋|👉|…ещё|\[specs-validator\]|⚠️|PHASE GATE WARNING|Stop hook feedback|UserPromptSubmit hook|<\/?task-notification|<(?:task-id|tool-use-id|output-file|status|summary)|\[SYSTEM NOTIFICATION|This is an automated|Do NOT interpret|[A-Za-z][\w.-]*:\s*\d+\s*(?:open|⏸))/u;
function lastUserPrompt(rawTranscript) {
  const lines = parseLines(rawTranscript);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].isSidechain || !isRealUser(lines[i])) continue;
    const allLines = assistantText(lines[i]).split(/\r?\n/);
    const firstNonEmpty = allLines.find((ln) => ln.trim()) ?? "";
    if (HOOK_INJECTION_RE.test(firstNonEmpty)) continue;
    const cleaned = allLines.filter((ln) => !HOOK_INJECTION_RE.test(ln)).join("\n").trim();
    if (cleaned) return cleaned;
  }
  return "";
}

// tools/claim-evidence-gate/claim_classifier.ts
function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/«[^»]{1,400}»/g, " ").replace(/"[^"]{1,400}"/g, " ").replace(/'[^']{1,400}'/g, " ");
}
function executorCount(tools) {
  return tools.filter(
    (t) => t.name === "bash" || t.name === "powershell" || t.name === "agent" || t.name === "task" || t.name.startsWith("mcp__")
  ).length;
}
function searchCount(tools) {
  return tools.filter(
    (t) => t.name === "grep" || t.name === "glob" || t.name === "websearch" || t.name === "webfetch" || t.name === "task" || t.name === "agent" || t.name.startsWith("mcp__octocode") || t.name.includes("search")
  ).length;
}
var VERDICT = /(\bPASS\b|\bFAIL\b|✅|❌|✔|✗|\bPASSED\b|\bFAILED\b|\bПРОЙДЕН|\bПРОВАЛЕН|\bПРОВАЛ\b)/g;
var ENUM_ITEM = /\b(?:q|item|scene|сцена|вопрос|пункт|вариант|case|кейс|тест|test)\s*\d+/gi;
function isAnalysisVerdict(text) {
  const verdictLines = text.split(/\r?\n/).filter((ln) => {
    VERDICT.lastIndex = 0;
    return VERDICT.test(ln);
  }).length;
  if (verdictLines >= 2) return true;
  const enums = (text.match(ENUM_ITEM) ?? []).length;
  const verdicts = (text.match(VERDICT) ?? []).length;
  return enums >= 2 && verdicts >= 2;
}
var WORKS_DONE = /(работает|заработал[оа]?|пофикшен[оа]?|починен[оа]?|фикс\s+(?:деплоен|задеплоен|готов|применён|применен)|вс[её]\s+ок|убит[оа]|works\b|deployed\b|all\s+good\b|fixed\b|тесты\s+(?:проходят|зелён)|зелёные\s+тесты|green\b)/i;
var NEG_BEFORE = /(?:^|[\s,;(])(не|ни|если|чтобы|пока|not|no|n['’]t|when|to\s+make)\s*$/i;
var WORKS_EXPLAINER = /^[\s:]*(так|следующим|вот\s+как|потому|because|like\s+this|as\s+follows)/i;
function isWorksDone(text) {
  const m = WORKS_DONE.exec(text);
  if (!m) return false;
  const before = text.slice(Math.max(0, m.index - 14), m.index);
  if (NEG_BEFORE.test(before)) return false;
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16);
  if (WORKS_EXPLAINER.test(after)) return false;
  return true;
}
var NOT_FOUND = /(не\s+нашёл|не\s+нашел|не\s+существует|нет\s+(?:такого|публичных|готового|готовых|решени)|архитектурно\s+невозможно|невозможно\s+(?:сделать|реализовать|починить)|единственный\s+способ|no\s+(?:public\s+)?solution|does(?:n['’]t|\s+not)\s+exist|architecturally\s+impossible|impossible\s+to)/i;
function isNotFound(text) {
  return NOT_FOUND.test(text);
}
var VERIFIED_MARKER = /\[VERIFIED\s+via\s+([^\]]{1,80})\]/i;
var SPEC_COMPLETION = new RegExp(
  [
    "(?:\u0441\u043F\u0435\u043A[\u0430\u0443\u0438]|\u0444\u0438\u0447[\u0430\u0443\u0438]|\u0444\u0438\u0447\u0430)\\s+(?:\u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E\\s+|\u0446\u0435\u043B\u0438\u043A\u043E\u043C\\s+)?(?:\u0433\u043E\u0442\u043E\u0432[\u0430\u043E]?|\u0437\u0430\u0432\u0435\u0440\u0448[\u0451\u0435]\u043D\\S*|\u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\\S*|\u0441\u0434\u0435\u043B\u0430\u043D\\S*|done|complete|finished)(?!\\s+\u043A\\s)",
    "(?:\u0432\u0441\u044F|\u0432\u0441\u0435)\\s+(?:\u0441\u043F\u0435\u043A\u0430|\u0444\u0438\u0447\u0430|\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\\S+|\u0440\u0430\u0431\u043E\u0442\u0430)\\s+(?:\u0433\u043E\u0442\u043E\u0432\\S*|\u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\\S*|\u0441\u0434\u0435\u043B\u0430\u043D\\S*|\u0437\u0430\u043A\u0440\u044B\u0442\\S*|\u0437\u0430\u0432\u0435\u0440\u0448\\S*)",
    "\u0432\u0441\u0435\\s+\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\\S+\\s+(?:\u0433\u043E\u0442\u043E\u0432\\S*|\u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\\S*|\u0441\u0434\u0435\u043B\u0430\u043D\\S*|\u0437\u0430\u043A\u0440\u044B\u0442\\S*|\u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\\S*)",
    "(?:the\\s+)?(?:spec|feature|all\\s+requirements)\\s+(?:is\\s+|are\\s+)?(?:fully\\s+)?(?:done|complete|finished|shipped)\\b"
  ].join("|"),
  "i"
);
function isSpecCompletionClaim(text) {
  return SPEC_COMPLETION.test(stripCode(text));
}
function classify(rawText) {
  const text = stripCode(rawText);
  const hits = [];
  const vm = VERIFIED_MARKER.exec(rawText);
  if (vm) hits.push({ cls: "verified-marker", need: `\u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u0437\u043E\u0432 \xAB${vm[1].trim()}\xBB \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435`, detail: vm[1].trim() });
  if (isAnalysisVerdict(text)) {
    hits.push({ cls: "analysis-verdict", need: "\u0437\u0430\u043F\u0443\u0441\u043A \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430 (Bash/Task/MCP), \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0440\u0435\u0430\u043B\u044C\u043D\u043E \u043F\u043E\u0440\u043E\u0434\u0438\u043B \u044D\u0442\u0438 \u0432\u0435\u0440\u0434\u0438\u043A\u0442\u044B" });
  }
  if (isWorksDone(text)) {
    hits.push({ cls: "works-done", need: "\u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0433\u043E\u043D (\u0442\u0435\u0441\u0442\u044B/\u0437\u0430\u043F\u0443\u0441\u043A) \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435" });
  }
  if (isNotFound(text)) {
    hits.push({ cls: "not-found-impossible", need: "\u22652 \u043F\u043E\u0438\u0441\u043A\u043E\u0432\u044B\u0445 \u0432\u044B\u0437\u043E\u0432\u0430 (Grep/Glob/WebSearch/octocode) \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435" });
  }
  return hits;
}
var MIN_SEARCH_DEFAULT = 2;
function evidenceSatisfied(hit, tools, minSearch = MIN_SEARCH_DEFAULT) {
  switch (hit.cls) {
    case "analysis-verdict":
    case "works-done":
      return executorCount(tools) >= 1;
    case "not-found-impossible":
      return searchCount(tools) >= minSearch;
    case "verified-marker": {
      const tokens = (hit.detail ?? "").toLowerCase().match(/[a-zа-яё0-9]{3,}/g) ?? [];
      if (tokens.length === 0) return true;
      return tools.some((t) => tokens.some((tok) => t.name.includes(tok) || t.input.includes(tok)));
    }
    default:
      return true;
  }
}
function firstUnsupported(rawText, tools, minSearch = MIN_SEARCH_DEFAULT) {
  for (const hit of classify(rawText)) {
    if (!evidenceSatisfied(hit, tools, minSearch)) return hit;
  }
  return null;
}

// tools/spec-graph/task-census.ts
import fs2 from "node:fs";
import path2 from "node:path";
var CACHE_REL = path2.join(".dev-pomogator", ".task-census.json");
var PREV_REL = path2.join(".dev-pomogator", ".task-census.prev.json");
function taskCensusCachePath(repoRoot) {
  return path2.join(repoRoot, CACHE_REL);
}
function scopeCensusToSlugs(census, slugs) {
  const specs = census.specs.filter((s) => slugs.has(s.slug));
  const total = specs.reduce(
    (acc, s) => ({ open: acc.open + s.open, doneRed: acc.doneRed + s.doneRed, doneUnrun: acc.doneUnrun + s.doneUnrun }),
    { open: 0, doneRed: 0, doneUnrun: 0 }
  );
  return { total, specs };
}
function liveOpenForUncensusedSlugs(repoRoot, editedSlugs, census) {
  const known = new Set((census?.specs ?? []).map((s) => s.slug));
  let open = 0;
  for (const slug of editedSlugs) {
    if (known.has(slug)) continue;
    try {
      const txt = fs2.readFileSync(path2.join(repoRoot, ".specs", slug, "TASKS.md"), "utf-8");
      for (const line of txt.split("\n")) {
        if (/^- \[ \]/.test(line) && !line.includes("{")) open++;
      }
    } catch {
    }
  }
  return open;
}
var SPEC_PATH_RE = /\.specs[/\\]([a-z0-9][a-z0-9._-]*)[/\\]/i;
var RAW_WRITE_TOOL_RE = /^(edit|write|multiedit|notebookedit)$/i;
var DOOR_WRITE_TOOL_RE = /(?:^|__)(apply_spec_change|create_spec|delete_spec_doc|rename_spec_doc|set_entity_status|archive_spec)$/i;
function sessionEditedSpecSlugs(transcriptPath) {
  const slugs = /* @__PURE__ */ new Set();
  let raw;
  try {
    raw = fs2.readFileSync(transcriptPath, "utf-8");
  } catch {
    return slugs;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"tool_use"') || line.length > 2e6) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "tool_use") continue;
      const name = String(b.name ?? "");
      const input = b.input ?? {};
      if (DOOR_WRITE_TOOL_RE.test(name)) {
        if (typeof input.doc === "string" && input.doc.endsWith(".feature")) continue;
        if (typeof input.spec === "string") slugs.add(input.spec);
        else if (typeof input.slug === "string") slugs.add(input.slug);
        continue;
      }
      if (RAW_WRITE_TOOL_RE.test(name) && typeof input.file_path === "string") {
        if (input.file_path.endsWith(".feature")) continue;
        const m = input.file_path.match(SPEC_PATH_RE);
        if (m) slugs.add(m[1]);
      }
    }
  }
  return slugs;
}
function lastEditedSpecSlug(transcriptPath) {
  let last = null;
  let raw;
  try {
    raw = fs2.readFileSync(transcriptPath, "utf-8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"tool_use"') || line.length > 2e6) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "tool_use") continue;
      const name = String(b.name ?? "");
      const input = b.input ?? {};
      if (DOOR_WRITE_TOOL_RE.test(name)) {
        if (typeof input.doc === "string" && input.doc.endsWith(".feature")) continue;
        if (typeof input.spec === "string") last = input.spec;
        else if (typeof input.slug === "string") last = input.slug;
        continue;
      }
      if (RAW_WRITE_TOOL_RE.test(name) && typeof input.file_path === "string") {
        if (input.file_path.endsWith(".feature")) continue;
        const m = input.file_path.match(SPEC_PATH_RE);
        if (m) last = m[1];
      }
    }
  }
  return last;
}
var OPEN_TODO_STATUS = /* @__PURE__ */ new Set(["pending", "in_progress"]);
function parseAgentTodos(transcriptPath) {
  let raw;
  try {
    raw = fs2.readFileSync(transcriptPath, "utf-8");
  } catch {
    return [];
  }
  const tasks = [];
  let latestTodoWrite = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"tool_use"') || line.length > 2e6) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "tool_use") continue;
      const name = String(b.name ?? "");
      const input = b.input ?? {};
      if (name === "TodoWrite" && Array.isArray(input.todos)) {
        latestTodoWrite = input.todos.map((t) => ({
          subject: String(t?.content ?? t?.subject ?? ""),
          status: String(t?.status ?? "")
        }));
      } else if (name === "TaskCreate") {
        tasks.push({ subject: String(input.subject ?? ""), status: "pending" });
      } else if (name === "TaskUpdate") {
        const id = parseInt(String(input.taskId ?? ""), 10);
        if (Number.isInteger(id) && id >= 1 && id <= tasks.length && typeof input.status === "string") {
          tasks[id - 1].status = input.status;
        }
      }
    }
  }
  const taskOpen = tasks.filter((t) => OPEN_TODO_STATUS.has(t.status)).length;
  const todoOpen = latestTodoWrite ? latestTodoWrite.filter((t) => OPEN_TODO_STATUS.has(t.status)).length : 0;
  return latestTodoWrite && todoOpen > taskOpen ? latestTodoWrite : tasks;
}
function agentOpenTodoCount(transcriptPath) {
  return parseAgentTodos(transcriptPath).filter((t) => OPEN_TODO_STATUS.has(t.status)).length;
}
function agentNextOpenTodo(transcriptPath) {
  const next = parseAgentTodos(transcriptPath).find((t) => OPEN_TODO_STATUS.has(t.status));
  const s = next?.subject?.trim();
  return s ? s : null;
}
function readCacheFile(p) {
  try {
    const parsed = JSON.parse(fs2.readFileSync(p, "utf-8"));
    if (!parsed?.total || typeof parsed.total.open !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
function readTaskCensusCache(repoRoot) {
  return readCacheFile(taskCensusCachePath(repoRoot));
}

// tools/claim-evidence-gate/meridian-judge.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
var MODEL_OVERRIDE = process.env.CLAIM_GATE_JUDGE_MODEL;
var TIMEOUT_MS = 6e3;
function logUnavailable(reason) {
  try {
    process.stderr.write(`[claim-evidence-gate] judge: \u043F\u043E\u043C\u043E\u0433\u0430\u0442\u043E\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 ${reason}
`);
  } catch {
  }
}
var dotenvLoaded = false;
function ensureDotenvLoaded() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  for (const name of [".env", ".env.local", ".env.test"]) {
    try {
      const p = path3.join(process.cwd(), name);
      if (!fs3.existsSync(p)) continue;
      for (const raw of fs3.readFileSync(p, "utf-8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    } catch {
    }
  }
}
function resolveEndpoint(injectedEnv) {
  let env;
  if (injectedEnv) {
    env = injectedEnv;
  } else {
    ensureDotenvLoaded();
    env = process.env;
  }
  const judgeKey = env.CLAIM_GATE_JUDGE_KEY;
  if (judgeKey) {
    return {
      url: env.CLAIM_GATE_JUDGE_URL ?? "https://openrouter.ai/api/v1",
      key: judgeKey,
      model: MODEL_OVERRIDE ?? "anthropic/claude-haiku-4.5"
    };
  }
  const orKey = env.OPENROUTER_API_KEY || env.CLAUDE_MEM_OPENROUTER_API_KEY;
  if (orKey) {
    return { url: "https://openrouter.ai/api/v1", key: orKey, model: MODEL_OVERRIDE ?? "anthropic/claude-haiku-4.5" };
  }
  const acKey = env.AUTO_COMMIT_API_KEY;
  if (acKey) {
    return {
      url: env.AUTO_COMMIT_LLM_URL ?? "https://aipomogator.ru/go/v1",
      key: acKey,
      model: MODEL_OVERRIDE ?? "openrouter/anthropic/claude-haiku-4.5"
    };
  }
  return null;
}
function judgeAvailable() {
  return resolveEndpoint() !== null;
}
function buildJudgeNoTokenDemand(openWork) {
  return `\u0423\u043C\u043D\u044B\u0439 Stop-\u0441\u0443\u0434\u044C\u044F \u0412\u042B\u041A\u041B\u042E\u0427\u0415\u041D \u2014 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u0442\u043E\u043A\u0435\u043D \u0430\u0438\u043F\u043E\u043C\u043E\u0433\u0430\u0442\u043E\u0440\u0430, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u043F\u0438\u043D\u0430\u0442\u043E\u0440 \u043D\u0435 \u043B\u043E\u0432\u0438\u0442 \u0445\u0438\u0442\u0440\u044B\u0435 \u043B\u0435\u043D\u0438\u0432\u044B\u0435 \u0441\u0442\u043E\u043F\u044B (\u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B ${openWork}). \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438 \u041E\u0414\u0418\u041D \u0438\u0437 \u043A\u043B\u044E\u0447\u0435\u0439 (\u0432 .env \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0438\u043B\u0438 env): AUTO_COMMIT_API_KEY=<key> (endpoint https://aipomogator.ru/go/v1), \u043B\u0438\u0431\u043E OPENROUTER_API_KEY=<key>, \u043B\u0438\u0431\u043E CLAIM_GATE_JUDGE_KEY=<key>. \u041F\u043E\u043A\u0430 \u0442\u043E\u043A\u0435\u043D \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u2014 \u043F\u0438\u043D\u0430\u0442\u043E\u0440 \u0442\u043E\u043B\u044C\u043A\u043E \u041F\u0420\u0415\u0414\u0423\u041F\u0420\u0415\u0416\u0414\u0410\u0415\u0422 (\u043D\u0435 \u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0435\u0442), \u0430 \u0443\u043C\u043D\u044B\u0439 \u0441\u0443\u0434\u044C\u044F \u043C\u043E\u043B\u0447\u0438\u0442. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438 \u0442\u043E\u043A\u0435\u043D, \u0447\u0442\u043E\u0431\u044B \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0435\u0433\u043E (\u0441\u043E\u0432\u0441\u0435\u043C \u0443\u0431\u0440\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435: CLAIM_GATE_ENABLED=false).`;
}
function isJudgeArmed(o) {
  if (!o.judgeEnabled || !o.gray) return false;
  return o.hasNextBlock || !o.analysisOnly && o.openWork > 0;
}
function buildJudgePrompt(i) {
  const mut = i.mutatingToolsThisTurn ?? null;
  return [
    "You are a STOP-GATE judge for an AI coding agent that just ENDED its turn.",
    "Decide ONE thing: did it STOP while it still had a concrete next step it could do RIGHT NOW with no blocker? If yes \u2192 BLOCK (kick it). If it is genuinely done / answering the user / truly blocked / legitimately awaiting an async result \u2192 APPROVE.",
    "",
    "OBSERVABLE FACTS \u2014 the hook gathered these from the transcript + repo; the agent did NOT author them. WEIGH THESE FIRST; the message text below is secondary narrative the agent CAN polish to pass you:",
    `- mutating tool calls THIS turn (Edit/Write/Bash/door-writes): ${mut === null ? "unknown" : mut}`,
    `- background task launched THIS turn (agent may be awaiting an async callback): ${i.bgTaskLaunchedThisTurn ? "YES" : "no"}`,
    `- the named next step CONSUMES the pending bg result (can't run until it lands \u2014 deterministic hint): ${i.nextStepAwaitsResult ? "YES" : "no"}`,
    `- open/unfinished tasks in THIS SESSION's scope: ${i.openTasks}`,
    `- NEXT OPEN TASK already identified for the agent (so the next step is NAMED, not unknown): ${i.nextOpenTask ? `\xAB${i.nextOpenTask.title}\xBB [${i.nextOpenTask.id}]` : "none"}`,
    `- session touched MULTIPLE specs: ${i.multiSpecSession ? "YES" : "no"} (NOT a license to ask the user \xABwhich to do first\xBB \u2014 the agent STILL picks the NEXT OPEN TASK above and does it)`,
    `- tool names this turn: ${i.tools.length ? i.tools.join(", ") : "none"}`,
    `- the user's LAST request (what they actually asked for): ${i.userRequest ? i.userRequest.replace(/\s+/g, " ").slice(0, 240) : "unknown"}`,
    `- this turn EDITED the gate's OWN enforcement files (claim-evidence-gate / judge / task-census / spec-status / bench / .spec-status): ${i.gateSelfEditThisTurn ? "YES" : "no"}`,
    `- this turn SELF-marked its own work blocked/backlog (set a task BLOCKED / parked a spec backlog): ${i.selfMarkedBlockedOrBacklogThisTurn ? "YES" : "no"}`,
    "",
    `AGENT'S FINAL MESSAGE (secondary \u2014 may be written to look done):
${i.finalMessage}`,
    "",
    "BLOCK if the message does ANY of these. Mutating tools this turn do NOT license stopping with known work left \u2014 doing some work then announcing-and-stopping is exactly the lazy stop you catch:",
    "- WEAKENING THE GATE instead of doing the task: \xABthis turn edited the gate's own files\xBB is YES AND the user's LAST request is NOT \u043F\u0440\u043E the gate \u2014 the agent diverted into editing the ENFORCEMENT itself (so it stops firing) instead of the real task \u2192 BLOCK \xAB\u043D\u0435 \u043F\u0440\u0430\u0432\u044C \u0441\u0442\u043E\u0440\u043E\u0436, \u0434\u0435\u043B\u0430\u0439 \u0437\u0430\u0434\u0430\u0447\u0443\xBB. IMPORTANT EXCEPTION: if the user's LAST request IS \u043F\u0440\u043E the gate/pinator (\xAB\u0444\u0438\u043A\u0441\u0438/\u043F\u043E\u0447\u0438\u043D\u0438/\u0443\u0441\u0438\u043B\u044C \u043F\u0438\u043D\u0430\u0442\u043E\u0440\xBB, \xABfix the gate\xBB, \xAB\u0434\u043E\u0434\u0435\u043B\u0430\u0439 \u0441\u0443\u0434\u044C\u044E\xBB), editing the gate IS the assigned task \u2192 this rule does NOT apply, judge it like any other work (in-flight continuation \u2192 APPROVE). (Self-marking one's OWN work blocked/backlog is covered by SELF-AUTHORIZED SKIP below.)",
    '- NAMES a NEW/next unit/file/step and the turn ENDS without doing it \u2014 even phrased present-tense ("\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0431\u0435\u0440\u0443 X", "\u0434\u0430\u043B\u044C\u0448\u0435 X", "\u043D\u0430\u0447\u0438\u043D\u0430\u044E \u0441\u2026", "\u0437\u0430\u043F\u0443\u0441\u043A\u0430\u044E X \u0441\u0435\u0439\u0447\u0430\u0441" then stops). Announcing a NEW unit is named-next even if it says "\u0441\u0435\u0439\u0447\u0430\u0441"; only continuing the SAME step already underway is in-flight (see APPROVE).',
    '- DEFERS remaining work to later passes/turns ("\u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0445\u043E\u0434\u043E\u0432", "\u0437\u0430 \u0440\u0430\u0437 \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u044C", "\u0432 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C \u0445\u043E\u0434\u0435", "\u0432\u0435\u0434\u0443 \u0434\u0430\u043B\u044C\u0448\u0435" as a sign-off).',
    '- FAKE HAND-OFF: hands the next ACTION or a task PICK to the user ("\u0441\u043A\u0430\u0436\u0435\u0448\u044C \u2014 \u0441\u0434\u0435\u043B\u0430\u044E", "\u0440\u0435\u0448\u0430\u0442\u044C \u0442\u0435\u0431\u0435", "\u0436\u0434\u0443 \u0442\u0432\u043E\u0435\u0433\u043E \u0441\u043B\u043E\u0432\u0430", "\u043D\u0430\u0437\u043E\u0432\u0438 \u0437\u0430\u0434\u0430\u0447\u0443", "\u043A\u0430\u043A\u0443\u044E \u0432\u0437\u044F\u0442\u044C", "\u0447\u0442\u043E \u0431\u0440\u0430\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u043C", "\u0442\u0432\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442") to avoid working. When a NEXT OPEN TASK is identified above, asking "which task / which spec should I take or prioritize FIRST?" is NEVER genuine \u2014 the agent PICKS that offered task itself and does it. This bans only TASK/SPEC PRIORITIZATION asks \u2014 choosing WHICH of the offered open tasks to do first, within ONE spec OR across MULTIPLE specs (owner 2026-06-25 \xAB\u0447\u0442\u043E \u0431\u0440\u0430\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u043C \u2014 \u043D\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u0434\u043B\u044F \u044E\u0437\u0435\u0440\u0430\xBB). It does NOT ban a genuine DESIGN choice / irreversible trade-off (e.g. \xABPostgres \u0438\u043B\u0438 Mongo?\xBB, \xAB\u0432 \u043F\u0440\u043E\u0434\u0435 \u0438\u043B\u0438 \u043D\u0435\u0442?\xBB) \u2014 that IS a real owner-decision \u2192 APPROVE (see below).',
    "- Claims the WHOLE spec/feature is done/shipped while scope-open tasks remain.",
    '- ENDS on a PAST-tense STATUS / SUMMARY of work just DONE ("\u0441\u0434\u0435\u043B\u0430\u043B X", "\u0433\u043E\u0442\u043E\u0432\u043E N \u0438\u0437 M", "\u0437\u0430\u043A\u043E\u043C\u043C\u0438\u0442\u0438\u043B", "\u043F\u0435\u0440\u0435\u043A\u043B\u0438\u0447\u043A\u0430 \u0437\u0435\u043B\u0451\u043D\u0430\u044F") while OPEN TASKS REMAIN, even with NO next step named. A proactive status-and-stop while work is left is THE bypass; reporting finished progress is not finishing. (NOT the same as a present-tense continuation of the current step \u2014 see in-flight in APPROVE.) IMPORTANT EXCEPTION: when the user asked for ANALYSIS / REPORT / REVIEW only, a past-tense \xAB\u0440\u0430\u0437\u0431\u043E\u0440 \u0433\u043E\u0442\u043E\u0432 / \u043E\u0442\u0447\u0451\u0442 \u0433\u043E\u0442\u043E\u0432\xBB IS the requested deliverable, NOT lazy status \u2192 APPROVE via the analysis carve-out below.',
    `- SELF-AUTHORIZED SKIP (\u043E\u0442\u043C\u0430\u0437\u043A\u0430 \u043F\u043E\u0434 \u0432\u0438\u0434\u043E\u043C \u043F\u0440\u0438\u043D\u0446\u0438\u043F\u0430): on its OWN authority decides that remaining IN-SCOPE, DOABLE work should be skipped / kept / left-undone, DRESSED AS PRINCIPLE \u2014 "\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E X", "\u044D\u0442\u043E keep-\u043A\u043B\u0430\u0441\u0441", "\u043D\u0435 \u0438\u043C\u0435\u0435\u0442 \u0441\u043C\u044B\u0441\u043B\u0430 \u043C\u0438\u0433\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "\u0433\u043E\u043D\u044F\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u043E\u0432 = \u0441\u043B\u0438\u0432 \u0442\u043E\u043A\u0435\u043D\u043E\u0432", "\u044D\u0442\u043E out of scope" BY THE AGENT'S OWN JUDGMENT. The agent is NOT the scope authority. A reasoned "\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E/keep X because Y" is STILL a lazy stop when X is doable and in scope \u2014 well-argued laziness is the trickiest bypass. This ALSO covers the agent DECLARING its own work \xAB\u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E / \u043E\u0442\u043B\u043E\u0436\u0435\u043D\u043E / parked / backlog / \u043D\u0435 \u0434\u0435\u043B\u0430\u0435\u0442\u0441\u044F\xBB on its OWN say-so \u2014 a self-declared blocker is the agent's UNVERIFIABLE claim (the same class as the fabricated blocker), a real reason to stop ONLY with a verifiable EXTERNAL blocker (evidence the agent could not fabricate) OR the owner's words. \u2192 BLOCK: DO the work. EXCEPTIONS (NOT a self-skip): (a) the user asked for ANALYSIS/REPORT/REVIEW only, so "\u0440\u0435\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044E \u043D\u0435 \u0442\u0440\u043E\u0433\u0430\u044E" is the CORRECT scope \u2192 see the analysis carve-out; (b) the OWNER's OWN words (the fact above) scoped X out \u2192 see the owner-directed carve-out.`,
    "",
    `APPROVE only if ONE clearly holds (scope-open tasks: ${i.openTasks} \u2014 weigh it hard):`,
    "- ANSWERING the user, or asking ONE GENUINE owner-decision \u2014 a fork ONLY the owner can resolve: a design choice or an irreversible trade-off (data loss, prod, public release). A real back-and-forth, NOT a self-initiated sign-off. \xABWhich task / which spec to do or prioritize FIRST\xBB is NOT such a fork \u2014 the agent picks the NEXT OPEN TASK itself and does it (owner 2026-06-25 \xAB\u0447\u0442\u043E \u0431\u0440\u0430\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u043C \u2014 \u043D\u0435 \u0432\u043E\u043F\u0440\u043E\u0441 \u0434\u043B\u044F \u044E\u0437\u0435\u0440\u0430\xBB). Prioritizing among offered open work \u2014 within one spec OR across specs \u2014 is never the user's call.",
    `- ANALYSIS/REPORT/PLAN/REVIEW the user EXPLICITLY asked for: if the user's LAST request (fact above) was for analysis / report / plan / review ONLY \u2014 NOT "implement / fix / build / migrate / \u0434\u0435\u043B\u0430\u0439" \u2014 then a stop that DELIVERS that analysis is CORRECT \u2192 APPROVE. This HOLDS even if it ends by handing the decision back to the owner (\xAB\u0436\u0434\u0443 \u0442\u0432\u043E\u0435\u0433\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F\xBB, \xAB\u0447\u0442\u043E \u0447\u0438\u043D\u0438\u0442\u044C \u043F\u0435\u0440\u0432\u044B\u043C \u2014 \u0440\u0435\u0448\u0430\u0439 \u0442\u044B\xBB): when the user scoped the turn to analysis-only (\xAB\u043F\u043E\u043A\u0430 \u043D\u0435 \u0447\u0438\u043D\u0438\xBB), the agent CANNOT implement (out of scope), so returning the next decision to the owner is the correct end, NOT a fake prioritization hand-off. (Factual claims in it still need a proof or an explicit [UNVERIFIED], but no further WORK is owed.)`,
    "- TRULY blocked: the next step needs an external input ONLY the owner can give (a credential / access / secret only they hold, a no-safe-default decision) AND the message SHOWS the agent already tried its own options (a tried-and-failed attempt, a shown 401 / dead-end) \u2192 APPROVE. A genuine \xABI tried X, Y, Z \u2014 all failed, need your token\xBB is a legitimate stop. (The bare version \u2014 \xAB\u043D\u0443\u0436\u0435\u043D \u0442\u0432\u043E\u0439 X\xBB / \xAB\u044D\u0442\u043E \u0437\u0430 \u0442\u043E\u0431\u043E\u0439\xBB / \xAB\u0442\u043E\u043B\u044C\u043A\u043E \u0442\u044B \u0441\u043D\u0438\u043C\u0435\u0448\u044C\xBB for a FIXABLE thing with NO shown attempt \u2014 is the OPPOSITE: a self-declared blocker offloaded onto the owner, caught by SELF-AUTHORIZED SKIP above \u2192 BLOCK \xAB\u0434\u0435\u043B\u0430\u0439 \u0441\u0430\u043C\xBB.)",
    `- SKIP DIRECTED BY THE OWNER (VERIFIABLE): the skip is backed by the OWNER'S OWN words \u2014 the user's LAST request (fact above) explicitly scoped X out ("\u0434\u0435\u0440\u0436\u0438 X \u0432\u043D\u0435 \u0441\u043A\u043E\u0443\u043F\u0430", "owner scoped X out", "X \u2014 \u043D\u0435 \u0442\u0432\u043E\u044F \u0437\u0430\u0434\u0430\u0447\u0430"). That is the OWNER deciding, verifiable in the fact, not the agent's unverifiable claim \u2192 APPROVE. But: the agent merely ASKING "do X or skip it, it's doable but costly?" is NOT this carve-out \u2014 doable in-scope work is just DONE, not negotiated down \u2192 BLOCK. And a bare "\u0442\u044B \u0441\u043A\u0430\u0437\u0430\u043B \u0432\u043D\u0435 \u0441\u043A\u043E\u0443\u043F\u0430" with NO matching owner-words in the fact is an unverifiable claim \u2192 BLOCK.`,
    '- LEGITIMATELY AWAITING ASYNC: the "background task launched THIS turn" fact is YES and the message is waiting for that result. APPROVE when EITHER (i) it names NO other concrete next task ("\u0436\u0434\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442, \u0441\u0430\u043C \u043F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0435 \u043C\u043E\u0433\u0443"), OR (ii) the named next step CONSUMES that pending result \u2014 the fact "named next step consumes the pending bg result" is YES, or the text says it will act WHEN/IF the result lands ("\u043A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u0434\u0451\u0442 \u2014 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u044E/\u043A\u043E\u043C\u043C\u0438\u0447\u0443", "\u0435\u0441\u043B\u0438 19/19 \u2014 \u043A\u043E\u043C\u043C\u0438\u0447\u0443", "\u043F\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443 \u0441\u0432\u0435\u0440\u044E"). A result-dependent next step CANNOT run until the callback fires, so it is a legit wait, NOT announce-and-stop \u2192 APPROVE. But WAITING IS NOT A BLANKET LICENSE: if it names a SEPARATE next task it could do NOW that does NOT need the bg result ("\u0432\u043E\u0437\u044C\u043C\u0443 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u2014 X", "\u0434\u0430\u043B\u044C\u0448\u0435 \u0431\u0435\u0440\u0443 Y", "\u0435\u0441\u043B\u0438 \u043D\u0435 \u0441\u043A\u0430\u0436\u0435\u0448\u044C \u0438\u043D\u0443\u044E \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u043D\u043E\u0441\u0442\u044C"), that is announce-and-stop \u2192 BLOCK \u2014 do that non-blocking work now.',
    '- IN-FLIGHT CONTINUATION of the CURRENT step right now: present-tense "doing it this moment" on an action already underway ("\u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u044E \u043F\u0440\u043E\u0433\u043E\u043D \u0441\u0435\u0439\u0447\u0430\u0441", "\u0434\u043E\u0447\u0438\u0442\u044B\u0432\u0430\u044E", "\u0433\u043E\u043D\u044F\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0441\u0435\u0439\u0447\u0430\u0441") that names NO new deferred unit and is NOT a past-tense done-report \u2192 APPROVE. Being mid-action is correct, not lazy \u2014 even with open tasks.',
    "- Genuinely NOTHING left: scope shows ZERO open tasks AND the message is a clean done.",
    "",
    `Tie-breaker: named-next that it could do NOW (even "X \u0441\u0435\u0439\u0447\u0430\u0441", and even while "waiting for a background task" \u2014 a SEPARATE task that does NOT need the bg result is announce-and-stop) / deferred-to-later / handed-to-user-to-pick-WHICH-task-or-WHICH-spec-to-do-first (the agent picks the NEXT OPEN TASK itself, never asks) / self-authorized SKIP of doable in-scope work (agent decided to keep/skip on its own, however well-argued) / OFFLOADING a FIXABLE thing onto the owner (\xAB\u043D\u0443\u0436\u0435\u043D \u0442\u0432\u043E\u0439 X\xBB / \xAB\u044D\u0442\u043E \u0437\u0430 \u0442\u043E\u0431\u043E\u0439\xBB with NO shown attempt to do it itself \u2014 handled as the negative of TRULY-blocked) / WEAKENING the gate (edited the gate's own files when the task is something ELSE; self-marking own work blocked/backlog) / PAST-tense status-while-open \u2192 BLOCK, no matter how many tools ran. APPROVE only: answering-the-user / one genuine owner-decision (design fork / irreversible trade-off / owner-directed-or-owner-ASKED skip) / truly-blocked / awaiting-async (bg launched THIS turn \u2014 incl. a next step that CONSUMES the pending result, e.g. "\u043A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u0434\u0451\u0442 \u2014 \u043A\u043E\u043C\u043C\u0438\u0447\u0443", which can't run until it lands) / PRESENT-tense in-flight continuation of the SAME current step / scope-is-ZERO-and-done. Decider when ambiguous: is a CURRENT action explicitly in progress right now (continuation), or is this a finished report / a NEW unit named? in-progress \u2192 APPROVE; finished-or-new \u2192 BLOCK.`,
    "",
    'Respond with ONLY one JSON line: {"block": true|false, "reason": "<=12 words"}'
  ].join("\n");
}
async function judgeStop(input, opts = {}) {
  if (typeof fetch !== "function") {
    logUnavailable("\u0432 \u044D\u0442\u043E\u043C \u0440\u0430\u043D\u0442\u0430\u0439\u043C\u0435 \u043D\u0435\u0442 global fetch (\u0441\u0442\u0430\u0440\u044B\u0439 Node)");
    return null;
  }
  const ep = resolveEndpoint();
  if (!ep) {
    logUnavailable("\u043D\u0435\u0442 \u0442\u043E\u043A\u0435\u043D\u0430 \u2014 \u0437\u0430\u0434\u0430\u0439 OPENROUTER_API_KEY \u0438\u043B\u0438 AUTO_COMMIT_API_KEY (env \u0438\u043B\u0438 .env/.env.test)");
    return null;
  }
  const base = (opts.url ?? ep.url).replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${ep.key}` },
      body: JSON.stringify({
        model: ep.model,
        max_tokens: 120,
        temperature: 0,
        messages: [{ role: "user", content: buildJudgePrompt(input) }]
      })
    });
    if (!r.ok) {
      logUnavailable(`HTTP ${r.status} ${r.statusText} \u043E\u0442 ${base} (\u043C\u043E\u0434\u0435\u043B\u044C ${ep.model})`);
      return null;
    }
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[^{}]*"block"[^{}]*\}/);
    if (!m) {
      logUnavailable(`\u043E\u0442\u0432\u0435\u0442 \u0431\u0435\u0437 JSON-\u0432\u0435\u0440\u0434\u0438\u043A\u0442\u0430 \u043E\u0442 ${base}`);
      return null;
    }
    const v = JSON.parse(m[0]);
    if (typeof v.block !== "boolean") {
      logUnavailable(`\u0432 \u0432\u0435\u0440\u0434\u0438\u043A\u0442\u0435 \u043F\u043E\u043B\u0435 block \u043D\u0435 boolean (${base})`);
      return null;
    }
    return { block: v.block, reason: typeof v.reason === "string" ? v.reason : "judge verdict" };
  } catch (e) {
    const msg = e instanceof Error ? e.name === "AbortError" ? `\u0442\u0430\u0439\u043C\u0430\u0443\u0442 ${opts.timeoutMs ?? TIMEOUT_MS}ms` : e.message : String(e);
    logUnavailable(`${msg} (${base})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// tools/claim-evidence-gate/game_guard_facts.ts
var MUTATING_TOOL = /^(edit|write|multiedit|notebookedit|bash|powershell)$/i;
var isDoorWrite = /^mcp__.*__(apply_spec_change|create_spec|delete_spec_doc|rename_spec_doc|set_entity_status|archive_spec)$/;
var GATE_OWN_FILE = /claim.?evidence.?gate|meridian.?judge|turn_window|claim_classifier|task.?census|spec.?status.?store|judge.?bench|\.spec-status/i;
var isMutatingOrDoor = (name) => MUTATING_TOOL.test(name) || isDoorWrite.test(name);
function gateSelfEdit(toolUses) {
  return toolUses.some((t) => isMutatingOrDoor(t.name) && GATE_OWN_FILE.test(JSON.stringify(t.input ?? {})));
}
function selfMarkedBlockedOrBacklog(toolUses) {
  return toolUses.some((t) => {
    const blob = JSON.stringify(t.input ?? {});
    if (/set_(?:spec|entity)_status/i.test(t.name) && /backlog/i.test(blob)) return true;
    return isMutatingOrDoor(t.name) && /TASKS\.md/i.test(blob) && /Status:\s*BLOCKED/i.test(blob);
  });
}

// tools/claim-evidence-gate/claim_evidence_gate_stop.ts
var MARKER_DIR = ".dev-pomogator";
var MARKER_FILENAME = ".claim-evidence-gate-marker.json";
var FIRES_FILENAME = ".claim-evidence-gate-fires.jsonl";
var SELF_MARKER = "claim-evidence-gate";
var LOG_PREFIX = "CLAIM-EVIDENCE-GATE";
var GRAY_SIGNAL = /(готов|сделал|закоммич|закрыл|реализова|продолж|дальше|двину|перехож|беру|next\b|done\b|commit|fixed|finish|ship|complete|wrap)/i;
var BLOCKER_SIGNAL = /(жду\b|ожида\w*|заблокирован\w*|заблокировал\w*|держит\s+(?:друг|параллел|чуж)|параллельн\w*\s+сесси\w*|нельзя\s+(?:тронуть|трогать|править)|blocked\b|waiting\s+on\b|held\s+by\b|can'?t\s+touch)/i;
var NEXT_SECTION_RE = /(?:^|\n)[ \t]{0,4}(?:#{1,6}[ \t]*|\*\*[ \t]*|[-*][ \t]+)?(?:(?:что[ \t-]+)?дальше|следующ(?:ий|ие)[ \t]+шаг|next[ \t]+steps?\b|next[ \t]*:)/i;
function log2(level, message) {
  log(level, LOG_PREFIX, message);
}
function getConfig() {
  const mode = (process.env.CLAIM_GATE_ENABLED ?? "true").toLowerCase();
  return {
    mode: mode === "false" ? "false" : mode === "shadow" ? "shadow" : "true",
    cooldownMinutes: parseInt(process.env.CLAIM_GATE_COOLDOWN_MINUTES || "2", 10) || 2,
    maxRetries: parseInt(process.env.CLAIM_GATE_MAX_RETRIES || "2", 10) || 2,
    minSearch: parseInt(process.env.CLAIM_GATE_MIN_SEARCH || "2", 10) || 2,
    // FR-11: release after this many CONSECUTIVE zero-tool kicks (the agent is spinning on narrative,
    // doing no observable work). Bounds the loop by work-delta, not the time-delta cooldown cap.
    noProgressCap: parseInt(process.env.CLAIM_GATE_NO_PROGRESS_CAP || "3", 10) || 3
  };
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
function approve() {
  process.stdout.write("{}");
}
function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
}
function warn(systemMessage) {
  process.stdout.write(JSON.stringify({ decision: "approve", systemMessage }));
}
function logFire(repoRoot, entry) {
  try {
    const p = path4.join(repoRoot, MARKER_DIR, FIRES_FILENAME);
    fs4.mkdirSync(path4.dirname(p), { recursive: true });
    fs4.appendFileSync(p, JSON.stringify(entry) + "\n");
  } catch {
  }
}
function censusReminder(c) {
  try {
    if (!c) return null;
    const t = c.total;
    if (t.open + t.doneRed + t.doneUnrun === 0) return null;
    const parts = [`${t.open} \u0432 \u0440\u0430\u0431\u043E\u0442\u0435`];
    if (t.doneRed) parts.push(`${t.doneRed} \u{1F534} done-but-red`);
    if (t.doneUnrun) parts.push(`${t.doneUnrun} \u23F8 done-but-not-run`);
    const top = c.specs[0];
    const next = top?.nextOpen ? ` \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435: ${top.nextOpen.title} [${top.nextOpen.id}].` : "";
    return `\u043F\u0435\u0440\u0435\u043F\u0438\u0441\u044C (${c.ts}): ${parts.join(", ")} \u043D\u0435\u0437\u0430\u043A\u0440\u044B\u0442\u043E${top ? `, \u0441\u0430\u043C\u0430\u044F \u043D\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u0430\u044F \u2014 ${top.slug}` : ""}.${next}`;
  } catch {
    return null;
  }
}
var BG_MARKER_TTL_MS = 9e5;
function bgJobMarkerActive(repoRoot) {
  try {
    const dir = path4.join(repoRoot, MARKER_DIR);
    const now = Date.now();
    for (const name of fs4.readdirSync(dir)) {
      if (!name.startsWith(".bg-task-active")) continue;
      const p = path4.join(dir, name);
      let st;
      try {
        st = fs4.statSync(p);
      } catch {
        continue;
      }
      if (!st.isFile() || now - st.mtimeMs > BG_MARKER_TTL_MS) continue;
      let body = "";
      try {
        body = fs4.readFileSync(p, "utf-8");
      } catch {
        continue;
      }
      if (/\S/.test(body)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
async function main() {
  const config = getConfig();
  if (config.mode === "false") return approve();
  const raw = await readStdin();
  if (!raw.trim()) return approve();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    log2("ERROR", `bad stdin: ${raw.slice(0, 120)}`);
    return approve();
  }
  const inContinuation = input.stop_hook_active === true;
  const tx = input.transcript_path;
  if (!tx || !fs4.existsSync(tx)) return approve();
  let rawTranscript = "";
  try {
    rawTranscript = fs4.readFileSync(tx, "utf-8");
  } catch {
    return approve();
  }
  const { claimText, toolUses } = extractTurnWindow(rawTranscript);
  if (!claimText.trim()) return approve();
  const repoRoot = normalizePath(input.cwd || input.workspace_roots?.[0] || process.cwd());
  const editedSlugs = sessionEditedSpecSlugs(tx);
  const globalCensus = readTaskCensusCache(repoRoot);
  const scoped = globalCensus ? { ...scopeCensusToSlugs(globalCensus, editedSlugs), ts: globalCensus.ts } : null;
  const agentOpen = agentOpenTodoCount(tx);
  const scopedSpecOpen = scoped ? scoped.total.open + scoped.total.doneRed : 0;
  const liveOpen = liveOpenForUncensusedSlugs(repoRoot, editedSlugs, globalCensus);
  const openWork = scopedSpecOpen + agentOpen + liveOpen;
  const recencySlug = lastEditedSpecSlug(tx);
  const recencyNextOpen = recencySlug ? scoped?.specs?.find((s) => s.slug === recencySlug)?.nextOpen ?? null : null;
  const nextStepHint = recencyNextOpen?.title ?? scoped?.specs?.[0]?.nextOpen?.title ?? agentNextOpenTodo(tx);
  const nextLine = nextStepHint ? `
\u{1F449} \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435: ${nextStepHint}` : "";
  const mutatingToolsThisTurn = toolUses.filter((t) => MUTATING_TOOL.test(t.name) || isDoorWrite.test(t.name)).length;
  const gateSelfEditThisTurn = gateSelfEdit(toolUses);
  const selfMarkedBlockedOrBacklogThisTurn = selfMarkedBlockedOrBacklog(toolUses);
  const agentBgCount = agentBgInFlightCount(rawTranscript);
  const awaitingAsync = bgInFlightInWindow(rawTranscript) || bgJobMarkerActive(repoRoot) || agentBgCount > 0 || bgCommandInFlight(rawTranscript);
  const AWAITS_RESULT_RE = /когда\s+придёт|как\s+придёт|по\s+результату|результат[ауые]?\b[^.]{0,40}(?:обработ|свер|прочит|проверю|коммич|закоммич)|если\s+(?:\d|зел[её]н|green|ок\b|чисто)|при\s+зел[её]н|when\s+it\s+(?:returns|lands|completes|finishes)|on\s+the\s+result|once\s+it\s+(?:returns|lands|completes)/i;
  const nextStepAwaitsResult = awaitingAsync && AWAITS_RESULT_RE.test(claimText);
  const userRequest = lastUserPrompt(rawTranscript);
  const taskIsAboutTheGate = /пинатор|pinator|claim.?evidence.?gate|claim.?gate|сторож/i.test(userRequest);
  const ANALYSIS_RE = /\bанализ|разбер|разбор|оцен[иь]|отч[её]т|\breport\b|analyz|ревью|\breview\b|\bплан\b|\bplan\b|посмотри что|что думаешь|что не так/i;
  const IMPLEMENT_RE = /почини|\bfix\b|реализу|implement|\bbuild\b|мигрир|migrate|допиши|добавь|перепиши|внеси|закоммить|\bcommit\b/i;
  const analysisOnly = ANALYSIS_RE.test(userRequest) && !IMPLEMENT_RE.test(userRequest);
  const GATE_INTERNAL = /claim.?evidence.?gate|meridian.?judge|bg.?task.?guard|turn_window|claim_classifier|transcript/i;
  const gateMetaThisTurn = mutatingToolsThisTurn === 0 && toolUses.length > 0 && toolUses.some((t) => GATE_INTERNAL.test(t.input));
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const priorMarker = readMarker(mp);
  const metaStreak = gateMetaThisTurn ? (priorMarker?.metaStreak ?? 0) + 1 : 0;
  let unsupported = firstUnsupported(claimText, toolUses, config.minSearch);
  const censusMsg = isSpecCompletionClaim(claimText) ? censusReminder(scoped) : null;
  if (!unsupported && censusMsg) {
    unsupported = { cls: "spec-false-close", need: censusMsg };
  }
  if (!unsupported) {
    const open = openWork;
    if (open > 0 && GRAY_SIGNAL.test(claimText) && !NEXT_SECTION_RE.test(claimText) && !awaitingAsync) {
      unsupported = { cls: "no-next-section", need: "\u0432 \u043E\u0442\u0432\u0435\u0442\u0435 \u043F\u0440\u0438 \u043D\u0435\u0437\u0430\u043A\u0440\u044B\u0442\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u0435 \u043D\u0435\u0442 \u0441\u0435\u043A\u0446\u0438\u0438 \xAB\u0414\u0430\u043B\u044C\u0448\u0435:\xBB \u0441 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u043C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C \u0448\u0430\u0433\u043E\u043C" };
    }
  }
  if (!unsupported) {
    const open = openWork;
    if (open > 0 && BLOCKER_SIGNAL.test(claimText) && !awaitingAsync && toolUses.length === 0) {
      unsupported = {
        cls: "unproven-blocker",
        need: "\u0437\u0430\u044F\u0432\u043B\u0435\u043D \u0431\u043B\u043E\u043A\u0435\u0440 (\u0436\u0434\u0443/\u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E/\u0434\u0435\u0440\u0436\u0438\u0442), \u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435 \u043D\u0435\u0442 \u0443\u043B\u0438\u043A\u0438 \u2014 \u043D\u0438 \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0439 \u0444\u043E\u043D\u043E\u0432\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u0438 \u043F\u0440\u043E\u0433\u043E\u043D\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 (git diff/log)"
      };
    }
  }
  if (analysisOnly && unsupported) {
    const PROOF_CLASSES = /* @__PURE__ */ new Set(["works-done", "analysis-verdict", "not-found-impossible", "verified-marker"]);
    const backed = toolUses.length > 0 || /\[UNVERIFIED\]/i.test(claimText);
    if (!PROOF_CLASSES.has(unsupported.cls) || backed) unsupported = null;
  }
  if (!unsupported && isJudgeArmed({
    openWork,
    gray: GRAY_SIGNAL.test(claimText),
    hasNextBlock: NEXT_SECTION_RE.test(claimText),
    analysisOnly,
    judgeEnabled: (process.env.CLAIM_GATE_JUDGE ?? "true").toLowerCase() === "true"
  })) {
    {
      const jInput = {
        finalMessage: claimText,
        tools: toolUses.map((t) => t.name),
        openTasks: openWork,
        // K3: spec-scope open + agent todos (no `scoped!` — agentOpen can be > 0 with a null census)
        mutatingToolsThisTurn,
        bgTaskLaunchedThisTurn: awaitingAsync,
        nextStepAwaitsResult,
        // 1+3 (2026-06-21): the named next step consumes the pending bg result → legit wait
        // Phase 0 (2026-06-21): the next open task is ALREADY named → "which task?" is a fake hand-off;
        // a multi-spec session makes "which spec to finish" a genuine owner choice (a legit AskUserQuestion).
        nextOpenTask: recencyNextOpen ?? scoped?.specs?.[0]?.nextOpen ?? null,
        // FR-22: prefer the spec edited most recently
        multiSpecSession: editedSlugs.size > 1,
        userRequest,
        // Phase 1: backstop — the judge approves a report-stop the user asked for
        gateSelfEditThisTurn: gateSelfEditThisTurn && !taskIsAboutTheGate,
        // FR-4/5: fighting-the-gate ONLY if the task is NOT про the gate (honest gate-dev not penalised)
        selfMarkedBlockedOrBacklogThisTurn
        // FR-4/5: self-marked own work blocked/backlog this turn (self-exemption)
      };
      let verdict = await judgeStop(jInput);
      if (verdict === null) verdict = await judgeStop(jInput);
      if (verdict?.block) {
        unsupported = { cls: "judge-block", need: verdict.reason };
      } else if (verdict === null) {
        unsupported = judgeAvailable() ? {
          cls: "judge-unavailable",
          need: `\u043F\u043E\u043C\u043E\u0433\u0430\u0442\u043E\u0440-\u0441\u0443\u0434\u044C\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D (endpoint \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u2014 \u0441\u043C. stderr), \u0430 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B ${openWork} (\u0441\u043F\u0435\u043A\u0430-scope + todo \u0441\u0435\u0441\u0441\u0438\u0438) \u2014 \u0441\u0442\u043E\u043F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D`
        } : {
          cls: "judge-no-token",
          need: buildJudgeNoTokenDemand(openWork)
        };
      }
    }
  }
  const metaOpen = openWork;
  if (!unsupported && !analysisOnly && metaStreak >= 2 && metaOpen > 0) {
    unsupported = { cls: "gate-meta", need: nextStepHint ? `\u0434\u0435\u043B\u0430\u0439: ${nextStepHint}` : "\u0434\u0435\u043B\u0430\u0439 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u043F\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435" };
  }
  if (!unsupported && metaStreak !== (priorMarker?.metaStreak ?? 0)) {
    writeMarkerAtomic(mp, {
      hash: priorMarker?.hash ?? "",
      timestamp: priorMarker?.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
      count: priorMarker?.count ?? 0,
      noProgressStreak: priorMarker?.noProgressStreak,
      metaStreak
    });
  }
  if (!unsupported) return approve();
  logFire(repoRoot, {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    class: unsupported.cls,
    need: unsupported.need,
    detail: unsupported.detail ?? null,
    tool_uses: toolUses.map((t) => t.name),
    claim_snippet: claimText.replace(/\s+/g, " ").slice(0, 200),
    mode: config.mode,
    session_id: input.session_id ?? null,
    cwd: repoRoot
  });
  if (config.mode === "shadow") {
    log2("INFO", `shadow: would block ${unsupported.cls}`);
    return approve();
  }
  if (unsupported.cls === "judge-no-token") {
    log2("INFO", "no token \u2192 warn (not block)");
    return warn(`\u26A0\uFE0F ${SELF_MARKER}: ${unsupported.need}`);
  }
  const marker = readMarker(mp);
  const currentHash = hashFileList([claimText]);
  if (marker && marker.hash === currentHash) return approve();
  const ranNoTools = toolUses.length === 0;
  const noProgressStreak = ranNoTools ? (marker?.noProgressStreak ?? 0) + 1 : 0;
  const awaitReleases = awaitingAsync && unsupported.cls !== "judge-block";
  if (awaitReleases || noProgressStreak >= config.noProgressCap) {
    const why = awaitReleases ? "awaiting async (bg in flight) \u2014 non-judge-block class" : `no work-delta across ${noProgressStreak} consecutive zero-tool kicks`;
    log2("INFO", `FR-11 release: ${why}`);
    writeMarkerAtomic(mp, { hash: currentHash, timestamp: (/* @__PURE__ */ new Date()).toISOString(), count: marker?.count ?? 1, noProgressStreak, metaStreak });
    return approve();
  }
  const within = marker ? isWithinCooldown(marker.timestamp, config.cooldownMinutes) : false;
  const newCount = within ? (marker?.count ?? 0) + 1 : 1;
  const cap = inContinuation ? Math.max(config.maxRetries, 6) : config.maxRetries;
  if (within && newCount > cap) {
    log2("INFO", `retry cap (${cap}${inContinuation ? ", continuation" : ""}) in cooldown \u2192 approve`);
    return approve();
  }
  writeMarkerAtomic(mp, { hash: currentHash, timestamp: (/* @__PURE__ */ new Date()).toISOString(), count: newCount, noProgressStreak, metaStreak });
  log2("INFO", `blocking ${unsupported.cls} (attempt ${newCount})`);
  const censusTail = censusMsg && unsupported.cls !== "spec-false-close" && unsupported.cls !== "judge-block" && unsupported.cls !== "gate-meta" ? `
\u{1F4CB} ${censusMsg}` : "";
  if (unsupported.cls === "judge-block") {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: \u0441\u0443\u0434\u044C\u044F (Meridian) \u0441\u0447\u0451\u043B \u044D\u0442\u043E \u043F\u0440\u0435\u0436\u0434\u0435\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u043C \u0441\u0442\u043E\u043F\u043E\u043C \u2014 ${unsupported.need}
\u0414\u0435\u043B\u0430\u0439 \u0441\u0430\u043C \u2014 \u0442\u044B \u044D\u0442\u043E \u043C\u043E\u0436\u0435\u0448\u044C. \u0414\u043E\u0434\u0435\u043B\u0430\u0439 \u043D\u0430\u0447\u0430\u0442\u043E\u0435 \u0412 \u042D\u0422\u041E\u041C \u0425\u041E\u0414\u0415. \u041D\u0415 \u043F\u0435\u0440\u0435\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0439 \u043D\u0430 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 (\xAB\u043D\u0443\u0436\u0435\u043D \u0442\u0432\u043E\u0439 sudo/\u0432\u0432\u043E\u0434/\u0440\u0435\u0448\u0435\u043D\u0438\u0435\xBB \u2014 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0434\u043E\u043A\u0430\u0436\u0438 \u0443\u043B\u0438\u043A\u043E\u0439, \u0447\u0442\u043E \u0441\u0430\u043C \u043D\u0435 \u043C\u043E\u0436\u0435\u0448\u044C, \u0438 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u0439 \u0441\u0432\u043E\u0438 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u044B) \u0438 \u041D\u0415 \u0431\u043E\u0440\u0438\u0441\u044C \u0441 \u0433\u0435\u0439\u0442\u043E\u043C (\u043F\u0440\u0430\u0432\u043A\u0430 \u0433\u0435\u0439\u0442\u0430 / \u0441\u0430\u043C\u043E-\u043F\u043E\u043C\u0435\u0442\u043A\u0430 blocked/backlog \u2260 \u0440\u0430\u0431\u043E\u0442\u0430) \u2014 \u0434\u0435\u043B\u0430\u0439 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0443\u044E \u0437\u0430\u0434\u0430\u0447\u0443.${nextLine}`
    );
  } else if (unsupported.cls === "judge-unavailable") {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: ${unsupported.need}.
\u041D\u0435 \u043E\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0439\u0441\u044F \u043D\u0430 \u0441\u0442\u0430\u0442\u0443\u0441\u0435 \u2014 \u0441\u0434\u0435\u043B\u0430\u0439 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u0421\u0415\u0419\u0427\u0410\u0421, \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435. \u0421\u0442\u043E\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0440\u0430\u0431\u043E\u0442\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E \u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u0430 \u0418\u041B\u0418 \u043D\u0443\u0436\u0435\u043D \u0432\u0432\u043E\u0434, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043C\u043E\u0436\u0435\u0448\u044C \u0434\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u044B.${nextLine}`
    );
  } else if (unsupported.cls === "no-next-section") {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: ${unsupported.need}.
\u041A\u0430\u0436\u0434\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 \u043F\u0440\u0438 \u043D\u0435\u0437\u0430\u043A\u0440\u044B\u0442\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u0435 \u041E\u0411\u042F\u0417\u0410\u041D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0441\u0435\u043A\u0446\u0438\u044E \xAB\u0414\u0430\u043B\u044C\u0448\u0435:\xBB \u0441 \u041A\u041E\u041D\u041A\u0420\u0415\u0422\u041D\u042B\u041C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C \u0448\u0430\u0433\u043E\u043C (\u0431\u0435\u0437 \u0432\u043E\u0434\u044B). \u0414\u043E\u043F\u0438\u0448\u0438 \u0435\u0451 \u2014 \u0438 \u0441\u0434\u0435\u043B\u0430\u0439 \u044D\u0442\u043E\u0442 \u0448\u0430\u0433 \u0441\u0435\u0439\u0447\u0430\u0441, \u043D\u0435 \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0430\u0437\u043E\u0432\u0438.${nextLine}`
    );
  } else if (unsupported.cls === "unproven-blocker") {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: ${unsupported.need}.
\u041D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0431\u043B\u043E\u043A\u0435\u0440 \u2014 \u044D\u0442\u043E \u041D\u0415 \u0431\u043B\u043E\u043A\u0435\u0440. \u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438 \u0443\u043B\u0438\u043A\u0443 \u0412 \u042D\u0422\u041E\u041C \u0416\u0415 \u043E\u0442\u0432\u0435\u0442\u0435: \`git diff/log\` \u043D\u0430\u0437\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430, \u0438\u043B\u0438 \u0437\u0430\u043F\u0443\u0441\u0442\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443. \u041D\u0435\u0442 \u0443\u043B\u0438\u043A\u0438 \u2192 \u043D\u0435 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D \u2192 \u0440\u0430\u0431\u043E\u0442\u0430\u0439 (\u0438\u043B\u0438 \u0432\u043E\u0437\u044C\u043C\u0438 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u0443\u044E \u043D\u0435-\u043F\u0435\u0440\u0435\u043A\u0440\u044B\u0432\u0430\u044E\u0449\u0443\u044E \u0440\u0430\u0431\u043E\u0442\u0443). \xAB\u0416\u0434\u0443 \u0444\u043E\u043D\u043E\u0432\u0443\u044E \u0437\u0430\u0434\u0430\u0447\u0443\xBB \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0442\u044B \u0435\u0451 \u0420\u0415\u0410\u041B\u042C\u041D\u041E \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u043B \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435.`
    );
  } else if (unsupported.cls === "gate-meta") {
    block(`\u26A0\uFE0F ${SELF_MARKER}: \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u043E. ${unsupported.need} \u2014 \u0441\u0434\u0435\u043B\u0430\u0439 \u042D\u0422\u041E\u0422 \u0448\u0430\u0433 \u0441\u0435\u0439\u0447\u0430\u0441.`);
  } else if (unsupported.cls === "spec-false-close") {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: \u0442\u044B \u0437\u0430\u044F\u0432\u0438\u043B \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0421\u041F\u0415\u041A\u0418/\u0444\u0438\u0447\u0438, \u043D\u043E ${unsupported.need}
\u041D\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0439 \u043A\u0430\u043A \xAB\u0433\u043E\u0442\u043E\u0432\u043E\xBB \u2014 \u0434\u043E\u0434\u0435\u043B\u0430\u0439 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0435 \u0438\u043B\u0438 \u043D\u0430\u0437\u043E\u0432\u0438 \u041E\u0414\u0418\u041D \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433. GREEN-\u0432\u0435\u0440\u0434\u0438\u043A\u0442 = \xAB\u043D\u0435\u0442 \u0432\u0440\u0430\u043D\u044C\u044F \u043F\u0440\u043E \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C\xBB, \u041D\u0415 \xAB\u0441\u043F\u0435\u043A\u0430 \u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u0430\xBB.${nextLine}`
    );
  } else {
    block(
      `\u26A0\uFE0F ${SELF_MARKER}: \u0442\u044B \u0437\u0430\u044F\u0432\u0438\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 (${unsupported.cls}), \u043D\u043E \u0432 \u044D\u0442\u043E\u043C \u0445\u043E\u0434\u0435 \u043D\u0435\u0442 \u0443\u043B\u0438\u043A\u0438, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u0435\u0433\u043E \u043F\u043E\u0440\u043E\u0434\u0438\u043B\u0430.
\u041D\u0443\u0436\u043D\u043E: ${unsupported.need}.
\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E \u043F\u0440\u043E\u0433\u043E\u043D\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443, \u043F\u043E\u0442\u043E\u043C \u0437\u0430\u044F\u0432\u043B\u044F\u0439 \u2014 \u043B\u0438\u0431\u043E \u044F\u0432\u043D\u043E \u043F\u043E\u043C\u0435\u0442\u044C [UNVERIFIED] \u0435\u0441\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F.${nextLine}${censusTail}`
    );
  }
}
main().catch((err) => {
  log2("ERROR", `unhandled: ${err instanceof Error ? err.message : String(err)}`);
  approve();
}).finally(() => process.exit(0));
