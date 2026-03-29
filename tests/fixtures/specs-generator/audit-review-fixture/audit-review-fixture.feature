Feature: AUDIT_REVIEW Fixture

  # @feature1
  Scenario: Import data
    Given data source exists
    When I import CSV
    Then data should be imported

  # @feature99
  Scenario: Orphan scenario without FR or AC
    Given some precondition
    When orphan action happens
    Then nothing is validated in FR/AC/TASKS
