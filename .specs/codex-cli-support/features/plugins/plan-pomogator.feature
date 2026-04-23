Feature: Codex parity for plan-pomogator

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: plan-pomogator uses AGENTS guidance and skill parity in Codex
    When Codex support matrix is generated
    Then plan-pomogator should have an explicit parity route
    And the parity route should name AGENTS guidance, skill packaging and prompt hooks as applicable
    And plan-pomogator should be marked "partial" until an ExitPlanMode-equivalent route exists
