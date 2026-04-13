# Source: tests/features/plugins/ (Background pattern from PLUGIN009, PLUGIN010)
# Candidates: PLUGIN009_auto-capture.feature, PLUGIN010_prompt-suggest.feature
# Note: CompactBar render scenarios (PLUGIN011_60..62) in .specs/tui-statusline-mode/tui-statusline-mode.feature
# Note: Toggle/Stop/Resize scenarios (PLUGIN011_63..67) in .specs/tui-statusline-mode/tui-statusline-mode.feature

Feature: PLUGIN011_tui-statusline
  TUI statusline extension manages test runner sessions, YAML status files,
  wrapper for test output parsing, and statusline coexistence.

  Background:
    Given dev-pomogator is installed
    And tui-statusline extension is enabled

  # ===========================================
  # @feature2 — YAML Protocol & Wrapper
  # ===========================================

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

  # @feature2
  Scenario: PLUGIN011_27 Wrapper writes pid field to YAML
    Given test runner wrapper starts with a valid session
    When wrapper creates or updates YAML status file
    Then YAML status file should contain numeric field "pid"

  # @feature2
  Scenario: PLUGIN011_36 Wrapper writes stdout and stderr into log_file
    Given test runner wrapper is running with session "abc12345"
    When wrapped process writes to both stdout and stderr
    Then log_file should contain both stdout and stderr lines

  # @feature2
  Scenario: PLUGIN011_76 Vitest adapter ignores file-level FAIL lines
    Given vitest adapter receives line "FAIL tests/e2e/file.test.ts > Suite > test"
    When adapter parses the line
    Then no test_fail event should be produced
    And adapter should still detect real test failures via unicode markers

  # ===========================================
  # @feature3 — Session Isolation
  # ===========================================

  # @feature3
  Scenario: PLUGIN011_13 Status file path uses session_id prefix
    Given session_id is "abc12345def67890"
    When status file path is computed
    Then status file should be at ".dev-pomogator/.test-status/status.abc12345.yaml"

  # ===========================================
  # @feature4 — SessionStart Hook
  # ===========================================

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
  Scenario: PLUGIN011_52 Hook writes session.env file when CLAUDE_ENV_FILE not available
    Given CLAUDE_ENV_FILE is not set (known Claude Code bug #15840)
    When SessionStart hook receives session_id "abc12345def67890"
    Then session.env file should exist in .test-status directory
    And session.env should contain "TEST_STATUSLINE_SESSION=abc12345"

  # @feature4
  Scenario: PLUGIN011_53 Wrapper reads session.env when env vars not set
    Given session.env file exists with session "abc12345"
    And TEST_STATUSLINE_SESSION env var is not set
    When wrapper runs a test command
    Then YAML status file should be created for session "abc12345"

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

  # @feature4
  Scenario: PLUGIN011_28 SessionStart repairs running files with dead pid
    Given a YAML status file has state "running" and dead pid
    When SessionStart hook is triggered
    Then file should remain present
    And YAML state should be rewritten to "failed"

  # ===========================================
  # @feature5 — Extension Manifest
  # ===========================================

  # @feature5
  Scenario: PLUGIN011_18 Extension manifest lists all tool files
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest is parsed
    Then toolFiles should include "test_runner_wrapper.cjs"
    And toolFiles should include "statusline_session_start.ts"
    And toolFiles should include "status_types.ts"
    And toolFiles should NOT include "statusline_render.cjs"

  # @feature5
  Scenario: PLUGIN011_19 Extension manifest registers SessionStart hook
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest hooks section is parsed
    Then hooks should contain SessionStart event
    And SessionStart hook command should reference statusline_session_start.ts

  # @feature5
  Scenario: PLUGIN011_20 Extension manifest does NOT declare statusLine (removed in v2)
    Given extension.json exists at "extensions/test-statusline/extension.json"
    When manifest is parsed
    Then statusLine section should be undefined

  # ===========================================
  # @feature8 — StatusLine Resolution (Direct, no wrapping)
  # ===========================================

  # @feature8
  Scenario: PLUGIN011_21 Installer sets ccstatusline directly when no statusLine exists
    Given no global user statusLine is configured
    When installer processes test-statusline extension
    Then global "~/.claude/settings.json" should contain "npx -y ccstatusline@latest"
    And statusLine command should NOT contain "statusline_wrapper.js"

  # @feature8
  Scenario: PLUGIN011_22 Old managed statusLine is replaced with ccstatusline
    Given global "~/.claude/settings.json" contains legacy managed statusline_render.cjs command
    When installer resolves statusLine
    Then statusLine command should be "npx -y ccstatusline@latest"

  # @feature8
  Scenario: PLUGIN011_23 User-defined statusLine is preserved as-is
    Given global "~/.claude/settings.json" contains user-defined statusLine command
    When installer resolves statusLine
    Then statusLine command should be the original user command unchanged

  # @feature8
  Scenario: PLUGIN011_24 Legacy wrapped command is unwrapped to user command
    Given global "~/.claude/settings.json" contains legacy wrapped statusLine with base64 user and managed commands
    When installer resolves statusLine
    Then statusLine command should be the extracted user command (unwrapped)
    And statusLine command should NOT contain "statusline_wrapper.js"

  # @feature8
  Scenario: PLUGIN011_34 Broken legacy wrapper falls back to ccstatusline
    Given global "~/.claude/settings.json" contains legacy wrapped command with invalid base64
    When installer resolves statusLine
    Then statusLine command should fall back to "npx -y ccstatusline@latest"

  # @feature8
  Scenario: PLUGIN011_40 Updater unwraps legacy wrapper to user command
    Given global "~/.claude/settings.json" contains legacy wrapped statusLine
    When updater processes test-statusline extension update
    Then statusLine command should be the extracted user command (unwrapped)

  # @feature8
  Scenario: PLUGIN011_41 Re-install is idempotent (ccstatusline stays ccstatusline)
    Given ccstatusline was previously installed as direct statusLine command
    When installer processes test-statusline extension again
    Then statusLine command should remain "npx -y ccstatusline@latest"

  # ===========================================
  # @feature9 — Global StatusLine Migration
  # ===========================================

  # @feature9
  Scenario: PLUGIN011_43 ccstatusline auto-installed directly when no statusLine exists
    Given no global or project statusLine is configured
    When installer processes test-statusline extension
    Then statusLine command should be "npx -y ccstatusline@latest"
    And statusLine mode should be "direct"

  # @feature9
  Scenario: PLUGIN011_44 Project-level statusLine is removed during installation
    Given project ".claude/settings.json" contains old managed statusLine with project path
    When installer processes test-statusline extension
    Then project ".claude/settings.json" should not contain statusLine key

  # @feature9
  Scenario: PLUGIN011_48 Extra fields like padding are preserved in resolution
    Given global "~/.claude/settings.json" contains statusLine with "padding" field set to 0
    When installer resolves statusLine
    Then global statusLine should retain "padding" field with value 0
    And statusLine command should be "npx -y ccstatusline@latest"

  # @feature9
  Scenario: PLUGIN011_51 Installer writes ccstatusline to global settings.json (integration)
    Given dev-pomogator is installed with --claude --all
    Then global "~/.claude/settings.json" should contain statusLine key
    And statusLine command should contain "ccstatusline"

  # ===========================================
  # @feature1 — CompactBar Render (TUI)
  # See also: .specs/tui-statusline-mode/tui-statusline-mode.feature
  # ===========================================

  # @feature1
  Scenario: PLUGIN011_60 CompactBar renders running state with progress
    Given a test status with state "running", framework "vitest", passed 38, failed 2, total 50, percent 76
    When render_compact is called
    Then output should contain "76%"
    And output should contain "38/50"
    And output should contain "2"
    And output should contain "vitest"

  # @feature1
  Scenario: PLUGIN011_61 CompactBar shows idle indicator when no tests
    Given no test status is available
    When render_compact is called with null
    Then output should contain "no test runs"

  # @feature1
  Scenario: PLUGIN011_62 CompactBar handles corrupted YAML gracefully
    Given test status data is corrupted
    When render_compact is called
    Then output should contain "no test runs"
    And no exception should be thrown

  # @feature12
  Scenario: PLUGIN011_74 CompactBar hides total and percent when total is 0
    Given a test status with state "running", framework "vitest", passed 34, total 0, percent 0
    When render_compact is called
    Then output should NOT contain "/" or "%"
    And output should contain "34"

  # @feature12
  Scenario: PLUGIN011_75 CompactBar shows real progress with discovery total
    Given a test status with state "running", framework "vitest", passed 34, total 575, percent 6
    When render_compact is called
    Then output should contain "34/575"
    And output should contain "6%"

  # ===========================================
  # @feature13 — Adapter Integration (Pipeline)
  # ===========================================

  # @feature13
  Scenario: PLUGIN011_78 VitestAdapter parses fixture into correct counts
    Given a fixture file "vitest-docker-output.txt" with real vitest output
    When each line is fed through VitestAdapter.parseLine()
    Then parsed events should contain 8 passed, 2 failed, 3 skipped

  # @feature13
  Scenario: PLUGIN011_79 VitestAdapter parses suite start headers
    Given a vitest output line with suite marker
    When fed through VitestAdapter.parseLine()
    Then event type should be "suite_start"

  # @feature13
  Scenario: PLUGIN011_80 Full pipeline: fixture -> adapter -> render
    Given a fixture file "vitest-docker-output.txt" parsed through VitestAdapter
    When results are rendered through CompactBar
    Then output should contain pass and fail counts
    And output should NOT contain "building Docker"

  # @feature13
  Scenario: PLUGIN011_81 Building Docker state with 0 completed tests
    Given VitestAdapter has 0 results but total is known
    When rendered through CompactBar
    Then output should contain "building Docker"

  # ===========================================
  # @feature5 — Statusline Render Removal
  # ===========================================

  # @feature5
  Scenario: PLUGIN011_68 Legacy render files removed from extension
    Given extension directory "extensions/test-statusline/tools/test-statusline" exists
    When checking for legacy render files
    Then "statusline_render.cjs" should NOT exist
    And "statusline_render.sh" should NOT exist
    And "statusline_wrapper.js" should NOT exist

  # @feature5
  Scenario: PLUGIN011_69 Shared files still present after render removal
    Given extension directory "extensions/test-statusline/tools/test-statusline" exists
    When checking for shared files
    Then "statusline_session_start.ts" should exist
    And "test_runner_wrapper.cjs" should exist
    And "status_types.ts" should exist

  # ===========================================
  # @feature14 — Docker Session Propagation
  # ===========================================

  # @feature14
  Scenario: PLUGIN011_82 docker-test.sh reads session.env and passes SESSION to container
    Given session.env exists at ".dev-pomogator/.test-status/session.env" with session "abc12345"
    When docker-test.sh constructs the docker compose run command
    Then the command should include "-e TEST_STATUSLINE_SESSION=abc12345"

  # @feature14
  Scenario: PLUGIN011_83 docker-test.sh proceeds without SESSION when session.env missing
    Given session.env does not exist at ".dev-pomogator/.test-status/session.env"
    When docker-test.sh constructs the docker compose run command
    Then the command should NOT include "-e TEST_STATUSLINE_SESSION"
    And docker-test.sh should exit successfully

  # @feature14
  Scenario: PLUGIN011_84 CJS wrapper reads session.env from docker-status fallback
    Given TEST_STATUSLINE_SESSION is not set in environment
    And session.env exists at ".dev-pomogator/.docker-status/session.env" with session "abc12345"
    When CJS wrapper runs
    Then wrapper should set TEST_STATUSLINE_SESSION to "abc12345"

  # @feature14
  Scenario: PLUGIN011_85 Wrapper produces YAML inside Docker when SESSION propagated
    Given TEST_STATUSLINE_SESSION is set to "abc12345"
    And TEST_STATUS_DIR is set to ".dev-pomogator/.docker-status"
    When wrapper runs a test command
    Then YAML status file should exist at ".dev-pomogator/.docker-status/status.abc12345.yaml"

  # ===========================================
  # @feature15 — Dual-Directory YAML Reader
  # ===========================================

  # @feature15
  Scenario: PLUGIN011_86 YamlReader falls back to docker-status directory
    Given primary status file does not exist at ".test-status/status.abc12345.yaml"
    And a status file exists at ".docker-status/status.abc12345.yaml"
    When YamlReader.check() is called with fallback dirs
    Then it should return TestStatus from the docker-status file

  # @feature15
  Scenario: PLUGIN011_87 YamlReader prefers freshest file across directories
    Given a status file exists in ".test-status/" with mtime 10 seconds ago
    And a status file exists in ".docker-status/" with mtime 2 seconds ago
    When YamlReader.check() is called with fallback dirs
    Then it should return TestStatus from the docker-status file

  # @feature15
  Scenario: PLUGIN011_88 YamlReader returns None when no files in any directory
    Given no status files exist in ".test-status/" or ".docker-status/"
    When YamlReader.check() is called with fallback dirs
    Then it should return None

  # @feature15
  Scenario: PLUGIN011_89 Launcher passes docker-status as fallback directory
    Given tui-test-runner launcher is invoked with a status file path in ".test-status/"
    When launcher builds TUI launch arguments
    Then arguments should include "--fallback-dir" with ".docker-status" path

  # ===========================================
  # @feature16 — TUI Stop Hook (Session Cleanup)
  # ===========================================

  # @feature16
  Scenario: PLUGIN011_90 Stop hook kills TUI process from tui.pid
    Given tui.pid exists in ".test-status/" with a running process PID
    When Stop hook is triggered
    Then the TUI process should receive termination signal
    And tui.pid file should be removed

  # @feature16
  Scenario: PLUGIN011_91 Stop hook cleans stale tui.pid with dead process
    Given tui.pid exists in ".test-status/" with a dead process PID
    When Stop hook is triggered
    Then tui.pid file should be removed
    And hook should exit with code 0

  # @feature16
  Scenario: PLUGIN011_92 Stop hook exits cleanly when tui.pid missing
    Given tui.pid does not exist in any status directory
    When Stop hook is triggered
    Then hook should exit with code 0

  # @feature16
  Scenario: PLUGIN011_93 SessionStart hook kills stale TUI from previous session
    Given tui.pid exists from a previous session with a running process
    When SessionStart hook is triggered for a new session
    Then old TUI process should be terminated
    And new session should proceed normally

  # ===========================================
  # @feature14 — Docker Wrapper Wrapping
  # ===========================================

  # @feature14
  Scenario: PLUGIN011_94 docker-test.sh wraps custom args with wrapper
    Given docker-test.sh receives custom test arguments
    When constructing the docker compose run command
    Then test_runner_wrapper.cjs SHALL be prepended to the arguments
    And YAML status file SHALL be written during the test run

  # @feature13
  Scenario: PLUGIN011_95 Discovery count respects file filter args
    Given wrapper receives command args with specific test file paths
    When discoverTestCount runs with those file filters
    Then discovery total SHALL match filtered count not full project total
