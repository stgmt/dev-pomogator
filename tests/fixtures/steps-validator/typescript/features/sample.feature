Feature: Sample TypeScript Feature
  Sample feature for testing the steps validator

  Scenario: Good scenario with assertions
    Given a valid setup
    When an action is performed
    Then the result is "action done"
    And the result is not null

  Scenario: Bad scenario without assertions
    Given a bad setup
    When bad action happens
    Then the result is verified
    And the operation completes
