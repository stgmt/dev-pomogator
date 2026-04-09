Feature: PLUGIN007_44_PlanPomogatorPlainLanguage

  Background:
    Given dev-pomogator is installed
    And plan-pomogator extension is enabled

  # @feature2 @feature8 — links to FR-2 (REQUIRED_SECTIONS first entry) + FR-8 (e2e tests)
  Scenario: PLUGIN007_44_01 Validator detects missing Простыми словами section
    Given a plan file without `## 💬 Простыми словами` section
    When validatePlanPhased is called on the plan file
    Then result.phase1 contains an error with message "Отсутствует секция: Простыми словами"
    And the error contains an actionable hint mentioning "Добавь" and the three subsections (Сейчас, Как должно быть, Правильно понял)
    And result.phase2 is empty (Phase 2 not triggered when Phase 1 has errors)

  # @feature3 @feature8 — links to FR-3 (validateHumanSummarySection) + FR-8 (e2e tests)
  Scenario: PLUGIN007_44_02 Validator detects empty Простыми словами section
    Given a plan file with `## 💬 Простыми словами` heading but no content (only heading and empty line before next section)
    When validatePlanPhased is called on the plan file
    Then result.phase1 contains an error with message "Секция Простыми словами пуста"
    And the error hint contains template with three subsections

  # @feature1 @feature2 @feature3 @feature4 @feature8 — links to FR-1 + FR-2 + FR-3 + FR-4 (fixture) + FR-8 (e2e tests)
  Scenario: PLUGIN007_44_03 Validator accepts plan with non-empty Простыми словами section first
    Given a plan file with `## 💬 Простыми словами` as the first top-level section
    And the section contains three subsections with non-empty content
    And all 8 other required sections (Context, User Stories, Use Cases, Requirements, Implementation Plan, Todos, Definition of Done, File Changes) are present in correct order after Простыми словами
    When validatePlanPhased is called on the plan file
    Then result.phase1 is empty
    And no errors related to Простыми словами section are present

  # @feature1 — links to FR-1 (template.md)
  Scenario: PLUGIN007_44_04 Template.md contains Простыми словами as first section
    Given the file `extensions/plan-pomogator/tools/plan-pomogator/template.md`
    When the file content is read
    Then the file contains `## 💬 Простыми словами` heading
    And the heading appears before `## 🎯 Context`
    And the section contains three subsection placeholders: `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`

  # @feature5 @feature6 — links to FR-5 (rule plan-pomogator.md) + FR-6 (canonical requirements.md, оба про docs)
  Scenario: PLUGIN007_44_05 Rule plan-pomogator.md contains Two-Stage Plan Presentation Workflow
    Given the file `.claude/rules/plan-pomogator/plan-pomogator.md`
    When the file content is read
    Then the file contains a top-level section `## Two-Stage Plan Presentation Workflow`
    And the section contains exactly 4 numbered Steps (Step 1: вывести в чат, Step 2: дождаться подтверждения, Step 3: написать план-файл, Step 4: ExitPlanMode)
    And the section contains an explicit prohibition mentioning "ЗАПРЕЩЕНО" and "ExitPlanMode" and "Step 1"
    And the Pre-flight Checklist mentions `## 💬 Простыми словами` and chat output

  # @feature7 — links to FR-7 (extension.json version)
  Scenario: PLUGIN007_44_06 Extension.json version is bumped to 2.0.0 BREAKING
    Given the file `extensions/plan-pomogator/extension.json`
    When the file is parsed as JSON
    Then the field `version` equals `"2.0.0"`
    And the field `description` mentions "Two-Stage Presentation" or "chat summary" or "Простыми словами"
