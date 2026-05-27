# Changelog — claude-in-chrome-multisession

## [0.1.0] — 2026-04-28

### Added
- Initial extension scaffold with PreToolUse + PostToolUse hooks for matcher `mcp__claude-in-chrome__.*`.
- `cims-guard.ts` — per-session tab ownership tracking with auto-claim on orphan tabs (bootstrap-friendly).
- `claim-tab.mjs` — manual ownership management CLI (add, release, list, clean, reset).
- Skill `claude-in-chrome-multisession` instructing Claude on the multi-session protocol.

### Verification
- Foundation verified end-to-end on Windows: PreToolUse hook fires on real `mcp__claude-in-chrome__*` tool calls; DENY response (`exit 2` + `permissionDecision: "deny"`) actually blocks the tool call; `session_id` is reliably present in stdin JSON; PostToolUse `tool_response` parseable for new tabId.
- Multi-session isolation tested via 7 synthetic scenarios + 2-session real Claude Code run (parent session created pikabu tab, sub-spawned `claude -p --chrome` session created habr tab, no cross-pollution observed in `~/.dev-pomogator/cdmm-sessions/`).

### Notes
- Targets the Anthropic upstream gap: Issues [#15173](https://github.com/anthropics/claude-code/issues/15173), [#15193](https://github.com/anthropics/claude-code/issues/15193), [#20100](https://github.com/anthropics/claude-code/issues/20100). When upstream ships per-session tab groups, this extension may be demoted to optional / sunset.
