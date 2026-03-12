Feature: Codex parity for auto-commit

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: auto-commit materializes a Stop hook in Codex
    Given auto-commit is enabled in the support matrix
    And Codex version 0.114.0 or newer is installed
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a "Stop" hook entry for auto-commit
