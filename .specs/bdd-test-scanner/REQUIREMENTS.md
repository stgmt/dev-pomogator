# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start) | Scan existing non-BDD tests at session start | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @FR-1 | Draft |
| [FR-2](FR.md#fr-2-shared-non-bdd-test-detector) | Shared non-BDD test detector | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @FR-2 | Draft |
| [FR-3](FR.md#fr-3-advisory-two-path-notice) | Advisory two-path notice | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @FR-3 | Draft |
| [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice) | A tracking issue gates the notice | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @FR-4 | Draft |
| [FR-5](FR.md#fr-5-plugin-wide-distribution) | Plugin-wide distribution | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @FR-5 | Draft |
| [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies) | Doctor verifies and repairs the hook and its dependencies | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @FR-6 | Draft |

## Functional Requirements

- [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start)
- [FR-2](FR.md#fr-2-shared-non-bdd-test-detector)
- [FR-3](FR.md#fr-3-advisory-two-path-notice)
- [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice)
- [FR-5](FR.md#fr-5-plugin-wide-distribution)
- [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies)

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

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @FR-1 | FR-1, AC-1, @FR-1 | BDD scenario | Draft | — |
| CHK-FR2-01 | FR-2 covered by AC-2 via @FR-2 | FR-2, AC-2, @FR-2 | BDD scenario | Draft | — |
| CHK-FR3-01 | FR-3 covered by AC-3 via @FR-3 | FR-3, AC-3, @FR-3 | BDD scenario | Draft | — |
| CHK-FR4-01 | FR-4 covered by AC-4 via @FR-4 | FR-4, AC-4, @FR-4 | BDD scenario | Draft | — |
| CHK-FR5-01 | FR-5 covered by AC-5 via @FR-5 | FR-5, AC-5, @FR-5 | BDD scenario | Draft | — |
| CHK-FR6-01 | FR-6 covered by AC-6 via @FR-6 | FR-6, AC-6, @FR-6 | BDD scenario | Draft | — |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when the linked scenario passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 6
- Verified: 0
- In Progress: 0
- Draft: 6
- Blocked: 0
