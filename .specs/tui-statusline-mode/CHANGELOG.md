# Changelog

All notable changes to this feature will be documented in this file.

## [0.1.0]

### Added
- **CompactBar** — 3-строчный виджет (прогресс + текущий тест + кнопки управления) для TUI test runner, заменяющий отдельный `statusline_render` в Claude Code statusline.
- Переключение между полным 4-tab интерфейсом и компактным баром через CSS-класс `.compact` на одном Screen — без дублирования state.
- Остановка тестов по PID из YAML-статуса — кросс-платформенно (SIGTERM на Unix / `taskkill` на Windows).
