Feature: PLUGIN008 Deep Insights Aggregation Script
  As a developer
  I want aggregate-facets.sh to process insights data
  So that deep-insights skill produces cross-session analytics

  Background:
    Given dev-pomogator is installed
    And jq is available

  # @feature1
  Scenario: Script has LF line endings (no CRLF)
    When I check line endings of aggregate-facets.sh
    Then the file should not contain CRLF

  # @feature2
  Scenario: Script is executable
    When I check file permissions of aggregate-facets.sh
    Then the file should be executable

  # @feature3
  Scenario: Missing facets directory returns missing status
    Given facets directory does not exist
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "missing"

  # @feature4
  Scenario: Empty facets directory returns missing status
    Given facets directory exists but is empty
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "missing"

  # @feature5
  Scenario: Aggregation with valid facets data
    Given facets directory contains sample facets files
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "ok"
    And JSON should contain facets_count > 0
    And JSON should contain outcomes array
    And JSON should contain friction_summary array
    And JSON should contain helpfulness array
    And JSON should contain success_rate number

  # @feature6
  Scenario: Handles string friction_detail gracefully
    Given facets directory contains a file with string friction_detail
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "ok"

  # @feature7
  Scenario: Handles object goal_categories gracefully
    Given facets directory contains a file with object goal_categories
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "ok"

  # @feature8
  Scenario: Handles string claude_helpfulness gracefully
    Given facets directory contains a file with string claude_helpfulness
    When I run aggregate-facets.sh
    Then output should be valid JSON
    And JSON status should be "ok"
