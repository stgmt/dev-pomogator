Feature: Codex parity for bun-oom-guard

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: bun-oom-guard materializes a SessionStart hook in Codex
    Given bun-oom-guard is enabled in the support matrix
    And Codex version 0.114.0 or newer is installed
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a "SessionStart" hook entry for bun-oom-guard
