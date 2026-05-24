# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-always-apply-шаблон-самопроверки-агента-перед-отправкой-ответа) | Always-apply self-check template | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-slash-команда-answer-simple-для-ручного-аудита-черновика) | Slash /answer-simple draft audit | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-extension-следует-конвенциям-extension-layout) | Extension follows extension-layout | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-триггер-инцидента-—-запрет-нового-вопроса-при-сигнале-непонимания) | Incident trigger no-new-question branch | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature1 | Draft |
| [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария) | Rule migration with glossary update | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature3 | Draft |

## Functional Requirements

- [FR-1: Always-apply self-check template](FR.md#fr-1-always-apply-шаблон-самопроверки-агента-перед-отправкой-ответа)
- [FR-2: Slash /answer-simple draft audit](FR.md#fr-2-slash-команда-answer-simple-для-ручного-аудита-черновика)
- [FR-3: Extension follows extension-layout](FR.md#fr-3-extension-следует-конвенциям-extension-layout)
- [FR-4: Incident trigger no-new-question branch](FR.md#fr-4-триггер-инцидента-—-запрет-нового-вопроса-при-сигнале-непонимания)
- [FR-5: Rule migration with glossary update](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

## Verification Matrix (CHK)

Hook `requirements-chk-guard` enforces format: ID prefix `CHK-FRn-NN`, Traces To must include FR plus one of AC, @feature, or UC. Verification Method is one of BDD scenario, Unit test, Manual review, Integration test, N/A. Status is one of Draft, In Progress, Verified, Blocked.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @feature1 | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |
| CHK-FR2-01 | FR-2 covered by AC-2 via @feature2 | FR-2, AC-2, @feature2 | BDD scenario | Draft | — |
| CHK-FR3-01 | FR-3 covered by AC-3 via @feature3 | FR-3, AC-3, @feature3 | Integration test | Draft | Verifies installer creates correct files in temp dir |
| CHK-FR4-01 | FR-4 covered by AC-4 via @feature1 | FR-4, AC-4, @feature1 | BDD scenario | Draft | — |
| CHK-FR5-01 | FR-5 covered by AC-5 via @feature3 | FR-5, AC-5, @feature3 | Integration test | Draft | Verifies atomic file move + CLAUDE.md edit + memory edit |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 5
- Verified: 0
- In Progress: 0
- Draft: 5
- Blocked: 0
