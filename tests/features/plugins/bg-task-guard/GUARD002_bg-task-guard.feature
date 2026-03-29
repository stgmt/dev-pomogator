Feature: GUARD002 Background Task Guard
  As a developer using dev-pomogator
  I want Claude to automatically continue working after launching background tasks
  So that I don't lose 7-12 minutes of idle time per Docker test run

  Background:
    Given dev-pomogator is installed
    And test-statusline extension is enabled

  # @feature1
  Scenario: GUARD002_01 mark-bg-task is no-op (marker creation in wrapper)
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_input with run_in_background true
    Then mark-bg-task exits 0 without creating marker
    And marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature1
  Scenario: GUARD002_02 PostToolUse ignores non-background commands
    Given no bg-task marker file exists
    When PostToolUse hook receives Bash output "hello world"
    Then marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature1
  Scenario: GUARD002_03 Stop hook blocks when marker is fresh (within TTL)
    Given marker file exists with non-numeric task ID and timestamp 2 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And hook should include reason mentioning "Background task"

  # @feature2
  Scenario: GUARD002_04 Stop hook allows when marker PID is dead
    Given marker file ".dev-pomogator/.bg-task-active" exists with dead PID 99999
    When Stop hook executes
    Then hook should exit 0 without blocking
    And marker file should be deleted

  # @feature1
  Scenario: GUARD002_05 Stop hook allows when no marker exists
    Given no bg-task marker file exists
    When Stop hook executes
    Then hook should exit 0 without blocking

  # @feature1
  Scenario: GUARD002_06 Hooks fail-open on errors
    Given marker file ".dev-pomogator/.bg-task-active" contains invalid content
    When Stop hook executes
    Then hook should exit 0 without blocking

  # @feature1
  Scenario: GUARD002_07 Extension manifest declares hooks
    Given test-statusline extension.json exists
    Then hooks.claude should contain PostToolUse for bg-task-guard
    And hooks.claude should contain Stop for bg-task-guard
    And toolFiles should include bg-task-guard scripts

  # @feature1
  Scenario: GUARD002_08 PostToolUse hook has correct matcher
    Given test-statusline extension.json exists
    Then PostToolUse hook for bg-task-guard should have matcher "Bash"

  # @feature3
  Scenario: GUARD002_09 PostToolUse does NOT create marker from stdout fallback
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_response with stdout "Command running in background"
    Then marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature1
  Scenario: GUARD002_10 PostToolUse ignores backgroundTaskId without run_in_background
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_response with backgroundTaskId but no run_in_background
    Then marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature3
  Scenario: GUARD002_12 Stop allows when marker PID is dead even with stale YAML
    Given marker file with dead PID 99998
    And stale YAML status file with state "running"
    When Stop hook executes
    Then hook should exit 0 without blocking
    And marker file should be deleted

  # @feature3
  Scenario: GUARD002_13 Stop blocks when non-numeric task ID regardless of marker age
    Given marker file with non-numeric task ID "task-alive" and timestamp 10 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"

  # @feature4
  Scenario: GUARD002_14 Stop hook allows stop when marker is empty
    Given marker file ".dev-pomogator/.bg-task-active" exists but is empty
    When Stop hook executes
    Then hook should exit with code 0
    And marker file should be deleted

  # @feature4
  Scenario: GUARD002_15 Stop hook allows stop when marker is whitespace-only
    Given marker file ".dev-pomogator/.bg-task-active" contains only whitespace
    When Stop hook executes
    Then hook should exit with code 0
    And marker file should be deleted

  # @feature4
  Scenario: GUARD002_16 Mark hook does not create marker with empty stdin
    Given no bg-task marker file exists
    When PostToolUse hook receives empty stdin
    Then no marker file should be created

  # @feature4
  Scenario: GUARD002_17 Mark hook does not create marker without run_in_background
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_input without run_in_background
    Then no marker file should be created

  # @feature5
  Scenario: GUARD002_18 Stop hook allows stop when tests completed
    Given marker file exists with task ID "task123" and timestamp 2 minutes ago
    And YAML status file exists with state "passed", passed 5, failed 0, skipped 2
    When Stop hook executes
    Then hook should exit with code 0
    And marker file should be deleted

  # @feature5
  Scenario: GUARD002_19 Stop hook warns on all-skipped (filter matched nothing)
    Given marker file exists with task ID "task456" and timestamp 2 minutes ago
    And YAML status file exists with state "passed", passed 0, failed 0, skipped 709
    When Stop hook executes
    Then hook should exit with code 0
    And marker file should be deleted

  # @feature5
  Scenario: GUARD002_20 Stop hook shows progress when tests still running
    Given marker file exists with task ID "task789" and timestamp 2 minutes ago
    And YAML status file exists with state "running", passed 3, total 20, percent 15
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should contain "3/20"

  # @feature7
  Scenario: GUARD002_21 mark-bg-task is no-op (does not create per-session or legacy marker)
    Given PostToolUse stdin with session_id "sess-aaaa-bbbb-cccc" and run_in_background true
    When mark-bg-task hook executes
    Then no per-session marker is created
    And no legacy marker is created

  # @feature7
  Scenario: GUARD002_22 Stop hook ignores other session markers
    Given per-session marker ".bg-task-active.sessAAAA" exists with age 1 minute
    And session.env contains TEST_STATUSLINE_SESSION=sessBBBB
    When Stop hook executes
    Then hook should exit with code 0 allowing stop

  # @feature7
  Scenario: GUARD002_23 Stop hook blocks on own session marker
    Given per-session marker ".bg-task-active.sessAAAA" exists with age 1 minute
    And session.env contains TEST_STATUSLINE_SESSION=sessAAAA
    When Stop hook executes
    Then hook should output JSON with "decision": "block"

  # @feature7
  Scenario: GUARD002_24 Orphan marker from other session is not visible
    Given per-session marker ".bg-task-active.deadSESS" exists with age 20 minutes
    And session.env contains TEST_STATUSLINE_SESSION=liveSESS
    When Stop hook executes
    Then hook should exit with code 0 allowing stop
    And orphaned marker still exists (not this session's responsibility)

  # @feature8
  Scenario: GUARD002_26 Stop hook skips inconsistent YAML data from partial reads
    Given marker file exists with task ID "race-task" and timestamp 2 minutes ago
    And YAML status file with partial read data: state "running", passed 0, percent 51
    When Stop hook executes
    Then hook should block but NOT show inconsistent progress numbers

  # @feature9
  Scenario: GUARD002_29 Stop hook blocks with "Building Docker" message for building state
    Given marker file exists with task ID "build-task" and timestamp 2 minutes ago
    And YAML status file exists with state "building", passed 0, total 733, percent 0
    When Stop hook executes
    Then hook should output JSON with "decision": "block" and reason containing "Building Docker"

  # @feature9
  Scenario: GUARD002_30 Stop hook does NOT trigger stuck detection for building state
    Given marker file exists with task ID "build-task-long" and timestamp 4 minutes ago
    And YAML status file exists with state "building", passed 0, total 733, percent 0
    When Stop hook executes
    Then hook should block with "Building Docker" and NOT allow via stuck detection

  # @feature10
  Scenario: GUARD002_31 mark-bg-task is no-op regardless of session_id
    Given PostToolUse stdin with session_id and run_in_background true
    When mark-bg-task hook executes
    Then no marker file is created (wrapper handles marker lifecycle)

  # @feature10
  Scenario: GUARD002_32 Stop hook skips stale YAML (mtime > 30s)
    Given marker file exists with task ID "stale-task" and timestamp 1 minute ago
    And YAML status file exists but with mtime > 30 seconds ago (stale from previous run)
    When Stop hook executes
    Then hook should block but NOT show progress from stale YAML

  # @feature10
  Scenario: GUARD002_33 Stop hook reads session prefix from session.env
    Given session.env contains TEST_STATUSLINE_SESSION=testpfx1
    And per-session marker ".bg-task-active.testpfx1" exists
    When Stop hook executes with empty stdin (no session_id)
    Then hook should find marker via session.env and block

  # @feature10
  Scenario: GUARD002_34 Wrapper cleans stale marker with dead PID
    Given marker file exists with dead PID 99999
    When wrapper starts
    Then it should detect dead PID and delete stale marker before creating new

  # @feature8
  Scenario: GUARD002_35 Stop hook detects percent mismatch with passed count
    Given marker file exists with task ID "race-task2" and timestamp 2 minutes ago
    And YAML status with passed=33 total=769 but percent=56 (33/769=4.3% not 56%)
    When Stop hook executes
    Then hook should block but NOT show mismatched 56% (partial read detected)
