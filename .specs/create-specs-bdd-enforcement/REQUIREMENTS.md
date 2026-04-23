# Requirements Index

Кликабельные ссылки на FR, AC, NFR — используется validator для traceability check.

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1) | Phase 2 Step 6 extends с TEST_FORMAT | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2) | Phase 1.5 detect в target test-projects | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3) | analyze-features multi-folder scan | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4) | scaffold-spec -TestFormat flag | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5) | State machine gate Requirements→Finalization | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6) | TASKS.md Phase 0 bootstrap block | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7) | Validator severity upgrade | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8) | Shared detector module | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9) | Create new spec folder | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |

## Functional Requirements

- [FR-1: Phase 2 Step 6 extends с TEST_FORMAT classification](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1)
- [FR-2: Phase 1.5 детектит BDD framework](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2)
- [FR-3: analyze-features multi-folder scan](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3)
- [FR-4: scaffold-spec -TestFormat flag](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4)
- [FR-5: State machine gate](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5)
- [FR-6: TASKS.md Phase 0 bootstrap block](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6)
- [FR-7: Validator severity upgrade](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7)
- [FR-8: Shared detector module](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8)
- [FR-9: Create new spec folder](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — scan ≤ 2s на 1000 files, detector ≤ 100ms
- [Security](NFR.md#security) — N/A (read-only), detector не выполняет install commands
- [Reliability](NFR.md#reliability) — state machine idempotent, graceful fallback
- [Usability](NFR.md#usability) — actionable error messages, human-readable evidence

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7)](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8)](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9)](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
