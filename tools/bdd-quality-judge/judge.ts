/**
 * W5 — BDD-quality Haiku judge (plan iridescent-giggling-lemur).
 *
 * When an agent edits a `.feature` scenario or a BDD step-def, a PostToolUse hook (see hook.ts)
 * asks a one-shot Haiku to judge it against the strong-tests §6.5 rubric and emits an ADVISORY
 * warning ("this scenario is weak because …"). NOT blocking — a nudge so weak/coarse scenarios get
 * caught at author-time instead of only by a mutation run.
 *
 * Transport is REUSED verbatim from the claim-evidence-gate judge — `resolveEndpoint()` (token from
 * CLAUDE_MEM_OPENROUTER_API_KEY / OPENROUTER_API_KEY / .env*, model claude-haiku-4.5). builtins-only
 * (fetch/fs), fail-open: any failure → null (the hook then stays silent). Never throws.
 *
 * The judge gets the CONTEXT it needs to judge (user 2026-06-20: «чтоб передавался норм контекст»):
 * the scenario text, its step-def, AND the code-under-test the step-def drives — so it can tell a
 * tight branch-covering test from a coarse happy-path that always passes.
 */
import { resolveEndpoint } from '../claim-evidence-gate/meridian-judge.ts';

const TIMEOUT_MS = 6000;

export interface BddJudgeInput {
  /** The edited scenario (Gherkin) OR the edited step-def snippet. */
  edited: string;
  /** What was edited — for the prompt framing. */
  kind: 'feature' | 'step-def';
  /** The step-def(s) that implement the scenario (when judging a .feature). */
  stepDef?: string;
  /** The production module the step-def drives (import target) — the code-under-test. */
  codeUnderTest?: string;
}

export interface BddVerdict {
  /** true = the scenario/step-def looks WEAK (advisory warning warranted). */
  weak: boolean;
  /** <=25 words: WHY it's weak (or "ok"). */
  reason: string;
}

function clip(s: string | undefined, n: number): string {
  if (!s) return '(none provided)';
  return s.length > n ? s.slice(0, n) + '\n…(truncated)' : s;
}

export function buildBddJudgePrompt(i: BddJudgeInput): string {
  return [
    'You judge the QUALITY of a BDD (cucumber) test for an AI coding agent, against the strong-tests',
    'rubric. Decide if it is WEAK. A test is STRONG only when ALL hold; weak if ANY fails:',
    '',
    '1. DRIVES REAL CODE — the step-def imports + calls the real production module (or spawns the real',
    '   CLI/hook), NO mock and NO inline copy of the production logic. A test that re-implements the',
    '   logic or asserts against a hand-rolled value is fake.',
    '2. TIGHT ASSERTIONS (depth) — asserts EXACT output (exact array/value), not just `.includes(x)`,',
    '   `toBeDefined`, `not null`, or "length >= N". A loose assertion lets mutations survive.',
    '3. NOT FAKE-GREEN — it would FAIL if the code-under-test broke. A tautology / a check that always',
    '   passes regardless of the code is fake-green.',
    '4. COVERS A REAL BRANCH (breadth) — exercises a specific behaviour/branch of the code, not a vague',
    '   happy-path. (One scenario need not cover all branches, but it must reach a real one tightly.)',
    '',
    `WHAT WAS EDITED (${i.kind}):`,
    clip(i.edited, 2000),
    '',
    'ITS STEP-DEFINITION (how it drives the code):',
    clip(i.stepDef, 2000),
    '',
    'THE CODE-UNDER-TEST it should drive + assert against:',
    clip(i.codeUnderTest, 2500),
    '',
    'Judge against the 4 criteria. If weak, name the SPECIFIC failing criterion + what to fix',
    '(e.g. "criterion 2: uses .includes(\'cardinality\') — assert the exact suggestedInvariants array").',
    'If it genuinely drives real code with tight, branch-reaching, non-tautological assertions → not weak.',
    '',
    'Respond with ONLY one JSON line: {"weak": true|false, "reason": "<=25 words, name the criterion"}',
  ].join('\n');
}

function logUnavailable(reason: string): void {
  try {
    process.stderr.write(`[bdd-quality-judge] помогатор недоступен — ${reason}\n`);
  } catch {
    /* never let logging throw */
  }
}

/**
 * Ask the Haiku judge. ONE real call (reusing the project's OpenRouter integration), fail-open:
 * returns NULL (and logs WHY) when there is no token / the endpoint fails / the reply is unparseable.
 * Never throws — a plugin hook must not crash because помогатор is unreachable.
 */
export async function judgeBddQuality(input: BddJudgeInput, opts: { timeoutMs?: number } = {}): Promise<BddVerdict | null> {
  if (typeof fetch !== 'function') {
    logUnavailable('в этом рантайме нет global fetch (старый Node)');
    return null;
  }
  const ep = resolveEndpoint();
  if (!ep) {
    logUnavailable('нет токена (OPENROUTER_API_KEY / CLAUDE_MEM_OPENROUTER_API_KEY / .env*)');
    return null;
  }
  const url = `${ep.url.replace(/\/+$/, '')}/chat/completions`;
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
        messages: [{ role: 'user', content: buildBddJudgePrompt(input) }],
      }),
    });
    if (!r.ok) {
      logUnavailable(`HTTP ${r.status} ${r.statusText} (модель ${ep.model})`);
      return null;
    }
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j?.choices?.[0]?.message?.content ?? '';
    // Robust: Haiku may wrap the verdict in a ```json fence or add prose, and the reason can contain
    // braces/punctuation. Extract the fields directly rather than JSON.parse a strict brace-match.
    const wm = text.match(/"weak"\s*:\s*(true|false)/i);
    if (!wm) {
      logUnavailable('ответ без JSON-вердикта');
      return null;
    }
    const weak = wm[1].toLowerCase() === 'true';
    const rm = text.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const reason = rm ? rm[1].replace(/\\"/g, '"') : 'judge verdict';
    return { weak, reason };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `таймаут ${opts.timeoutMs ?? TIMEOUT_MS}ms` : e.message) : String(e);
    logUnavailable(msg);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
