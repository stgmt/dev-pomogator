# Source: analyze-features report (PLUGIN012 domain)
# Candidates: .specs/tui-statusline/tui-statusline.feature (related domain)
Feature: PLUGIN012_TUI_Test_Runner
  As a developer
  I want a rich 4-tab TUI for monitoring test execution
  So that I can quickly identify failures without switching terminals

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # @feature1
  Scenario: TUI displays 4 tabs on startup
    Given a valid YAML v2 status file exists with state "running"
    When TUI is launched with --status-file pointing to the YAML
    Then TUI should display 4 tabs: Tests, Logs, Monitoring, Analysis
    And Monitoring tab should be active by default
    And hook should exit with code 0

  # @feature1
  Scenario: Tab switching via keyboard
    Given TUI is running with a valid YAML status file
    When user presses key "1"
    Then Tests tab should become active
    When user presses key "2"
    Then Logs tab should become active
    When user presses key "3"
    Then Monitoring tab should become active
    When user presses key "4"
    Then Analysis tab should become active

  # @feature2
  Scenario: Test tree displays suite hierarchy from YAML v2
    Given a YAML v2 status file with suites and tests
    When TUI reads the status file
    Then Tests tab should display a tree with suite nodes
    And each suite should contain its test items
    And each test should show status icon

  # @feature2
  Scenario: Failed tests sorted to top
    Given a YAML v2 status file with 2 passed and 2 failed tests
    When TUI reads the status file
    Then the first items in Tests tab should be the failed tests

  # @feature3
  Scenario: Log viewer shows real-time output with highlighting
    Given a log file exists with stack traces and BDD keywords
    When TUI reads the log file
    Then Logs tab should display log lines
    And stack trace lines should be highlighted
    And BDD keywords Given/When/Then should be highlighted

  # @feature4
  Scenario: Monitoring shows progress from canonical YAML v2
    Given a YAML v2 status file with state "running" and percent 50
    When TUI reads the status file
    Then Monitoring tab should show state "running"
    And Monitoring tab should show percent 50
    And Monitoring tab should show duration

  # @feature4
  Scenario: Monitoring shows phases from YAML v2
    Given a YAML v2 status file with phases setup=completed and tests=running
    When TUI reads the status file
    Then Monitoring tab should show phase "setup" as completed
    And Monitoring tab should show phase "tests" as running

  # @feature5
  Scenario: Analysis groups failures by error pattern
    Given a YAML v2 status file with 3 failed tests (2 assertion, 1 timeout)
    When TUI reads the status file
    Then Analysis tab should show 2 error groups
    And assertion group should contain 2 tests
    And timeout group should contain 1 test

  # @feature5
  Scenario: Analysis shows no-failures message when all pass
    Given a YAML v2 status file with state "passed" and 0 failures
    When TUI reads the status file
    Then Analysis tab should display "No failures to analyze"

  # @feature6
  Scenario: Statusline reads top-level summary from canonical YAML v2
    Given an enhanced wrapper writes a canonical YAML v2 file
    When statusline_render.sh reads the same file
    Then statusline_render.sh should display the top-level state and counters
    And statusline_render.sh should ignore nested suite totals

  # @feature6
  Scenario: Vitest adapter parses stdout into TestEvents
    Given a vitest stdout sample with passed, failed, and skipped tests
    When vitest_adapter processes each line
    Then adapter should emit test_pass events for passed tests
    And adapter should emit test_fail events for failed tests with error messages
    And adapter should emit test_skip events for skipped tests

  # @feature6
  Scenario: YAML v2 writer generates valid schema
    Given a stream of TestEvents from vitest adapter
    When yaml_writer processes the events
    Then output YAML should contain version 2
    And output YAML should contain suites array with tests
    And output YAML should contain canonical flat summary fields

  # @feature6
  Scenario: TUI gracefully handles canonical YAML with empty suites
    Given a YAML v2 status file without suites or phases
    When TUI reads the status file
    Then Monitoring tab should show aggregate counters
    And Tests tab should show "No suite details available yet"

  # @feature7
  Scenario: SessionStart hook initializes status directory
    Given a Claude Code session starts in a project directory
    When tui_session_start hook receives JSON stdin
    Then hook should create .dev-pomogator/.test-status/ directory
    And hook should exit with code 0

  # @feature7
  Scenario: SessionStart hook handles empty stdin
    Given a Claude Code session starts
    When tui_session_start hook receives empty stdin
    Then hook should exit with code 0

  # @feature10
  Scenario: Dotnet adapter parses verbose multi-line summary with leading whitespace
    Given a dotnet test verbose output with leading whitespace in summary lines
    When dotnet_adapter processes each line
    Then adapter should emit test_pass events for passed tests
    And adapter should emit test_fail events for failed tests
    And adapter should emit summary event with correct total, passed, failed, skipped counts

  # @feature10
  Scenario: Dotnet adapter parses minimal single-line summary
    Given a dotnet test minimal output with single-line summary format
    When dotnet_adapter processes each line
    Then adapter should emit summary event with correct total, passed, failed, skipped counts

  # @feature11
  Scenario: YamlWriter freezes duration after finalize
    Given a YamlWriter instance with test events processed
    When finalize is called with exit code 0
    And write is called again after finalize
    Then YAML duration_ms should remain unchanged from finalize time
    And YAML state should remain "passed"

  # @feature12
  Scenario: Discovery total provides real progress during running
    Given a YamlWriter with discoveryTotal set to 100
    And 1 test has passed during running
    When YAML status is read
    Then total should be 100 and percent should be 1

  # @feature12
  Scenario: No discovery total shows zero total during running
    Given a YamlWriter without discoveryTotal
    And 1 test has passed during running
    When YAML status is read
    Then total should be 0 and percent should be 0

  # @feature10
  Scenario: Regression — all adapters emit correct events after dotnet regex fix
    Given inline test output for jest, pytest, dotnet, cargo, and go adapters
    When each adapter processes its respective output
    Then each adapter should emit the expected number of test_pass and test_fail events

  # @feature9
  Scenario: Launcher detects Python availability
    Given Python 3.9+ is installed
    When launcher checks Python availability
    Then launcher should report Python as available

  # @feature9
  Scenario: Launcher fails gracefully without Python
    Given Python is not installed
    When launcher checks Python availability
    Then launcher should report error message to stderr
    And launcher should exit with code 0

  # @feature13
  Scenario: Dispatch builds correct wrapper command with framework argument
    Given a test dispatch configuration with framework "pytest" and filter "auth"
    When buildTestCommand is called with docker=true
    Then command should contain "--framework pytest --"
    And command should contain test_runner_wrapper
    And command should contain 'python -m pytest -k "auth"'
