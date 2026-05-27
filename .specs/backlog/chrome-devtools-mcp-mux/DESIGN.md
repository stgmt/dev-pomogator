# Design

## Реализуемые требования

- [FR-1: Extension package](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux)
- [FR-2: MCP server registration](FR.md#fr-2-mcp-server-registration-in-users-mcpjson)
- [FR-3: Skill направляет Claude к mux как DEFAULT](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default)
- [FR-4: Pomogator-doctor checks](FR.md#fr-4-pomogator-doctor-checks-5-checks)
- [FR-5: Conflict detection с claude-in-chrome MCP](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp)
- [FR-6: Uninstall cleanup](FR.md#fr-6-uninstall-cleanup)
- [FR-7: Pinned version](FR.md#fr-7-pinned-version-в-extensionjson)
- [FR-8: Windows transport verification](FR.md#fr-8-windows-transport-verification-smoke-test)

## Компоненты

- **Extension manifest** (`extensions/chrome-devtools-mcp-mux/extension.json`) — единственный source of truth для installer/updater/doctor: какая версия пакета pinned, где skill, где tools, какой MCP server config писать в user's `.mcp.json`.
- **Skill** (`.claude/skills/chrome-devtools-mcp-mux/SKILL.md`) — инструкция для Claude: дефолтить mux, hard-OUT signals для fallback'ов, hard rules. **Также** содержит инструкции для FR-9 first-run browser preference prompt (см. ниже).
- **Smoke test helper** (`extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs`) — самостоятельный Node script проверяющий cdmcp-mux JSON-RPC handshake. Используется в integration tests + опционально в doctor CDMM-3 (P1, после baseline).
- **Browser config helper** (`extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/configure-browser.mjs` — новый, FR-9) — Node ESM script который принимает choice (`edge|chrome|bundled|custom <path>`) + опциональный `--dismiss` флаг, atomic-обновляет `.mcp.json.mcpServers.chrome-devtools-mcp-mux.env.CDMCP_MUX_CHROMIUM` (или удаляет ключ для `bundled`), записывает marker `~/.dev-pomogator/.cdmm-browser-choice.json`. Auto-detects Chrome paths для option B; falls back на explicit path prompt при auto-detect miss.
- **MCP config writer** (`src/installer/mcp-config.ts` — новый модуль) — atomic smart-merge writer для user's `.mcp.json`. Reused в FR-2 install и FR-6 uninstall. Включает `findSystemChromium()` для auto-inject Edge дефолта на Windows.
- **Doctor module** (`src/doctor/checks/chrome-devtools-mcp-mux.ts` — новый файл) — реализует CDMM-1 .. CDMM-5; зарегистрирован в `src/doctor/checks/index.ts`.
- **Conflict detector** (`src/installer/mcp-conflicts.ts`) — обнаруживает coexistence с claude-in-chrome, возвращает `{detected: bool, conflictingServer: string, options: ['skip', 'revert-other', 'separate-instance']}`.
- **Browser choice marker** (`~/.dev-pomogator/.cdmm-browser-choice.json` — FR-9 state file) — JSON `{choice, path?, dismissed, timestampISO}` per-user (HOME-scoped), читается skill-ом перед prompt-ом + helper-ом перед re-write. Source of truth для "did user pick".

## Где лежит реализация

- App-код: `src/installer/mcp-config.ts` (new), `src/doctor/checks/chrome-devtools-mcp-mux.ts` (new), `src/doctor/checks/index.ts` (edit — register).
- Extension: `extensions/chrome-devtools-mcp-mux/extension.json` (new), `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs` (new).
- Skill: `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` (new).
- Wiring: `src/installer/extensions.ts` ОБЯЗАН вызвать `mcp-config.ts.writeServerEntry()` при install для extension которое объявляет `mcpServers` в манифесте; symmetric remove на uninstall.
- Tests: `tests/features/plugins/chrome-devtools-mcp-mux/` directory.

## Директории и файлы

- `extensions/chrome-devtools-mcp-mux/extension.json` (create)
- `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs` (create)
- `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` (create)
- `src/installer/mcp-config.ts` (create)
- `src/installer/extensions.ts` (edit — call mcp-config writer)
- `src/doctor/checks/chrome-devtools-mcp-mux.ts` (create)
- `src/doctor/checks/index.ts` (edit — register check)
- `tests/features/plugins/chrome-devtools-mcp-mux/PLUGIN017_chrome-devtools-mcp-mux.feature` (create)
- `tests/features/plugins/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux-installer.test.ts` (create)
- `tests/features/plugins/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux-doctor.test.ts` (create)
- `tests/features/plugins/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux-skill.test.ts` (create)
- `tests/features/plugins/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux-smoke.test.ts` (create — wraps smoke-test.mjs run)
- `tests/fixtures/chrome-devtools-mcp-mux/existing-mcp-json/.mcp.json` (create — fixture с existing claude-in-chrome для AC-5)
- CLAUDE.md (edit — добавить строку в Rules table если новое правило, либо в "Extensions" mention)

## Алгоритм установки (FR-2)

```
1. Installer: parse extensions/chrome-devtools-mcp-mux/extension.json → manifest
2. Installer: copy files (skill, tools) per existing extension copy logic
3. Installer: detect conflicts через mcp-conflicts.detectClaudeInChrome(targetProject)
   - if conflict + interactive → AskUserQuestion 3-option prompt
   - if conflict + non-interactive → skip with warning log
   - if conflict resolved (option b) → also remove claude-in-chrome entry from .mcp.json
4. Installer: mcp-config.writeServerEntry(targetProject, "chrome-devtools-mcp-mux", manifest.mcpServers["chrome-devtools-mcp-mux"])
   - read existing .mcp.json (or create empty shape)
   - smart merge: preserve existing keys, override only "chrome-devtools-mcp-mux"
   - write atomically: temp + fs.move
5. Installer: register entry in ~/.dev-pomogator/config.json.installedExtensions[] with:
   - managed.mcpServers["chrome-devtools-mcp-mux"] = { configHash: sha256(JSON.stringify(serverConfig)) }
6. Installer: print post-install one-liner (NFR-Usability)
```

## Алгоритм uninstall (FR-6)

```
1. Uninstaller: self-guard isDevPomogatorRepo() → refuse if true
2. Uninstaller: mcp-config.removeServerEntry(targetProject, "chrome-devtools-mcp-mux")
   - read .mcp.json
   - delete mcpServers["chrome-devtools-mcp-mux"] key only
   - write atomically
   - if mcpServers becomes empty object — keep { "mcpServers": {} } shape (don't delete file)
3. Uninstaller: rm -rf .claude/skills/chrome-devtools-mcp-mux/
4. Uninstaller: rm -rf .dev-pomogator/tools/chrome-devtools-mcp-mux/
5. Uninstaller: remove entry from ~/.dev-pomogator/config.json.installedExtensions
6. Uninstaller: clean managed gitignore block if becomes empty
```

## Алгоритм doctor checks (FR-4)

```
For check in [CDMM-1, CDMM-2, CDMM-3, CDMM-4, CDMM-5]:
  CDMM-1: read ~/.dev-pomogator/config.json → .installedExtensions[*].name == "chrome-devtools-mcp-mux"
    if missing → severity 🔴, fixHint "run npx dev-pomogator chrome-devtools-mcp-mux"
  CDMM-2: read <targetProject>/.mcp.json → mcpServers["chrome-devtools-mcp-mux"]
    if missing → 🔴, fixHint "rerun installer to write mcp config"
    if structure invalid (no command/args) → 🔴, fixHint "delete entry + reinstall"
  CDMM-3: spawn `npx -y chrome-devtools-mcp-mux@<version> --version` with 15s timeout
    if exit 0 within timeout → 🟢
    if timeout exceeded → 🟡, fixHint "check network; npm view chrome-devtools-mcp-mux"
    if non-zero exit → 🟡, fixHint with stderr first line
  CDMM-4: try resolve Chrome via [puppeteer.executablePath(), env.PUPPETEER_EXECUTABLE_PATH `[VERIFIED: official puppeteer config docs]`, system PATH ('chrome', 'google-chrome', 'chromium')]
    if found → 🟢
    if not found → 🟡, fixHint "Chrome не найден; set PUPPETEER_EXECUTABLE_PATH или 'npx puppeteer browsers install chrome'"
  CDMM-5: fs.exists(<targetProject>/.claude/skills/chrome-devtools-mcp-mux/SKILL.md)
    if exists → 🟢
    if missing → 🔴, fixHint "rerun installer"
```

## Алгоритм first-run browser prompt (FR-9)

```
Skill activation in Claude Code session:
  1. On first browser-debug request in session, read:
     a. <projectRoot>/.mcp.json → mcpServers["chrome-devtools-mcp-mux"].env.CDMCP_MUX_CHROMIUM
     b. ~/.dev-pomogator/.cdmm-browser-choice.json → dismissed flag
  2. If (a) is unset OR matches "auto-injected default pattern" (Windows Edge path)
     AND (b) is missing OR dismissed=false:
     → Skill body instructs Claude to write 5-option prompt to chat
     → Wait for user reply
     → Invoke `npx tsx <root>/.dev-pomogator/tools/chrome-devtools-mcp-mux/configure-browser.mjs <choice> [<path>] [--dismiss]`
     → Confirm result in one short sentence
     → Skip the prompt for the remainder of this session (in-memory flag)
  3. If (b) has dismissed=true → skip prompt always

configure-browser.mjs algorithm:
  1. Parse args: choice ∈ {edge, chrome, bundled, custom}, optional path, optional --dismiss flag.
  2. Auto-resolve binary path:
     - edge → search standard Edge install paths; fallback to user prompt for path
     - chrome → search standard Chrome install paths; fallback to user prompt for path
     - bundled → no binary needed; will DELETE env.CDMCP_MUX_CHROMIUM key
     - custom → use provided <path> verbatim (must exist + be regular file)
  3. Read <projectRoot>/.mcp.json (createIfMissing? NO — abort if mux entry not present, fall through to skill no-op).
  4. Smart-merge: update mcpServers["chrome-devtools-mcp-mux"].env per choice.
     - For edge/chrome/custom: set env.CDMCP_MUX_CHROMIUM = resolved path.
     - For bundled: delete env.CDMCP_MUX_CHROMIUM (if env becomes {}, delete env key too).
  5. Write atomically (temp + fs.move) per atomic-config-save rule.
  6. Write ~/.dev-pomogator/.cdmm-browser-choice.json: {choice, path?, dismissed: !!--dismiss, timestampISO}.
  7. Print one-line summary to stdout (consumed by skill confirmation message).
```

## API

### `mcp-config.writeServerEntry(targetProject, serverName, serverConfig)`

- Method: `(targetProject: string, serverName: string, serverConfig: { command: string, args: string[] }) => Promise<void>`
- Behavior:
  - Resolve `<targetProject>/.mcp.json` через `resolveWithinProject` (NFR-Security).
  - Read JSON; if file absent — start with `{ "mcpServers": {} }`.
  - Validate user provided shape — if `mcpServers` key exists but not object → throw with clear error.
  - Smart merge: `data.mcpServers[serverName] = serverConfig` (overwrite specific key only).
  - Write to `<targetProject>/.mcp.json.tmp` then `fs.move(...)` atomically.
- Error semantics: throws `MCPConfigWriteError` с code: `'INVALID_PARENT_PATH' | 'INVALID_EXISTING_JSON' | 'WRITE_FAILED'`.

### `mcp-config.removeServerEntry(targetProject, serverName)`

- Method: `(targetProject: string, serverName: string) => Promise<{removed: boolean}>`
- Behavior: read .mcp.json; delete key; write atomically. Returns `{removed: true}` if key was present, `{removed: false}` if no-op.

### `mcp-conflicts.detectClaudeInChrome(targetProject)`

- Method: `(targetProject: string) => Promise<{detected: boolean, source: '.mcp.json' | 'config.json' | null, evidence: string}>`
- Behavior: read both files; check for `claude-in-chrome` in mcpServers OR installedExtensions names; return first detection source.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_FORMAT:** BDD

**Framework:** vitest 4.1.0 + custom `.feature` 1:1 mapping convention (per `extension-test-quality` rule). Convention: `tests/features/plugins/EXT/DOMAIN_EXT.feature` aligned 1:1 c `tests/features/plugins/EXT/*.test.ts` где `EXT = chrome-devtools-mcp-mux`, `DOMAIN = PLUGIN017`. Не используется Cucumber.js / Gherkin runner — `.feature` служит спецификацией; vitest `it()` блоки реализуют BDD scenarios.

**Install Command:** already installed (vitest^4.1.0 в `package.json devDependencies`)

**Classification:** TEST_DATA_ACTIVE

**TEST_DATA:** TEST_DATA_ACTIVE

**Evidence:** ответы на 4 вопроса:
1. **Создаёт/изменяет данные?** — ДА. Тесты пишут `.mcp.json`, `~/.dev-pomogator/config.json`, копируют skill/tools файлы в fixture project в `os.tmpdir()`.
2. **Изменяет состояние, требующее rollback?** — ДА. Каждый тест должен начинаться с чистой fixture project (нет prior `.mcp.json` либо ровно одна заданная) и заканчиваться cleanup tmpdir.
3. **BDD сценарии требуют предустановленных данных?** — ДА. AC-5 conflict detection требует pre-existing `.mcp.json` с `"claude-in-chrome"` записью; AC-2 smart merge требует pre-existing `.mcp.json` с другими keys.
4. **Внешние сервисы требуют mock?** — ЧАСТИЧНО ДА. CDMM-3 spawning real `npx -y` slow + network-dependent; smoke test fixture может быть либо real (slow CI) либо stub binary `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs`.

**Verdict:** TEST_DATA_ACTIVE — нужны fixtures + cleanup hooks. Real `npx` smoke test markup как `slow` test tier.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | shared helper | n/a | `runInstaller()` через `spawnSync`; create fixture project в `os.tmpdir()` + cleanup | **Да** — direct reuse for installer integration tests |
| `tests/e2e/helpers.ts` | shared helper | n/a | `cleanupTempDir(path)` — recursive remove | **Да** — reuse for AfterScenario teardown |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/features/plugins/chrome-devtools-mcp-mux/test-helpers.ts` | local helper | n/a | `createFixtureWithExistingMcp(content)`, `readMcpJson(path)`, `findClaudeInChromeEntry()` | `tests/features/plugins/auto-commit/test-helpers.ts` (если существует) |
| AfterScenario in each *.test.ts | vitest `afterEach` | per-test | rm fixture tmpdir + reset env vars | существующий pattern в `runInstaller()` integration tests |

### Cleanup Strategy

- Каждый test creates own `os.tmpdir()/dev-pomogator-cdmm-XXXXX/` через `mkdtempSync`.
- afterEach: `fs.rmSync(tmpdir, { recursive: true, force: true })`.
- НЕТ shared state между тестами (ни `~/.dev-pomogator/config.json`, ни global env vars).
- Если test накосячил с cleanup — leak в `os.tmpdir()` ловится OS (eventual cleanup); не критично.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `existing-mcp-json/.mcp.json` | `tests/fixtures/chrome-devtools-mcp-mux/existing-mcp-json/.mcp.json` | Pre-existing user `.mcp.json` с другими servers — для AC-2 smart merge test | per-feature (read-only fixture) |
| `claude-in-chrome-mcp-json/.mcp.json` | `tests/fixtures/chrome-devtools-mcp-mux/claude-in-chrome-mcp-json/.mcp.json` | `.mcp.json` с записью `claude-in-chrome` — для AC-5 conflict test | per-feature (read-only fixture) |
| `fake-cdmcp-mux.mjs` | `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` | Stub binary отвечающий на JSON-RPC `initialize` + `tools/list` без реального Chrome | per-scenario (executed but not modified) |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpdir` | `string` | beforeEach (`mkdtempSync`) | test body, afterEach | Path of fixture project root |
| `originalCwd` | `string` | beforeEach | afterEach | Restore process.cwd if any test changed it |

## Key Decisions

### KD-1: `npx -y` vs `npm i -g`

**Decision:** использовать `npx -y chrome-devtools-mcp-mux@<version>` в `.mcp.json` args.

**Rationale:** README автора так и рекомендует ("change `chrome-devtools-mcp@latest` to `chrome-devtools-mcp-mux@latest` in args array"). npx auto-resolves через npm cache, не требует глобального state. Bump version возможен через изменение одной строки в `extension.json` без global re-install.

**Trade-off:** первый запуск медленнее (npm download если кэш холодный). Mitigation: doctor pre-warm check + post-install message warns user.

**Alternatives considered:**
- (a) `npm i -g chrome-devtools-mcp-mux` — требует global write permission, side effects, cleanup при uninstall более сложный (global bin может остаться). Rejected.
- (b) Bundle source в dev-pomogator + run from `~/.dev-pomogator/node_modules/` — increases install size, ломает upstream update flow. Rejected.

### KD-2: Skill — DEFAULT, не "available alongside"

**Decision:** Skill explicitly направляет Claude к mux как FIRST/DEFAULT choice; запрещает vanilla `chrome-devtools-mcp` если mux в config.

**Rationale:** User explicitly запросил "клуаде ии юзал [mux]". Без явной DEFAULT directive Claude по training-data bias выберет `claude-in-chrome` (которое было в его prompt context раньше). Это проигрывает multi-session изоляцию — единственную ценность mux'а.

**Trade-off:** некоторые user workflow требующие Chrome extensions (password manager) — degraded experience через mux. Mitigation: hard-OUT signals в skill explicitly перечислены, fallback path задокументирован.

**Alternatives considered:**
- (a) Skill — informational ("here's an option"), Claude выбирает. Rejected — user explicit feedback "клуаде ии юзал".
- (b) Block claude-in-chrome через PreToolUse hook. Rejected — too aggressive, user может legitimately хотеть claude-in-chrome.

### KD-3: Project-scoped `.mcp.json` vs home-scoped `~/.claude/mcp.json`

**Decision:** project-scoped `<targetProject>/.mcp.json`.

**Rationale:** Anthropic plugins 2026 guidance — project `.mcp.json` коммитится в git (team-shared), `~/.claude/...` остаётся per-dev. Команды могут sharing того что мы драйвим mux в всех repo workflows; но каждый dev может также иметь свой home config для personal MCP'и. Pin на project — explicit consent, не surprise при cd.

**Trade-off:** если user работает в нескольких repos и хочет mux везде — нужно installer run в каждом. Mitigation: документировать в README extension'а; в P1 follow-up можно offer `--global` flag.

**Alternatives considered:**
- (a) Home-scoped `~/.claude/mcp.json` — surprise при cd; коллидирует с user's personal MCP setup. Rejected.
- (b) Both — duplicate state, sync hell. Rejected.

### KD-4: Conflict resolution — interactive prompt vs silent skip

**Decision:** interactive AskUserQuestion с 3 options; non-interactive default = skip + warning log.

**Rationale:** silent install = data loss / unexpected behavior (Chrome 136 disable extensions silently). User MUST be aware mutual exclusion exists. Interactive prompt 3-option follows pattern из `pomogator-doctor` reinstall flow.

**Trade-off:** interactive prompt замедляет CI install (если CI запускает в TTY mode). Mitigation: explicit `--non-interactive` flag detection; default behavior conservative (skip).

**Alternatives considered:**
- (a) Always silently skip on conflict. Rejected — user не узнает что mux не установился.
- (b) Always silently install + revert claude-in-chrome. Rejected — destructive without consent.
