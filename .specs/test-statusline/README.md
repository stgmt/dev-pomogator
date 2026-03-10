# Test Statusline

Расширение для Claude Code, отображающее прогресс тестов в statusline. Использует YAML status files как протокол обмена данными между test runner wrapper и statusline render script. Поддерживает параллельные сессии через session isolation.

## Ключевые идеи

- YAML status file как контракт между wrapper и renderer (no daemon)
- Session isolation через session_id prefix (первые 8 символов)
- Atomic YAML writes (temp file + rename) для предотвращения partial reads
- Graceful degradation: fail-silent при любых ошибках
- Cross-platform: macOS, Linux, Windows (Git Bash)

## Где лежит реализация

- **Extension source**: `extensions/test-statusline/tools/test-statusline/`
- **Deployed tools**: `.dev-pomogator/tools/test-statusline/`
- **Status data**: `.dev-pomogator/.test-status/status.{prefix}.yaml`
- **Hook config**: `.claude/settings.json` > `hooks.SessionStart`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
