# Source: .specs/spec-test-sync/spec-test-sync.feature
Feature: PLUGIN015_Spec-Test Sync Enforcement

  Background:
    Given dev-pomogator is installed
    And plan-pomogator extension is enabled

  # @feature1
  Scenario: PLUGIN015_01 validate-plan warns when tests in File Changes without specs
    Given a plan file with File Changes containing "tests/e2e/auth.test.ts" action "edit"
    And File Changes does not contain any ".specs/" or ".feature" paths
    When validate-plan.ts runs Phase 4 validation
    Then it should output a warning containing "тест" and "спек"

  # @feature1
  Scenario: PLUGIN015_02 validate-plan passes when tests and specs both present
    Given a plan file with File Changes containing "tests/e2e/auth.test.ts" action "edit"
    And File Changes contains ".specs/auth/FR.md" action "edit"
    When validate-plan.ts runs Phase 4 validation
    Then it should not output a test-spec sync warning

  # @feature1
  Scenario: PLUGIN015_03 validate-plan no warning when no test files in File Changes
    Given a plan file with File Changes containing only "src/parser.ts" action "edit"
    When validate-plan.ts runs Phase 4 validation
    Then it should not output a test-spec sync warning

  # @feature2
  Scenario: PLUGIN015_04 validate-plan warns when bugfix Reason without BDD feature
    Given a plan file with File Changes containing "src/parser.ts" action "edit" reason "Fix parsing bug"
    And File Changes does not contain any ".feature" paths
    When validate-plan.ts runs Phase 4 validation
    Then it should output a warning containing "багфикс" or "BDD"

  # @feature2
  Scenario: PLUGIN015_05 validate-plan passes when bugfix has feature file
    Given a plan file with File Changes containing "src/parser.ts" action "edit" reason "Fix parsing bug"
    And File Changes contains "tests/features/parser.feature" action "edit"
    When validate-plan.ts runs Phase 4 validation
    Then it should not output a bugfix BDD warning

  # @feature1 @feature2
  Scenario: PLUGIN015_09 spec-test-sync rule is installed
    Given dev-pomogator is installed with plan-pomogator extension
    Then ".claude/rules/pomogator/spec-test-sync.md" should exist
    And it should contain "Антипаттерн"
    And it should contain "Чеклист"
