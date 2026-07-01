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

  # --- Layer 3: Spec Quality Audit (audit-checks.ts) — FR-8..FR-11 ---

  @feature3
  Scenario Outline: PLUGIN008_23 partial-impl audit flags a done task whose FR carries a not-implemented marker
    Given a spec where a done task's FR carries the not-implemented marker `<marker>`
    When the partial-implementation audit runs
    Then the partial-implementation audit reports exactly one ERROR mentioning the FR

    Examples:
      | marker                |
      | **НЕ РЕАЛИЗОВАНО**     |
      | NOT IMPLEMENTED yet    |
      | This is deferred now   |

  @feature3
  Scenario: PLUGIN008_24 partial-impl audit ignores an OPEN task even with a marker
    Given a spec where an OPEN task's FR carries a not-implemented marker
    When the partial-implementation audit runs
    Then the partial-implementation audit reports nothing

  @feature3
  Scenario: PLUGIN008_25 partial-impl audit ignores a done task whose FR is implemented
    Given a spec where a done task's FR is fully implemented
    When the partial-implementation audit runs
    Then the partial-implementation audit reports nothing

  @feature3
  Scenario: PLUGIN008_26 partial-impl audit is silent when FR.md is missing
    Given a spec with a TASKS.md but no FR.md
    When the partial-implementation audit runs
    Then the partial-implementation audit reports nothing

  @feature3
  Scenario Outline: PLUGIN008_27 partial-impl audit ignores a marker that is not a live prose claim
    Given a spec where a done task's FR mentions the audit marker `<marker>` only as a <mode>
    When the partial-implementation audit runs
    Then the partial-implementation audit reports nothing

    Examples:
      | marker          | mode              |
      | PARTIAL         | larger word       |
      | НЕ РЕАЛИЗОВАНО   | fenced code block |
      | NOT IMPLEMENTED | inline code span  |

  @feature3
  Scenario Outline: PLUGIN008_28 partial-impl marker contract — word-bounded fires, substring + code-fenced do not
    When the partial-implementation audit runs over marker `<marker>` placed as `<placement>`
    Then the partial-implementation audit finds exactly <count>

    Examples:
      | marker             | placement   | count |
      | НЕ РЕАЛИЗОВАНО | standalone  | 1     |
      | НЕ РЕАЛИЗОВАНО | larger-word | 0     |
      | НЕ РЕАЛИЗОВАНО | code-fenced | 0     |
      | NOT IMPLEMENTED | standalone  | 1     |
      | NOT IMPLEMENTED | larger-word | 0     |
      | NOT IMPLEMENTED | code-fenced | 0     |
      | PARTIAL | standalone  | 1     |
      | PARTIAL | larger-word | 0     |
      | PARTIAL | code-fenced | 0     |
      | TODO: implement | standalone  | 1     |
      | TODO: implement | larger-word | 0     |
      | TODO: implement | code-fenced | 0     |
      | deferred | standalone  | 1     |
      | deferred | larger-word | 0     |
      | deferred | code-fenced | 0     |
      | будущее улучшение | standalone  | 1     |
      | будущее улучшение | larger-word | 0     |
      | будущее улучшение | code-fenced | 0     |

  @feature3
  Scenario: PLUGIN008_29 task-atomicity audit warns when one task references multiple FRs
    Given a spec where a task references multiple FRs
    When the task-atomicity audit runs
    Then the task-atomicity audit reports one WARNING naming the extra FR `FR-5`

  @feature3
  Scenario: PLUGIN008_30 task-atomicity audit allows a single-FR task
    Given a spec where a task references a single FR
    When the task-atomicity audit runs
    Then the task-atomicity audit reports nothing

  @feature3
  Scenario: PLUGIN008_31 task-atomicity audit allows a task referencing no FR
    Given a spec where a task references no FR
    When the task-atomicity audit runs
    Then the task-atomicity audit reports nothing

  @feature3
  Scenario: PLUGIN008_32 task-atomicity audit treats a sub-variant as a distinct FR
    Given a spec where a task references an FR and its sub-variant
    When the task-atomicity audit runs
    Then the task-atomicity audit reports one WARNING naming the extra FR `FR-4a`

  @feature3
  Scenario: PLUGIN008_33 FR-split audit flags an adjacent FR that lacks sub-variants
    Given a spec where one FR has a sub-variant but an adjacent FR does not
    When the FR-split-consistency audit runs
    Then the FR-split-consistency audit reports an INFO naming the un-split FR `FR-5`

  @feature3
  Scenario: PLUGIN008_34 FR-split audit is silent when no FR has sub-variants
    Given a spec where no FR has sub-variants
    When the FR-split-consistency audit runs
    Then the FR-split-consistency audit reports nothing

  @feature3
  Scenario: PLUGIN008_35 FR-split audit is silent when both adjacent FRs have sub-variants
    Given a spec where both adjacent FRs have sub-variants
    When the FR-split-consistency audit runs
    Then the FR-split-consistency audit reports nothing

  @feature3
  Scenario: PLUGIN008_36 BDD-scope audit flags an FR term the scenario does not cover
    Given a spec whose FR mentions serial but whose only scenario covers batch
    When the BDD-scenario-scope audit runs
    Then the BDD-scenario-scope audit reports a gap mentioning the uncovered term

  @feature3
  Scenario: PLUGIN008_37 BDD-scope audit is silent when the scenario covers every FR term
    Given a spec whose scenario covers every term its FR mentions
    When the BDD-scenario-scope audit runs
    Then the BDD-scenario-scope audit reports nothing

  @feature3
  Scenario: PLUGIN008_38 BDD-scope audit is silent when there is no .feature file
    Given a spec with an FR but no .feature file
    When the BDD-scenario-scope audit runs
    Then the BDD-scenario-scope audit reports nothing

  @feature3
  Scenario: PLUGIN008_39 the combined audit returns findings from multiple checks at once
    Given a spec with both a partial-impl marker and a multi-FR task
    When the combined audit runs all checks
    Then the combined audit returns at least two findings

  @feature3
  Scenario: PLUGIN008_40 the combined audit returns nothing for a clean spec
    Given a clean spec with a done task and an implemented FR
    When the combined audit runs all checks
    Then the combined audit returns nothing

  @feature3
  Scenario: PLUGIN008_41 the real audit-spec CLI runs and emits output on an FR-without-AC spec
    Given a real temp spec dir under .specs with an FR but an empty ACCEPTANCE_CRITERIA
    When the real audit-spec CLI runs over the `audit-cli-demo` spec in json format
    Then the audit-spec CLI exits 0 and emits output

  @feature3
  Scenario: PLUGIN008_42 the real audit-spec CLI runs without crashing on a clean spec
    Given a real temp spec dir under .specs with a clean FR and matching AC
    When the real audit-spec CLI runs over the `audit-cli-clean` spec in text format
    Then the audit-spec CLI exits 0 without crashing
