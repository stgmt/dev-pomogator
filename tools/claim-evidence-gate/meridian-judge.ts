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
  /** Open/unfinished task count — SESSION-scoped (FR-9), the objective fact. */
  openTasks: number;
  /**
   * FR-10: observable, agent-INDEPENDENT facts the hook gathers — the judge weighs
   * these FIRST (the message text is secondary, the agent can polish it). Optional so
   * existing callers / the live bench keep working (default → "unknown"/false).
   */
  mutatingToolsThisTurn?: number;
  /** FR-10: the agent launched a background task this turn → may be legitimately awaiting async. */
  bgTaskLaunchedThisTurn?: boolean;
  /** 1+3 (2026-06-21): a deterministic HINT — the named next step CONSUMES the pending bg result (can't run
   *  until it lands: «когда придёт — обработаю/коммичу», «если 19/19 — коммичу»). YES → a "wait + result-
   *  dependent next" is a legit wait, NOT an announce-and-stop. */
  nextStepAwaitsResult?: boolean;
  /** Phase 0 (2026-06-21): the NEXT open task the census already identified for the agent. When set,
   *  asking the user "which task should I take?" is a FAKE hand-off — the agent PICKS the named task. */
  nextOpenTask?: { id: string; title: string } | null;
  /** Phase 0: the session edited >1 spec → choosing WHICH spec to finish is a genuine owner decision
   *  (a legit AskUserQuestion). Within ONE spec, "which task?" is never the user's call — the agent picks. */
  multiSpecSession?: boolean;
  /** Phase 1 (2026-06-21): the user's LAST typed request. If it asked for ANALYSIS/REPORT/PLAN/REVIEW
   *  only (no implementation), a stop that DELIVERS it is correct → approve (proofs for facts still apply). */
  userRequest?: string;
  /** FR-4/5 (2026-06-25): this turn a mutating tool edited the GATE'S OWN files (claim-evidence-gate /
   *  judge / task-census / spec-status / judge-bench / `.spec-status`). Editing the enforcement to weaken
   *  it instead of doing the task = fighting-the-gate → BLOCK — UNLESS `userRequest` is про the gate
   *  (honest gate development the owner asked for is never punished). */
  gateSelfEditThisTurn?: boolean;
  /** FR-4/5 (2026-06-25): this turn the agent SELF-marked its own work blocked/backlog (set_spec_status
   *  backlog OR a `Status: BLOCKED` write to a TASKS.md it edited) — a self-declared blocker (same class as
   *  the fabricated blocker). Counts as work only with a verifiable external blocker OR the owner's words. */
  selfMarkedBlockedOrBacklogThisTurn?: boolean;
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
export function resolveEndpoint(injectedEnv?: Record<string, string | undefined>): Endpoint | null {
  // Default: real process.env after loading .env/.env.test. Tests pass a controlled env to assert
  // the priority deterministically — without a live token and without the real cwd's .env polluting.
  let env: Record<string, string | undefined>;
  if (injectedEnv) {
    env = injectedEnv;
  } else {
    ensureDotenvLoaded();
    env = process.env;
  }
  const judgeKey = env.CLAIM_GATE_JUDGE_KEY;
  if (judgeKey) {
    return {
      url: env.CLAIM_GATE_JUDGE_URL ?? 'https://openrouter.ai/api/v1',
      key: judgeKey,
      model: MODEL_OVERRIDE ?? 'anthropic/claude-haiku-4.5',
    };
  }
  // OpenRouter key under any known name (the project's real one is CLAUDE_MEM_OPENROUTER_API_KEY).
  const orKey = env.OPENROUTER_API_KEY || env.CLAUDE_MEM_OPENROUTER_API_KEY;
  if (orKey) {
    return { url: 'https://openrouter.ai/api/v1', key: orKey, model: MODEL_OVERRIDE ?? 'anthropic/claude-haiku-4.5' };
  }
  const acKey = env.AUTO_COMMIT_API_KEY;
  if (acKey) {
    return {
      url: env.AUTO_COMMIT_LLM_URL ?? 'https://aipomogator.ru/go/v1',
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

/**
 * FR-15: the loud, chat-visible demand surfaced (as a NON-BLOCKING `systemMessage` warning) when the
 * smart judge can't run because NO помогатор token resolves. Names the exact env vars + endpoint so ANY
 * user can wire it — replacing the old stderr-only silence. A missing token is the user's CONFIG gap,
 * not a lazy stop to punish (user 2026-06-25: «без токена блокировать не должен, только предупреждать в
 * чате»), so the stop PROCEEDS and only this warning is shown. Pure + exported so the contract is tested
 * directly (CEGATE001_17) without spawning the hook.
 */
export function buildJudgeNoTokenDemand(openWork: number): string {
  return (
    `Умный Stop-судья ВЫКЛЮЧЕН — не подключён токен аипомогатора, поэтому пинатор не ловит хитрые ленивые стопы (а открытой работы ${openWork}). ` +
    `Подключи ОДИН из ключей (в .env проекта или env): ` +
    `AUTO_COMMIT_API_KEY=<key> (endpoint https://aipomogator.ru/go/v1), либо OPENROUTER_API_KEY=<key>, либо CLAIM_GATE_JUDGE_KEY=<key>. ` +
    `Пока токен не подключён — пинатор только ПРЕДУПРЕЖДАЕТ (не блокирует), а умный судья молчит. Подключи токен, чтобы включить его (совсем убрать предупреждение: CLAIM_GATE_ENABLED=false).`
  );
}

/**
 * FR-17 (user 2026-06-25 «всегда когда есть блок дальше надо пропускать на судью»): decide whether a stop
 * escalates to the gray-zone judge. A NAMED-NEXT «Дальше:» block (`hasNextBlock`) is an INDEPENDENT arming
 * trigger — the agent announced a next step and stopped (the announce-and-stop the judge catches), so arm
 * REGARDLESS of openWork (the task-census can lag a freshly-edited spec → openWork=0 falsely; the actual
 * 2026-06-25 incident) AND regardless of analysisOnly (the «Дальше:» block is the agent's OWN signal — the
 * judge's own answer/await carve-outs still APPROVE a genuine report-stop, which carries no «Дальше:» block).
 * The openWork>0 path keeps its analysisOnly guard (on a pure analysis request, no work-kick). Pure +
 * exported → unit-tested BOTH directions without a token (CEGATE001_19/20). `gray` = GRAY_SIGNAL matched.
 */
export function isJudgeArmed(o: {
  openWork: number;
  gray: boolean;
  hasNextBlock: boolean;
  analysisOnly: boolean;
  judgeEnabled: boolean;
}): boolean {
  if (!o.judgeEnabled || !o.gray) return false;
  return o.hasNextBlock || (!o.analysisOnly && o.openWork > 0);
}

export function buildJudgePrompt(i: JudgeInput): string {
  const mut = i.mutatingToolsThisTurn ?? null;
  return [
    'You are a STOP-GATE judge for an AI coding agent that just ENDED its turn.',
    'Decide ONE thing: did it STOP while it still had a concrete next step it could do RIGHT NOW with no blocker? If yes → BLOCK (kick it). If it is genuinely done / answering the user / truly blocked / legitimately awaiting an async result → APPROVE.',
    '',
    'OBSERVABLE FACTS — the hook gathered these from the transcript + repo; the agent did NOT author them. WEIGH THESE FIRST; the message text below is secondary narrative the agent CAN polish to pass you:',
    `- mutating tool calls THIS turn (Edit/Write/Bash/door-writes): ${mut === null ? 'unknown' : mut}`,
    `- background task launched THIS turn (agent may be awaiting an async callback): ${i.bgTaskLaunchedThisTurn ? 'YES' : 'no'}`,
    `- the named next step CONSUMES the pending bg result (can't run until it lands — deterministic hint): ${i.nextStepAwaitsResult ? 'YES' : 'no'}`,
    `- open/unfinished tasks in THIS SESSION's scope: ${i.openTasks}`,
    `- NEXT OPEN TASK already identified for the agent (so the next step is NAMED, not unknown): ${i.nextOpenTask ? `«${i.nextOpenTask.title}» [${i.nextOpenTask.id}]` : 'none'}`,
    `- session touched MULTIPLE specs: ${i.multiSpecSession ? 'YES' : 'no'} (NOT a license to ask the user «which to do first» — the agent STILL picks the NEXT OPEN TASK above and does it)`,
    `- tool names this turn: ${i.tools.length ? i.tools.join(', ') : 'none'}`,
    `- the user's LAST request (what they actually asked for): ${i.userRequest ? i.userRequest.replace(/\s+/g, ' ').slice(0, 240) : 'unknown'}`,
    `- this turn EDITED the gate's OWN enforcement files (claim-evidence-gate / judge / task-census / spec-status / bench / .spec-status): ${i.gateSelfEditThisTurn ? 'YES' : 'no'}`,
    `- this turn SELF-marked its own work blocked/backlog (set a task BLOCKED / parked a spec backlog): ${i.selfMarkedBlockedOrBacklogThisTurn ? 'YES' : 'no'}`,
    '',
    `AGENT'S FINAL MESSAGE (secondary — may be written to look done):\n${i.finalMessage}`,
    '',
    'BLOCK if the message does ANY of these. Mutating tools this turn do NOT license stopping with known work left — doing some work then announcing-and-stopping is exactly the lazy stop you catch:',
    '- WEAKENING THE GATE instead of doing the task: «this turn edited the gate\'s own files» is YES AND the user\'s LAST request is NOT про the gate — the agent diverted into editing the ENFORCEMENT itself (so it stops firing) instead of the real task → BLOCK «не правь сторож, делай задачу». IMPORTANT EXCEPTION: if the user\'s LAST request IS про the gate/pinator («фикси/почини/усиль пинатор», «fix the gate», «доделай судью»), editing the gate IS the assigned task → this rule does NOT apply, judge it like any other work (in-flight continuation → APPROVE). (Self-marking one\'s OWN work blocked/backlog is covered by SELF-AUTHORIZED SKIP below.)',
    '- NAMES a NEW/next unit/file/step and the turn ENDS without doing it — even phrased present-tense ("следующий беру X", "дальше X", "начинаю с…", "запускаю X сейчас" then stops). Announcing a NEW unit is named-next even if it says "сейчас"; only continuing the SAME step already underway is in-flight (see APPROVE).',
    '- DEFERS remaining work to later passes/turns ("несколько заходов", "за раз не закрыть", "в следующем ходе", "веду дальше" as a sign-off).',
    '- FAKE HAND-OFF: hands the next ACTION or a task PICK to the user ("скажешь — сделаю", "решать тебе", "жду твоего слова", "назови задачу", "какую взять", "что брать первым", "твой приоритет") to avoid working. When a NEXT OPEN TASK is identified above, asking "which task / which spec should I take or prioritize FIRST?" is NEVER genuine — the agent PICKS that offered task itself and does it. This bans only TASK/SPEC PRIORITIZATION asks — choosing WHICH of the offered open tasks to do first, within ONE spec OR across MULTIPLE specs (owner 2026-06-25 «что брать первым — не вопрос для юзера»). It does NOT ban a genuine DESIGN choice / irreversible trade-off (e.g. «Postgres или Mongo?», «в проде или нет?») — that IS a real owner-decision → APPROVE (see below).',
    '- Claims the WHOLE spec/feature is done/shipped while scope-open tasks remain.',
    '- ENDS on a PAST-tense STATUS / SUMMARY of work just DONE ("сделал X", "готово N из M", "закоммитил", "перекличка зелёная") while OPEN TASKS REMAIN, even with NO next step named. A proactive status-and-stop while work is left is THE bypass; reporting finished progress is not finishing. (NOT the same as a present-tense continuation of the current step — see in-flight in APPROVE.) IMPORTANT EXCEPTION: when the user asked for ANALYSIS / REPORT / REVIEW only, a past-tense «разбор готов / отчёт готов» IS the requested deliverable, NOT lazy status → APPROVE via the analysis carve-out below.',
    '- SELF-AUTHORIZED SKIP (отмазка под видом принципа): on its OWN authority decides that remaining IN-SCOPE, DOABLE work should be skipped / kept / left-undone, DRESSED AS PRINCIPLE — "оставляю X", "это keep-класс", "не имеет смысла мигрировать", "гонять агентов = слив токенов", "это out of scope" BY THE AGENT\'S OWN JUDGMENT. The agent is NOT the scope authority. A reasoned "оставляю/keep X because Y" is STILL a lazy stop when X is doable and in scope — well-argued laziness is the trickiest bypass. This ALSO covers the agent DECLARING its own work «заблокировано / отложено / parked / backlog / не делается» on its OWN say-so — a self-declared blocker is the agent\'s UNVERIFIABLE claim (the same class as the fabricated blocker), a real reason to stop ONLY with a verifiable EXTERNAL blocker (evidence the agent could not fabricate) OR the owner\'s words. → BLOCK: DO the work. EXCEPTIONS (NOT a self-skip): (a) the user asked for ANALYSIS/REPORT/REVIEW only, so "реализацию не трогаю" is the CORRECT scope → see the analysis carve-out; (b) the OWNER\'s OWN words (the fact above) scoped X out → see the owner-directed carve-out.',
    '',
    `APPROVE only if ONE clearly holds (scope-open tasks: ${i.openTasks} — weigh it hard):`,
    '- ANSWERING the user, or asking ONE GENUINE owner-decision — a fork ONLY the owner can resolve: a design choice or an irreversible trade-off (data loss, prod, public release). A real back-and-forth, NOT a self-initiated sign-off. «Which task / which spec to do or prioritize FIRST» is NOT such a fork — the agent picks the NEXT OPEN TASK itself and does it (owner 2026-06-25 «что брать первым — не вопрос для юзера»). Prioritizing among offered open work — within one spec OR across specs — is never the user\'s call.',
    '- ANALYSIS/REPORT/PLAN/REVIEW the user EXPLICITLY asked for: if the user\'s LAST request (fact above) was for analysis / report / plan / review ONLY — NOT "implement / fix / build / migrate / делай" — then a stop that DELIVERS that analysis is CORRECT → APPROVE. This HOLDS even if it ends by handing the decision back to the owner («жду твоего решения», «что чинить первым — решай ты»): when the user scoped the turn to analysis-only («пока не чини»), the agent CANNOT implement (out of scope), so returning the next decision to the owner is the correct end, NOT a fake prioritization hand-off. (Factual claims in it still need a proof or an explicit [UNVERIFIED], but no further WORK is owed.)',
    '- TRULY blocked: the next step needs an external input ONLY the owner can give (a credential / access / secret only they hold, a no-safe-default decision) AND the message SHOWS the agent already tried its own options (a tried-and-failed attempt, a shown 401 / dead-end) → APPROVE. A genuine «I tried X, Y, Z — all failed, need your token» is a legitimate stop. (The bare version — «нужен твой X» / «это за тобой» / «только ты снимешь» for a FIXABLE thing with NO shown attempt — is the OPPOSITE: a self-declared blocker offloaded onto the owner, caught by SELF-AUTHORIZED SKIP above → BLOCK «делай сам».)',
    '- SKIP DIRECTED BY THE OWNER (VERIFIABLE): the skip is backed by the OWNER\'S OWN words — the user\'s LAST request (fact above) explicitly scoped X out ("держи X вне скоупа", "owner scoped X out", "X — не твоя задача"). That is the OWNER deciding, verifiable in the fact, not the agent\'s unverifiable claim → APPROVE. But: the agent merely ASKING "do X or skip it, it\'s doable but costly?" is NOT this carve-out — doable in-scope work is just DONE, not negotiated down → BLOCK. And a bare "ты сказал вне скоупа" with NO matching owner-words in the fact is an unverifiable claim → BLOCK.',
    '- LEGITIMATELY AWAITING ASYNC: the "background task launched THIS turn" fact is YES and the message is waiting for that result. APPROVE when EITHER (i) it names NO other concrete next task ("жду результат, сам пока ничего сделать не могу"), OR (ii) the named next step CONSUMES that pending result — the fact "named next step consumes the pending bg result" is YES, or the text says it will act WHEN/IF the result lands ("когда придёт — обработаю/коммичу", "если 19/19 — коммичу", "по результату сверю"). A result-dependent next step CANNOT run until the callback fires, so it is a legit wait, NOT announce-and-stop → APPROVE. But WAITING IS NOT A BLANKET LICENSE: if it names a SEPARATE next task it could do NOW that does NOT need the bg result ("возьму следующую — X", "дальше беру Y", "если не скажешь иную приоритетность"), that is announce-and-stop → BLOCK — do that non-blocking work now.',
    '- IN-FLIGHT CONTINUATION of the CURRENT step right now: present-tense "doing it this moment" on an action already underway ("продолжаю прогон сейчас", "дочитываю", "гоняю проверку сейчас") that names NO new deferred unit and is NOT a past-tense done-report → APPROVE. Being mid-action is correct, not lazy — even with open tasks.',
    '- Genuinely NOTHING left: scope shows ZERO open tasks AND the message is a clean done.',
    '',
    'Tie-breaker: named-next that it could do NOW (even "X сейчас", and even while "waiting for a background task" — a SEPARATE task that does NOT need the bg result is announce-and-stop) / deferred-to-later / handed-to-user-to-pick-WHICH-task-or-WHICH-spec-to-do-first (the agent picks the NEXT OPEN TASK itself, never asks) / self-authorized SKIP of doable in-scope work (agent decided to keep/skip on its own, however well-argued) / OFFLOADING a FIXABLE thing onto the owner («нужен твой X» / «это за тобой» with NO shown attempt to do it itself — handled as the negative of TRULY-blocked) / WEAKENING the gate (edited the gate\'s own files when the task is something ELSE; self-marking own work blocked/backlog) / PAST-tense status-while-open → BLOCK, no matter how many tools ran. APPROVE only: answering-the-user / one genuine owner-decision (design fork / irreversible trade-off / owner-directed-or-owner-ASKED skip) / truly-blocked / awaiting-async (bg launched THIS turn — incl. a next step that CONSUMES the pending result, e.g. "когда придёт — коммичу", which can\'t run until it lands) / PRESENT-tense in-flight continuation of the SAME current step / scope-is-ZERO-and-done. Decider when ambiguous: is a CURRENT action explicitly in progress right now (continuation), or is this a finished report / a NEW unit named? in-progress → APPROVE; finished-or-new → BLOCK.',
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
