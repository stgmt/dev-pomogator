# Bg Task Guard

Claude Code hooks (PostToolUse + Stop) для автоматического продолжения работы после запуска фоновых задач. PostToolUse создаёт marker при `run_in_background`, Stop hook блокирует idle stop пока marker активен (TTL 15 мин).

## Ключевые идеи

- PostToolUse hook детектит "Command running in background" в Bash stdout → создаёт marker
- Stop hook проверяет marker age → блокирует stop если < 15 мин
- Fail-open: ошибки hook-а не блокируют Claude

## Навигация

- [User Stories](USER_STORIES.md)
- [Use Cases](USE_CASES.md)
- [Requirements](REQUIREMENTS.md)
- [FR](FR.md) | [NFR](NFR.md) | [AC](ACCEPTANCE_CRITERIA.md)
- [Design](DESIGN.md)
- [Tasks](TASKS.md)
- [File Changes](FILE_CHANGES.md)
- [BDD Feature](bg-task-guard.feature)

## Где лежит реализация

- Hook scripts: `extensions/test-statusline/tools/bg-task-guard/`
- Hook config: `extensions/test-statusline/extension.json`
