# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Спека `out-session-advisor` (14.08.2026): паттерн «двойная сессия — адвизор + воркер» + параллельная безопасность (склейка из `parallel-session-safety`).
- Phase 1 Discovery: 10 user stories, 11 use cases, research с verified-фактами (субагенты, ConPTY, домашние истины Ozon, PoC VERDICT WORKS).
- Phase 2: FR-1..10 + AC-1..10 (EARS), NFR, REQUIREMENTS с CHK-матрицей, DESIGN (7 Key Decisions, BDD Test Infrastructure), SCHEMA (ctl/rsp + lock JSON + inventory), FILE_CHANGES.
- Phase 3: TASKS (TDD Red→Green→Refactor), README, CHANGELOG.

### Changed
- Склейка: `.specs/parallel-session-safety/` удалена, её FR-1..5 → FR-6..10 в `out-session-advisor`.

### Fixed
- (нет)

## [0.1.0] - TBD

### Added
- Initial implementation