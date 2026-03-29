# Functional Requirements (FR)

## FR-1: Auto-install claude-mem-health extension @feature1

Когда `needsClaudeMem=true` (определяется по selected extensions), installer MUST автоматически установить `claude-mem-health` extension вместе с его hooks. Юзер НЕ ДОЛЖЕН выбирать его вручную.

## FR-2: Post-install validation @feature2

После завершения `ensureClaudeMem()`, installer MUST проверить:
- Worker отвечает на `GET /api/health` (port 37777)
- Chroma отвечает на `GET /api/v2/heartbeat` (port 8000) — или зафиксировать что chroma unavailable
- MCP server binary exists и файл непустой

Результат validation записывается в install report с per-component статусами.

## FR-3: Structured error logging для всех 20 точек отказа @feature3

Каждая точка отказа в `memory.ts` MUST логировать в `install.log` через `installLog.error()` или `installLog.warn()`:
- Какой шаг (step name)
- Что именно сломалось (error message)
- Контекст (file path, port, command)
- Stack trace (через `formatErrorChain`)

Не только console.log yellow warning.

## FR-4: User-facing diagnostics @feature4

При сбое claude-mem, юзер видит в console:
- Какой шаг сломался (1-строка)
- Конкретная причина
- Путь к install.log для деталей
- Install report (`~/.dev-pomogator/last-install-report.md`) с per-component таблицей

## FR-5: Graceful degradation @feature5

Если chroma не стартует — claude-mem ДОЛЖЕН работать в degraded mode:
- Worker стартует без chroma (basic memory: observations, context injection)
- Semantic search недоступен — логировать как warning, не error
- Install report: claude-mem: warn (not fail) + "chroma unavailable, basic memory works"

Если worker не стартует — claude-mem FAIL:
- MCP НЕ регистрируется (нет смысла указывать на мёртвый worker)
- Install report: claude-mem: fail + конкретная причина

## FR-6: Re-install idempotency @feature6

Повторная установка (`--claude --all`) при уже работающем claude-mem:
- isWorkerRunning() → skip re-clone/rebuild
- Health check → всё ok → skip
- Hooks не дублируются (existing smart merge)
- Install report: claude-mem: ok (skipped, already running)

## FR-7: Integration tests для failure modes @feature7

Тесты MUST покрывать:
- Чистая установка → все компоненты ok (existing, усилить)
- Post-install validation → worker health + chroma heartbeat
- claude-mem-health hooks registered в settings.json после install
- Install report содержит per-component статусы
- Graceful degradation: chroma off → worker still starts → report: warn

Тесты integration-first: runInstaller() → check real state, не source scan.
