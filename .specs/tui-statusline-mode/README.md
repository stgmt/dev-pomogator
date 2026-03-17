# TUI Statusline Mode

Compact mode для TUI test runner — 3-строчный виджет вместо полного 4-tab интерфейса. Заменяет отдельный test-statusline render в Claude Code statusline.

## Ключевые идеи

- CompactBar: 3 строки (прогресс + текущий тест + кнопки) — замена statusline_render
- CSS class toggle `.compact` — один Screen, нет дублирования state
- Stop tests по PID из YAML — кросс-платформенный (SIGTERM / taskkill)

## Где лежит реализация

- **TUI App**: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py`
- **CompactBar**: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/compact_bar.py`
- **Stop handler**: `extensions/tui-test-runner/tools/tui-test-runner/tui/stop_handler.py`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
