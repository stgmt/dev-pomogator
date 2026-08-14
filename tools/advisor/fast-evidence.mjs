/**
 * Fast advisor evidence extractor.
 *
 * Problem with the "full-transcript" mode: it ships up to 30k chars / 60 blocks into ONE LLM
 * call on every consult. That is slow and token-heavy.
 *
 * Fast mode: DETERMINISTIC pattern extraction over the whole transcript, scanned IN PARALLEL
 * over fixed-size chunks. Only the distilled evidence (errors, touched files, commands, tests,
 * user asks, done/plan signals, final message) goes to the LLM. The advisor model gets a few
 * hundred tokens of signal instead of the raw dump, so a consult is fast (small input, small
 * output) while still catching the same classes of defects the transcript would reveal.
 *
 * Pure + sync-scan per chunk (no LLM here) so it is unit-testable and cheap.
 */
import fs from 'node:fs';

export const CHUNK_LINES = 400;          // one chunk = ~400 transcript lines
export const MAX_ERROR_SIGS = 12;        // cap distinct recurring signatures
export const MAX_TOUCHED_FILES = 20;
export const MAX_COMMANDS = 25;
export const MAX_USER_ASKS = 8;
export const MAX_FINAL_ASST_CHARS = 1200;

const TOOL_USE_RE = /"type"\s*:\s*"tool_use"[\s\S]{0,500}?"name"\s*:\s*"([^"]+)"/;
const TOOL_RESULT_ERR_RE = /"is_error"\s*:\s*true/;
const ERROR_LINE_RE =
  /\b(error|exception|failed|fail\b|fatal|crash|traceback|cannot\s+(find|resolve|import|read)|not\s+found|exit\s+code\s+[1-9]|ENOENT|EACCES|ECONNREFUSED|TS\d{4}|ERR_|Output exceeds|No such file|command not found|no such tool|usage error)\b/i;

function lineBlocks(line) {
  // returns [] or the parsed content array guards against long lines
  if (line.length > 2_000_000) return null;      // skip enormous lines (binary dumps)
  try { const o = JSON.parse(line); return o; } catch { return null; }
}

function summarizeBashCommand(input) {
  try {
    const c = String(input?.command ?? '');
    return c.replace(/\s+/g, ' ').slice(0, 140);
  } catch { return ''; }
}

function filePathOf(input) {
  try { return String(input?.file_path ?? input?.path ?? '').trim(); } catch { return ''; }
}

/** Distinct error signature from a candidate error line: prefers the line tail, not just the keyword. */
function sigOf(line, errors) {
  const clean = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  // take up to 110 chars of the actual message, avoiding a bare "error"/"failed/fail"
  const m = clean.match(ERROR_LINE_RE);
  if (!m) return;
  let start = clean.toLowerCase().indexOf(m[0].toLowerCase());
  if (start < 0) start = 0;
  let sig = clean.slice(start).slice(0, 120);
  if (sig.trim().length < 4) sig = clean.slice(0, 120);
  errors.set(sig, (errors.get(sig) ?? 0) + 1);
}

/** Scan one chunk of raw lines -> evidence contributions. Deterministic. */
export function scanChunk(linesChunk, index) {
  const errors = new Map();         // normalized signature -> count
  const files = new Set();
  const commands = [];
  const wiredToolUses = new Set();
  let errResults = 0;
  let toolUses = 0;
  let userAsks = [];
  let lastAssistantText = '';

  for (const line of linesChunk) {
    if (!line || !line.trim()) continue;
    const o = lineBlocks(line);
    if (!o) continue;
    const type = String(o.type ?? '');

    // user-typed ask (text, not tool result) — content may be a string OR block array
    if (type === 'user') {
      const rawContent = o.message ? o.message.content : null;
      if (typeof rawContent === 'string' && rawContent.trim()) {
        const t = rawContent.replace(/\s+/g, ' ').trim();
        if (!/^<|^\d+\s*$|Stop hook|task-notification|^\s*\{/.test(t) && t.length > 3) userAsks.push(t);
      } else if (Array.isArray(rawContent)) {
        for (const b of rawContent) {
          if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
            const t = b.text.replace(/\s+/g, ' ').trim();
            if (!/^<|^\d+\s*$|Stop hook|task-notification/.test(t)) userAsks.push(t);
          }
        }
      }
    }

    if (!Array.isArray(o.message?.content)) continue;
    const content = o.message.content;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (type === 'assistant' && b.type === 'tool_use' && typeof b.name === 'string') {
        toolUses++;
        wiredToolUses.add(`${index}:${b.name}`);
        if (b.name === 'Bash') {
          const cmd = summarizeBashCommand(b.input);
          if (cmd && !/^\s*(ls|cat|head|tail|pwd|echo|true)\b/.test(cmd)) commands.push(cmd);
        }
        if (b.name === 'Edit' || b.name === 'Write') {
          const fp = filePathOf(b.input);
          if (fp) files.add(fp);
        }
      }
      if (type === 'user' && b.type === 'tool_result') {
        if (b.is_error === true) {
          errResults++;
          const text = String(b.content ?? '').replace(/\s+/g, ' ').slice(0, 240);
          sigOf(text, errors);
        }
        // bash output lines that look like an error even without is_error
        const raw = String(b.content ?? '');
        for (const outLine of raw.split(/[\r\n]+/).slice(0, 40)) {
          const t = outLine.trim();
          if (t && ERROR_LINE_RE.test(t)) sigOf(t, errors);
        }
      }
      if (type === 'assistant' && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        lastAssistantText = b.text.trim();
      }
    }
  }

  const recurring = [...errors.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ERROR_SIGS)
    .map(([sig, n]) => `${n}x ${sig}`);

  return {
    chunkIndex: index,
    errResults,
    toolUses,
    recurring,
    files: [...files].slice(0, MAX_TOUCHED_FILES),
    commands: commands.slice(-MAX_COMMANDS),
    userAsks: userAsks.slice(-MAX_USER_ASKS),
    lastAssistantText: lastAssistantText.slice(-MAX_FINAL_ASST_CHARS),
  };
}

/** Scan the whole transcript in parallel chunks -> merged evidence. */
export async function extractEvidenceParallel(rawTranscript) {
  const lines = String(rawTranscript ?? '').split(/\r?\n/);
  const chunks = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) chunks.push(lines.slice(i, i + CHUNK_LINES));

  const results = await Promise.all(chunks.map((c, idx) => Promise.resolve(scanChunk(c, idx))));

  const merged = {
    errResults: 0,
    toolUses: 0,
    recurringErrors: new Map(),
    files: new Set(),
    commands: [],
    userAsks: [],
    lastAssistantText: '',
  };
  for (const r of results) {
    merged.errResults += r.errResults;
    merged.toolUses += r.toolUses;
    for (const s of r.recurring) {
      const [nStr, ...rest] = s.split(/\s+/);
      const n = parseInt(nStr, 10) || 0;
      const sig = rest.join(' ').slice(0, 120);
      if (!sig) continue;
      merged.recurringErrors.set(sig, (merged.recurringErrors.get(sig) ?? 0) + n);
    }
    r.files.forEach((f) => merged.files.add(f));
    merged.commands.push(...r.commands);
    merged.userAsks.push(...r.userAsks);
    if (r.lastAssistantText) merged.lastAssistantText = r.lastAssistantText;
  }
  merged.recurring = [...merged.recurringErrors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ERROR_SIGS)
    .map(([sig, n]) => `${n}x ${sig}`);
  merged.files = [...merged.files].slice(0, MAX_TOUCHED_FILES);

  // dedup commands AND collapse repeated poll/wait noise (same command run many times)
  const POLL_NOISE_RE = /Get-ChildItem.*docker-status|docker-status|Get-Content .*\.log.*Tail|Start-Sleep|sleep\s+\d+|wait|--tail\s+\d+/i;
  const seenCmd = new Set();
  const cmdCount = new Map();
  for (const c of merged.commands) {
    const key = c.slice(0, 100);           // group near-identical variants
    cmdCount.set(key, (cmdCount.get(key) ?? 0) + 1);
  }
  merged.commands = [...cmdCount.entries()]
    .filter(([c]) => !POLL_NOISE_RE.test(c))          // drop docker-status/Get-Content-poll spam
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COMMANDS)
    .map(([c, n]) => (n > 1 ? `${c}  (${n}x)` : c));
  void seenCmd;

  // dedup user asks, drop skill re-invocation/summary noise
  const ASK_NOISE_RE = /(Re-invocation of \/|is already loaded above|Base directory for this skill|continued from a previous conversation|Skill \/\S+ was loaded earlier|^`|^# \/|^\s*<local-command)/;
  merged.userAsks = [...new Set(merged.userAsks)]
    .filter((a) => !ASK_NOISE_RE.test(a))
    .slice(-MAX_USER_ASKS);

  return merged;
}

/** Compact human-readable evidence packet (what the LLM sees). */
export function renderEvidence(ev) {
  const parts = [];
  let n = 0;
  if (ev.userAsks?.length) {
    parts.push('## User asks', ...ev.userAsks.map((a) => `- ${a.slice(0, 220)}`));
    n++;
  }
  if (ev.recurring?.length) {
    parts.push('## Recurring / error signals', ...ev.recurring.map((s) => `- ${s}`));
    n++;
  }
  if (ev.files?.length) {
    parts.push('## Files touched (Edit/Write/Grep paths)', ...ev.files.map((f) => `- ${f}`));
    n++;
  }
  if (ev.commands?.length) {
    parts.push('## Bash commands (non-trivial)', ...ev.commands.map((c) => `- \`${c}\``));
    n++;
  }
  parts.push(`## Stats\n- tool_use blocks: ${ev.toolUses ?? 0}\n- tool_result with is_error: ${ev.errResults ?? 0}`);
  if (ev.lastAssistantText) parts.push(`## Latest assistant message\n${ev.lastAssistantText.slice(0, 900)}`);
  const body = parts.join('\n');
  return `# Evidence extracted from the session transcript (deterministic pattern scan over ${n} question/error/action classes)\n${body}`;
}

/** Load transcript raw + parallel-scan -> ready-to-send evidence packet. */
export async function buildFastEvidence(transcriptPath) {
  if (!transcriptPath) return null;
  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  const ev = await extractEvidenceParallel(raw);
  return { raw, packet: renderEvidence(ev), stats: ev };
}