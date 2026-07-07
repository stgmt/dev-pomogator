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
| [FR-8](FR.md#fr-8-parallel-claude-code-and-codex-channels) | Parallel Claude Code and Codex channels | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-codex-nss-content-generation) | Codex NSS generation | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard) | Codex launch script copy/path guard | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-codex-full-access-launch-and-trust-handling) | Codex full-access launch and trust | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-codex-only-install-mode) | Codex-only install mode | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature12 | Draft |
| [FR-13](FR.md#fr-13-codex-context-menu-install-launcher-script) | Codex install launcher script | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13) | @feature13 | Draft |
| [FR-14](FR.md#fr-14-codex-context-menu-icon-installation) | Codex context-menu icon installation | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14) | @feature14 | Draft |

## Functional Requirements

- [FR-1: {Название}](FR.md#fr-1-название)
- [FR-2: {Название}](FR.md#fr-2-название)
- [FR-6: Context-menu launch entries log every invocation](FR.md#fr-6-context-menu-launch-entries-log-every-invocation)
- [FR-7: Trust auto-grant before bypass-permissions launch](FR.md#fr-7-trust-auto-grant-before-bypass-permissions-launch)
- [FR-8: Parallel Claude Code and Codex channels](FR.md#fr-8-parallel-claude-code-and-codex-channels)
- [FR-9: Codex NSS content generation](FR.md#fr-9-codex-nss-content-generation)
- [FR-10: Codex launch script copy and path drift guard](FR.md#fr-10-codex-launch-script-copy-and-path-drift-guard)
- [FR-11: Codex full-access launch and trust handling](FR.md#fr-11-codex-full-access-launch-and-trust-handling)
- [FR-12: Codex-only install mode](FR.md#fr-12-codex-only-install-mode)
- [FR-13: Codex context-menu install launcher script](FR.md#fr-13-codex-context-menu-install-launcher-script)
- [FR-14: Codex context-menu icon installation](FR.md#fr-14-codex-context-menu-icon-installation)

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
- [AC-8 (FR-8): Parallel Claude/Codex channels](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): Codex NSS generation](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10): Codex launch script copy/path guard](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11): Codex full-access launch and trust](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
- [AC-12 (FR-12): Codex-only install mode](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
- [AC-13 (FR-13): Codex install launcher script](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
- [AC-14 (FR-14): Codex context-menu icon installation](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)

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
| CHK-FR8-01 | FR-8 (parallel channels) covered by AC-8 via @feature8 | FR-8, AC-8, @feature8 | BDD scenario | Draft | CTXMENU001_18 |
| CHK-FR9-01 | FR-9 (Codex NSS) covered by AC-9 via @feature9 | FR-9, AC-9, @feature9 | BDD scenario | Draft | CTXMENU001_19 |
| CHK-FR10-01 | FR-10 (Codex script copy/path guard) covered by AC-10 via @feature10 | FR-10, AC-10, @feature10 | BDD scenario | Draft | CTXMENU001_20 |
| CHK-FR11-01 | FR-11 (Codex full-access/trust) covered by AC-11 via @feature11 | FR-11, AC-11, @feature11 | BDD scenario | Draft | CTXMENU001_21/_22 |
| CHK-FR12-01 | FR-12 (Codex-only install mode) covered by AC-12 via @feature12 | FR-12, AC-12, @feature12 | BDD scenario | Draft | CTXMENU001_23 |
| CHK-FR13-01 | FR-13 (Codex install launcher script) covered by AC-13 via @feature13 | FR-13, AC-13, @feature13 | BDD scenario | Draft | CTXMENU001_24 |
| CHK-FR14-01 | FR-14 (Codex icon installation) covered by AC-14 via @feature14 | FR-14, AC-14, @feature14 | BDD scenario | Draft | CTXMENU001_25 |

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

- Total CHKs: 9
- Verified: 0
- In Progress: 0
- Draft: 9
- Blocked: 0
