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
        // ONLY backgrounded shell commands — Agent/Task are handled by agentBgInFlight (name-paired by
        // «came to rest»), and their completion is NOT a «completed» record, so counting them here would
        // see them as forever-pending and defer wrongly (broke CEGATE001_39). Shell completions ARE «completed».
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
  /^\s*(📋|👉|…ещё|\[specs-validator\]|⚠️|PHASE GATE WARNING|Stop hook feedback|UserPromptSubmit hook|<\/?task-notification|<(?:task-id|tool-use-id|output-file|status|summary)|\[SYSTEM NOTIFICATION|This is an automated|Do NOT interpret|[A-Za-z][\w.-]*:\s*\d+\s*(?:open|⏸))/u;

/**
 * Phase 1 (2026-06-21): the last REAL user prompt text — the agent-independent INTENT signal (the agent
 * cannot fake the user's words). Hook-injected lines are stripped; a message whose whole text is
 * hook-injection is skipped to the previous real user message. Empty string if none found.
 */
export function lastUserPrompt(rawTranscript: string): string {
  const lines = parseLines(rawTranscript);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].isSidechain || !isRealUser(lines[i])) continue;
    const cleaned = assistantText(lines[i])
      .split(/\r?\n/)
      .filter((ln) => !HOOK_INJECTION_RE.test(ln))
      .join('\n')
      .trim();
    if (cleaned) return cleaned;
  }
  return '';
}
