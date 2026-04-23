# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Version-aware Codex capability model instead of a frozen `0.114.0` snapshot.
- Trusted-project and additive global-layer requirements for `.codex/*`.
- Hook dispatcher requirement to avoid concurrent managed hook races on shared events.
- Support matrix semantics `supported` / `partial` / `excluded` with version floors and limitations.
- Explicit upstream watchlist for missing Codex capabilities to revisit later (`Write/Edit` hooks, plan-mode event, status line surface, ordered hook chain, Windows hook clarity).
- Explicit note that `ExitPlanMode` was not found in primary Codex sources as of 2026-04-18, so it cannot be used as a current design assumption.

### Changed
- `README.md`, `RESEARCH.md`, `FR.md`, `NFR.md`, `ACCEPTANCE_CRITERIA.md`, `DESIGN.md` and `TASKS.md` are being rewritten around the current Codex docs surface.
- Windows strategy changed from outdated `bash/sh` assumption to native-first with WSL fallback.
- Hook and parity model now distinguishes Bash-only tool interception from broader Claude-only semantics.

### Fixed
- Removed the outdated assumption that Codex only supports `SessionStart` and `Stop`.
- Corrected the role of `AGENTS.md` vs `CLAUDE.md` in Codex instruction discovery.
- Closed spec gaps around trust onboarding, global hook coexistence and false full-parity claims for Claude-only plugin behavior.

## [0.1.0] - TBD

### Added
- Initial implementation
