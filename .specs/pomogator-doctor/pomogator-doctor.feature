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
