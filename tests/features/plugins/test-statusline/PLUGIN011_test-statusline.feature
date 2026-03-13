# Source: tests/features/plugins/ (Background pattern from PLUGIN009, PLUGIN010)
# Candidates: PLUGIN009_auto-capture.feature, PLUGIN010_prompt-suggest.feature

Feature: PLUGIN011_test-statusline
  Test statusline extension displays test runner progress in Claude Code statusline
  via YAML status files with session isolation and graceful degradation.

  Background:
    Given dev-pomogator is installed
    And test-statusline extension is enabled

  # @feature1
  Scenario: PLUGIN011_01 Statusline renders running state with progress bar
    Given a YAML status file exists with state "running" and percent 76
    And the status file has passed 38, failed 2, running 10, total 50
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should contain "76%"
    And statusline output should contain "38✅"
    And statusline output should contain "2❌"
    And statusline output should contain "10⏳"

  # @feature1
  Scenario: PLUGIN011_02 Statusline renders completed passed state
    Given a YAML status file exists with state "passed" and percent 100
    And the status file has passed 50, failed 0, running 0, total 50
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should contain "✅"
    And statusline output should contain "50/50"

  # @feature1
  Scenario: PLUGIN011_03 Statusline renders completed failed state
    Given a YAML status file exists with state "failed" and percent 100
    And the status file has passed 48, failed 2, running 0, total 50
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should contain "❌"
    And statusline output should contain "48/50"
    And statusline output should contain "2 failed"

  # @feature1
  Scenario: PLUGIN011_35 Statusline ignores nested suite totals in canonical v2 YAML
    Given a canonical multi-suite YAML status file exists with top-level passed 12, failed 7, total 19
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should contain "12/19"
    And statusline output should contain "7 failed"

  # @feature1a
  Scenario: PLUGIN011_04 Statusline outputs nothing when no YAML file exists
    Given no YAML status file exists for current session
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should be empty
    And statusline script should exit with code 0

  # @feature1a
  Scenario: PLUGIN011_05 Statusline handles corrupted YAML gracefully
    Given a corrupted YAML status file exists
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should be empty
    And statusline script should exit with code 0

  # @feature1a
  Scenario: PLUGIN011_06 Statusline works without jq installed
    Given a YAML status file exists with state "running" and percent 50
    And jq is not available in PATH
    When statusline script receives JSON stdin with matching session_id
    Then statusline output should contain "T"
    And statusline output should contain "50%"

  # @feature2
  Scenario: PLUGIN011_07 YAML status file contains all required fields
    Given test runner wrapper is configured with session "abc12345"
    When wrapper creates initial status file
    Then YAML status file should contain field "version" with value "2"
    And YAML status file should contain field "session_id"
    And YAML status file should contain field "pid"
    And YAML status file should contain field "started_at"
    And YAML status file should contain field "updated_at"
    And YAML status file should contain field "state" with value "running"
    And YAML status file should contain field "total"
    And YAML status file should contain field "passed"
    And YAML status file should contain field "failed"
    And YAML status file should contain field "skipped"
    And YAML status file should contain field "running"
    And YAML status file should contain field "percent"
    And YAML status file should contain field "duration_ms"

  # @feature2
  Scenario: PLUGIN011_08 Wrapper writes atomic YAML via temp file rename
    Given test runner wrapper is configured with session "abc12345"
    When wrapper updates status file
    Then update should use temp file with atomic rename
    And no partial YAML content should be readable during write

  # @feature2
  Scenario: PLUGIN011_09 Wrapper creates initial state on test start
    Given test runner wrapper is configured with session "abc12345"
    When wrapper starts test command
    Then YAML status file should contain field "state" with value "running"
    And YAML status file should contain field "percent" with value "0"

  # @feature2
  Scenario: PLUGIN011_10 Wrapper updates state to passed on success
    Given test runner wrapper is running with session "abc12345"
    When test process exits with code 0
    Then YAML status file should contain field "state" with value "passed"

  # @feature2
  Scenario: PLUGIN011_11 Wrapper updates state to failed on error
    Given test runner wrapper is running with session "abc12345"
    When test process exits with code 1
    Then YAML status file should contain field "state" with value "failed"

  # @feature3
  Scenario: PLUGIN011_12 Sessions use isolated status files
    Given session "aaaabbbb" has a status file with state "running"
    And session "ccccdddd" has a status file with state "passed"
    When statusline script receives JSON stdin with session_id starting with "aaaabbbb"
    Then statusline output should contain running state indicators
    And statusline output should not contain passed state indicators

  # @feature3
  Scenario: PLUGIN011_13 Status file path uses session_id prefix
    Given session_id is "abc12345def67890"
    When status file path is computed
    Then status file should be at ".dev-pomogator/.test-status/status.abc12345.yaml"

  # @feature4
  Scenario: PLUGIN011_14 SessionStart hook creates status directory
    Given ".dev-pomogator/.test-status/" directory does not exist
    When SessionStart hook receives session_id "abc12345def67890"
    Then ".dev-pomogator/.test-status/" directory should be created
    And hook should output "{}" on stdout
    And hook should exit with code 0

  # @feature4
  Scenario: PLUGIN011_15 SessionStart hook writes env var to CLAUDE_ENV_FILE
    Given CLAUDE_ENV_FILE points to a temp file
    When SessionStart hook receives session_id "abc12345def67890"
    Then CLAUDE_ENV_FILE should contain "TEST_STATUSLINE_SESSION=abc12345"
    And CLAUDE_ENV_FILE should contain "TEST_STATUSLINE_PROJECT="

  # @feature4
  Scenario: PLUGIN011_16 SessionStart hook cleans stale files older than 24h
    Given a YAML status file with mtime older than 24 hours exists
    And a recent YAML status file exists
    When SessionStart hook is triggered
    Then stale YAML file should be deleted
    And recent YAML file should remain

  # @feature4
  Scenario: PLUGIN011_17 SessionStart hook cleans idle files older than 1h
    Given a YAML status file with state "idle" and mtime older than 1 hour exists
    When SessionStart hook is triggered
    Then idle stale YAML file should be deleted

  # @feature5
  Scenario: PLUGIN011_18 Extension manifest lists all tool files
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest is parsed
    Then toolFiles should include "statusline_render.sh"
    And toolFiles should include "test_runner_wrapper.sh"
    And toolFiles should include "statusline_session_start.ts"
    And toolFiles should include "status_types.ts"

  # @feature5
  Scenario: PLUGIN011_19 Extension manifest registers SessionStart hook
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest hooks section is parsed
    Then hooks should contain SessionStart event
    And SessionStart hook command should reference statusline_session_start.ts

  # @feature5
  Scenario: PLUGIN011_20 Extension manifest declares statusLine command
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest statusLine section is parsed
    Then statusLine should define Claude command type
    And statusLine command should reference statusline_render.sh

  # @feature8
  Scenario: PLUGIN011_21 Installer writes ccstatusline wrapper to global settings when no statusLine exists
    Given no global user statusLine is configured
    When installer processes test-statusline extension
    Then global "~/.claude/settings.json" should contain wrapped statusLine command
    And wrapper user command should be "npx -y ccstatusline@latest"
    And wrapper managed command should reference statusline_render.cjs

  # @feature8
  Scenario: PLUGIN011_22 Managed statusLine is updated in global settings on re-install
    Given global "~/.claude/settings.json" already contains managed test-statusline wrapper
    When installer processes test-statusline extension again
    Then global statusLine wrapper managed command should be updated

  # @feature8
  Scenario: PLUGIN011_23 Global user-defined statusLine is wrapped alongside managed one
    Given global "~/.claude/settings.json" contains user-defined statusLine command
    When installer resolves statusLine coexistence
    Then resulting statusLine should use statusline wrapper
    And wrapper should preserve the original user command
    And wrapper should include managed statusline_render.cjs command

  # @feature8
  Scenario: PLUGIN011_24 Existing wrapper keeps user command and updates managed command
    Given global "~/.claude/settings.json" already contains statusline wrapper command
    When installer resolves statusLine coexistence
    Then wrapper should preserve existing user command
    And wrapper should update managed command only

  # @feature8
  Scenario: PLUGIN011_25 Wrapper combines outputs of user and managed commands
    Given statusline wrapper receives the same JSON stdin for both commands
    When user command outputs "userinfo" and managed command outputs "testinfo"
    Then wrapper should output "userinfo | testinfo"

  # @feature1
  Scenario: PLUGIN011_26 Statusline rewrites dead running pid to failed
    Given a running YAML status file contains dead pid metadata
    When statusline script receives JSON stdin with matching session_id
    Then YAML state should be repaired to "failed"
    And statusline output should show failed state instead of running state

  # @feature2
  Scenario: PLUGIN011_27 Wrapper writes pid field to YAML
    Given test runner wrapper starts with a valid session
    When wrapper creates or updates YAML status file
    Then YAML status file should contain numeric field "pid"

  # @feature4
  Scenario: PLUGIN011_28 SessionStart repairs running files with dead pid
    Given a YAML status file has state "running" and dead pid
    When SessionStart hook is triggered
    Then file should remain present
    And YAML state should be rewritten to "failed"

  # @feature1
  Scenario: PLUGIN011_29 Statusline keeps running state when pid is alive
    Given a running YAML status file contains a live pid
    When statusline script receives JSON stdin with matching session_id
    Then YAML state should remain "running"
    And statusline output should still contain running indicators

  # @feature8
  Scenario: PLUGIN011_31 Installer wraps existing global user-defined statusLine
    Given global "~/.claude/settings.json" contains user-defined statusLine command "my-custom-statusline"
    When installer processes test-statusline extension
    Then global "~/.claude/settings.json" should contain wrapper command
    And wrapper should preserve "my-custom-statusline" as user command

  # @feature8
  Scenario: PLUGIN011_32 Wrapper keeps managed output when user command fails
    Given statusline wrapper receives user command that exits with error
    And managed command outputs "managedinfo"
    When wrapper is executed
    Then wrapper should output only "managedinfo"

  # @feature8
  Scenario: PLUGIN011_33 Wrapper keeps user output when managed command fails
    Given statusline wrapper receives managed command that exits with error
    And user command outputs "userinfo"
    When wrapper is executed
    Then wrapper should output only "userinfo"

  # @feature8
  Scenario: PLUGIN011_34 Broken wrapper falls back to ccstatusline wrapper
    Given global "~/.claude/settings.json" contains wrapper command with invalid encoded arguments
    When installer resolves statusLine coexistence
    Then resulting statusLine should fall back to ccstatusline wrapped with managed command
    And resulting statusLine should not nest another wrapper command

  # @feature2
  Scenario: PLUGIN011_36 Wrapper writes stdout and stderr into log_file
    Given test runner wrapper is running with session "abc12345"
    When wrapped process writes to both stdout and stderr
    Then log_file should contain both stdout and stderr lines

  # @feature8
  Scenario: PLUGIN011_37 Wrapper outputs nothing when both commands fail
    Given statusline wrapper receives user command that exits with error
    And managed command also exits with error
    When wrapper is executed
    Then wrapper should output empty string
    And wrapper should exit with code 0

  # @feature8
  Scenario: PLUGIN011_38 Wrapper completes within timeout when user command hangs
    Given statusline wrapper receives user command that blocks for 10 seconds
    And managed command outputs "managedinfo"
    When wrapper is executed with 2-second timeout per command
    Then wrapper should output only "managedinfo"
    And wrapper total execution time should be under 5 seconds

  # @feature8
  Scenario: PLUGIN011_39 Wrapper normalizes multi-line ANSI user output to single line
    Given statusline wrapper receives user command that outputs multi-line ANSI text
    And managed command outputs "testinfo"
    When wrapper is executed
    Then wrapper should output single-line combined result with pipe separator
    And no newline characters should appear in the output

  # @feature8
  Scenario: PLUGIN011_40 Updater preserves wrapper when auto-updating extension
    Given global "~/.claude/settings.json" contains wrapper with user command and managed command
    When updater processes test-statusline extension update
    Then wrapper user command should remain unchanged
    And wrapper managed command should be updated

  # @feature8
  Scenario: PLUGIN011_41 Re-install does not create nested wrapper
    Given global "~/.claude/settings.json" contains wrapper combining user and managed commands
    When installer processes test-statusline extension again
    Then resulting statusLine should still be a single wrapper command
    And wrapper should contain exactly one user-b64 argument
    And wrapper should contain exactly one managed-b64 argument

  # @feature8
  Scenario: PLUGIN011_42 Wrapper forwards full StatusJSON stdin to both commands
    Given statusline wrapper receives full StatusJSON with context_window and cost fields
    And user command echoes received session_id from stdin
    And managed command echoes received session_id from stdin
    When wrapper is executed
    Then both commands should receive identical session_id

  # @feature9
  Scenario: PLUGIN011_43 ccstatusline auto-installed when no statusLine exists anywhere
    Given no global or project statusLine is configured
    When installer processes test-statusline extension
    Then global "~/.claude/settings.json" should contain wrapped statusLine
    And wrapper user command should be "npx -y ccstatusline@latest"
    And wrapper managed command should use portable path to statusline_render.cjs

  # @feature9
  Scenario: PLUGIN011_44 Project-level statusLine is removed during installation
    Given project ".claude/settings.json" contains old managed statusLine with project path
    When installer processes test-statusline extension
    Then project ".claude/settings.json" should not contain statusLine key
    And global "~/.claude/settings.json" should contain wrapped statusLine

  # @feature9
  Scenario: PLUGIN011_45 Global render script uses portable path resolution
    Given statusLine command uses portable makePortableScriptCommand pattern
    When the command is executed
    Then it should resolve ~/.dev-pomogator/scripts/statusline_render.cjs at runtime

  # @feature9
  Scenario: PLUGIN011_46 Global wrapper script uses portable path resolution
    Given wrapped statusLine command uses portable makePortableScriptCommand pattern
    When the wrapper command is executed
    Then it should resolve ~/.dev-pomogator/scripts/statusline_wrapper.js at runtime

  # @feature9
  Scenario: PLUGIN011_47 Old project-path managed statusLine migrated on update
    Given global "~/.claude/settings.json" contains old-format managed statusLine with absolute project path
    When updater processes test-statusline extension update
    Then global statusLine should be updated to portable wrapper format
    And project ".claude/settings.json" statusLine should be removed

  # @feature9
  Scenario: PLUGIN011_48 ccstatusline extra fields preserved during wrapping
    Given global "~/.claude/settings.json" contains statusLine with "padding" field set to 0
    When installer resolves statusLine coexistence
    Then global statusLine should retain "padding" field with value 0
    And statusLine command should be updated to wrapper format
