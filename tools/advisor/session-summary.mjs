/**
 * session-summary.mjs — rolling 10-section session summary (ported from the native Claude Code
 * Session Memory: `src/services/SessionMemory/sessionMemory.ts` / `prompts.ts`, via the
 * ccjr-state-manager re-port).
 *
 * Why: the advisor currently REBUILDS a full transcript digest on every consult. Native session
 * memory keeps a durable `summary.md` on disk, updates it incrementally by DELTA on a GATE, and
 * survives /compact and --resume. Consulting then reads the summary + a small delta tail instead
 * of a 10-16MB transcript.
 *
 * Mechanics ported 1:1:
 *   - 10-section template (Session Title / Current State / Task specification / Files and
 *     Functions / Workflow / Errors & Corrections / Codebase and System Docs / Learnings /
 *     Key results / Worklog);
 *   - Gate (init ≥5K content tokens; update ≥5K growth AND (≥3 tool calls since last extract OR
 *     last turn had NO tool calls));
 *   - Delta: only transcript entries since the last extraction line;
 *   - Section budgets ≤2K tokens each / ≤12K total (condense, keep Current State + Errors);
 *   - atomic write (temp + rename — atomic-config-save rule), per-session `wx` lock
 *     (atomic-update-lock rule);
 *   - state.json per session (API-token/content-token baselines, last_extraction_line, counts).
 *
 * Pure + no network except updateSummaryViaModel(); unit-testable.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SUMMARY_FILENAME = 'summary.md';
export const STATE_FILENAME = 'session-state.json';

// Template from native prompts.ts (10 sections). Italic lines are template-instruction carriers:
// output/update must keep both the '#' headers and the '_italic_ description' lines unchanged.
export const DEFAULT_TEMPLATE = `# Session Title
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

export const SECTION_RE = /^(#{1,2}\s+.+)$/gm;

// Gate thresholds (sessionMemoryUtils.ts)
export const MIN_TOKENS_TO_INIT = 5_000;
export const MIN_TOKENS_BETWEEN_UPDATE = 5_000;
export const TOOL_CALLS_BETWEEN_UPDATES = 3;
export const MAX_SECTION_TOKENS = 2_000;
export const MAX_TOTAL_TOKENS = 12_000;
export const MAX_UPDATE_TURNS = 10;
export const HAIKU_SUMMARIZER = 'gpt-5.6-luna';

const CHARS_PER_TOKEN = 4; // internal roughTokenCountEstimation: 1 token ≈ 4 chars

export function roughTokenEstimate(text) {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}

export function contentTokensOfMessage(content) {
  if (typeof content === 'string') return roughTokenEstimate(content);
  if (Array.isArray(content)) {
    let total = 0;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text') total += roughTokenEstimate(b.text);
      else if (b.type === 'tool_use') total += roughTokenEstimate(JSON.stringify(b.input ?? {}));
      else if (b.type === 'tool_result') total += roughTokenEstimate(String(typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '')));
    }
    return total;
  }
  return 0;
}

function isToolUseTurn(entry) {
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && b.type === 'tool_use');
}

/** Parse user/assistant entries from raw transcript JSONL. */
export function parseTranscript(raw) {
  const entries = [];
  let contentTokens = 0;
  let apiTokens = 0;
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const type = String(o.type ?? '');
    if (type !== 'user' && type !== 'assistant') continue;
    contentTokens += contentTokensOfMessage(o.message?.content);
    if (type === 'assistant' && o.message?.usage) {
      const u = o.message.usage;
      apiTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0);
    } else {
      apiTokens += contentTokensOfMessage(o.message?.content);
    }
    entries.push(o);
  }
  return { entries, apiTokens, contentTokens };
}

/* ---------------- gate ---------------- */

export function shouldUpdate(state, contentTokens, toolCallsSince, lastTurnHasToolCalls) {
  if (!state.initialized) {
    if (contentTokens < MIN_TOKENS_TO_INIT) return { pass: false, reason: 'init_below_threshold' };
    state.initialized = true;
  }
  const growth = contentTokens - state.content_tokens_at_last_extraction;
  if (growth < MIN_TOKENS_BETWEEN_UPDATE) return { pass: false, reason: 'growth_below_threshold' };
  const fired = toolCallsSince >= TOOL_CALLS_BETWEEN_UPDATES || !lastTurnHasToolCalls;
  if (!fired) return { pass: false, reason: 'tool_activity_insufficient' };
  return { pass: true, reason: 'passed' };
}

/* ---------------- paths / state / atomic io ---------------- */

/** Root for advisor artifacts. Default: inside the project (.dev-pomogator/advisor) — gitignored,
 *  survives /compact & --resume; does NOT touch the user-global ~/.claude. */
export function advisorRoot(repoRoot) {
  return path.join(repoRoot ?? process.cwd(), '.dev-pomogator', 'advisor');
}

export function summaryFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), 'summary', `${sanitize(sessionId)}.md`);
}

export function stateFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), 'state', `${sanitize(sessionId)}.json`);
}

export function lockFilePath(repoRoot, sessionId) {
  return path.join(advisorRoot(repoRoot), 'locks', `${sanitize(sessionId)}.lock`);
}

function sanitize(s) {
  return String(s ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}

export function readState(repoRoot, sessionId) {
  const p = stateFilePath(repoRoot, sessionId);
  const defaults = {
    session_id: sessionId,
    initialized: false,
    content_tokens_at_last_extraction: 0,
    api_tokens_at_last_extraction: 0,
    last_extraction_line_count: 0,
    last_extraction_timestamp: null,
    extraction_count: 0,
    consecutive_failures: 0,
  };
  try {
    if (fs.existsSync(p)) return { ...defaults, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
  } catch { /* corrupt → defaults */ }
  return defaults;
}

export function writeStateAtomic(repoRoot, sessionId, state) {
  const p = stateFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

/** Acquire an exclusive per-session lock with O_EXCL semantics; returns false if held. */
export function tryLock(repoRoot, sessionId) {
  const p = lockFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  try {
    const fd = fs.openSync(p, 'wx'); // O_EXCL
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return () => { try { fs.unlinkSync(p); } catch { /* already gone */ } };
  } catch {
    return null;
  }
}

export function readOrCreateSummary(repoRoot, sessionId) {
  const p = summaryFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (fs.existsSync(p)) return { summary: fs.readFileSync(p, 'utf-8'), created: false, path: p };
  fs.writeFileSync(p + '.init.tmp', DEFAULT_TEMPLATE);
  fs.writeFileSync(p, DEFAULT_TEMPLATE);
  try { fs.unlinkSync(p + '.init.tmp'); } catch { /* ok */ }
  return { summary: DEFAULT_TEMPLATE, created: true, path: p };
}

export function writeSummaryAtomic(repoRoot, sessionId, summary) {
  const p = summaryFilePath(repoRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, summary);
  fs.renameSync(tmp, p);
}

/* ---------------- delta extraction ---------------- */

/** Only the transcript entries after the last extraction line (Mode B delta). */
export function sliceDelta(entries, lastExtractionLine, allLines) {
  if (!lastExtractionLine || !allLines) return entries;
  const fractionNew = Math.max(0, (allLines - lastExtractionLine)) / allLines;
  const startIdx = Math.max(0, Math.floor(entries.length * (1 - fractionNew)));
  return entries.slice(startIdx);
}

/** Tool-command + input summarized (for the update prompt); keeps it cheap and pairing-safe. */
export function flattenDelta(entries) {
  return entries.map((o) => {
    const type = String(o.type ?? '');
    const c = o.message?.content ?? '';
    if (typeof c === 'string') return `[${type.toUpperCase()}] ${c.replace(/\s+/g, ' ')}`;
    if (!Array.isArray(c)) return '';
    const parts = [];
    for (const b of c) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && b.text) parts.push(b.text.replace(/\s+/g, ' '));
      else if (b.type === 'tool_use') parts.push(`[tool ${b.name}] ${JSON.stringify(b.input ?? {}).slice(0, 300)}`);
      else if (b.type === 'tool_result') parts.push(`[result${b.is_error ? ' ERROR' : ''}] ${typeof b.content === 'string' ? b.content.replace(/\s+/g, ' ').slice(0, 300) : '…'}`);
    }
    return `[${type.toUpperCase()}] ${parts.join(' ')}`;
  }).filter(Boolean);
}

/* ---------------- model update (file_edit-style, turn loop) ---------------- */

export function buildUpdatePrompt(currentSummary, deltaText) {
  return (
    `Update the session notes below based ONLY on the NEW conversation delta. ` +
    `Structure must keep every '#' section header unchanged; the _italic description_ lines are ` +
    `section carriers — you MAY replace their placeholder text with a real description, but never ` +
    `delete a header. Keep each section concise, total ≤ ~${MAX_TOTAL_TOKENS} tokens; if over, ` +
    `condense older sections and prioritise 'Current State' and 'Errors & Corrections'. Do not add ` +
    `new sections, do not reference this task, no filler. Return the FULL updated notes (whole ` +
    `file), no commentary.\n\n` +
    `## CURRENT SESSION NOTES\n${currentSummary}\n\n` +
    `## NEW CONVERSATION DELTA\n${deltaText}`
  );
}

export async function updateSummaryViaModel(currentSummary, deltaText, { model = HAIKU_SUMMARIZER, callModel } = {}) {
  const prompt = buildUpdatePrompt(currentSummary, deltaText);
  if (typeof callModel === 'function') {
    return callModel(prompt, { model, maxTokens: 4000 });
  }
  // default: direct HTTP (same transport as advisor) with a hard timeout (AbortController)
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !key) return { ok: false, error: 'no ANTHROPIC_BASE_URL/token' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.ADVISOR_TIMEOUT_MS || 30000));
  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4000, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    return text ? { ok: true, text } : { ok: false, error: 'empty' };
  } catch (e) {
    return { ok: false, error: String(e?.name === 'AbortError' ? 'timeout' : (e?.message ?? e)) };
  } finally {
    clearTimeout(timer);
  }
}

/** Verify the model output keeps all # section headers (structure preservation).
 *  The italic _descriptions_ are CARRIERS, not anchors: the model may reword them while updating
 *  content, so we only hard-require the `#` headers themselves. */
export function verifyStructure(text) {
  const need = [...DEFAULT_TEMPLATE.matchAll(SECTION_RE)].map((m) => m[1].trim());
  const have = [...String(text ?? '').matchAll(SECTION_RE)].map((m) => m[1].trim());
  const missing = need.filter((h) => !have.includes(h));
  return { ok: missing.length === 0, missing };
}

/* ---------------- full driver (gate + delta + write) ---------------- */

/**
 * Gather delta + optionally update the rolling summary.
 * Returns { updated, state, summary, delta, gate } — never throws.
 */
export async function maybeUpdateSummary({ transcriptPath, repoRoot, sessionId, force = false, callModel } = {}) {
  if (!transcriptPath || !sessionId) return { ok: false, reason: 'no transcript/session' };
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf-8'); } catch (e) { return { ok: false, reason: `read: ${e.message}` }; }

  const { entries, apiTokens, contentTokens } = parseTranscript(raw);
  if (!entries.length) return { ok: false, reason: 'no conversation entries' };

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
  // bound the delta: only the most recent MAX_DELTA events (a huge full-first-parse would blow the
  //  prompt and time out the cheap model — mirrors ccjr Mode B/truncate-messages-to-fit).
  const MAX_DELTA_EVENTS = 40;
  const flat = flattenDelta(delta.slice(-MAX_DELTA_EVENTS)).join('\n');
  const updateRes = await updateSummaryViaModel(summary, flat, { callModel });
  if (!updateRes.ok) {
    state.consecutive_failures = (state.consecutive_failures ?? 0) + 1;
    writeStateAtomic(repoRoot, sessionId, state);
    return { ok: false, reason: `update: ${updateRes.error}`, updated: false, state, gate, summary, delta: flat };
  }
  const updated = updateRes.text;
  // Structure guard: if model dropped a header, keep the previous summary (avoid corruption).
  const struct = verifyStructure(updated);
  if (!struct.ok) {
    state.consecutive_failures = (state.consecutive_failures ?? 0) + 1;
    writeStateAtomic(repoRoot, sessionId, state);
    return { ok: false, reason: `structure lost: ${struct.missing.join(', ')}`, updated: false, state, gate, summary, delta: flat };
  }
  // atomic write
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

export function countToolCalls(entries) {
  let n = 0;
  for (const o of entries) if (isToolUseTurn(o)) n++;
  return n;
}