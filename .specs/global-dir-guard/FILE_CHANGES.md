# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `src/guard/global-dir-guard.ts` | create | [FR-2](FR.md#fr-2-детекция-аномального-удаления-feature1), [FR-3](FR.md#fr-3-auto-recovery-global-scripts-feature1), [FR-4](FR.md#fr-4-re-registration-sessionstart-hook-feature1) — основная логика guard |
| `scripts/build-check-update.js` | edit | Добавить esbuild бандлинг `global-dir-guard.ts` → `dist/global-dir-guard.cjs` |
| `dist/global-dir-guard.cjs` | create | Бандл guard скрипта |
| `uninstall.ps1` | edit | [FR-1](FR.md#fr-1-uninstall-маркер-feature2) — запись маркера перед удалением |
| `uninstall.sh` | create | [FR-1](FR.md#fr-1-uninstall-маркер-feature2) — bash версия uninstaller с маркером |
| `src/installer/claude.ts` | edit | [FR-4](FR.md#fr-4-re-registration-sessionstart-hook-feature1) — добавить guard hook в project settings |
| `src/installer/shared.ts` | edit | Экспортировать `recoveryScriptsList` для переиспользования в guard |
| `tests/e2e/global-dir-guard.test.ts` | create | BDD тесты для guard |
| `tests/features/plugins/global-dir-guard/global-dir-guard.feature` | create | BDD feature сценарии |
| `extensions/context-menu/tools/context-menu/postinstall.ts` | edit | Баг `@sel.path` → `@sel.dir` (уже применён) |
