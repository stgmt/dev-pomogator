# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md) | Provide the lint runner required by the project | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @FR-1 | Draft |
| [FR-2](FR.md) | Reuse an existing local lint install | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @FR-2 | Draft |
| [FR-3](FR.md) | Report dependency setup failures clearly | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @FR-3 | Draft |
| [FR-4](FR.md) | Keep plugin and dogfood verification self-sufficient | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @FR-4 | Draft |
| [FR-5](FR.md) | Keep dependency versions reproducible | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @FR-5 | Draft |

## Functional Requirements

- [FR-1: Provide the lint runner required by the project](FR.md)
- [FR-2: Reuse an existing local lint install](FR.md)
- [FR-3: Report dependency setup failures clearly](FR.md)
- [FR-4: Keep plugin and dogfood verification self-sufficient](FR.md)
- [FR-5: Keep dependency versions reproducible](FR.md)

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

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Fresh checkout does not fail with missing eslint | FR-1, AC-1, @FR-1, UC-1 | BDD scenario | Draft | — |
| CHK-FR2-01 | Existing local eslint is reused | FR-2, AC-2, @FR-2, UC-2 | BDD scenario | Draft | — |
| CHK-FR3-01 | Install failure is actionable | FR-3, AC-3, @FR-3, UC-3 | BDD scenario | Draft | — |
| CHK-FR4-01 | Plugin/dogfood path avoids global eslint | FR-4, AC-4, @FR-4, UC-4 | Manual review | Draft | — |
| CHK-FR5-01 | Dependency metadata and lockfile stay aligned | FR-5, AC-5, @FR-5, UC-5 | Integration test | Draft | — |

## Verification Process

### How CHKs are verified

1. BDD scenarios exercise package metadata and lint wrapper behavior in an isolated temp directory.
2. Manual review checks that no always-on plugin hook imports eslint directly.
3. Integration verification runs the real `npm run lint` path after dependency preparation.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked`.

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: BDD scenarios authored and implementation tasks listed.
- Implementation end: all CHKs `Verified` or explicitly `Blocked` with evidence.

## Summary Counts

- Total CHKs: 5
- Verified: 0
- In Progress: 0
- Draft: 5
- Blocked: 0
