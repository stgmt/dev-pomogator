# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-запись-skilllistingbudgetfraction-10-в-claudesettingsjson) | Write 1.0 atomically | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-идемпотентность-повторных-запусков) | Idempotent no-op when already 1.0 | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-bump-существующего-значения--10) | Bump existing < 1.0 to 1.0 | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-install-report-includes-change-line) | Install report line | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-out-of-scope--нет-doctor-проверки-нет-подсчёта-нет-per-skill-логики) | OUT OF SCOPE — нет doctor/подсчёта | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | — | Out of Scope |

## Functional Requirements

- [FR-1: Запись `skillListingBudgetFraction: 1.0` в `~/.claude/settings.json`](FR.md#fr-1-запись-skilllistingbudgetfraction-10-в-claudesettingsjson)
- [FR-2: Идемпотентность повторных запусков](FR.md#fr-2-идемпотентность-повторных-запусков)
- [FR-3: Bump существующего значения < 1.0](FR.md#fr-3-bump-существующего-значения--10)
- [FR-4: Install report includes change line](FR.md#fr-4-install-report-includes-change-line)
- [FR-5: OUT OF SCOPE — нет doctor/подсчёта](FR.md#fr-5-out-of-scope--нет-doctor-проверки-нет-подсчёта-нет-per-skill-логики)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-P1, NFR-P2
- [Security](NFR.md#security) — NFR-S1, NFR-S2, NFR-S3
- [Reliability](NFR.md#reliability) — NFR-R1, NFR-R2, NFR-R3
- [Usability](NFR.md#usability) — NFR-U1, NFR-U2

## Acceptance Criteria

- [AC-1 (FR-1): Atomic write of 1.0](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Idempotent no-op](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Bump < 1.0 to 1.0](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Install report line](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 atomic write 1.0 when key absent | FR-1, AC-1, @feature1 | BDD scenario | Draft | UC-1 |
| CHK-FR1-02 | FR-1 preserves other keys в settings.json | FR-1, AC-1, @feature1 | Integration test | Draft | runInstaller |
| CHK-FR1-03 | FR-1 broken JSON backup + rewrite | FR-1, AC-1, @feature1 | Integration test | Draft | UC-4 |
| CHK-FR1-04 | NFR-S1 atomic write (temp + fs.move) | FR-1, AC-1, @feature1 | Integration test | Draft | inspect tmp dir during write |
| CHK-FR1-05 | NFR-S2 broken JSON backup created | FR-1, AC-1, @feature1 | Integration test | Draft | UC-4 |
| CHK-FR1-06 | NFR-R1 non-blocking on permission denied | FR-1, AC-1, @feature1 | Integration test | Draft | chmod -w settings.json |
| CHK-FR1-07 | NFR-R2 cross-platform path resolution | FR-1, AC-1, @feature1 | Integration test | Draft | os.homedir() based |
| CHK-FR2-01 | FR-2 file mtime preserved when 1.0 already | FR-2, AC-2, @feature2 | Integration test | Draft | UC-2 |
| CHK-FR3-01 | FR-3 bump 0.5 → 1.0 | FR-3, AC-3, @feature3 | BDD scenario | Draft | UC-3 |
| CHK-FR4-01 | FR-4 report line format (added) | FR-4, AC-4, @feature4 | Integration test | Draft | stdout match |
| CHK-FR4-02 | FR-4 report line format (unchanged) | FR-4, AC-4, @feature4 | Integration test | Draft | stdout match |
| CHK-FR4-03 | FR-4 report line format (bumped) | FR-4, AC-4, @feature4 | Integration test | Draft | stdout match |
| CHK-FR4-04 | FR-4 report line format (invalid recovered) | FR-4, AC-4, @feature4 | Integration test | Draft | stdout match |

## Verification Process

### How CHKs are verified

1. Each CHK linked к минимум 1 BDD scenario или integration test через Traces To.
2. Verification Method ∈ {BDD scenario, Integration test} — все CHK покрываются runInstaller / spawnSync, no unit-only coverage (per `.claude/rules/integration-tests-first.md`).
3. Status advances when linked test passes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked`.

### Review cadence

- Phase 2 STOP: все CHK в `Draft`.
- Phase 3 STOP: ≥50% в `In Progress`.
- Implementation end: 100% `Verified` либо `Blocked` со ссылкой на issue.

## Summary Counts

- Total CHKs: 13
- Verified: 0
- In Progress: 0
- Draft: 13
- Blocked: 0
