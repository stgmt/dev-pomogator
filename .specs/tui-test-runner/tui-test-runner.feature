# Source: analyze-features report (PLUGIN012 domain)
# Candidates: .specs/test-statusline/test-statusline.feature (related domain)
Feature: PLUGIN012_TUI_Test_Runner
  As a developer
  I want a rich 4-tab TUI for monitoring test execution
  So that I can quickly identify failures without switching terminals

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # needs a live Textual TUI mount (no headless hook) — manual, not in the BDD gate
  @feature1 @manual
  Scenario: TUI displays 4 tabs on startup
    Given a valid YAML v2 status file exists with state "running"
    When TUI is launched with --status-file pointing to the YAML
    Then TUI should display 4 tabs: Tests, Logs, Monitoring, Analysis
    And Monitoring tab should be active by default
    And hook should exit with code 0

  # needs Textual Pilot keypress on a live TUI — manual, not in the BDD gate
  @feature1 @manual
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

  # suite tree + status icons render in the live Textual Tests tab — manual, not in the BDD gate
  @feature2 @manual
  Scenario: Test tree displays suite hierarchy from YAML v2
    Given a YAML v2 status file with suites and tests
    When TUI reads the status file
    Then Tests tab should display a tree with suite nodes
    And each suite should contain its test items
    And each test should show status icon

  @feature2
  Scenario: Failed tests sorted to top
    Given a TUI YAML v2 status file with 2 passed and 2 failed tests
    When the TUI analyst reads the YAML v2 status file for sorting
    Then the first failure cards should be the matched-pattern failures

  # syntax highlighting renders in the live Textual Logs tab — manual, not in the BDD gate
  @feature3 @manual
  Scenario: Log viewer shows real-time output with highlighting
    Given a log file exists with stack traces and BDD keywords
    When TUI reads the log file
    Then Logs tab should display log lines
    And stack trace lines should be highlighted
    And BDD keywords Given/When/Then should be highlighted

  @feature4
  Scenario: Monitoring shows progress from canonical YAML v2
    Given a TUI YAML v2 status file with state "running" and percent 50
    When the statusline render reads the TUI status file for progress
    Then the compact status line should show the running state
    And the compact status line should show the percent and duration

  # phase rows render in the live Textual Monitoring tab (no headless phase renderer) — manual, not in the BDD gate
  @feature4 @manual
  Scenario: Monitoring shows phases from YAML v2
    Given a YAML v2 status file with phases setup=completed and tests=running
    When TUI reads the status file
    Then Monitoring tab should show phase "setup" as completed
    And Monitoring tab should show phase "tests" as running

  @feature5
  Scenario: Analysis matches failures to error patterns
    Given a TUI YAML v2 status file with assertion and timeout failures
    When the TUI analyst reads the YAML v2 status file for patterns
    Then the analyst should match an assertion failure pattern
    And the analyst should match a timeout failure pattern with the project hint

  @feature5
  Scenario: Analysis reports no failure cards when all pass
    Given a TUI YAML v2 status file with state "passed" and 0 failures
    When the TUI analyst reads the all-pass YAML v2 status file
    Then the analyst should report zero failure cards

  @feature6
  Scenario: Statusline reads top-level summary from canonical YAML v2
    Given a canonical YAML v2 status file with a top-level summary
    When the statusline render reads the canonical YAML v2 status file
    Then the compact status line should display the top-level state and counters
    And the compact status line should ignore nested suite totals

  @feature6
  Scenario: Vitest adapter parses stdout into TestEvents
    Given a vitest stdout sample with passed, failed, and skipped tests
    When the vitest adapter processes each line of the sample
    Then the adapter should emit test_pass, test_fail and test_skip events
    And the adapter should emit a summary event

  @feature6
  Scenario: YAML v2 writer generates valid schema
    Given a stream of TestEvents from vitest adapter
    When the YAML v2 writer processes a stream of vitest TestEvents
    Then the written YAML should contain version 2 and a suites array with tests
    And the written YAML should contain the canonical flat summary fields

  # empty-state ("No suite details available yet") renders in the live Textual Tests tab — manual, not in the BDD gate
  @feature6 @manual
  Scenario: TUI gracefully handles canonical YAML without suite details yet
    Given a YAML v2 status file without suites or phases
    When TUI reads the status file
    Then Monitoring tab should show aggregate counters
    And Tests tab should show "No suite details available yet"

  @feature7
  Scenario: SessionStart hook initializes status directory
    Given a Claude Code session starts in a TUI project directory
    When the tui_session_start hook receives JSON stdin
    Then the hook should create the .dev-pomogator/.test-status/ directory
    And the hook should write the TEST_STATUSLINE env contract
    And the tui_session_start hook should exit with code 0

  @feature7
  Scenario: SessionStart hook handles empty stdin
    Given a Claude Code session starts in a TUI project directory
    When the tui_session_start hook receives empty stdin
    Then the tui_session_start hook should exit with code 0

  @feature9
  Scenario: Launcher detects Python availability
    Given Python 3.9+ is available on the host
    When the TUI launcher checks Python availability
    Then the launcher should report Python as available

  @feature9
  Scenario: Launcher reports Python unavailable when none on PATH
    Given no Python interpreter is available to the TUI launcher
    When the TUI launcher checks Python availability with no interpreter on PATH
    Then the launcher should report Python as unavailable

  @feature3
  Scenario: LogReader reads appended log lines
    Given a log file with two appended lines
    When the TUI LogReader reads the log file
    Then the LogReader should return the appended lines in order

  @feature6
  Scenario: Strict v2 model rejects legacy payloads
    Given a legacy v1 status payload
    When the strict v2 model parses the legacy status payload
    Then the strict v2 model should reject the legacy payload

  @feature6
  Scenario: Wrapper writes canonical v2 status and populates the log file
    Given a child test command that prints one pass and one fail
    When the test runner wrapper runs the child command
    Then the wrapper should exit non-zero for the failed child
    And the wrapper should write a canonical v2 status with one pass and one fail
    And the wrapper should populate the advertised log file

  @feature10
  Scenario: Jest, pytest, dotnet, cargo and go adapters emit runtime events
    Given dev-pomogator is installed
    When each framework adapter processes its sample output
    Then each adapter should emit summary or test events for its framework

  @feature10
  Scenario: Dotnet adapter parses verbose output with leading-whitespace summary
    Given dev-pomogator is installed
    When the dotnet adapter processes the verbose output sample
    Then the dotnet adapter should report 3 passed, 1 failed, 1 skipped

  @feature10
  Scenario: Dotnet adapter parses minimal single-line summary
    Given dev-pomogator is installed
    When the dotnet adapter processes the minimal single-line summary
    Then the dotnet adapter should report a 4-total summary

  @feature11
  Scenario: YAML writer write is a no-op after finalize
    Given dev-pomogator is installed
    When the YAML writer is finalized then written again
    Then the finalized YAML duration and state should be frozen

  @feature12
  Scenario: YAML writer uses discovery total for running progress
    Given dev-pomogator is installed
    When the YAML writer is given a discovery total of 100 and one pass while running
    Then the running YAML total should be 100 and percent 1

  @feature12
  Scenario: YAML writer uses total zero while running without discovery
    Given dev-pomogator is installed
    When the YAML writer is given one pass while running without a discovery total
    Then the running YAML total should be 0 and percent 0

  @feature13
  Scenario: Dispatch builds the canonical wrapper command
    Given dev-pomogator is installed
    When the dispatch builds a pytest command with filter and docker
    Then the dispatched command should carry the framework arg and the pytest invocation

  @feature14
  Scenario: Wrapper spawns npx child commands cross-platform
    Given dev-pomogator is installed
    When the test runner wrapper runs an npx version child
    Then the wrapper should exit zero and print a semver version

  @feature14
  Scenario: Passthrough spawns npx child commands cross-platform
    Given dev-pomogator is installed
    When the test runner wrapper passes through an npx version child
    Then the wrapper should exit zero and print a semver version

  @feature5
  Scenario: Analysis extracts crash location and code snippet
    Given a TUI YAML v2 status file with a failure that has a stack trace
    When the TUI analyst reads the YAML v2 status file with source context
    Then the analyst should report the crash file, line and method
    And the analyst should report a code snippet around the crash line

  @feature5
  Scenario: Analysis handles an unknown error gracefully
    Given a TUI YAML v2 status file with an unrecognized error
    When the TUI analyst reads the unknown-error YAML v2 status file
    Then the analyst should leave the pattern unmatched but keep the error text

  @feature5
  Scenario: Analysis handles a missing source file
    Given a TUI YAML v2 status file whose stack points at a missing source
    When the TUI analyst reads the missing-source YAML v2 status file
    Then the analyst should report no code snippet but keep the raw stack

  @feature5
  Scenario: Invalid user pattern regex is skipped
    Given a user patterns file containing an invalid regex
    When the pattern matcher loads the invalid user patterns
    Then the invalid pattern should be skipped and the safe pattern kept

  @feature5
  Scenario: Pattern matching uses regex then keywords
    Given TUI YAML v2 status files for keyword-only and regex-with-keyword failures
    When the TUI analyst reads both pattern-precedence status files
    Then the keyword-only failure should match by keywords and the regex failure by regex+keywords

  @feature9
  Scenario: Python package entrypoint is launchable via python -m tui
    Given dev-pomogator is installed
    When the TUI package is invoked via python -m tui --help
    Then the TUI help output should advertise the --status-file option

  @feature9
  Scenario: Store alias guard flags when the only resolved path is the WindowsApps stub
    Given the resolved python paths are only WindowsApps stubs
    Then the Store alias guard should flag all paths as alias-only

  @feature9
  Scenario: Store alias guard flags when every resolved path is a WindowsApps stub
    Given the resolved python paths are multiple WindowsApps stubs
    Then the Store alias guard should flag all paths as alias-only

  @feature9
  Scenario: Store alias guard does not flag when a real interpreter resolves before the stub
    Given the resolved python paths include a real interpreter before the WindowsApps stub
    Then the Store alias guard should not flag the paths as alias-only

  @feature9
  Scenario: Store alias guard does not flag a forward-slash real interpreter path
    Given the resolved python paths are a single forward-slash real interpreter
    Then the Store alias guard should not flag the paths as alias-only

  @feature9
  Scenario: Store alias guard treats empty or whitespace-only resolution as not-alias
    Given the resolved python paths are empty or whitespace-only
    Then the Store alias guard should not flag the paths as alias-only
