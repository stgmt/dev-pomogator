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

/** All readable text of a line regardless of role — string content, text blocks, or a tool_result's
 * string content. Used to scan for the «came to rest» notification (a user-role text message). */
function lineText(e: TranscriptLine): string {
  const c = e.message?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c
    .map((b: any) => (typeof b?.text === 'string' ? b.text : typeof b?.content === 'string' ? b.content : ''))
    .join('\n');
}

/**
 * 5a (2026-06-21): a backgrounded AGENT still in flight ACROSS a window reset. `bgInFlightInWindow` is
 * window-scoped and MISSES it, because a SIBLING agent's natural completion is a «Agent "<name>" came to
 * rest» USER message — which resets the turn-window boundary (extractTurnWindow), dropping a still-running
 * agent's earlier launch OUT of the window. And no `.bg-task-active*` marker is dropped for an agent (only
 * the test-runner wrapper writes one), so the marker path doesn't cover it either. That is the false
 * positive that pinned a legitimately-waiting migration agent: launch pass-3, sibling pass-2 «came to
 * rest» resets the window, status stop → gate saw no async wait → judged → blocked.
 *
 * Fix: pair backgrounded Agent/Task LAUNCHES against «came to rest» completions BY NAME over the WHOLE
 * transcript. A naive launch−rest COUNTER was rejected for good reason — rests arrive CROSS-SESSION (a
 * Stop transcript routinely carries «came to rest» lines for agents another session launched), so counting
 * them undercounts in-flight. Pairing by name sidesteps that: a cross-session/echoed rest whose name
 * matches NO launch here clears nothing. A launch whose name never gets a matching rest stays in-flight →
 * over-defer (the SAFE direction — at worst the agent stops when it could have been nudged). It self-clears
 * the moment the matching rest lands. Main-chain launches only (a sub-agent's own Agent calls are sidechain
 * → excluded). Name match is exact after normalisation, tolerant of the leading "Autonomous " the
 * autonomous-loop prepends to the displayed name.
 */
const CAME_TO_REST_RE = /agent\s+"([^"]+)"\s+came\s+to\s+rest/gi;
function normAgentName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/^autonomous\s+/, '');
}
export function agentBgInFlight(rawTranscript: string): boolean {
  const lines = parseLines(rawTranscript);
  // launches: main-chain backgrounded Agent/Task spawns, keyed by normalised description.
  const launchCount = new Map<string, number>();
  for (const e of lines) {
    if (e.isSidechain || role(e) !== 'assistant') continue;
    for (const b of contentBlocks(e)) {
      const bb = b as Record<string, unknown>;
      if (bb?.type !== 'tool_use') continue;
      const nm = String(bb.name ?? '').toLowerCase();
      if (nm !== 'agent' && nm !== 'task') continue;
      const inp = bb.input as Record<string, unknown> | undefined;
      if (!inp || typeof inp !== 'object' || inp.run_in_background !== true) continue;
      const key = normAgentName(String(inp.description ?? ''));
      if (key) launchCount.set(key, (launchCount.get(key) ?? 0) + 1);
    }
  }
  if (launchCount.size === 0) return false;
  // rests: «Agent "<name>" came to rest» anywhere in the transcript (text scanned UNescaped per line, so
  // the regex sees real quotes, not JSON-escaped ones), keyed the same way.
  const restCount = new Map<string, number>();
  for (const e of lines) {
    const text = lineText(e);
    if (!text) continue;
    CAME_TO_REST_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CAME_TO_REST_RE.exec(text)) !== null) {
      const key = normAgentName(m[1]);
      restCount.set(key, (restCount.get(key) ?? 0) + 1);
    }
  }
  // in flight = a launched name with more launches than matched rests.
  for (const [key, lc] of launchCount) {
    if (lc > (restCount.get(key) ?? 0)) return true;
  }
  return false;
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
