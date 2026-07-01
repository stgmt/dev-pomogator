# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-polymorphic-trigger-detection-через-mechanical-regex) | Polymorphic trigger detection | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature2,3 | Draft |
| [FR-2](FR.md#fr-2-hard-out-signals-anti-over-application) | Hard-OUT signals | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-2) | @feature4 | Draft |
| [FR-3](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr) | AC Decision Table | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature5 | Draft |
| [FR-4](FR.md#fr-4-gherkin-scenario-outline-в-feature-11-с-ac) | Gherkin Scenario Outline | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature5 | Draft |
| [FR-5](FR.md#fr-5-tasksmd-per-variant) | TASKS.md per-variant | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-audit-category-variantcoverage-8-я-категория) | Audit category VARIANT_COVERAGE | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature5,6 | Draft |
| [FR-7](FR.md#fr-7-escape-hatch-с-audit-log) | Escape hatch с audit log | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7) | @feature6,7 | Draft |
| [FR-8](FR.md#fr-8-phase-2-sub-skill-variant-matrix-build) | Phase 2 sub-skill variant-matrix-build | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature2,3,5 | Draft |

## Functional Requirements

- [FR-1: Polymorphic trigger detection через mechanical regex](FR.md#fr-1-polymorphic-trigger-detection-через-mechanical-regex)
- [FR-2: Hard-OUT signals (anti-over-application)](FR.md#fr-2-hard-out-signals-anti-over-application)
- [FR-3: AC Decision Table обязательна per polymorphic FR](FR.md#fr-3-ac-decision-table-обязательна-per-polymorphic-fr)
- [FR-4: Gherkin Scenario Outline в .feature 1:1 с AC](FR.md#fr-4-gherkin-scenario-outline-в-feature-11-с-ac)
- [FR-5: TASKS.md per-variant](FR.md#fr-5-tasksmd-per-variant)
- [FR-6: Audit category VARIANT_COVERAGE (8-я категория)](FR.md#fr-6-audit-category-variantcoverage-8-я-категория)
- [FR-7: Escape hatch с audit log](FR.md#fr-7-escape-hatch-с-audit-log)
- [FR-8: Phase 2 sub-skill variant-matrix-build](FR.md#fr-8-phase-2-sub-skill-variant-matrix-build)
- [FR-9: PreToolUse form-guard на Write/Edit FR.md — OUT OF SCOPE](FR.md#fr-9-pretooluse-form-guard-на-writeedit-frmd-out-of-scope)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Polymorphic detection flag](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Hard-OUT priority](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Decision Table presence](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Examples row count match](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-7): Short escape reason INFO](ACCEPTANCE_CRITERIA.md#ac-5-fr-7)
- [AC-6 (FR-6): WARNING blocks STOP #3](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-2): Zero polymorphic = zero findings](ACCEPTANCE_CRITERIA.md#ac-7-fr-2)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | EN polymorphic trigger detected | FR-1, AC-1, @feature2 | BDD scenario | Draft | Fixture polymorphic-fr-no-matrix |
| CHK-FR1-02 | RU polymorphic trigger detected | FR-1, AC-1, @feature3 | BDD scenario | Draft | Fixture polymorphic-fr-ru-mixed |
| CHK-FR2-01 | Hard-OUT skips single-variant | FR-2, AC-2, AC-7, @feature4 | BDD scenario | Draft | H1 regression guard (CRITICAL) |
| CHK-FR3-01 | AC Decision Table required | FR-3, FR-6, AC-3, @feature5 | Integration test | Draft | audit-spec.ts integration |
| CHK-FR4-01 | Examples 1:1 row count | FR-4, FR-6, AC-4, @feature5 | Integration test | Draft | Cross-reference parser |
| CHK-FR5-01 | TASKS per-variant tracer | FR-5, AC-3, @feature5 | BDD scenario | Draft | parser parseVariantTasks |
| CHK-FR6-01 | WARNING blocks STOP #3 | FR-6, AC-6, @feature5 | Integration test | Draft | spec-status.ts -ConfirmStop |
| CHK-FR7-01 | Short reason emits INFO | FR-7, AC-5, @feature6 | BDD scenario | Draft | Fixture escape-hatch-short-reason |
| CHK-FR7-02 | Valid reason JSONL log | FR-7, AC-5, @feature7 | Integration test | Draft | Atomic O_APPEND test |
| CHK-FR8-01 | Skill invocable Phase 2 4c | FR-8, AC-1, @feature2 | Manual review | Draft | SKILL.md frontmatter check |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or integration test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome в Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set Blocked + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs в Draft.
- Phase 3 STOP: ≥50% of CHKs в In Progress.
- Implementation end: 100% Verified или explicit Blocked с issue link.

## Summary Counts

- Total CHKs: 10
- Verified: 0
- In Progress: 0
- Draft: 10
- Blocked: 0
