Feature: CTXMODE001_context_mode_integration

  Background:
    Given an isolated Claude home for context-mode integration tests
    And dev-pomogator context-mode fixtures are available

  @FR-1 @feature1
  Scenario: CTXMODE001_01 setup decision distinguishes install states
    Given context-mode plugin registration is missing
    When the context-mode setup decision runs
    Then the setup status is "INSTALL_MISSING"
    And the setup output includes exact plugin install instructions
    And no interactive plugin command is launched from shell
    And the shipped SessionStart runtime registers the context-mode setup hook

  @FR-2 @feature2
  Scenario: CTXMODE001_02 MCP-only configuration preserves existing settings
    Given global Claude settings contain unrelated hooks and MCP servers
    When MCP-only context-mode config is applied
    Then a settings backup is created
    And unrelated hooks and MCP servers are preserved
    And context-mode MCP registration is present

  @FR-3 @feature3
  Scenario: CTXMODE001_03 setup fails open for opt-out, backoff, and malformed JSON
    Given context-mode setup sees an opt-out or malformed registry
    When the setup hook runs
    Then the context-mode setup hook exits with code 0
    And the result records a non-success status without blocking the session

  @FR-4 @feature4
  Scenario: CTXMODE001_04 doctor classifies config poisoning versus live MCP death
    Given context-mode plugin files exist
    And the plugin registry is poisoned
    When the context-mode doctor check runs
    Then the doctor status is "CONFIG_POISONED"
    And pomogator-doctor includes the context-mode health check
    When the registry is healthy but the MCP process snapshot is dead
    Then the doctor status is "MCP_DEAD_IN_SESSION"

  @FR-5 @feature5
  Scenario: CTXMODE001_05 recovery runbook prefers live MCP reconnect
    Given context-mode doctor has status "MCP_DEAD_IN_SESSION"
    When recovery guidance is rendered
    Then it recommends the heal step
    And it recommends reconnecting context-mode through "/mcp"
    And it lists full session restart only as a last resort

  @FR-6 @feature6
  Scenario: CTXMODE001_06 hook degrades when ctx tools are unavailable
    Given ctx tools are unavailable in the current session
    When the context-mode hook evaluates a Bash operation
    Then the hook allows native tooling
    And the hook does not redirect to dead ctx tools

  @FR-7 @feature7
  Scenario: CTXMODE001_07 optional force-ctx policy is selective and kill-switchable
    Given ctx tools are available
    And "FORCE_CTX_OFF" is not set
    When force-ctx evaluates a generated log path
    Then it emits a CASE-A redirect to a ctx tool
    When force-ctx evaluates a source file path
    Then it allows native read-to-edit access

  @FR-8 @feature8
  Scenario: CTXMODE001_08 Windows guidance maps each friction to a workaround
    Given the platform is Windows
    When context-mode guidance is rendered
    Then it states that shell language runs bash
    And it shows explicit "pwsh -NoProfile" invocation
    And it recommends ctx_batch_execute for paths outside project root

  @FR-9 @feature9
  Scenario: CTXMODE001_09 docs include honest value boundary
    Given context-mode user documentation is rendered
    When the value boundary section is inspected
    Then it names large raw artifacts and session survival as value cases
    And it states that disciplined grep or pipe usage can be parity
    And it does not claim universal daily usage reduction
