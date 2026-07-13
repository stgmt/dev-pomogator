# Requirements Traceability

## Functional Requirements

- [FR-1: Название](FR.md#fr-1-название) prepares a sanitized, reviewable GitHub report from the supplied issue description.
- [FR-2: Название](FR.md#fr-2-название) protects GitHub from creation without explicit consent.
- [FR-3: Название](FR.md#fr-3-название) searches for possible duplicate open issues before creation consent.
- [FR-4: Название](FR.md#fr-4-название) retains the sanitized report and gives a filled URL on all local-creation failures.
- [FR-5: Название](FR.md#fr-5-название) resolves and consistently uses a repository target.

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Название](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Название](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Название](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Название](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Название](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Sanitized report is shown before any mutation. | FR-1, AC-1, UC-1 | BDD scenario | Draft | RPT001_01 |
| CHK-FR1-02 | Credential-shaped values do not enter displayed or GitHub-bound payloads. | FR-1, AC-1, UC-1 | BDD scenario | Draft | RPT001_01 |
| CHK-FR2-01 | Creation is impossible without affirmative approval of the exact report. | FR-2, AC-2, UC-2 | BDD scenario | Draft | RPT001_02 |
| CHK-FR3-01 | Duplicate issue URLs appear before a new issue can be confirmed. | FR-3, AC-3, UC-3 | BDD scenario | Draft | RPT001_03 |
| CHK-FR4-01 | Failure paths retain Markdown and a filled manual URL. | FR-4, AC-4, UC-4 | BDD scenario | Draft | RPT001_04 |
| CHK-FR4-02 | Unauthenticated CLI guidance names gh auth login without claiming success. | FR-4, AC-4, UC-4 | BDD scenario | Draft | RPT001_04 |
| CHK-FR5-01 | Metadata or remote supplies one target for every GitHub operation. | FR-5, AC-5, UC-5 | BDD scenario | Draft | RPT001_05 |
| CHK-FR5-02 | Resolution falls back to stgmt/dev-pomogator. | FR-5, AC-5, UC-5 | BDD scenario | Draft | RPT001_05 |

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

- Total CHKs: 8
- Verified: 0
- In Progress: 0
- Draft: 8
- Blocked: 0
