Feature: GUARD002 Background Task Guard
  As a developer using dev-pomogator
  I want Claude to automatically continue working after launching background tasks
  So that I don't lose 7-12 minutes of idle time per Docker test run

  Background:
    Given dev-pomogator is installed
    And test-statusline extension is enabled

  # @feature1
  Scenario: GUARD002_01 PostToolUse creates marker when run_in_background is true
    Given no bg-task marker file exists
    When PostToolUse hook receives tool_input with run_in_background true
    Then marker file ".dev-pomogator/.bg-task-active" should be created
    And marker file should contain ISO 8601 timestamp

  # @feature1
  Scenario: GUARD002_02 PostToolUse ignores non-background commands
    Given no bg-task marker file exists
    When PostToolUse hook receives Bash output "hello world"
    Then marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature1
  Scenario: GUARD002_03 Stop hook blocks when marker is fresh
    Given marker file ".dev-pomogator/.bg-task-active" exists with timestamp 2 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"
    And hook should include reason mentioning "Background task"

  # @feature2
  Scenario: GUARD002_04 Stop hook allows when marker is stale
    Given marker file ".dev-pomogator/.bg-task-active" exists with timestamp 20 minutes ago
    When Stop hook executes
    Then hook should exit 0 without blocking
    And stale marker file should be deleted

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
  Scenario: GUARD002_11 PostToolUse deletes marker when TaskOutput tool completes
    Given marker file ".dev-pomogator/.bg-task-active" exists with task ID "task123"
    When PostToolUse hook receives TaskOutput tool_response for task "task123"
    Then marker file ".dev-pomogator/.bg-task-active" should NOT exist

  # @feature3
  Scenario: GUARD002_12 Stop hook soft TTL allows after 5 min with no fresh running status
    Given marker file ".dev-pomogator/.bg-task-active" exists with task ID "task456" and timestamp 6 minutes ago
    And test-status directory has stale "running" status file (20 minutes old)
    When Stop hook executes
    Then hook should exit 0 without blocking
    And marker file ".dev-pomogator/.bg-task-active" should be deleted

  # @feature3
  Scenario: GUARD002_13 Stop hook blocks within soft TTL even without test-status
    Given marker file ".dev-pomogator/.bg-task-active" exists with task ID "task789" and timestamp 3 minutes ago
    When Stop hook executes
    Then hook should output JSON with "decision": "block"

  # @feature9
  Scenario: GUARD002_29 Stop hook shows "Building Docker" for building state
    Given marker file ".dev-pomogator/.bg-task-active" exists with task ID "build-task" and timestamp 2 minutes ago
    And YAML status file with state "building"
    When Stop hook executes
    Then hook should block with "Building Docker image" message

  # @feature9
  Scenario: GUARD002_30 Building state does not trigger stuck detection
    Given marker file ".dev-pomogator/.bg-task-active" exists with task ID "build-long" and timestamp 4 minutes ago
    And YAML status file with state "building"
    When Stop hook executes
    Then hook should block with "Building Docker image" (not allow via stuck)

  # @feature10
  Scenario: GUARD002_31 mark-bg-task is no-op (centralized lifecycle in wrapper)
    Given PostToolUse stdin with run_in_background true
    When mark-bg-task hook executes
    Then hook exits 0 without creating any marker file

  # @feature10
  Scenario: GUARD002_32 Stop hook skips stale YAML from previous run
    Given marker file with active task
    And YAML status file older than 30 seconds
    When Stop hook executes
    Then hook blocks without showing progress from stale YAML
