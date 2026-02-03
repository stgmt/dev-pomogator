Feature: CORE003 Claude Code Installer
  As a developer
  I want to install dev-pomogator for Claude Code
  So that I get all extensions and hooks configured

  Background:
    Given Docker test environment is running
    And base Claude Code fixture is prepared

  Scenario: Clean installation
    Given Claude Code is installed with base configuration
    And dev-pomogator has not been installed before
    When I run "node dist/index.js --claude"
    Then settings.json should contain Stop hooks in ~/.claude/
    And check-update.js should be copied to ~/.dev-pomogator/scripts/
    And selected extensions should be installed to project

  Scenario: Commands are installed to project
    When dev-pomogator installs for Claude Code
    Then .claude/commands/ should exist in project
    And suggest-rules.md should be in .claude/commands/
    And create-spec.md should be in .claude/commands/

  Scenario: Rules are installed to project
    When dev-pomogator installs for Claude Code
    Then .claude/rules/ should exist in project
    And specs-management.md should be in .claude/rules/
    And plan-pomogator.md should be in .claude/rules/
    And research-workflow.md should be in .claude/rules/

  Scenario: Tools are installed to project
    When dev-pomogator installs for Claude Code
    Then tools/specs-generator/ should exist in project
    And tools/forbid-root-artifacts/ should exist in project
    And tools/forbid-root-artifacts/check.py should be executable

  Scenario: Settings.json hooks structure is correct
    When dev-pomogator installs for Claude Code
    Then ~/.claude/settings.json should exist
    And settings.json should contain hooks.Stop array
    And Stop hooks should include check-update.js with --claude flag

  Scenario: Re-installation preserves existing hooks
    Given dev-pomogator was previously installed for Claude Code
    And settings.json contains existing Stop hooks
    When I run "node dist/index.js --claude" again
    Then existing Stop hooks should remain
    And check-update.js hook should not be duplicated

  Scenario: Config tracks Claude Code installations
    When dev-pomogator installs for Claude Code
    Then ~/.dev-pomogator/config.json should exist
    And installedExtensions should contain entries with platform "claude"
    And projectPaths should include current project path
