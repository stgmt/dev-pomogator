# Source: tests/features/plugins/auto-commit/PLUGIN006_auto-commit.feature
Feature: Auto-Simplify Stop Hook
  As a developer using Claude Code
  I want automatic code quality review on significant file changes
  So that I don't forget to review code before finishing

  Background:
    Given dev-pomogator is installed

  # @feature1
  Scenario: No uncommitted changes — approve stop
    Given no files have been modified
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And exit code is 0

  # @feature2
  Scenario: Changes below threshold — approve stop
    Given 3 lines have been changed across 1 file
    And SIMPLIFY_MIN_LINES is 10
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And log contains "Below threshold"

  # @feature3
  Scenario: Changes above threshold, first time — block stop
    Given 25 lines have been changed across 3 files
    And no marker file exists
    When the Stop hook fires
    Then the hook outputs block with reason containing "/simplify"
    And a marker file is created with current diff hash

  # @feature4
  Scenario: Same diff hash on second call — approve (dedup)
    Given 25 lines have been changed across 3 files
    And marker file exists with same diff hash
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And log contains "already reviewed"

  # @feature5
  Scenario: Different hash within cooldown — approve
    Given 30 lines have been changed across 4 files
    And marker file exists with different hash from 1 minute ago
    And SIMPLIFY_COOLDOWN_MINUTES is 5
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And log contains "Cooldown active"

  # @feature6
  Scenario: Max retries exceeded — approve
    Given 20 lines have been changed across 2 files
    And marker file shows 2 previous attempts
    And SIMPLIFY_MAX_RETRIES is 2
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And log contains "Max retries"

  # @feature7
  Scenario: Git error — fail-open approve
    Given git is not available or repo is corrupted
    When the Stop hook fires
    Then the hook outputs approve "{}"
    And exit code is 0

  # @feature8
  Scenario: Disabled via env — approve
    Given SIMPLIFY_ENABLED is "false"
    When the Stop hook fires
    Then the hook outputs approve "{}"

  # @feature9
  Scenario: Corrupted marker file — treat as fresh
    Given 20 lines have been changed across 2 files
    And marker file contains invalid JSON
    When the Stop hook fires
    Then the hook outputs block with reason containing "/simplify"
