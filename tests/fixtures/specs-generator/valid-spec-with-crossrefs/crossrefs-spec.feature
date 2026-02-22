Feature: XREF001_Data_Import_Export

  Background:
    Given the system is initialized
    And the database is empty

  # @feature1
  Scenario: Import valid CSV file
    Given a valid CSV file with 10 rows
    When user uploads the CSV file
    Then all 10 rows should be saved to database

  # @feature2
  Scenario: Export report to PDF
    Given report data exists in database
    When user requests PDF export
    Then PDF file should be generated
    And PDF should contain report data
