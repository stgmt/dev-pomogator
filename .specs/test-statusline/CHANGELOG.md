# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Statusline render script with progress bar, ANSI colors, multi-state display (FR-1, FR-1a)
- YAML status file protocol v1 with 13 mandatory fields (FR-2)
- Test runner wrapper with atomic YAML writes via temp+rename (FR-3, FR-4)
- SessionStart hook for directory init and env var setup (FR-6)
- Stale session cleanup on SessionStart (FR-7)
- Session isolation via session_id prefix (FR-5)
- Extension manifest for dev-pomogator installer (FR-8)
- Docker test isolation via unique COMPOSE_PROJECT_NAME per session (FR-9)
- `scripts/docker-test.sh` — bash wrapper with session-isolated Docker Compose
- `docker-compose.test.yml` — `image:` directive for shared image across project names
- `dispatch.ts` — `generateProjectName()` for Docker command isolation
- Ecosystem deep research: 6+ community проектов, официальный API schema, cchooks SDK (FR-10 defined)
- Forkable projects analysis: oh-my-claude, cc-marketplace-boilerplate, claude-hooks, cchooks
- FR-10: Hooks Integrity Guard — SessionStart валидация и автовосстановление hooks (planned)

### Changed
- Statusline render: unicode progress bar (▓░), emoji indicators (✅❌⏳), color thresholds (green/yellow/red by fail ratio)

## [0.1.0] - TBD

### Added
- Initial implementation
