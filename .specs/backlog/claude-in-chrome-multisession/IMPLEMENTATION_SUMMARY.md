# claude-in-chrome-multisession — Implementation Archived

**Status:** removed from mainstream code 2026-05-22. Spec retained in backlog for historical reference.

**Why removed:** moved to backlog together with predecessor `chrome-devtools-mcp-mux` during multi-session Chrome strategy reconsideration. Implementation was 8/21 TASKS done (38%) — hook scaffolding worked, but full test coverage was never completed. User decided to defer the multi-session Chrome problem entirely until upstream Anthropic ships native per-session tab groups (tracked in Issues [#15173](https://github.com/anthropics/claude-code/issues/15173), [#15193](https://github.com/anthropics/claude-code/issues/15193), [#20100](https://github.com/anthropics/claude-code/issues/20100), [#26120](https://github.com/anthropics/claude-code/issues/26120), [#39637](https://github.com/anthropics/claude-code/issues/39637)).

## What was built (8/21 TASKS done)

- **Extension package** — `extensions/claude-in-chrome-multisession/` (extension.json with PreToolUse + PostToolUse hooks matching `mcp__claude-in-chrome__.*`, no `mcpServers` registration — wraps existing upstream `claude-in-chrome` Chrome extension MCP).
- **Hook** — `extensions/.../tools/claude-in-chrome-multisession/cims-guard.ts` — reads session UUID from stdin JSON, tracks per-session owned tabs in `~/.dev-pomogator/cdmm-sessions/<sid>/owned-tabs.json`, DENIES cross-session navigate/close/read operations via `permissionDecision: "deny"`.
- **CLI helper** — `claim-tab.mjs` — explicit tab claim for orphan tabs (first-touch ownership for bootstrap-friendly single-session use).
- **Skill** — `.claude/skills/claude-in-chrome-multisession/SKILL.md` instructing Claude on the protocol (always create own tab first; only operate on owned tabs).
- **Foundation verification (POC)** — 7 hypotheses verified end-to-end on real Claude Code → MCP path before writing FRs (H1: hook fires on regex matcher; H2: session_id in stdin; H3: tool_input.tabId available; H4: PostToolUse symmetric; H5: deny + exit 2 actually blocks; H6: ownership isolation; H7: real second `claude -p --chrome` session creates own tab without collision).

## What was not finished

13 TASKS open in original `TASKS.md`:

- `task-bdd-helpers` + 4 test files (PLUGIN018_01..10)
- `task-claude-md` (add to Key extensions list)
- `task-demote-mux` + `task-mcp-config-cleanup` (handled now by full removal of both specs)
- `task-spec-changelog`, `task-spec-readme`, `task-final-verify`, `task-validate-spec`, `task-spec-audit`

## Files preserved in `_artifact/`

```
_artifact/
├── extensions/      — full extensions/claude-in-chrome-multisession/ tree
├── skill/           — .claude/skills/claude-in-chrome-multisession/SKILL.md
└── tests/           — 4 *.test.ts files + helpers.ts
```

No `src/` changes were needed for this spec — it reused the existing `extension.json.hooks.claude` flow without modifying installer code. So no src/ files archived.

## Settings cleanup

`.claude/settings.json` contained 2 hook entries (PreToolUse + PostToolUse, matcher `mcp__claude-in-chrome__.*`) calling `cims-guard.ts` via tsx-runner-bootstrap. These were removed during cleanup. Any user copies in `~/.claude/settings.json` would similarly need cleaning.

## To resurrect

1. Restore artifacts from `_artifact/` to original paths.
2. Re-add the 2 hook entries to `.claude/settings.json` (PreToolUse + PostToolUse on `mcp__claude-in-chrome__.*` matcher).
3. Complete the 13 open TASKS (test coverage + validation).

## Reference

- Original spec docs preserved in this directory: `FR.md`, `DESIGN.md`, `RESEARCH.md`, etc.
- Last working state: tracked in `_artifact/` (files were untracked at removal — no git history).
- Companion (also archived): `.specs/backlog/chrome-devtools-mcp-mux/`.
- Real fix awaits: Anthropic native multi-session tab groups in `claude-in-chrome`.
