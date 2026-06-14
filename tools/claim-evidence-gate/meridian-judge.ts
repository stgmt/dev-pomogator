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
    'Decide if it stopped PREMATURELY: announced/implied more work, or handed the next step or a decision back to the user, instead of continuing the work itself — OR claimed done while objective state shows unfinished work.',
    '',
    `FINAL MESSAGE:\n${i.finalMessage}`,
    '',
    `TOOLS THE AGENT RAN THIS TURN: ${i.tools.length ? i.tools.join(', ') : 'none'}`,
    `OBJECTIVE STATE (spec census): ${i.openTasks} open/unfinished task(s) in the active spec.`,
    '',
    'Rules:',
    '- BLOCK if it announced a next unit and stopped, deferred an action/decision to the user, or claimed the spec/feature done while open tasks remain.',
    '- APPROVE if it GENUINELY finished (0 open), OR it is truly BLOCKED — cannot proceed without an external input ONLY the user can give (credentials, access, a decision with no safe default) and asks for exactly that. A creds/access request to proceed is a genuine block, NOT a defer.',
    '- Narrating an in-flight action but ENDING the turn while tasks remain open is a premature stop → BLOCK.',
    '- When genuinely uncertain, APPROVE.',
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
