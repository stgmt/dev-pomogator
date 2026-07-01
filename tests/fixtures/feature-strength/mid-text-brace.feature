Feature: x

  @FR-1
  Scenario: real
    Given a config {"k":"v"}
    When applied
    Then it loads
