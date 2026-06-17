/**
 * FR-49e — the gray-zone LLM judge for the claim-evidence-gate Stop hook.
 *
 * The fast layer (regex works-done/not-found/verified + the FR-49b census fact) handles the
 * obvious cases instantly. The GRAY zone — a progress/completion claim that ended the turn,
 * which the regex did NOT match, while the census shows unfinished work — escalates HERE: a
 * one-shot Haiku call through the local Meridian subscription proxy decides block vs approve
 * by UNDERSTANDING (not phrase-matching), so the gate stops playing whack-a-mole with wording.
 *
 * Transport = Meridian `/v1/messages`, thinking OFF (see skill `meridian-model-call`):
 * measured ~3s vs `claude -p` ~13s, 6/6 accuracy, thinking adds nothing. NEVER `claude -p`.
 *
 * FAIL-OPEN by contract: proxy down / non-200 / timeout / unparseable → return null, and the
 * caller keeps the fast-layer verdict. A plugin-distributed Stop hook must never hang or crash
 * because a user has no Meridian. Dep-safe: node builtins (`fetch`) only.
 *
 * @see .specs/spec-generator-v4/FR.md FR-49 (FR-49e) · AC-49.2 · .claude/skills/meridian-model-call
 */

const DEFAULT_URL = process.env.MERIDIAN_URL ?? 'http://127.0.0.1:3456';
// When local Meridian times out (6s) or errors, FALL BACK to the hosted aipomogator.ru Haiku so a
// down/absent local proxy is no longer a free stop (the hole the gate let through — user decision
// 2026-06-17). Hosted = near-always reachable, so the judge actually runs. Override/disable via env;
// optional key for the hosted endpoint. Both-down still fail-opens so an offline user never hangs.
const FALLBACK_URL = process.env.CLAIM_GATE_JUDGE_FALLBACK_URL ?? 'https://aipomogator.ru';
const FALLBACK_KEY = process.env.CLAIM_GATE_JUDGE_FALLBACK_KEY ?? '';
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 6000; // user-set: 6s per endpoint, then fall back / fail-open

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
  url?: string;
  /** Fallback endpoint used when the primary times out / fails (default aipomogator.ru). */
  fallbackUrl?: string;
  timeoutMs?: number;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/** Call ONE judge endpoint. Returns the verdict, or NULL (non-200 / timeout / unparseable). Never throws. */
async function callJudgeOnce(
  base: string,
  input: JudgeInput,
  doFetch: typeof fetch,
  timeoutMs: number,
  apiKey: string,
): Promise<JudgeVerdict | null> {
  const url = base.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await doFetch(`${url}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey || 'sk-dummy' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        thinking: { type: 'disabled' }, // the speed knob: ~3s vs ~7s, same verdict
        messages: [{ role: 'user', content: buildJudgePrompt(input) }],
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const m = text.match(/\{[^{}]*"block"[^{}]*\}/);
    if (!m) return null;
    const v = JSON.parse(m[0]) as { block?: unknown; reason?: unknown };
    if (typeof v.block !== 'boolean') return null;
    return { block: v.block, reason: typeof v.reason === 'string' ? v.reason : 'judge verdict' };
  } catch {
    return null; // abort / network / parse → caller falls back, then fail-opens
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the Haiku judge: local Meridian first (~3s), and on timeout/failure FALL BACK to the hosted
 * aipomogator.ru Haiku — so a down/absent local proxy no longer grants a free stop. Returns the
 * verdict, or NULL to FAIL-OPEN only when BOTH endpoints fail (an offline user never hangs). Never throws.
 */
export async function judgeStop(input: JudgeInput, opts: JudgeOpts = {}): Promise<JudgeVerdict | null> {
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) return null; // no fetch (old node) → fail-open
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const primary = (opts.url ?? DEFAULT_URL).replace(/\/+$/, '');
  const primaryVerdict = await callJudgeOnce(primary, input, doFetch, timeoutMs, '');
  if (primaryVerdict) return primaryVerdict;
  // Primary timed out / failed → hosted fallback (key optional). Skip when it is the same URL.
  const fallback = (opts.fallbackUrl ?? FALLBACK_URL).replace(/\/+$/, '');
  if (fallback && fallback !== primary) {
    const fbVerdict = await callJudgeOnce(fallback, input, doFetch, timeoutMs, FALLBACK_KEY);
    if (fbVerdict) return fbVerdict;
  }
  return null; // both down → fail-open (the only remaining free stop, and only when truly offline)
}
