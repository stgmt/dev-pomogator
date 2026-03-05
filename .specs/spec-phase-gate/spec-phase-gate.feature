# Source: tests/features/plugins/specs-workflow/PLUGIN005_specs-validator.feature
# Candidates: PLUGIN005_specs-validator.feature, PLUGIN003_specs-workflow.feature

Feature: PLUGIN008 Spec Phase Gate Anti-Hallucination
  As a developer using specs-workflow
  I want Claude to be physically blocked from writing future-phase spec files
  So that I can review each phase before the workflow continues

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # --- Layer 1: PreToolUse Hook (phase-gate.ts) --- @feature1

  # @feature1
  Scenario: Hook blocks Write to future phase file
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Discovery"
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/my-feature/FR.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should output JSON with permissionDecision "deny"
    And hook should exit with code 2
    And deny reason should mention "STOP #1" and "Discovery"

  # @feature1
  Scenario: Hook allows Write to current phase file
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Discovery"
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/my-feature/USER_STORIES.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0
    And no deny output should be written to stdout

  # @feature1
  Scenario: Hook allows Write to previous phase file
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Requirements"
    And Discovery.stopConfirmed is true
    And Context.stopConfirmed is true
    When Claude calls Write for ".specs/my-feature/USER_STORIES.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0

  # @feature1
  Scenario: Hook allows Write when no .progress.json exists
    Given .specs/manual-spec/ exists without .progress.json
    When Claude calls Write for ".specs/manual-spec/FR.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0

  # @feature1
  Scenario: Hook fail-open on corrupted .progress.json
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json contains invalid JSON
    When Claude calls Write for ".specs/my-feature/FR.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0
    And error should be written to stderr

  # @feature1
  Scenario: Hook passes through non-spec file paths
    Given .specs/my-feature/ is scaffolded with .progress.json
    When Claude calls Write for "src/index.ts"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0

  # @feature1
  Scenario: Hook allows next phase after STOP confirmed
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Requirements"
    And Discovery.stopConfirmed is true
    And Context.stopConfirmed is true
    When Claude calls Write for ".specs/my-feature/FR.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0

  # @feature1
  Scenario: Hook blocks Edit to future phase file
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Discovery"
    And Discovery.stopConfirmed is false
    When Claude calls Edit for ".specs/my-feature/TASKS.md"
    And phase-gate.ts PreToolUse hook runs
    Then hook should output JSON with permissionDecision "deny"
    And hook should exit with code 2
    And deny reason should mention "STOP #1" and "Discovery"

  # @feature1
  Scenario: Hook allows .feature file during Requirements phase
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Requirements"
    And Discovery.stopConfirmed is true
    And Context.stopConfirmed is true
    When Claude calls Write for ".specs/my-feature/my-feature.feature"
    And phase-gate.ts PreToolUse hook runs
    Then hook should exit with code 0

  # @feature1
  Scenario: Hook blocks .feature file during Discovery phase
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Discovery"
    And Discovery.stopConfirmed is false
    When Claude calls Write for ".specs/my-feature/my-feature.feature"
    And phase-gate.ts PreToolUse hook runs
    Then hook should output JSON with permissionDecision "deny"
    And hook should exit with code 2

  # @feature1
  Scenario: Hook is registered in .claude/settings.json
    When dev-pomogator installs specs-workflow for Claude
    Then .claude/settings.json should contain PreToolUse hook
    And hook matcher should be "Write|Edit"
    And hook command should reference phase-gate.ts

  # --- Layer 2: UserPromptSubmit Phase Status Injection --- @feature2

  # @feature2
  Scenario: Phase status banner is injected for active spec
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Discovery"
    And Discovery.stopConfirmed is false
    When user submits a prompt
    And validate-specs.ts UserPromptSubmit hook runs
    Then output should contain phase status for "my-feature"
    And output should list allowed files for Discovery phase
    And output should list blocked files for future phases

  # @feature2
  Scenario: Phase status shows unlocked phase
    Given .specs/my-feature/ is scaffolded with .progress.json
    And .progress.json has currentPhase "Requirements"
    And Discovery.stopConfirmed is true
    And Context.stopConfirmed is true
    When user submits a prompt
    And validate-specs.ts UserPromptSubmit hook runs
    Then output should contain phase status for "my-feature"
    And output should list allowed files for Requirements phase

  # @feature2
  Scenario: No phase status when .progress.json is absent
    Given .specs/old-spec/ exists without .progress.json
    When user submits a prompt
    And validate-specs.ts UserPromptSubmit hook runs
    Then output should not contain phase status for "old-spec"

  # --- Layer 3: Audit Checks --- @feature3

  # @feature3
  Scenario: Audit detects partial implementation
    Given .specs/my-feature/ is a complete spec
    And FR.md contains "## FR-5: Feature Five" with text "NOT IMPLEMENTED"
    And TASKS.md contains task for FR-5 marked as "[x]"
    When audit-spec.ps1 runs on ".specs/my-feature"
    Then audit should report PARTIAL_IMPL error for FR-5
    And error message should mention "NOT IMPLEMENTED" and "[x]"

  # @feature3
  Scenario: Audit detects task atomicity violation
    Given .specs/my-feature/ is a complete spec
    And TASKS.md contains a task referencing 5 files in its description
    When audit-spec.ps1 runs on ".specs/my-feature"
    Then audit should report TASK_ATOMICITY warning
    And warning message should mention file count exceeding limit

  # @feature3
  Scenario: Audit detects FR split inconsistency
    Given .specs/my-feature/ is a complete spec
    And FR.md contains "## FR-4a: Variant A" as a sub-variant
    And FR.md contains "## FR-5: Feature Five" without sub-variants
    And FR-4 and FR-5 have similar complexity
    When audit-spec.ps1 runs on ".specs/my-feature"
    Then audit should report FR_SPLIT_CONSISTENCY info

  # @feature3
  Scenario: Audit detects AC scope mismatch
    Given .specs/my-feature/ is a complete spec
    And FR.md contains "## FR-3: User Login"
    And ACCEPTANCE_CRITERIA.md contains AC-3 covering "login and registration"
    When audit-spec.ps1 runs on ".specs/my-feature"
    Then audit should report AC_SCOPE_MATCH warning for AC-3

  # @feature3
  Scenario: Audit passes clean spec without new issues
    Given .specs/my-feature/ is a complete spec
    And all FR have matching tasks without partial implementation markers
    And all tasks reference 3 or fewer files
    When audit-spec.ps1 runs on ".specs/my-feature"
    Then audit should not report PARTIAL_IMPL errors
    And audit should not report TASK_ATOMICITY warnings

  # --- Layer 3: specs-management Rules --- @feature4

  # @feature4
  Scenario: Rule requires FR decomposition for multi-variant requirements
    Given specs-management.md contains FR Decomposition rule
    When a requirement has multiple implementation approaches
    Then each approach should be documented as FR-Na, FR-Nb sub-variants
    And each sub-variant should have its own AC
    And each sub-variant should have its own BDD scenario
    And each sub-variant should have its own task in TASKS.md

  # @feature4
  Scenario: Rule requires task FR-integrity
    Given specs-management.md contains Task FR-integrity rule
    When a task in TASKS.md references an FR
    Then the task scope should not exceed the FR scope
    And the task should reference at most 3 files

  # @feature4
  Scenario: Rule requires AC scope match
    Given specs-management.md contains AC scope match rule
    When an AC is written for FR-N
    Then AC scope should not introduce entities outside FR-N scope
    And AC should not cover functionality of a different FR
