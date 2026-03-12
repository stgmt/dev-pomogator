Feature: Codex hook schema contract

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Codex hooks use the v0.114.0 entry shape
    Given Codex version 0.114.0 or newer is installed
    And hook-driven Codex extensions are enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then each managed hook entry in ".codex/hooks.json" should contain "type"
    And each managed hook entry in ".codex/hooks.json" should contain "command"
    And each managed hook entry in ".codex/hooks.json" should contain "statusMessage"
    And each managed hook entry in ".codex/hooks.json" should contain "timeout"
