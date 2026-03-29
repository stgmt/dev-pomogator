# Use Cases

## UC-1: Аномальное удаление — auto-recovery @feature1

Claude Code обновился или внешний процесс удалил `~/.dev-pomogator/`. Пользователь запускает Claude Code сессию.

- SessionStart hook или project hook детектит отсутствие `~/.dev-pomogator/`
- Проверяет: есть ли маркер легитимного uninstall в `~/.dev-pomogator-uninstalled` (вне удалённой директории)
- Маркера нет → аномальное удаление → запуск recovery: `setupGlobalScripts()` из бандла
- Логирует: `[RECOVERY] ~/.dev-pomogator/ restored (anomalous deletion detected)`
- Hooks, контекстное меню, auto-update — работают

## UC-2: Легитимный uninstall @feature2

Пользователь запускает `uninstall.ps1`.

- Uninstaller пишет маркер-файл `~/.dev-pomogator-uninstalled` (timestamp + reason) ПЕРЕД удалением `~/.dev-pomogator/`
- Удаляет `~/.dev-pomogator/`
- Следующий SessionStart: директория отсутствует, но маркер есть → пропуск recovery
- Логирует: `[SKIP] ~/.dev-pomogator/ removed by uninstaller, no recovery`

## UC-3: Первая установка @feature1

`~/.dev-pomogator/` не существует, маркера нет, `config.json` отсутствует.

- SessionStart hook детектит отсутствие директории
- Маркера нет, но config.json тоже нет → первая установка, не аномалия
- Логирует: `[SKIP] first install — run installer`
- НЕ запускает recovery (нечего восстанавливать без config)

## UC-4: Global settings.json сброшен @feature1

Claude Code обновился, сбросил `~/.claude/settings.json`. SessionStart hook потерян.

- Project-level hook (Stop/PreToolUse) детектит что `~/.dev-pomogator/scripts/tsx-runner.js` отсутствует
- Запускает recovery (восстанавливает global scripts)
- Перезаписывает `~/.claude/settings.json` SessionStart hook
- Логирует: `[RECOVERY] SessionStart hook re-registered`
