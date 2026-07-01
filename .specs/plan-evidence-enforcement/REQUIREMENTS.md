# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-validate-plan-enforces-evidence) | validate-plan enforces evidence | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Verified |
| [FR-2](FR.md#fr-2-claims-need-evidence-rule-and-template) | claims-need-evidence rule + template | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Verified |

## Functional Requirements

- [FR-1](FR.md#fr-1-validate-plan-enforces-evidence) — validate-plan.ts enforces evidence (Phase 4)
- [FR-2](FR.md#fr-2-claims-need-evidence-rule-and-template) — claims-need-evidence rule + template + index

## Non-Functional Requirements

- [Performance](NFR.md#performance) · [Security](NFR.md#security) · [Reliability](NFR.md#reliability) · [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) · [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | validateEvidence flags unsourced + requires section | FR-1, AC-1, @feature1 | Unit test | Verified | PLUGIN007_45, commit 8e33904 |
| CHK-FR2-01 | rule + template + index | FR-2, AC-2, @feature2 | Manual review | Verified | commit 8e33904 |

## Verification Process

### How CHKs are verified

1. Each CHK links to a test or a committed change.
2. Verification Method is one of BDD scenario, Unit test, Manual review, Integration test, N/A.
3. Status advances only when the linked test passes or the change is committed.

### Status lifecycle

Draft to In Progress to Verified to Blocked.

### Review cadence

- Phase 2 STOP drafted. Phase 3 STOP in progress. End all Verified.

## Summary Counts

- Total CHKs: 2
- Verified: 2
- In Progress: 0
- Draft: 0
- Blocked: 0
