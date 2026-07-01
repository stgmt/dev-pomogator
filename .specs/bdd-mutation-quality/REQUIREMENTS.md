# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-bdd-mutation-via-the-official-cucumber-runner) | BDD mutation via cucumber-runner | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Verified |
| [FR-2](FR.md#fr-2-parallel-mutation-across-all-cpu-cores) | Parallel all cores | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Verified |
| [FR-3](FR.md#fr-3-stryker-mutation-skill-and-state) | Stryker skill + state | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Verified |
| [FR-4](FR.md#fr-4-strong-tests-mutation-resistant-bdd-authoring) | Mutation-resistant BDD authoring | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Verified |
| [FR-5](FR.md#fr-5-bdd-quality-judge-hook) | BDD-quality judge hook | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Verified |
| [FR-6](FR.md#fr-6-path-limited-agent-commit-discipline) | Path-limited commit discipline | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Verified |

## Functional Requirements

- [FR-1](FR.md#fr-1-bdd-mutation-via-the-official-cucumber-runner) — BDD mutation via the official cucumber-runner
- [FR-2](FR.md#fr-2-parallel-mutation-across-all-cpu-cores) — parallel mutation across all CPU cores
- [FR-3](FR.md#fr-3-stryker-mutation-skill-and-state) — stryker-mutation skill + state
- [FR-4](FR.md#fr-4-strong-tests-mutation-resistant-bdd-authoring) — strong-tests mutation-resistant BDD authoring
- [FR-5](FR.md#fr-5-bdd-quality-judge-hook) — BDD-quality judge hook
- [FR-6](FR.md#fr-6-path-limited-agent-commit-discipline) — path-limited agent commit discipline

## Non-Functional Requirements

- [Performance](NFR.md#performance) · [Security](NFR.md#security) · [Reliability](NFR.md#reliability) · [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) · [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) · [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) · [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) · [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) · [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | cucumber-runner perTest mutation | FR-1, AC-1, @feature1 | BDD scenario | Verified | commit 2d6879e |
| CHK-FR2-01 | concurrency 100% all cores | FR-2, AC-2, @feature2 | BDD scenario | Verified | 13 min / 24 cores |
| CHK-FR3-01 | atomic mutation state | FR-3, AC-3, @feature3 | BDD scenario | Verified | commit 156908b |
| CHK-FR4-01 | coverage-breadth authoring | FR-4, AC-4, @feature4 | BDD scenario | Verified | NoCoverage 139→91 |
| CHK-FR5-01 | Haiku judge advisory | FR-5, AC-5, @feature5 | BDD scenario | Verified | commit d57043a |
| CHK-FR6-01 | path-limited commit | FR-6, AC-6, @feature6 | Manual review | Verified | commit 0974678 |

## Verification Process

### How CHKs are verified

1. Each CHK links to a BDD scenario or a committed change.
2. Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A}.
3. Status advances only when the linked test passes / the change is committed.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked`.

### Review cadence

- Phase 2 STOP: drafted. Phase 3 STOP: in progress. End: all Verified.

## Summary Counts

- Total CHKs: 6
- Verified: 6
- In Progress: 0
- Draft: 0
- Blocked: 0
