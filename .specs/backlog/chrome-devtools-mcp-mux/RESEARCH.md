# Research

## Контекст

Фича `chrome-devtools-mcp-mux` — добавление в dev-pomogator extension, который регистрирует MCP-сервер `chrome-devtools-mcp-mux` (multiplexer вокруг upstream `chrome-devtools-mcp`) и поставляет skill, направляющий Claude когда юзать этот инструмент. **Проблема которую решаем:** при двух+ параллельных Claude Code сессиях vanilla `chrome-devtools-mcp` deadly races — обе видят все табы через `list_pages`, `select_page` пересекаются, `new_page` приземляется в чужое окно. Это ломает любые multi-session debug workflows. Mux от ochen1 решает это per-client `BrowserContext` изоляцией с шарингом одного Chrome профиля.

User explicitly запросил: "решение проблемы когда много сессий долбятся в один хром". Подтверждённое evidence: [chrome-devtools-mcp issue #926](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/926) — open feature request "Multi-session support for parallel browser instances", и [#1763](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1763) — "multiple MCP processes on same debug port cause Network.enable timeout". Mux это аддресует.

## Источники

- **npm registry:** `chrome-devtools-mcp-mux@0.2.2`, опубликован 2026-04-22 (≈5 дней назад на момент спеки), Apache-2.0, by ochen1 (xoliverchen@gmail.com), unpacked size 104 KB, single dep `chrome-devtools-mcp@0.22.0`. `[VERIFIED: npm view chrome-devtools-mcp-mux output, 2026-04-27]`
- **GitHub:** https://github.com/ochen1/chrome-devtools-mcp-mux — Apache-2.0, single maintainer.
- **Glama listing:** https://glama.ai/mcp/servers/ochen1/chrome-devtools-mcp-mux — содержит outdated install instructions (`git clone + npm link`); README на GitHub теперь предписывает `.mcp.json` config-only flow.
- **Tarball contents (verified):** `dist/bin/cdmcp-mux.js`, `dist/cli/{status,tail}.js`, `dist/daemon/{context,daemon,logger,rewrite,upstream}.js`, `DEMO.md`, `README.md`. `[VERIFIED: npm pack --dry-run --json, 2026-04-27]`
- **Upstream `chrome-devtools-mcp`:** https://github.com/ChromeDevTools/chrome-devtools-mcp — Google's official Chrome DevTools MCP server, использует puppeteer для драйва Chromium. Mux идёт как drop-in replacement, депендит на `chrome-devtools-mcp@0.22.0`.
- **Chrome 136+ extension policy:** [Chrome blog April 2025](https://developer.chrome.com/blog/chrome-devtools-mcp) + dev-pomogator's existing `edge-debug-port` SKILL.md (lines 29-44) — launching Chrome/Edge с `--remote-debugging-port=N` **disables all browser extensions** as security mitigation.

## Технические находки

### Архитектура mux (из README + tarball structure)

Three-layer:

1. **Per-client shim** — `cdmcp-mux` бинарь, один процесс на каждого MCP-клиента (= одна Claude Code сессия). По сути — pure byte pipe между client's stdio и daemon socket. Тонкий, спавнится Claude Code-ом как обычный stdio MCP server (через `.mcp.json` `command`).
2. **Shared daemon** — single long-running process. Первый shim, который не нашёл daemon, спавнит его (auto-spawn). Daemon владеет ownership table `{contextId → pageIds[]}`, перехватывает все JSON-RPC `tools/call`, добавляет `pageId` filter из per-connection ownership table. Использует upstream feature `--experimentalPageIdRouting` для atomicity.
3. **Single Chromium** — daemon владеет одним `chrome-devtools-mcp` subprocess который драйвит ОДИН Chromium с одним `--user-data-dir`. Каждый shim-connection = свежий `BrowserContext` (puppeteer concept) с изолированными cookies/localStorage/WebSockets.

Tool schemas: daemon advertises **точно те же** tool schemas что и vanilla `chrome-devtools-mcp` (drop-in compatibility). `pageId` и `isolatedContext` параметры stripped из client view, re-injected daemon-ом из ownership table. Cross-context page-scoped вызовы отвергаются daemon-ом.

### Установка и интеграция

Per official README (verified via `WebFetch raw.githubusercontent.com/ochen1/chrome-devtools-mcp-mux/main/README.md`):

> "Simply update your `.mcp.json` configuration file by changing `chrome-devtools-mcp@latest` to `chrome-devtools-mcp-mux@latest` in the args array."

Implication: **никакого глобального `npm i -g`** не требуется per upstream rec. `npx -y chrome-devtools-mcp-mux@latest` достаточно — npm cache resolve и shim запускается. User в треде сказал "я нпм смог установить" — это работает, но для dev-pomogator extension-flow `npx -y` правильнее (нет глобального state, easier update через bump version в `extension.json`, нет PATH-конфликтов с другими bin).

Sample `.mcp.json` entry (extrapolated from stdio MCP convention + upstream docs):

```json
{
  "mcpServers": {
    "chrome-devtools-mcp-mux": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp-mux@0.2.2"]
    }
  }
}
```

### Транспорт shim ↔ daemon (Windows considerations)

README содержит "unix socket" в описании архитектуры. Но на Windows нативные Unix sockets есть с Win10 1803, и Node.js поддерживает их через `net.createServer` начиная с Node 16+, ОДНАКО conventional Node IPC pipe pattern на Windows — **named pipes** (`\\.\pipe\...`). Без чтения daemon source в `dist/daemon/daemon.js` (28 KB) точно сказать нельзя.

`[UNVERIFIED]` Точная схема Windows transport. **Mitigation:** Phase 1 verification — выкачать `dist/daemon/daemon.js`, прогрепать на `\\\\.\\\\pipe\\\\` / `process.platform === 'win32'`, либо запустить `cdmcp-mux` руками на Windows с `cdmcp-mux status` (CLI subcommand, видим в `dist/cli/status.js`). User affirm "в винде тоже" — нужен runtime proof в виде live `cdmcp-mux` запуска.

### Limitations (из README)

> "Arbitrary CLI arguments, `--browserUrl`, `--autoConnect`, and version pinning aren't yet supported."

Implications для dev-pomogator integration:

- **`--browserUrl` not supported** → нельзя сказать mux-у "присоединись к моему уже-запущенному Chrome на :9222". Это блокирует hybrid flow с `edge-debug-port` skill.
- **`--autoConnect` not supported** → нельзя skip connection handshake.
- **Version pinning of upstream** не настраивается — mux pins `chrome-devtools-mcp@0.22.0` сам.
- **Headful by default** — соответствует upstream поведению. `CDMCP_MUX_HEADLESS=true` env var переключает на headless.

### Совместимость с другими browser-MCP в dev-pomogator

dev-pomogator уже имеет:

1. **`mcp__claude-in-chrome__*`** — MCP browser extension flow. Использует Chrome extension, communicates через background service worker, **НЕ** использует CDP debug port. Совместим с обычным Chrome где extensions работают.
2. **`extensions/edge-debug-port/`** (uncommitted, untracked) — PowerShell-скрипт меняющий Edge shortcuts/registry чтобы Edge всегда стартовал с `--remote-debugging-port=9222`. Для Playwright `connectOverCDP` workflow.

Existing `edge-debug-port` SKILL.md уже документирует mutex (line 29-44):

> "Starting Chrome/Edge **136** (April 2025), launching with `--remote-debugging-port=N` **disables all browser extensions** as a security mitigation."

`chrome-devtools-mcp-mux` (через upstream `chrome-devtools-mcp`) использует puppeteer который сам спавнит Chrome с CDP — те же mitigation triggers. Implication: **в одном Chrome instance** можно держать ровно один из:

- `claude-in-chrome` (extensions работают, single tab namespace),
- `chrome-devtools-mcp-mux` (multi-session isolation, extensions disabled),
- `edge-debug-port` (real user profile via CDP, extensions disabled).

Это **не bug** в mux, а browser security policy. Spec должен явно это документировать в Skill.md и pomogator-doctor warning.

### Where dev-pomogator artefacts будут лежать

- App-код (extension): `extensions/chrome-devtools-mcp-mux/extension.json` + `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/` (если потребуются helper scripts — например smoke test для doctor).
- Skill: `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` (per `extension-layout` rule — skills source ОБЯЗАН лежать в repo `.claude/skills/{name}/`, не в `extensions/{ext}/skills/`).
- Tests: `tests/features/plugins/chrome-devtools-mcp-mux/*.test.ts` + `tests/features/plugins/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux.feature` (1:1 с BDD сценариями per `extension-test-quality` rule).
- Doctor checks: `src/doctor/checks/chrome-devtools-mcp-mux.ts` (новый файл) + регистрация в `src/doctor/checks/index.ts`.
- MCP config target: пользовательский `.mcp.json` в target project root (mirror pattern существующих MCP-extensions if any) — Phase 2 design уточнит.

## Risk Assessment

| ID | Риск | Severity | Likelihood | Mitigation |
|----|------|----------|------------|------------|
| R1 | Windows transport неподтверждён — daemon может использовать unix socket который на Windows работает странно (Node 16+ supports, но edge cases) | High | Medium | Phase 1 verification: live запуск `cdmcp-mux` на Windows + `cdmcp-mux status` CLI; если не работает — escalate to ochen1 issue tracker, временно spec `[OUT_OF_SCOPE: Windows]` |
| R2 | Conflict с `claude-in-chrome` MCP — Chrome 136+ disables extensions при `--remote-debugging-port` | High | High (любой user уже имеющий claude-in-chrome) | Installer detects co-existence + warn; Skill.md документирует mutex явно; doctor 🟡 warning |
| R3 | `chrome-devtools-mcp-mux` — single-maintainer, 5-day-old package, semver 0.2.2 (pre-1.0) | Medium | Medium | Pin exact version в `extension.json` (`0.2.2`), не `latest`; semver bumps требуют explicit dev-pomogator release |
| R4 | Limitations: no `--browserUrl` → блокирует hybrid с `edge-debug-port` (нельзя сказать mux-у "use my Edge на :9222") | Medium | Low (две разные user populations) | Skill.md явно перечисляет limitation; doctor не предлагает hybrid flow |
| R5 | Daemon process leak — orphan daemon живёт после crash всех клиентов; consumes RAM | Low | Medium | Doctor check (P1, after MVP) для running daemon orphans; user-instructable cleanup `cdmcp-mux status` + manual kill |
| R6 | Shared Chrome profile — две сессии видят cookies/login друг друга | Low | High | Документировать в Skill.md; envvar `CDMCP_MUX_USER_DATA_DIR` for separate profile (TBD verify exists) |
| R7 | Puppeteer Chrome download (≈170MB) при первом `npx -y` запуске на чистой машине → пользователь воспринимает как "висит" | Medium | High | Installer auto-injects `CDMCP_MUX_CHROMIUM` на Windows (Edge default — уже установлен), skipping download; skill FR-9 prompt позволяет user override; doctor CDMM-4 warns если Chrome bin отсутствует |
| R8 | Auto-injected Edge default не учитывает user preference (юзер Chrome-user / хочет изолированный bundled / нестандартный browser) | Medium | High (мейнстрим юзеров на Windows предпочитают Chrome) | FR-9: skill инициирует first-run conversational prompt с 5 опциями + dismiss flag в `~/.dev-pomogator/.cdmm-browser-choice.json` |

## Источники для верификации

| Источник | URL | Назначение |
|----------|-----|------------|
| npm registry — package metadata | `npm view chrome-devtools-mcp-mux` (CLI) | Проверка version, deps, bin name, publish date |
| npm registry — tarball file list | `npm pack --dry-run --json chrome-devtools-mcp-mux` (CLI) | Список файлов в опубликованном пакете для понимания shape |
| GitHub repo — source of truth README | https://github.com/ochen1/chrome-devtools-mcp-mux | Установка, конфигурация, limitations |
| GitHub repo — daemon source (для R1 verification) | https://github.com/ochen1/chrome-devtools-mcp-mux/blob/main/src/daemon/daemon.ts (или dist) | Транспорт на Windows |
| Upstream chrome-devtools-mcp issue #926 | https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/926 | Контекст: feature request multi-session support — open issue, mux это аддресует sub-rosa |
| Chrome 136 extensions+CDP mitigation | dev-pomogator's `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md:29-44` | Browser security policy reference |
| Anthropic MCP spec | https://modelcontextprotocol.io/ | stdio transport, JSON-RPC initialize/tools/list |

## Где лежит реализация (после Phase 2-3)

- App-код: `extensions/chrome-devtools-mcp-mux/extension.json` + `.claude/skills/chrome-devtools-mcp-mux/SKILL.md`
- Doctor checks: `src/doctor/checks/chrome-devtools-mcp-mux.ts` + регистрация в `src/doctor/checks/index.ts`
- Installer integration: `src/installer/mcp-config.ts` (новый ИЛИ extend existing) — ставит запись в `.mcp.json`
- Tests: `tests/features/plugins/chrome-devtools-mcp-mux/*.test.ts` + `.feature`
- Конфигурация (writeable): user's `.mcp.json` (project- или home-scoped — Phase 2 design)
- Конфигурация (read-only by extension): `~/.dev-pomogator/config.json` managed entries

## Выводы

1. **Package real & published.** `chrome-devtools-mcp-mux@0.2.2` верифицирован на npm registry; `npx -y chrome-devtools-mcp-mux@0.2.2` — рабочий install path. Глобальный `npm i -g` опционален, не required.
2. **Drop-in MCP server.** Единственное изменение в `.mcp.json` — заменить args от `chrome-devtools-mcp@latest` на `chrome-devtools-mcp-mux@0.2.2`. Тулсхемы те же; client transparency.
3. **Mutual exclusion с extension-based MCP в одном Chrome.** Chrome 136+ disables extensions при `--remote-debugging-port`; это коренное browser policy, не fixable. Spec должен warn-уть пользователя при coexistence.
4. **Windows transport — открытый вопрос.** README указывает unix socket; Node поддерживает на Windows, но specific impl TBD. Phase 1 closure step: live verification.
5. **Pin version explicitly.** Pre-1.0 single-maintainer пакет — rolling `latest` ненадёжно. `extension.json` фиксит конкретную version, апдейт через release dev-pomogator.
6. **Skill ставит mux дефолтом, не альтернативой.** Без skill Claude по умолчанию ходит к `claude-in-chrome` (он первый в его training data + system prompt context) и проигрывает multi-session изоляцию. Skill MUST: (a) явно сделать `mcp__chrome-devtools-mcp-mux__*` priority-1 выбором для любого browser-debug запроса, (b) перечислить узкие hard-OUT сигналы для fallback на `claude-in-chrome` или `edge-debug-port`, (c) **запретить** вызов vanilla `mcp__chrome-devtools-mcp__*` при наличии mux в `.mcp.json` (unsafe в multi-session). См. UC-4 decision tree.
7. **Doctor coverage необходимо.** 5 checks для chrome-devtools-mcp-mux (extension installed, MCP entry, npx accessible, Chrome bin, skill registered) — без них debug "у меня браузер не открывается" сводится к гаданию.
8. **No mocks for integration tests.** Per `integration-tests-first` rule — тесты должны spawn реальный `cdmcp-mux` (через `npx -y`) и говорить с ним по stdio JSON-RPC; mocking JSON-RPC stdio защищает только от опечаток в тестовом mock-е.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | Skills/rules ДОЛЖНЫ жить в `.claude/skills/` repo root, не в `extensions/{ext}/skills/` | Создание skill `chrome-devtools-mcp-mux` | FR на skill source path; tests |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | `extension.json` source of truth для files/skills/tools | Новый extension | FR-1 (manifest fields) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` specifiers обязательны в `extensions/**/*.ts` | Любые helper scripts | FR-tools |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Пути из манифеста через `resolveWithinProject` | MCP config write пути | NFR-Security |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | 3 формата hooks; mcp config другой формат | Installer интеграция | FR-installer |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp + `fs.move` | `.mcp.json` write | NFR-Reliability |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test↔feature, no inline copy of prod code | BDD tests | FR-tests |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты — интеграционные через `runInstaller`/`spawnSync` | All test files | FR-tests |
| centralized-test-runner | `.claude/rules/tui-test-runner/centralized-test-runner.md` | Тесты только через `/run-tests` | TASKS.md test invocation | TASKS Phase invocations |
| screenshot-driven-verification | `.claude/rules/pomogator/screenshot-driven-verification.md` | Любой UI proof — screenshot с описанием | Manual verification doctor output | DoD verification plan |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| edge-debug-port skill | `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` | Pattern для browser-related skill с Triggers / When NOT / Compatibility / Hard rules sections + mutex documentation для browser extensions | **Direct template** для chrome-devtools-mcp-mux SKILL.md |
| edge-debug-port extension.json | `extensions/edge-debug-port/extension.json` | Минимальный extension с tool + skill, без hooks | Template для `extensions/chrome-devtools-mcp-mux/extension.json` |
| pomogator-doctor extension | `extensions/pomogator-doctor/` (per `.specs/pomogator-doctor/`) | Pattern для doctor check authoring (severity, fix hints, traffic-light) | Reuse as-is для chrome-devtools-mcp-mux checks |
| doctor checks index | `src/doctor/checks/index.ts` | Registry новых checks | Add chrome-devtools-mcp-mux check entry |
| MCP config writer | `src/installer/` (TBD which file handles `.mcp.json` — Phase 2 evidence) | Atomic write pattern + smart merge для user MCP configs | Reuse if exists; create if doesn't |
| `claude-in-chrome` MCP usage docs | top of CLAUDE.md (in-system MCP server section) | Reference для co-existence detection и Skill mutex documentation | Doctor + Skill compatibility logic |

### BDD Framework Detection

`[VERIFIED: package.json + tests/features/plugins/ scan, 2026-04-28]`

| Field | Value |
|-------|-------|
| `language` | typescript |
| `framework` | vitest 4.1.0 (per `package.json` devDependencies) |
| `installCommand` | N/A (already installed via dev-pomogator's own deps) |
| `hookFileHints` | `tests/e2e/helpers.ts` (shared), per-test `beforeEach`/`afterEach` |
| `configFileHint` | `vitest.config.ts` |
| `fixturesFolderHint` | `tests/fixtures/{feature-slug}/` |
| `evidence` | `package.json` "vitest": "^4.1.0"; 22+ existing `.feature` files in `tests/features/plugins/{ext}/`; convention `{DOMAINCODE}_{name}.feature` (e.g., `PLUGIN006_auto-commit.feature`) |
| `naming convention` | `tests/features/plugins/{ext}/{DOMAIN_CODE}_{ext}.feature` + `tests/features/plugins/{ext}/{ext}-*.test.ts` 1:1 mapping |

**Note:** автоматический детектор в `bdd-framework-detector.ts` ошибочно ловит `csharp/Reqnroll` через fixture `tests/fixtures/steps-validator/csharp/Project.csproj`; **реальный** framework dev-pomogator = vitest. Override явно записан выше.

### Existing BDD Hooks

- `tests/e2e/helpers.ts` — `runInstaller()` wrapper через `spawnSync('node', [cliJs])`, fixture project в `os.tmpdir()`. **Reuse** для integration tests Phase 0.
- `tests/features/plugins/*/` — pattern per-extension tests, 1:1 с `.feature` (rule `extension-test-quality`). Новый `tests/features/plugins/chrome-devtools-mcp-mux/` follow.
- НЕТ существующего fake-MCP-server fixture для chrome-devtools-mcp семейства; tests спавнят реальный `cdmcp-mux` через `npx -y` (slow, network-dependent) ИЛИ stub binary `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` который только отвечает на JSON-RPC `initialize`+`tools/list` для smoke test. Tradeoff: реальный E2E vs дешёвый stub — Phase 2 design выберет per AC; per `integration-tests-first` rule минимум 1 real-spawn test обязателен.

### Architectural Constraints Summary

- **Extension layout**: skill source МУСТ в `.claude/skills/chrome-devtools-mcp-mux/`, manifest references via `extension.json.skills.{name}` SOURCE path.
- **MCP config write**: атомарно, через temp + `fs.move`; smart merge с user keys (preserve other MCP servers); validate path через `resolveWithinProject`.
- **Test framework**: vitest (per project default); BDD `.feature` aligned 1:1 с test cases; naming `CDMM001_NN`.
- **Version pinning**: `extension.json` pin exact `chrome-devtools-mcp-mux@0.2.2`; `latest` запрещён для production install.
- **Self-guard**: uninstall refuse в dev-pomogator source repo (mirror pattern existing).
- **Windows-first**: даже если transport на Windows работает с caveat — spec MUST cover Windows AC; нет права на `[OUT_OF_SCOPE: Windows]` без user approval.
