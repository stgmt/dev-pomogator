Feature: Codex platform and bootstrap

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Installer accepts codex as a first-class platform
    When user runs dev-pomogator install with target "codex"
    Then installer should resolve platform "codex"
    And installer should start Codex-specific installation flow

  Scenario: Fresh install creates only project-level Codex artifacts
    Given the project has no existing Codex artifacts
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

  Scenario: Windows Codex bootstrap routes through universal entrypoint and bash sh path
    Given the current OS is Windows
    When user runs bootstrap for target "codex"
    Then universal bootstrap entrypoint should recognize target "codex"
    And bootstrap should route through the bash sh path
    And bootstrap should invoke the Codex installer target
