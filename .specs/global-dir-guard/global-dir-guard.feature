# Source: new feature, patterns from tests/features/plugins/bg-task-guard/
Feature: GUARD001 Global Dir Guard

  Background:
    Given dev-pomogator is installed
    And a temporary HOME directory is used for isolation

  # @feature1
  Scenario: GUARD001_01 anomalous deletion triggers recovery
    Given ~/.dev-pomogator/scripts/tsx-runner.js existed previously
    And ~/.dev-pomogator/ has been deleted externally
    And no uninstall marker exists at ~/.dev-pomogator-uninstalled
    And project .claude/settings.json contains pomogator hooks
    When global-dir-guard runs
    Then ~/.dev-pomogator/scripts/tsx-runner.js should be restored
    And ~/.dev-pomogator/scripts/check-update.js should be restored
    And output should contain "[RECOVERY]"

  # @feature2
  Scenario: GUARD001_02 legitimate uninstall skips recovery
    Given ~/.dev-pomogator/ has been deleted
    And uninstall marker exists at ~/.dev-pomogator-uninstalled
    When global-dir-guard runs
    Then ~/.dev-pomogator/scripts/ should not exist
    And output should contain "[SKIP_UNINSTALLED]"

  # @feature1
  Scenario: GUARD001_03 first install skips recovery
    Given ~/.dev-pomogator/ does not exist
    And no uninstall marker exists
    And project .claude/settings.json does not contain pomogator hooks
    When global-dir-guard runs
    Then ~/.dev-pomogator/scripts/ should not exist
    And output should contain "[SKIP_FIRST_INSTALL]"

  # @feature1
  Scenario: GUARD001_04 healthy state is noop
    Given ~/.dev-pomogator/scripts/tsx-runner.js exists
    When global-dir-guard runs
    Then no recovery should be performed
    And exit code should be 0

  # @feature1
  Scenario: GUARD001_05 re-registers SessionStart hook
    Given ~/.dev-pomogator/scripts/ exists
    And ~/.claude/settings.json does not contain SessionStart check-update hook
    When global-dir-guard runs
    Then ~/.claude/settings.json should contain SessionStart check-update hook
    And output should contain "[HOOK_REREGISTERED]"

  # @feature2
  Scenario: GUARD001_06 uninstaller writes marker before deletion
    Given ~/.dev-pomogator/ exists with scripts
    When uninstall.ps1 is executed
    Then ~/.dev-pomogator-uninstalled should exist
    And marker should contain "uninstall.ps1" as source
    And ~/.dev-pomogator/ should not exist

  # @feature1
  Scenario: GUARD001_07 recovery restores launch-claude-tui.ps1 on Windows
    Given platform is Windows
    And ~/.dev-pomogator/ has been deleted externally
    And no uninstall marker exists
    And project .claude/settings.json contains pomogator hooks
    When global-dir-guard runs
    Then ~/.dev-pomogator/scripts/launch-claude-tui.ps1 should be restored

  # @feature3
  Scenario: GUARD001_08 recovery logs diagnostic info
    Given ~/.dev-pomogator/ has been deleted externally
    And no uninstall marker exists
    And project .claude/settings.json contains pomogator hooks
    When global-dir-guard runs
    Then output should contain "[RECOVERY]"
    And output should contain "tsx-runner.js"
    And output should contain "check-update.js"
