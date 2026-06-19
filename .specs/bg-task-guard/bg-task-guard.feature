Feature: GUARD002 Background Task Guard
  As a developer using dev-pomogator
  I want Claude to automatically continue working after launching background tasks
  So that I don't lose 7-12 minutes of idle time per Docker test run

  Background:
    Given dev-pomogator is installed
    And test-statusline extension is enabled

  @feature1
  Scenario: GUARD002_01 mark-bg-task is no-op with run_in_background true
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_input with run_in_background true
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature1
  Scenario: GUARD002_02 mark-bg-task ignores non-background commands
    Given no bg-task marker file exists
    When PostToolUse hook receives Bash output "hello world"
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature1
  Scenario: GUARD002_03 Stop hook blocks when marker is fresh
    Given bg-task marker file exists with task ID "bs0olkeoz" and timestamp 2 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And reason should mention "Background task bs0olkeoz"

  @feature2
  Scenario: GUARD002_04 Stop hook allows when marker PID is dead
    Given bg-task marker file exists with task ID "99999" and timestamp from long ago
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature1
  Scenario: GUARD002_05 Stop hook allows when no marker exists
    Given no bg-task marker file exists
    When Stop hook executes
    Then hook exits 0 without blocking

  @feature1
  Scenario: GUARD002_06 Stop hook does not crash on invalid marker content
    Given bg-task marker file exists with invalid binary content
    When Stop hook executes
    Then hook exits 0

  @feature1
  Scenario: GUARD002_07 Plugin registry declares PostToolUse and Stop hooks
    Given dev-pomogator plugin hooks.json is installed
    Then PostToolUse hook for bg-task-guard should be registered with matcher "Bash"
    And Stop hook for bg-task-guard should be registered

  @feature1
  Scenario: GUARD002_08 bg-task-guard tool scripts exist in tools directory
    Given dev-pomogator is installed
    Then "tools/bg-task-guard/mark-bg-task.ts" should exist
    And "tools/bg-task-guard/stop-guard.sh" should exist

  @feature3
  Scenario: GUARD002_09 mark-bg-task does NOT create marker from stdout background text
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_response with stdout "Command running in background"
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature1
  Scenario: GUARD002_10 mark-bg-task ignores backgroundTaskId without run_in_background
    Given no bg-task marker file exists
    When PostToolUse hook receives backgroundTaskId "b7yh2acqb" without run_in_background flag
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature3
  Scenario: GUARD002_12 Stop hook allows when marker PID is dead even with stale YAML
    Given bg-task marker file exists with task ID "99998" and timestamp from long ago
    And test-status directory has a stale running YAML file
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature3
  Scenario: GUARD002_13 Stop hook blocks when marker has non-numeric task ID within TTL
    Given bg-task marker file exists with task ID "task-alive" and timestamp 10 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"

  @feature4
  Scenario: GUARD002_14 Stop hook allows when marker file is empty
    Given bg-task marker file exists and is empty
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature4
  Scenario: GUARD002_15 Stop hook allows when marker file is whitespace-only
    Given bg-task marker file exists with whitespace-only content
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature4
  Scenario: GUARD002_16 mark-bg-task does not create marker with empty stdin
    Given no bg-task marker file exists
    When mark-bg-task hook receives empty stdin
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature4
  Scenario: GUARD002_17 mark-bg-task does not create marker without run_in_background field
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_input without run_in_background field
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature5
  Scenario: GUARD002_18 Stop hook allows when YAML shows tests completed
    Given bg-task marker file exists with task ID "task123" and timestamp 2 minutes ago
    And YAML status file with state "passed" and 5 passed 0 failed 2 skipped 7 total at 100 percent
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature5
  Scenario: GUARD002_19 Stop hook allows on all-skipped YAML status
    Given bg-task marker file exists with task ID "task456" and timestamp 2 minutes ago
    And YAML status file with state "passed" and 0 passed 0 failed 709 skipped 709 total
    When Stop hook executes
    Then hook exits 0 without blocking
    And marker file should be deleted

  @feature5
  Scenario: GUARD002_20 Stop hook blocks and shows progress when tests still running
    Given bg-task marker file exists with task ID "task789" and timestamp 2 minutes ago
    And YAML status file with state "running" and 3 passed 1 failed 20 total at 15 percent
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should contain "3/20"

  @feature7
  Scenario: GUARD002_21 mark-bg-task is no-op regardless of session_id
    Given no bg-task marker file exists
    When PostToolUse hook is called with session_id "sess-aaaa-bbbb-cccc" and run_in_background true
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature7
  Scenario: GUARD002_22 Stop hook ignores other session markers
    Given bg-task marker file exists for session "sessAAAA" with task ID "task-A" and timestamp 1 minute ago
    And session.env file declares session prefix "sessBBBB"
    When Stop hook executes
    Then hook exits 0 without blocking

  @feature7
  Scenario: GUARD002_23 Stop hook blocks on own session marker
    Given bg-task marker file exists for session "sessAAAA" with task ID "task-A" and timestamp 1 minute ago
    And session.env file declares session prefix "sessAAAA"
    When Stop hook executes
    Then hook should output JSON with "decision": "block"

  @feature7
  Scenario: GUARD002_24 Stop hook allows stop when other session has active marker
    Given bg-task marker file exists for session "deadSESS" with task ID "orphan-task" and timestamp 20 minutes ago
    And session.env file declares session prefix "liveSESS"
    When Stop hook executes
    Then hook exits 0 without blocking

  @feature8
  Scenario: GUARD002_26 Stop hook skips inconsistent YAML where percent is positive but passed is zero
    Given bg-task marker file exists with task ID "race-task" and timestamp 2 minutes ago
    And YAML status file with state "running" and 0 passed at 51 percent total 733
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should NOT contain "0/733"

  @feature9
  Scenario: GUARD002_29 Stop hook blocks with "Building Docker" for building state
    Given bg-task marker file exists with task ID "build-task" and timestamp 2 minutes ago
    And YAML status file with state "building" and 0 passed 0 failed 733 total
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should contain "Building Docker"
    And output should NOT contain "0/733"

  @feature9
  Scenario: GUARD002_30 Building state does not trigger stuck detection
    Given bg-task marker file exists with task ID "build-task-long" and timestamp 4 minutes ago
    And YAML status file with state "building" and 0 passed 0 failed 733 total
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should contain "Building Docker"

  @feature10
  Scenario: GUARD002_31 mark-bg-task is no-op regardless of session_id value
    Given no bg-task marker file exists
    When PostToolUse hook is called with session_id "any-session-id" and run_in_background true
    Then mark-bg-task exits 0 and does NOT create marker file

  @feature10
  Scenario: GUARD002_32 Stop hook skips stale YAML older than 30 seconds
    Given bg-task marker file exists with task ID "stale-yaml-task" and timestamp 1 minute ago
    And YAML status file with state "running" and 100 passed 5 failed 200 total at 52 percent but mtime 60 seconds ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should NOT contain "100/200"

  @feature10
  Scenario: GUARD002_33 Stop hook reads session prefix from session.env file
    Given session.env file declares session prefix "testpfx1"
    And bg-task marker file exists for session "testpfx1" with task ID "session-env-task" and timestamp 1 minute ago
    When Stop hook executes with empty stdin
    Then hook should output JSON with "decision": "block"

  @feature10
  Scenario: GUARD002_34 Dead PID check confirms PID 99999 is not alive
    Given a process with PID 99999 does not exist on this system
    When we check if PID 99999 is alive
    Then the PID should be reported as dead

  @feature8
  Scenario: GUARD002_35 Stop hook skips inconsistent YAML with percent mismatch
    Given bg-task marker file exists with task ID "race-task2" and timestamp 2 minutes ago
    And YAML status file with state "running" and 33 passed at 56 percent total 769
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And output should NOT contain "56%"

  @feature5
  Scenario: GUARD002_36 Stuck task within escalation window asks human via agent
    Given bg-task marker file exists with task ID "stuck-task" and timestamp 4 minutes ago
    And YAML status file with state "running" and 0 passed 0 failed 100 total at 0 percent
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And reason should mention "AskUserQuestion"

  @feature5
  Scenario: GUARD002_37 Stuck task past escalation window allows stop for headless safety
    Given bg-task marker file exists with task ID "stuck-task" and timestamp 7 minutes ago
    And YAML status file with state "running" and 0 passed 0 failed 100 total at 0 percent
    When Stop hook executes
    Then hook exits 0 without blocking
