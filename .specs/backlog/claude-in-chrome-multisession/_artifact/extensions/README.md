# claude-in-chrome-multisession

Multi-session safety wrapper for the official `claude-in-chrome` Chrome extension MCP. When you run 2+ Claude Code sessions concurrently against the same Chrome browser, this extension's PreToolUse + PostToolUse hooks isolate each session's tabs by ownership tracking — without modifying the upstream extension or losing your real logged-in browser profile + extensions.

## What problem this solves

Anthropic's `claude-in-chrome` Chrome extension exposes browser automation MCP tools (`mcp__claude-in-chrome__navigate`, `screenshot`, `tabs_context_mcp`, etc.) to Claude Code. It already supports a "MCP tab group" concept — each conversation gets a tab group. **But all Claude Code sessions share the SAME MCP tab group.** Run two `claude` instances in different terminals → both see each other's tabs in `tabs_context_mcp` → `select_page`/`navigate` calls race → tabs get hijacked.

Tracked upstream: [#15173](https://github.com/anthropics/claude-code/issues/15173), [#15193](https://github.com/anthropics/claude-code/issues/15193), [#20100](https://github.com/anthropics/claude-code/issues/20100), [#26120](https://github.com/anthropics/claude-code/issues/26120), [#39637](https://github.com/anthropics/claude-code/issues/39637) — Anthropic acknowledged but no shipped fix yet.

## How this extension solves it

Two layers:

1. **PreToolUse hook (`cims-guard.ts`)** — fires on every `mcp__claude-in-chrome__*` tool call. Reads `session_id` (Claude Code passes it in stdin JSON) and `tool_input.tabId`. ALLOW if you own that tab; DENY if another Claude Code session owns it (with explicit owner UUID in the deny message + claim-tab CLI hint); AUTO-CLAIM if orphan (first-touch ownership for user-created or pre-hook tabs).

2. **PostToolUse hook** (same script) — fires after `tabs_create_mcp`. Parses returned `tabId` from `tool_response`, appends to your session's allowlist.

3. **Skill (`SKILL.md`)** — instructs Claude on the protocol: always `tabs_create_mcp` first in a fresh conversation; ignore foreign tabs in `tabs_context_mcp` results. The hook is the safety net; the skill is the discipline so Claude doesn't constantly trip the hook.

## Install

```bash
npx dev-pomogator --plugins claude-in-chrome-multisession
```

The dev-pomogator installer:

- Copies `cims-guard.ts` + `claim-tab.mjs` to `<targetProject>/.dev-pomogator/tools/claude-in-chrome-multisession/`
- Copies `SKILL.md` to `<targetProject>/.claude/skills/claude-in-chrome-multisession/`
- Adds PreToolUse + PostToolUse hook entries (matcher `mcp__claude-in-chrome__.*`) into `<targetProject>/.claude/settings.local.json`
- Records managed paths + hook commands into `~/.dev-pomogator/config.json`

After install, restart Claude Code in the project. Hook fires automatically on browser ops.

## Manual ownership commands

```bash
# Show ownership table for all sessions
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs list

# Manually claim a user-opened tab for current session (env CLAUDE_SESSION_ID required)
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs add <tabId>

# Release a tab (so another session can claim it)
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs release <tabId>

# Clean stale sessions (lastUsedAt > 24h ago)
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs clean

# Wipe all session state (for fresh install)
node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs reset
```

## State files

- `~/.dev-pomogator/cdmm-sessions/<sanitized-session-id>/owned-tabs.json` — per-session allowlist
  - Schema: `{sessionId: string, tabIds: number[], createdAt: ISO, lastUsedAt: ISO}`
- `~/.dev-pomogator/logs/cims-guard.log` — hook event log (JSONL), useful for debugging

## Hook event log — what to expect

Tail `~/.dev-pomogator/logs/cims-guard.log` while operating browser:

```
{"ts":"…","event":"allow_no_tabid","sessionId":"…","toolName":"mcp__claude-in-chrome__tabs_create_mcp"}
{"ts":"…","event":"recorded_tab","sessionId":"…","newTabId":311066071}
{"ts":"…","event":"allow_owned","sessionId":"…","toolName":"mcp__claude-in-chrome__navigate","tabId":311066071}
{"ts":"…","event":"deny_other_session","sessionId":"…","toolName":"…","tabId":…,"otherOwner":"…"}
{"ts":"…","event":"allow_adopted_orphan","sessionId":"…","toolName":"…","tabId":…}
```

## Caveats

- **Soft + hard layers.** Skill is a soft contract — relies on Claude following protocol. Hook is hard — it MECHANICALLY blocks cross-session writes. If the skill discipline lapses, hook compensates by denying (Claude sees DENY, retries with own tab).
- **First-touch claim of orphans.** A user-created tab (or any tab present before the hook was installed) becomes "yours" the first time you touch it. This is intentional bootstrap-friendly behavior. If you want to release such a tab for another session, run `claim-tab.mjs release <tabId>`.
- **`tabs_context_mcp` is intentionally NOT gated.** It's a read-only discovery tool. The hook can't prevent Claude from SEEING foreign tabs — only from operating on them. The skill instructs Claude to filter mentally; the hook backs it up by denying writes.
- **Fail-open on malformed input.** If hook can't parse stdin JSON or fields are missing, it exits 0 (allow) with a log entry. Goal: never break legitimate workflow due to guard bug.

## When NOT to use

- Single-session Claude Code use (one terminal at a time) — overhead with no benefit.
- You're not using `claude-in-chrome` MCP at all (e.g. only `chrome-devtools-mcp` or Playwright).
- You're testing in CI without a real Chrome browser.

## See also

- Spec: `.specs/claude-in-chrome-multisession/`
- Anthropic Chrome extension docs: <https://code.claude.com/docs/en/chrome>
- Related: `extensions/edge-debug-port/` (Playwright `connectOverCDP` for real Edge profile, single-session)

## License

Apache-2.0 (matches dev-pomogator).
