# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-extension-package-claude-in-chrome-multisession)

WHEN `extension.json` is parsed THEN it SHALL contain `name === "claude-in-chrome-multisession"`, `version` matching semver, `platforms === ["claude"]`, `tools.claude-in-chrome-multisession`, `toolFiles` (3 files), `skills.claude-in-chrome-multisession`, `skillFiles`, `hooks.claude.PreToolUse[]` matcher `mcp__claude-in-chrome__.*`, `hooks.claude.PostToolUse[]` symmetric.

WHEN extension-manifest-integrity rule check runs THEN it SHALL pass.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-pretooluse-hook-denies-cross-session-tab-access)

WHEN cims-guard.ts invoked с PreToolUse for navigate AND `session_id="S1"` AND `tool_input.tabId=100` AND S1 has tabId 100 in allowlist THEN hook SHALL exit 0 AND update `lastUsedAt`.

WHEN same input но tabId=100 в S2's allowlist (not S1) THEN hook SHALL exit 2 AND stdout SHALL contain `permissionDecision === "deny"` AND `permissionDecisionReason` containing "owned by another Claude Code session (S2)" AND "tabs_create_mcp" AND "claim-tab.mjs add 100".

WHEN tool_input has no `tabId` THEN hook SHALL exit 0 без mutation.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-posttooluse-hook-auto-records-new-tabids)

WHEN hook invoked с PostToolUse for tabs_create_mcp AND tool_response contains text "Tab ID: 200" THEN hook SHALL append 200 to current session's tabIds AND log `recorded_tab`.

WHEN PostToolUse fires но tabId not extractable THEN hook SHALL log `no_tabid_in_response` AND exit 0.

WHEN PostToolUse for non-create tool THEN hook SHALL exit 0 без mutation.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-skill-instructs-claude-on-protocol)

WHEN test parses SKILL.md THEN frontmatter SHALL have correct name + allowed-tools.

AND body SHALL contain ALL 9 sections (Mission, Architecture, Triggers, Protocol, Hard rules, When NOT to use, Compatibility, Verification, State files).

AND Triggers SHALL contain ≥8 keywords including "navigate", "screenshot", "console", ≥2 Russian.

AND Protocol SHALL contain 4 numbered steps.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-manual-claimrelease-cli-helper)

WHEN `claim-tab.mjs add 500 --session S1` THEN script SHALL exit 0 AND create `cdmm-sessions/S1/owned-tabs.json` с `tabIds: [500]` AND output `{ok:true, sessionId:"S1", tabIds:[500]}`.

WHEN `add` без tabId THEN script SHALL exit non-zero AND stderr "requires numeric <tabId>".

WHEN `add 500` без `CLAUDE_SESSION_ID` env AND no `--session` THEN script SHALL exit non-zero AND stderr "CLAUDE_SESSION_ID env var not set".

WHEN `release 500 --session S1` AND tabId in S1 THEN script SHALL remove 500 AND output `{ok:true, removed:true}`.

WHEN `list` THEN script SHALL output `{sessions:[...], totalSessions:N}`.

WHEN `clean` AND session has lastUsedAt > 24h THEN script SHALL remove dir AND output `{removed:[{sessionId, ageHours}], count:1}`.

WHEN `reset` THEN script SHALL `rm -rf cdmm-sessions/` AND output `{ok:true, reset:<path>}`.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-bootstrap-mode--orphan-auto-claim)

WHEN PreToolUse hook sees tabId=999 AND not in current session AND not in any other session's allowlist THEN hook SHALL append 999 to current session AND log `allow_adopted_orphan` AND exit 0.

WHEN subsequent OTHER session attempts navigate on tabId=999 THEN hook SHALL exit 2 (DENY) с reason referencing claimer.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-hook-event-log)

WHEN cims-guard.ts processes a tool call THEN exactly one log entry SHALL be appended to `~/.dev-pomogator/logs/cims-guard.log` (JSONL) с shape `{ts, event, sessionId, ...}`.

WHEN log directory не существует THEN hook SHALL create via `mkdirSync({recursive:true})`.

WHEN log file write fails THEN hook SHALL still complete primary action.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-fail-open-on-errors)

WHEN hook invoked с malformed JSON THEN hook SHALL exit 0 AND log `parse_error`.

WHEN required field missing THEN hook SHALL exit 0 AND log `skip`.

WHEN current session's `owned-tabs.json` corrupt THEN `readOwned()` SHALL return null AND hook SHALL treat as empty allowlist (NEVER non-zero exit).

WHEN cross-session scan encounters corrupt JSON THEN hook SHALL skip (NEVER propagate).

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-installer-integration-via-standard-hook-flow)

WHEN `runInstaller("--claude --plugins claude-in-chrome-multisession")` runs against fresh fixture THEN after install:

- targetProject path `.dev-pomogator/tools/claude-in-chrome-multisession/cims-guard.ts` exists
- targetProject path `.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs` exists
- targetProject path `.claude/skills/claude-in-chrome-multisession/SKILL.md` exists
- `targetProject/.claude/settings.local.json` SHALL contain `hooks.PreToolUse` entry с matcher `mcp__claude-in-chrome__.*` AND command containing `cims-guard.ts`
- Symmetric PostToolUse entry
- `~/.dev-pomogator/config.json.installedExtensions` SHALL contain entry с `name === "claude-in-chrome-multisession"`

WHEN installer runs second time THEN no duplicate hook entries.

WHEN target project имеет pre-existing settings.local.json THEN user keys SHALL remain untouched.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-sunset-path)

WHEN extension.json's `stability` set to `"legacy"` THEN installer SHALL emit warning to stderr.

WHEN README.md is parsed THEN it SHALL contain ≥3 of: #15173, #15193, #20100, #26120, #39637.

WHEN CHANGELOG.md is parsed THEN it SHALL contain ≥1 entry referencing upstream issue tracker.
