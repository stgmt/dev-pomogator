# User Stories

## Основные роли

- **Developer running multiple Claude Code sessions** — параллельно гонит 2+ сессий Claude Code (например split-screen или разные репо), каждая хочет драйвить браузер.
- **AI agent (Claude Code)** — потребитель MCP-сервера, должен знать когда юзать chrome-devtools-mcp-mux вместо обычного chrome-devtools-mcp.
- **Maintainer dev-pomogator** — устанавливает фичу как extension, обеспечивает интеграцию с installer + pomogator-doctor.
- **End user dev-pomogator** — ставит `npx dev-pomogator` и хочет чтобы MCP-сервер для браузера "просто работал" без ручной правки `.mcp.json`.

## Stories

### US-1 (Developer with parallel sessions) @feature1
Как **developer, который держит 2+ Claude Code сессий** (debug фронта в одной + e2e регрессия в другой), я хочу чтобы они обе могли использовать **один и тот же залогиненный Chrome** не сталкиваясь — `list_pages` показывал только мои табы, `select_page` не race-ил с соседом, `new_page` открывался в моём контексте — чтобы не плодить отдельные Chrome-инстансы и не терять auth state.

### US-2 (Maintainer dev-pomogator) @feature2
Как **maintainer**, я хочу чтобы фича жила в `extensions/chrome-devtools-mcp-mux/` как обычный extension с `extension.json` декларирующий MCP-сервер + опциональный skill, чтобы инсталлер сам прописывал запись в `.mcp.json` пользователя и обновлял через стандартный updater flow (не плодить sui-generis установочный путь).

### US-3 (AI agent) @feature3
Как **AI agent (Claude Code)**, я хочу чтобы skill `chrome-devtools-mcp-mux` явно ставил `mcp__chrome-devtools-mcp-mux__*` **дефолтом** для любого browser-debug запроса (открыть страницу, console errors, screenshot, DevTools Network), а `mcp__claude-in-chrome__*` и `edge-debug-port + Playwright connectOverCDP` — это **opt-out fallback'и** для конкретных hard-OUT сценариев (нужны user's browser extensions / нужен залогиненный реальный Edge профиль). Skill ОБЯЗАН перечислить эти hard-OUT сигналы явно — иначе я скачусь к старому дефолту и проиграю multi-session изоляцию. Чтобы я не пытался использовать vanilla `chrome-devtools-mcp` если mux установлен — это unsafe в multi-session окружении.

### US-4 (End user dev-pomogator) @feature4
Как **end user dev-pomogator после `npx dev-pomogator`**, я хочу чтобы запуск `/pomogator-doctor` показывал отдельный 🟡/🔴 check для chrome-devtools-mcp-mux: (a) `chrome-devtools-mcp-mux@x` доступен через `npx -y …` (network reachable + npm cache), (b) Node ≥ minimum для пакета, (c) Chrome/Chromium бинарь доступен (через `puppeteer` resolver), (d) запись в `.mcp.json` присутствует, (e) shim запускается без crash — чтобы я знал на каком из 5 шагов сломалось ДО того как побегу пытаться драйвить браузер из Claude.

### US-5 (Developer with claude-in-chrome already configured) @feature5
Как **developer, у которого уже сконфигурен `claude-in-chrome` MCP** (browser extension flow), я хочу чтобы установка chrome-devtools-mcp-mux **не молча сломала первый**, а явно предупредила: "у тебя 2 mutually-exclusive browser MCP — Chrome 136+ запущенный с `--remote-debugging-port` отключит расширения. Pick one workflow per Chrome instance" — чтобы я мог осознанно выбрать (revert одного из них или поднять второй Chrome через отдельный `--user-data-dir`).

### US-6 (Developer cleaning up) @feature6 @feature7 @feature8

### US-7 (Developer with non-default browser preferences) @feature9
Как **developer, у которого primary browser ≠ Edge ИЛИ кто хочет каждый раз изолированную сессию (отладка auth flow без cookies)**, я хочу при первом обращении к browser-debug в свежей Claude Code сессии получить **conversational prompt с 5 опциями** (Edge / Chrome / bundled isolated Chromium / custom path / don't ask again), чтобы переопределить `CDMCP_MUX_CHROMIUM` без ручного редактирования `.mcp.json` — auto-injected дефолт от installer-а не должен молча навязываться. Choice сохраняется в `~/.dev-pomogator/.cdmm-browser-choice.json` чтобы prompt не повторялся.
Как **developer**, я хочу чтобы `dev-pomogator --uninstall` чисто снимал extension (запись из `.mcp.json` + skill + tools entry в config.json + managed gitignore block), чтобы не оставалась stale запись `"chrome-devtools-mcp-mux"` ссылающаяся на пустоту в `~/.mcp.json` после удаления плагина.
