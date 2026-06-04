# Native Statusline

Авто-установка **нативного** statusLine Claude Code (главная строка состояния = `ccstatusline`,
git/model info) пользователям dev-pomogator. Восстанавливает регрессию: v1-инсталлер, писавший
`statusLine` в `~/.claude/settings.json`, удалён при переезде на canonical plugin (коммит `43cf946`),
а canonical-плагин не умеет ставить главный statusLine декларативно.

⚠️ **Разграничение доменов:** это НЕ строка прогресса тестов (TUI `compact_bar.py` /
`test-statusline` / `tui-statusline-mode`). Тот домен — отдельные спеки, его код не трогается (FR-9).

## Ключевые идеи

- **SessionStart-хук** в новом домене `tools/native-statusline/` сам пишет `statusLine` в user settings.json (единственный путь в canonical-модели — plugin.json не поддерживает главный statusLine).
- **Reconciler** (порт старого `resolveClaudeStatusLine`, образец `pardes/reconcile-settings.ts`): пустой слот → install, наш маркер `ccstatusline` → noop, чужая строка → keep-user (не перетираем).
- **Идемпотентность + fail-open + atomic write**; выключатель `DEV_POMOGATOR_STATUSLINE=off`.
- **`/pomogator-doctor` fix-action** для немедленного применения в текущей сессии (хук подхватится только со следующей — settings читаются до хука).

## Где лежит реализация

- **App-код**: `tools/native-statusline/reconcile-statusline.ts`, `tools/native-statusline/install_native_statusline.ts`
- **Wiring**: `.claude-plugin/hooks.json` (canonical) + `.claude/settings.json` (dogfood)
- **Doctor**: `.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts`
- **Tests**: `tests/e2e/native-statusline.test.ts` + `tests/features/native-statusline.feature` (NSL001)
- **Расследование регрессии**: `audit-reports/statusline-install-regression-analysis.md`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
