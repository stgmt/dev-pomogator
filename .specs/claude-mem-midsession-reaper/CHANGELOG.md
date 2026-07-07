# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Specified a PreToolUse mid-session claude-mem reaper guard that reuses the existing SessionStart reaper logic.
- Added BDD scenarios for wedged-worker reap, healthy no-op, debounce, hook registration, opt-out fail-open behavior, and visible stale-memory warnings.

### Changed
- Planned canonical plugin and repo dogfood hook manifests to register the claude-mem health check on PreToolUse in addition to SessionStart.

### Fixed
- Planned mitigation for claude-mem workers that wedge after SessionStart, leaving active sessions exposed to 60-second UserPromptSubmit hook stalls.

## [0.1.0] - TBD

### Added
- Initial implementation will add the mid-session guard, hook wiring, and focused BDD coverage.
