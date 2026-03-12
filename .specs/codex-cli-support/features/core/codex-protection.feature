Feature: Codex guidance and user artifact protection

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Existing AGENTS.md is backed up before managed merge
    Given the project contains a user-authored "AGENTS.md"
    When user runs dev-pomogator install with target "codex"
    Then a backup of "AGENTS.md" should be created
    And install output should contain a merge warning for "AGENTS.md"

  Scenario: Existing codex config and hooks are backed up before overwrite
    Given the project contains a user-authored ".codex/config.toml"
    And the project contains a user-authored ".codex/hooks.json"
    When user runs dev-pomogator install with target "codex"
    Then backups of both files should be created
    And install output should contain merge warnings for both files

  Scenario: AGENTS.md and CLAUDE.md coexist without clobbering glossary semantics
    Given the project contains an existing "CLAUDE.md"
    When user runs dev-pomogator install with target "codex"
    Then project should contain an "AGENTS.md"
    And "CLAUDE.md" should preserve its commands and rules glossary sections
    And install output should not claim that "CLAUDE.md" was fully replaced
