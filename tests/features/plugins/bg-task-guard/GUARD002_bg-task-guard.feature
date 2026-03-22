Feature: GUARD002 Background Task Guard
  As a developer using dev-pomogator
  I want Claude to automatically continue working after launching background tasks
  So that I don't lose 7-12 minutes of idle time per Docker test run

  Background:
    Given dev-pomogator is installed
    And test-statusline extension is enabled

  # @feature1
  Scenario: GUARD002_01 PostToolUse creates marker when bg task detected
    Given no bg-task marker file exists
    When PostToolUse hook receives Bash output containing "Command running in background"
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
