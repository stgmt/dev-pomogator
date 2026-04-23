# Feature file для pomogator-doctor
# Domain code: POMOGATORDOCTOR001
# Covers UC-1..UC-12 from USE_CASES.md

Feature: POMOGATORDOCTOR001_pomogator-doctor_diagnostic_command

  As a developer cloning a project with dev-pomogator installed
  I want a doctor command that diagnoses what's broken in my environment
  So that I can fix or reinstall without hunting through README and issues

  Background:
    Given dev-pomogator is available as a local npm package
    And I have a clean temp HOME directory created by temp-home-builder
    And process.env.HOME and USERPROFILE point to that temp dir
    And child-registry hook is active for SIGKILL cleanup

  # @feature1
  Scenario: POMOGATORDOCTOR001_01 Happy path — environment fully configured
    Given temp home fixture "valid" is loaded (F-1)
    And fake MCP server "responsive" is spawned on stdio (F-6)
    And .mcp.json references the fake MCP server
    And dotenv fixture "valid" is loaded with AUTO_COMMIT_API_KEY set (F-9)
    And plugin.json fixture "all-declared" matches physical command files (F-12)
    When I run `dev-pomogator --doctor` in interactive mode
    Then Doctor exits with code 0
    And stdout contains traffic-light groups with all checks in severity "ok"
    And AskUserQuestion is NOT invoked
    And no child processes spawned as reinstall

  # @feature2
  Scenario: POMOGATORDOCTOR001_02 Missing tools — user accepts reinstall
    Given temp home fixture "missing-tools" is loaded (F-2)
    And config.installedExtensions contains "auto-commit" but ~/.dev-pomogator/tools/auto-commit/ does not exist
    And AskUserQuestion mock will answer "Reinstall now"
    And reinstall spawn is mocked to record invocation without running real installer
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C5 is reported as severity "critical" with reinstallable=true
    And AskUserQuestion is invoked exactly once with reinstall offer
    And spawn was called with command "npx" and args ["dev-pomogator"] and options stdio="inherit" shell=false
    And Doctor exits with code 2

  # @feature3
  Scenario: POMOGATORDOCTOR001_03 Missing API key — hint only, no reinstall offered
    Given temp home fixture "valid" is loaded (F-1)
    And dotenv fixture "missing-key" is loaded without AUTO_COMMIT_API_KEY (F-10)
    And .claude/settings.local.json has no env block
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C7 for AUTO_COMMIT_API_KEY is severity "critical" with reinstallable=false
    And stdout contains non-reinstallable block separated from reinstallable
    And stdout contains hint "Set AUTO_COMMIT_API_KEY in .env"
    And AskUserQuestion is NOT invoked
    And Doctor exits with code 2

  # @feature4
  Scenario: POMOGATORDOCTOR001_04 SessionStart silent when all OK
    Given temp home fixture "valid" is loaded (F-1)
    And fake MCP server "responsive" is spawned (F-6)
    And dotenv fixture "valid" is loaded (F-9)
    When SessionStart hook invokes doctor-hook.ts with --quiet
    Then stdout contains exactly the JSON '{"continue":true,"suppressOutput":true}'
    And process exits with code 0
    And no chat output banner is produced

  # @feature4
  Scenario: POMOGATORDOCTOR001_05 SessionStart banner when MCP server missing
    Given temp home fixture "valid" is loaded (F-1)
    And fake MCP server is NOT spawned
    And .claude/rules references mcp__context7__query-docs
    And .mcp.json does not include context7
    When SessionStart hook invokes doctor-hook.ts with --quiet
    Then stdout contains JSON with continue=true
    And stdout additionalContext field starts with "⚠ pomogator-doctor:"
    And additionalContext field length is less than or equal to 100 characters
    And additionalContext mentions "run /pomogator-doctor"

  # @feature4
  Scenario: POMOGATORDOCTOR001_06 MCP probe timeout triggers SIGKILL
    Given temp home fixture "valid" is loaded (F-1)
    And fake MCP server "hanging" is spawned (F-7)
    And .mcp.json references the hanging server
    When I run `dev-pomogator --doctor --json`
    Then check C12 for MCP probe reports severity "critical"
    And check C12 message contains "timeout"
    And total probe duration is between 2800ms and 3500ms
    And the hanging MCP child process was killed with SIGKILL
    And child.exitCode is not null when doctor finishes

  # @feature2
  Scenario: POMOGATORDOCTOR001_07 Version mismatch triggers reinstall offer
    Given temp home fixture "version-mismatch" is loaded (F-5)
    And config.json version is "1.3.0"
    And package.json version is "1.5.0"
    And AskUserQuestion mock will answer "Show details only"
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C13 reports severity "critical" with reinstallable=true
    And AskUserQuestion is invoked with reinstall offer mentioning version
    And spawn was NOT called (user declined)
    And Doctor exits with code 2

  # @feature8
  Scenario: POMOGATORDOCTOR001_08 CI mode --json outputs redacted JSON and exit 2
    Given temp home fixture "valid" is loaded (F-1)
    And dotenv fixture "missing-key" is loaded (F-10)
    And process.env.AUTO_COMMIT_API_KEY is explicitly unset
    When I run `dev-pomogator --doctor --json`
    Then stdout is valid JSON parseable as DoctorReport
    And stdout contains no ANSI escape codes
    And the results entry for C7 has envStatus.status="unset"
    And the results entry for C7 has NO "value" field
    And the results entry for C7 has NO field containing "sk-" pattern
    And exit code is 2

  # @feature10
  Scenario: POMOGATORDOCTOR001_09 Plugin-loader broken-missing — reinstall offered
    Given temp home fixture "valid" is loaded (F-1)
    And plugin.json fixture "broken-missing" declares /create-spec command (F-13)
    And no physical file exists at .claude/commands/create-spec.md
    And no registered command exists in ~/.claude/plugins/
    And AskUserQuestion mock will answer "Reinstall now"
    And reinstall spawn is mocked
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C15 reports severity "critical" with reinstallable=true
    And check C15 state="BROKEN-missing"
    And AskUserQuestion is invoked
    And spawn was called with "npx dev-pomogator"

  # @feature9
  Scenario: POMOGATORDOCTOR001_10 Traffic-light grouped output
    Given temp home fixture "valid" with installedExtensions=["auto-commit","claude-mem-health"] (F-1 variant)
    And fake MCP server "responsive" (F-6)
    And dotenv fixture "missing-key" (F-10)
    And bun binary NOT installed
    And python chromadb package NOT installed
    When I run `dev-pomogator --doctor` in interactive mode
    Then stdout contains section header with emoji "🟢" for self-sufficient checks
    And stdout contains section header with emoji "🟡" for needs-env checks
    And stdout contains section header with emoji "🔴" for needs-external checks
    And each check appears in exactly one group based on its CheckGroup field
    And summary line format matches "N ok, M warnings, K critical (of Total relevant checks)"

  # @feature11
  Scenario: POMOGATORDOCTOR001_11 Per-extension gating skips irrelevant checks
    Given temp home fixture "valid" with installedExtensions=["plan-pomogator","auto-commit"] only (F-1 variant with installedExtensions option)
    And extension.json for plan-pomogator has no dependencies field
    And extension.json for auto-commit has no dependencies field
    When I run `dev-pomogator --doctor --json`
    Then gatedOut includes C9 (Bun) with reason containing "no installed extension requires bun"
    And gatedOut includes C10a (Python) with reason containing "python3"
    And gatedOut includes C16 (Docker) with reason containing "devcontainer"
    And results does NOT include C9, C10a, C10b, C16
    And summary.relevantOf is 17 and summary.total is less than 17

  # @feature3
  Scenario: POMOGATORDOCTOR001_12 API key set in settings.local.json env block is accepted
    Given temp home fixture "valid" with envInSettingsLocal={AUTO_COMMIT_API_KEY:"sk-from-settings"} (F-1 variant)
    And dotenv fixture "missing-key" is loaded (F-10)
    And process.env.AUTO_COMMIT_API_KEY is explicitly unset
    When I run `dev-pomogator --doctor --json`
    Then check C7 for AUTO_COMMIT_API_KEY reports severity "ok"
    And check C7 message mentions source "settings.local.json env block"
    And C7 envStatus.status="set"
    And C7 has no "value" field

  # Reliability edge cases (referenced by NFR)

  # @feature2
  Scenario: POMOGATORDOCTOR001_13 Corrupt config.json treated as critical reinstallable
    Given temp home fixture "corrupt-config" is loaded (F-4)
    And config.json content is not valid JSON
    When I run `dev-pomogator --doctor`
    Then check C3 reports severity "critical" with reinstallable=true
    And check C3 message contains "invalid" or "parse"
    And AskUserQuestion is invoked with reinstall offer

  # @feature8
  Scenario: POMOGATORDOCTOR001_14 Concurrent doctor run is blocked by lock
    Given temp home fixture "valid" is loaded (F-1)
    And another doctor process holds ~/.dev-pomogator/doctor.lock with its own PID alive
    When I run `dev-pomogator --doctor`
    Then Doctor exits with code 2 immediately
    And stderr contains "Another doctor run in progress"
    And my process did not create checks results

  # @feature4
  Scenario: POMOGATORDOCTOR001_15 Hook error never blocks SessionStart
    Given temp home fixture "corrupt-config" is loaded (F-4)
    And doctor-hook.ts would throw when parsing config.json
    When SessionStart hook invokes doctor-hook.ts with --quiet
    Then stdout contains JSON with continue=true
    And process exits with code 0
    And ~/.dev-pomogator/logs/doctor.log contains the error
    And the session is NOT blocked

  # ============================================================
  # Post-Launch Hardening scenarios (2026-04-20, @feature12)
  # ============================================================

  # @feature12
  Scenario: POMOGATORDOCTOR001_16 Hook command references missing script file
    Given temp home fixture "valid" is loaded (F-1)
    And projectRoot has .claude/settings.local.json with hook command 'node -e "require(...)" -- ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts"' under Stop event
    And .dev-pomogator/tools/auto-commit/auto_commit_stop.ts does NOT exist on disk
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C20" with severity "critical" and reinstallable=true
    And that check message contains "Stop:" and ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts"
    And that check hint mentions "reinstall"

  # @feature12
  Scenario: POMOGATORDOCTOR001_17 Hook storm — 22 missing commands across 5 events aggregated
    Given temp home fixture "webapp-like" (F-14) with settings.local.json containing 22 hook commands across events Stop(8), SessionStart(4), PreToolUse(4), UserPromptSubmit(4), PostToolUse(2)
    And projectRoot has empty .dev-pomogator/tools/ directory
    When I run `dev-pomogator --doctor --json`
    Then results contains per-event critical entries grouped by event
    And Stop-event missing count equals 8
    And SessionStart-event missing count equals 4
    And summary.critical is at least 5

  # @feature12
  Scenario: POMOGATORDOCTOR001_18 Shell hook (bash .sh) also parsed
    Given temp home fixture "valid" is loaded (F-1)
    And projectRoot has hook command 'bash .dev-pomogator/tools/bg-task-guard/stop-guard.sh' registered under Stop event
    And .dev-pomogator/tools/bg-task-guard/stop-guard.sh does NOT exist
    When I run `dev-pomogator --doctor --json`
    Then results contains critical check mentioning "stop-guard.sh"

  # @feature12
  Scenario: POMOGATORDOCTOR001_19 Managed file hash mismatch emits warning
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions[auto-commit].managed[projectRoot].tools[].path=".dev-pomogator/tools/auto-commit/auto_commit_core.ts" with hash "abc123"
    And the file exists on disk with different content hashing to "def456"
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C21" with severity "warning" and reinstallable=false
    And that check hint contains "user edit or version drift"

  # @feature12
  Scenario: POMOGATORDOCTOR001_20 Managed file missing emits critical reinstallable
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions[auto-commit].managed[projectRoot].tools[].path=".dev-pomogator/tools/auto-commit/auto_commit_llm.ts" with hash "zzz"
    And that file does NOT exist on disk
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C21" with severity "critical" and reinstallable=true
    And reinstallableIssues includes the C21 entry

  # @feature12
  Scenario: POMOGATORDOCTOR001_21 Managed hash skipped for files over 1MB
    Given temp home fixture "valid" is loaded (F-1)
    And config tracks a managed file with size > 1MB
    When I run `dev-pomogator --doctor --json`
    Then the corresponding C21 check is severity "ok"
    And message or details note "skipped hash (file > 1MB)"

  # @feature10
  Scenario: POMOGATORDOCTOR001_22 Plugin.json missing in installed project emits critical
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions[*].projectPaths includes current projectRoot
    And path.join(projectRoot, ".dev-pomogator/.claude-plugin/plugin.json") does NOT exist
    When I run `dev-pomogator --doctor --json`
    Then check C15 severity is "critical" and reinstallable=true
    And check C15 hint contains "plugin manifest missing"
    And check C15 hint contains "Claude Code cannot load commands/skills"

  # @feature12
  Scenario: POMOGATORDOCTOR001_23 pomogator-doctor self-install hook missing emits warning
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions does NOT contain any extension named "pomogator-doctor"
    When I run `dev-pomogator --doctor --json`
    Then results contains a warning check about "proactive broken-install detection disabled"
    And that check is reinstallable=true

  # @feature12
  Scenario: POMOGATORDOCTOR001_24 --all-projects iterates installed projectPaths
    Given temp home fixture "valid" (F-1) with installedExtensions[*].projectPaths union = ["D:/repos/projA", "D:/repos/projB"]
    And projA is healthy
    And projB has 3 missing hook command files
    When I run `dev-pomogator --doctor --all-projects --json`
    Then stdout is a JSON object with top-level key "projects"
    And projects contains exactly keys "D:/repos/projA" and "D:/repos/projB"
    And projects["D:/repos/projB"] contains critical entries
    And aggregate.critical is at least 3
    And process exits with code 2

  # @feature2
  Scenario: POMOGATORDOCTOR001_25 Hooks registry check reads correct JSON path (regression)
    Given temp home fixture "valid" (F-1) with fully synced hooks between config.installedExtensions[*].managed[projectRoot].hooks and settings.local.json
    When I run `dev-pomogator --doctor --json`
    Then check C6 severity is "ok"
    And check C6 message does NOT contain "unexpected keys"

  # @feature2
  Scenario: POMOGATORDOCTOR001_26 Hooks registry detects duplicate registrations
    Given temp home fixture "valid" (F-1)
    And config.installedExtensions[extA].managed[projectRoot].hooks.Stop contains command "X"
    And config.installedExtensions[extB].managed[projectRoot].hooks.Stop contains identical command "X"
    When I run `dev-pomogator --doctor --json`
    Then check C6 severity is "warning"
    And check C6 message contains "duplicate hook registration"

  # @feature2
  Scenario: POMOGATORDOCTOR001_27 config.version missing emits warning
    Given temp home fixture "valid" (F-1)
    And ~/.dev-pomogator/config.json has no top-level "version" field
    When I run `dev-pomogator --doctor --json`
    Then check C13 severity is "warning" and reinstallable=true
    And check C13 hint contains "lacks top-level version"

  # @feature4
  Scenario: POMOGATORDOCTOR001_28 MCP probe timeout is warning not critical at 10s
    Given temp home fixture "valid" (F-1)
    And fake MCP server "hanging" is spawned (F-7) that never responds to initialize
    And .mcp.json references the hanging server
    When I run `dev-pomogator --doctor --json`
    Then check C12 severity is "warning" (not "critical")
    And check C12 hint contains "probe did not complete in 10s"
    And check C12 durationMs is between 9500 and 11000

  # @feature4
  Scenario: POMOGATORDOCTOR001_29 MCP spawn ENOENT emits critical with PATH hint
    Given temp home fixture "valid" (F-1)
    And .mcp.json references a server with command="does-not-exist-xyz"
    When I run `dev-pomogator --doctor --json`
    Then check C12 severity is "critical"
    And check C12 hint contains "PATH"

  # @feature12
  Scenario: POMOGATORDOCTOR001_30 Stale managed entries orphan warning
    Given temp home fixture "valid" (F-1)
    And config.installedExtensions[*].managed[projectRoot].tools[].path="/dev-pomogator/tools/legacy-tool/old.ts" while no extension named "legacy-tool" is installed and legacy-tool is NOT declared as sub-tool of any installed extension.json
    When I run `dev-pomogator --doctor --json`
    Then results contains a warning mentioning "legacy-tool" and "orphaned"

  # @feature12
  Scenario: POMOGATORDOCTOR001_31 Sub-tool directories not flagged as stale (specs-validator case)
    Given temp home fixture "valid" (F-1) with specs-workflow extension installed
    And config.installedExtensions[specs-workflow].managed[projectRoot].tools[].path contains "/dev-pomogator/tools/specs-validator/validate-specs.ts"
    And extensions/specs-workflow/extension.json declares tools.specs-validator=tools/specs-validator
    When I run `dev-pomogator --doctor --json`
    Then no warning check mentions "specs-validator" as orphaned
