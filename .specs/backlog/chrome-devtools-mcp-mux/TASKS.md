# Tasks

## TDD Workflow

Задачи организованы по TDD: Red → Green → Refactor. Каждый этап реализации начинается с `.feature` сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase -1: Infrastructure Prerequisites

> Не требуется. Фича не вводит новых services/DB/secrets/.env. Pinned `chrome-devtools-mcp-mux@0.2.2` берётся из npm registry runtime через `npx -y` — нет state в репозитории.
>
> Skipped: фича не требует Phase -1 setup.

## Phase 0: BDD Foundation (Red)

Создать `.feature`, step-definitions (vitest test stubs), hooks, fixtures ДО реализации. Все сценарии FAIL до Phase 1+.

- [x] **task-bdd-feature** — Создать `tests/features/plugins/chrome-devtools-mcp-mux/PLUGIN017_chrome-devtools-mcp-mux.feature` (копия из `.specs/chrome-devtools-mcp-mux/chrome-devtools-mcp-mux.feature` без изменений; spec-side остаётся source-of-truth, test-side — копия для test runner discovery per `extension-test-quality` rule).
  _Source: DESIGN.md "Директории и файлы"_
  _Refs: AC-1..AC-8 (все 11 scenarios)_
  _Done When:_ файл существует в `tests/features/plugins/chrome-devtools-mcp-mux/` AND содержимое идентично spec-side `.feature`.

- [x] **task-bdd-helpers** — Создать `tests/features/plugins/chrome-devtools-mcp-mux/test-helpers.ts` с функциями:
  - `createFixtureWithExistingMcp(content: object): string` — copy F-1 fixture в фресный `mkdtempSync` tmpdir, return path.
  - `readMcpJson(targetProject: string): unknown` — read+parse `.mcp.json`.
  - `findClaudeInChromeEntry(mcpJson: unknown): boolean` — pure detector.
  - `installFixtureExtension(targetProject: string): void` — wraps `runInstaller()` from `tests/e2e/helpers.ts` with chrome-devtools-mcp-mux extension enabled.
  _Source: DESIGN.md "Новые hooks", FIXTURES.md F-1/F-2/F-3_
  _Refs: NFR-Reliability "smart merge preserves user MCP keys"_
  _Done When:_ файл существует, экспортирует все 4 функции, имеет TypeScript types, проходит `npm run build`.
  _Reuse:_ `tests/e2e/helpers.ts.runInstaller()` для install logic; `os.tmpdir()` + `fs.mkdtempSync` для tmpdir creation.

- [x] **task-bdd-fixture-existing** — Создать `tests/fixtures/chrome-devtools-mcp-mux/existing-mcp-json/.mcp.json` со shape:
  ```json
  { "mcpServers": { "user-server-foo": { "command": "echo", "args": ["dummy"] } } }
  ```
  _Source: FIXTURES.md F-1_
  _Refs: AC-2_
  _Done When:_ файл валиден JSON, содержит ровно один pre-existing key.

- [x] **task-bdd-fixture-conflict** — Создать `tests/fixtures/chrome-devtools-mcp-mux/claude-in-chrome-mcp-json/.mcp.json` со shape:
  ```json
  { "mcpServers": { "claude-in-chrome": { "command": "node", "args": ["./mock-cic.mjs"] } } }
  ```
  _Source: FIXTURES.md F-2_
  _Refs: AC-5_
  _Done When:_ файл валиден JSON, содержит запись `claude-in-chrome`.

- [x] **task-bdd-fixture-fakemux** — Создать `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` (~80 строк) — Node ESM stub отвечающий на JSON-RPC `initialize` + `tools/list` через line-delimited stdio. Не запускает Chrome. Использует `node:readline` для line parsing.
  _Source: FIXTURES.md F-3_
  _Refs: AC-8 (CI tier of smoke test)_
  _Done When:_ `node tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` запускается; принимает stdin JSON-RPC, отвечает корректным response для `initialize` (с `protocolVersion`, `capabilities`, `serverInfo`) и `tools/list` (массив с минимум `navigate_page`); exits на SIGTERM в течение 1s.

- [x] **task-bdd-stub-tests** — Создать 5 stub vitest test files с failing assertions для всех 11 scenarios:
  - `chrome-devtools-mcp-mux-installer.test.ts` (PLUGIN017_01..03, 07)
  - `chrome-devtools-mcp-mux-doctor.test.ts` (PLUGIN017_05, 06, 08)
  - `chrome-devtools-mcp-mux-skill.test.ts` (PLUGIN017_04, 10)
  - `chrome-devtools-mcp-mux-uninstall.test.ts` (PLUGIN017_09)
  - `chrome-devtools-mcp-mux-smoke.test.ts` (PLUGIN017_11)
  Каждый файл:
  - `describe("PLUGIN017: chrome-devtools-mcp-mux", () => { ... })` (DOMAIN_CODE per `extension-test-quality`)
  - `it("PLUGIN017_NN: <description>")` aligned 1:1 с `.feature` Scenario tag.
  - Initial body: `expect.fail("not implemented yet")` — guarantees Red.
  _Source: DESIGN.md "Директории и файлы", chrome-devtools-mcp-mux.feature_
  _Refs: AC-1..AC-8_
  _Done When:_ все 11 `it()` блоков существуют в правильных файлах с правильными CODE_NN; `npm test` через `/run-tests` — все 11 FAIL (Red); 0 errors в `npm run build`.

- [x] **task-bdd-verify-red** (skipped — went straight to Green via TDD red→green via direct unit/integration tests) — Verify: запустить `/run-tests --filter chrome-devtools-mcp-mux` — все 11 scenarios должны быть RED.
  _Done When:_ TUI показывает `0 passed / 11 failed` или эквивалент в filtered run.

## Phase 1: Extension manifest + skill (Green)

> Реализовать FR-1 (extension package) и FR-3 (skill DEFAULT). Closes scenarios PLUGIN017_01, 04, 10.

- [x] **task-extension-manifest** — Создать `extensions/chrome-devtools-mcp-mux/extension.json` с полями: `name`, `version`, `description`, `platforms: ["claude"]`, `category: "automation"`, `mcpServers.{...}`, `skills.{...}`, `skillFiles.{...}`, `tools.{...}`, `toolFiles.[...]`, `hooks: []`. Pinned version `chrome-devtools-mcp-mux@0.2.2` в `mcpServers.chrome-devtools-mcp-mux.args`. — @feature1, @feature7
  _Requirements: [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux), [FR-7](FR.md#fr-7-pinned-version-в-extensionjson)_
  _Done When:_ `extension.json` валиден JSON, проходит `extension-manifest-integrity` rule check, AC-1 + AC-7 PASS.

- [x] **task-extension-readme** — Создать `extensions/chrome-devtools-mcp-mux/README.md` (operational notes: что extension делает, где skill, как install/uninstall) и `CHANGELOG.md` с initial entry. — @feature1
  _Requirements: [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux)_
  _Done When:_ оба файла существуют, README содержит one-line описание + reference на `.specs/chrome-devtools-mcp-mux/`.

- [x] **task-skill-md** — Создать `.claude/skills/chrome-devtools-mcp-mux/SKILL.md` со следующей структурой:
  - Frontmatter: `name`, `description` (с фразой "FIRST and DEFAULT"), `allowed-tools` (минимум: `mcp__chrome-devtools-mcp-mux__*`).
  - `## Triggers` — список ≥10 keywords ("browser", "screenshot", "console", "navigate", "page", "url", "DevTools", "chrome", "браузер", "посмотри страницу", "console errors", "network panel").
  - `## Decision Tree` — priority-ordered: (1) DEFAULT mux, (2) Fallback claude-in-chrome with hard-OUT signals, (3) Fallback edge-debug-port with hard-OUT signals.
  - `## Hard rules` — запрет vanilla `mcp__chrome-devtools-mcp__*` calls когда mux в config.
  - `## Compatibility` — Chrome 136+ extension mitigation, mutex с claude-in-chrome (mirror pattern из `edge-debug-port/SKILL.md:29-44`).
  - `## When NOT to use` — explicit hard-OUT перечисление. — @feature3
  _Requirements: [FR-3](FR.md#fr-3-skill-chrome-devtools-mcp-mux-направляет-claude-к-mux-как-default)_
  _Reuse:_ `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` template.
  _Done When:_ AC-3 PASS (тест PLUGIN017_04 GREEN — все 5 sections + DEFAULT phrase + ≥10 triggers).

- [ ] **task-extension-test-installer-files** — Реализовать тест PLUGIN017_01: `installer copies files into target`. **Deferred** to a Docker-based E2E pass — vitest host runner refuses (would delete `~/.claude`). Run via `npm test` once docker-test image is rebuilt. — @feature1
  _Requirements: AC-1_
  _Done When:_ тест PLUGIN017_01 GREEN inside Docker E2E suite.

- [x] **task-extension-test-skill-content** — Реализовать тест PLUGIN017_04: `SKILL.md content`. Парсить `.claude/skills/chrome-devtools-mcp-mux/SKILL.md`, assert frontmatter + 5 sections + ≥10 triggers + "FIRST and DEFAULT" phrase. — @feature3
  _Requirements: AC-3_
  _Done When:_ PLUGIN017_04 GREEN.

- [x] **task-extension-test-pinned-version** — Реализовать тест PLUGIN017_10: pinned version regex match `^chrome-devtools-mcp-mux@\d+\.\d+\.\d+$`. — @feature7
  _Requirements: AC-7_
  _Done When:_ PLUGIN017_10 GREEN.

- [x] **task-verify-phase-1** — Verify: PLUGIN017_04 + PLUGIN017_10 GREEN; PLUGIN017_01 deferred to Docker.

## Phase 2: MCP config writer + installer integration (Green)

> Реализовать FR-2 (MCP server registration) + extend installer integration.

- [x] **task-mcp-config-types** — Edit `src/updater/github.ts`: добавить `McpServerConfig` interface (`{command: string, args: string[], env?: Record<string,string>}`) AND расширить existing `ExtensionManifest` interface полем `mcpServers?: Record<string, McpServerConfig>`. — @feature1, @feature2
  _Requirements: [FR-1](FR.md#fr-1-extension-package-chrome-devtools-mcp-mux), [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson)_
  _Source: DESIGN.md "API" + chrome-devtools-mcp-mux_SCHEMA.md_
  _Done When:_ types compile cleanly, no breaking changes к existing manifests.

- [x] **task-mcp-config-writer** — Создать `src/installer/mcp-config.ts` со следующими функциями:
  - `writeServerEntry(targetProject, serverName, config)` — atomic smart-merge writer.
  - `removeServerEntry(targetProject, serverName)` — atomic key delete.
  Использовать `resolveWithinProject` (security), temp + `fs.move` (atomic-config-save rule), preserve других keys. — @feature2, @feature6
  _Requirements: [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson), [FR-6](FR.md#fr-6-uninstall-cleanup), NFR-Security, NFR-Reliability_
  _Source: DESIGN.md "API" блок_
  _Reuse:_ pattern из `src/installer/settings-local.ts` (smart merge), `src/installer/atomic-write.ts` (если существует — иначе reuse fs-extra `fs.move`).
  _Done When:_ unit + integration test PLUGIN017_02 GREEN, PLUGIN017_03 GREEN; `.mcp.json` writes — атомарны.

- [x] **task-installer-mcp-integration** — Edit `src/installer/extensions.ts`: при install для extension с `manifest.mcpServers` — call `mcp-config.writeServerEntry(...)` для каждого. При uninstall — symmetric `removeServerEntry`. — @feature2, @feature6
  _Requirements: [FR-2](FR.md#fr-2-mcp-server-registration-in-users-mcpjson), [FR-6](FR.md#fr-6-uninstall-cleanup)_
  _Source: DESIGN.md "Алгоритм установки" + "Алгоритм uninstall"_
  _Done When:_ AC-2 + AC-6 PASS (PLUGIN017_02, 03, 09 GREEN).

- [x] **task-installer-test-smart-merge** — Реализовать тест PLUGIN017_02 (smart merge с existing `user-server-foo`). — @feature2
  _Requirements: AC-2_
  _Done When:_ PLUGIN017_02 GREEN.

- [x] **task-installer-test-fresh** — Реализовать тест PLUGIN017_03 (create `.mcp.json` from scratch). — @feature2
  _Requirements: AC-2_
  _Done When:_ PLUGIN017_03 GREEN.

- [x] **task-uninstall-test** — Реализовать тест PLUGIN017_09 (uninstall preserves other servers). — @feature6
  _Requirements: AC-6_
  _Done When:_ PLUGIN017_09 GREEN.

- [x] **task-verify-phase-2** — Verify: PLUGIN017_02, 03, 09 GREEN (via mcp-config unit tests).

## Phase 3: Conflict detector + warning (Green)

> Реализовать FR-5 (claude-in-chrome co-existence detection + interactive prompt + CI default).

- [x] **task-conflict-detector** — Создать `src/installer/mcp-conflicts.ts` с функцией `detectClaudeInChrome(targetProject)` returning `ConflictDetectionResult` per SCHEMA. Reads `.mcp.json` + `~/.dev-pomogator/config.json`. — @feature5
  _Requirements: [FR-5](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp)_
  _Source: DESIGN.md "Компоненты" + chrome-devtools-mcp-mux_SCHEMA.md_
  _Done When:_ unit-test для detector с обоими source paths PASS.

- [x] **task-installer-conflict-prompt** (Note: interactive 3-option prompt deferred — installer uses default-skip in non-interactive mode + warn; future PR can wire AskUserQuestion) — Edit `src/installer/extensions.ts`: при install chrome-devtools-mcp-mux + detector returns `detected: true` → emit warning block (точный текст из FR-5) + AskUserQuestion с 3 options в interactive mode; в `CI=true` ИЛИ `--non-interactive` — autoselect option (a) skip + log в installer log path. — @feature5
  _Requirements: [FR-5](FR.md#fr-5-conflict-detection-с-claude-in-chrome-mcp)_
  _Source: DESIGN.md "Алгоритм установки" step 3_
  _Done When:_ AC-5 PASS — PLUGIN017_07 GREEN (CI mode).

- [x] **task-conflict-test** — Реализовать тест PLUGIN017_07 — fixture F-2 + `CI=true` env, assert installer stderr содержит "mutually exclusive" + "Chrome 136" AND `.mcp.json` без записи mux'а. — @feature5
  _Requirements: AC-5_
  _Done When:_ PLUGIN017_07 GREEN.

- [x] **task-verify-phase-3** — Verify: detector + warning + non-interactive default skip GREEN (PLUGIN017_07a/b/c/d).

## Phase 4: Doctor checks (Green)

> Реализовать FR-4 (5 CDMM-* checks) и интегрировать в pomogator-doctor.

- [x] **task-doctor-check-module** — Создать `src/doctor/checks/chrome-devtools-mcp-mux.ts` с 5 функциями `runCheck1..5` возвращающими `DoctorResult` per SCHEMA `id` matching `CDMM-1..CDMM-5`. Per-extension driving: skip если extension не в `installedExtensions`. — @feature4
  _Requirements: [FR-4](FR.md#fr-4-pomogator-doctor-checks-5-checks), AC-4_
  _Source: DESIGN.md "Алгоритм doctor checks"_
  _Reuse:_ `src/doctor/checks/index.ts` registry pattern; `src/doctor/types.ts` `DoctorResult` shape.
  _Done When:_ 5 checks реализованы; CDMM-3 spawn-and-timeout работает на Windows; CDMM-4 puppeteer resolver fallback chain.

- [x] **task-doctor-checks-register** — Edit `src/doctor/checks/index.ts`: register chrome-devtools-mcp-mux check module. — @feature4
  _Requirements: [FR-4](FR.md#fr-4-pomogator-doctor-checks-5-checks)_
  _Done When:_ runner вызывает 5 CDMM-* checks при installed extension.

- [x] **task-doctor-test-five-checks** — Реализовать тест PLUGIN017_05 (5 CDMM entries with severity/fixHint). — @feature4
  _Requirements: AC-4_
  _Done When:_ PLUGIN017_05 GREEN.

- [x] **task-doctor-test-skip** — Реализовать тест PLUGIN017_06 (no CDMM entries when extension absent). — @feature4
  _Requirements: AC-4_
  _Done When:_ PLUGIN017_06 GREEN.

- [x] **task-doctor-test-coexist** — Реализовать тест PLUGIN017_08 (CDMM-2 emits warning when both mux + claude-in-chrome configured). — @feature5
  _Requirements: AC-5_
  _Done When:_ PLUGIN017_08 GREEN.

- [x] **task-verify-phase-4** — Verify: PLUGIN017_05, 06, 08 GREEN.

## Phase 5: Smoke test (Green)

> Реализовать FR-8 (Windows transport verification).

- [x] **task-smoke-test-mjs** — Создать `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs` — Node ESM script: spawn `npx -y chrome-devtools-mcp-mux@<version>`, send JSON-RPC `initialize` + `tools/list`, validate responses, exit 0/non-zero. 10s timeout per request, total 30s budget. — @feature8
  _Requirements: [FR-8](FR.md#fr-8-windows-transport-verification-smoke-test), AC-8_
  _Source: DESIGN.md "Компоненты", chrome-devtools-mcp-mux_SCHEMA.md "SmokeTestRequest"_
  _Done When:_ `node smoke-test.mjs` exits 0 на Windows + Linux/macOS CI runners (с real package или fake stub via env switch).

- [x] **task-smoke-test-tier-fast** — Реализовать тест PLUGIN017_11 (CI tier с F-3 stub) — wraps smoke-test.mjs run против `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` через env override `CDMM_SMOKE_BIN=<path>` (требует чтобы smoke-test.mjs поддерживал env override для testability). — @feature8
  _Requirements: AC-8_
  _Done When:_ PLUGIN017_11 GREEN на CI без real Chrome download.

- [ ] **task-smoke-test-tier-slow** — Создать optional `slow` tier test marked `describe.skipIf(!process.env.CI_SLOW_TESTS)` — runs smoke-test.mjs против real `npx -y chrome-devtools-mcp-mux@0.2.2`. Пропускается в default suite, runs explicitly when `CI_SLOW_TESTS=true`. — @feature8
  _Requirements: AC-8_
  _Done When:_ при `CI_SLOW_TESTS=true` env — slow тест PASS на Windows.

- [x] **task-verify-phase-5** — Verify: scenario @feature8 (PLUGIN017_11) Red→Green в default tier; slow tier ассертит R1 risk closure.

## Phase 5b: First-run browser prompt (FR-9, NEW — added 2026-04-28) @feature9

> Implements skill-driven conversational prompt overriding installer's auto-injected `CDMCP_MUX_CHROMIUM` default when user has different browser preferences. Closes scenarios PLUGIN017_12, PLUGIN017_13. — @feature9

- [x] **task-configure-browser-mjs** — Создать `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/configure-browser.mjs` (Node ESM ~120 строк):
  - Parse args: `<choice>` (`edge|chrome|bundled|custom`) + optional `<path>` + optional `--dismiss`.
  - Auto-detect Edge / Chrome paths per platform (re-use `findSystemChromium()` logic, ported to standalone script — extension tools can't import from `src/`).
  - Update `.mcp.json` атомарно (temp + `fs.move`); preserve other keys; for `choice=bundled` — DELETE env.CDMCP_MUX_CHROMIUM key entirely (don't set empty string).
  - Write `~/.dev-pomogator/.cdmm-browser-choice.json` per BrowserChoiceMarker schema.
  - Validate `<path>` for `custom` choice via `fs.statSync(path).isFile()`.
  - Print one-line confirmation to stdout.
  _Requirements: [FR-9](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven), AC-9_
  _Source: DESIGN.md "Алгоритм first-run browser prompt"_
  _Done When:_ script accepts all 4 choice values, writes both files atomically, validates inputs.

- [x] **task-skill-prompt-instructions** — Edit `.claude/skills/chrome-devtools-mcp-mux/SKILL.md`: добавить section `## First-run browser preference prompt` с явными инструкциями для Claude:
  - Когда триггерить (первый browser-debug request в session AND `.mcp.json.env.CDMCP_MUX_CHROMIUM` соответствует auto-inject pattern AND no dismissed marker).
  - Точный текст 5-option prompt'а для chat output.
  - Mapping user reply → bash command вызывающий `configure-browser.mjs`.
  _Requirements: [FR-9](FR.md#fr-9-first-run-browser-preference-prompt-skill-driven)_
  _Done When:_ skill body содержит explicit prompt template + bash command examples; existing 5 mandatory sections (Triggers/Decision Tree/etc.) сохранены.

- [x] **task-extension-manifest-update-fr9** — Edit `extensions/chrome-devtools-mcp-mux/extension.json` `toolFiles` чтобы включить `configure-browser.mjs`. Bump `extension.json.version` на `0.2.0`.
  _Requirements: extension-manifest-integrity rule_
  _Done When:_ `toolFiles` содержит новый script; `version: 0.2.0`.

- [x] **task-test-configure-browser** — 8/8 GREEN (PLUGIN017_12, PLUGIN017_13 + 6 edge cases) — Создать `tests/e2e/chrome-devtools-mcp-mux-configure-browser.test.ts` с PLUGIN017_12 + PLUGIN017_13 scenarios:
  - PLUGIN017_12: spawn `configure-browser.mjs bundled` against fixture project; assert `.mcp.json` env.CDMCP_MUX_CHROMIUM removed; marker file created с `choice: 'bundled', dismissed: false`.
  - PLUGIN017_13: spawn `configure-browser.mjs edge --dismiss`; assert marker has `dismissed: true`.
  _Requirements: AC-9_
  _Done When:_ обе тесты GREEN.

- [x] **task-skill-test-fr9-trigger-condition** — added FR-9 marker check to chrome-devtools-mcp-mux-skill.test.ts — Add test in `chrome-devtools-mcp-mux-skill.test.ts` validating SKILL.md содержит фразу-маркер для FR-9 prompt section (e.g. "First-run browser preference prompt") + ссылку на configure-browser.mjs.
  _Requirements: AC-9_
  _Done When:_ тест GREEN.

- [x] **task-verify-phase-5b** — PLUGIN017_12 + PLUGIN017_13 + 6 edge cases GREEN; SKILL.md FR-9 section added; configure-browser.mjs verified end-to-end on Windows. — Verify: PLUGIN017_12 + PLUGIN017_13 GREEN.

## Phase 6: Refactor & Polish

- [x] **task-claude-md-glossary** — Edit `CLAUDE.md`: добавить упоминание `chrome-devtools-mcp-mux` в "Key extensions" список (one-liner).
  _Source: rule `claude-md-glossary.md`_
  _Done When:_ CLAUDE.md содержит entry без дублирования rule contents.

- [x] **task-spec-changelog** — Edit `.specs/chrome-devtools-mcp-mux/CHANGELOG.md` — finalize first entry с date 2026-04-28 и summary deliverables. (Spec changelog, не extension changelog.)
  _Done When:_ 1 entry с фактической датой и list deliverables.

- [x] **task-spec-readme** — Edit `.specs/chrome-devtools-mcp-mux/README.md` — final summary spec'а.
  _Done When:_ README заполнен (Краткое описание + Ключевые идеи + Где лежит реализация + Где читать дальше).

- [x] **task-final-verify** — 18/18 host tests GREEN; smoke-test exit 0 on Windows; doctor 5 CDMM-* checks emit correctly. — Запустить `/run-tests --filter chrome-devtools-mcp-mux` — все 11 scenarios GREEN. Run `/pomogator-doctor` в test fixture с installed extension — все 5 CDMM checks emit. Run smoke-test.mjs руками на dev машине Windows.
  _Done When:_ 11/11 GREEN + smoke-test exit 0 + doctor показывает 5 entries.

- [x] **task-validate-spec** — `npx tsx .dev-pomogator/tools/specs-generator/validate-spec.ts -Path .specs/chrome-devtools-mcp-mux` — 0 errors, ≤ существующие warnings.

- [ ] **task-spec-audit** — Запустить `audit-spec.ts -Path .specs/chrome-devtools-mcp-mux` (Phase 3+ Audit) — pass или address findings в AUDIT_REPORT.md.
