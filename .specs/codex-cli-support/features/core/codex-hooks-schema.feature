Feature: Codex hook schema contract

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Codex hooks use version-aware entry shapes
    Given Codex version 0.117.0 or newer is installed
    And hook-driven Codex extensions are enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then each managed hook entry in ".codex/hooks.json" should contain "type"
    And each managed hook entry in ".codex/hooks.json" should contain "command"
    And each managed hook entry in ".codex/hooks.json" should contain "statusMessage"
    And each managed hook entry in ".codex/hooks.json" should contain "timeout"
    And each managed "PreToolUse" entry should use matcher "Bash"
    And each managed "PostToolUse" entry should use matcher "Bash"

  Scenario: Managed hooks use one dispatcher per event
    Given multiple managed Codex extensions share the "Stop" event
    When user runs dev-pomogator install with target "codex"
    Then ".codex/hooks.json" should contain one managed "Stop" dispatcher entry
    And the managed "Stop" dispatcher should route to the relevant extensions internally
    And ".codex/hooks.json" should NOT contain one separate managed "Stop" hook per extension

  Scenario: Project hooks coexist additively with user-level hooks
    Given user-level "~/.codex/hooks.json" already exists
    When user runs dev-pomogator install with target "codex"
    Then project ".codex/hooks.json" should coexist with user-level hooks
    And project hooks should NOT be documented as replacing the user-level hook layer

  Scenario: Windows hook behavior is gated by capability resolver
    Given the current OS is Windows
    When Codex support matrix is generated
    Then hook support should be gated by Codex version and documented capability
    And design should NOT hardcode Windows as bash sh only
