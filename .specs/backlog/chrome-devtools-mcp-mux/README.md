# Chrome Devtools MCP Mux

Dev-pomogator extension, который регистрирует MCP-сервер `chrome-devtools-mcp-mux` (multiplexer вокруг upstream `chrome-devtools-mcp@0.22.0`) и поставляет skill, направляющий Claude Code использовать mux **как DEFAULT** для всех browser-debug запросов. Решает race conditions когда 2+ Claude Code сессии параллельно драйвят один Chrome — `list_pages` показывает чужие табы, `select_page` пересекается, `new_page` приземляется в чужое окно. Mux изолирует каждую сессию через свой `BrowserContext` при сохранении одного залогиненного Chrome профиля.

## Ключевые идеи

- **Drop-in replacement.** `extension.json.mcpServers.chrome-devtools-mcp-mux` пишется в user's `.mcp.json` через atomic smart-merge writer. Смена pinned version (`@0.2.2` → следующая) — однострочный diff в манифесте.
- **Skill enforces "mux first".** SKILL.md ОБЯЗАН содержать 5 sections (Triggers / Decision Tree / Hard rules / Compatibility / When NOT to use) + явную "FIRST and DEFAULT" фразу. Hard rule: запрет vanilla `chrome-devtools-mcp` calls если mux configured. Hard-OUT fallback паттерны (`claude-in-chrome` при необходимости browser extensions, `edge-debug-port` при необходимости real Edge profile) узко перечислены.
- **Mutex с claude-in-chrome MCP detected at install.** Chrome 136+ disables все extensions при `--remote-debugging-port=N` (security mitigation, не обходится). Installer warn-ит при coexistence + 3-option prompt (skip / install+revert other / install+separate Chrome instance); в CI default = skip.
- **Pomogator-doctor покрывает 5 CDMM-* checks.** Extension installed / MCP entry / npx accessible / Chrome bin available / skill registered. Per-extension driving: checks skip когда extension не установлен.
- **TDD-first BDD.** 13 scenarios в `PLUGIN017_chrome-devtools-mcp-mux.feature`, 1:1 mapping с vitest test files (per `extension-test-quality` rule). Smoke test (FR-8) closes Windows transport risk R1 — JSON-RPC handshake spawn'ится против F-3 stub в default CI tier и против real package в `slow` tier.

## Где лежит реализация

- **Extension manifest:** `extensions/chrome-devtools-mcp-mux/extension.json`
- **Skill:** `.claude/skills/chrome-devtools-mcp-mux/SKILL.md`
- **MCP config writer:** `src/installer/mcp-config.ts` (новый модуль для atomic smart-merge `.mcp.json` writes/removes)
- **Conflict detector:** `src/installer/mcp-conflicts.ts` (новый модуль)
- **Doctor checks:** `src/doctor/checks/chrome-devtools-mcp-mux.ts` (новый модуль) + регистрация в `src/doctor/checks/index.ts`
- **Smoke test:** `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs`
- **Wiring:** `src/installer/extensions.ts` (edited) — вызывает MCP config writer/remover при install/uninstall extension с `mcpServers` в manifest.
- **Tests:** `tests/features/plugins/chrome-devtools-mcp-mux/` directory + 3 fixtures в `tests/fixtures/chrome-devtools-mcp-mux/`.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 6 stories (developer parallel sessions / maintainer / AI agent / end user / claude-in-chrome conflict / cleanup)
- [USE_CASES.md](USE_CASES.md) — 7 кейсов (happy path multi-session, install, conflict, skill direction, daemon outlive, doctor, uninstall)
- [RESEARCH.md](RESEARCH.md) — npm verification + architecture + Risk Assessment + Project Context
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR↔AC↔@featureN
- [FR.md](FR.md) — 8 functional requirements
- [NFR.md](NFR.md) — Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS format AC-1..AC-8
- [DESIGN.md](DESIGN.md) — components + algorithms + Key Decisions (KD-1..KD-4) + BDD Test Infrastructure
- [FILE_CHANGES.md](FILE_CHANGES.md) — список всех create/edit файлов
- [TASKS.md](TASKS.md) — TDD-ordered tasks (Phase 0 Red → Phases 1-5 Green → Phase 6 Refactor)
- [chrome-devtools-mcp-mux.feature](chrome-devtools-mcp-mux.feature) — 13 BDD scenarios PLUGIN017_01..11
- [chrome-devtools-mcp-mux_SCHEMA.md](chrome-devtools-mcp-mux_SCHEMA.md) — JSON shapes + validation rules
- [FIXTURES.md](FIXTURES.md) — 3 fixtures (existing-mcp-json, claude-in-chrome-mcp-json, fake-cdmcp-mux)
- [CHANGELOG.md](CHANGELOG.md) — spec history
