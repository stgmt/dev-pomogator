/**
 * FR-49e — the gray-zone LLM judge for the claim-evidence-gate Stop hook.
 *
 * The fast layer (regex deferred-work/works-done + the FR-49b census fact) handles the
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
const MODEL = 'claude-haiku-4-5-20251001';

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
    'Decide ONE thing: did it ANNOUNCE the next step instead of DOING it (or hand the wheel to the user)? Open tasks remaining is NORMAL — do NOT block just because tasks are open.',
    '',
    `FINAL MESSAGE:\n${i.finalMessage}`,
    '',
    `TOOLS THE AGENT RAN THIS TURN: ${i.tools.length ? i.tools.join(', ') : 'none'}`,
    `OBJECTIVE STATE (spec census): ${i.openTasks} open/unfinished task(s) in the active spec.`,
    '',
    'BLOCK only if:',
    '- It announced the next unit of work and stopped WITHOUT doing it ("запускаю сейчас", "беру следующий", "делаю это в следующем ходе", "начинаю с …" then ends), OR',
    '- It handed the next ACTION or a DECISION back to the user ("скажешь — сделаю", "решать тебе", "жду твоего слова"), OR',
    '- It claimed the WHOLE spec/feature is done/finished/shipped while open tasks remain.',
    '',
    'APPROVE (these are NOT premature — never block them):',
    '- A PER-TASK or PARTIAL completion report — "закоммитил фикс", "готово, добавил тест", "33 готовы, 11 в работе". Finishing and reporting ONE unit while other tasks remain is normal incremental progress, NOT a false-close.',
    '- It RAN real work this turn (see TOOLS above) and is reporting a genuine checkpoint / continuing the CURRENT action ("продолжаю проверку") — that is progress, not a defer.',
    '- It genuinely finished (0 open), OR is truly BLOCKED — needs an external input ONLY the user can give (credentials, access, a no-safe-default decision) and asks for exactly that.',
    '',
    'Tie-breaker: announced-the-next-step-without-doing-it OR handed-to-user → BLOCK. Did-a-unit-and-reported, or no tools but clearly just a report/question → APPROVE. When unsure, BLOCK only if NO tools ran this turn AND it names a next step it did not take.',
    '',
    'Respond with ONLY one JSON line: {"block": true|false, "reason": "<=12 words"}',
  ].join('\n');
}

interface JudgeOpts {
  url?: string;
  timeoutMs?: number;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * Ask the Meridian-hosted Haiku judge. Returns the verdict, or NULL to FAIL-OPEN
 * (proxy unreachable / non-200 / timeout / unparseable / malformed) — the caller then
 * keeps the fast-layer decision. Never throws.
 */
export async function judgeStop(input: JudgeInput, opts: JudgeOpts = {}): Promise<JudgeVerdict | null> {
  const base = (opts.url ?? DEFAULT_URL).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 5000; // real thinking-off call ~3s; caps a black-holed port (down proxy fails instant)
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) return null; // no fetch (old node) → fail-open
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await doFetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-dummy' },
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
    return null; // abort / network / parse → fail-open
  } finally {
    clearTimeout(timer);
  }
}
