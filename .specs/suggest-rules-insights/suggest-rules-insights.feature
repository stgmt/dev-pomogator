Feature: PLUGIN001_suggest-rules-insights
  As a Claude Code user
  I want suggest-rules to use cross-session insights
  So that rule suggestions are enriched with 30-day usage patterns

  Background:
    Given dev-pomogator is installed
    And suggest-rules extension is enabled

  # @feature1
  Scenario: Fresh insights report enriches rule candidates
    Given the user has a fresh insights report at ~/.claude/usage-data/report.html
    And the report end_date is within 3 days
    When the user runs /suggest-rules
    Then Phase -0.5 reads the report
    And extracts friction categories as antipattern candidates
    And extracts CLAUDE.md suggestions as pattern candidates
    And displays unified mode "Full (память + сессия + insights)"

  # @feature2
  Scenario: Stale insights report used with warning
    Given the user has an insights report older than 3 days
    When the user runs /suggest-rules
    Then Phase -0.5 reads the report with stale marker
    And all insights candidates show "stale" annotation
    And displays "Insights: устарел"

  # @feature3
  Scenario: Missing insights report gracefully skipped
    Given no insights report exists at ~/.claude/usage-data/report.html
    When the user runs /suggest-rules
    Then Phase -0.5 displays "Insights: недоступен"
    And proceeds directly to Phase 0
    And no insights candidates are generated

  # @feature4
  Scenario: Insights candidates merge with session findings
    Given the user has a fresh insights report
    And a friction pattern matches a session finding
    When the user runs /suggest-rules
    Then the session finding is primary
    And insights data becomes supplementary evidence
    And the merged candidate shows source "turn #N + insights"

  # @feature5
  Scenario: Cursor platform skips insights phase
    Given the user runs suggest-rules in Cursor
    When Phase -0.5 would execute
    Then the entire phase is silently skipped
    And no insights-related output is shown
