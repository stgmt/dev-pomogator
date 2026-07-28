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
    And SessionStart fires the non-interactive context-mode installer
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
    And pomogator-doctor can launch the context-mode repair installer
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

  @FR-10 @feature10
  Scenario: CTXMODE001_10 SessionStart self-heals only stale owned context-mode worker trees
    Given a stale context-mode owned worker and unrelated runtimes
    When SessionStart self-heal sweeps the stale workers
    Then only the stale owned process tree is terminated
    And fresh and unrelated runtime processes are preserved

  @FR-11 @feature11
  Scenario: CTXMODE001_11 SessionStart worker recovery fails open when process inspection is unavailable
    When the process APIs are unavailable
    Then SessionStart self-heal fails open without killing a process

  @FR-12 @feature12
  Scenario: CTXMODE001_12 SessionStart stale-worker self-heal caps recovery roots
    When a bounded self-heal sweep receives too many stale owned workers
    Then it kills only the capped roots and reports the untouched remainder

  @FR-13 @feature13
  Scenario: CTXMODE001_13 SessionStart stale-worker self-heal obeys its sweep deadline
    When a bounded self-heal sweep reaches its deadline before a second kill
    Then it skips the remaining root with a deadline diagnostic

  @FR-14 @feature14
  Scenario: CTXMODE001_14 POSIX stale-worker recovery owns the installer tree
    When a context-mode installer worker starts on POSIX
    Then its installer stays in the owned worker process group

  @FR-15 @feature15
  Scenario: CTXMODE001_15 POSIX recovery selects only the owned worker group leader
    When a POSIX scan sees an owned worker group leader and its tsx descendant
    Then it kills only the owned process-group leader

  @FR-16 @feature16
  Scenario: CTXMODE001_16 Windows recovery bounds synchronous tree termination
    When a Windows stale-worker sweep invokes a bounded tree kill
    Then it performs one timeout-bounded Windows tree kill
