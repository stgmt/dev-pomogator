Feature: PLUGIN006_Valid_Spec
  As a developer
  I want to validate specifications
  So that I can ensure they are complete

  Scenario: Validate complete spec
    Given a complete spec folder exists
    When I run validate-spec.ps1
    Then the result should be valid

  Scenario: Check spec status
    Given a complete spec folder exists
    When I run spec-status.ps1
    Then the phase should be "Finalization"
    And the progress should be 100%
