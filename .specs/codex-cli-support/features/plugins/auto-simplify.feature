Feature: Codex parity for auto-simplify

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: auto-simplify materializes a Stop hook in Codex
    Given auto-simplify is enabled in the support matrix
    And Codex version 0.114.0 or newer is installed
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a "Stop" hook entry for auto-simplify
