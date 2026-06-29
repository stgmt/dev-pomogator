Feature: BDDSCAN non-BDD test scanner nudge

  Background:
    Given a temporary project directory

  @FR-1
  Scenario: BDDSCAN001 scan counts existing non-BDD tests without blocking
    Given the project contains 3 non-BDD test files and 1 feature file
    When the scanner runs at session start
    Then it reports a non-BDD test count of 3
    And it returns continue true without denying any tool call

  @FR-2
  Scenario: BDDSCAN002 scanner and deny-guard share one detector
    Given a file path that the deny-guard classifies as a non-BDD test
    When the scanner classifies the same path
    Then both obtain the verdict from the shared detector and agree it is a non-BDD test

  @FR-3
  Scenario: BDDSCAN003 notice names both resolution paths
    Given the project contains non-BDD test files
    When the notice is rendered
    Then the notice text names the bdd-migrator path
    And the notice text names the gh issue create path

  @FR-4
  Scenario: BDDSCAN004 a tracking issue silences the notice
    Given a GitHub issue is recorded as tracking the current non-BDD tests
    When the scanner runs with no new non-BDD tests since the issue was recorded
    Then the scanner emits no notice

  @FR-4
  Scenario: BDDSCAN005 a new non-BDD test re-fires the notice
    Given a GitHub issue tracks the previously detected non-BDD tests
    And a new non-BDD test file is added beyond the covered set
    When the scanner runs at session start
    Then it emits the notice with the updated count

  @FR-5
  Scenario: BDDSCAN006 the scanner is registered for all plugin users
    Given the plugin hooks manifest and the project settings
    When the SessionStart hook entries are listed
    Then the scanner hook entry is present in the plugin manifest
    And the scanner hook entry is present in the project settings for dogfooding

  @FR-6
  Scenario: BDDSCAN007 doctor flags a missing hook or dependency
    Given the scanner hook entry is absent or the gh dependency is missing
    When pomogator-doctor runs
    Then the scanner check reports a problem with a fix hint
