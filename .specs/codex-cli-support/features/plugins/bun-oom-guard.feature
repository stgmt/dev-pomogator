Feature: Codex parity for bun-oom-guard

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: bun-oom-guard participates in the managed SessionStart dispatcher
    Given Codex version 0.114.0 or newer is installed
    And bun-oom-guard is enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a managed "SessionStart" dispatcher entry
    And the managed "SessionStart" dispatcher should include a bun-oom-guard route
