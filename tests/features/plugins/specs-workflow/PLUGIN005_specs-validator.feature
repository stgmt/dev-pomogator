Feature: PLUGIN005 Specs Validator Hook
  As a developer using specs-workflow
  I want automatic validation of specs coverage
  So that my requirements, BDD scenarios and tests stay in sync

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # @feature1
  Scenario: Hook is registered for Cursor
    When dev-pomogator installs specs-workflow for Cursor
    Then hooks.json should contain beforeSubmitPrompt hook
    And hook command should reference validate-specs.ts

  # @feature2
  Scenario: Hook is registered for Claude
    When dev-pomogator installs specs-workflow for Claude
    Then .claude/settings.json should contain UserPromptSubmit hook
    And hook command should reference validate-specs.ts

  # @feature3
  Scenario: Validation activates for complete spec
    Given .specs/my-feature/ contains all 12 required MD files
    And .specs/my-feature/ contains a .feature file
    When validation hook runs
    Then validation should process my-feature directory
    And validation-report.md should be created

  # @feature4
  Scenario: Validation skips incomplete spec
    Given .specs/incomplete-feature/ contains only FR.md
    And .specs/incomplete-feature/ has no .feature file
    When validation hook runs
    Then validation should skip incomplete-feature directory
    And no validation-report.md should exist in incomplete-feature

  # @feature5
  Scenario: Validation detects uncovered FR
    Given .specs/test-feature/ is a complete spec
    And FR.md contains "## FR-1: Test @feature10"
    And .feature file does NOT contain @feature10
    When validation hook runs
    Then validation-report.md should contain "NOT_COVERED"
    And validation-report.md should reference @feature10

  # @feature6
  Scenario: Validation detects orphan scenario
    Given .specs/test-feature/ is a complete spec
    And .feature file contains "# @feature99"
    And no MD file contains @feature99
    When validation hook runs
    Then validation-report.md should contain "ORPHAN"
    And validation-report.md should reference @feature99

  # @feature7
  Scenario: Validation passes for fully linked spec
    Given .specs/test-feature/ is a complete spec
    And FR.md contains "## FR-1: Login @feature20"
    And .feature file contains "# @feature20" before Scenario
    When validation hook runs
    Then validation-report.md should contain "COVERED"
    And validation-report.md should show @feature20 as linked

  # @feature8
  Scenario: Hook skips when no .specs folder
    Given .specs/ directory does not exist
    When validation hook runs
    Then no validation occurs
    And no warning is shown
    And exit code is 0

  # @feature9
  Scenario: Hook can be disabled via config
    Given .specs/my-feature/ is a complete spec
    And .specs-validator.yaml contains "enabled: false"
    When validation hook runs
    Then validation is skipped
    And no validation-report.md is created in my-feature
