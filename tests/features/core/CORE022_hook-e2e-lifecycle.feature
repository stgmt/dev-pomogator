Feature: CORE022 Hook E2E Lifecycle
  As a developer using dev-pomogator
  I want hooks to be installed, correctly written to settings, and callable
  So that Claude Code invokes them and they produce expected side effects

  Background:
    Given Docker test environment is running
    And dev-pomogator is installed with --claude --all

  # @feature1 — Full chain: install → settings → execute
  Scenario: CORE022_01 Installed hooks are extractable from settings.json and executable
    Given project .claude/settings.json contains hooks after installation
    When I extract every hook command from settings.json
    And I execute each hook with realistic stdin for its event type
    Then every hook should exit without MODULE_NOT_FOUND
    And every hook should produce valid JSON on stdout or empty stdout
    And no hook should hang (timeout < 15s)

  # @feature2 — PreToolUse hooks respect matcher
  Scenario: CORE022_02 PreToolUse hook with matcher fires only for matching tool
    Given project .claude/settings.json contains PreToolUse hooks with matcher "Bash"
    When I invoke the hook with tool_name "Bash" and command "npm test"
    Then the hook should process the input (exit 0 or 2)
    When I invoke the hook with tool_name "Read" and file_path "/tmp/test"
    Then the hook should still exit cleanly (matcher is Claude-side, hook sees all)

  # @feature3 — Stop hooks produce valid block/allow decision
  Scenario: CORE022_03 Stop hook produces valid decision JSON
    Given project .claude/settings.json contains Stop hooks
    When I invoke a Stop hook with transcript_path and session_id
    Then stdout should be empty (approve) or valid JSON with "decision" key

  # @feature4 — UserPromptSubmit hooks receive user input
  Scenario: CORE022_04 UserPromptSubmit hook processes user prompt
    Given project .claude/settings.json contains UserPromptSubmit hooks
    When I invoke the hook with user_prompt "fix the bug in auth.ts"
    Then the hook should exit 0
    And stderr should not contain MODULE_NOT_FOUND

  # @feature5 — Hooks fail-open on malformed stdin
  Scenario: CORE022_05 Hooks fail-open on invalid JSON stdin
    Given project .claude/settings.json contains hooks
    When I invoke a hook with stdin "NOT VALID JSON {{{}"
    Then the hook should exit 0 (fail-open, not crash)
    And stderr should not contain "unhandled" or "uncaught"

  # @feature6 — Hooks fail-open on empty stdin
  Scenario: CORE022_06 Hooks fail-open on empty stdin
    Given project .claude/settings.json contains hooks
    When I invoke a hook with empty stdin
    Then the hook should exit 0 (fail-open)

  # @feature7 — All manifest hooks present in settings after install
  Scenario: CORE022_07 Every hook from extension.json manifests appears in settings.json
    Given all extension.json manifests are loaded
    When I collect hook event names from all manifests
    Then each hook event name should exist in project .claude/settings.json hooks
    And each hook command should reference .dev-pomogator/tools/ path

  # @feature8 — Regression: reinstall does not duplicate hooks
  Scenario: CORE022_08 Reinstall produces identical hook set (no duplicates)
    Given dev-pomogator is installed with --claude --all
    And I capture hook count per event from settings.json
    When I run installer again with --claude --all
    Then hook count per event should be identical to before

  # @feature9 — Regression: user hooks survive reinstall
  Scenario: CORE022_09 User-added hook survives reinstall
    Given I add a custom user hook to Stop in settings.json
    When I run installer again with --claude --all
    Then the custom user hook should still be in settings.json Stop array
    And managed hooks should also be present

  # @feature10 — Hook command matches installed file on disk
  Scenario: CORE022_10 Hook command references file that exists on disk
    Given project .claude/settings.json contains hooks
    When I extract script paths from hook commands
    Then each script path should resolve to an existing file in project directory
