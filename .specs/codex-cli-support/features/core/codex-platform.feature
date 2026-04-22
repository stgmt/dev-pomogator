Feature: Codex platform and bootstrap

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Installer accepts codex as a first-class platform
    When user runs dev-pomogator install with target "codex"
    Then installer should resolve platform "codex"
    And installer should start Codex-specific installation flow

  Scenario: Fresh trusted install creates only project-level Codex artifacts
    Given the project has no existing Codex artifacts
    And the project is trusted by Codex
    When user runs dev-pomogator install with target "codex"
    Then project should contain ".codex/config.toml"
    And project should contain ".codex/hooks.json"
    And project should contain "AGENTS.md"
    And project should contain ".agents/skills/"
    And project should contain ".dev-pomogator/tools/"

  Scenario: Fresh install does not write to user-level Codex home
    Given the project has no existing Codex artifacts
    When user runs dev-pomogator install with target "codex"
    Then installer should NOT create or modify "~/.codex/config.toml"
    And installer should NOT create or modify "~/.codex/hooks.json"

  Scenario: Untrusted project warns about ignored project layers
    Given the project is not trusted by Codex
    When user runs dev-pomogator install with target "codex"
    Then installer should warn that project ".codex" layers are ignored until trust onboarding
    And installer should still materialize repo-local Codex artifacts safely

  Scenario: Windows strategy is native-first with WSL fallback
    Given the current OS is Windows
    When user runs bootstrap for target "codex"
    Then universal bootstrap entrypoint should recognize target "codex"
    And documentation should describe native Windows sandbox as the default path
    And documentation should describe WSL2 as a fallback instead of forcing bash sh only
