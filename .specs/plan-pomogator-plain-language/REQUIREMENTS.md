# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | Linked UC | @featureN | Status |
|----|------|-----------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1) | Template содержит секцию первой | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2) | REQUIRED_SECTIONS массив | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1), [UC-4](USE_CASES.md#uc-4-backward-compat-breaking--старый-план-без-секции-feature5-feature6), [UC-6](USE_CASES.md#uc-6-edge-case--секция-в-неправильном-порядке-feature2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3) | validateHumanSummarySection | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | [UC-5](USE_CASES.md#uc-5-edge-case--пустая-секция-feature2) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4) | Fixture обновлён | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5) | Rule Two-Stage Workflow | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1), [UC-2](USE_CASES.md#uc-2-correction-loop--пользователь-поправляет-feature1-feature3), [UC-3](USE_CASES.md#uc-3-uncertainty-abc-variants-feature4) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6) | Canonical spec обновлён | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-extensionjson-версия-200-breaking-feature7) | Major version bump 2.0.0 | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | [UC-4](USE_CASES.md#uc-4-backward-compat-breaking--старый-план-без-секции-feature5-feature6) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8) | e2e тесты + BDD сценарии | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | All UCs (automated testing) | @feature8 | Draft |

## Functional Requirements

- [FR-1: Template содержит секцию "Простыми словами" первой](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1)
- [FR-2: REQUIRED_SECTIONS массив содержит новую запись первой](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2)
- [FR-3: validateHumanSummarySection функция проверяет non-empty content](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3)
- [FR-4: Fixture valid.plan.md содержит новую секцию первой](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4)
- [FR-5: Правило plan-pomogator.md содержит Two-Stage Workflow секцию](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5)
- [FR-6: Canonical requirements.md документирует новую секцию](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6)
- [FR-7: extension.json версия 2.0.0 (BREAKING)](FR.md#fr-7-extensionjson-версия-200-breaking-feature7)
- [FR-8: e2e тесты для новой секции](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — <20мс impact на ExitPlanMode latency
- [Security](NFR.md#security) — N/A, in-memory only operations
- [Reliability](NFR.md#reliability) — Phase 1 fail-fast, fail-open поведение plan-gate сохранено
- [Usability](NFR.md#usability) — Actionable hints с шаблоном для копипасты

## Acceptance Criteria

- [AC-1 (FR-1): Template structure](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): REQUIRED_SECTIONS validation](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): validateHumanSummarySection behavior](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Fixture passes validation](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Rule contains Two-Stage Workflow](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Canonical spec updated](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Version 2.0.0](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): e2e + BDD tests pass](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
