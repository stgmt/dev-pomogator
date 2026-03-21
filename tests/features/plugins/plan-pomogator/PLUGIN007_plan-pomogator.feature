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
  Scenario: PLUGIN007_17 extractFileChangePaths extracts paths from File Changes table
    Given a plan content with File Changes table containing 3 file paths
    When extractFileChangePaths parses the content
    Then it returns all 3 paths without backticks

  # @feature18
  Scenario: PLUGIN007_18 scoreCandidate returns positive score for matching project
    Given a plan content referencing files that exist in the current project
    When scoreCandidate scores against the project cwd
    Then the score is greater than zero

  # @feature19
  Scenario: PLUGIN007_19 scoreCandidate returns zero for non-matching project
    Given a plan content referencing files from a different project
    When scoreCandidate scores against the current project cwd
    Then the score is zero

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
