Feature: Codex parity for claude-mem-health

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: claude-mem-health materializes a SessionStart hook in Codex
    Given claude-mem-health is enabled in the support matrix
    And Codex version 0.114.0 or newer is installed
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should enable "features.codex_hooks=true"
    And ".codex/hooks.json" should contain a "SessionStart" hook entry for claude-mem-health
