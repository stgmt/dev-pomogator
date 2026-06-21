Feature: PLUGIN008 Spec Phase Gate Anti-Hallucination
  As a developer using specs-workflow
  I want Claude to be physically blocked from writing future-phase spec files
  So that I can review each phase before the workflow continues

  # --- Layer 1: PreToolUse Hook (phase-gate.ts) ---

  @feature1
  Scenario: PLUGIN008_01 phase-gate hook blocks Write to future phase file
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/FR.md"
    Then the phase-gate hook should exit with code 2
    And the phase-gate hook stdout should contain permissionDecision "deny"
    And the phase-gate hook deny reason should mention "STOP #1" and "Discovery"

  @feature1
  Scenario: PLUGIN008_02 phase-gate hook allows Write to current phase file
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/USER_STORIES.md"
    Then the phase-gate hook should exit with code 0
    And the phase-gate hook stdout should be empty or "{}"

  @feature1
  Scenario: PLUGIN008_03 phase-gate hook allows Write to previous phase file
    Given a spec dir "my-feature" with Discovery and Context confirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/USER_STORIES.md"
    Then the phase-gate hook should exit with code 0

  @feature1
  Scenario: PLUGIN008_04 phase-gate hook allows Write when no progress file exists
    Given a spec dir "no-progress-spec" with no .progress.json in the temp area
    When the phase-gate hook runs for Write to ".specs/no-progress-spec/FR.md"
    Then the phase-gate hook should exit with code 0

  @feature1
  Scenario: PLUGIN008_05 phase-gate hook fail-open on corrupted progress file
    Given a spec dir "my-feature" with invalid JSON in .progress.json in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/FR.md"
    Then the phase-gate hook should exit with code 0
    And the phase-gate hook stdout should be empty or "{}"

  @feature1
  Scenario: PLUGIN008_06 phase-gate hook passes through non-spec file paths
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When the phase-gate hook runs for Write to "src/app.ts"
    Then the phase-gate hook should exit with code 0

  @feature1
  Scenario: PLUGIN008_07 phase-gate hook allows next phase after STOP confirmed
    Given a spec dir "my-feature" with Discovery and Context confirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/FR.md"
    Then the phase-gate hook should exit with code 0

  @feature1
  Scenario: PLUGIN008_08 phase-gate hook blocks Edit to future phase file
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When the phase-gate hook runs for Edit to ".specs/my-feature/TASKS.md"
    Then the phase-gate hook should exit with code 2
    And the phase-gate hook stdout should contain permissionDecision "deny"
    And the phase-gate hook deny reason should mention "STOP #1" and "Discovery"

  @feature1
  Scenario: PLUGIN008_09 phase-gate hook allows .feature file during Requirements phase
    Given a spec dir "my-feature" with Discovery and Context confirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/my-feature.feature"
    Then the phase-gate hook should exit with code 0

  @feature1
  Scenario: PLUGIN008_10 phase-gate hook blocks .feature file during Discovery phase
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When the phase-gate hook runs for Write to ".specs/my-feature/my-feature.feature"
    Then the phase-gate hook should exit with code 2
    And the phase-gate hook stdout should contain permissionDecision "deny"

  @feature1 @manual
  Scenario: PLUGIN008_11 phase-gate hook is registered in settings
    When dev-pomogator installs specs-workflow for Claude
    Then .claude/settings.json should contain PreToolUse hook
    And hook matcher should be "Write|Edit"
    And hook command should reference phase-gate.ts

  # --- Layer 2: UserPromptSubmit Phase Status Injection ---

  @feature2
  Scenario: PLUGIN008_12 validate-specs banner reports unconfirmed STOP count
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When validate-specs runs as a UserPromptSubmit hook with that spec dir
    Then the validate-specs output should contain the specs-validator prefix
    And the validate-specs output should mention unconfirmed STOP count

  @feature2
  Scenario: PLUGIN008_13 validate-specs verbose mode shows spec name and phase
    Given a spec dir "my-feature" with Discovery unconfirmed in the temp area
    When validate-specs runs as a UserPromptSubmit hook with SPECS_VALIDATOR_VERBOSE=1
    Then the validate-specs output should contain "my-feature"
    And the validate-specs output should contain "Discovery"

  @feature2
  Scenario: PLUGIN008_14 validate-specs emits nothing for spec without progress file
    Given a spec dir "old-spec" with no .progress.json in the temp area
    When validate-specs runs as a UserPromptSubmit hook with that spec dir
    Then the validate-specs output should not mention "old-spec"

  # --- Layer 1 pure-function: fileToPhase ---

  @feature1
  Scenario Outline: PLUGIN008_20 fileToPhase maps spec filenames to phases
    When fileToPhase is called with "<filename>"
    Then the result should be <expected>

    Examples:
      | filename                    | expected         |
      | USER_STORIES.md             | "Discovery"      |
      | USE_CASES.md                | "Discovery"      |
      | RESEARCH.md                 | "Discovery"      |
      | FR.md                       | "Requirements"   |
      | NFR.md                      | "Requirements"   |
      | ACCEPTANCE_CRITERIA.md      | "Requirements"   |
      | DESIGN.md                   | "Requirements"   |
      | FILE_CHANGES.md             | "Requirements"   |
      | REQUIREMENTS.md             | "Requirements"   |
      | TASKS.md                    | "Finalization"   |
      | README.md                   | "Finalization"   |
      | CHANGELOG.md                | "Finalization"   |
      | my-feature.feature          | "Requirements"   |
      | CORE001_something.feature   | "Requirements"   |
      | SCHEMA.md                   | null             |
      | random.txt                  | null             |

  # --- Layer 1 pure-function: checkPhaseAllowed ---

  @feature1
  Scenario Outline: PLUGIN008_21 checkPhaseAllowed enforces phase gate
    Given a progress state with phases: "<phases_confirmed>"
    When checkPhaseAllowed is called for file "<filename>" in spec "my-spec"
    Then the gate result should be "<expect_deny>"

    Examples:
      | phases_confirmed                  | filename               | expect_deny |
      | none                              | FR.md                  | deny        |
      | none                              | USER_STORIES.md        | allow       |
      | none                              | TASKS.md               | deny        |
      | Discovery                         | TASKS.md               | deny        |
      | Discovery+Context+Requirements    | TASKS.md               | allow       |
      | Discovery+Context                 | FR.md                  | allow       |
      | none                              | SCHEMA.md              | allow       |
      | none                              | my-feature.feature     | deny        |
      | Discovery                         | my-feature.feature     | allow       |
      | none                              | USER_STORIES.md        | allow       |
      | Discovery+Context                 | USER_STORIES.md        | allow       |

  # --- Layer 1 pure-function: readProgressState ---

  @feature1
  Scenario Outline: PLUGIN008_22 readProgressState reads .progress.json variants
    Given a .progress.json file in tempDir with content "<content_type>"
    When readProgressState is called on that path
    Then the read result should be "<expected>"

    Examples:
      | content_type   | expected    |
      | valid_utf8_bom | parsed      |
      | valid_no_bom   | parsed      |
      | missing        | null        |
      | invalid_json   | null        |
      | empty          | null        |
