# Acceptance Criteria (EARS format)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1) @feature1

WHEN агент заполняет DESIGN.md секцию `## BDD Test Infrastructure` THEN template SHALL требовать все поля: `**TEST_DATA:**` (TEST_DATA_ACTIVE | TEST_DATA_NONE), `**TEST_FORMAT:**` (BDD | UNIT), `**Framework:**` (из supported list или N/A при UNIT), `**Install Command:**` (actual команда или «already installed»), `**Evidence:**` (grep output или reference).

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2) @feature2

WHEN Phase 1.5 Project Context Analysis запускается AND FILE_CHANGES.md упоминает test files (`tests/**`, `**/Tests/**`, `**/__tests__/**`) THEN agent SHALL для каждого target test-project вызвать `bdd-framework-detector.ts` AND записать результат (framework, evidence, installCommand) в RESEARCH.md секцию «Existing Patterns & Extensions».

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3) @feature3

WHEN `analyze-features.ts` запускается THEN tool SHALL рекурсивно сканировать `**/*.feature` с ignore `['**/node_modules/**', '**/dist/**', '**/build/**', '**/bin/**', '**/obj/**', '**/.git/**']` AND respect `.gitignore` если доступно AND сохранять классификацию production/spec/fixture.

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4) @feature4

WHEN `scaffold-spec.ts -Name "X" -TestFormat auto` AND detector возвращает framework ≠ null THEN `.feature` создаётся как раньше AND DESIGN.md placeholder заполняется обнаруженным framework.
WHEN `scaffold-spec.ts -Name "X" -TestFormat unit` THEN `.feature` НЕ создаётся; вместо него `SCENARIOS.md` stub с header `> DOC ONLY — no executable BDD in this project. UNIT test format selected (see DESIGN.md Risks for justification).`
WHEN `scaffold-spec.ts -Name "X" -TestFormat bdd` THEN `.feature` создаётся без вызова detector.

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5) @feature5

IF DESIGN.md НЕ содержит regex match `\*\*TEST_DATA:\*\*\s*(TEST_DATA_ACTIVE|TEST_DATA_NONE)` OR `\*\*TEST_FORMAT:\*\*\s*(BDD|UNIT)` THEN `spec-status.ts -Path {dir} -ConfirmStop Requirements` SHALL вернуть exit code 1 AND stderr должен содержать blocker message "DESIGN.md missing BDD Test Infrastructure Classification (TEST_DATA + TEST_FORMAT). Run Phase 2 Step 6 assessment. See specs-management.md."

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) @feature6

WHEN target project lacks BDD framework (Evidence = «not installed») AND TEST_FORMAT=BDD THEN TASKS.md Phase 0 SHALL содержать 3 обязательных task в строгой последовательности с depends chain:
- Task #1 `install-bdd-framework`: `- [ ] Install {framework} в {projectPath}: {installCommand}`
- Task #2 `bootstrap-bdd-hooks`: `- [ ] Bootstrap Hooks folder {hookFileHints}` — `depends: install-bdd-framework`
- Task #3 `bootstrap-bdd-fixtures-config`: `- [ ] Create fixtures folder {fixturesFolderHint} + framework config {configFileHint}` — `depends: bootstrap-bdd-hooks`

Все остальные implementation tasks SHALL содержать `_depends: bootstrap-bdd-fixtures-config_`.

## AC-7 (FR-7) @feature7

**Требование:** [FR-7](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7) @feature7

WHEN `validate-spec.ts` проверяет BDD_INFRA AND Classification поля incomplete THEN severity SHALL быть ERROR (exit code 1) AND message SHALL указать конкретное missing поле (TEST_DATA / TEST_FORMAT / Framework / Install Command / Evidence).

## AC-8 (FR-8) @feature8

**Требование:** [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) @feature8

WHEN `detectTargetFramework(projectPath, testProjectHints)` вызван THEN возвращает объект со всеми полями:
- `language: 'csharp' | 'typescript' | 'python' | null`
- `framework: 'Reqnroll' | 'SpecFlow' | 'Cucumber.js' | 'Playwright BDD' | 'Behave' | 'pytest-bdd' | null`
- `installCommand: string | null` (например `'dotnet add package Reqnroll'`)
- `hookFileHints: string[]` (пути к Hooks stub файлам per convention)
- `configFileHint: string | null` (reqnroll.json / cucumber.js / behave.ini / pytest.ini)
- `fixturesFolderHint: string | null`
- `evidence: string[]` (grep-строки с путями и номерами строк)
- `suggestedFrameworks: string[]` (при framework=null — fallback suggestions по language)

## AC-9 (FR-9) @feature9

**Требование:** [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) @feature9

WHEN спека `.specs/create-specs-bdd-enforcement/` создана THEN содержит:
- 12 обязательных `.md` файлов (README, USER_STORIES, USE_CASES, RESEARCH, REQUIREMENTS, FR, NFR, ACCEPTANCE_CRITERIA, DESIGN, TASKS, FILE_CHANGES, CHANGELOG)
- 1 `.feature` файл `create-specs-bdd-enforcement.feature` с 6 BDD scenarios (SBDE001_01..06) с `# @feature1..9` тегами
- README.md SHALL содержать cross-reference `See also: .specs/spec-phase-gate/ для phase-gate hook architecture`
- Validator `validate-spec.ts -Path .specs/create-specs-bdd-enforcement` SHALL выдать 0 errors
