Feature: CORE019_Extension_Beta_Flag

  Background:
    Given dev-pomogator source is available
    And extensions directory contains at least one extension with stability "beta"

  # @feature1
  Scenario: CORE019_01 extension with stability beta is parsed correctly
    Given extension.json contains "stability": "beta"
    When listExtensions() is called
    Then extension SHALL have stability "beta"

  # @feature1
  Scenario: CORE019_02 extension without stability field defaults to stable
    Given extension.json does NOT contain stability field
    When listExtensions() is called
    Then extension SHALL have stability undefined (treated as stable)

  # @feature2
  Scenario: CORE019_03 beta label shown in interactive checkbox
    Given installer runs in interactive mode
    When extension list is displayed
    Then beta extension name SHALL contain "(BETA)"
    And stable extension name SHALL NOT contain "(BETA)"

  # @feature2
  Scenario: CORE019_04 beta unchecked by default in interactive mode
    Given installer runs in interactive mode
    When extension list is displayed
    Then beta extension SHALL be unchecked by default
    And stable extension SHALL be checked by default

  # @feature3
  Scenario: CORE019_05 --all excludes beta extensions
    When installer runs with "--claude --all"
    Then beta extension SHALL NOT be installed
    And stable extensions SHALL be installed

  # @feature4
  Scenario: CORE019_06 --all --include-beta installs everything
    When installer runs with "--claude --all --include-beta"
    Then beta extension SHALL be installed
    And stable extensions SHALL be installed

  # @feature3
  Scenario: CORE019_07 updater does not add new beta extensions
    Given only stable extensions are installed
    And a new beta extension is available in source
    When updater runs
    Then new beta extension SHALL NOT be installed

  # @feature1
  Scenario: CORE019_08 isBeta helper works correctly
    Given extension with stability "beta"
    Then isBeta() SHALL return true
    Given extension without stability field
    Then isBeta() SHALL return false
