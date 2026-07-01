# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-название) | {Название} | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-название) | {Название} | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-название) | {Название} | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-название) | {Название} | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-название) | {Название} | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-context-menu-launch-entries-log-every-invocation) | Universal launch logging | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch) | Trust auto-grant for YOLO entries | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |

## Functional Requirements

- [FR-1: {Название}](FR.md#fr-1-название)
- [FR-2: {Название}](FR.md#fr-2-название)
- [FR-6: Context-menu launch entries log every invocation](FR.md#fr-6-context-menu-launch-entries-log-every-invocation)
- [FR-7: Trust auto-grant before bypass-permissions launch](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): {Название}](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): {Название}](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-6 (FR-6): Universal launch logging](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Trust auto-grant for YOLO entries](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @feature1 | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |
| CHK-FR2-01 | FR-2 covered by AC-2 via @feature2 | FR-2, AC-2, @feature2 | BDD scenario | Draft | — |
| CHK-FR6-01 | FR-6 (universal logging) covered by AC-6 via @feature6 | FR-6, AC-6, @feature6 | BDD scenario | Draft | CTXMENU001_13/_14/_17 |
| CHK-FR7-01 | FR-7 (trust auto-grant) covered by AC-7 via @feature7 | FR-7, AC-7, @feature7 | BDD scenario | Draft | CTXMENU001_15/_16 |

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

- Total CHKs: 4
- Verified: 0
- In Progress: 0
- Draft: 4
- Blocked: 0
