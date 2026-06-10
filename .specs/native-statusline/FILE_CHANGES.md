# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.
Домен: NATIVE statusline. ⚠️ НЕ содержит путей из `tools/test-statusline/` (другой домен) — см. FR-9.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/native-statusline/reconcile-statusline.ts` | create | [FR-1](FR.md#fr-1-reconciler-slot-classification), [FR-4](FR.md#fr-4-ownership-marker) — чистый reconciler + ownership-маркер |
| `tools/native-statusline/install_native_statusline.ts` | create | [FR-2](FR.md#fr-2-atomic-conditional-writer), [FR-3](FR.md#fr-3-native-statusline-sessionstart-hook), [FR-5](FR.md#fr-5-opt-out-switch), [FR-8](FR.md#fr-8-idempotent-and-fail-open) — хук + atomic writer + env gate + fail-open |
| `tools/native-statusline/apply-statusline.ts` | create | [FR-7](FR.md#fr-7-doctor-check-and-fix-action) — CLI fix-action (немедленное применение из doctor, игнорит opt-out как явное действие) |
| `.claude/skills/pomogator-doctor/SKILL.md` | edit | [FR-7](FR.md#fr-7-doctor-check-and-fix-action) — шаг offer+apply native statusLine + AskUserQuestion в allowed-tools |
| `tools/native-statusline/package.json` | create | Маркер пакета домена (как у tools/test-statusline/package.json) |
| `.claude-plugin/hooks.json` | edit | [FR-6](FR.md#fr-6-hook-registration) — SessionStart-entry для users |
| `.claude/settings.json` | edit | [FR-6](FR.md#fr-6-hook-registration) — SessionStart-entry для dogfood |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts` | create | [FR-7](FR.md#fr-7-doctor-check-and-fix-action) — doctor check |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | [FR-7](FR.md#fr-7-doctor-check-and-fix-action) — зарегистрировать новый check |
| `.env.example` | edit | [FR-5](FR.md#fr-5-opt-out-switch) — документировать `DEV_POMOGATOR_STATUSLINE=off` |
| `tests/e2e/native-statusline.test.ts` | create | Интеграционные тесты (hook→settings.json read-back, идемпотентность, fail-open) |
| `tools/native-statusline/ccstatusline-widgets.ts` | create | [FR-11](FR.md#fr-11-widget-config-seeding-and-repair-repo--cwd) — reconcile + atomic writer widget-конфига (install/enrich/keep-user) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/statusline-widgets.ts` | create | [FR-11](FR.md#fr-11-widget-config-seeding-and-repair-repo--cwd) — doctor check C-NSW (repo + cwd на баре) |
| `README.md` | edit | [FR-11](FR.md#fr-11-widget-config-seeding-and-repair-repo--cwd) — user-facing документация native statusline (столбик, keep-user, opt-out, doctor) |
| `tests/features/native-statusline.feature` | create | BDD-сценарии NSL001 1:1 с тестами |
| `tests/e2e/tui-statusline.test.ts` | delete | Мёртвый тест на удалённую `src/utils/statusline.ts` (исключён в vitest.config) |
| `vitest.config.ts` | edit | Снять exclude `tests/e2e/tui-statusline.test.ts`; (новый тест включается автоматически) |
| `CLAUDE.md` | edit | Добавить строку про native-statusline в индекс (claude-md-glossary) |
