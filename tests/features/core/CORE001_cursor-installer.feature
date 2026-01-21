Feature: CORE001 Cursor Installer
  As a developer
  I want to install dev-pomogator for Cursor
  So that I get all extensions and hooks configured

  Background:
    Given Docker test environment is running
    And base Cursor fixture is prepared

  Scenario: Clean installation
    Given Cursor is installed with base configuration
    And dev-pomogator has not been installed before
    When I run "node dist/index.js --cursor"
    Then hooks.json should be created in ~/.cursor/hooks/
    And check-update.js should be copied to ~/.dev-pomogator/scripts/
    And selected extensions should be installed

  Scenario: Re-installation preserves state
    Given dev-pomogator was previously installed
    And claude-mem is already cloned
    When I run "node dist/index.js --cursor" again
    Then claude-mem should NOT be cloned again
    And logs should contain "Cursor hooks already configured"
    And existing hooks should remain valid

  Scenario: Hooks.json structure is correct
    When dev-pomogator installs for Cursor
    Then hooks.json should have version 1
    And hooks.json should contain beforeSubmitPrompt hooks
    And hooks.json should contain stop hooks
    And stop hooks should include check-update.js
