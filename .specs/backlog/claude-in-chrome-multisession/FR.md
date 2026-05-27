# Functional Requirements (FR)

## FR-1: Extension package `claude-in-chrome-multisession`

Создать extension в `extensions/claude-in-chrome-multisession/` с manifest, hooks, skill, tools per `extension-layout` rule.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-2](USE_CASES.md#uc-2-first-time-install-via-dev-pomogator-installer)

## FR-2: PreToolUse hook denies cross-session tab access

Hook `cims-guard.ts` на matcher `mcp__claude-in-chrome__.*` MUST: read stdin → validate fields → если `tool_input.tabId` в чужой session allowlist → write deny payload + exit 2; если в своей → ALLOW; если orphan → auto-claim.

DENY payload: `{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason:"[cims-guard] tabId=<N> owned by another Claude Code session (<other-uuid>). Create your own tab via mcp__claude-in-chrome__tabs_create_mcp first. If you genuinely need this tab, run: node ~/.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs add <N>"}}`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-two-parallel-claude-code-sessions-hook-isolates-tabs-happy-path)

## FR-3: PostToolUse hook auto-records new tabIds

Same hook script: при `hook_event_name === "PostToolUse"` AND `tool_name === "mcp__claude-in-chrome__tabs_create_mcp"` MUST extract new `tabId` из `tool_response` text blocks через regex `Tab ID:\s*(\d+)` OR `"tabId"\s*:\s*(\d+)`, append в current session's `owned-tabs.json` атомарно.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-two-parallel-claude-code-sessions-hook-isolates-tabs-happy-path)

## FR-4: Skill instructs Claude on protocol

`.claude/skills/claude-in-chrome-multisession/SKILL.md` MUST содержать frontmatter (name, description, allowed-tools) + 9 mandatory sections (Mission, Architecture, Triggers, Protocol, Hard rules, When NOT to use, Compatibility, Verification, State files); ≥8 trigger keywords (EN+RU); 4 protocol steps (tabs_create_mcp first, operate own only, filter tabs_context, manual claim only on user request).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-two-parallel-claude-code-sessions-hook-isolates-tabs-happy-path)

## FR-5: Manual claim/release CLI helper

`tools/claude-in-chrome-multisession/claim-tab.mjs` (Node ESM, self-contained) MUST поддерживать subcommands `add`, `release`, `list`, `clean`, `reset`, `--help`. Read `CLAUDE_SESSION_ID` env or `--session <id>` flag. Atomic writes per `atomic-config-save` rule. JSON-only stdout.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-manual-claim-of-user-opened-tab), [UC-4](USE_CASES.md#uc-4-ttl-cleanup-of-stale-sessions)

## FR-6: Bootstrap mode — orphan auto-claim

Hook MUST auto-claim tabId если он не в любом session allowlist (no owner exists). Append в current session, log `allow_adopted_orphan`, exit 0. Bootstrap-friendly для existing tabs.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-5](USE_CASES.md#uc-5-single-session-bootstrap-orphan-auto-claim)

## FR-7: Hook event log

Hook MUST append JSONL events в `~/.dev-pomogator/logs/cims-guard.log` (best-effort, log failure must not break hook). 8 event types: `parse_error`, `skip`, `recorded_tab`, `no_tabid_in_response`, `allow_no_tabid`, `allow_owned`, `deny_other_session`, `allow_adopted_orphan`. All events have `ts` field (ISO 8601).

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-6](USE_CASES.md#uc-6-hook-event-log-debugging)

## FR-8: Fail-open on errors

Hook MUST exit 0 (allow) при: stdin parse error, missing required fields, tool_name не начинается с `mcp__claude-in-chrome__`, state file read errors, state file write errors. NEVER exit non-zero from non-DENY paths.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-7](USE_CASES.md#uc-7-hook-fails-open-on-malformed-input)

## FR-9: Installer integration via standard hook flow

Extension MUST work с **existing** dev-pomogator installer без новых модулей в `src/installer/`. The `extension.json.hooks.claude` field уже supported by `src/installer/extensions.ts` + `src/installer/settings-local.ts` `writeHooksToSettingsLocal`.

`npx dev-pomogator --plugins claude-in-chrome-multisession` MUST: copy tools + skill files, add PreToolUse + PostToolUse entries в `<targetProject>/.claude/settings.local.json` (smart-merge), record managed paths в `~/.dev-pomogator/config.json`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-2](USE_CASES.md#uc-2-first-time-install-via-dev-pomogator-installer)

## FR-10: Sunset path

Manifest field `stability` ∈ `{stable, beta, legacy}` allows demoting когда Anthropic зашипит native multi-session fix. README + CHANGELOG MUST reference upstream issues #15173, #15193, #20100, #26120, #39637.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-8](USE_CASES.md#uc-8-sunset-когда-anthropic-зашипит-native-fix)
