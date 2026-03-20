Feature: GUARD001 Test Guard Hook
  As a developer using dev-pomogator
  I want direct test commands to be blocked by test_guard hook
  So that all tests run through the wrapper for TUI monitoring

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # @feature1
  Scenario: GUARD001_01 Block direct pytest
    When test_guard receives command "python -m pytest"
    Then it should deny with exit code 2
    And deny message should contain "/run-tests"

  # @feature1
  Scenario: GUARD001_02 Block direct vitest
    When test_guard receives command "npx vitest run"
    Then it should deny with exit code 2

  # @feature1
  Scenario: GUARD001_03 Block direct jest
    When test_guard receives command "npx jest"
    Then it should deny with exit code 2

  # @feature1
  Scenario: GUARD001_04 Block direct dotnet test
    When test_guard receives command "dotnet test"
    Then it should deny with exit code 2

  # @feature1
  Scenario: GUARD001_05 Block direct cargo test
    When test_guard receives command "cargo test"
    Then it should deny with exit code 2

  # @feature1
  Scenario: GUARD001_06 Block direct go test
    When test_guard receives command "go test ./..."
    Then it should deny with exit code 2

  # @feature1
  Scenario: GUARD001_07 Block direct npm test
    When test_guard receives command "npm test"
    Then it should deny with exit code 2

  # @feature2
  Scenario: GUARD001_08 Allow wrapper command
    When test_guard receives command "bash test_runner_wrapper.sh pytest"
    Then it should allow with exit code 0

  # @feature2
  Scenario: GUARD001_09 Allow wrapper command with --framework flag
    When test_guard receives command "bash test_runner_wrapper.sh --framework dotnet -- dotnet test"
    Then it should allow with exit code 0

  # @feature2
  Scenario: GUARD001_10 Allow non-test commands
    When test_guard receives command "ls -la"
    Then it should allow with exit code 0

  # @feature1
  Scenario: GUARD001_11 Deny message contains supported frameworks
    When test_guard receives command "python -m pytest tests/"
    Then it should deny with exit code 2
    And deny message should list supported frameworks (vitest, pytest, dotnet)

  # @feature3
  Scenario: GUARD001_12 extension.json has hooks in correct object format
    Given tui-test-runner extension.json exists
    Then hooks should be in object format (not array)
    And hooks.claude should contain SessionStart and PreToolUse
    And PreToolUse should have matcher "Bash"
