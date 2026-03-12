# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Split BDD suite: core scenarios and one `.feature` file per plugin parity path instead of one monolithic Codex feature file.
- Explicit implementation tasks for `tests/e2e/helpers.ts`, `Dockerfile.test`, `src/installer/memory.ts` and `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`.
- Dedicated traceability section for the new core/plugin feature layout.

### Changed
- `TASKS.md` now follows split BDD structure, aligns core paths with existing repo conventions and explicitly creates missing plugin suite directories where they do not exist yet.
- `FILE_CHANGES.md` now reflects manifest normalization, Codex CLI Docker harness, MCP setup adaptation and Claude-memory coupling as first-class work items.
- `README.md` now documents the feature suite as a core/plugin matrix instead of a single feature file.

### Fixed
- Eliminated the outdated assumption that one giant `codex-cli-support.feature` is the right testing boundary for Codex support.
- Closed spec gaps around Windows universal bootstrap entrypoint, dual-platform-only test helpers and Codex-unaware MCP setup tooling.
- Restored explicit BDD coverage for the shared `v0.114.0` hook entry schema contract after feature suite splitting.

## [0.1.0] - TBD

### Added
- Initial implementation
