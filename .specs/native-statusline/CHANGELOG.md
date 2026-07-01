# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Spec created (Phase 1-3): домен **native-statusline** — авто-установка нативного `statusLine` (ccstatusline) через SessionStart-хук.
- 10 FR / 10 AC (EARS) / 14 CHK; `.feature` NSL001 (10 сценариев); DESIGN с 3 Key Decisions; SCHEMA контрактов; TASKS (TDD, 18 задач).
- **Реализация** (ветка `feat/phase-2a-mcp-server-and-hooks`): `tools/native-statusline/reconcile-statusline.ts` (reconciler + atomic writer), `tools/native-statusline/install_native_statusline.ts` (SessionStart-хук), `tools/native-statusline/apply-statusline.ts` (doctor fix-action CLI — немедленное применение), doctor check `checks/statusline.ts` + offer/apply step в pomogator-doctor SKILL.md, тесты `tests/e2e/native-statusline.test.ts`.
- Хук зарегистрирован в `.claude-plugin/hooks.json` (users) + `.claude/settings.json` (dogfood); env-выключатель `DEV_POMOGATOR_STATUSLINE` в `.env.example`.

### Changed
- `vitest.config.ts`: снят exclude `tests/e2e/tui-statusline.test.ts`.

### Removed
- Мёртвый `tests/e2e/tui-statusline.test.ts` (импортил удалённый installer-era `src/utils/statusline.ts`).

### Fixed
- Регрессия «нативный statusLine не ставится новым юзерам» (см. `audit-reports/statusline-install-regression-analysis.md`). **Verified:** NSL001 10/10 PASS в Docker (exit 0); smoke хука (install/idempotent/opt-out) подтверждён. **Pending:** ручной E2E (install→restart→рендер) — автотесты доказывают запись, не рендер.

## [0.1.0] - TBD

### Added
- Initial implementation (по TASKS.md): reconciler + atomic writer + SessionStart-хук + регистрация + doctor fix-action + интеграционные тесты.
