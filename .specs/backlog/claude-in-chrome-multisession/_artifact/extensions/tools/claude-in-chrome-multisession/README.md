# claude-in-chrome-multisession tools

## cims-guard.ts

PreToolUse + PostToolUse hook for `mcp__claude-in-chrome__.*`. Registered automatically by dev-pomogator installer in `<targetProject>/.claude/settings.local.json`. Reads stdin JSON (Claude Code hook protocol), tracks per-session tab ownership in `~/.dev-pomogator/cdmm-sessions/<session-id>/owned-tabs.json`.

Behavior:
- ALLOW tools without `tool_input.tabId` (e.g. `tabs_create_mcp`, `tabs_context_mcp`).
- ALLOW tools with `tabId` if owned by current session.
- DENY tools with `tabId` if owned by another session (with explicit owner ID + claim hint).
- AUTO-CLAIM orphan tabs (no session owns) on first touch (bootstrap-friendly).
- PostToolUse on `tabs_create_mcp` parses returned `tabId` and appends to current-session allowlist.

## claim-tab.mjs

Manual ownership CLI. See `extensions/claude-in-chrome-multisession/README.md` for usage.
