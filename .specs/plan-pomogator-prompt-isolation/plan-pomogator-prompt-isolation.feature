Feature: PLUGIN007_43_PlanPomogatorPromptIsolation

  Background:
    Given dev-pomogator is installed
    And plan-pomogator extension is enabled

  # @feature1 — links to FR-1 (prompt-capture uses session_id)
  Scenario: PLUGIN007_43_01 prompt-capture writes to session-specific file
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains session_id "abc-123" and prompt "real user message"
    When the script processes the input
    Then file "~/.dev-pomogator/.plan-prompts-abc-123.json" should exist
    And the file should contain entry with text "real user message"
    And file "~/.dev-pomogator/.plan-prompts-default.json" should not exist

  # @feature2 — links to FR-2 (no default fallback)
  Scenario: PLUGIN007_43_02 prompt-capture writes nothing when session_id missing
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains prompt "orphan message" without session_id field
    When the script processes the input
    Then the script should exit with code 0
    And no file should be created in "~/.dev-pomogator/" directory
    And specifically "~/.dev-pomogator/.plan-prompts-default.json" should not exist

  # @feature3 — links to FR-3 (task-notification filter)
  Scenario: PLUGIN007_43_03 prompt-capture filters task-notification pseudo-prompts
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains session_id "x" and prompt "<task-notification><task-id>bg1</task-id><status>completed</status></task-notification>"
    When the script processes the input
    Then the script should exit with code 0
    And file "~/.dev-pomogator/.plan-prompts-x.json" should not contain the task-notification entry

  # @feature4 — links to FR-4 (no most-recent fallback)
  Scenario: PLUGIN007_43_04 plan-gate loadUserPrompts returns empty for unknown session
    Given another file ".plan-prompts-other.json" exists in "~/.dev-pomogator/" with valid prompts
    And no file ".plan-prompts-unknown.json" exists in "~/.dev-pomogator/"
    When loadUserPrompts is called with sessionId "unknown"
    Then the function should return an empty string
    And the function should not read from ".plan-prompts-other.json"

  # @feature5 — links to FR-5 (defense filter on read)
  Scenario: PLUGIN007_43_05 plan-gate formatPromptsFromFile filters legacy task-notification entries
    Given a prompts file containing mixed entries with one task-notification and two real prompts
    When formatPromptsFromFile is called on this file
    Then the returned string should contain "real prompt 1" and "real prompt 2"
    And the returned string should not contain the substring "<task-notification"
