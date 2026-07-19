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
  Scenario: CORE024_06 Every managed HTTP route is credential-free and loopback-only
    Given the canonical hook manifest and registry paths
    When I inspect every managed HTTP route authentication contract
    Then every route has no authentication metadata

  # @feature13 @feature17
  Scenario: CORE024_07 Parallel sessions require no credential coordination
    Given the canonical hook manifest and registry paths
    When I inspect every managed HTTP route authentication contract
    Then every route has no authentication metadata
