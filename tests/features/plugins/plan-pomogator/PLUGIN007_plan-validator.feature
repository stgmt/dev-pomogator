Feature: PLUGIN007 plan-validator — core validation engine

  Background:
    Given the plan-validator environment is configured

  # ---------------------------------------------------------------------------
  # Phase 1 — required sections
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_04_01 valid plan from fixture passes flat validation with zero errors
    Given a plan-validator plan from the valid fixture
    When the plan-validator runs flat validation
    Then the plan-validator flat validation returns no errors

  @feature4
  Scenario: PLUGIN007_04_02 validatePlanPhased phases 1-3 all clean for valid fixture
    Given a plan-validator plan from the valid fixture
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has no errors
    And the plan-validator phase 2 has no errors
    And the plan-validator phase 3 has no errors

  @feature2
  Scenario Outline: PLUGIN007_05 phase 1 detects each missing required section
    Given a plan-validator plan missing the "<section>" section
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "<section>"

    Examples:
      | section             |
      | Простыми словами    |
      | Context             |
      | User Stories        |
      | Use Cases           |
      | Requirements        |
      | Implementation Plan |
      | Todos               |
      | Definition of Done  |
      | File Changes        |

  @feature2
  Scenario: PLUGIN007_44_01 phase 1 detects missing Простыми словами section with correct error
    Given a plan-validator plan missing the "Простыми словами" section
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "Простыми словами"

  @feature2
  Scenario: PLUGIN007_44_02 phase 1 error for missing section has non-empty hint
    Given a plan-validator plan missing the "Context" section
    When the plan-validator runs flat validation
    Then the plan-validator flat validation returns at least one error
    And every plan-validator flat validation error has a non-empty hint

  @feature3
  Scenario: PLUGIN007_44_03 phase 1 detects empty Простыми словами section
    Given a plan-validator plan with the "Простыми словами" section emptied
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "Простыми словами"

  @feature2
  Scenario: PLUGIN007_06_01 phase 1 section order is enforced — File Changes must be last
    Given a plan-validator plan with sections "Context" and "File Changes" swapped
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  # ---------------------------------------------------------------------------
  # Phase 2 — Requirements subsections and Extracted Requirements
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_07_01 phase 2 detects missing Extracted Requirements subsection
    Given a plan-validator plan with the Extracted Requirements subsection missing
    When the plan-validator runs phased validation
    Then the plan-validator phase 2 has an error containing "Extracted Requirements"

  @feature2
  Scenario: PLUGIN007_07_02 phase 2 detects only one Extracted Requirement (needs at least two)
    Given a plan-validator plan with Extracted Requirements having 1 item only
    When the plan-validator runs phased validation
    Then the plan-validator phase 2 has at least one error

  @feature2
  Scenario: PLUGIN007_07_03 phase 2 clean when Extracted Requirements has two items
    Given a plan-validator plan from the valid fixture
    When the plan-validator runs phased validation
    Then the plan-validator phase 2 has no errors

  @feature2
  Scenario: PLUGIN007_08_01 phase 1 detects missing FR subsection under Requirements
    Given a plan-validator plan missing the "FR (Functional Requirements)" subsection
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "FR"

  @feature2
  Scenario: PLUGIN007_08_02 phase 1 detects missing NFR Performance category
    Given a plan-validator plan with the NFR Performance category removed
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  # ---------------------------------------------------------------------------
  # Phase 1 — Todos, DoD, File Changes (validateTodos / validateVerificationPlan / validateFileChanges)
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_09_01 phase 1 detects empty Todos section
    Given a plan-validator plan with the Todos section empty
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_09_02 phase 1 detects Todos without blockquote description
    Given a plan-validator plan with blockquotes removed from Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_09_03 phase 1 detects Todos missing files: field
    Given a plan-validator plan with "files" removed from Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_09_04 phase 1 detects Todos missing refs: field
    Given a plan-validator plan with "refs" removed from Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_10_01 phase 1 detects missing Verification Plan subsection
    Given a plan-validator plan without a "Verification Plan" subsection under Definition of Done
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_10_02 phase 1 detects Verification Plan with no backtick command
    Given a plan-validator plan with Verification Plan having no backtick command
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  @feature2
  Scenario: PLUGIN007_11_01 phase 1 detects empty File Changes table
    Given a plan-validator plan with the "File Changes" section emptied
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error

  # ---------------------------------------------------------------------------
  # Phase 4 — actionability warnings (only runs when 1-3 clean)
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_12_01 phase 4 warns when changes: bullets are too short
    Given a plan-validator plan with changes: bullets that are too short
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "changes"

  @feature2
  Scenario: PLUGIN007_12_02 phase 4 warns when changes: bullet contains generic phrase
    Given a plan-validator plan with changes: bullets containing a generic phrase
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "generic"

  @feature2
  Scenario: PLUGIN007_12_03 phase 4 warns when Implementation Plan step is too short
    Given a plan-validator plan with Implementation Plan steps that are too short
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "Implementation"

  @feature2
  Scenario: PLUGIN007_12_04 phase 4 warns when File Changes Reason is too short
    Given a plan-validator plan with File Changes Reason that is too short
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "Reason"

  @feature2
  Scenario: PLUGIN007_12_05 phase 4 clean when changes: field is properly populated
    Given a plan-validator plan with a proper changes: field in Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has no errors

  @feature2
  Scenario: PLUGIN007_13_01 phase 4 only runs when phases 1-3 are all clean
    Given a plan-validator plan missing the "Context" section
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has at least one error
    And the plan-validator phase 4 has no errors

  # ---------------------------------------------------------------------------
  # Evidence enforcement (validateEvidence — Phase 4)
  # ---------------------------------------------------------------------------

  @feature1
  Scenario: PLUGIN007_14_01 phase 4 warns when Источники section is absent
    Given a plan-validator plan without an Источники section
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "Источники"

  @feature1
  Scenario: PLUGIN007_14_02 phase 4 warns when Источники section has no proof markers
    Given a plan-validator plan with an Источники section but no proof markers
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "Источники"

  @feature1
  Scenario: PLUGIN007_14_03 phase 4 warns when claim in Implementation Plan has no proof marker
    Given a plan-validator plan with a claim in Implementation Plan without a proof marker
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has a warning containing "пруф"

  @feature1
  Scenario: PLUGIN007_14_04 phase 4 clean when claim has a proof marker
    Given a plan-validator plan with a claim in Implementation Plan with a proof marker
    When the plan-validator runs phased validation
    Then the plan-validator phase 4 has no errors

  # ---------------------------------------------------------------------------
  # plan-gate helpers — resolvePlanFile
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_15_01 resolvePlanFile returns path when file exists
    Given a plan-validator file path pointing to an existing file
    Then the plan-validator resolve result is a non-null string

  @feature4
  Scenario: PLUGIN007_15_02 resolvePlanFile returns null when planFilePath missing from input
    Given a plan-validator file path that is missing from tool_input
    Then the plan-validator resolve result is null

  @feature4
  Scenario: PLUGIN007_15_03 resolvePlanFile returns null when file does not exist on disk
    Given a plan-validator file path pointing to a non-existent file
    Then the plan-validator resolve result is null

  # ---------------------------------------------------------------------------
  # plan-gate helpers — readTemplateContent
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_16_01 readTemplateContent returns non-empty when template exists in cwd
    Given a plan-validator cwd with a template.md present
    Then the plan-validator template result contains "plan-pomogator"

  @feature4
  Scenario: PLUGIN007_16_02 readTemplateContent returns empty string when template absent
    Given a plan-validator cwd without a template.md
    Then the plan-validator template result is empty

  @feature4
  Scenario: PLUGIN007_16_03 readTemplateContent returns empty string when cwd is undefined
    Given a plan-validator cwd that is undefined
    Then the plan-validator template result is empty

  # ---------------------------------------------------------------------------
  # plan-gate helpers — checkDuplicatePlan
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_17_01 checkDuplicatePlan detects duplicate plan by content hash
    Given a plan-validator duplicate plan in the same directory
    Then the plan-validator duplicate check finds a match

  @feature4
  Scenario: PLUGIN007_17_02 checkDuplicatePlan returns null when no duplicate exists
    Given a plan-validator unique plan in the directory
    Then the plan-validator duplicate check finds no match

  # ---------------------------------------------------------------------------
  # plan-gate helpers — scorePromptRelevance
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_18_01 scorePromptRelevance returns -20 for wholly mismatched prompts
    Given a plan-validator relevance score for mismatched plan and prompts
    Then the plan-validator relevance score is at most -20

  @feature4
  Scenario: PLUGIN007_18_02 scorePromptRelevance returns above -20 for matched prompts
    Given a plan-validator relevance score for matched plan and prompts
    Then the plan-validator relevance score is greater than -20

  @feature4
  Scenario: PLUGIN007_18_03 scorePromptRelevance is not fooled by a pasted large block
    Given a plan-validator relevance score for a plan with a pasted large block and matched prompts
    Then the plan-validator relevance score is greater than -20

  # ---------------------------------------------------------------------------
  # plan-gate helpers — selectRelevanceWindow
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_19_01 selectRelevanceWindow includes substantive prompts after short tail
    Given a plan-validator window selection for a list of prompts with short tail
    Then the plan-validator window includes the first substantive prompt

  @feature4
  Scenario: PLUGIN007_19_02 selectRelevanceWindow preserves chronological order
    Given a plan-validator window selection preserving chronological order
    Then the plan-validator window is in chronological order

  # ---------------------------------------------------------------------------
  # prompt-capture CLI (spawn)
  # ---------------------------------------------------------------------------

  @feature1
  Scenario: PLUGIN007_43_01 prompt-capture writes session-specific file when session_id provided
    Given the plan-validator uses session_id "test-session-pilot" and prompt "тестовый промпт для пилота"
    When the plan-validator runs prompt-capture
    Then the plan-validator prompt-capture exits with code 0
    And the plan-validator session file for "test-session-pilot" exists with at least one prompt entry

  @feature1
  Scenario: PLUGIN007_43_02 prompt-capture exits 0 without writing when prompt is empty
    Given the plan-validator uses session_id "test-session-empty" and prompt ""
    When the plan-validator runs prompt-capture
    Then the plan-validator prompt-capture exits with code 0
    And no plan-validator session files exist in the temp home

  @feature1
  Scenario: PLUGIN007_43_03 prompt-capture filters out task-notification entries
    Given the plan-validator uses session_id "test-session-notif" and prompt "<task-notification>done</task-notification>"
    When the plan-validator runs prompt-capture
    Then the plan-validator prompt-capture exits with code 0
    And no plan-validator session files exist in the temp home

  # ---------------------------------------------------------------------------
  # formatPromptsFromFile / loadUserPrompts helpers
  # ---------------------------------------------------------------------------

  @feature1
  Scenario: PLUGIN007_20_01 formatPromptsFromFile filters task-notification entries
    Given a plan-validator prompt file with mixed real and task-notification entries
    Then formatPromptsFromFile filters out task-notification entries for the plan-validator

  @feature1
  Scenario: PLUGIN007_20_02 formatPromptsFromFile returns null when only notifications present
    Given a plan-validator prompt file with only task-notification entries
    Then formatPromptsFromFile returns null for a plan-validator file with only notifications

  @feature1
  Scenario: PLUGIN007_20_03 loadUserPrompts returns empty for an unknown session
    Then loadUserPrompts returns empty for an unknown session in the plan-validator

  # ---------------------------------------------------------------------------
  # validate-plan.ts CLI (spawn)
  # ---------------------------------------------------------------------------

  @feature4
  Scenario: PLUGIN007_22_01 validate-plan CLI exits 0 for a valid plan file
    Given a plan-validator plan from the valid fixture
    When the plan-validator runs via CLI on the plan file
    Then the plan-validator CLI exits with code 0

  @feature2
  Scenario: PLUGIN007_22_02 validate-plan CLI exits non-zero for a plan with missing sections
    Given a plan-validator plan missing the "Context" section
    When the plan-validator runs via CLI on the plan file
    Then the plan-validator CLI exits with a non-zero code

  # ---------------------------------------------------------------------------
  # Phase 1 — Requirements subsections (AC, NFR, Assumptions)
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_45_01 phase 1 detects missing Acceptance Criteria subsection
    Given a plan-validator plan missing the "Acceptance Criteria (EARS)" subsection
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "Acceptance Criteria"

  @feature2
  Scenario: PLUGIN007_45_02 phase 1 detects missing NFR subsection
    Given a plan-validator plan missing the "NFR (Non-Functional Requirements)" subsection
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "NFR"

  @feature2
  Scenario: PLUGIN007_45_03 phase 1 detects missing Assumptions subsection
    Given a plan-validator plan missing the "Assumptions" subsection
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "Assumptions"

  # ---------------------------------------------------------------------------
  # Phase 1 — Todos missing changes: and deps: fields
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_46_01 phase 1 detects Todos missing changes: field
    Given a plan-validator plan with "changes" removed from Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "changes"

  @feature2
  Scenario: PLUGIN007_46_02 phase 1 detects Todos missing deps: field
    Given a plan-validator plan with "deps" removed from Todos
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "deps"

  # ---------------------------------------------------------------------------
  # Phase 1 — File Changes path and action validation
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_47_01 flat validation detects absolute Windows path in File Changes
    Given a plan-validator plan with File Changes containing "| `C:\Users\test\file.ts` | create | Test absolute path |"
    When the plan-validator runs flat validation
    Then the plan-validator flat validation returns an error containing "Абсолютный путь"

  @feature2
  Scenario: PLUGIN007_47_02 flat validation detects invalid action in File Changes
    Given a plan-validator plan with File Changes containing "| `src/old.ts` | destroy | Remove file |"
    When the plan-validator runs flat validation
    Then the plan-validator flat validation returns an error containing "Недопустимый Action"

  # ---------------------------------------------------------------------------
  # Phase 1 — Section order: extra trailing section and swapped sections
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_48_01 phase 1 detects extra section appended after File Changes
    Given a plan-validator plan with an extra section appended after File Changes
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "File Changes должна быть последней"

  @feature2
  Scenario: PLUGIN007_48_02 phase 1 detects User Stories and Use Cases sections swapped
    Given a plan-validator plan with sections "User Stories" and "Use Cases" swapped
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "не в требуемом порядке"

  # ---------------------------------------------------------------------------
  # Phase 1 — Impact Analysis: missing and N/A
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_49_01 phase 1 detects destructive action without Impact Analysis
    Given a plan-validator plan with a destructive action in File Changes without Impact Analysis
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "Impact Analysis"

  @feature2
  Scenario: PLUGIN007_49_02 phase 1 detects N/A Impact Analysis with destructive action
    Given a plan-validator plan with a destructive action and Impact Analysis set to "N/A - no deletions to analyze"
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "N/A"

  # ---------------------------------------------------------------------------
  # Phase 1 — Fenced code block in File Changes and Requirements subsection order
  # ---------------------------------------------------------------------------

  @feature2
  Scenario: PLUGIN007_50_01 phase 1 detects fenced code block inside File Changes section
    Given a plan-validator plan with a fenced code block containing a File Changes table
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "fenced code-block"

  @feature2
  Scenario: PLUGIN007_50_02 phase 1 detects Requirements subsections in wrong order
    Given a plan-validator plan with Requirements subsections in wrong order
    When the plan-validator runs phased validation
    Then the plan-validator phase 1 has an error containing "порядок подразделов"

  # ---------------------------------------------------------------------------
  # Artifact: proactive-investigation rule structure (PLUGIN007_36)
  # ---------------------------------------------------------------------------

  @feature36
  Scenario: PLUGIN007_51 proactive-investigation rule is present with correct content
    When the plan-validator checks the proactive-investigation rule
    Then the plan-validator rule is non-empty and under 80 lines
    And the plan-validator rule contains "Proactive Investigation"
    And the plan-validator rule contains banned phrases and evidence format

  # ---------------------------------------------------------------------------
  # Artifact: plugin hooks registry has plan-gate PreToolUse hook (PLUGIN007_42)
  # ---------------------------------------------------------------------------

  @feature42
  Scenario: PLUGIN007_52_01 plugin registry has plan-gate PreToolUse hook registered
    When the plan-validator checks the plugin hook registry
    Then the plan-validator plugin registry has a plan-gate PreToolUse hook

  # ---------------------------------------------------------------------------
  # Spec-Test Sync warnings (PLUGIN015)
  # ---------------------------------------------------------------------------

  @feature1
  Scenario: PLUGIN015_01 phased validation warns when tests in File Changes have no paired spec
    Given a plan-validator plan with tests in File Changes but no specs
    When the plan-validator runs phased validation
    Then the plan-validator phased validation warns about tests without specs

  @feature1
  Scenario: PLUGIN015_02 flat validation has no warning when tests and specs both present
    Given a plan-validator plan with both tests and specs in File Changes
    When the plan-validator runs flat validation
    Then the plan-validator flat validation has no spec-test-sync warning

  @feature1
  Scenario: PLUGIN015_03 flat validation has no warning when no test files in File Changes
    Given a plan-validator plan with no test files in File Changes
    When the plan-validator runs flat validation
    Then the plan-validator flat validation has no spec-test-sync warning

  @feature1
  Scenario: PLUGIN015_04 phased validation warns when bugfix Reason has no BDD feature file
    Given a plan-validator plan with a bugfix Reason but no BDD feature file
    When the plan-validator runs phased validation
    Then the plan-validator phased validation warns about a bugfix without a BDD feature

  @feature1
  Scenario: PLUGIN015_05 flat validation has no warning when bugfix has paired BDD feature
    Given a plan-validator plan with a bugfix Reason and a BDD feature file
    When the plan-validator runs flat validation
    Then the plan-validator flat validation has no spec-test-sync warning

  # ---------------------------------------------------------------------------
  # Artifact: spec-test-sync rule is installed (PLUGIN015_09)
  # ---------------------------------------------------------------------------

  @feature1
  Scenario: PLUGIN015_09 spec-test-sync rule is installed with correct content
    When the plan-validator checks the spec-test-sync rule
    Then the plan-validator rule contains "File Changes"
    And the plan-validator spec-test-sync rule contains key terms
