/**
 * FR-49e — the gray-zone LLM judge for the claim-evidence-gate Stop hook.
 *
 * The fast layer (regex works-done/not-found/verified + the FR-49b census fact + the deterministic
 * require-next-section check) handles the obvious cases instantly. The GRAY zone — a progress/
 * completion claim that ended the turn WITH a «Дальше:» section but which the regex did NOT
 * resolve, while the census shows unfinished work — escalates HERE: a one-shot Haiku call decides
 * block vs approve by UNDERSTANDING (not phrase-matching), so the gate stops playing whack-a-mole.
 *
 * Transport = ПОМОГАТОР, the project's own existing LLM integration (OpenAI-compatible
 * `/chat/completions`), reused verbatim from tools/prompt-suggest & tools/auto-commit:
 *   OPENROUTER_API_KEY → https://openrouter.ai/api/v1   (priority)
 *   else AUTO_COMMIT_API_KEY → https://aipomogator.ru/go/v1   (AUTO_COMMIT_LLM_URL override)
 * SINGLE real path — NO mock transport, NO secondary fallback endpoint (user 2026-06-17:
 * «никаких моков и фолбеков»). The token is read from process.env, and — «токен есть» — also
 * loaded from a .env / .env.local / .env.test file in cwd when it is not already exported.
 *
 * DIAGNOSABLE: on ANY failure (no token / non-200 / timeout / unparseable) it logs WHY to stderr
 * («помогатор недоступен — <reason>») and returns null; the caller then applies its deterministic
 * fail-closed. A plugin Stop hook must never hang or crash. Dep-safe: node builtins (`fetch`/`fs`) only.
 *
 * (Filename is legacy — the transport is помогатор now, not the Meridian proxy; kept to avoid
 * churning the two importers. The exported API — judgeStop/buildJudgePrompt — is unchanged.)
 *
 * @see .specs/spec-generator-v4/FR.md FR-49 (FR-49e) · AC-49.2
 * @see tools/prompt-suggest/prompt_suggest_core.ts (loadConfig + callSuggestionLLM — the canonical caller)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MODEL_OVERRIDE = process.env.CLAIM_GATE_JUDGE_MODEL;
const TIMEOUT_MS = 6000; // user-set: 6s, then log + fail-open(null) → caller fail-closes

export interface JudgeInput {
  /** The agent's final assistant message this turn. */
  finalMessage: string;
  /** Tool names the agent ran this turn (for "did it actually do work?"). */
  tools: string[];
  /** Open/unfinished task count from the census cache (the objective fact). */
  openTasks: number;
}

export interface JudgeVerdict {
  block: boolean;
  reason: string;
}

function logUnavailable(reason: string): void {
  // The literal user ask («логи есть почему недоступен помогатор?»): say WHY on stderr, once,
  // on failure only. Distinguishes "no token" (config) from "endpoint refused/HTTP" (actionable).
  try {
    process.stderr.write(`[claim-evidence-gate] judge: помогатор недоступен — ${reason}\n`);
  } catch {
    /* never let logging throw */
  }
}

// --- token loading: fill ABSENT keys from dotenv files in cwd (builtins-only parser, run once) ---
let dotenvLoaded = false;
function ensureDotenvLoaded(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  for (const name of ['.env', '.env.local', '.env.test']) {
    try {
      const p = path.join(process.cwd(), name);
      if (!fs.existsSync(p)) continue;
      for (const raw of fs.readFileSync(p, 'utf-8').split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v; // never overwrite an already-exported value
      }
    } catch {
      /* unreadable .env → ignore, fall through to "no token" */
    }
  }
}

interface Endpoint {
  url: string;
  key: string;
  model: string;
}

/**
 * Resolve the помогатор endpoint+key+model. Mirrors prompt_suggest_core.loadConfig and ALSO accepts
 * the OpenRouter key this project actually carries under CLAUDE_MEM_OPENROUTER_API_KEY («токен есть»),
 * plus a dedicated CLAIM_GATE_JUDGE_KEY override for users. NULL = no token anywhere → judge skips.
 * Priority: explicit judge key → OPENROUTER_API_KEY → CLAUDE_MEM_OPENROUTER_API_KEY → AUTO_COMMIT_API_KEY.
 */
export function resolveEndpoint(): Endpoint | null {
  ensureDotenvLoaded();
  const judgeKey = process.env.CLAIM_GATE_JUDGE_KEY;
  if (judgeKey) {
    return {
      url: process.env.CLAIM_GATE_JUDGE_URL ?? 'https://openrouter.ai/api/v1',
      key: judgeKey,
      model: MODEL_OVERRIDE ?? 'anthropic/claude-haiku-4.5',
    };
  }
  // OpenRouter key under any known name (the project's real one is CLAUDE_MEM_OPENROUTER_API_KEY).
  const orKey = process.env.OPENROUTER_API_KEY || process.env.CLAUDE_MEM_OPENROUTER_API_KEY;
  if (orKey) {
    return { url: 'https://openrouter.ai/api/v1', key: orKey, model: MODEL_OVERRIDE ?? 'anthropic/claude-haiku-4.5' };
  }
  const acKey = process.env.AUTO_COMMIT_API_KEY;
  if (acKey) {
    return {
      url: process.env.AUTO_COMMIT_LLM_URL ?? 'https://aipomogator.ru/go/v1',
      key: acKey,
      model: MODEL_OVERRIDE ?? 'openrouter/anthropic/claude-haiku-4.5',
    };
  }
  return null;
}

/** True when a token resolves — used by the live bench to skip cleanly when no помогатор token is configured. */
export function judgeAvailable(): boolean {
  return resolveEndpoint() !== null;
}

export function buildJudgePrompt(i: JudgeInput): string {
  return [
    'You are a STOP-GATE judge for an AI coding agent that just ENDED its turn.',
    'Decide ONE thing: did it STOP while it still had a concrete next step it could do RIGHT NOW with no blocker? If yes → BLOCK (kick it to keep going). Doing SOME work this turn does NOT earn the right to stop with known work left — that is the lazy stop you exist to catch.',
    '',
    `FINAL MESSAGE:\n${i.finalMessage}`,
    '',
    `TOOLS THE AGENT RAN THIS TURN: ${i.tools.length ? i.tools.join(', ') : 'none'}`,
    `OBJECTIVE STATE (spec census): ${i.openTasks} open/unfinished task(s).`,
    '',
    'BLOCK if the message does ANY of these — running tools this turn is IRRELEVANT, it still must not stop:',
    '- NAMES the next unit/file/step it will do and the turn ENDS without doing it ("следующий беру X", "дальше X", "осталось N, беру …", "начинаю с …", "запускаю X" then stops).',
    '- DEFERS the remaining work to later passes/turns ("это несколько заходов", "за раз не закрыть", "следующим заходом", "в следующем ходе", "веду дальше" as a sign-off). Naming a remainder and signing off IS the stall.',
    '- Hands the next ACTION or a DECISION to the user ("скажешь — сделаю", "решать тебе", "жду твоего слова").',
    '- Claims the WHOLE spec/feature is done/shipped while open tasks remain.',
    '- ENDS on a STATUS / SUMMARY of work just done while OPEN TASKS REMAIN — EVEN WITH NO next step named. Omitting "дальше"/"next" does NOT make it a clean stop: a proactive status-and-stop while work is left is THE bypass you must catch ("38 готовы, всё durable, коммиты на ветке" while 199 open → BLOCK). Reporting progress is not finishing.',
    '',
    `APPROVE only if ONE clearly holds (objective state: ${i.openTasks} open task(s) — weigh it hard):`,
    '- It is ANSWERING the user or asking ONE genuine clarifying question the user alone must decide (a real back-and-forth, not a self-initiated sign-off).',
    '- TRULY blocked: needs an external input ONLY the user can give (credentials, access, a no-safe-default decision) and asks for exactly that.',
    '- Continuing the SAME in-flight action it is mid-way through ("продолжаю прогон сейчас") — progress on the CURRENT step, not a new unit announced-and-deferred.',
    '- Genuinely NOTHING is left: the census shows ZERO open tasks AND the message is a clean done. With open tasks, a "clean done / status / count" is NOT an approve — it falls under BLOCK above.',
    '',
    'Tie-breaker: named-next-step, deferred-to-later, handed-to-user, OR a status/summary of done work while open tasks remain (WITH OR WITHOUT a "next") → BLOCK, no matter how many tools ran. APPROVE only: answering-the-user / one genuine clarifying question / truly-blocked / in-flight-continuation / census-is-ZERO-and-done.',
    '',
    'Respond with ONLY one JSON line: {"block": true|false, "reason": "<=12 words"}',
  ].join('\n');
}

interface JudgeOpts {
  /** Override the resolved endpoint base URL (tests / config). */
  url?: string;
  timeoutMs?: number;
}

/**
 * Ask the помогатор Haiku judge over the project's existing OpenAI-compatible integration. ONE real
 * call — no mock transport, no secondary endpoint. Returns the {block,reason} verdict, or NULL to
 * FAIL-OPEN (and logs WHY) when there is no token / the endpoint fails / the reply is unparseable.
 * Never throws — a plugin Stop hook must not crash because помогатор is unreachable.
 */
export async function judgeStop(input: JudgeInput, opts: JudgeOpts = {}): Promise<JudgeVerdict | null> {
  if (typeof fetch !== 'function') {
    logUnavailable('в этом рантайме нет global fetch (старый Node)');
    return null;
  }
  const ep = resolveEndpoint();
  if (!ep) {
    logUnavailable('нет токена — задай OPENROUTER_API_KEY или AUTO_COMMIT_API_KEY (env или .env/.env.test)');
    return null;
  }
  const base = (opts.url ?? ep.url).replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ep.key}` },
      body: JSON.stringify({
        model: ep.model,
        max_tokens: 120,
        temperature: 0,
        messages: [{ role: 'user', content: buildJudgePrompt(input) }],
      }),
    });
    if (!r.ok) {
      logUnavailable(`HTTP ${r.status} ${r.statusText} от ${base} (модель ${ep.model})`);
      return null;
    }
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j?.choices?.[0]?.message?.content ?? '';
    const m = text.match(/\{[^{}]*"block"[^{}]*\}/);
    if (!m) {
      logUnavailable(`ответ без JSON-вердикта от ${base}`);
      return null;
    }
    const v = JSON.parse(m[0]) as { block?: unknown; reason?: unknown };
    if (typeof v.block !== 'boolean') {
      logUnavailable(`в вердикте поле block не boolean (${base})`);
      return null;
    }
    return { block: v.block, reason: typeof v.reason === 'string' ? v.reason : 'judge verdict' };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `таймаут ${opts.timeoutMs ?? TIMEOUT_MS}ms` : e.message) : String(e);
    logUnavailable(`${msg} (${base})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
