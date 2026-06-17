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
import { readTaskCensusCache } from '../spec-graph/task-census.ts';
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
const SELF_MARKERS = ['claim-evidence-gate', 'deferred-work', 'пинатор', 'ДОДЕЛЫВАЙ'];
const LOG_PREFIX = 'CLAIM-EVIDENCE-GATE';
// FR-49e: loose lexical net for "the turn ended on a progress/completion/continuation
// claim" — the cheap gate for escalating to the Meridian judge (also requires the census
// to show unfinished work, so the judge fires RARELY, never on a clean done or a question).
const GRAY_SIGNAL = /(готов|сделал|закоммич|закрыл|реализова|продолж|дальше|двину|перехож|беру|next\b|done\b|commit|fixed|finish|ship|complete|wrap)/i;

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
function censusReminder(repoRoot: string): string | null {
  try {
    const c = readTaskCensusCache(repoRoot);
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

  let unsupported = firstUnsupported(claimText, toolUses, config.minSearch);
  // FR-49b: a WHOLE-SPEC "done" claim while the task-census shows unfinished work is a
  // false-close — block even when tools ran and there is no defer phrasing (the gap the
  // text classes miss). Tightly spec-scoped: isSpecCompletionClaim is whole-spec (not
  // per-task) AND requires a REAL unfinished census, so a non-spec "fixed it" never trips it.
  const censusMsg = isSpecCompletionClaim(claimText) ? censusReminder(repoRoot) : null;
  if (!unsupported && censusMsg) {
    unsupported = { cls: 'spec-false-close', need: censusMsg };
  }

  // FR-49e: gray-zone judge. The fast layer (regex + census fact) did not block, but the
  // turn ended on a progress/completion/continuation claim while the census shows unfinished
  // work. Escalate to the Meridian Haiku judge — it catches premature-stop phrasings the regex
  // can't match. ON by default (parity: enabled for every user like the rest of the gate); set
  // CLAIM_GATE_JUDGE=false to disable. FAIL-OPEN if Meridian is down — judgeStop returns null
  // (fetch ECONNREFUSED is instant, no hang), so a user without the proxy keeps the fast-layer
  // approve at zero cost. Fires RARELY (gray signal + unfinished census).
  if (!unsupported && (process.env.CLAIM_GATE_JUDGE ?? 'true').toLowerCase() === 'true') {
    const census = readTaskCensusCache(repoRoot);
    const unfinished = census ? census.total.open + census.total.doneRed + census.total.doneUnrun : 0;
    if (unfinished > 0 && GRAY_SIGNAL.test(claimText)) {
      // A TRANSIENT judge failure (timeout / network blip → null) must NOT be a free
      // pass — that fail-open was the actual escape route. Evidence (3× probe 2026-06-15):
      // the judge BLOCKS the announce-and-stop phrasings when it RUNS, but intermittently
      // null-failed → approve, so a premature stop slipped and the USER had to pin. Retry
      // ONCE before honouring the fail-open. Users without Meridian still fail-open fast:
      // ECONNREFUSED is instant, so a second instant miss costs ~nothing and still approves.
      const jInput = { finalMessage: claimText, tools: toolUses.map((t) => t.name), openTasks: census!.total.open };
      let verdict = await judgeStop(jInput);
      if (verdict === null) verdict = await judgeStop(jInput);
      if (verdict?.block) unsupported = { cls: 'judge-block', need: verdict.reason };
      // verdict null twice (proxy down / persistent fail) or block:false → fall through to approve
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
  writeMarkerAtomic(mp, { hash: currentHash, timestamp: new Date().toISOString(), count: newCount });

  log('INFO', `blocking ${unsupported.cls} (attempt ${newCount})`);
  const censusTail = censusMsg && unsupported.cls !== 'spec-false-close' && unsupported.cls !== 'judge-block' ? `\n📋 ${censusMsg}` : '';
  if (unsupported.cls === 'judge-block') {
    block(
      `⚠️ ${SELF_MARKER}: судья (Meridian) счёл это преждевременным стопом — ${unsupported.need}\n` +
        `Доделай начатое В ЭТОМ ХОДЕ или назови ОДИН конкретный следующий шаг. Не перекладывай на пользователя.`,
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
