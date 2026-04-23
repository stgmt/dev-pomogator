Feature: Codex parity for auto-simplify

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: auto-simplify participates in the managed Stop dispatcher
    Given Codex version 0.114.0 or newer is installed
    And auto-simplify is enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a managed "Stop" dispatcher entry
    And the managed "Stop" dispatcher should include an auto-simplify route
