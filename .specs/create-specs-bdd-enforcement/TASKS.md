# Tasks

## TDD Workflow

Задачи организованы по TDD: Red → Green → Refactor. Phase 0 — foundation (BDD framework + hooks + fixtures); Phase 1-6 — сборка feature-по-feature; Phase 7 — dogfood.

## Phase 0: BDD Foundation (Red)

> _Config: см. DESIGN.md секция "BDD Test Infrastructure"_
> Классификация: TEST_DATA=TEST_DATA_NONE, TEST_FORMAT=BDD, Framework=Cucumber.js. Install command "(framework missing → remediation target)".
> Полная миграция dev-pomogator с vitest на Cucumber.js — OUT OF SCOPE этой спеки. Для SBDE001_01..06 используется vitest + spawnSync + 1:1 mapping на .feature (по аналогии с existing convention в `tests/features/`).

- [ ] Создать `.specs/create-specs-bdd-enforcement/create-specs-bdd-enforcement.feature` с 6 сценариями SBDE001_01..06 (PendingStep stubs) -- @feature1 @feature2 @feature3 @feature4 @feature5 @feature6 @feature7 @feature8 @feature9
  _Source: DESIGN.md "BDD Test Infrastructure"_ (уже создан при Phase 2 Requirements)
- [ ] Создать step definitions (vitest describe/it, mapped 1:1 с .feature Scenarios) в `tests/e2e/create-specs-bdd-enforcement.test.ts` — заглушки с `expect(true).toBe(false)` чтобы были Red
  _Requirements: [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)_
- [ ] Создать fixture folders в `tests/fixtures/bdd-enforcement/`: 6 парных mini-projects + multi-folder-features
  _Source: DESIGN.md "Test Data & Fixtures"_
- [ ] Verify: SBDE001_01..06 FAIL (Red) при прогоне `/run-tests tests/e2e/create-specs-bdd-enforcement.test.ts`

## Phase 1: Shared Detector Module (Green)

- [ ] Создать `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` с экспортом `detectTargetFramework(projectPath, testProjectHints[])` -- @feature8
  _Requirements: [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8)_
  _Leverage: `extensions/specs-workflow/tools/steps-validator/detector.ts` (import без дублирования)_
- [ ] Заполнить 6 detection pairs: C#/Reqnroll, C#/SpecFlow, TS/Cucumber.js, TS/Playwright BDD, Python/Behave, Python/pytest-bdd -- @feature8
  _Requirements: [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)_
- [ ] Добавить fallback с `suggestedFrameworks` по detected language -- @feature8
- [ ] Verify: SBDE001_01 (positive detection Reqnroll) и часть SBDE001_06 (fallback Python) переходят в Green

## Phase 2: State Machine Gate + Progress Schema (Green)

- [ ] В `specs-generator-core.mjs` `createDefaultProgressState()` (lines ~381-393) добавить поля `phases.Requirements.bddInfraClassificationComplete: false` и `bddFrameworkSelected: null` -- @feature5
  _Requirements: [FR-5](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5)_
- [ ] Добавить graceful fallback при чтении старых `.progress.json` (undefined → default) -- @feature5
- [ ] В `specs-generator-core.mjs` Requirements→Finalization gate (lines ~1209-1217) добавить проверку DESIGN.md на regex `\*\*TEST_DATA:\*\*` + `\*\*TEST_FORMAT:\*\*` — при missing блокировать с actionable blocker -- @feature5
- [ ] В `commandConfirmStop(Requirements)` (lines ~1188-1197) добавить pre-check prerequisites, throw с exit code 1 если не выполнены -- @feature5
- [ ] Verify: SBDE001_02 (ConfirmStop block) переходит в Green

## Phase 3: Validator Severity Upgrade (Green)

- [ ] В `commandValidateSpec()` BDD_INFRA rule (lines ~925-960) сменить severity WARNING → ERROR для missing Classification -- @feature7
  _Requirements: [FR-7](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7)_
- [ ] Добавить rule `BDD_INFRA_CLASSIFICATION_COMPLETE`: проверить `**TEST_FORMAT:**` matches `BDD|UNIT`; если BDD → require `**Framework:**` + `**Install Command:**` + `**Evidence:**` -- @feature7
- [ ] Если TEST_FORMAT=UNIT → require непустую Risks секцию (escape hatch justification) -- @feature7
  _Requirements: [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)_
- [ ] Update specs-validation.md rule table (source + installed) с новыми правилами -- @feature7
- [ ] Verify: валидатор выдаёт ERROR (exit 1) на DESIGN.md без Classification

## Phase 4: analyze-features Multi-Folder Scan (Green)

- [ ] В `specs-generator-core.mjs` `analyzeFeatures()` (lines ~2620-2623) заменить hardcoded paths на glob `**/*.feature` с ignore `['**/node_modules/**', '**/dist/**', '**/build/**', '**/bin/**', '**/obj/**', '**/.git/**']` -- @feature3
  _Requirements: [FR-3](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3)_
- [ ] Добавить зависимость `fast-glob` или `globby` в `extensions/specs-workflow/package.json` если отсутствует (проверить existing) -- @feature3
- [ ] Respect `.gitignore` (опционально — read от repoRoot если присутствует) -- @feature3
- [ ] Performance cap: 10000 files max, warning если превышено -- @feature3
- [ ] Verify: SBDE001_03 (multi-folder scan) переходит в Green

## Phase 5: scaffold-spec -TestFormat Flag + Templates (Green)

- [ ] В `scaffold-spec.ts` wrapper принимать `-TestFormat [bdd|unit|auto]`, default `auto`, валидировать значения, передавать в core -- @feature4
  _Requirements: [FR-4](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4)_
- [ ] В `commandScaffoldSpec()` branch на `testFormat`: `auto`/`bdd`/`unit` -- @feature4
- [ ] `unit` mode: создавать `SCENARIOS.md` вместо `.feature` с header «DOC ONLY» -- @feature4
- [ ] Update `templates/DESIGN.md.template` — новые поля `**TEST_DATA:**`, `**TEST_FORMAT:**`, `**Framework:**`, `**Install Command:**`, `**Evidence:**` в секции `## BDD Test Infrastructure` -- @feature1
  _Requirements: [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)_
- [ ] Update `templates/TASKS.md.template` — conditional Phase 0 bootstrap block (3 tasks: install-bdd-framework → bootstrap-bdd-hooks → bootstrap-bdd-fixtures-config) -- @feature6
  _Requirements: [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6)_
- [ ] Verify: SBDE001_04 (escape hatch), SBDE001_05 (C# bootstrap), SBDE001_06 (Python bootstrap) переходят в Green

## Phase 6: Rules Update (Green)

- [ ] Update `.claude/rules/specs-workflow/specs-management.md` + `extensions/specs-workflow/rules/claude/specs-management.md` (source + installed): Phase 1.5 detect step + Phase 2 Step 6.1a/b/c split + Pre-flight Checklist addition -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2)_
- [ ] Create `.claude/rules/specs-workflow/bdd-enforcement.md` + `extensions/specs-workflow/rules/claude/bdd-enforcement.md`: BDD default principle, framework decision tree, install+bootstrap recipes per framework, escape hatch semantics, cross-reference на `.specs/create-specs-bdd-enforcement/` -- @feature6
  _Requirements: [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6)_

## Phase 7: Manifest + Refactor & Polish

- [ ] `extensions/specs-workflow/extension.json` — bump version 1.14.0 → 1.15.0, add `bdd-enforcement.md` в `rules.claude[]`, add `bdd-framework-detector.ts` в `toolFiles[]` -- @feature9
  _Requirements: [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9)_
- [ ] `extensions/specs-workflow/CHANGELOG.md` — entry «## 1.15.0 — BDD Enforcement + Non-Skippable Test-Format Detection»
- [ ] Все 6 BDD сценариев SBDE001_01..06 GREEN
- [ ] Dogfood: scaffold dummy spec в fixture C# project → verify detector + Phase 0 bootstrap block
- [ ] Dogfood: ConfirmStop Requirements без Classification → verify exit code 1
- [ ] `/run-tests` полный — existing regression tests зелёные
- [ ] `validate-spec.ts -Path .specs/create-specs-bdd-enforcement` → 0 errors
- [ ] `audit-spec.ts -Path .specs/create-specs-bdd-enforcement` → 0 critical findings
