Feature: Codex parity for prompt-suggest

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: prompt-suggest uses UserPromptSubmit and Stop when supported
    Given Codex version 0.116.0 or newer is installed
    When Codex support matrix is generated
    Then prompt-suggest should have an explicit parity route
    And the parity route should name "UserPromptSubmit" and "Stop" when available
    And the parity route should also name a non-hook fallback for older versions or restricted environments
    And prompt-suggest should NOT be omitted silently
