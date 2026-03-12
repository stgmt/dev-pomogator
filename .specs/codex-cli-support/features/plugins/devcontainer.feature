Feature: Codex parity for devcontainer

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: devcontainer uses an explicit Codex post-install parity route
    When Codex support matrix is generated
    Then devcontainer should have an explicit parity route
    And the parity route should name skills, tools or post-install style workflow as applicable
