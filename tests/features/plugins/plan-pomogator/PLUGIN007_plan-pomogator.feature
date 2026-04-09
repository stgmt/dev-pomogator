Feature: PLUGIN007 Plan-pomogator Extension
  As a developer using Cursor or Claude Code
  I want plan-pomogator rules and tools
  So that I can generate and validate plans consistently

  Background:
    Given dev-pomogator is installed
    And plan-pomogator extension is enabled

  Scenario: Rules are installed for Cursor
    When dev-pomogator installs plan-pomogator for Cursor
    Then plan-pomogator.mdc should exist in PROJECT/.cursor/rules/

  Scenario: Rules are installed for Claude
    When dev-pomogator installs plan-pomogator for Claude
    Then plan-pomogator.md should exist in PROJECT/.claude/rules/

  Scenario: Tools are installed
    When dev-pomogator installs plan-pomogator
    Then plan-pomogator folder should exist in PROJECT/.dev-pomogator/tools/
    And requirements.md should exist
    And template.md should exist
    And validate-plan.ts should exist

  # @feature4
  Scenario: PLUGIN007_04 Validator passes valid plan
    Given a valid plan file with all required sections
    When validate-plan runs on the file
    Then validation returns zero errors

  # @feature5
  Scenario: PLUGIN007_05 Validator detects missing section
    Given a plan file missing the "User Stories" section
    When validate-plan runs on the file
    Then validation returns error "Отсутствует секция: User Stories"

  # @feature6
  Scenario: PLUGIN007_06 Validator detects missing Requirements subsection
    Given a plan file missing the "FR (Functional Requirements)" subsection
    When validate-plan runs on the file
    Then validation returns error "В Requirements отсутствует подраздел: FR"

  # @feature7
  Scenario: PLUGIN007_07 Validator detects empty Todos
    Given a plan file with empty Todos section
    When validate-plan runs on the file
    Then validation returns error "Секция Todos не содержит ни одной задачи"

  # @feature8
  Scenario: PLUGIN007_08 Validator detects missing Automated Tests command
    Given a plan file with Automated Tests but no backtick command
    When validate-plan runs on the file
    Then validation returns error "Automated Tests должны содержать хотя бы одну команду в backticks"

  # @feature4
  Scenario: PLUGIN007_09 Validator detects empty File Changes table
    Given a plan file with File Changes header but no data rows
    When validate-plan runs on the file
    Then validation returns error about empty File Changes

  # @feature4
  Scenario: PLUGIN007_10 Validator detects wrong section order
    Given a plan file with Use Cases before User Stories
    When validate-plan runs on the file
    Then validation returns error about section ordering

  # @feature4
  Scenario: PLUGIN007_11 Extension manifest has plan-pomogator tools
    Given plan-pomogator extension is installed
    Then extension.json should have tools.plan-pomogator defined

  # @feature14
  Scenario: PLUGIN007_14 Validator detects missing Context section
    Given a plan file missing the "Context" section
    When validate-plan runs on the file
    Then validation returns error "Отсутствует секция: Context"

  # @feature15
  Scenario: PLUGIN007_15 Phase 2 gating - no Phase 2 errors during Phase 1
    Given a plan file with Phase 1 structural errors
    When validate-plan runs phased validation
    Then Phase 1 has errors and Phase 2 is empty

  # @feature15
  Scenario: PLUGIN007_15 Phase 2 detects missing Extracted Requirements
    Given a plan file passing Phase 1 but without Extracted Requirements
    When validate-plan runs phased validation
    Then Phase 2 returns error about missing Extracted Requirements
    And Phase 2 hint contains "Перечитай ВСЕ сообщения пользователя"

  # @feature16
  Scenario: PLUGIN007_16 Phase 2 validates minimum requirement count
    Given a plan file with only 1 item in Extracted Requirements
    When validate-plan runs phased validation
    Then Phase 2 returns error about minimum 2 items

  # @feature17
  Scenario: PLUGIN007_17 resolvePlanFile returns planFilePath when file exists
    Given tool_input contains planFilePath pointing to an existing file
    When resolvePlanFile processes the tool_input
    Then it returns the exact planFilePath value

  Scenario: PLUGIN007_17_02 resolvePlanFile returns null when planFilePath is missing
    Given tool_input without planFilePath field
    When resolvePlanFile processes the tool_input
    Then it returns null

  Scenario: PLUGIN007_17_03 resolvePlanFile returns null for non-existent file
    Given tool_input with planFilePath pointing to a non-existent file
    When resolvePlanFile processes the tool_input
    Then it returns null

  Scenario: PLUGIN007_17_04 resolvePlanFile handles Windows backslash paths
    Given tool_input with planFilePath using Windows backslash separators
    When resolvePlanFile processes the tool_input
    Then it returns the path as-is

  # @feature1
  Scenario: PLUGIN007_20 Rule contains pre-flight checklist
    Given plan-pomogator.md rule is loaded
    When the agent reads the rule content
    Then the rule should contain "Pre-flight Checklist"
    And the checklist should mention "Extracted Requirements"
    And the checklist should mention "Verification Plan"
    And the checklist should mention "replace" in destructive actions

  # @feature4
  Scenario: PLUGIN007_21 Rule documents Phase 2 validation
    Given plan-pomogator.md rule is loaded
    When the agent reads the rule content
    Then the rule should contain "Phase 2"
    And the rule should mention "Extracted Requirements" minimum 2 items

  # @feature2
  Scenario: PLUGIN007_22 Deny message includes template on Phase 1 failure
    Given a plan file missing the "User Stories" section
    And template.md exists in the project
    When plan-gate denies ExitPlanMode
    Then deny message should contain "Отсутствует секция: User Stories"
    And deny message should contain "Шаблон правильного формата:"
    And deny message should contain "## Context"
    And deny message should contain "## File Changes"

  # @feature2
  Scenario: PLUGIN007_23 Deny message works without template (fail-open)
    Given a plan file missing the "User Stories" section
    And template.md does not exist in the project
    When plan-gate denies ExitPlanMode
    Then deny message should contain "Отсутствует секция: User Stories"
    And deny message should not contain "Шаблон правильного формата:"

  # @feature2
  Scenario: PLUGIN007_23b Deny message works when cwd is undefined (fail-open)
    Given plan-gate receives no cwd in hook data
    When readTemplateContent is called with undefined
    Then it should return empty string

  # @feature1
  Scenario: PLUGIN007_24 Rule contains active instruction to read template
    Given plan-pomogator.md rule is loaded
    When the agent reads the rule content
    Then the rule should contain "Перед написанием плана"
    And the rule should contain ".dev-pomogator/tools/plan-pomogator/template.md"

  # @feature1
  Scenario: PLUGIN007_25 Rule lists replace as destructive action
    Given plan-pomogator.md rule is loaded
    When the agent reads the Impact Analysis section
    Then the destructive actions list should contain "delete/rename/move/replace"

  # @feature2 @feature4
  Scenario: PLUGIN007_26 Deny message includes template on Phase 2 failure
    Given a plan file passing Phase 1 but without Extracted Requirements
    And template.md exists in the project
    When plan-gate denies ExitPlanMode
    Then deny message should contain "Extracted Requirements"
    And deny message should contain "Шаблон правильного формата:"

  # @feature5
  Scenario: PLUGIN007_27 Phase 0 detects duplicate plan
    Given a plan file with valid content
    And another plan file in ~/.claude/plans/ with identical content
    When checkDuplicatePlan runs on the plan
    Then it should return the duplicate filename

  # @feature5
  Scenario: PLUGIN007_28 Phase 0 allows unique plan
    Given a plan file with valid content
    And no other plan file has the same content
    When checkDuplicatePlan runs on the plan
    Then it should return null

  # @feature6
  Scenario: PLUGIN007_29 Phase 2.5 blocks low prompt relevance
    Given a plan with Extracted Requirements about "docker optimization"
    And user prompts are about "plan-gate anti-copy protection"
    When scorePromptRelevance runs
    Then the score should be <= -20

  # @feature6
  Scenario: PLUGIN007_30 Phase 2.5 allows matching prompt relevance
    Given a plan with Extracted Requirements about "anti-copy protection"
    And user prompts are about "plan-gate anti-copy protection"
    When scorePromptRelevance runs
    Then the score should be > -20

  # @feature31
  Scenario: PLUGIN007_31 Validator detects missing changes: field in todo
    Given a plan file with todo block missing "changes:" field
    When validate-plan runs on the file
    Then validation returns Phase 1 error about missing changes:

  # @feature32
  Scenario: PLUGIN007_32 Phase 4 warns on short changes: bullet
    Given a plan file passing Phase 1-3 with short changes: bullet
    When validate-plan runs phased validation
    Then Phase 4 returns warning about brief changes bullet

  # @feature32
  Scenario: PLUGIN007_33 Phase 4 warns on generic Implementation Plan step
    Given a plan file passing Phase 1-3 with generic Implementation Plan step
    When validate-plan runs phased validation
    Then Phase 4 returns warning about generic phrase

  # @feature32
  Scenario: PLUGIN007_34 Phase 4 warns on short File Changes Reason
    Given a plan file passing Phase 1-3 with short File Changes Reason
    When validate-plan runs phased validation
    Then Phase 4 returns warning about brief Reason

  # @feature32
  Scenario: PLUGIN007_35 Phase 4 only runs after Phase 1-3 pass
    Given a plan file with Phase 1 structural errors
    When validate-plan runs phased validation
    Then Phase 4 is empty

  # @feature36 proactive-investigation rule
  Scenario: PLUGIN007_36 Proactive-investigation rule exists in source of truth
    Given plan-pomogator extension source is at extensions/plan-pomogator/
    When I check claude/rules/ directory
    Then proactive-investigation.md should exist

  # @feature36
  Scenario: PLUGIN007_37 Proactive-investigation rule contains banned phrases
    Given proactive-investigation.md rule is loaded
    When the agent reads the rule content
    Then it should contain "ЗАПРЕЩЕНО"
    And it should contain "Посмотреть?"
    And it should contain "Проверить?"

  # @feature36
  Scenario: PLUGIN007_38 Proactive-investigation rule contains evidence format
    Given proactive-investigation.md rule is loaded
    When the agent reads the rule content
    Then it should contain "Evidence формат"
    And it should contain "grep"
    And it should contain "UNVERIFIED"

  # @feature36
  Scenario: PLUGIN007_39 Extension manifest includes proactive-investigation rule
    Given plan-pomogator extension.json is loaded
    When I check the claude rules array
    Then it should contain "proactive-investigation"

  # @feature42
  Scenario: PLUGIN007_42 Extension manifest hooks structure is correct
    Given plan-pomogator extension.json is loaded
    When I check the claude hooks
    Then PreToolUse hook for ExitPlanMode should exist
    And UserPromptSubmit hook for prompt-capture should exist
    And PostToolUse hook should not exist (mark-plan-session removed)

  # @feature43 — prompt-capture session isolation (FR-1, AC-1)
  # Spec: .specs/plan-pomogator-prompt-isolation/
  Scenario: PLUGIN007_43_01 prompt-capture writes to session-specific file
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains session_id "abc-123" and prompt "real user message"
    When the script processes the input
    Then file ".plan-prompts-abc-123.json" should exist in HOME/.dev-pomogator/
    And the file should contain entry with text "real user message"
    And file ".plan-prompts-default.json" should not exist

  # @feature43 — prompt-capture no-default fallback (FR-2, AC-2)
  Scenario: PLUGIN007_43_02 prompt-capture writes nothing when session_id missing
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains prompt "orphan message" without session_id field
    When the script processes the input
    Then the script should exit with code 0
    And no .plan-prompts-* file should be created in HOME/.dev-pomogator/
    And specifically ".plan-prompts-default.json" should not exist

  # @feature43 — prompt-capture task-notification filter (FR-3, AC-3)
  Scenario: PLUGIN007_43_03 prompt-capture filters task-notification pseudo-prompts
    Given prompt-capture.ts is invoked via UserPromptSubmit hook
    And hook input contains session_id "sess-x" and prompt starting with "<task-notification>"
    When the script processes the input
    Then the script should exit with code 0
    And file ".plan-prompts-sess-x.json" should not contain the task-notification entry

  # @feature43 — plan-gate no most-recent fallback (FR-4, AC-4)
  Scenario: PLUGIN007_43_04 plan-gate loadUserPrompts returns empty for unknown session
    Given another file ".plan-prompts-other.json" exists in HOME/.dev-pomogator/ with valid prompts
    And no file ".plan-prompts-unknown.json" exists in HOME/.dev-pomogator/
    When loadUserPrompts is called with sessionId "unknown"
    Then the function should return an empty string
    And the function should not read from ".plan-prompts-other.json"

  # @feature43 — plan-gate defense-in-depth filter (FR-5, AC-5)
  Scenario: PLUGIN007_43_05 plan-gate formatPromptsFromFile filters legacy task-notification entries
    Given a prompts file containing mixed entries with task-notification and real prompts
    When formatPromptsFromFile is called on this file
    Then the returned string should contain "real prompt 1" and "real prompt 2"
    And the returned string should not contain the substring "<task-notification"

  # @feature44 — Plan Pomogator Plain Language Summary (spec: .specs/plan-pomogator-plain-language/)

  # @feature44 — links to FR-2 (REQUIRED_SECTIONS first entry)
  Scenario: PLUGIN007_44_01 Validator detects missing Простыми словами section
    Given a plan file without `## 💬 Простыми словами` section
    When validatePlanPhased is called on the plan file
    Then result.phase1 contains an error with message "Отсутствует секция: Простыми словами"
    And the error contains an actionable hint mentioning "Добавь" and the three subsections (Сейчас, Как должно быть, Правильно понял)
    And result.phase2 is empty (Phase 2 not triggered when Phase 1 has errors)

  # @feature44 — links to FR-3 (validateHumanSummarySection)
  Scenario: PLUGIN007_44_02 Validator detects empty Простыми словами section
    Given a plan file with `## 💬 Простыми словами` heading but no content (only heading and empty line before next section)
    When validatePlanPhased is called on the plan file
    Then result.phase1 contains an error with message "Секция Простыми словами пуста"
    And the error hint contains template with three subsections

  # @feature44 — links to FR-1 + FR-2 + FR-3 + FR-4 (fixture) (happy path)
  Scenario: PLUGIN007_44_03 Validator accepts plan with non-empty Простыми словами section first
    Given a plan file with `## 💬 Простыми словами` as the first top-level section
    And the section contains three subsections with non-empty content
    And all 8 other required sections (Context, User Stories, Use Cases, Requirements, Implementation Plan, Todos, Definition of Done, File Changes) are present in correct order after Простыми словами
    When validatePlanPhased is called on the plan file
    Then result.phase1 is empty
    And no errors related to Простыми словами section are present

  # @feature44 — links to FR-1 (template.md)
  Scenario: PLUGIN007_44_04 Template.md contains Простыми словами as first section
    Given the file `extensions/plan-pomogator/tools/plan-pomogator/template.md`
    When the file content is read
    Then the file contains `## 💬 Простыми словами` heading
    And the heading appears before `## 🎯 Context`
    And the section contains three subsection placeholders: `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`

  # @feature44 — links to FR-5 (rule plan-pomogator.md) + FR-6 (canonical requirements.md)
  Scenario: PLUGIN007_44_05 Rule plan-pomogator.md contains Two-Stage Plan Presentation Workflow
    Given the file `.claude/rules/plan-pomogator/plan-pomogator.md`
    When the file content is read
    Then the file contains a top-level section `## Two-Stage Plan Presentation Workflow`
    And the section contains exactly 4 numbered Steps (Step 1: вывести в чат, Step 2: дождаться подтверждения, Step 3: написать план-файл, Step 4: ExitPlanMode)
    And the section contains an explicit prohibition mentioning "ЗАПРЕЩЕНО" and "ExitPlanMode" and "Step 1"
    And the Pre-flight Checklist mentions `## 💬 Простыми словами` and chat output

  # @feature44 — links to FR-7 (extension.json version)
  Scenario: PLUGIN007_44_06 Extension.json version is bumped to 2.0.0 BREAKING
    Given the file `extensions/plan-pomogator/extension.json`
    When the file is parsed as JSON
    Then the field `version` equals `"2.0.0"`
    And the field `description` mentions "Two-Stage Presentation" or "chat summary" or "Простыми словами"
