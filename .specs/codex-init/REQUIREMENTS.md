# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-init) | Init | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels) | Parallel Claude Code and Codex channels | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface) | Context menu first whitelist entry | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-codex-native-packaging-contract) | Codex-native packaging contract | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) | Real Codex CLI verification gate | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-stale-claim-rejection) | Stale claim rejection | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-minimal-codex-package-scope) | Minimal Codex package scope | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |

## Functional Requirements

- [FR-1: Init](FR.md#fr-1-init)
- [FR-2: Parallel Claude Code and Codex Channels](FR.md#fr-2-parallel-claude-code-and-codex-channels)
- [FR-3: Context Menu as First Whitelisted Codex Plugin Surface](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface)
- [FR-4: Codex-Native Packaging Contract](FR.md#fr-4-codex-native-packaging-contract)
- [FR-5: Real Codex CLI Verification Gate](FR.md#fr-5-real-codex-cli-verification-gate)
- [FR-6: Stale Claim Rejection](FR.md#fr-6-stale-claim-rejection)
- [FR-7: Minimal Codex Package Scope](FR.md#fr-7-minimal-codex-package-scope)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Codex plugin support whitelist](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Parallel Claude Code and Codex channels](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Context menu first whitelist entry](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Codex-native packaging contract](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Real Codex CLI verification gate](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Stale claim rejection](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Minimal Codex package scope](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Whitelist entry exists before support claim | FR-1, AC-1, @feature1 | BDD scenario | Draft | Check status/manifest/marketplace/runtime/evidence fields. |
| CHK-FR2-01 | Claude artifacts are preserved | FR-2, AC-2, @feature2 | Integration test | Draft | Compare existing Claude artifacts before/after Codex support. |
| CHK-FR3-01 | Context-menu is first whitelist entry | FR-3, AC-3, @feature3 | BDD scenario | Draft | Link to `.specs/context-menu/`. |
| CHK-FR4-01 | Codex packaging uses lowercase `.codex-plugin` | FR-4, AC-4, @feature4 | Integration test | Draft | Validate manifest and marketplace paths. |
| CHK-FR5-01 | Real Codex CLI verification is required | FR-5, AC-5, @feature5 | Integration test | Draft | Use real `codex plugin` commands or harness. |
| CHK-FR6-01 | Stale claims are rejected | FR-6, AC-6, @feature6 | BDD scenario | Draft | Reject stale Codex flags/commands copied from Claude. |
| CHK-FR7-01 | Codex package exposes only context-menu scope | FR-7, AC-7, @feature7 | BDD scenario | Draft | CODEXINIT001_07 verifies minimal skills and no hooks/rules/commands. |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or integration check via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked evidence passes or an explicit blocked reason is recorded.

### Status lifecycle

`Draft` -> `In Progress` -> `Verified` -> `Blocked` (set `Blocked` with evidence on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: at least 50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 7
- Verified: 0
- In Progress: 0
- Draft: 7
- Blocked: 0
