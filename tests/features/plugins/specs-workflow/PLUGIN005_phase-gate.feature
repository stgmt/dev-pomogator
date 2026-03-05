# Source: .specs/spec-phase-gate/spec-phase-gate.feature
Feature: Phase Gate — PreToolUse hook for /create-spec workflow enforcement

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # @feature1 — PreToolUse Hook (phase-gate.ts)

  @feature1
  Scenario: Block Write to future-phase file when STOP not confirmed
    Given a spec ".specs/test-feature/" exists with .progress.json
    And current phase is Discovery
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/test-feature/FR.md"
    Then phase-gate hook returns permissionDecision "deny"
    And exit code is 2
    And deny reason contains "STOP #1"

  @feature1
  Scenario: Allow Write to current-phase file
    Given a spec ".specs/test-feature/" exists with .progress.json
    And current phase is Discovery
    When Claude calls Write for ".specs/test-feature/USER_STORIES.md"
    Then phase-gate hook returns exit code 0

  @feature1
  Scenario: Allow Write to previous-phase file after STOP confirmed
    Given a spec ".specs/test-feature/" exists with .progress.json
    And Discovery.stopConfirmed is true
    And current phase is Requirements
    When Claude calls Write for ".specs/test-feature/USER_STORIES.md"
    Then phase-gate hook returns exit code 0

  @feature1
  Scenario: Pass-through for non-spec files
    When Claude calls Write for "src/index.ts"
    Then phase-gate hook returns exit code 0

  @feature1
  Scenario: Fail-open when .progress.json does not exist
    Given a spec ".specs/manual-spec/" exists without .progress.json
    When Claude calls Write for ".specs/manual-spec/FR.md"
    Then phase-gate hook returns exit code 0

  @feature1
  Scenario: Fail-open when .progress.json is corrupted
    Given a spec ".specs/test-feature/" exists with invalid .progress.json
    When Claude calls Write for ".specs/test-feature/FR.md"
    Then phase-gate hook returns exit code 0

  @feature1
  Scenario: Handle .progress.json with UTF-8 BOM (PowerShell output)
    Given a spec ".specs/test-feature/" exists with BOM-prefixed .progress.json
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/test-feature/FR.md"
    Then phase-gate hook returns permissionDecision "deny"

  @feature1
  Scenario: Gate .feature files as Requirements phase
    Given a spec ".specs/test-feature/" exists with .progress.json
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/test-feature/test-feature.feature"
    Then phase-gate hook returns permissionDecision "deny"

  @feature1
  Scenario: Allow unknown files (not phase-gated)
    Given a spec ".specs/test-feature/" exists with .progress.json
    When Claude calls Write for ".specs/test-feature/SCHEMA.md"
    Then phase-gate hook returns exit code 0

  # @feature2 — Phase Status Injection (validate-specs.ts)

  @feature2
  Scenario: Inject phase status banner into prompt context
    Given a spec ".specs/test-feature/" exists with .progress.json
    And current phase is Discovery
    And Discovery.stopConfirmed is false
    When user submits a prompt
    Then stdout contains "[specs-validator] SPEC: test-feature"
    And stdout contains "Allowed files:"
    And stdout contains "Blocked files:"

  @feature2
  Scenario: No status injection without .progress.json
    Given a spec ".specs/manual-spec/" exists without .progress.json
    When user submits a prompt
    Then stdout does not contain "[specs-validator] SPEC: manual-spec"

  # @feature3 — Audit Checks (audit-checks.ts)

  @feature3
  Scenario: Detect partial implementation (task [x] + FR marker)
    Given FR.md contains "## FR-5: Something" with "НЕ РЕАЛИЗОВАНО"
    And TASKS.md contains "- [x] implement FR-5"
    When audit PARTIAL_IMPL check runs
    Then finding severity is ERROR
    And finding message contains "FR-5"

  @feature3
  Scenario: Allow known gap (task [ ] + FR marker)
    Given FR.md contains "## FR-5: Something" with "НЕ РЕАЛИЗОВАНО"
    And TASKS.md contains "- [ ] implement FR-5"
    When audit PARTIAL_IMPL check runs
    Then no findings

  @feature3
  Scenario: Detect task covering multiple FRs
    Given TASKS.md contains "- [x] implement FR-4 and FR-5"
    When audit TASK_ATOMICITY check runs
    Then finding severity is WARNING
    And finding message contains "FR-4" and "FR-5"

  @feature3
  Scenario: Detect FR split inconsistency
    Given FR.md contains "## FR-4:" and "## FR-4a:" and "## FR-5:"
    And FR-5 has no sub-variant
    When audit FR_SPLIT check runs
    Then finding severity is INFO
    And finding message contains "FR-5"

  @feature3
  Scenario: Clean spec passes all audit checks
    Given FR.md contains "## FR-1: Clean" without markers
    And TASKS.md contains "- [x] implement FR-1"
    When all audit checks run
    Then no findings
