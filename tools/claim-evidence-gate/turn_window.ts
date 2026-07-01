/**
 * Turn-window extraction for the claim-evidence gate.
 *
 * The "current turn" = everything in the transcript AFTER the last REAL user message
 * (a user turn that is actual typed text, not a tool_result echo). We collect both the
 * final assistant TEXT (the claim) and every tool_use issued in that window (the evidence).
 *
 * The window is bounded by USER messages, not by assistant turns: a flow of
 * "user asks → assistant runs Bash → assistant posts a verdict table" all lives in ONE
 * window, so reporting results right after running the tool is correctly seen as supported.
 * A block only happens when a result is claimed with NO tool run since the user last spoke.
 *
 * Sidechain (subagent) lines are excluded from the claim text and the evidence scan; the
 * parent Task/Agent tool_use that spawned them lives in the main chain and counts instead.
 */

export interface ToolUse {
  name: string; // lowercased tool name, e.g. "bash", "grep", "mcp__octocode__..."
  input: string; // serialized + lowercased input, for cheap substring checks
}

export interface TurnWindow {
  claimText: string;
  toolUses: ToolUse[];
}

interface TranscriptLine {
  type?: string;
  isSidechain?: boolean;
  // FR-28: harness-set markers that distinguish injected user-role messages from genuinely-typed prompts.
  isMeta?: boolean;
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
  promptSource?: string;
  message?: { role?: string; content?: unknown };
}

const MAX_LINE_BYTES = 1_000_000; // skip pathological giant lines (huge tool_result blobs)

function parseLines(raw: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.length > MAX_LINE_BYTES) continue;
    try {
      out.push(JSON.parse(line) as TranscriptLine);
    } catch {
      /* skip corrupt line — fail toward fewer false blocks */
    }
  }
  return out;
}

function role(e: TranscriptLine): string | undefined {
  return e.type ?? e.message?.role;
}

function contentBlocks(e: TranscriptLine): Array<Record<string, unknown>> {
  const c = e.message?.content;
  if (Array.isArray(c)) return c as Array<Record<string, unknown>>;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return [];
}

/** A real user turn = user role whose content has typed text and is not a tool_result echo. */
function isRealUser(e: TranscriptLine): boolean {
  if (role(e) !== 'user') return false;
  const c = e.message?.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (!Array.isArray(c)) return false;
  const hasText = c.some((b: any) => b?.type === 'text' && typeof b.text === 'string' && b.text.trim());
  const hasToolResult = c.some((b: any) => b?.type === 'tool_result');
  return hasText && !hasToolResult;
}

function assistantText(e: TranscriptLine): string {
  return contentBlocks(e)
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text as string)
    .join('\n');
}

export function extractTurnWindow(rawTranscript: string): TurnWindow {
  const lines = parseLines(rawTranscript);

  // boundary = last real (non-sidechain) user message
  let boundary = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].isSidechain && isRealUser(lines[i])) {
      boundary = i;
      break;
    }
  }

  const mainWindow = lines.slice(boundary + 1).filter((e) => !e.isSidechain);

  // claim = last assistant text block in the main-chain window
  let claimText = '';
  for (let i = mainWindow.length - 1; i >= 0; i--) {
    if (role(mainWindow[i]) === 'assistant') {
      const t = assistantText(mainWindow[i]);
      if (t.trim()) {
        claimText = t;
        break;
      }
    }
  }

  // evidence = every tool_use issued by main-chain assistant lines in the window
  const toolUses: ToolUse[] = [];
  for (const e of mainWindow) {
    if (role(e) !== 'assistant') continue;
    for (const b of contentBlocks(e)) {
      if (b?.type === 'tool_use') {
        let input = '';
        try {
          input = JSON.stringify((b as any).input ?? '').toLowerCase();
        } catch {
          input = '';
        }
        toolUses.push({ name: String((b as any).name ?? '').toLowerCase(), input });
      }
    }
  }

  return { claimText, toolUses };
}

/**
 * General "a background job is still in flight" signal (V1+V2, generalized 2026-06-20 — the bg job
 * is NOT necessarily a test; it can be a build / migration / docker run / any `run_in_background`
 * Bash, or a backgrounded Agent spawn). Within the CURRENT turn-window, count background LAUNCHES
 * (a tool_use whose input has run_in_background === true) against the bg COMPLETION records the
 * harness injects when a bg task finishes ("<status>completed</status>" / "Background command …
 * completed (exit code …)"). More launches than completions ⇒ at least one job hasn't finished ⇒
 * the agent is legitimately awaiting it and physically cannot proceed. Both sides are harness-
 * recorded, not agent narrative → ungameable. Window-scoped so it is bounded and cheap. (The
 * `.bg-task-active` marker the pinator also reads is the test-runner wrapper's belt-and-suspenders
 * for a job that spans a user message, where the window resets.)
 */
const BG_COMPLETION_RE = /<status>\s*completed\s*<\/status>|background command[^<]{0,200}?completed\s*\(exit code/i;
export function bgInFlightInWindow(rawTranscript: string): boolean {
  const lines = parseLines(rawTranscript);
  let boundary = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].isSidechain && isRealUser(lines[i])) {
      boundary = i;
      break;
    }
  }
  const win = lines.slice(boundary + 1).filter((e) => !e.isSidechain);
  let launched = 0;
  let completed = 0;
  for (const e of win) {
    // launches: count ONLY structural assistant tool_use blocks (a tool_result echoing the input
    // must not double-count). Any backgrounded tool — Bash, Agent/Task — sets input.run_in_background.
    if (role(e) === 'assistant') {
      for (const b of contentBlocks(e)) {
        const bb = b as Record<string, unknown>;
        if (bb?.type === 'tool_use') {
          const inp = bb.input as Record<string, unknown> | undefined;
          if (inp && typeof inp === 'object' && inp.run_in_background === true) launched++;
        }
      }
    }
    // completions: the harness injects them as a separate message; scan the whole serialized line so
    // we are robust to whether it lands as a tool_result, user text, or system block.
    let serialized = '';
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = '';
    }
    if (serialized && BG_COMPLETION_RE.test(serialized)) completed++;
  }
  return launched > completed;
}

/**
 * Residual (c) fix (2026-06-21): a backgrounded COMMAND (a `run_in_background` Bash — Docker test /
 * build / long task) launched in an EARLIER turn whose wait spans a user (or gate-feedback) message that
 * RESETS the turn window. `bgInFlightInWindow` is window-scoped, so it loses that launch and the gate
 * falsely kicks a legitimately-waiting stop — it bit the gate's own author repeatedly during Docker
 * waits. This whole-transcript companion survives window resets: find the LAST `run_in_background` launch
 * and the LAST bg-COMPLETION record (the harness's «<status>completed</status>» / «Background command …
 * completed»); if the last launch is AFTER the last completion, a bg job is still pending → awaiting.
 * Position-based (not a naive total count), so a completion clears everything before it — and it errs
 * toward OVER-defer, the SAFE direction here (the owner's complaint is over-FIRE, never under). Both
 * sides are harness-recorded → ungameable.
 */
export function bgCommandInFlight(rawTranscript: string): boolean {
  const lines = parseLines(rawTranscript);
  let lastLaunchIdx = -1;
  let lastCompletionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    if (e.isSidechain) continue;
    if (role(e) === 'assistant') {
      for (const b of contentBlocks(e)) {
        const bb = b as Record<string, unknown>;
        if (bb?.type !== 'tool_use') continue;
        // ONLY backgrounded shell commands — Agent/Task are handled by agentBgInFlightCount (paired by
        // tool_use id). This position-based shell detector and that id-paired agent counter are separate;
        // mixing agents in here is unnecessary (the id counter already covers them).
        const nm = String(bb.name ?? '').toLowerCase();
        if (nm !== 'bash' && nm !== 'powershell') continue;
        const inp = bb.input as Record<string, unknown> | undefined;
        if (inp && typeof inp === 'object' && inp.run_in_background === true) lastLaunchIdx = i;
      }
    }
    let serialized = '';
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = '';
    }
    if (serialized && BG_COMPLETION_RE.test(serialized)) lastCompletionIdx = i;
  }
  return lastLaunchIdx >= 0 && lastLaunchIdx > lastCompletionIdx;
}

/**
 * A backgrounded helper (Agent/Task) still in flight, paired RELIABLY by tool_use id (2026-06-21).
 * The earlier NAME-pairing over-counted catastrophically: retries re-launch the same `description` 3×
 * and the «came to rest» text drifts the name, so a 50-agent migration session reported «22 in flight»
 * when the CLI showed 0 (owner: «ты неправильно считаешь статусы… в кли было 0 бекграундов»). The harness
 * gives every `run_in_background` launch a STABLE top-level tool_use `id`, and its completion is a
 * `tool_result` whose `tool_use_id` is that SAME id (verified on two real transcripts: agent 53/54 pair
 * by id). So: collect launch ids, drop ids that have a completion result → what remains is genuinely in
 * flight. Exact key — immune to retries and name drift. Main-chain launches only (a sub-agent's own Agent
 * spawns are sidechain). The launch-ACK tool_result («Async agent launched successfully…») does NOT match
 * the done-pattern, so it never falsely clears a still-running agent.
 */
const BG_RESULT_DONE_RE = /completed|came to rest|exit code|finished/i;
const BG_TAG_ID_RE = /<tool-use-id>([^<]+)<\/tool-use-id>/g; // any id inside the tag; only consulted on a done-text line
/** Count of backgrounded helper agents still in flight, paired by tool_use id (0 if none / unreadable). */
export function agentBgInFlightCount(rawTranscript: string): number {
  const lines = parseLines(rawTranscript);
  const inFlight = new Set<string>(); // tool_use ids of run_in_background Agent/Task spawns (main chain)
  for (const e of lines) {
    if (e.isSidechain || role(e) !== 'assistant') continue;
    for (const b of contentBlocks(e)) {
      const bb = b as Record<string, unknown>;
      if (bb?.type !== 'tool_use') continue;
      const nm = String(bb.name ?? '').toLowerCase();
      if (nm !== 'agent' && nm !== 'task') continue;
      const inp = bb.input as Record<string, unknown> | undefined;
      if (!inp || typeof inp !== 'object' || inp.run_in_background !== true) continue;
      const id = typeof bb.id === 'string' ? bb.id : '';
      if (id) inFlight.add(id);
    }
  }
  if (inFlight.size === 0) return 0;
  // completions come in TWO harness shapes (both carry the launch's tool_use id) — clear on either:
  //   (1) a structured `tool_result` block whose `tool_use_id` is a launch id + done-text (shell shape);
  //   (2) a «<tool-use-id>toolu_…</tool-use-id>» tag inside a task-notification line with done-text — the
  //       shape a backgrounded AGENT's completion takes (NOT a tool_result). The agent case used this, which
  //       is why a tool_result-only scan saw 0 completions and over-counted. Scan both.
  for (const e of lines) {
    for (const b of contentBlocks(e)) {
      const bb = b as Record<string, unknown>;
      if (bb?.type !== 'tool_result' || typeof bb.tool_use_id !== 'string' || !inFlight.has(bb.tool_use_id)) continue;
      let content = '';
      try {
        content = typeof bb.content === 'string' ? bb.content : JSON.stringify(bb.content ?? '');
      } catch {
        content = '';
      }
      if (BG_RESULT_DONE_RE.test(content)) inFlight.delete(bb.tool_use_id);
    }
    let serialized = '';
    try {
      serialized = JSON.stringify(e);
    } catch {
      serialized = '';
    }
    if (serialized && BG_RESULT_DONE_RE.test(serialized)) {
      BG_TAG_ID_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BG_TAG_ID_RE.exec(serialized)) !== null) inFlight.delete(m[1]);
    }
  }
  return inFlight.size;
}
export function agentBgInFlight(rawTranscript: string): boolean {
  return agentBgInFlightCount(rawTranscript) > 0;
}

// Hook-injected lines that ride along on a user turn but are NOT the user's typed ask — the spec-tasks
// banner, specs-validator output, gate kicks, task-notifications, system reminders. Stripped before
// intent classification so a banner-only turn is not mistaken for the user's request.
const HOOK_INJECTION_RE =
  /^\s*(📋|👉|…ещё|\[specs-validator\]|⚠️|PHASE GATE WARNING|Stop hook feedback|UserPromptSubmit hook|<\/?task-notification|<(?:task-id|tool-use-id|output-file|status|summary)|<\/?command-(?:name|message|args)|<\/?local-command-(?:stdout|caveat)|\[SYSTEM NOTIFICATION|This is an automated|Do NOT interpret|[A-Za-z][\w.-]*:\s*\d+\s*(?:open|⏸))/u;

/**
 * FR-28 (2026-06-29): a GENUINELY-TYPED human prompt = a real user turn that the harness did NOT inject.
 * The harness MARKS its own user-role injections structurally, which is far more robust than regex-matching
 * the open-ended set of injection TEXT shapes (the real-transcript check leaked the /compact continuation
 * summary, skill-content, and slash-command machinery past a text blocklist):
 *   - isMeta=true            → skill-content loads, Stop-hook feedback
 *   - isCompactSummary=true / isVisibleInTranscriptOnly=true → the /compact continuation summary
 *   - promptSource='system'  → task-notifications, hook output (genuine prompts are promptSource:'typed')
 * Used ONLY by the intent extractors (lastUserPrompt / sessionUserPrompts) — NOT by extractTurnWindow's
 * boundary (which keeps its existing behaviour so the gate's turn-scoping is unchanged). Hand-built test
 * fixtures set none of these flags → treated as genuine (a negative filter, not a promptSource allowlist).
 */
function isTypedHumanPrompt(e: TranscriptLine): boolean {
  if (!isRealUser(e)) return false;
  if (e.isMeta === true || e.isCompactSummary === true || e.isVisibleInTranscriptOnly === true) return false;
  if (e.promptSource === 'system') return false;
  return true;
}

/**
 * Phase 1 (2026-06-21): the last REAL user prompt text — the agent-independent INTENT signal (the agent
 * cannot fake the user's words). Hook-injected lines are stripped; a message whose whole text is
 * hook-injection is skipped to the previous real user message. Empty string if none found.
 */
export function lastUserPrompt(rawTranscript: string): string {
  const lines = parseLines(rawTranscript);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].isSidechain || !isTypedHumanPrompt(lines[i])) continue;
    const allLines = assistantText(lines[i]).split(/\r?\n/);
    // FR-18 (2026-06-25): a user-role message whose FIRST non-empty line is a hook-injection marker
    // (⚠️ a Stop-hook block reason, 📋 census, «Stop hook feedback», …) IS hook feedback, NOT a user
    // prompt — skip the WHOLE message. Previously only matching LINES were stripped, so a MULTI-LINE
    // block reason leaked its continuation lines («Нужно: реальный прогон …») as the «user request», and
    // the gate read its OWN окрик as the user's intent (polluting analysisOnly). Structural: it reuses
    // HOOK_INJECTION_RE (the injection markers), not the gate's prose.
    const firstNonEmpty = allLines.find((ln) => ln.trim()) ?? '';
    if (HOOK_INJECTION_RE.test(firstNonEmpty)) continue;
    const cleaned = allLines.filter((ln) => !HOOK_INJECTION_RE.test(ln)).join('\n').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

/**
 * FR-28 (2026-06-29): the FULL list of real human prompts THIS session, oldest→newest, with the same
 * hook-injection stripping as lastUserPrompt (the spec-tasks banner / gate kicks / notifications are NOT
 * the human's words). This is the agent's MANDATE — what the human actually asked for — which the judge's
 * mandate layer weighs to decide "is the requested task done?" so a stop is approved once that mandate is
 * complete, even while unrelated backlog (nextOpenTask) stays open. Agent-independent: the agent cannot
 * fabricate the human's typed prompts. Bounded — the LAST MANDATE_MAX_PROMPTS asks, each clamped HEAD+TAIL
 * to MANDATE_MAX_LEN (so a big log/error paste keeps the instruction at EITHER edge, not just the head) —
 * the judge prompt stays small and cheap. Empty array when no real prompt is found.
 */
const MANDATE_MAX_PROMPTS = 12;
const MANDATE_MAX_LEN = 400;
// A message that is ONLY a continuation ack — no ask. Matched against the prompt with whitespace/punct
// stripped, so only an EXACT filler is dropped (a real request that merely STARTS with one survives).
const ACK_ONLY_RE = /^(?:го|гоу|ок|окей|оке|ладно|давай|да|нет|ага|угу|ало|оа|плюс|\+{1,3}|go|ok|okay|yes|yep|nope|no|k|к|sure|next|далее|дальше)$/i;

/**
 * FR-28: clamp ONE prompt to the budget keeping HEAD + TAIL, not head-only. A big paste (5 KB of logs /
 * a stack trace) carries the human's actual instruction at an EDGE — "почини вот это: <dump>" (top) OR
 * "<dump> …что тут не так?" (bottom). Head-only truncation drops the ask whenever it sits AFTER the dump.
 * Keeping both ends (and eliding the bulky middle with a marker) preserves the framing words on either
 * side of the paste. Deterministic + cheap — NO extra LLM summarization call in a fast, fail-open Stop
 * hook (latency/cost/another failure surface); the judge needs the ASK, not the logs. Same byte-window
 * idea the repo already uses for big files (perf-budget head+tail).
 */
function clampMandate(s: string): string {
  if (s.length <= MANDATE_MAX_LEN) return s;
  const head = Math.ceil(MANDATE_MAX_LEN * 0.65); // bias to the start (the ask is more often at the top)
  const tail = MANDATE_MAX_LEN - head;
  const omitted = s.length - head - tail;
  return `${s.slice(0, head).trimEnd()} […${omitted} chars omitted…] ${s.slice(s.length - tail).trimStart()}`;
}
export function sessionUserPrompts(rawTranscript: string): string[] {
  const lines = parseLines(rawTranscript);
  const out: string[] = [];
  for (const e of lines) {
    if (e.isSidechain || !isTypedHumanPrompt(e)) continue;
    const allLines = assistantText(e).split(/\r?\n/);
    const firstNonEmpty = allLines.find((ln) => ln.trim()) ?? '';
    if (HOOK_INJECTION_RE.test(firstNonEmpty)) continue; // a hook-injection-led message is not a prompt
    const cleaned = allLines.filter((ln) => !HOOK_INJECTION_RE.test(ln)).join('\n').trim();
    if (!cleaned) continue;
    // Drop a PURE continuation ack ("го"/"ок"/"давай"/"go"…) — it carries no ask, and a run of them must
    // not crowd a substantive request out of the last-N window (which would leave an acks-only mandate the
    // judge could falsely read as "complete"). Only an EXACT filler match is dropped: "давай сделай X"
    // (spaces stripped → "давайсделайx") does NOT match `^давай$`, so a real ask is never lost.
    const norm = cleaned.replace(/[\s.,!?…]+/gu, '').toLowerCase();
    if (ACK_ONLY_RE.test(norm)) continue;
    out.push(clampMandate(cleaned)); // head+tail clamp: keep the ask even when it sits AFTER a big paste

  }
  return out.slice(-MANDATE_MAX_PROMPTS);
}
