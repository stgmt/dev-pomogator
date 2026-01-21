Feature: PLUGIN001 Suggest Rules Extension
  As a developer using Cursor
  I want /suggest-rules command
  So that AI can analyze my session and suggest .cursorrules

  Background:
    Given dev-pomogator is installed for Cursor
    And suggest-rules extension is enabled

  Scenario: Command file is installed
    When dev-pomogator installs suggest-rules
    Then suggest-rules.md should exist in PROJECT/.cursor/commands/
    And file content should not be empty

  Scenario: Command is project-local not global
    Given I am in a project directory
    When suggest-rules is installed
    Then command should be in PROJECT/.cursor/commands/
    And command should NOT be in ~/.cursor/commands/

  Scenario: Command content is valid
    When suggest-rules.md is installed
    Then file should contain valid Cursor command format
    And file should describe rules suggestion functionality
