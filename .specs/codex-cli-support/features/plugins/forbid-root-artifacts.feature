Feature: Codex parity for forbid-root-artifacts

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: forbid-root-artifacts uses explicit tools and guidance parity in Codex
    When Codex support matrix is generated
    Then forbid-root-artifacts should have an explicit parity route
    And the parity route should name tools, AGENTS guidance or pre-commit workflow as applicable
