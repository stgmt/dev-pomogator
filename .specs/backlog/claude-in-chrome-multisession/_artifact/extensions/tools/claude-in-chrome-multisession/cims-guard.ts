#!/usr/bin/env node
/**
 * cims-guard — claude-in-chrome multi-session ownership guard.
 *
 * PreToolUse hook on `mcp__claude-in-chrome__.*`:
 *   - Tools without `tabId` arg (tabs_create_mcp, tabs_context_mcp, browser_batch
 *     without tabId-bearing ops): always ALLOW.
 *   - Tools with `tabId`: ALLOW if owned by current session; DENY if owned by
 *     another session (with explicit owner identification + claim hint);
 *     auto-CLAIM if orphan (no session owns it — first-touch ownership).
 *
 * PostToolUse hook on same matcher:
 *   - On successful `tabs_create_mcp`, parse new tabId from tool_response and
 *     append to current-session allowlist.
 *
 * State: `~/.dev-pomogator/cdmm-sessions/<sanitized-sessionId>/owned-tabs.json`
 *   {sessionId, tabIds: number[], createdAt, lastUsedAt}
 *
 * Failure mode: parse errors / missing fields → fail-open (exit 0) so the
 * guard never breaks legitimate browser ops; multi-session safety degrades
 * gracefully rather than blocking workflow.
 *
 * See `.specs/claude-in-chrome-multisession/` FR-2, FR-3, FR-4, FR-6.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE_ROOT = path.join(os.homedir(), '.dev-pomogator', 'cdmm-sessions');
const LOG = path.join(os.homedir(), '.dev-pomogator', 'logs', 'cims-guard.log');

const TOOL_PREFIX = 'mcp__claude-in-chrome__';
const TABS_CREATE = TOOL_PREFIX + 'tabs_create_mcp';

interface OwnedTabs {
  sessionId: string;
  tabIds: number[];
  createdAt: string;
  lastUsedAt: string;
}

interface HookInput {
  session_id?: string;
  tool_name?: string;
  hook_event_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Array<{ type?: string; text?: string }> | unknown;
}

const sanitize = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_');
const sessionDir = (s: string): string => path.join(STATE_ROOT, sanitize(s));

function readOwned(sid: string): OwnedTabs | null {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(sessionDir(sid), 'owned-tabs.json'), 'utf-8'),
    ) as OwnedTabs;
    if (!data?.sessionId || !Array.isArray(data.tabIds)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeOwned(data: OwnedTabs): void {
  fs.mkdirSync(sessionDir(data.sessionId), { recursive: true });
  const file = path.join(sessionDir(data.sessionId), 'owned-tabs.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(file + '.tmp', file);
}

function findOtherOwner(tabId: number, mySessionId: string): string | null {
  if (!fs.existsSync(STATE_ROOT)) return null;
  const myDir = sanitize(mySessionId);
  for (const entry of fs.readdirSync(STATE_ROOT)) {
    if (entry === myDir) continue;
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(STATE_ROOT, entry, 'owned-tabs.json'), 'utf-8'),
      ) as OwnedTabs;
      if (data?.tabIds?.includes(tabId)) return data.sessionId;
    } catch {
      /* skip corrupted entries */
    }
  }
  return null;
}

function adopt(sessionId: string, tabId: number): void {
  const cur = readOwned(sessionId) ?? {
    sessionId,
    tabIds: [],
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  if (!cur.tabIds.includes(tabId)) cur.tabIds.push(tabId);
  cur.lastUsedAt = new Date().toISOString();
  writeOwned(cur);
}

function logEvent(payload: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(
      LOG,
      JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n',
      'utf-8',
    );
  } catch {
    /* logging is best-effort; do not break hook on log failure */
  }
}

function deny(reason: string): never {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(2);
}

function extractTabIdFromCreateResponse(
  blocks: Array<{ type?: string; text?: string }> | unknown,
): number | null {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks) {
    if (b?.type !== 'text' || typeof b.text !== 'string') continue;
    const m =
      b.text.match(/Tab ID:\s*(\d+)/) ??
      b.text.match(/"tabId"\s*:\s*(\d+)/) ??
      b.text.match(/tabId[:\s=]+(\d+)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function getTabIdFromInput(input: Record<string, unknown> | undefined): number | null {
  if (!input || input.tabId == null) return null;
  const n = Number(input.tabId);
  return Number.isFinite(n) ? n : null;
}

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk.toString()));
process.stdin.on('end', () => {
  let parsed: HookInput | null = null;
  try {
    parsed = JSON.parse(raw) as HookInput;
  } catch {
    logEvent({ event: 'parse_error', rawLength: raw.length });
    process.exit(0);
  }

  const sessionId = parsed?.session_id;
  const toolName = parsed?.tool_name;
  const eventName = parsed?.hook_event_name;
  const toolInput = (parsed?.tool_input ?? {}) as Record<string, unknown>;

  if (!sessionId || !toolName || !eventName || !toolName.startsWith(TOOL_PREFIX)) {
    logEvent({ event: 'skip', sessionId, toolName, eventName });
    process.exit(0);
  }

  // PostToolUse: record new tabId from tabs_create_mcp response
  if (eventName === 'PostToolUse' && toolName === TABS_CREATE) {
    const newTabId = extractTabIdFromCreateResponse(parsed?.tool_response);
    if (newTabId != null) {
      adopt(sessionId, newTabId);
      logEvent({ event: 'recorded_tab', sessionId, newTabId });
    } else {
      logEvent({ event: 'no_tabid_in_response', sessionId });
    }
    process.exit(0);
  }

  if (eventName !== 'PreToolUse') process.exit(0);

  const tabId = getTabIdFromInput(toolInput);
  if (tabId == null) {
    logEvent({ event: 'allow_no_tabid', sessionId, toolName });
    process.exit(0);
  }

  const owned = readOwned(sessionId);
  if (owned?.tabIds?.includes(tabId)) {
    owned.lastUsedAt = new Date().toISOString();
    writeOwned(owned);
    logEvent({ event: 'allow_owned', sessionId, toolName, tabId });
    process.exit(0);
  }

  const otherOwner = findOtherOwner(tabId, sessionId);
  if (otherOwner) {
    logEvent({ event: 'deny_other_session', sessionId, toolName, tabId, otherOwner });
    deny(
      `[cims-guard] tabId=${tabId} owned by another Claude Code session (${otherOwner}). ` +
        `Create your own tab via mcp__claude-in-chrome__tabs_create_mcp first. ` +
        `If you genuinely need this tab, run: ` +
        `node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs add ${tabId}`,
    );
  }

  // Orphan tab: first-touch ownership (bootstrap-friendly).
  // Tab was either user-created or pre-hook-installation. Whoever uses it
  // first claims it. Subsequent cross-session attempts will then DENY.
  adopt(sessionId, tabId);
  logEvent({ event: 'allow_adopted_orphan', sessionId, toolName, tabId });
  process.exit(0);
});

if (process.stdin.isTTY) {
  console.error('cims-guard expects stdin JSON from Claude Code hook protocol');
  process.exit(0);
}
