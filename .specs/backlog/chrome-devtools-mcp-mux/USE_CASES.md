# Use Cases

## UC-1: Two Claude Code sessions debug the same web app in parallel (happy path) @feature1 @feature3

Developer держит две Claude Code сессии в split-screen. Сессия А отлаживает API ошибку через DevTools Network panel. Сессия Б параллельно прогоняет e2e-регрессию через `mcp__*__navigate` + `take_screenshot`. Без mux — сессия Б видит таб сессии А в `list_pages`, рандомно вызывает `select_page` на чужом табе и ломает дебаг. С mux — каждая видит только свой `BrowserContext`, обе работают на одном залогиненном Chrome профиле.

- Сессия А первой запускает MCP-инструмент → её shim спавнит daemon → daemon стартует Chrome с одним `--user-data-dir`.
- Сессия Б подключается к существующему daemon через unix-socket / named pipe → получает свой `BrowserContext`.
- Каждая сессия видит изолированный `list_pages` (только свои табы); cross-context page-scoped вызовы отвергаются daemon-ом.
- Результат: zero tab interference, shared cookies/login.

Покрывает: US-1.

## UC-2: First-time install via dev-pomogator installer @feature1 @feature2 @feature7

End user впервые ставит dev-pomogator (`npx dev-pomogator`) в новом проекте. Extension `chrome-devtools-mcp-mux` присутствует в default-список, инсталлер:

- Дописывает запись `chrome-devtools-mcp-mux` в `.mcp.json` пользователя (или project-local — TBD в Phase 2 design) с `"command": "npx", "args": ["-y", "chrome-devtools-mcp-mux@<pinned-version>"]`.
- Регистрирует skill `chrome-devtools-mcp-mux` в `.claude/skills/`.
- НЕ делает `npm i -g` — `npx -y` resolves at runtime (нет глобального state, легче update через bump version в `extension.json`).
- Записывает managed-entry в `~/.dev-pomogator/config.json` с sha256 для skill-файлов.
- При следующем `claude code` запуске — `mcp__chrome-devtools-mcp-mux__*` тулы доступны.

Покрывает: US-2, US-4.

## UC-3: Conflict with claude-in-chrome MCP browser extension @feature5

User с уже сконфигуренным `claude-in-chrome` MCP (Chrome extension flow на http://localhost:6555) ставит chrome-devtools-mcp-mux. Оба пытаются драйвить Chrome. Конфликт: chrome-devtools-mcp использует CDP через `--remote-debugging-port=N` → Chrome 136+ автоматически **disables all browser extensions** (security mitigation против automation abuse) → `claude-in-chrome` extension перестаёт коннектиться → tools `mcp__claude-in-chrome__*` начинают возвращать `Browser extension is not connected`.

Edge-кейс flow:

- Installer детектит наличие `claude-in-chrome` записи в существующем `.mcp.json` ИЛИ `mcp__claude-in-chrome__` упоминаний в installed skills → выводит warn перед установкой:
  > ⚠ chrome-devtools-mcp-mux mutually exclusive с `claude-in-chrome` в одном Chrome instance (Chrome 136+ disables extensions при `--remote-debugging-port`). Continue? Options: (a) skip — оставить только claude-in-chrome, (b) install + revert claude-in-chrome, (c) install + use a SEPARATE Chrome instance via `CDMCP_MUX_USER_DATA_DIR`.
- Skill `chrome-devtools-mcp-mux` явно документирует это в Triggers/Compatibility (mirror pattern из `edge-debug-port` skill).
- Doctor check (US-4) ловит co-existence runtime: оба MCP сконфигурены в `.mcp.json` → emit 🟡 warning.

Покрывает: US-3, US-5.

## UC-4: Skill направляет Claude на mux как дефолт @feature3

User в Claude Code session пишет: "посмотри что лежит на http://localhost:3000/admin, что там в console errors". Skill `chrome-devtools-mcp-mux` срабатывает на keywords ("открой страницу", "посмотри console", "screenshot", "DevTools", "chrome", "браузер", "navigate", "page", "url") и **жёстко направляет Claude в mux first**:

### Decision tree (priority-ordered)

1. **DEFAULT — `mcp__chrome-devtools-mcp-mux__*`.** Это первый и предпочитаемый путь для любого browser-debug запроса. Работает в multi-session, не ломает соседние Claude сессии, изолирует табы per-context.
2. **Fallback A — `mcp__claude-in-chrome__*`** только если выполнено хотя бы одно hard-OUT условие:
   - User explicitly попросил "use my browser extensions" / "залогиненную сессию в моём Chrome" / нужен password-manager auto-fill / ad-blocker-aware screenshot
   - Mux MCP не сконфигурирован в `.mcp.json` AND `claude-in-chrome` сконфигурирован (degraded mode)
   - User explicitly сказал "use claude-in-chrome"
3. **Fallback B — `edge-debug-port` + Playwright `connectOverCDP`** только если:
   - User explicitly сказал "use my Edge with real profile"
   - Нужен screenshot конкретного existing tab в живом Edge юзера (не headless surrogate)
   - User уже применил edge-debug-port skill в этой сессии

### Hard rule: vanilla chrome-devtools-mcp ЗАПРЕЩЁН если mux установлен

Если в `.mcp.json` есть запись `chrome-devtools-mcp-mux` — Claude НЕ ДОЛЖЕН вызывать `mcp__chrome-devtools-mcp__*` напрямую. Это unsafe в multi-session окружении (race conditions описанные в RESEARCH.md). Skill это явно блокирует через "когда НЕ использовать".

### Anti-pattern (что skill должен предотвратить)

- Claude видит "посмотри что в браузере" → выбирает рандомный browser MCP из доступных → ломает соседнюю сессию через `select_page` race.
- Claude по привычке зовёт `mcp__claude-in-chrome__*` потому что оно было раньше в его prompt context → проигрывает multi-session изоляцию.

Покрывает: US-3.

## UC-5: First session crashes, daemon outlives, second session attaches cleanly @feature1

Сессия А спавнит daemon, открывает 3 таба, делает screenshots. Затем процесс Claude Code в сессии А падает (OOM / kill / crash). Согласно architecture mux: при disconnect клиент-shim — daemon **удаляет BrowserContext этого клиента** (закрывает табы, гасит контекст). Сессия Б, сидящая на том же daemon, продолжает работать без артефактов от сессии А. Через 30 сек юзер перезапускает сессию А — её новый shim attach к существующему daemon, получает **fresh** BrowserContext (не восстанавливает старые табы — by design, isolation > recovery).

Потенциальный edge case: daemon orphan если ВСЕ shim-ы дисконнектились + new shim не подключается (timeout daemon idle?). Verify в Phase 1 research через `npm view` source / читать README.md полностью / тестить вручную.

Покрывает: US-1.

## UC-6: Doctor check verifies the whole chain @feature4 @feature8

User запустил `/pomogator-doctor` после жалобы "у меня Claude не может открыть браузер из mux". Doctor запускает 5 checks for chrome-devtools-mcp-mux extension:

1. ✅ Extension installed (запись в `config.installedExtensions[*].name == "chrome-devtools-mcp-mux"`).
2. ✅ MCP entry в `.mcp.json` (содержит `"chrome-devtools-mcp-mux"` server config).
3. ✅ `npx -y chrome-devtools-mcp-mux@<version> --version` exit 0 within 10s — пакет скачивается и запускается.
4. ✅ Chrome/Chromium bin доступен (puppeteer resolver — где-то под `~/.cache/puppeteer/` ИЛИ system-installed Chrome).
5. ✅ Skill `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` физически на диске + загружен plugin-loader-ом.

Если шаг 3 падает (network error / version not found / package broken) — emit fix hint "run `npm view chrome-devtools-mcp-mux` to verify availability". Если шаг 4 — fix hint "Chrome не найден; chrome-devtools-mcp использует puppeteer, set `PUPPETEER_EXECUTABLE_PATH` или `npx puppeteer browsers install chrome`".

Покрывает: US-4, US-6.

## UC-8: First-run browser preference prompt (FR-9) @feature9

User впервые открыл Claude Code в проекте после `npx dev-pomogator` (installer auto-инъектил Edge default в `.mcp.json`). User спрашивает Claude "посмотри что в console на http://localhost:3000". Skill `chrome-devtools-mcp-mux` срабатывает на keyword "console", замечает что:

- `.mcp.json.mcpServers["chrome-devtools-mcp-mux"].env.CDMCP_MUX_CHROMIUM` = `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (auto-injected default).
- `~/.dev-pomogator/.cdmm-browser-choice.json` отсутствует.

Перед первым tool call в browser MCP, Claude пишет в чат текстовое сообщение:

```
Замечу: я настроена использовать Edge для браузер-операций (auto-default
от dev-pomogator на Windows). Перед тем как открыть страницу — уточни какой
браузер использовать:
  (A) Edge (current default — оставить как есть)
  (B) Chrome (если установлен)
  (C) Bundled Chromium — изолированный browser, отдельные cookies каждый раз
  (D) Другой путь — введи "D <полный путь к .exe>"
  (E) Не спрашивать больше — оставить Edge навсегда
```

User отвечает `C` (хочет изолированную сессию для отладки auth flow без своих cookies). Claude вызывает:

```bash
npx tsx .dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs bundled
```

Helper:
1. Читает `.mcp.json`, удаляет ключ `env.CDMCP_MUX_CHROMIUM`.
2. Атомарно перезаписывает `.mcp.json`.
3. Записывает `~/.dev-pomogator/.cdmm-browser-choice.json` со shape `{choice: "bundled", dismissed: false, timestampISO: "2026-04-28T..."}`.
4. Печатает one-line confirmation.

Claude подтверждает в чате: `OK, переключилась на bundled Chromium — первый запуск тянет ~170MB, дальше будет быстрее. Открываю страницу.`

В следующей сессии skill проверяет marker файл — `dismissed: false`, choice уже сделан → НЕ показывает prompt снова (prompt только при first-run when no choice exists).

Edge case: user отвечает `B` (Chrome), но Chrome не установлен. Helper:
1. Auto-detect Chrome через standard paths (`C:\Program Files\Google\Chrome\Application\chrome.exe`, `~/AppData/Local/Google/Chrome/Application/chrome.exe`) → not found.
2. Отвечает: `Chrome не найден в стандартных местах. Введи путь как "D <path>" или (B again) для retry после установки.`
3. User retries `D C:\Tools\chrome\chrome.exe` → helper validates `fs.existsSync` → writes config.

Покрывает: US-7 (новый, добавлен).

## UC-7: Uninstall via dev-pomogator-uninstall @feature6

User запускает `dev-pomogator --uninstall chrome-devtools-mcp-mux`. Flow:

- Удаляет запись `chrome-devtools-mcp-mux` из `.mcp.json` (preserve user keys).
- Удаляет `.claude/skills/chrome-devtools-mcp-mux/`.
- Удаляет managed-entry из `~/.dev-pomogator/config.json`.
- Очищает managed gitignore block в target `.gitignore` если он становится пустым.
- НЕ убивает запущенный daemon (если он живёт в background) — это user concern; doctor может это поднять как 🟡.
- Self-guard: refuse в dev-pomogator source repo (как rest of installer).

Покрывает: US-6.
