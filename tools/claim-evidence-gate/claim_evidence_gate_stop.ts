#!/usr/bin/env npx tsx
/**
 * Claim-Evidence Gate — Stop hook.
 *
 * On agent Stop: read the current turn window (final assistant message + the tool_uses
 * issued since the user last spoke). If the message presents a RESULT-class claim —
 *   - analysis-verdict: a grid of PASS/FAIL verdicts
 *   - works-done: "работает / фикс деплоен / готово"
 *   - not-found-impossible: "не нашёл / не существует / архитектурно невозможно"
 *   - verified-marker: a literal [VERIFIED via X]
 * — but NO matching tool was actually run this turn, BLOCK the stop and tell the agent to
 * run the real check first. This catches the failure that motivated the gate: presenting a
 * fact-check verdict table without ever running fact-check.
 *
 * It ALSO kicks «доделывай» — but that is now the Meridian Haiku JUDGE's job (FR-49e), not a
 * regex. When the turn ends on a progress/completion claim while the census shows unfinished
 * work, the judge decides block-vs-approve by UNDERSTANDING ("беру дальше пункт N", "скажешь —
 * сделаю", "это несколько заходов" → BLOCK). No tool excuses it — stopping with a declared
 * remainder is the failure; the agent must finish in-turn (cooldown + maxRetries release a
 * genuinely-blocked step). The brittle deferred-work regex was removed (it missed real stalls
 * AND false-fired on honest reports); judge-bench.ts pins the judge's behaviour instead.
 *
 * Modes (CLAIM_GATE_ENABLED): "true" (enforce, default) | "shadow" (log only, never block)
 * | "false" (off). Every detection is appended to .dev-pomogator/.claim-evidence-gate-fires.jsonl.
 *
 * Anti-loop: hash the claim; same text → approve; max retries within cooldown → approve;
 * self-marker in the message → approve. Fail-open: any error → approve.
 */

import fs from 'node:fs';
import path from 'node:path';

import { log as _logShared, normalizePath } from '../_shared/hook-utils.ts';
import { markerPath, readMarker, writeMarkerAtomic, isWithinCooldown, hashFileList } from '../_shared/marker-utils.ts';
import { extractTurnWindow } from './turn_window.ts';
import { firstUnsupported, isSpecCompletionClaim } from './claim_classifier.ts';
import { readTaskCensusCache, scopeCensusToSlugs, sessionEditedSpecSlugs, type TaskCensusCache } from '../spec-graph/task-census.ts';
import { judgeStop } from './meridian-judge.ts';

interface StopHookInput {
  cwd?: string;
  workspace_roots?: string[];
  transcript_path?: string;
  stop_hook_active?: boolean;
  session_id?: string;
}

const MARKER_DIR = '.dev-pomogator';
const MARKER_FILENAME = '.claim-evidence-gate-marker.json';
const FIRES_FILENAME = '.claim-evidence-gate-fires.jsonl';
const SELF_MARKER = 'claim-evidence-gate';
// Self-reference skip: when a message is ABOUT this gate (reporting on it,
// quoting its trigger phrases as examples) it must not trigger the gate — including
// being escalated to the judge. The original single English marker missed Russian
// meta-discussion ("пинатор", "ДОДЕЛЫВАЙ", "deferred-work"), which false-fired on a
// completion report that merely DESCRIBED the gate. Low gaming-risk: these are the
// gate's OWN vocabulary, not words a genuine deferral ("беру дальше пункт 1") contains.
// NOTE (2026-06-17, user decision): the casual «пинатор»/«ДОДЕЛЫВАЙ» were REMOVED — they granted a
// FREE STOP to ANY message merely mentioning the kicker, which is how recent premature stops
// slipped. Scoped now to the gate's PRECISE internals only; genuine meta-reports that don't quote
// them are still covered by the judge's own answer/clarifying carve-out.
const SELF_MARKERS = ['claim-evidence-gate', 'deferred-work'];
const LOG_PREFIX = 'CLAIM-EVIDENCE-GATE';
// FR-49e: loose lexical net for "the turn ended on a progress/completion/continuation
// claim" — the cheap gate for escalating to the Meridian judge (also requires the census
// to show unfinished work, so the judge fires RARELY, never on a clean done or a question).
const GRAY_SIGNAL = /(готов|сделал|закоммич|закрыл|реализова|продолж|дальше|двину|перехож|беру|next\b|done\b|commit|fixed|finish|ship|complete|wrap)/i;
// Require-next-section (user 2026-06-17): a stop while work remains MUST carry a concrete
// «Дальше / what's next» section. Recognised as a heading / bold / line lead-in — deterministic,
// so the «без дальше» omission bypass can't slip (no LLM, no fail-open).
// NOTE: no `\b` after a Cyrillic word — in JS (no `u` flag) Cyrillic isn't `\w`, so `дальше\b`
// never matches "Дальше:". Each alternative is anchored to a LINE lead-in (after ≤4 spaces and an
// optional heading/bold/bullet marker) so a casual mid-sentence "дальше" does NOT count as a section.
const NEXT_SECTION_RE =
  /(?:^|\n)[ \t]{0,4}(?:#{1,6}[ \t]*|\*\*[ \t]*|[-*][ \t]+)?(?:(?:что[ \t-]+)?дальше|следующ(?:ий|ие)[ \t]+шаг|next[ \t]+steps?\b|next[ \t]*:)/i;

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

function getConfig() {
  const mode = (process.env.CLAIM_GATE_ENABLED ?? 'true').toLowerCase();
  return {
    mode: mode === 'false' ? 'false' : mode === 'shadow' ? 'shadow' : 'true',
    cooldownMinutes: parseInt(process.env.CLAIM_GATE_COOLDOWN_MINUTES || '2', 10) || 2,
    maxRetries: parseInt(process.env.CLAIM_GATE_MAX_RETRIES || '2', 10) || 2,
    minSearch: parseInt(process.env.CLAIM_GATE_MIN_SEARCH || '2', 10) || 2,
    // FR-11: release after this many CONSECUTIVE zero-tool kicks (the agent is spinning on narrative,
    // doing no observable work). Bounds the loop by work-delta, not the time-delta cooldown cap.
    noProgressCap: parseInt(process.env.CLAIM_GATE_NO_PROGRESS_CAP || '3', 10) || 3,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function approve(): void {
  process.stdout.write('{}');
}
function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

function logFire(repoRoot: string, entry: Record<string, unknown>): void {
  try {
    const p = path.join(repoRoot, MARKER_DIR, FIRES_FILENAME);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  } catch {
    /* logging is best-effort */
  }
}

/**
 * FR-49b: the real unfinished-work tally from the task-census cache (the same cache
 * the per-prompt banner reads — cheap JSON, never builds the graph). Null when the
 * cache is absent or everything is finished. Fail-open on any error.
 */
function censusReminder(c: TaskCensusCache | null): string | null {
  try {
    if (!c) return null;
    const t = c.total;
    if (t.open + t.doneRed + t.doneUnrun === 0) return null;
    const parts = [`${t.open} в работе`];
    if (t.doneRed) parts.push(`${t.doneRed} 🔴 done-but-red`);
    if (t.doneUnrun) parts.push(`${t.doneUnrun} ⏸ done-but-not-run`);
    const top = c.specs[0];
    const next = top?.nextOpen ? ` Следующее: ${top.nextOpen.title} [${top.nextOpen.id}].` : '';
    return `перепись (${c.ts}): ${parts.join(', ')} незакрыто${top ? `, самая нагруженная — ${top.slug}` : ''}.${next}`;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const config = getConfig();
  if (config.mode === 'false') return approve();

  const raw = await readStdin();
  if (!raw.trim()) return approve();

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    log('ERROR', `bad stdin: ${raw.slice(0, 120)}`);
    return approve();
  }

  // NOTE: we do NOT blanket-approve when stop_hook_active===true. That short-circuit
  // (the usual infinite-loop guard) let a SECOND premature stop sail through after the
  // gate fired once — the agent got blocked, did a little work, then announced-and-stopped
  // again and the judge never ran (incident 2026-06-14: «беру его… перейду к FR-18» passed).
  // Instead we KEEP judging every continuation stop and bound the loop with the marker
  // anti-loop below (same-hash → approve; per-cooldown cap → approve), so a fresh premature
  // re-stop is still caught while a genuine repeat / runaway still terminates.
  const inContinuation = input.stop_hook_active === true;
  const tx = input.transcript_path;
  if (!tx || !fs.existsSync(tx)) return approve();

  let rawTranscript = '';
  try {
    rawTranscript = fs.readFileSync(tx, 'utf-8');
  } catch {
    return approve();
  }

  const { claimText, toolUses } = extractTurnWindow(rawTranscript);
  if (!claimText.trim() || SELF_MARKERS.some((m) => claimText.includes(m))) return approve();

  const repoRoot = normalizePath(input.cwd || input.workspace_roots?.[0] || process.cwd());

  // FR-9 (2026-06-18): scope the unfinished-work census to specs THIS session actually WROTE
  // (transcript-derived), NOT the global corpus backlog — otherwise the gate stays permanently
  // armed by other specs' open tasks in any non-empty repo. A pure-analysis session that edited
  // no spec scopes to ZERO → the census/judge precondition is false → the gate does not fire.
  const editedSlugs = sessionEditedSpecSlugs(tx);
  const globalCensus = readTaskCensusCache(repoRoot);
  const scoped: TaskCensusCache | null = globalCensus
    ? { ...scopeCensusToSlugs(globalCensus, editedSlugs), ts: globalCensus.ts }
    : null;

  // FR-10/FR-11: observable, agent-INDEPENDENT facts about THIS turn (the harness writes the tool_use
  // records; the agent cannot fabricate them). mutating = real changes attempted this turn (judge
  // input, FR-10); bg = a background task launched (the agent may legitimately be awaiting its async
  // result). Deliberately NOT a git-tree hash: the shared worktree always looks "changed" (audit §5).
  const MUTATING_TOOL = /^(edit|write|multiedit|notebookedit|bash|powershell)$/i;
  const isDoorWrite = /^mcp__.*__(apply_spec_change|create_spec|delete_spec_doc|rename_spec_doc|set_entity_status|archive_spec)$/;
  const mutatingToolsThisTurn = toolUses.filter((t) => MUTATING_TOOL.test(t.name) || isDoorWrite.test(t.name)).length;
  const bgTaskLaunchedThisTurn = toolUses.some((t) => t.input.includes('"run_in_background":true'));

  let unsupported = firstUnsupported(claimText, toolUses, config.minSearch);
  // FR-49b: a WHOLE-SPEC "done" claim while the task-census shows unfinished work is a
  // false-close — block even when tools ran and there is no defer phrasing (the gap the
  // text classes miss). Tightly spec-scoped: isSpecCompletionClaim is whole-spec (not
  // per-task) AND requires a REAL unfinished census, so a non-spec "fixed it" never trips it.
  const censusMsg = isSpecCompletionClaim(claimText) ? censusReminder(scoped) : null;
  if (!unsupported && censusMsg) {
    unsupported = { cls: 'spec-false-close', need: censusMsg };
  }

  // Require-next-section (user 2026-06-17): DETERMINISTIC — no LLM, no fail-open. On a stop while
  // the census shows open work, a progress/completion claim MUST carry a concrete «Дальше:» section.
  // Absent it → block, regardless of judge availability. This is the unbypassable core that closes
  // the «без дальше» omission bypass; a message WITH the section then still goes to the judge below,
  // which checks the next step is genuine (not пиздёж).
  if (!unsupported) {
    const open = scoped ? scoped.total.open + scoped.total.doneRed + scoped.total.doneUnrun : 0;
    if (open > 0 && GRAY_SIGNAL.test(claimText) && !NEXT_SECTION_RE.test(claimText)) {
      unsupported = { cls: 'no-next-section', need: 'в ответе при незакрытой работе нет секции «Дальше:» с конкретным следующим шагом' };
    }
  }

  // FR-49e: gray-zone judge. The fast layer (regex + census fact + require-next-section) did not
  // block, but the turn ended on a progress/completion/continuation claim while the census shows
  // unfinished work. Escalate to the ПОМОГАТОР Haiku judge (the project's existing OpenAI-compatible
  // LLM integration — OPENROUTER_API_KEY/AUTO_COMMIT_API_KEY) — it catches premature-stop phrasings
  // the regex can't match. ON by default; set CLAIM_GATE_JUDGE=false to disable. SINGLE real path —
  // no mock, no secondary fallback endpoint (user 2026-06-17 «никаких моков и фолбеков»). judgeStop
  // logs WHY to stderr and returns null when помогатор is unreachable. Fires RARELY.
  if (!unsupported && (process.env.CLAIM_GATE_JUDGE ?? 'true').toLowerCase() === 'true') {
    const unfinished = scoped ? scoped.total.open + scoped.total.doneRed + scoped.total.doneUnrun : 0;
    if (unfinished > 0 && GRAY_SIGNAL.test(claimText)) {
      // A TRANSIENT judge failure (timeout / network blip → null) must NOT be a free pass —
      // that fail-open was the actual escape route. The judge BLOCKS the announce-and-stop
      // phrasings when it RUNS, but an intermittent null → approve let a premature stop slip and
      // the USER had to pin. Retry ONCE before honouring the fail-closed below. A user with no
      // помогатор token fails fast (no-token is instant), so a second miss costs ~nothing.
      // FR-10: feed the observable, agent-independent turn facts (computed above) to the judge so it
      // weighs them FIRST — the message text is secondary narrative the agent can polish.
      const jInput = {
        finalMessage: claimText,
        tools: toolUses.map((t) => t.name),
        openTasks: scoped!.total.open,
        mutatingToolsThisTurn,
        bgTaskLaunchedThisTurn,
      };
      let verdict = await judgeStop(jInput);
      if (verdict === null) verdict = await judgeStop(jInput);
      if (verdict?.block) {
        unsupported = { cls: 'judge-block', need: verdict.reason };
      } else if (verdict === null) {
        // NO free stop when помогатор is unreachable. A null verdict (no token / endpoint down /
        // unparseable — judgeStop logs WHY to stderr) used to fall through to approve — the last
        // bypass. User decision 2026-06-17 («нельзя обойти»): a gray progress/completion claim while
        // the census shows open work, with NO judge to clear it, is an unconfirmed stop → BLOCK
        // deterministically. The anti-loop cap below bounds it, so a genuinely-offline user is
        // released after a few kicks rather than hung (and CLAIM_GATE_JUDGE=false disables it).
        unsupported = {
          cls: 'judge-unavailable',
          need: `помогатор-судья недоступен (см. stderr — почему), а перепись показывает ${scoped!.total.open} открытых задач (scope сессии) — стоп не подтверждён`,
        };
      }
      // verdict.block === false (a reachable judge CLEARED the stop) → fall through to approve
    }
  }

  if (!unsupported) return approve();

  logFire(repoRoot, {
    ts: new Date().toISOString(),
    class: unsupported.cls,
    need: unsupported.need,
    detail: unsupported.detail ?? null,
    tool_uses: toolUses.map((t) => t.name),
    claim_snippet: claimText.replace(/\s+/g, ' ').slice(0, 200),
    mode: config.mode,
    session_id: input.session_id ?? null,
    cwd: repoRoot,
  });

  if (config.mode === 'shadow') {
    log('INFO', `shadow: would block ${unsupported.cls}`);
    return approve();
  }

  // Anti-loop bookkeeping.
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const marker = readMarker(mp);
  const currentHash = hashFileList([claimText]);
  if (marker && marker.hash === currentHash) return approve(); // same message re-submitted

  // FR-11 (no-progress release, decision 3 — closes audit root-cause #1). The time-based cap below
  // does NOT terminate the loop when kicks are >cooldown apart: 86% of real kicks reset `count` to 1,
  // so `newCount > cap` never fires. Bound the loop by WORK-DELTA instead of time-delta: count
  // CONSECUTIVE kicks in which the agent ran ZERO tools (the audit's loop signature — `tools=[-]`,
  // pure narrative re-spin), and once it has clearly stopped moving, RELEASE — kicking a stuck agent
  // only burns tokens. The streak lives in the marker and resets ONLY when the agent runs a tool
  // (observable work), never on a time pause — so >cooldown gaps can no longer un-bound it. Also
  // release when the agent launched a background task this turn: it is legitimately awaiting an async
  // result and physically cannot proceed (the false-positive that bit the session). Both signals are
  // harness-recorded, not agent narrative — they cannot be gamed by polishing the stop message.
  const ranNoTools = toolUses.length === 0;
  const noProgressStreak = ranNoTools ? (marker?.noProgressStreak ?? 0) + 1 : 0;
  // FR-13 precedence seam: when a long-running tool is active AND its on-disk output is frozen, this
  // is where it must escalate to a human (block → AskUserQuestion) INSTEAD of silently releasing.
  // Added in FR-13; until then a stalled wait simply releases.
  if (bgTaskLaunchedThisTurn || noProgressStreak >= config.noProgressCap) {
    const why = bgTaskLaunchedThisTurn
      ? 'awaiting async (bg task launched this turn)'
      : `no work-delta across ${noProgressStreak} consecutive zero-tool kicks`;
    log('INFO', `FR-11 release: ${why}`);
    writeMarkerAtomic(mp, { hash: currentHash, timestamp: new Date().toISOString(), count: marker?.count ?? 1, noProgressStreak });
    return approve();
  }

  const within = marker ? isWithinCooldown(marker.timestamp, config.cooldownMinutes) : false;
  const newCount = within ? (marker?.count ?? 0) + 1 : 1;
  // Kick HARDER during a continuation chain (the agent is mid-turn re-stopping — that is
  // exactly when it tries to slip a premature stop past us), but still guarantee the loop
  // terminates. Fresh turns keep the gentle maxRetries (default 2).
  const cap = inContinuation ? Math.max(config.maxRetries, 6) : config.maxRetries;
  if (within && newCount > cap) {
    log('INFO', `retry cap (${cap}${inContinuation ? ', continuation' : ''}) in cooldown → approve`);
    return approve();
  }
  writeMarkerAtomic(mp, { hash: currentHash, timestamp: new Date().toISOString(), count: newCount, noProgressStreak });

  log('INFO', `blocking ${unsupported.cls} (attempt ${newCount})`);
  const censusTail = censusMsg && unsupported.cls !== 'spec-false-close' && unsupported.cls !== 'judge-block' ? `\n📋 ${censusMsg}` : '';
  if (unsupported.cls === 'judge-block') {
    block(
      `⚠️ ${SELF_MARKER}: судья (Meridian) счёл это преждевременным стопом — ${unsupported.need}\n` +
        `Доделай начатое В ЭТОМ ХОДЕ или назови ОДИН конкретный следующий шаг. Не перекладывай на пользователя.`,
    );
  } else if (unsupported.cls === 'judge-unavailable') {
    block(
      `⚠️ ${SELF_MARKER}: ${unsupported.need}.\n` +
        `Не останавливайся на статусе — сделай следующий шаг СЕЙЧАС, в этом ходе. ` +
        `Стоп только если работа реально закончена ИЛИ нужен ввод, который можешь дать только ты.`,
    );
  } else if (unsupported.cls === 'no-next-section') {
    block(
      `⚠️ ${SELF_MARKER}: ${unsupported.need}.\n` +
        `Каждый ответ при незакрытой работе ОБЯЗАН содержать секцию «Дальше:» с КОНКРЕТНЫМ следующим шагом (без воды). ` +
        `Допиши её — и сделай этот шаг сейчас, не просто назови.`,
    );
  } else if (unsupported.cls === 'spec-false-close') {
    block(
      `⚠️ ${SELF_MARKER}: ты заявил завершение СПЕКИ/фичи, но ${unsupported.need}\n` +
        `Не закрывай как «готово» — доделай открытое или назови ОДИН конкретный следующий шаг. ` +
        `GREEN-вердикт = «нет вранья про готовность», НЕ «спека закончена».`,
    );
  } else {
    block(
      `⚠️ ${SELF_MARKER}: ты заявил результат (${unsupported.cls}), но в этом ходе нет улики, которая его породила.\n` +
        `Нужно: ${unsupported.need}.\n` +
        `Сначала реально прогони проверку, потом заявляй — либо явно пометь [UNVERIFIED] если проверить нельзя.${censusTail}`,
    );
  }
}

main()
  .catch((err) => {
    log('ERROR', `unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => process.exit(0));
