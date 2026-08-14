/**
 * Advisor PoC — Stop hook (non-blocking).
 *
 * Approximates the stock Anthropic Advisor tool on the local transport:
 * at key moments (before a completion claim, on a recurring error, on a
 * plan/approach) a STRONGER model receives a bounded slice of the conversation
 * and returns guidance, which is surfaced as a non-blocking `systemMessage`
 * (like the stock "Advising" line). Never blocks the stop, never crashes.
 *
 * Key points (subset of stock docs' use cases):
 *   1. DONE_CLAIM  — final message declares completion ("готово/сделал/done")
 *   2. RECURRING   — the bounded recent transcript shows the SAME error
 *                    signature >= 2 times (stuck on a recurring failure)
 *   3. PLAN        — an ExitPlanMode / approach decision is being made
 *
 * Anti-spam: per-session cooldown marker; a message already carrying the
 * advisor's own marker is never re-consulted.
 *
 * Modes (ADVISOR_ENABLED): "true" (surface systemMessage, default) |
 * "shadow" (log the advisory only, show nothing in chat) | "false" (off).
 * Fail-open: ANY error -> approve, no message. Dep-safe: node builtins + fetch.
 *
 * Transport: Anthropic-compatible /v1/messages on $ANTHROPIC_BASE_URL with
 * $ANTHROPIC_AUTH_TOKEN (the sub2api proxy this machine's Claude Code uses).
 * Model: $ADVISOR_MODEL (default gpt-5.6-sol, the "Opus" mapping). If NO base
 * URL/token is present the advisor stays silent (fail-open).
 *
 * @see .specs? tools/advisor/README-ish — PoC, not yet a spec.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseTranscriptEvents, type TranscriptEvent } from '../claim-evidence-gate/transcript_events.ts';
import { log } from '../_shared/hook-utils.ts';
// @ts-expect-error — plain JS module (session-summary.mjs), typed loosely for hook use.
import { maybeUpdateSummary, tryLock } from './session-summary.mjs';

const LOG_PREFIX = 'ADVISOR';
const MARKER_DIR = '.dev-pomogator';
const FIRES_FILENAME = '.advisor-fires.jsonl';
const MARKER_FILENAME = '.advisor-marker.json';
const COOLDOWN_MS = Number(process.env.ADVISOR_COOLDOWN_MS || 300_000); // 5 min per session
const TIMEOUT_MS = Number(process.env.ADVISOR_TIMEOUT_MS || 30_000);
const MAX_RECENT_EVENTS = 40;
const MAX_MSG_CHARS = 1500;

interface StopHookInput {
  cwd?: string;
  session_id?: string;
  transcript_path?: string;
  last_assistant_message?: string;
  background_tasks?: unknown[];
}

export type KeyPoint = { kind: 'DONE_CLAIM' | 'RECURRING_ERROR' | 'PLAN_APPROACH'; reason: string; evidence: string[] };

const DONE_SIGNAL = /(готово|готова|готов\b|сделал[аи]?|закоммит|закрыл|закрыт\b|реализован[аоы]?|работает|вс[её]\s+готово|done|fixed|finished|shipped|landed|wrapped\s+up|complete|создан[аоы]?\b)/i;
const PLAN_SIGNAL = /(план|подход|стратеги|как\s+(?:будем|делать|сделать)|ExitPlanMode|спроектир|архитектур)/i;
const ERROR_SHELL = /(error|exception|failed|fail|ошибк|не\s+наш[её]|crash|Э\s+.+exit)/i;

/** First non-empty error-ish line class: tool name + is_error + normalized first line of content. */
function errorSignature(ev: TranscriptEvent): string | null {
  if (ev.isSidechain) return null;
  for (const block of ev.blocks) {
    if (block.type === 'tool_result') {
      const text = String(block.content ?? '');
      const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && ERROR_SHELL.test(l));
      const key = `${ev.type}|${block.is_error === true ? 'ERR' : 'ok|' + (line ?? '').slice(0, 160).toLowerCase()}`;
      void key;
      if (block.is_error === true) {
        return `${ev.raw.promptSource ?? ''}|tool_error|${(line ?? text).slice(0, 160).toLowerCase()}`;
      }
      if (line && ERROR_SHELL.test(line)) {
        return `stderr|${line.slice(0, 160).toLowerCase()}`;
      }
    }
  }
  return null;
}

/** Detect whether this stop is at a key point where the advisor should be consulted. */
export function detectKeyPoint(input: StopHookInput, events: TranscriptEvent[]): KeyPoint | null {
  const final = (input.last_assistant_message ?? '').replace(/\s+/g, ' ').slice(0, 2000);

  // Non-conversation events (hook attachments, queue ops, last-prompt bookmarks) pollute the
  // tail window — a child capped at MAX_RECENT_EVENTS after the final message sees only them.
  const conversational = events.filter((ev) => ev.type === 'user' || ev.type === 'assistant');
  const recent = conversational.slice(-MAX_RECENT_EVENTS);

  // 3. PLAN — recent ExitPlanMode tool use OR a fresh plan-y user prompt.
  const planTool = recent.some((ev) => ev.blocks.some((b) => b.type === 'tool_use' && (b.name === 'ExitPlanMode' || /plan/i.test(String(b.name ?? '')))));
  if (planTool) return { kind: 'PLAN_APPROACH', reason: 'ExitPlanMode / plan tool use in the recent window', evidence: ['ExitPlanMode seen'] };

  // 2. RECURRING — same error signature appears >= 2 times in the recent window.
  const sigs = new Map<string, number>();
  for (const ev of recent) {
    const s = errorSignature(ev);
    if (s) sigs.set(s, (sigs.get(s) ?? 0) + 1);
  }
  let worst: { sig: string; count: number } | null = null;
  for (const [sig, count] of sigs) {
    if (count >= 2 && (!worst || count > worst.count)) worst = { sig, count };
  }
  if (worst) return { kind: 'RECURRING_ERROR', reason: `один и тот же сбой повторяется (${worst.count}x): ${worst.sig.slice(0, 120)}`, evidence: [worst.sig] };

  // 1. DONE_CLAIM — final message declares completion AND the turn did real work.
  const usedToolThisTurn = recent.slice(-12).some((ev) => ev.blocks.some((b) => b.type === 'tool_use'));
  if (DONE_SIGNAL.test(final) && usedToolThisTurn) {
    return { kind: 'DONE_CLAIM', reason: 'финальное сообщение декларирует завершение работы', evidence: [final.slice(0, 200)] };
  }
  return null;
}

/** Build a bounded conversation slice for the advisor (recent events + final message). */
export function buildPacket(input: StopHookInput, events: TranscriptEvent[]): string {
  const lines: string[] = [`# Advisor consultation (session ${input.session_id ?? 'unknown'})`, ''];
  const conversational = events.filter((ev) => ev.type === 'user' || ev.type === 'assistant');
  const recent = conversational.slice(-MAX_RECENT_EVENTS);
  for (const ev of recent) {
    const role = ev.type === 'user' ? 'USER' : ev.type === 'assistant' ? 'ASSISTANT' : String(ev.type).toUpperCase();
    if (ev.text.trim()) {
      lines.push(`[${role}] ${ev.text.replace(/\s+/g, ' ').slice(0, 400)}`);
      continue;
    }
    for (const block of ev.blocks) {
      if (block.type === 'tool_use') {
        const inp = JSON.stringify(block.input ?? {}).slice(0, 240);
        lines.push(`[TOOL ${block.name}] input=${inp}`);
      } else if (block.type === 'tool_result') {
        const text = String(block.content ?? '').replace(/\s+/g, ' ').slice(0, 240);
        lines.push(`[TOOL_RESULT${block.is_error === true ? ' ERROR' : ''}] ${text}`);
      }
    }
  }
  lines.push('');
  lines.push(`## Final assistant message:\n${input.last_assistant_message ?? ''}`);
  return lines.join('\n');
}

export function buildAdvisorPrompt(packet: string, key: KeyPoint): string {
  return (
    `You are an independent ADVISOR consulted at a key moment of an AI coding task.\n` +
    `Moment: ${key.kind} — ${key.reason}.\n` +
    `Below is a bounded slice of the recent conversation (tool calls, results, messages).\n` +
    `Give concise, concrete guidance as 2-5 bullets: what is risky, what to double-check ` +
    `before proceeding or declaring completion, what the agent may have missed. ` +
    `Reference concrete files/tools/evidence when possible. If the work looks sound, ` +
    `say so briefly and name the ONE thing most worth verifying. Plain text, no JSON.\n\n` +
    packet
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function approve(message?: string): void {
  process.stdout.write(message ? JSON.stringify({ decision: 'approve', systemMessage: message }) : '{}');
}

function debug(msg: string): void {
  if (process.env.ADVISOR_DEBUG === '1') process.stderr.write(`[advisor-debug] ${msg}\n`);
}

function resolveEnv(): { base: string; key: string } | null {
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !key) {
    log('WARN', LOG_PREFIX, 'нет ANTHROPIC_BASE_URL/токена — адвизор молчит (fail-open)');
    return null;
  }
  return { base, key };
}

async function consultAdvisor(packet: string, key: KeyPoint): Promise<string | null> {
  const env = resolveEnv();
  if (!env) return null;
  if (typeof globalThis.fetch !== 'function') {
    log('WARN', LOG_PREFIX, 'fetch недоступен — адвизор молчит');
    return null;
  }
  const model = process.env.ADVISOR_MODEL?.trim() || 'gpt-5.6-sol';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${env.base}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.key,
        authorization: `Bearer ${env.key}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: buildAdvisorPrompt(packet, key) }],
      }),
    });
    if (!r.ok) {
      log('WARN', LOG_PREFIX, `HTTP ${r.status} ${r.statusText} от ${env.base}`);
      const body = await r.text().catch(() => '');
      log('DEBUG', LOG_PREFIX, `body: ${body.slice(0, 200)}`);
      return null;
    }
    const j = (await r.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown> };
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    return text || null;
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `таймаут ${TIMEOUT_MS}ms` : e.message) : String(e);
    log('WARN', LOG_PREFIX, `вызов не удался: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readMarker(repoRoot: string, sessionId: string): number | null {
  try {
    const p = path.join(repoRoot, MARKER_DIR, MARKER_FILENAME);
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, number>;
    return j[sessionId] ?? null;
  } catch {
    return null;
  }
}

function writeMarkerAtomic(repoRoot: string, sessionId: string, ts: number): void {
  try {
    const dir = path.join(repoRoot, MARKER_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, MARKER_FILENAME);
    let map: Record<string, number> = {};
    try {
      map = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, number>;
    } catch {
      map = {};
    }
    map[sessionId] = ts;
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(map));
    fs.renameSync(tmp, p);
  } catch {
    /* best-effort */
  }
}

function logFire(repoRoot: string, entry: Record<string, unknown>): void {
  try {
    const dir = path.join(repoRoot, MARKER_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, FIRES_FILENAME), JSON.stringify(entry) + '\n');
  } catch {
    /* best-effort */
  }
}

async function main(): Promise<void> {
  const mode = (process.env.ADVISOR_ENABLED ?? 'true').toLowerCase();
  if (mode === 'false') return approve();

  let raw = '';
  try {
    raw = await readStdin();
  } catch {
    return approve();
  }
  if (!raw.trim()) return approve();

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    return approve();
  }

  const repoRoot = input.cwd || process.cwd();
  const sessionId = input.session_id ?? '';

  // Anti-loop: the agent's own message must not already carry our marker.
  if (input.last_assistant_message && /ADVISOR_INTEGRATED|advisor:/.test(input.last_assistant_message)) return approve();

  // Cooldown per session.
  const lastFire = sessionId ? readMarker(repoRoot, sessionId) : null;
  if (lastFire !== null && Date.now() - lastFire < COOLDOWN_MS) return approve();

  let events: TranscriptEvent[] = [];
  if (input.transcript_path) {
    try {
      const parsed = parseTranscriptEvents(fs.readFileSync(input.transcript_path, 'utf-8'));
      events = parsed.events;
    } catch {
      events = [];
    }
  }

  let key: KeyPoint | null = null;
  try {
    key = detectKeyPoint(input, events);
  } catch (e) {
    log('WARN', LOG_PREFIX, `detection failed: ${String(e)}`);
  }
  logFire(repoRoot, { ts: new Date().toISOString(), sessionId, kind: key?.kind ?? 'NO_FIRE', reason: key?.reason ?? 'no key point', debug: { events: events.length, hadTranscript: Boolean(input.transcript_path), last: (input.last_assistant_message ?? '').slice(0, 120) } });

  // Rolling session summary: on every Stop, opportunistically update the 10-section summary.md
  // when the gate passes (init ≥5K content tokens; update ≥5K growth + ≥3 tool calls). Independent
  // of whether the advisor fires. Fail-open: any error → skip, keep the stop approved.
  if ((process.env.ADVISOR_SESSION_SUMMARY ?? '0') === '1' && input.transcript_path && sessionId) {
    try {
      const lock = tryLock(repoRoot, sessionId);
      if (lock) {
        const up = await maybeUpdateSummary({
          transcriptPath: input.transcript_path,
          repoRoot,
          sessionId,
          force: (process.env.ADVISOR_SUMMARY_FORCE ?? '0') === '1',
        });
        lock();
        if (up?.updated) log('INFO', LOG_PREFIX, `session summary updated (extract #${up.state?.extraction_count ?? '?'})`);
        else if (up && !up.ok) log('WARN', LOG_PREFIX, `session summary update skipped: ${up.reason ?? '?'}`);
      }
    } catch (e) {
      log('WARN', LOG_PREFIX, `session summary update failed: ${String(e)}`);
    }
  }

  if (!key) return approve();

  const packet = buildPacket(input, events);
  let guidance: string | null = null;
  try {
    guidance = await consultAdvisor(packet, key);
  } catch {
    guidance = null;
  }

  const entry = { ts: new Date().toISOString(), sessionId, key: key.kind, reason: key.reason, guidance };
  logFire(repoRoot, entry);
  if (sessionId) writeMarkerAtomic(repoRoot, sessionId, Date.now());

  if (mode === 'shadow') {
    log('INFO', LOG_PREFIX, `[shadow] ${key.kind} — guidance=${guidance ? guidance.slice(0, 200) : '(unavailable)'}`);
    return approve();
  }
  if (!guidance) return approve();

  const message = `🧭 Advisor (${key.kind}): ${guidance.replace(/\s+/g, ' ').slice(0, MAX_MSG_CHARS)}`;
  return approve(message);
}

// Entry only when executed directly (not when unit/bench imports the pure functions).
const entryUrl = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
const thisUrl = import.meta.url.replace('file:///', '').replace(/\\/g, '/');
const isDirect = !entryUrl || thisUrl.endsWith(entryUrl);
if (isDirect) {
  main().catch(() => process.stdout.write('{}'));
}