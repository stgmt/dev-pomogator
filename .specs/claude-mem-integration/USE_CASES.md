# Use Cases

## UC-1: Чистая установка с suggest-rules

Юзер запускает `--claude --all`. suggest-rules имеет `requiresClaudeMem: true`.

- Installer вызывает `ensureClaudeMem('claude')`
- Bun установлен → repo клонирован → built → chroma started → worker started → MCP registered
- **claude-mem-health extension автоматически установлен** (hooks в settings.json)
- Post-install validation: worker /api/health → 200, chroma /api/v2/heartbeat → 200
- Install report содержит claude-mem: ok + все компоненты

## UC-2: Chroma не стартует (Python chromadb не найден)

- startChromaServer() не находит бинарь → pip install fails
- Installer логирует причину в install.log с контекстом
- Install report содержит claude-mem: warn + "chroma not started, memory works without vector search"
- Worker стартует без chroma (basic memory работает, semantic search — нет)
- Юзер видит: что именно сломалось + как починить (install python3, pip install chromadb)

## UC-3: Worker не стартует (порт занят)

- startClaudeMemWorker() → port 37777 busy
- Installer логирует: "port 37777 already in use"
- Post-install validation видит: worker not responding
- Install report: claude-mem: fail + "worker port conflict"
- Юзер видит причину + remediation (kill process on port, or change port)

## UC-4: Повторная установка (re-install)

- claude-mem уже установлен и работает
- Re-install НЕ ломает существующую установку
- Health check показывает всё ok → skip re-clone/rebuild
- Hooks не дублируются

## UC-5: SessionStart — health check авто-рестарт

- Юзер открывает Claude Code
- SessionStart hook (claude-mem-health) проверяет chroma heartbeat
- Если chroma мёртв → авто-рестарт через Python binary
- Если worker мёртв → warning в stderr (не блокирует сессию)
