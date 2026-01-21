Feature: CORE002 Auto Update
  As a developer using dev-pomogator
  I want automatic update checks
  So that I always have the latest version

  Background:
    Given dev-pomogator is installed for Cursor
    And check-update.js exists in ~/.dev-pomogator/scripts/

  Scenario: Update script is installed
    When dev-pomogator installs for Cursor
    Then check-update.js should exist in ~/.dev-pomogator/scripts/
    And check-update.js should contain "checkAndUpdate" function

  Scenario: Update hook is registered
    When dev-pomogator installs for Cursor
    Then hooks.json stop array should contain check-update.js command

  Scenario: Cooldown prevents frequent checks
    Given last update check was 2 hours ago
    And cooldown is set to 24 hours
    When check-update.js runs
    Then update check should be skipped
    And config.json lastCheck should not be updated

  Scenario: Update check runs after cooldown expires
    Given last update check was 25 hours ago
    And cooldown is set to 24 hours
    When check-update.js runs
    Then GitHub manifest should be checked for new version
    And config.json lastCheck should be updated

  Scenario: Extension files are updated when new version available
    Given suggest-rules extension version "0.0.1" is installed
    And GitHub manifest has version "1.2.0"
    And cooldown has expired
    When check-update.js runs
    Then suggest-rules.md should be updated from GitHub
    And config.installedExtensions version should be "1.2.0"
