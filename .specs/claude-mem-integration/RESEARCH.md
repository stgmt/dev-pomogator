# Research

## Аудит текущего состояния (2026-03-28)

### Архитектура claude-mem

Два процесса + vector DB:
- **Worker** (port 37777) — Express.js через Bun, SQLite + REST API, обработка observations через Claude Agent SDK
- **Chroma** (port 8000) — Python vector DB для semantic search, опционален
- **MCP server** (stdio) — mcp-server.cjs, подключается к worker через HTTP

Код установки: `src/installer/memory.ts` (686 строк), 7 шагов:
1. ensureBun → 2. installClaudeMemPlugin → 3. cloneAndBuildRepo → 4. ensureChromaExternalMode → 5. startChromaServer → 6. startClaudeMemWorker → 7. registerClaudeMemMcp

### 3 критические проблемы

**1. claude-mem-health extension НИКОГДА не устанавливается автоматически**
- `suggest-rules` имеет `requiresClaudeMem: true` → триггерит `ensureClaudeMem()`
- Но `claude-mem-health` (SessionStart hook для авто-рестарта chroma) — отдельный extension
- Нет механизма auto-dependency: когда needsClaudeMem=true, health extension не подтягивается
- Результат: хуки claude-mem не регистрируются в settings.json

Evidence: `extensions/claude-mem-health/extension.json` — нет `requiresClaudeMem`, нет auto-install trigger

**2. Нет post-install validation**
- `ensureClaudeMem()` завершается на line 726 memory.ts
- НЕ проверяет: worker /api/health, chroma heartbeat, MCP alive
- "Installation complete!" при мёртвых сервисах

Evidence: memory.ts line 726 — return без validation; index.ts line 221 — "Installation complete" безусловно

**3. 12 из 20 точек отказа не логируются в install.log**
- Только yellow console.log warning, не installLog.error()
- pip install fail, chroma binary not found, chroma spawn fail, chroma heartbeat timeout, worker spawn fail, worker health fail — всё только в console

Evidence: memory.ts lines 258, 318, 340, 354, 475, 630 — console.log без installLog

### 20 точек отказа (полная таблица)

| # | Шаг | Видно юзеру? | В install.log? | Есть тест? |
|---|-----|:---:|:---:|:---:|
| 1 | bun install | Да | Да | Нет |
| 2 | claude CLI plugin add | Частично | Да | Нет |
| 3 | claude CLI plugin install | Частично | Да | Нет |
| 4 | git clone (3 retries) | Да | Да | Частично |
| 5 | bun install deps | Да | Да | Частично |
| 6 | bun run build | Да | Да | Частично |
| 7 | pip install chromadb | Да | **Нет** | Нет |
| 8 | chroma shim creation | **Нет** | **Нет** | Нет |
| 9 | find chroma binary | Да | **Нет** | Нет |
| 10 | spawn chroma process | Частично | **Нет** | Нет |
| 11 | chroma heartbeat 30s | Да | **Нет** | Нет |
| 12 | worker-service.cjs check | **Нет** | **Нет** | Частично |
| 13 | worker spawn | Частично | **Нет** | Нет |
| 14 | worker health 3s | Частично | **Нет** | Частично |
| 15 | settings.json corrupted | **Нет** | **Нет** | Нет |
| 16 | MCP write fail | Да | Да | Нет |
| 17 | mcp-server.cjs missing | Да | **Нет** | Нет |
| 18 | settings write fail | **Нет** | Да | Нет |
| 19 | **health hooks not installed** | **Нет** | **Нет** | **Нет** |
| 20 | **post-install validation** | **Нет** | **Нет** | **Нет** |

### Что уже сделано (в текущей сессии, не закоммичено)

| Файл | Что |
|------|-----|
| `src/utils/logger.ts` | `formatErrorChain()` + `getErrorMessage()` |
| `src/installer/index.ts` | catch логирует reason + стек в install.log, InstallReport wired |
| `src/installer/report.ts` | Новый файл — InstallReport class |
| `src/updater/index.ts` | Silent catch → logging |
| `src/updater/standalone.ts` | `.catch(() => {})` → logging |
| `tests/e2e/claude-installer.test.ts` | 11 новых тестов (pipeline + report + content validation) |
| Feature files | CORE003 + PLUGIN002 updated |

### Внешний контекст: claude-mem repo

Source: https://github.com/thedotmack/claude-mem [VERIFIED: 2026-03-28]
- Version: 10.6.2
- 5 lifecycle hooks: setup, SessionStart (smart-install + worker-service + context), UserPromptSubmit, PostToolUse, Stop
- Worker REST API: /health, /api/readiness, /api/observations, /api/projects, /api/search, /api/timeline
- MCP tools: search, timeline, get_observations, __IMPORTANT
- Settings: ~/.claude-mem/settings.json (CHROMA_MODE, WORKER_PORT, etc.)

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Impact |
|------|------|--------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp+move |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Манифест = source of truth |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через runInstaller, не unit |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты в background |

### Existing Patterns

| Source | Path | Relevance |
|--------|------|-----------|
| memory.ts | `src/installer/memory.ts` | 686 строк — основной код, рефакторинг |
| health-check.ts | `extensions/claude-mem-health/tools/claude-mem-health/health-check.ts` | SessionStart hook — нужен auto-install |
| suggest-rules ext | `extensions/suggest-rules/extension.json` | requiresClaudeMem: true — trigger |
| helpers.ts | `tests/e2e/helpers.ts` | startWorker, stopWorker, isWorkerRunning, getClaudeMemDir |
