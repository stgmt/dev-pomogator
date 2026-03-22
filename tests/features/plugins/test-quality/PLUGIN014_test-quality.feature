# Source: tests/features/plugins/ (Background pattern from PLUGIN009, PLUGIN011)

Feature: PLUGIN014_test-quality
  Test quality extension detects duplicated helpers in test files
  via Stop hook and /dedup-tests skill.

  Background:
    Given dev-pomogator is installed
    And test-quality extension is enabled

  # ===========================================
  # @feature1 — Stop Hook (dedup_stop.ts)
  # ===========================================

  # @feature1
  Scenario: PLUGIN014_01 Hook approves when no test files changed
    Given git diff has no files in tests/ directory
    When dedup_stop hook receives Stop event
    Then hook should output "{}" (approve)
    And hook should exit with code 0

  # @feature1
  Scenario: PLUGIN014_02 Hook blocks when test files changed
    Given git diff includes "tests/e2e/some.test.ts"
    And no dedup marker file exists
    When dedup_stop hook receives Stop event
    Then hook should output block decision
    And block reason should mention "/dedup-tests"

  # @feature1
  Scenario: PLUGIN014_03 Hook approves on hash-dedup (same files already checked)
    Given git diff includes "tests/e2e/some.test.ts"
    And dedup marker exists with matching hash
    When dedup_stop hook receives Stop event
    Then hook should output "{}" (approve)

  # @feature1
  Scenario: PLUGIN014_04 Hook approves when disabled via env
    Given DEDUP_ENABLED is set to "false"
    When dedup_stop hook receives Stop event
    Then hook should output "{}" (approve)

  # @feature1
  Scenario: PLUGIN014_05 Hook approves after max retries
    Given dedup marker exists with count >= 1
    When dedup_stop hook receives Stop event
    Then hook should output "{}" (approve)

  # ===========================================
  # @feature2 — Extension Manifest
  # ===========================================

  # @feature2
  Scenario: PLUGIN014_06 Manifest registers Stop hook
    Given extension.json exists at "extensions/test-quality/extension.json"
    When manifest hooks section is parsed
    Then hooks should contain Stop event
    And Stop hook command should reference dedup_stop.ts

  # @feature2
  Scenario: PLUGIN014_07 Manifest declares dedup-tests skill
    Given extension.json exists at "extensions/test-quality/extension.json"
    When manifest skills section is parsed
    Then skills should contain "dedup-tests"

  # ===========================================
  # @feature3 — Helper Extraction
  # ===========================================

  # @feature3
  Scenario: PLUGIN014_08 getPythonRunner exported from helpers.ts
    Given tests/e2e/helpers.ts exists
    When helper exports are inspected
    Then "getPythonRunner" should be an exported function

  # @feature3
  Scenario: PLUGIN014_09 runPythonJson exported from helpers.ts
    Given tests/e2e/helpers.ts exists
    When helper exports are inspected
    Then "runPythonJson" should be an exported function

  # @feature3
  Scenario: PLUGIN014_10 No duplicate getPythonRunner in test files
    Given tests/e2e/helpers.ts exports getPythonRunner
    When scanning test files for local getPythonRunner definitions
    Then no test file should define its own getPythonRunner function
