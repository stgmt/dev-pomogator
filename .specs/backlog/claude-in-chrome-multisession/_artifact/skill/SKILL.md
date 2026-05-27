---
name: claude-in-chrome-multisession
description: Multi-session safety for the official `claude-in-chrome` Chrome extension MCP — when 2+ Claude Code sessions drive one Chrome instance, this skill + a PreToolUse hook isolate each session's tabs by ownership tracking. Use whenever you call ANY mcp__claude-in-chrome__* tool. Solves the "all sessions share single MCP tab group" problem (Anthropic Issue #15173, #20100, #15193) without modifying the upstream extension. Hook auto-records tabs you create via tabs_create_mcp, denies cross-session navigate/close/read operations on tabs owned by other Claude Code sessions, and lets you keep your real logged-in browser profile + extensions (unlike chrome-devtools-mcp which kills extensions via --remote-debugging-port).
allowed-tools: mcp__claude-in-chrome__*, Bash, Read
---

# claude-in-chrome multi-session safety

## Mission

Make `mcp__claude-in-chrome__*` tools safe to use when multiple Claude Code sessions are running concurrently against the same Chrome browser. Without this skill + accompanying hook, all sessions share one MCP tab group — sessions step on each other's tabs (navigate races, accidental closes, `tabs_context_mcp` leaking other sessions' tabs).

## Architecture

Two layers:

1. **Soft layer (this skill)** — instructs Claude on the protocol: always create your own tab via `tabs_create_mcp` before the first browser operation; remember your tab IDs; treat every tab in `tabs_context_mcp` results that you didn't create as foreign.

2. **Hard layer (PreToolUse + PostToolUse hook)** — `cims-guard.ts` registered for matcher `mcp__claude-in-chrome__.*`:
   - **PostToolUse** on `tabs_create_mcp`: records the new `tabId` returned by the tool into your session's allowlist (`~/.dev-pomogator/cdmm-sessions/<your-session-id>/owned-tabs.json`).
   - **PreToolUse** on every tool with `tool_input.tabId`: ALLOW if owned by you, DENY (with explicit owner identification) if owned by another session, AUTO-CLAIM if orphan (first-touch ownership for user-created or pre-hook tabs).

The hook is the safety net. The skill is just discipline so Claude doesn't constantly trip the hook.

## Triggers

Activate this skill on ANY browser request that would call `mcp__claude-in-chrome__*`:

- "open page", "navigate", "go to URL", "browse to"
- "screenshot", "take screenshot of page"
- "console errors", "browser console", "DevTools"
- "page text", "extract content", "read page"
- Russian: "открой страницу", "посмотри в браузере", "скриншот", "что в консоли"

## Protocol — what you MUST do

### Step 1: Create your own tab BEFORE any other browser operation

When you receive a browser-debug request and you do NOT yet have a tabId for this conversation, FIRST call:

```
mcp__claude-in-chrome__tabs_create_mcp()
```

The tool returns the new `tabId`. The hook will automatically record it into your session allowlist (you don't have to track it manually — the hook does). Remember the tabId for subsequent calls in the same conversation.

### Step 2: Operate ONLY on your own tabs

Every subsequent browser operation MUST use a `tabId` from your session. If you call `mcp__claude-in-chrome__navigate({tabId: 12345, url: "..."})` and 12345 belongs to another Claude Code session, the hook DENIES with a message like:

```
[cims-guard] tabId=12345 owned by another Claude Code session (<other-session-id>).
Create your own tab via mcp__claude-in-chrome__tabs_create_mcp first.
```

When you see this DENY: call `tabs_create_mcp` to get your own tab, then use that tabId.

### Step 3: When `tabs_context_mcp` returns mixed tabs, filter aggressively

`tabs_context_mcp` is intentionally not gated by the hook (it's read-only discovery). Its response contains EVERY tab in the MCP tab group across ALL sessions. Your job: only operate on tabs YOU created (Step 1) — ignore the rest. Mentally treat any tab not in your "I created this" list as a foreign tab.

### Step 4: User explicitly asks you to interact with a specific existing tab

If the user says "use the GitHub tab I have open" referring to a tab they manually opened (or created in a different session), and you genuinely need to drive that tab:

```bash
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs add <tabId>
```

This adds the tabId to your session's allowlist (with appropriate caveat — you're now responsible for that tab and another session can no longer touch it). NEVER call `claim-tab.mjs add` proactively — only when the user explicitly asks.

## Hard rules

| Don't | Why | Do instead |
|---|---|---|
| Skip Step 1 (calling `tabs_create_mcp` first) and try to navigate via existing tabIds from `tabs_context_mcp` | You'll trip the hook DENY — tabs in `tabs_context_mcp` belong to many sessions, including foreign ones | Always `tabs_create_mcp` first in a fresh conversation, then use the returned tabId |
| Ignore the DENY hint and try a different tabId from the foreign session | The hook will keep denying — every foreign tab is gated | Acknowledge: "this tab belongs to another Claude session"; create your own |
| Use `claim-tab.mjs add` to grab tabs you didn't create, without explicit user request | Bypasses safety; risks interfering with another concurrent session | Only `claim-tab.mjs add` when user says "use my tab X" |
| Hold a stale tabId from earlier in the conversation after user closed it manually | Hook will adopt it on next touch (orphan auto-claim), but the tab is gone — operation will fail | Re-create via `tabs_create_mcp` if unsure of state |

## When NOT to use this skill

- The user explicitly wants `chrome-devtools-mcp` (vanilla, single-session) — that's a different MCP, this skill doesn't apply.
- Browser automation via Playwright in CI / Docker — no `claude-in-chrome` involved, skill is irrelevant.
- The user has only one Claude Code session and explicitly opts out of multi-session safety (uninstall this extension).

## Compatibility

- **`claude-in-chrome` MCP** — required (this skill is its multi-session companion).
- **`chrome-devtools-mcp-mux`** — orthogonal; that MCP has its own daemon-based isolation but is broken on Windows. This skill targets `claude-in-chrome` instead, which works on Windows because it goes through the Chrome extension's Native Messaging IPC.
- **`edge-debug-port`** — orthogonal; that's for Playwright `connectOverCDP` flows that disable extensions.

## Verification — manual

After you call `tabs_create_mcp` and any subsequent op:

```bash
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs list
```

Output shows ownership table for ALL active sessions. Your session's UUID should have your tabId in it. Other sessions (if any) have their own.

## State files

- `~/.dev-pomogator/cdmm-sessions/<sanitized-session-id>/owned-tabs.json` — per-session allowlist
- `~/.dev-pomogator/logs/cims-guard.log` — hook event log (append-only JSONL); useful for debugging

Stale sessions (`lastUsedAt` > 24h) are cleaned by:

```bash
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs clean
```

## See also

- `extensions/claude-in-chrome-multisession/README.md` — operational notes and install
- `.specs/claude-in-chrome-multisession/` — full feature spec (FR/AC/DESIGN)
- Anthropic Issue #15173, #15193, #20100 — upstream multi-session feature requests
