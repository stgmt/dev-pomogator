# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Спека создана (Phase 1-3 завершены).
- 8 BDD сценариев (CORE023_01..CORE023_08) — fresh install / preserve keys / idempotent / bump < 1.0 / broken JSON / invalid type / single report line / atomic write.
- 13 CHK rows в Verification Matrix покрывающие FR-1..FR-4 + NFR-S1/S2 + NFR-R1/R2.
- 8 задач в TASKS.md (TDD-порядок: Phase 0 → Phase 1 → Phase 2).

### Changed
- Подход упрощён по explicit user feedback (2026-05-11) с "auto-tune budget по количеству skills" на "тупая константа 1.0".

### Fixed
- Покрыт edge case "битый JSON в settings.json" — backup + rewrite вместо silent fail.

## [0.2.0] - 2026-05-11 — Refactor to separate extension

### Changed
- Логика перенесена из core installer (`src/installer/skill-budget.ts`) в полноценную extension `extensions/skill-listing-budget/` с собственным manifest, README, tool. Установка теперь через стандартный extension flow.

### Added
- `extensions/skill-listing-budget/extension.json` — manifest с tools, SessionStart hook, postInstall hook.
- `extensions/skill-listing-budget/README.md` — user-facing README plugin (зачем / что делает / 6-веток таблица / откат / out of scope).
- `extensions/skill-listing-budget/tools/skill-listing-budget/apply_skill_budget.ts` — self-contained tool (no deps кроме `node:fs/path/os`).

### Removed
- `src/installer/skill-budget.ts` — дублирующая логика, заменена extension-ом.
- `src/installer/index.ts` inline call — extension hooks (`postInstall` + `SessionStart`) делают то же самое.
- `src/installer/report.ts` `recordSkillBudget()` метод — лишний, extension пишет в stderr.

## [0.1.0] - 2026-05-11 — Initial implementation (core-installer pattern)

### Added
- `src/installer/skill-budget.ts` — функция `ensureSkillListingBudget()` с 4 решающими ветками (added / unchanged / bumped / invalid-recovered).
- `tests/e2e/skill-listing-budget.test.ts` — 11 integration тестов.
- `tests/features/core/CORE023_skill-listing-budget.feature` — BDD сценарии 1:1 mapping.

### Verified
- 11/11 tests passed в Docker (27s) при первом запуске.
- `npm run build` clean.
- Real-world: применён к `~/.claude/settings.json` живой машины — warning «Skill listing will be truncated» исчез.
