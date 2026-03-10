# Source: tests/features/plugins/tui-test-runner/tui-test-runner.feature
# Candidates: PLUGIN012_TUI_Test_Runner (v1 base)
Feature: PLUGIN013_TUI_Test_Runner_V2
  TUI test runner v2 adds AI analyst, clickable paths, discovery,
  state persistence, configurable patterns, keybinding launch, and screenshot export.

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # @feature1
  Scenario: PLUGIN013_01 Analysis tab shows matched pattern with hint
    Given a YAML v2 status file with 2 failed tests (1 timeout, 1 assertion)
    And built-in patterns.yaml contains "timeout" and "assertion_equal" patterns
    When TUI reads the status file
    Then Analysis tab should show 2 failure cards
    And timeout failure card should display pattern id "timeout"
    And timeout failure card should display hint text
    And assertion failure card should display pattern id "assertion_equal"

  # @feature1
  Scenario: PLUGIN013_02 Analysis tab shows code snippet for failure
    Given a YAML v2 status file with 1 failed test with stack trace pointing to "auth.test.ts" line 42
    And file "auth.test.ts" exists in project
    When TUI reads the status file
    Then Analysis tab failure card should contain code snippet
    And code snippet should show lines 39-45
    And line 42 should be marked with arrow indicator

  # @feature1
  Scenario: PLUGIN013_03 Analysis tab handles unknown errors gracefully
    Given a YAML v2 status file with 1 failed test with error "SomeRareException"
    And no pattern matches "SomeRareException"
    When TUI reads the status file
    Then Analysis tab should show failure card with category "Unknown"
    And failure card should display raw error message

  # @feature1
  Scenario: PLUGIN013_04 Analysis tab handles missing source file
    Given a YAML v2 status file with 1 failed test with stack trace pointing to "deleted.ts" line 10
    And file "deleted.ts" does not exist in project
    When TUI reads the status file
    Then Analysis tab failure card should show stack trace only
    And failure card should not contain code snippet

  # @feature2
  Scenario: PLUGIN013_05 Logs tab renders clickable file paths
    Given a log file contains line "Error at D:\project\src\auth.ts:42"
    When TUI reads the log file
    Then Logs tab should render "D:\project\src\auth.ts:42" as clickable widget

  # @feature2
  Scenario: PLUGIN013_06 Logs tab renders multiple paths in one line
    Given a log file contains line "Compare D:\a.ts:1 with D:\b.ts:2"
    When TUI reads the log file
    Then Logs tab should render 2 clickable path widgets in that line

  # @feature2
  Scenario: PLUGIN013_07 Clickable path handles missing file without crash
    Given a log file contains line "Error at /nonexistent/file.ts:1"
    When TUI reads the log file
    And user clicks on the clickable path
    Then TUI should not crash
    And no error dialog should appear

  # @feature3
  Scenario: PLUGIN013_08 Discovery shows test tree before run
    Given vitest framework is detected
    And vitest discovery returns 3 test files with 10 tests
    When TUI performs test discovery
    Then Tests tab should show tree with 3 suite nodes
    And each suite should contain its test items with checkboxes

  # @feature3
  Scenario: PLUGIN013_09 Discovery runs only selected tests
    Given vitest framework is detected
    And user selects 2 out of 10 discovered tests
    When user starts test run
    Then test command should include vitest --grep filter for selected tests

  # @feature3
  Scenario: PLUGIN013_10 Discovery timeout falls back to run all
    Given vitest framework is detected
    And discovery command takes longer than 30 seconds
    When TUI performs test discovery
    Then TUI should show warning "Discovery timeout"
    And Tests tab should show "Run all tests" option

  # @feature4
  Scenario: PLUGIN013_11 State saves active tab on switch
    Given TUI is running with default state
    When user switches to Logs tab
    And 0.5 seconds pass
    Then .tui-state file should contain last_tab "logs"

  # @feature4
  Scenario: PLUGIN013_12 State restores on startup
    Given .tui-state file exists with last_tab "analysis" and filter "auth"
    When TUI is launched
    Then Analysis tab should be active
    And filter input should contain "auth"

  # @feature4
  Scenario: PLUGIN013_13 Corrupted state file uses defaults
    Given .tui-state file exists with corrupted YAML content
    When TUI is launched
    Then Monitoring tab should be active by default
    And TUI should not show error

  # @feature5
  Scenario: PLUGIN013_14 User patterns override built-in
    Given built-in patterns.yaml contains pattern id "timeout" with hint "Built-in hint"
    And user .dev-pomogator/patterns.yaml contains pattern id "timeout" with hint "Custom hint"
    When PatternMatcher loads patterns
    Then pattern "timeout" should have hint "Custom hint"

  # @feature5
  Scenario: PLUGIN013_15 Invalid regex in user pattern is skipped
    Given user .dev-pomogator/patterns.yaml contains pattern with invalid regex "[invalid"
    When PatternMatcher loads patterns
    Then invalid pattern should be skipped
    And other patterns should load normally

  # @feature5
  Scenario: PLUGIN013_16 Pattern matching uses regex then keywords
    Given patterns.yaml contains pattern with regex "(timeout|timed out)"
    And patterns.yaml contains pattern with keywords ["database", "connection"]
    When PatternMatcher matches "TimeoutError: timed out after 30s"
    Then matched pattern should use regex match
    When PatternMatcher matches "database connection refused"
    Then matched pattern should use keyword match

  # @feature6
  Scenario: PLUGIN013_17 TUI auto-runs tests with --run flag
    Given TUI is launched with --run flag
    When TUI finishes initialization
    Then test execution should start automatically
    And Monitoring tab should show state "running"

  # @feature6
  Scenario: PLUGIN013_18 Single instance prevents duplicate TUI
    Given TUI is already running with PID lock file
    When launcher attempts to start second TUI instance
    Then launcher should not start second instance
    And launcher should exit with code 0

  # @feature7
  Scenario: PLUGIN013_19 Screenshot exports SVG file
    Given TUI is running with test results displayed
    When user triggers screenshot export
    Then SVG file should be saved to logs/screenshots/
    And SVG filename should contain timestamp
    And TUI should show notification "Screenshot saved"

  # @feature7
  Scenario: PLUGIN013_20 Screenshot creates directory if missing
    Given logs/screenshots/ directory does not exist
    When user triggers screenshot export
    Then logs/screenshots/ directory should be created
    And SVG file should be saved successfully
