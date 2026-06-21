Feature: strength-fixture

  @feature1
  Scenario: FR-1 happy path
    Given a configured widget
    When the user saves
    Then the record persists

  @feature1
  Scenario: FR-1 rejects empty input
    Given an empty form
    When the user saves
    Then an error is shown
