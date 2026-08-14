/**
 * Pure transcript-rebuilding + advisor-call helpers for the advisor MCP/stop tools.
 * No stdin/MCP bootstrap here — importable from tests and the server.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = Number(process.env.ADVISOR_TIMEOUT_MS || 30_000);
const MAX_TRANSCRIPT_BLOCKS = 60;
const PER_BLOCK_CHARS = 1800;
const MAX_TOTAL_CHARS = 30_000;

export function encodeProjectDir(projectDir) {
  try {
    return projectDir.replace(/[\\/]/g, '-').replace(/:/g, '-');
  } catch {
    return null;
  }
}

export function resolveTranscriptPath() {
  const home = os.homedir();
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID ?? '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? '';
  const roots = [projectDir].filter(Boolean);

  if (sessionId) {
    for (const root of roots) {
      const enc = encodeProjectDir(root);
      if (!enc) continue;
      const p = path.join(home, '.claude', 'projects', enc, `${sessionId}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
    try {
      const base = path.join(home, '.claude', 'projects');
      if (fs.existsSync(base)) {
        for (const dir of fs.readdirSync(base)) {
          const p = path.join(base, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* fall through */ }
  }

  if (projectDir) {
    try {
      const enc = encodeProjectDir(projectDir) ?? projectDir;
      const dir = path.join(home, '.claude', 'projects', enc);
      if (fs.existsSync(dir)) {
        const newest = fs.readdirSync(dir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => path.join(dir, f))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
        if (newest) return newest;
      }
    } catch { /* fall through */ }
  }
  return null;
}

const CONVERSATION_TYPES = new Set(['user', 'assistant']);

function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (value.content !== undefined) return textOf(value.content);
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return '';
}

export function buildTranscriptPacket(rawTranscript) {
  const lines = [];
  for (const line of String(rawTranscript ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); } catch { continue; }
    const type = String(raw.type ?? '');
    if (!CONVERSATION_TYPES.has(type)) continue;
    const content = raw.message && Array.isArray(raw.message.content) ? raw.message.content : null;
    if (!content) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (type === 'assistant' && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        lines.push(`[ASSISTANT] ${block.text.replace(/\s+/g, ' ').slice(0, PER_BLOCK_CHARS)}`);
      }
      if (type === 'user' && block.type === 'tool_result') {
        const c = textOf(block.content).replace(/\s+/g, ' ').slice(0, PER_BLOCK_CHARS);
        lines.push(`[TOOL_RESULT${block.is_error ? ' ERROR' : ''}] ${c}`);
      }
      if (type === 'assistant' && block.type === 'tool_use' && typeof block.name === 'string') {
        const input = JSON.stringify(block.input ?? {}).slice(0, PER_BLOCK_CHARS);
        lines.push(`[TOOL_USE ${block.name}] input=${input}`);
      }
      if (type === 'user' && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        lines.push(`[USER] ${block.text.replace(/\s+/g, ' ').slice(0, PER_BLOCK_CHARS)}`);
      }
    }
  }
  let out = lines.slice(-MAX_TRANSCRIPT_BLOCKS);
  let total = 0;
  const capped = [];
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].length;
    if (total > MAX_TOTAL_CHARS) break;
    capped.unshift(out[i]);
  }
  return `# Full conversation (transcript, most recent ${capped.length} blocks)\n${capped.join('\n')}`;
}

export function buildAdvisorPrompt(packet) {
  return (
    `You are an independent ADVISOR for an AI coding agent. The agent consulted you at a key moment ` +
    `(before committing to an approach, before declaring done, when stuck, or before a change of ` +
    `approach). Below is the FULL conversation transcript the agent has produced so far: the task, ` +
    `every tool call and its result, and the agent's messages.\n\n` +
    `Give concise, concrete guidance as 3-6 bullets: what is risky, what to double-check before ` +
    `proceeding or declaring completion, what the agent may have missed. Reference concrete ` +
    `files/tools/commands/evidence seen in the transcript. If the work looks sound, say so briefly ` +
    `and name the ONE thing most worth verifying. Make the advice actionable — the agent will ` +
    `continue from here. Plain text, no JSON.\n\n` + packet
  );
}

export async function consultAdvisorFromTranscript(packet) {
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !key) return '[advisor] no ANTHROPIC_BASE_URL/token configured — skipping';
  const model = process.env.ADVISOR_MODEL?.trim() || 'gpt-5.6-sol';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: buildAdvisorPrompt(packet) }],
      }),
    });
    if (!r.ok) return `[advisor] HTTP ${r.status} from ${base}`;
    const j = await r.json();
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    return text || '[advisor] empty guidance';
  } catch (e) {
    return `[advisor] call failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}