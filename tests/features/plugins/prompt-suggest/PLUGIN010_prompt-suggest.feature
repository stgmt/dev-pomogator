# Source: analyze-features.sh (PLUGIN010, next free domain number)
Feature: PLUGIN010_Prompt-Suggest

  Background:
    Given dev-pomogator is installed
    And prompt-suggest extension is enabled

  # @feature1 @feature9
  Scenario: Stop hook generates suggestion with lightbulb emoji
    Given an API key is configured
    And stop_hook_active is false
    And a session transcript exists with user request and assistant response
    When Stop hook is triggered with last_assistant_message
    Then prompt-suggestion.json should be created
    And systemMessage should start with lightbulb emoji
    And hook should exit with code 0

  # @feature1
  Scenario: Stop hook parses first user message from transcript
    Given an API key is configured
    And stop_hook_active is false
    And transcript JSONL contains user and assistant messages
    When Stop hook is triggered with transcript_path
    Then LLM should receive both user request and assistant response
    And hook should exit with code 0

  # @feature2
  Scenario: Submit hook injects suggestion on plus input
    Given a valid non-expired prompt-suggestion.json exists
    When UserPromptSubmit hook receives prompt "+"
    Then output should contain additionalContext with suggestion text
    And prompt-suggestion.json should be cleared
    And hook should exit with code 0

  # @feature2
  Scenario: Submit hook passes through non-plus prompts
    Given a valid prompt-suggestion.json exists
    When UserPromptSubmit hook receives prompt "fix the bug"
    Then output should NOT contain additionalContext
    And prompt-suggestion.json should remain unchanged
    And hook should exit with code 0

  # @feature2
  Scenario: Submit hook passes through when no state file
    When UserPromptSubmit hook receives prompt "+"
    And prompt-suggestion.json does not exist
    Then output should pass through without modification
    And hook should exit with code 0

  # @feature3
  Scenario: Stop hook auto-detects OpenRouter API
    Given OPENROUTER_API_KEY is set
    When Stop hook is triggered
    Then LLM call should use openrouter.ai base URL
    And hook should exit with code 0

  # @feature3
  Scenario: Stop hook auto-detects aipomogator API
    Given AUTO_COMMIT_API_KEY is set
    And OPENROUTER_API_KEY is not set
    When Stop hook is triggered
    Then LLM call should use aipomogator.ru base URL
    And hook should exit with code 0

  # @feature5
  Scenario: Both hooks no-op when disabled
    Given PROMPT_SUGGEST_ENABLED is "false"
    When Stop hook is triggered
    Then hook should exit with code 0
    And prompt-suggestion.json should NOT be created

  # @feature7
  Scenario: Stop hook silence - no state file on empty LLM response
    Given an API key is configured
    And stop_hook_active is false
    When Stop hook is triggered and LLM returns empty response
    Then prompt-suggestion.json should NOT be created
    And systemMessage should NOT be present in output
    And hook should exit with code 0

  # @feature8
  Scenario: Stop hook skips when stop_hook_active is true
    Given an API key is configured
    And stop_hook_active is true
    When Stop hook is triggered
    Then prompt-suggestion.json should NOT be created
    And hook should exit with code 0

  # @feature4
  Scenario: Submit hook clears expired suggestion
    Given an expired prompt-suggestion.json exists with TTL exceeded
    When UserPromptSubmit hook receives prompt "+"
    Then output should pass through without modification
    And prompt-suggestion.json should be cleared
    And hook should exit with code 0

  # @feature2
  Scenario: No API key - both hooks no-op
    Given no API key is configured
    When Stop hook is triggered
    Then prompt-suggestion.json should NOT be created
    And hook should exit with code 0
