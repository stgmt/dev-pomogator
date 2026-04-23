Feature: SPECJIRA001 Optional Jira-first Workflow
  As a spec author working on a Jira-originated task
  I want Jira to stay a first-class source through every spec phase
  So that FR/AC/BDD/Tasks trace back to verbatim Jira quotes and attachments evidence,
  preventing silent drift like Stock Taking case in PRODUCTS-20218

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # @feature1
  Scenario: SPECJIRA001_01 Opt-in trigger by JIRA_SOURCE.md presence
    Given spec folder ".specs/has-jira/" contains "JIRA_SOURCE.md"
    And spec folder ".specs/has-jira/" contains FR.md with "## FR-1: Feature" and no Jira trace line
    When specs-validator runs on ".specs/has-jira/"
    Then validator output should contain rule "JIRA_SOURCE_PRESERVED"
    And validator output severity for "JIRA_SOURCE_PRESERVED" should be "WARNING"
    And validator should not fail with exit code 2

  # @feature2
  Scenario: SPECJIRA001_02 FR with Jira imperative trace passes JIRA_SOURCE_PRESERVED
    Given spec folder ".specs/traced-fr/" contains "JIRA_SOURCE.md"
    And FR.md contains "## FR-1: Block stock over-limit" followed within 15 lines by 'Jira imperative: "all doctypes except INBOUND"'
    When specs-validator runs on ".specs/traced-fr/"
    Then validator output should not contain "JIRA_SOURCE_PRESERVED" warning for FR-1

  # @feature3
  Scenario: SPECJIRA001_03 No JIRA_SOURCE.md → rule is no-op (opt-out)
    Given spec folder ".specs/no-jira/" does not contain "JIRA_SOURCE.md"
    And FR.md contains "## FR-1: Some feature" without any "Jira imperative:" line
    When specs-validator runs on ".specs/no-jira/"
    Then validator output should not contain rule "JIRA_SOURCE_PRESERVED"
    And zero new warnings from Jira-specific rules are emitted

  # @feature4
  Scenario: SPECJIRA001_04 AC requires Jira acceptance or Evidence trace
    Given spec folder ".specs/ac-check/" contains "JIRA_SOURCE.md"
    And ACCEPTANCE_CRITERIA.md contains "## AC-1 (FR-1): Block save" without "Jira acceptance:" or "Evidence:" line
    When specs-validator runs on ".specs/ac-check/"
    Then validator output should contain "JIRA_SOURCE_PRESERVED" warning for AC-1

  # @feature5
  Scenario: SPECJIRA001_05 BDD scenario missing Jira trace comment → warning
    Given spec folder ".specs/bdd-check/" contains "JIRA_SOURCE.md"
    And a .feature file contains "Scenario: Happy path" with no "# Jira trace:" comment within 10 preceding lines
    When specs-validator runs on ".specs/bdd-check/"
    Then validator output should contain "JIRA_SOURCE_PRESERVED" warning referencing the scenario

  # @feature6
  Scenario: SPECJIRA001_06 Audit JIRA_DRIFT emits INFO when MCP unavailable
    Given spec folder ".specs/drift-check/" contains valid ".jira-cache.json"
    And Jira MCP is unavailable
    When audit-runner runs on ".specs/drift-check/"
    Then audit findings should contain rule "JIRA_DRIFT"
    And the finding severity should be "INFO"
    And the finding message should contain "drift check skipped"

  # @feature7
  Scenario: SPECJIRA001_07 Templates are installed via extension
    When dev-pomogator installs specs-workflow for Claude
    Then ".dev-pomogator/tools/specs-generator/templates/JIRA_SOURCE.md.template" should exist
    And ".dev-pomogator/tools/specs-generator/templates/ATTACHMENTS.md.template" should exist
    And ".dev-pomogator/tools/specs-generator/templates/JIRA_CACHE.schema.json" should exist
