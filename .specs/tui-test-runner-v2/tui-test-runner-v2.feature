# Source: tests/features/plugins/tui-test-runner/tui-test-runner.feature
# Candidates: PLUGIN012_TUI_Test_Runner (v1 base)
Feature: PLUGIN013_TUI_Test_Runner_V2
  TUI test runner v2 adds AI analyst, clickable paths, discovery,
  state persistence, configurable patterns, keybinding launch, and screenshot export.

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  @feature1
  Scenario: PLUGIN013_01 analyze_status matches timeout failure card using project-override pattern hint
    Given the YAML v2 status fixture "yaml-v2-failed.yaml" with 3 failed tests
    And the project fixture provides user patterns with "timeout" pattern hint "Custom timeout hint from project override"
    When analyze_status is called against the status file with project fixture root
    Then the result should contain a failure card with patternId "timeout"
    And the timeout failure card hint should be "Custom timeout hint from project override"

  @feature1
  Scenario: PLUGIN013_02 analyze_status extracts crash location and code snippet from auth.steps.ts failure
    Given a YAML v2 status fixture "yaml-v2-full.yaml" for code snippet test
    When analyze_status is called against the fixture without user patterns
    Then the first failure card should have patternId "assertion_equal"
    And the failure card crash location should be file "tests/auth.steps.ts" line 42 method "Object.<anonymous>"
    And the code snippet should contain "39│"
    And the code snippet should contain "→ 42│"
    And the code snippet should contain "45│"

  @feature1
  Scenario: PLUGIN013_03 analyze_status returns null patternId and raw error for unmatched SomeRareException
    Given a YAML v2 status fixture "yaml-v2-unknown.yaml" for code snippet test
    When analyze_status is called against the fixture without user patterns
    Then the failure card patternId should be null
    And the failure card errorMessage should be "impossible condition triggered"
    And the failure card errorType should be "SomeRareException"

  @feature1
  Scenario: PLUGIN013_04 analyze_status returns null codeSnippet and rawStack for missing source file
    Given a YAML v2 status fixture "yaml-v2-missing-source.yaml" for code snippet test
    When analyze_status is called against the fixture without user patterns
    Then the failure card codeSnippet should be null
    And the failure card rawStack should contain "tests/deleted.ts:10:3"
    And the failure card crash file should be "tests/deleted.ts"

  @feature2
  Scenario: PLUGIN013_05 clickable_path module implements parse_paths with Windows and Unix path detection
    Given the clickable_path module source file exists at "tools/tui-test-runner/tui/widgets/clickable_path.py"
    Then the source file should contain function "parse_paths"
    And the source file should contain Windows path regex support

  @feature2
  Scenario: PLUGIN013_06 clickable_path parse_paths returns a list of segments for multi-path lines
    Given the clickable_path module source file exists at "tools/tui-test-runner/tui/widgets/clickable_path.py"
    Then the source file should contain function "parse_paths"
    And the source file should return a list type for multi-segment support

  @feature2
  Scenario: PLUGIN013_07 clickable_path module wraps file-open in try/except for silent failure
    Given the clickable_path module source file exists at "tools/tui-test-runner/tui/widgets/clickable_path.py"
    Then the source file should contain exception handling for file open operations

  @feature3
  Scenario: PLUGIN013_08 discovery module implements detect_framework supporting vitest, jest, and pytest
    Given the discovery module source file exists at "tools/tui-test-runner/tui/discovery.py"
    Then the source file should contain function "detect_framework"
    And the source file should contain framework support for "vitest"
    And the source file should contain framework support for "jest"
    And the source file should contain framework support for "pytest"

  @feature3
  Scenario: PLUGIN013_09 discovery module defines discover_tests returning DiscoveryResult with test names
    Given the discovery module source file exists at "tools/tui-test-runner/tui/discovery.py"
    Then the source file should contain function "def discover_tests"
    And the source file should contain class "DiscoveryResult"

  @feature3
  Scenario: PLUGIN013_10 discovery module handles subprocess timeout via DISCOVERY_TIMEOUT and timed_out flag
    Given the discovery module source file exists at "tools/tui-test-runner/tui/discovery.py"
    Then the source file should contain constant "DISCOVERY_TIMEOUT"
    And the source file should contain "TimeoutExpired"
    And the source file should contain field "timed_out"

  @feature4
  Scenario: PLUGIN013_11 state_service implements set_active_tab with 0.5-second debounced save via threading.Timer
    Given the state_service module source file exists at "tools/tui-test-runner/tui/state_service.py"
    Then the source file should contain function "def set_active_tab"
    And the source file should contain "_schedule_save"
    And the source file should contain "Timer"
    And the source file should contain "0.5"

  @feature4
  Scenario: PLUGIN013_12 state_service _load method restores state from YAML using yaml.safe_load
    Given the state_service module source file exists at "tools/tui-test-runner/tui/state_service.py"
    Then the source file should contain function "def _load"
    And the source file should contain "yaml.safe_load"
    And the source file should contain class "TuiState"
    And the source file should contain field "active_tab"

  @feature4
  Scenario: PLUGIN013_13 state_service catches exceptions in _load and falls back to TuiState defaults using singleton pattern
    Given the state_service module source file exists at "tools/tui-test-runner/tui/state_service.py"
    Then the source file should contain "except"
    And the source file should contain "TuiState()"
    And the source file should contain "_instance"
    And the source file should contain "threading.Lock"

  @feature5
  Scenario: PLUGIN013_14 project-level patterns.yaml overrides built-in timeout hint via analyze_status
    Given the YAML v2 status fixture "yaml-v2-failed.yaml" for pattern override test
    When analyze_status is called with the project fixture patterns
    Then the timeout card hint should be "Custom timeout hint from project override"

  @feature5
  Scenario: PLUGIN013_15 PatternLoader skips broken_regex and loads keyword_only_safe from invalid-patterns.yaml
    Given the invalid-patterns fixture file "invalid-patterns.yaml" contains a broken regex and a keyword-only pattern
    When PatternLoader loads "invalid-patterns.yaml" and PatternMatcher matches "safe keyword path"
    Then the loaded pattern ids should equal ["keyword_only_safe"]
    And the matched pattern id should be "keyword_only_safe"
    And the match method should be "keywords"

  @feature5
  Scenario: PLUGIN013_16 analyze_status matches keyword_handshake by keywords and regex_keyword_bootstrap by regex+keywords
    Given the pattern matching fixtures "yaml-v2-keyword-only.yaml" and "yaml-v2-regex-keywords.yaml" are available
    When analyze_status is called on both pattern matching fixtures
    Then the keyword-only fixture first card should have patternId "keyword_handshake" matched by "keywords"
    And the regex-keywords fixture first card should have patternId "regex_keyword_bootstrap" matched by "regex+keywords"

  @feature6
  Scenario: PLUGIN013_17 __main__ defines --run argparse flag wired to auto_run parameter in TestRunnerApp
    Given the __main__ module source file exists at "tools/tui-test-runner/tui/__main__.py"
    Then the source file should contain "--run"
    And the source file should contain "auto_run"
    And the app module source file at "tools/tui-test-runner/tui/app.py" should contain "auto_run"
    And the app module source file at "tools/tui-test-runner/tui/app.py" should contain "_auto_run"

  @feature6
  Scenario: PLUGIN013_18 __main__ implements LOCK_FILE single-instance guard with PID validation via os.kill
    Given the __main__ module source file exists at "tools/tui-test-runner/tui/__main__.py"
    Then the source file should contain "LOCK_FILE"
    And the source file should contain "is_already_running"
    And the source file should contain "acquire_lock"
    And the source file should contain "release_lock"
    And the source file should contain "os.kill"

  @feature7
  Scenario: PLUGIN013_19 app action_screenshot uses export_screenshot to write tui-screenshot-*.svg files
    Given the app module source file exists at "tools/tui-test-runner/tui/app.py"
    Then the source file should contain "screenshot"
    And the source file should contain "export_screenshot"
    And the source file should contain ".svg"
    And the source file should contain "tui-screenshot-"

  @feature7
  Scenario: PLUGIN013_20 app action_screenshot calls mkdir to ensure logs/screenshots directory exists
    Given the app module source file exists at "tools/tui-test-runner/tui/app.py"
    Then the source file should contain "mkdir"
    And the source file should contain "logs/screenshots"
