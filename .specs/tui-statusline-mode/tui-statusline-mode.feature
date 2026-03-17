# Source: tests/features/plugins/test-statusline/PLUGIN011_test-statusline.feature
# Domain: PLUGIN011 (extending existing test-statusline feature)

Feature: PLUGIN011_tui-statusline-mode
  TUI test runner compact mode displays test progress in 3 lines,
  supports toggle between full/compact, stop tests, and auto-compact.

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # @feature1
  Scenario: PLUGIN011_60 CompactBar renders running state with progress
    Given TUI is running in compact mode
    And a YAML status file exists with state "running" and percent 76
    And the status file has passed 38, failed 2, skipped 0, total 50
    When CompactBar renders
    Then output should contain "76%"
    And output should contain "38✅"
    And output should contain "2❌"

  # @feature1
  Scenario: PLUGIN011_61 CompactBar shows idle indicator when no tests
    Given TUI is running in compact mode
    And no YAML status file exists
    When CompactBar renders
    Then output should contain "no test runs"

  # @feature1
  Scenario: PLUGIN011_62 CompactBar handles corrupted YAML
    Given TUI is running in compact mode
    And YAML status file contains invalid content
    When CompactBar renders
    Then output should contain "waiting for tests"
    And TUI should not crash

  # @feature2
  Scenario: PLUGIN011_63 Toggle from full to compact mode
    Given TUI is running in full mode
    When user presses M key
    Then TabbedContent should be hidden
    And CompactBar should be visible

  # @feature2
  Scenario: PLUGIN011_64 Toggle from compact to full mode
    Given TUI is running in compact mode
    When user presses M key
    Then TabbedContent should be visible
    And CompactBar should be hidden

  # @feature2
  Scenario: PLUGIN011_64b Toggle restores previously active tab
    Given TUI is running in full mode on Analysis tab
    When user presses M key to switch to compact
    And user presses M key again to return to full
    Then Analysis tab should be the active tab

  # @feature3
  Scenario: PLUGIN011_65 Stop tests sends signal to running process
    Given TUI is running
    And YAML status file contains pid of a running process
    When user presses X key
    Then process should receive termination signal
    And status should update to "stopped"

  # @feature3
  Scenario: PLUGIN011_66 Stop button disabled when no PID
    Given TUI is running
    And YAML status file does not contain pid field
    Then Stop action should be disabled

  # @feature4
  Scenario: PLUGIN011_67 Auto-compact when terminal height drops below threshold
    Given TUI is running in full mode
    When terminal height drops below 15 rows
    Then TUI should switch to compact mode automatically

  # @feature5
  Scenario: PLUGIN011_68 Statusline render files removed after update
    Given dev-pomogator is installed with test-statusline extension
    Then statusline_render.cjs should not exist in .dev-pomogator/tools/test-statusline/
    And statusline_wrapper.js should not exist in .dev-pomogator/tools/test-statusline/
    And statusline_session_start.ts should exist in .dev-pomogator/tools/test-statusline/
