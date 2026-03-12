Feature: Codex update and reinstall discipline

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Reinstall updates only managed Codex artifacts
    Given Codex support is already installed in the project
    And a managed ".agents/skills/deep-insights/SKILL.md" was modified by the user
    And an unrelated user-owned ".agents/skills/custom-skill/SKILL.md" exists
    When user runs Codex update or reinstall
    Then the modified managed skill should be backed up before overwrite
    And the unrelated user-owned skill should remain untouched

  Scenario: Reinstall removes stale managed Codex artifacts only
    Given Codex support is already installed in the project
    And a stale managed ".agents/skills/old-managed-skill/" directory exists
    And an unrelated user-owned ".agents/skills/custom-skill/" directory exists
    When user runs Codex update or reinstall
    Then the stale managed directory should be removed
    And the unrelated user-owned directory should remain untouched
