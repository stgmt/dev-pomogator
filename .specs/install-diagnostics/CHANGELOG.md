# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased] - 2026-04-09

### Added
- Spec `.specs/install-diagnostics/` с full 13-file structure
- BDD scenarios CORE003_18 (Linux control) + CORE003_19 (Windows TDD red) в `tests/features/core/CORE003_claude-installer.feature`
- Integration tests `describe.skipIf` блоки в `tests/e2e/claude-installer.test.ts` с парными `it()` для каждого assertion
- Helper `runInstallerViaNpx(args, options): Promise<NpxInstallResult>` в `tests/e2e/helpers.ts` для запуска `npx --yes github:stgmt/dev-pomogator` в isolated temp dir с capture cleanup warnings
- Diagnostic skill `.claude/skills/install-diagnostics/SKILL.md` с 4-mode classification (A=Win EPERM, B=missing dist, C=installer crash, D=top error)

### Changed
- N/A — все изменения additive

### Fixed
- N/A — это regression coverage, не fix самого bug-а. Сам silent install bug (npm reify EPERM на Windows) НЕ исправлен и требует upstream npm fix или local workaround (см. [RESEARCH.md](RESEARCH.md) и Phase 2 BLOCKED в [TASKS.md](TASKS.md))

## [0.1.0] - 2026-04-09

### Added
- Initial spec scaffold via `scaffold-spec.ts`
