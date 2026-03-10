Feature: CORE005 Settings.json Atomic Write Protection
  As a developer
  I want settings.json to be written atomically with backup
  So that hooks are never lost due to crashes or corrupted files

  Background:
    Given dev-pomogator is installed
    And Claude Code platform is configured

  # @feature1
  Scenario: Atomic write creates backup before overwriting
    When installer writes hooks to .claude/settings.json
    Then .claude/settings.json.bak should be created
    And .claude/settings.json.bak should contain valid JSON
    And .claude/settings.json should contain all managed hooks

  # @feature2
  Scenario: Recovery from corrupted settings.json
    Given .claude/settings.json contains corrupted data
    And .claude/settings.json.bak contains valid hooks
    When installer reads settings.json
    Then settings should be recovered from .bak file
    And a warning should be logged

  # @feature3
  Scenario: Both primary and backup corrupted
    Given .claude/settings.json contains corrupted data
    And .claude/settings.json.bak does not exist
    When installer reads settings.json
    Then empty settings should be used as fallback
    And a warning should be logged

  # @feature4
  Scenario: User hooks preserved during re-install
    Given .claude/settings.json contains user-added hooks
    When installer re-installs extension hooks
    Then user-added hooks should still be present
    And managed hooks should be updated

  # @feature5
  Scenario: No .tmp files left after successful write
    When installer writes hooks to .claude/settings.json
    Then .claude/settings.json.tmp should not exist
    And .claude/settings.json should be valid JSON
