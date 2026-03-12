Feature: Codex parity for prompt-suggest

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: prompt-suggest gets an explicit parity route beyond direct hooks
    Given prompt-suggest requires behavior beyond only SessionStart and Stop
    When Codex support matrix is generated
    Then prompt-suggest should have an explicit parity route
    And the parity route should name hooks, skills, AGENTS, exec or automations as applicable
    And prompt-suggest should NOT be omitted silently
