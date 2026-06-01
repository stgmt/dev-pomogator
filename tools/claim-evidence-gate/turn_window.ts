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
