# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-reconciler-slot-classification) | Reconciler классификация слота | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-atomic-conditional-writer) | Atomic conditional writer | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature1 | Draft |
| [FR-3](FR.md#fr-3-native-statusline-sessionstart-hook) | SessionStart-хук домена | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature1 | Draft |
| [FR-4](FR.md#fr-4-ownership-marker) | Ownership-маркер | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature2 | Draft |
| [FR-5](FR.md#fr-5-opt-out-switch) | Выключатель env | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature4 | Draft |
| [FR-6](FR.md#fr-6-hook-registration) | Регистрация хука | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature1 | Draft |
| [FR-7](FR.md#fr-7-doctor-check-and-fix-action) | Doctor check + fix | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature3 | Draft |
| [FR-8](FR.md#fr-8-idempotent-and-fail-open) | Идемпотентность + fail-open | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature5 | Draft |
| [FR-9](FR.md#fr-9-domain-separation-guard) | Разграничение доменов | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature1 | Draft |
| [FR-10](FR.md#fr-10-bundling-ccstatusline-out-of-scope) | OUT OF SCOPE | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-out-of-scope) | — | Out of Scope |

## Functional Requirements

- [FR-1: Reconciler классификация слота](FR.md#fr-1-reconciler-slot-classification)
- [FR-2: Atomic conditional writer](FR.md#fr-2-atomic-conditional-writer)
- [FR-3: SessionStart-хук домена](FR.md#fr-3-native-statusline-sessionstart-hook)
- [FR-4: Ownership-маркер](FR.md#fr-4-ownership-marker)
- [FR-5: Выключатель env](FR.md#fr-5-opt-out-switch)
- [FR-6: Регистрация хука](FR.md#fr-6-hook-registration)
- [FR-7: Doctor check + fix](FR.md#fr-7-doctor-check-and-fix-action)
- [FR-8: Идемпотентность + fail-open](FR.md#fr-8-idempotent-and-fail-open)
- [FR-9: Разграничение доменов](FR.md#fr-9-domain-separation-guard)
- [FR-10: OUT OF SCOPE](FR.md#fr-10-bundling-ccstatusline-out-of-scope)

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
- [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7)](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8)](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9)](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)

## Verification Matrix (CHK)

> Hook `requirements-chk-guard` enforces: ID format CHK-FRn-nn, Traces To includes FR + (AC | @feature | UC),
> Verification Method ∈ BDD scenario / Unit test / Manual review / Integration test / N/A, Status ∈ Draft / In Progress / Verified / Blocked.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | reconciler: пустой слот → install | FR-1, AC-1, @feature1 | Unit test | Draft | NSL001_01 |
| CHK-FR1-02 | reconciler: маркер → noop, чужой → keep-user | FR-1, AC-1, @feature2 | Unit test | Draft | NSL001_05 |
| CHK-FR2-01 | writer пишет в пустой slot атомарно, прочие поля целы | FR-2, AC-2, @feature1 | Integration test | Draft | NSL001_02/03 |
| CHK-FR2-02 | writer не пишет при noop/keep-user | FR-2, AC-2, @feature2 | Integration test | Draft | NSL001_04 |
| CHK-FR3-01 | хук пишет в чистый settings.json, exit 0 | FR-3, AC-3, @feature1 | Integration test | Draft | NSL001_02 |
| CHK-FR3-02 | хук emit systemMessage при changed | FR-3, AC-3, @feature1 | Integration test | Draft | NSL001_02 |
| CHK-FR4-01 | маркер ccstatusline → noop | FR-4, AC-4, @feature2 | Unit test | Draft | NSL001_05 |
| CHK-FR4-02 | чужая команда сохранена | FR-4, AC-4, @feature2 | Integration test | Draft | NSL001_04 |
| CHK-FR5-01 | DEV_POMOGATOR_STATUSLINE=off → нет записи | FR-5, AC-5, @feature4 | Integration test | Draft | NSL001_06 |
| CHK-FR6-01 | хук зарегистрирован в hooks.json + settings.json | FR-6, AC-6, @feature1 | Integration test | Draft | manifest check |
| CHK-FR7-01 | doctor check видит отсутствие, fix применяет | FR-7, AC-7, @feature3 | Integration test | Draft | NSL001_10 |
| CHK-FR8-01 | повторный запуск идемпотентен (нет записи) | FR-8, AC-8, @feature5 | Integration test | Draft | NSL001_07 |
| CHK-FR8-02 | битый JSON → exit 0, без мутации | FR-8, AC-8, @feature5 | Integration test | Draft | NSL001_08 |
| CHK-FR9-01 | FILE_CHANGES не содержит путей test-statusline | FR-9, AC-9, @feature1 | Manual review | Draft | domain guard |

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

- Total CHKs: 14
- Verified: 0
- In Progress: 0
- Draft: 14
- Blocked: 0
