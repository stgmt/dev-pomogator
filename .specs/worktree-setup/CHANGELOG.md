# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased] — 2026-05-13

### Specification

- **Phase 1 (Discovery)** complete: 5 user stories, 7 use cases, RESEARCH.md with technical findings + 9 risks
- **Phase 2 (Requirements + Design)** complete: 9 FRs (8 in-scope + 1 OUT_OF_SCOPE), 20 NFRs, 8 ACs (EARS format), 21 CHK traceability rows, 5 Key Decisions with Rationale/Trade-off/Alternatives, 18 BDD scenarios (CORE024_01..18)
- **Phase 3 (Finalization)** complete: 21 implementation tasks across Phase 0..6, README overview, this CHANGELOG

### Cross-feature dependencies

- **session-pilot v0.4.0** (separate branch `feat/session-pilot` at `D:/repos/dev-pomogator-session-pilot`) will consume `worktree-doctor.cjs --quick` contract introduced by this spec. After this spec merges to main, the session-pilot branch rebases on main and picks up worktree-doctor.cjs via installer auto-update. session-pilot-side implementation (indexer + handlers + frontend changes for "bootstrap" column) is OUT OF SCOPE of this spec.

### Spec quality milestones

- 4 spec-review rounds: 2 P0 (wrong file reference, hardcoded identifier) + 2 P1 (UC-3 decision, env key collision) caught and resolved; 4 carry-over residual references found and fixed in Round 4
- 2 feedback memories captured during spec generation: `feedback_no-hardcoded-repo-or-user-identifiers.md`, `feedback_env-first-then-investigate-then-ask.md` — both consumed via new spec-review Category 14
- create-spec skill enhanced with Pre-Write Verification Checklist (Phase 1: 3 items, Phase 2: 8 items) — would have caught all 4 P0/P1 found in this spec at generation time
- spec-review skill extended with Category 14 (Memory-aware constraint compliance) — runs every phase, scans project memory for forbidden literals

## [0.1.0] — TBD (implementation)

### Added
- Skill `worktree-setup` (TypeScript orchestration in `.claude/skills/worktree-setup/`)
- Global `worktree-doctor.cjs` with full + `--quick` modes (installed to `~/.dev-pomogator/scripts/`)
- Self-heal block in `src/scripts/tsx-runner.js` (orphan worktree detection + JSONL audit + stderr hint with session-scoped deduplication)
- Three-layer config resolution for PR creation (env file → agent investigation → AskUserQuestion last resort)
- `extensions/worktree-setup/extension.json` manifest for installer-managed artifact tracking

### Changed
- `src/scripts/tsx-runner.js` extended with orphan-detect block after `resolveScriptPath()` line 107 (non-invasive — adds ≤5ms in happy path)

### Implementation notes
- TBD: PR URL when merged
