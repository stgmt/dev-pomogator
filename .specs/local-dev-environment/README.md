# Local Dev Environment — артефакты для разработчика, использующего Claude Code в smarts

Эта спека собирает локальные dev-environment helpers, которые до этого жили в working-dir конкретного разработчика smarts (Руднев М. И.) и не имели прописки. Содержательно — два независимых артефакта:

1. **`learnings-queue-sample.json`** — снимок очереди auto-capture сигналов из smarts working-dir на 2026-05-07.
   - Формат — same as `.dev-pomogator/learnings-queue.json` (см. `.specs/auto-capture/`).
   - 7 pending entries (T3 «repeated confusion» × 4, T5 «pattern» × 3) — сигналы, которые auto-capture hook собирал в течение MS-18576 fix-сессии.
   - Назначение здесь: реальный пример того, что хук кладёт в очередь по мере работы. Полезен как fixture для тестов `auto-capture` и как пример структуры для других плагинов, которые хотят слать сигналы в эту же queue.
   - НЕ committable в smarts: per-developer state, у каждого своя очередь.

2. **`setup-edge-debug-port.ps1`** — Windows PowerShell helper, навсегда настраивающий Microsoft Edge запускаться с `--remote-debugging-port=9222`.
   - Модифицирует все .lnk shortcuts (Start Menu, Taskbar pinned, Desktop, Quick Launch) и ProgID registry handlers (MSEdgeHTM, MSEdgeHTML, MSEdgePDF, microsoft-edge:).
   - Сохраняет JSON backup для одно-командного revert (`-Revert`).
   - Назначение здесь: prerequisite для skill'ов `claude-in-chrome-*` (см. `.specs/backlog/claude-in-chrome-multisession/`, `.specs/backlog/chrome-devtools-mcp-mux/` — обе спеки в backlog) — без debug-port browser-automation MCP server не может attach'нуться к работающему Edge.
   - Per-developer setup, выполняется один раз.

## Почему здесь, а не в smarts

`smarts` — продуктовый репозиторий MobileSMARTS. Локальный AI-dev environment (auto-capture queue, browser-debug helper) к продукту отношения не имеют — это инструменты для конкретного разработчика, использующего Claude Code. Их место — в `dev-pomogator`, рядом с другими спеками типа `auto-capture`, `claude-in-chrome-multisession`, `claude-in-chrome-multisession`, `chrome-devtools-mcp-mux`.

## Что НЕ входит в эту спеку

- Ни одного нового FR/NFR. Это не feature-spec, а **registry of artifacts** для двух независимых helper'ов, у которых уже есть свои спеки в dev-pomogator (`auto-capture` для queue, `claude-in-chrome-*` для browser-port).
- Этой папке не нужен `TASKS.md` / `ACCEPTANCE_CRITERIA.md` / `.feature` — это контейнер для двух самостоятельных артефактов.

## Действия если хочется развить

- Если кто-то ещё на команде использует Claude Code и хочет такую же настройку — добавить инструкцию по запуску `setup-edge-debug-port.ps1` в onboarding (см. `.specs/onboard-repo-phase0/`).
- Если auto-capture накопил что-то полезное и оно должно стать общим правилом — выгрузить через `/suggest-rules` (см. `.specs/auto-capture/` и `.specs/suggest-rules-insights/`).
