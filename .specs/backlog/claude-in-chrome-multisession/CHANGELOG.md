# Changelog

## [0.1.0] - 2026-04-29

### Added
- Full 4-phase spec scaffold for `claude-in-chrome-multisession` extension (workaround for Anthropic upstream Issues [#15173](https://github.com/anthropics/claude-code/issues/15173), [#15193](https://github.com/anthropics/claude-code/issues/15193), [#20100](https://github.com/anthropics/claude-code/issues/20100), [#26120](https://github.com/anthropics/claude-code/issues/26120), [#39637](https://github.com/anthropics/claude-code/issues/39637) — multi-session tab group sharing).
- Discovery: 10 user stories; 8 use cases; RESEARCH.md с foundation verification proof (H1-H7); Risk Assessment R1-R8.
- Requirements + Design: 10 FR, 10 AC EARS, NFR, DESIGN с 4 Key Decisions, 10 BDD scenarios PLUGIN018_01..10.
- Finalization: TASKS.md TDD-ordered; README.md.

### Verification
- Foundation verified end-to-end via 7 hypotheses through POC:
  - H1: Hook fires on `mcp__claude-in-chrome__.*` regex matcher
  - H2: `session_id` reliably present in stdin JSON
  - H3: `tool_input.tabId` available
  - H4: PostToolUse symmetric с `tool_response`
  - H5: `permissionDecision: "deny"` + exit 2 actually blocks tool
  - H6: Multi-session ownership isolation (7/7 synthetic scenarios)
  - H7: Real second `claude -p --chrome` session создаёт own tab без collision
- Lesson from mux: foundation verified on REAL Claude Code → MCP path before writing 10 FR.

### Motivation
User feedback после `chrome-devtools-mcp-mux` failed на Windows (EACCES on socket binding): need multi-session safety для browser automation который **actually работает на Windows**. claude-in-chrome (Anthropic Chrome extension) goes через Native Messaging IPC, so a hook-based ownership layer succeeds where mux's daemon-socket approach failed.

### Notes
- Supersedes: `chrome-devtools-mcp-mux` extension (demoted to `stability: "beta"`).
- Sunset path: when Anthropic ships native per-session tab groups (Issue #20100), demote to `stability: "legacy"`.
