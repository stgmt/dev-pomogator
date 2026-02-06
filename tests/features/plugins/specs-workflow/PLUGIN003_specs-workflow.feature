Feature: PLUGIN003 Specs Workflow Extension
  As a developer using Cursor or Claude Code
  I want /create-spec command and specs management tools
  So that I can manage specifications with 3-phase workflow

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  Scenario: Command file is installed for Cursor
    When dev-pomogator installs specs-workflow for Cursor
    Then create-spec.md should exist in PROJECT/.cursor/commands/
    And file content should not be empty

  Scenario: Rules are installed for Cursor
    When dev-pomogator installs specs-workflow for Cursor
    Then specs-management.mdc should exist in PROJECT/.cursor/rules/
    And no-mocks-fallbacks.mdc should exist in PROJECT/.cursor/rules/
    And research-workflow.mdc should exist in PROJECT/.cursor/rules/

  Scenario: Tools are installed
    When dev-pomogator installs specs-workflow
    Then specs-generator folder should exist in PROJECT/tools/
    And scaffold-spec.ps1 should exist
    And validate-spec.ps1 should exist
    And templates folder should contain 14 template files

  Scenario: Claude Code plugin is registered
    Given marketplace.json exists in .claude-plugin/
    Then specs-workflow should be listed in plugins array
    And plugin source should point to ./extensions/specs-workflow
