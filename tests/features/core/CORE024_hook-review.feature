Feature: CORE024 Windows shell-free hook authoring gate
  As a plugin maintainer
  I want an executable review gate for managed hook registrations
  So that Windows never regresses to per-event shell launchers

  # @feature1
  Scenario: CORE024_01 The review gate rejects shell, inline Node, registry drift, and unapproved transport
    Given an approved local HTTP hook registry
    And a managed hook manifest containing shell, inline Node, drifted, and unapproved hook commands
    When I run the hook review gate
    Then the gate rejects every prohibited managed hook with its reason

  # @feature2
  Scenario: CORE024_02 The review gate permits approved HTTP hooks and the SessionStart bootstrap exception
    Given an approved local HTTP hook registry
    And a managed hook manifest containing an approved HTTP hook and documented SessionStart bootstrap
    When I run the hook review gate
    Then the hook review gate exits successfully

  # @feature3
  Scenario: CORE024_03 The gate rejects an extra SessionStart command and unsupported non-hot event
    Given an approved local HTTP hook registry
    And a managed hook manifest with extra SessionStart and non-hot hooks
    When I run the hook review gate
    Then the gate reports the SessionStart and non-hot event violations

  # @feature4
  Scenario: CORE024_04 The CLI validates absolute manifest and registry paths from a foreign CWD
    Given the canonical hook manifest and registry paths
    When I run the hook review CLI from a foreign working directory
    Then the foreign-CWD hook review CLI exits successfully

  # @feature24
  Scenario: CORE024_05 The installed registry preserves HTTP route matcher timeout and target semantics
    Given the canonical hook manifest and registry paths
    When I run the hook review gate
    Then every installed HTTP route has matching matcher timeout and target semantics

  # @feature17 @feature23
  Scenario: CORE024_06 Every managed HTTP route uses environment bearer auth without a literal secret
    Given the canonical hook manifest and registry paths
    When I inspect every managed HTTP route authentication contract
    Then every route uses the hook token environment reference and no literal token

  # @feature13 @feature17
  Scenario: CORE024_07 Concurrent credential provisioning is stable across service restarts
    Given an empty isolated hook credential state
    When eight hook-service starters provision the credential concurrently
    Then they share one persisted credential and only one starter creates it

  # @feature25
  Scenario: CORE024_08 A failed hook leaves a durable sanitized diagnostic
    Given an isolated HTTP hook service with a hook that leaks its credential and fails
    When I dispatch the failing hook
    Then the 503 names the failure and matches one durable diagnostic without the credential

  # @feature25
  Scenario: CORE024_09 The hook service self-heals after a hook runtime failure
    Given an isolated HTTP hook service with a repairable hook
    When the hook fails once and its implementation is repaired
    Then the same service process dispatches the repaired hook successfully

  # @feature25
  Scenario: CORE024_10 A completed block survives a late hook process failure
    Given an isolated HTTP hook service with a hook that emits a block and exits abnormally
    When I dispatch the failing hook
    Then the completed block is returned instead of an HTTP 503

  # @feature25
  Scenario: CORE024_11 A stale owned hook daemon is recycled automatically
    Given an isolated stale owned hook daemon identity
    When hook-service startup checks the stale daemon
    Then it stops the owned daemon and starts the current runtime

  # @feature13 @feature17 @feature19 @feature24
  Scenario: CORE024_12 A managed hook transparently recovers after its owned daemon dies mid-session
    Given a managed hook client has dispatched through an owned authenticated hook-service daemon
    And that owned daemon dies during the same Claude Code session
    When the next managed hook dispatches the original request
    Then the client restarts the owned service through the single-flight lifecycle and retries once
    And the original registered hook response is returned without user action
    And live HTTP errors are not retried and a foreign listener is never terminated
    And a repeated transport failure remains fail-open with a sanitized durable diagnostic
