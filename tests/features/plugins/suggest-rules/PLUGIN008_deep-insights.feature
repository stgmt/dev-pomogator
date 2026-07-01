Feature: PLUGIN008 Deep Insights Aggregation Script
  As a developer
  I want aggregate-facets.sh to process facet data into cross-session analytics
  So that the deep-insights skill reports reliable insights

  # Drives the REAL .claude/skills/deep-insights/scripts/aggregate-facets.sh via tests/step_definitions/
  # feature_deep_insights.ts (spawn + temp HOME facet fixtures; asserts the script's real JSON output).
  # The original LF-line-endings / executable-bit cases were dropped as file-inspection anti-patterns.

  @feature3
  Scenario: PLUGIN008_03 a missing facets directory yields status missing
    Given a deep-insights facets directory that does not exist
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "missing"
    And the deep-insights facets_count is 0

  @feature4
  Scenario: PLUGIN008_04 an empty facets directory yields status missing
    Given a deep-insights facets directory that exists but is empty
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "missing"
    And the deep-insights facets_count is 0

  @feature5
  Scenario: PLUGIN008_05 valid work sessions aggregate into ok with the aggregate arrays
    Given a deep-insights facets directory with valid work sessions
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "ok"
    And the deep-insights output carries the aggregate arrays

  @feature6
  Scenario: PLUGIN008_06 a string friction_detail is handled gracefully
    Given a deep-insights facet with a string friction_detail
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "ok"

  @feature7
  Scenario: PLUGIN008_07 an object goal_categories is handled gracefully
    Given a deep-insights facet with an object goal_categories
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "ok"

  @feature8
  Scenario: PLUGIN008_08 a string claude_helpfulness is handled gracefully
    Given a deep-insights facet with a string claude_helpfulness
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights output is valid JSON with status "ok"

  @feature9
  Scenario: PLUGIN008_09 observer sessions with a text marker are excluded from the work count
    Given a deep-insights facets directory with work and observer sessions
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights work count is 1 and observer count is 1

  @feature10
  Scenario: PLUGIN008_10 an observer is detected by its goal_categories marker
    Given a deep-insights facet flagged observer by its goal_categories
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights work count is 1 and observer count is 1

  @feature11
  Scenario: PLUGIN008_11 a warmup_minimal session without observer markers stays a work session
    Given a deep-insights warmup_minimal facet with no observer markers
    When aggregate-facets.sh runs over that deep-insights home
    Then the deep-insights work count is 1 and observer count is 0
