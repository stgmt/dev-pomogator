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
    Then YAML status file should contain field "version" with value "1"
    And YAML status file should contain field "session_id"
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
