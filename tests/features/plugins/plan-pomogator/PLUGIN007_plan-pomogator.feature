Feature: PLUGIN007 Plan-pomogator Extension
  As a developer using Cursor or Claude Code
  I want plan-pomogator rules and tools
  So that I can generate and validate plans consistently

  Background:
    Given dev-pomogator is installed
    And plan-pomogator extension is enabled

  Scenario: Rules are installed for Cursor
    When dev-pomogator installs plan-pomogator for Cursor
    Then plan-pomogator.mdc should exist in PROJECT/.cursor/rules/

  Scenario: Rules are installed for Claude
    When dev-pomogator installs plan-pomogator for Claude
    Then plan-pomogator.md should exist in PROJECT/.claude/rules/

  Scenario: Tools are installed
    When dev-pomogator installs plan-pomogator
    Then plan-pomogator folder should exist in PROJECT/.dev-pomogator/tools/
    And requirements.md should exist
    And template.md should exist
    And validate-plan.ts should exist
