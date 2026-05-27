# Functional Requirements (FR)

## FR-1: Extension package `chrome-devtools-mcp-mux`

Создать новый dev-pomogator extension в `extensions/chrome-devtools-mcp-mux/` с `extension.json` манифестом, который декларирует:

- `name`: `"chrome-devtools-mcp-mux"`
- `platforms`: `["claude"]` (только Claude Code; Cursor/Codex не имеют tool-call routing к chrome-devtools-mcp семейству — out of scope)
- `category`: `"automation"` (mirror pattern `edge-debug-port`)
- `mcpServers` (новое поле): `{ "chrome-devtools-mcp-mux": { "command": "npx", "args": ["-y", "chrome-devtools-mcp-mux@<pinned-version>"] } }` — конфигурация MCP-сервера которую инсталлер запишет в user's `.mcp.json`
- `skills`: `{ "chrome-devtools-mcp-mux": ".claude/skills/chrome-devtools-mcp-mux" }` — SOURCE path в repo per `extension-layout` rule
- `skillFiles`: `{ "chrome-devtools-mcp-mux": [".claude/skills/chrome-devtools-mcp-mux/SKILL.md"] }`
- `tools`: `{ "chrome-devtools-mcp-mux": "tools/chrome-devtools-mcp-mux" }` — для smoke-test helper script
- `toolFiles`: `[".dev-pomogator/tools/chrome-devtools-mcp-mux/smoke-test.mjs"]`
- `hooks`: `[]` — нет hooks

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-2](USE_CASES.md#uc-2-first-time-install-via-dev-pomogator-installer)

## FR-2: MCP server registration in user's `.mcp.json`

При установке/обновлении extension инсталлер ОБЯЗАН добавить запись `"chrome-devtools-mcp-mux"` в раздел `mcpServers` пользовательского `.mcp.json` (project-scoped, located at `<targetProject>/.mcp.json`). Формат записи берётся из `extension.json.mcpServers` (FR-1). Запись валидна как stdio MCP server: `{ "command": "npx", "args": ["-y", "chrome-devtools-mcp-mux@0.2.2"] }`.

Запись пишется через **smart merge**: existing `mcpServers` keys пользователя preserve; перезаписывается только запись `"chrome-devtools-mcp-mux"`. Запись пишется атомарно (temp file + `fs.move`) per `atomic-config-save` rule. Если `.mcp.json` отсутствует — создаётся с минимальной shape `{ "mcpServers": { ... } }`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-first-time-install-via-dev-pomogator-installer)

## FR-3: Skill `chrome-devtools-mcp-mux` направляет Claude к mux как DEFAULT

Создать skill в `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` с frontmatter (name, description, allowed-tools). Skill description-line ОБЯЗАН содержать:

1. **Triggers** — keywords активации: "открой страницу", "посмотри console", "screenshot", "DevTools", "chrome", "браузер", "navigate", "page", "url", "browser", "console errors", "network panel".
2. **DEFAULT path:** `mcp__chrome-devtools-mcp-mux__*` — priority-1 для любого browser-debug запроса. Skill тело включает explicit фразу: "use chrome-devtools-mcp-mux MCP as your FIRST and DEFAULT choice for any browser interaction".
3. **Hard-OUT signals** (когда fallback на `claude-in-chrome` или `edge-debug-port`):
   - Explicit user request "use my browser extensions" / "залогиненную сессию" / password-manager / ad-blocker.
   - Mux MCP отсутствует в `.mcp.json` (degraded mode).
   - Explicit "use claude-in-chrome" or "use my Edge with real profile".
4. **Hard rule:** запрет на вызов vanilla `mcp__chrome-devtools-mcp__*` если mux установлен (unsafe в multi-session per RESEARCH.md).
5. **Compatibility section** mirroring pattern из `edge-debug-port/SKILL.md:29-44`: Chrome 136+ disables extensions при `--remote-debugging-port`; mux сам спавнит Chrome → mutex с `claude-in-chrome` extension в одном Chrome instance.

Skill ОБЯЗАН быть найдённым Claude plugin-loader-ом (= физически на диске + manifest valid).

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-two-claude-code-sessions-debug-the-same-web-app-in-parallel-happy-path), [UC-4](USE_CASES.md#uc-4-skill-направляет-claude-на-mux-как-дефолт)

## FR-4: Pomogator-doctor checks (5 checks)

Расширить `src/doctor/checks/` новым модулем `chrome-devtools-mcp-mux.ts`, который выполняет 5 checks **только если** extension присутствует в `config.installedExtensions[*].name`:

| Check ID | Что проверяет | Severity без fix | Reinstallable |
|----------|---------------|------------------|---------------|
| CDMM-1 | Extension installed: `config.installedExtensions[*].name == "chrome-devtools-mcp-mux"` | 🔴 critical | yes |
| CDMM-2 | MCP entry в `.mcp.json` имеет ключ `"chrome-devtools-mcp-mux"` с валидным `command`+`args` | 🔴 critical | yes |
| CDMM-3 | `npx -y chrome-devtools-mcp-mux@<version> --version` выходит с exit 0 в течение 15s timeout (network + npm cache reachable) | 🟡 warning | no (network/registry) |
| CDMM-4 | Chrome/Chromium binary доступен — либо `puppeteer.executablePath()` resolves, либо `PUPPETEER_EXECUTABLE_PATH` env var, либо system Chrome в PATH | 🟡 warning | no (manual install) |
| CDMM-5 | Skill `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` физически на диске | 🔴 critical | yes |

Каждый check возвращает объект с полями `severity`, `message`, `fixHint`, `reinstallable` per existing `doctor/types.ts` shape. Новый check регистрируется в `src/doctor/checks/index.ts`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-6](USE_CASES.md#uc-6-doctor-check-verifies-the-whole-chain)

## FR-5: Conflict detection с `claude-in-chrome` MCP

Если в момент установки extension инсталлер обнаруживает в user's `.mcp.json` запись `"claude-in-chrome"` ИЛИ хоть одно упоминание `mcp__claude-in-chrome__` в installed `.claude/skills/`/`.claude/rules/` — он MUST emit предупреждение и предложить выбор:

```
⚠ chrome-devtools-mcp-mux mutually exclusive с claude-in-chrome в одном Chrome
  instance. Chrome 136+ автоматически отключает все extensions когда Chrome
  запущен с --remote-debugging-port=N (security mitigation, не обходится).

  Pick one:
  (a) skip — оставить только claude-in-chrome, не ставить mux
  (b) install + revert claude-in-chrome (удалить запись из .mcp.json)
  (c) install + use SEPARATE Chrome instance for mux (через CDMCP_MUX_USER_DATA_DIR env)

  Default (interactive): prompt user через AskUserQuestion.
  Default (non-interactive / CI): (a) skip + write warning в installer log.
```

Doctor check (FR-4 CDMM-2) дополнительно эмитит 🟡 warning при runtime co-existence (обе записи в `.mcp.json`).

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-conflict-with-claude-in-chrome-mcp-browser-extension)

## FR-6: Uninstall cleanup

`dev-pomogator --uninstall chrome-devtools-mcp-mux` (или `dev-pomogator-uninstall` skill) MUST:

1. Удалить запись `"chrome-devtools-mcp-mux"` из user's `.mcp.json` (preserve other MCP server keys).
2. Удалить директорию `.claude/skills/chrome-devtools-mcp-mux/`.
3. Удалить директорию `.dev-pomogator/tools/chrome-devtools-mcp-mux/`.
4. Удалить запись из `~/.dev-pomogator/config.json.installedExtensions`.
5. Очистить managed gitignore block если он становится пустым после удаления.
6. **НЕ убивать** запущенный daemon если он живёт в background (separate user concern; doctor может это поднять как 🟡 если orphan detected).
7. Self-guard: refuse в dev-pomogator source repo (mirror existing uninstall pattern).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-7](USE_CASES.md#uc-7-uninstall-via-dev-pomogator-uninstall)

## FR-7: Pinned version в `extension.json`

`extension.json.mcpServers["chrome-devtools-mcp-mux"].args` MUST содержать exact pinned version (`chrome-devtools-mcp-mux@0.2.2`), не `@latest`. Причина: pre-1.0 single-maintainer пакет; rolling latest даёт unpredictable upgrades. Bump version — explicit dev-pomogator release с CHANGELOG entry.

Installer и updater при detection version mismatch (записанный в config.json hash отличается от actual `extension.json` version) MUST trigger reinstall flow для chrome-devtools-mcp-mux entry в `.mcp.json`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** N/A (cross-cutting NFR-Reliability)

## FR-8: Windows transport verification (smoke test)

Smoke test `tools/chrome-devtools-mcp-mux/smoke-test.mjs` выполняемый installer-ом opt-in (через флаг `--verify-mcp` или из doctor CDMM-3) и в integration tests:

1. Spawn `npx -y chrome-devtools-mcp-mux@<version>` через `child_process.spawn` с `stdio: ['pipe', 'pipe', 'pipe']`.
2. Send JSON-RPC `initialize` request (per MCP spec) через stdin.
3. Wait for response on stdout с timeout 10s (fixed для CI predictability).
4. Send `tools/list` follow-up.
5. Verify response contains expected chrome-devtools-mcp tool names (`navigate_page`, `take_screenshot`, ...).
6. Send graceful shutdown JSON-RPC `shutdown` request OR kill process.
7. Exit code 0 = success; non-zero = fail with stderr captured.

Этот smoke test работает на Windows (proves transport works на target platform) и закрывает риск R1 из RESEARCH.md.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-6](USE_CASES.md#uc-6-doctor-check-verifies-the-whole-chain) (intersect doctor CDMM-3)

## FR-9: First-run browser preference prompt (skill-driven)

Skill `chrome-devtools-mcp-mux` ОБЯЗАН направлять Claude инициировать **conversational prompt** с пользователем при первом обращении к browser-debug в свежей session, если **обе** условия выполнены:

1. `.mcp.json.mcpServers["chrome-devtools-mcp-mux"].env.CDMCP_MUX_CHROMIUM` присутствует, AND его значение совпадает с auto-injected default установщика (т.е. installer прописал Edge на Windows без consent юзера).
2. В `~/.dev-pomogator/.cdmm-browser-choice.json` НЕТ записи `dismissed: true` для текущего user (= пользователь ещё не выбрал "не спрашивать больше").

Conversational prompt предлагает 5 вариантов:

| Option | Action | Use case |
|--------|--------|----------|
| (A) **Use Edge** (default Win) | оставляет current `CDMCP_MUX_CHROMIUM=msedge.exe` | юзер уже использует Edge как primary browser (project convention) |
| (B) **Use Chrome** | re-writes `CDMCP_MUX_CHROMIUM=path/to/chrome.exe` (auto-detect через registry или standard paths) | юзер предпочитает Chrome / у него Edge не установлен |
| (C) **Use bundled Chromium (isolated)** | удаляет `CDMCP_MUX_CHROMIUM` из `.mcp.json` → puppeteer тянет свой ~170MB Chromium | юзер хочет каждый раз чистый изолированный browser (no cookies/extensions/sessions) |
| (D) **Custom path** | promptит юзера ввести путь, валидирует `fs.existsSync`, записывает в `.mcp.json` | non-standard install (Brave, Opera, etc.) |
| (E) **Don't ask again** | сохраняет current choice в marker file + dismiss flag | юзер OK с current default навсегда |

Реализация:

- Skill body содержит инструкции для Claude: "When this skill loads in a session AND `.mcp.json` matches auto-inject pattern AND no dismiss marker — show 5-option prompt to user as a regular text message in the chat (not via AskUserQuestion — we want lightweight conversational flow). Wait for user reply 'A'/'B'/'C'/'D <path>'/'E'. Then call helper script `tools/chrome-devtools-mcp-mux/configure-browser.mjs <choice> [<path>]` via Bash."
- Helper script `configure-browser.mjs` (new tool):
  - Detects `.mcp.json` in project root.
  - Updates `mcpServers.chrome-devtools-mcp-mux.env.CDMCP_MUX_CHROMIUM` per choice.
  - Writes marker `~/.dev-pomogator/.cdmm-browser-choice.json` со shape `{choice: 'edge'|'chrome'|'bundled'|'custom', path?: string, dismissed: boolean, timestampISO: string}`.
  - Idempotent: повторный запуск с тем же choice — no-op + warning "already configured".
  - Validates path (D-option) через `fs.existsSync` + extension check (`.exe` on Windows).

Marker file `~/.dev-pomogator/.cdmm-browser-choice.json` — единственный source of truth для "did user choose"; skill читает его перед prompt-ом. Per-user (HOME-scoped), не per-project — пользователь обычно использует один primary browser везде.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-8](USE_CASES.md#uc-8-first-run-browser-preference-prompt)
