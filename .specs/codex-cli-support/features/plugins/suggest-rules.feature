Feature: Codex parity for suggest-rules

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: suggest-rules materializes Codex skills under .agents
    Given suggest-rules is enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then project should contain ".agents/skills/deep-insights/SKILL.md"
    And project should contain ".agents/skills/rules-optimizer/SKILL.md"

  Scenario: suggest-rules declares an explicit memory parity strategy for Codex
    When Codex support matrix is generated
    Then suggest-rules should have an explicit parity route
    And suggest-rules should declare whether claude-mem behavior is reused, replaced or excluded for Codex
    And suggest-rules should be marked "partial" until that strategy is implemented
    And suggest-rules should NOT rely on implicit Claude-only memory installation behavior
