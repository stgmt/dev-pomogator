# User Stories

## Основные роли

- **Developer running 2+ Claude Code sessions** — параллельно гонит несколько Claude Code instances (split-screen, разные проекты, sub-agents) которые все ходят в один Chrome через `claude-in-chrome` MCP
- **AI agent (Claude Code itself)** — потребитель `mcp__claude-in-chrome__*` тулов
- **Maintainer dev-pomogator** — устанавливает фичу как extension
- **End user dev-pomogator** — ставит `npx dev-pomogator --plugins claude-in-chrome-multisession`

## Stories

### US-1 (Developer with parallel sessions) @feature1
Как **developer, который держит 2+ Claude Code сессий** и все они юзают `claude-in-chrome` MCP против моего реального залогиненного Edge, я хочу чтобы соседняя сессия физически не могла напасть на мой tab (navigate / close / read), даже если её LLM по ошибке возьмёт мой `tabId` из `tabs_context_mcp`. **Hard guarantee**, не "AI вежливо попросит не трогать".

### US-2 (AI agent) @feature2
Как **AI agent в свежей Claude Code сессии**, я хочу при первом browser-debug запросе автоматически создать свой собственный tab через `tabs_create_mcp` и оперировать только им — без того чтобы я сам помнил set tabIds через диалог. Hook должен auto-record мой созданный tab; subsequent ops — ALLOW; чужой tab — DENY с инструкцией.

### US-3 (Maintainer) @feature3
Как **maintainer**, я хочу чтобы фича жила в `extensions/claude-in-chrome-multisession/` как стандартный extension с manifest + hooks секцией. Installer регистрирует PreToolUse + PostToolUse в target проекте `.claude/settings.local.json` через standard hook flow (zero new code в `src/installer/`).

### US-4 (End user) @feature4
Как **end user после `npx dev-pomogator --plugins claude-in-chrome-multisession`**, я хочу чтобы фича заработала после рестарта Claude Code без дополнительной настройки: skill грузится автоматически, hook активен, state файлы создаются по необходимости.

### US-5 (Developer with manually-opened tabs) @feature5
Как **developer**, который вручную открыл важный tab (login flow), я хочу через CLI helper `claim-tab.mjs add <tabId>` явно "забрать" tab в свою сессию. Должна быть возможность отдать обратно через `release`.

### US-6 (Developer cleaning up) @feature6
Как **developer, который часто открывает/закрывает Claude Code сессии**, я хочу чтобы stale сессий не накапливалось бесконечно: TTL-based cleanup (`claim-tab.mjs clean` удаляет сессии с `lastUsedAt` > 24h). Также `reset` для full wipe.

### US-7 (Developer with single session) @feature7
Как **developer, который запускает только одну Claude Code сессию**, я хочу чтобы фича не добавляла visible overhead — orphan tabs (созданные мной до установки hook, или вручную) **auto-claim**'ятся при первом touch'е. Hook ведёт себя как no-op для single-session use.

### US-8 (Developer debugging hook) @feature8
Как **developer, столкнувшийся с unexpected DENY**, я хочу видеть структурированный лог `~/.dev-pomogator/logs/cims-guard.log` (JSONL) с событиями `allow_owned`, `allow_adopted_orphan`, `deny_other_session`, `recorded_tab` — чтобы понимать что произошло и какая сессия владеет tab.

### US-9 (Developer with hook failure) @feature9
Как **developer**, я хочу чтобы баги hook'а (parse error, missing field, corrupted state) **никогда не блокировало** мою работу — guard fails open (exit 0 + warn в log).

### US-10 (Maintainer of upstream) @feature10
Как **maintainer**, я хочу чтобы документация чётко указывала: эта фича — workaround для open Anthropic issues (#15173, #15193, #20100, #26120, #39637). Когда upstream зашипит native multi-session, фичу demote до "legacy".
