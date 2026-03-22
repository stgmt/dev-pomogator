# Research

## Контекст

Claude Code останавливается после запуска фоновых задач (`run_in_background: true`) несмотря на правила и memory-записи. Нужен технический enforcement через Claude Code hooks API.

## Источники

- Claude Code hooks documentation (Context7)
- Существующие hooks в проекте: test-guard (PreToolUse), auto-simplify (Stop), statusline_session_start (SessionStart)

## Технические находки

### Claude Code Hook API

| Event | Когда | Может блокировать |
|-------|-------|-------------------|
| PreToolUse | Перед вызовом tool | Да (`decision: "block"`) |
| PostToolUse | После завершения tool | Нет (информационный) |
| Stop | Когда Claude заканчивает ответ | Да (`decision: "block"`) |
| SessionStart | Начало сессии | Нет |

Stop hook может вернуть `{"decision": "block", "reason": "..."}` — Claude получит reason как systemMessage и продолжит.

### Паттерн `run_in_background`

Когда Bash tool запускается с `run_in_background: true`, stdout содержит:
```
Command running in background with ID: <id>. Output is being written to: <path>
```

Это детерминистичный маркер — можно обнаружить через grep в PostToolUse hook.

### Существующий Stop hook (auto-simplify)

`extensions/auto-simplify/tools/auto-simplify/simplify-stop-hook.ts` — пример Stop hook. Читает stdin JSON, решает block/approve, возвращает JSON на stdout.

### Marker file подход

- Используется в проекте: `session.env`, `.bg-task-active`
- TTL через `stat.mtime` — тот же паттерн что в `yaml_reader.py` и `app.py` hot-reload
- Fail-open: если marker не читается → не блокировать

## Где лежит реализация

- Hook scripts: `extensions/test-statusline/tools/bg-task-guard/`
- Hook config: `extensions/test-statusline/extension.json` → hooks section
- Installed: `.dev-pomogator/tools/bg-task-guard/`

## Выводы

Stop hook + PostToolUse marker — надёжный подход. PostToolUse создаёт marker, Stop hook проверяет. TTL 15 мин для stale protection.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Не блокировать сессию ожиданием Docker тестов | Docker тесты | FR-1 |
| post-edit-verification | `.claude/rules/pomogator/post-edit-verification.md` | Запускать тесты в background после правок | Правки кода | FR-1 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth | Изменения extension | FR-1 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| auto-simplify Stop hook | `extensions/auto-simplify/tools/auto-simplify/simplify-stop-hook.ts` | Паттерн Stop hook с stdin JSON + decision output | Основа для stop-guard |
| test-guard PreToolUse | `extensions/test-guard/tools/test-guard/test-guard.ts` | Паттерн PreToolUse hook с matcher | Не применим (PostToolUse нужен) |
| session.env marker | `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` | Marker файл pattern | Reuse для `.bg-task-active` |

### Architectural Constraints Summary

- Hooks в extension.json должны быть в object-format `{claude: {EventName: ...}}`
- Hook scripts должны быть в toolFiles manifest
- Stop hook: stdin = JSON с session info, stdout = JSON с decision
- PostToolUse hook: stdin = JSON с tool_input/tool_output, stdout = JSON с systemMessage (опционально)
