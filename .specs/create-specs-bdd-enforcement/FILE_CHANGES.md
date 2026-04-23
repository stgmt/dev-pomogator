# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` | create | [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) — shared module переиспользующий steps-validator/detector.ts |
| `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` | edit | [FR-1](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1), [FR-3](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3), [FR-5](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5), [FR-7](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7) — createDefaultProgressState новые поля, Requirements→Finalization gate, BDD_INFRA severity ERROR, multi-folder analyze-features, ConfirmStop pre-check |
| `extensions/specs-workflow/tools/specs-generator/scaffold-spec.ts` | edit | [FR-4](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4) — добавить -TestFormat [bdd\|unit\|auto] flag |
| `extensions/specs-workflow/tools/specs-generator/templates/DESIGN.md.template` | edit | [FR-1](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1) — новые поля TEST_FORMAT, Framework, Install Command, Evidence |
| `extensions/specs-workflow/tools/specs-generator/templates/TASKS.md.template` | edit | [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) — conditional Phase 0 bootstrap block (3 tasks) |
| `.claude/rules/specs-workflow/specs-management.md` | edit | [FR-1](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1), [FR-2](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2) — Phase 1.5 detect step + Phase 2 Step 6.1a/b/c split |
| `extensions/specs-workflow/rules/claude/specs-management.md` | edit | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — source sync с installed rule |
| `.claude/rules/specs-workflow/bdd-enforcement.md` | create | [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) — новое правило «BDD is default» + framework decision tree |
| `extensions/specs-workflow/rules/claude/bdd-enforcement.md` | create | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — source версия для installer |
| `.claude/rules/specs-workflow/specs-validation.md` | edit | [FR-7](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7) — описание BDD_INFRA_CLASSIFICATION_COMPLETE rule (severity ERROR) |
| `extensions/specs-workflow/rules/claude/specs-validation.md` | edit | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — source sync |
| `extensions/specs-workflow/extension.json` | edit | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — version 1.14.0 → 1.15.0, add bdd-enforcement.md в rules, bdd-framework-detector.ts в toolFiles |
| `extensions/specs-workflow/CHANGELOG.md` | edit | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — entry для 1.15.0 |
| `tests/e2e/create-specs-bdd-enforcement.test.ts` | create | [FR-1..9 integration coverage] — 6 integration тестов SBDE001_01..06 |
| `tests/fixtures/bdd-enforcement/csharp-reqnroll-installed/` | create | [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) — positive detection fixture |
| `tests/fixtures/bdd-enforcement/csharp-reqnroll-missing/` | create | [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) — remediation target fixture |
| `tests/fixtures/bdd-enforcement/ts-cucumber-installed/` | create | [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) — positive detection fixture (TS) |
| `tests/fixtures/bdd-enforcement/ts-cucumber-missing/` | create | [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) — remediation target (TS) |
| `tests/fixtures/bdd-enforcement/python-pytest-bdd-installed/` | create | [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) — positive detection (Python) |
| `tests/fixtures/bdd-enforcement/python-pytest-bdd-missing/` | create | [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) — remediation target (Python) |
| `tests/fixtures/bdd-enforcement/multi-folder-features/` | create | [FR-3](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3) — fixture для multi-folder scan test SBDE001_03 |
| `.specs/create-specs-bdd-enforcement/` (13 файлов) | create | [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) — 12 MD файлов + 1 .feature файл |
