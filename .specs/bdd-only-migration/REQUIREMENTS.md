# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard) | Staged BDD-only test-file guard | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-detector-unit-tests-migrated-to-bdd-with-mutation-parity) | Detector unit tests migrated with mutation parity | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-net-mutation-path-runs-in-docker) | .NET mutation path runs in Docker | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-build-guard-updated-for-v2) | build-guard updated for v2 | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-all-vitest-tests-migrated-to-bdd) | All vitest tests migrated to BDD | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions) | bdd-migrator upgraded (no exceptions) | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-final-gate-switch-to-the-docker-cucumber-canonical-run) | Final gate-switch to Docker-cucumber | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-spec-records-the-migration-with-a-green-smart-verdict) | Spec records the migration (GREEN verdict) | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard) | FR-1 guard scenarios drive the real guard | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature1 | Draft |

## Functional Requirements

- [FR-1: Staged BDD-only test-file guard](FR.md#fr-1-staged-bdd-only-test-file-guard)
- [FR-2: Detector unit tests migrated with mutation parity](FR.md#fr-2-detector-unit-tests-migrated-to-bdd-with-mutation-parity)
- [FR-3: .NET mutation path runs in Docker](FR.md#fr-3-net-mutation-path-runs-in-docker)
- [FR-4: build-guard updated for v2](FR.md#fr-4-build-guard-updated-for-v2)
- [FR-5: All vitest tests migrated to BDD](FR.md#fr-5-all-vitest-tests-migrated-to-bdd)
- [FR-6: bdd-migrator upgraded with no exceptions](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions)
- [FR-7: Final gate-switch to the Docker-cucumber canonical run](FR.md#fr-7-final-gate-switch-to-the-docker-cucumber-canonical-run)
- [FR-8: Spec records the migration with a GREEN smart verdict](FR.md#fr-8-spec-records-the-migration-with-a-green-smart-verdict)
- [FR-9: FR-1 guard scenarios drive the real guard](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard)

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

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered by AC-1 via @feature1 | FR-1, AC-1, @feature1 | BDD scenario | Verified | guard scenarios BDDONLY001_01..04 |
| CHK-FR2-01 | FR-2 covered by AC-2 via @feature2 | FR-2, AC-2, @feature2 | BDD scenario | Draft | mutation-parity scenarios (W1) |
| CHK-FR3-01 | FR-3 covered by AC-3 via @feature3 | FR-3, AC-3, @feature3 | BDD scenario | Draft | .NET-in-Docker scenario (W2) |
| CHK-FR4-01 | FR-4 covered by AC-4 via @feature4 | FR-4, AC-4, @feature4 | BDD scenario | Draft | build-guard v2 (W3, done) |
| CHK-FR5-01 | FR-5 covered by AC-5 via @feature5 | FR-5, AC-5, @feature5 | BDD scenario | Draft | tail migration to netCount=0 (W6) |
| CHK-FR6-01 | FR-6 covered by AC-6 via @feature6 | FR-6, AC-6, @feature6 | Unit test | Draft | migrator no-refusal pins (W5, done) |
| CHK-FR7-01 | FR-7 covered by AC-7 via @feature7 | FR-7, AC-7, @feature7 | Manual review | Draft | gate-switch (W7) |
| CHK-FR8-01 | FR-8 covered by AC-8 via @feature8 | FR-8, AC-8, @feature8 | Manual review | Draft | spec smart verdict GREEN |
| CHK-FR9-01 | FR-9 covered by AC-9 via @feature1 | FR-9, AC-9, @feature1 | BDD scenario | Verified | guard scenarios BDDONLY001_01..04 |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when the linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 9
- Verified: 2
- In Progress: 0
- Draft: 7
- Blocked: 0
