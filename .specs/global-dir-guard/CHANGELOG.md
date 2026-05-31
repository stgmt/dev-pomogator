# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Uninstall маркер `~/.dev-pomogator-uninstalled` в `uninstall.ps1`
- 8 BDD сценариев (GUARD001_01..08)
- Guard hook в project settings (PreToolUse)

### Changed
- `scripts/build-check-update.js` — добавлен esbuild entry для guard
- `.claude/skills/skills-rules-optimizer/scripts/shared.ts` — копирование guard в global scripts

### Fixed
- `@sel.path` → `@sel.dir` в `postinstall.ts` (контекстное меню не работало на фоне папки)

## [0.1.0] - TBD

### Added
- Initial implementation
