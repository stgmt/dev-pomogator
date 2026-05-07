# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-{название}) | {Название} | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-{название}) | {Название} | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |

## Functional Requirements

- [FR-1: {Название}](FR.md#fr-1-{название})
- [FR-2: {Название}](FR.md#fr-2-{название})

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): {Название}](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): {Название}](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @feature1 | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |
| CHK-FR2-01 | FR-2 covered by AC-2 via @feature2 | FR-2, AC-2, @feature2 | BDD scenario | Draft | — |

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

- Total CHKs: 0
- Verified: 0
- In Progress: 0
- Draft: 0
- Blocked: 0
