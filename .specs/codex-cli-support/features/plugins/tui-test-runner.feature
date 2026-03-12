Feature: Codex parity for tui-test-runner

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: tui-test-runner materializes the run-tests skill for Codex
    Given tui-test-runner is enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then project should contain ".agents/skills/run-tests/SKILL.md"

  Scenario: tui-test-runner declares an explicit Codex parity route
    When Codex support matrix is generated
    Then tui-test-runner should have an explicit parity route
    And the parity route should name skills and optional SessionStart automation as applicable
