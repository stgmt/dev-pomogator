# Tasks

## TDD Workflow

Задачи организованы TDD: Red → Green → Refactor. Phase 0 создаёт .feature + step definitions + hooks/fixtures (всё FAIL). Phase 1-5 реализуют код, переводят сценарии Red→Green. Phase 6 — рефакторинг и финальный verify.

---

## Phase -1: Infrastructure Prerequisites

Проверка и установка зависимостей для разработки и тестов.

- [ ] Убедиться что Node ≥ 22.6 (`node --version`) — для native strip-types при dev loop
  _Config: см. DESIGN.md "Algorithm" step 4 (Node version requirement)_
- [ ] `npm install p-limit` (bounded concurrency pool) + `@types/semver` если отсутствует
  _Config: см. FILE_CHANGES.md "package.json — EDIT existing"_
- [ ] Создать ветку `feat/pomogator-doctor` от main
- [ ] Env vars для тестов: `HOME`/`USERPROFILE` mutable в test runner config (vitest setupFiles) `[VERIFIED: vitest docs — config.test.env]`

## Phase 0: BDD Foundation (Red) — TEST_DATA_ACTIVE

> DESIGN.md classification = TEST_DATA_ACTIVE → обязательные задачи для всех hooks/fixtures.

### BDD Scaffolding

- [ ] Создать 6 test file стабов с `describe.skip` блоками: doctor-core, doctor-entry, doctor-reinstall, doctor-output, doctor-gating, doctor-reliability
  _Source: FILE_CHANGES.md "BDD step definitions"_
- [ ] Наполнить pending scenarios 01..15 из pomogator-doctor.feature — `it.skip('POMOGATORDOCTOR001_XX ...', () => { throw new Error('pending') })`
- [ ] Создать integration test-entrypoint `tests/e2e/pomogator-doctor.test.ts` stub
  _Source: FILE_CHANGES.md_
- [ ] Убедиться `/run-tests` (через wrapper) показывает 15 failing scenarios (Red state)
  _Rule: centralized-test-runner_

### Fixtures + Hooks (DESIGN.md → BDD Test Infrastructure → Новые hooks)

- [ ] Hook `@child-registry` (global scope): `tests/fixtures/pomogator-doctor/child-registry.ts` (beforeAll/afterAll) — tracking all spawned children в Set, afterAll SIGKILL orphan
  _Source: DESIGN.md "Новые hooks" row 4 (@child-registry tag)_
  _Reuse: N/A — новый pattern для NFR-R-5_
- [ ] Hook `@env-aware` (per-test scope): `tests/fixtures/pomogator-doctor/env-snapshot.ts` (beforeEach/afterEach) — snapshot process.env + dotenv load + restore
  _Source: DESIGN.md "Новые hooks" row 3 (@env-aware tag)_
- [ ] Hook `@doctor-home` (per-scenario scope): `tests/fixtures/pomogator-doctor/temp-home-builder.ts` — factory для F-1..F-5 + F-12/F-13 с опциями (skipTools, hooksDivergent, corruptConfig, configVersion, installedExtensions, envInSettingsLocal)
  _Source: DESIGN.md "Новые hooks" row 1 (@doctor-home tag), FIXTURES.md F-1..F-5 + notes "Identified gaps"_
- [ ] Hook `@mcp-probe` (per-scenario scope): `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` — spawn `node -e SCRIPT` stdio JSON-RPC responder (опции: responsive/hangOnInit/crashOnInit)
  _Source: DESIGN.md "Новые hooks" row 2 (@mcp-probe tag), FIXTURES.md F-6..F-8_
  _External: MCP protocol [VERIFIED: Anthropic MCP spec]_
- [ ] Создать static fixtures: dotenv-fixtures valid/missing-key/malformed env files
  _Source: FIXTURES.md F-9..F-11_
- [ ] Создать step definitions (заглушки) — throw NotImplementedError для каждого Given/When/Then
- [ ] Verify: все 15 scenarios в RED state (fail) с понятными error messages

## Phase 1: Core types + runner + lock (Green)

- [ ] Создать `src/doctor/types.ts` — CheckResult / DoctorOptions / DoctorReport / HookOutput interfaces
  _Requirements: [FR-19](FR.md#fr-19-reinstallable-classification-meta-feature2)_
  _Config: см. SCHEMA.md_
- [ ] Создать `src/doctor/lock.ts` — acquire/release с `fs.writeFile(path, pid, {flag:'wx'})`, stale lock cleanup
  _Requirements: [NFR-R-4](NFR.md#reliability)_
  _Leverage: rule atomic-update-lock_
- [ ] Создать `src/doctor/runner.ts` — orchestrator: loadConfig + per-ext gating + concurrent pool + global timeout
  _Requirements: [FR-21](FR.md#fr-21-perextension-driving-feature11), [NFR-P-3](NFR.md#performance), [NFR-P-4](NFR.md#performance)_
  _Leverage: `src/config/index.ts:loadConfig`_
- [ ] Создать `src/doctor/index.ts` — publi API `runDoctor(options)`
  _Requirements: [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8)_
- [ ] Verify: doctor-reliability.test.ts scenarios 13 (corrupt config), 14 (concurrent lock), 15 (fail-soft) → Green
  @feature2 @feature8 @feature4

## Phase 2: Filesystem + binary checks (Green)

- [ ] `src/doctor/checks/node-version.ts` — FR-1, process.versions.node semver check
  _Requirements: [FR-1](FR.md#fr-1-node-version-check-feature1)_
  @feature1
- [ ] `src/doctor/checks/git.ts` — FR-2, spawnSync git --version
  _Requirements: [FR-2](FR.md#fr-2-git-presence-check-feature1)_
  @feature1
- [ ] `src/doctor/checks/pomogator-home.ts` — FR-3 (C3/C4/C5 combined)
  _Requirements: [FR-3](FR.md#fr-3-devpomogator-structure-check-feature2)_
  _Leverage: config.installedExtensions iteration_
  @feature2
- [ ] `src/doctor/checks/hooks-registry.ts` — FR-4, diff settings.local.json vs config.managed.hooks
  _Requirements: [FR-4](FR.md#fr-4-hooks-registry-sync-check-feature2)_
  _Rule: no-unvalidated-manifest-paths для path validation_
  @feature2
- [ ] `src/doctor/checks/env-vars.ts` — FR-5, dual location (process.env + settings.local.json → env)
  _Requirements: [FR-5](FR.md#fr-5-env-requirements-check-dual-location-feature3)_
  _Leverage: `src/installer/env-setup.ts:getMissingRequiredEnv`_
  @feature3
- [ ] `src/doctor/checks/env-example.ts` — FR-6, fs.exists .env.example
  _Requirements: [FR-6](FR.md#fr-6-envexample-presence-check-feature2)_
  @feature2
- [ ] `src/doctor/checks/version-match.ts` — FR-11, semver compare package.json vs config.json
  _Requirements: [FR-11](FR.md#fr-11-version-match-check-feature2)_
  @feature2
- [ ] `src/doctor/checks/gitignore-block.ts` — FR-12, find MARKER_BEGIN/END block
  _Requirements: [FR-12](FR.md#fr-12-managed-gitignore-block-check-feature2)_
  _Leverage: `src/installer/gitignore.ts:MARKER_BEGIN/END`_
  @feature2
- [ ] Verify: doctor-core.test.ts happy path scenario 01 + missing-tools 02 + corrupt 13 → Green
  @feature1 @feature2

## Phase 3: Extension-gated checks (Green)

- [ ] `src/doctor/checks/bun.ts` — FR-7, gated by installedExtensions.dependencies.binaries.includes('bun')
  _Requirements: [FR-7](FR.md#fr-7-bun-binary-check-extension-gated-feature11)_
  _Leverage: `src/installer/memory.ts:checkBunInstalled`_
  @feature11
- [ ] `src/doctor/checks/python.ts` — FR-8, gated, per-extension pythonPackages iteration
  _Requirements: [FR-8](FR.md#fr-8-python--perextension-packages-check-extension-gated-feature11)_
  _Leverage: `src/installer/memory.ts:pipInstall` для hint text_
  @feature11
- [ ] `src/doctor/checks/docker.ts` — FR-14, gated by devcontainer extension
  _Requirements: [FR-14](FR.md#fr-14-docker--devcontainer-cli-check-extension-gated-feature11)_
  @feature11
- [ ] Verify: doctor-gating.test.ts scenarios 11 (gating) + 03 (missing key) + 12 (settings.local.json fallback) → Green
  @feature11 @feature3

## Phase 4: MCP checks + plugin-loader (Green)

- [ ] `src/doctor/checks/mcp-parse.ts` — FR-9, grep rules/skills + diff configs
  _Requirements: [FR-9](FR.md#fr-9-mcp-servers-parse-check-feature4)_
  @feature4
- [ ] `src/doctor/checks/mcp-probe.ts` — FR-10, Full probe (stdio spawn / http fetch + initialize + tools/list, AbortController 3s, SIGKILL)
  _Requirements: [FR-10](FR.md#fr-10-mcp-full-probe-check-feature4), [NFR-R-5](NFR.md#reliability)_
  _External: MCP protocol [VERIFIED: Anthropic MCP spec]_
  @feature4
- [ ] `src/doctor/checks/plugin-loader.ts` — FR-13, 4-state detection (OK-physical / OK-dynamic / BROKEN-missing / STALE-orphan)
  _Requirements: [FR-13](FR.md#fr-13-commandsskills-pluginloader-check-feature10)_
  _Note: DESIGN.md External Service Verification помечает `~/.claude/plugins/` формат как `[UNVERIFIED]` — ПЕРЕД implementation проверить на живом user install_
  @feature10
- [ ] Verify: doctor-core scenarios 06 (timeout+SIGKILL) + 09 (plugin-loader) → Green
  @feature4 @feature10

## Phase 5: Reporter + reinstall + CLI wiring (Green)

- [ ] `src/doctor/reporter.ts` — chalk formatter с traffic-light группами (🟢🟡🔴)
  _Requirements: [FR-20](FR.md#fr-20-trafficlight-grouped-output-feature9), [NFR-U-2](NFR.md#usability), [NFR-U-3](NFR.md#usability)_
  _Leverage: `src/installer/status.ts` chalk pattern reference_
  @feature9
- [ ] `src/doctor/reporter.ts` (second PR) — JSON formatter с redaction для env values
  _Requirements: [FR-24](FR.md#fr-24-json-output-mode-feature8), [FR-25](FR.md#fr-25-env-values-redaction-in-json-feature8), [NFR-S-1](NFR.md#security), [NFR-S-2](NFR.md#security)_
  @feature8
- [ ] `src/doctor/reporter.ts` (third PR) — hook JSON payload formatter для SessionStart
  _Requirements: [FR-17](FR.md#fr-17-sessionstart-hook-feature4)_
  _Reuse: extensions/claude-mem-health/tools/claude-mem-health/health-check.ts writeOutput pattern_
  @feature4
- [ ] `src/doctor/reinstall.ts` — AskUserQuestion prompt + spawn('npx', ['dev-pomogator'], {stdio:'inherit', shell:false})
  _Requirements: [FR-18](FR.md#fr-18-reinstall-integration-feature2), [NFR-S-3](NFR.md#security)_
  @feature2
- [ ] Edit `src/index.ts` — парсинг --doctor/--json/--quiet/--extension flags → routing к runDoctor
  _Requirements: [FR-16](FR.md#fr-16-cli-flag-devpomogator-doctor-feature8), [FR-23](FR.md#fr-23-exit-codes-feature8)_
  _Existing flags pattern: --status, --update (src/index.ts:50)_
  @feature8
- [ ] Verify: doctor-reinstall (02, 07, 09) + doctor-output (08, 10) + doctor-entry scenarios → Green
  @feature2 @feature8 @feature9

## Phase 6: Extension pomogator-doctor + schema propagation (Green)

- [ ] Создать `extensions/pomogator-doctor/extension.json` — manifest с SessionStart hook registration, `dependencies: {}` (self-sufficient)
  _Requirements: [FR-17](FR.md#fr-17-sessionstart-hook-feature4), [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11)_
  _Rule: extension-manifest-integrity (toolFiles exhaustive list)_
- [ ] Создать `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` — thin wrapper вызывает `runDoctor({quiet:true})`, emits hook JSON to stdout, fail-soft per NFR-R-2
  _Requirements: [FR-17](FR.md#fr-17-sessionstart-hook-feature4), [NFR-R-2](NFR.md#reliability)_
  _Reuse: extensions/claude-mem-health/tools/claude-mem-health/health-check.ts pattern_
  _Rule: ts-import-extensions (`.ts` specifiers для imports)_
- [ ] Создать `extensions/pomogator-doctor/claude/commands/pomogator-doctor.md` — slash command markdown с frontmatter `allowed-tools: [Bash, AskUserQuestion]` + инструкции Claude-у spawn `dev-pomogator --doctor`
  _Requirements: [FR-15](FR.md#fr-15-slash-command-pomogatordoctor-feature1)_
  _Reuse: существующие slash commands frontmatter pattern_
- [ ] Edit extension.json для 6 extensions — добавить `dependencies` поле (claude-mem-health, bun-oom-guard, devcontainer, forbid-root-artifacts, mcp-setup, tui-test-runner)
  _Requirements: [FR-22](FR.md#fr-22-extensionjson-dependencies-schema-feature11)_
  _Source: SCHEMA.md "Extension → dependencies mapping"_
- [ ] Verify: doctor-entry scenarios 04 (silent) + 05 (banner) + 15 (fail-soft) → Green
  @feature4

## Phase 8: Post-Launch Hardening (Red→Green) — Edge Cases from Real-World Usage

> Добавлено 2026-04-20 после webapp incident (22 broken хука). Fixes D1–D4 дефектов и покрывает B1–B5 blind spots. Каждая задача ссылается на новый FR-26..FR-34 и BDD сценарий из POMOGATORDOCTOR001_16..31.

### BDD Red foundation (Phase 8.0)

- [ ] Дополнить `tests/fixtures/pomogator-doctor/temp-home-builder.ts` — новая preset F-14 `"webapp-like"`: 22 hooks across 5 events, empty `.dev-pomogator/tools/`, config.installedExtensions tracks webapp projectPath
  _Source: FIXTURES.md F-14 (new)_
  @feature12
- [ ] Расширить `tests/fixtures/pomogator-doctor/temp-home-builder.ts` — опции `missingPluginManifest`, `configWithoutVersion`, `staleManagedEntries`, `hashMismatch`, `fileOver1MB` для новых сценариев
  @feature12 @feature2 @feature10
- [ ] Дополнить `tests/fixtures/pomogator-doctor/fake-mcp-server.ts` — preset `"nonexistent-command"` для spawn ENOENT теста
  _Source: FR-33_
  @feature4
- [ ] Наполнить pending scenarios 16..31 в pomogator-doctor.feature — it.skip с NotImplementedError
- [ ] Verify: 16 новых scenarios в RED state

### Fix existing check: hooks-registry (Phase 8.1) — FR-31, AC-31

- [ ] Edit `src/doctor/checks/hooks-registry.ts` — заменить `ctx.config?.managed?.[ctx.projectRoot]?.hooks` на aggregation `installedExtensions[*].managed[projectRoot]?.hooks` (union per event)
  _Requirements: [FR-31](FR.md#fr-31-hooks-registry-path-correction-feature2)_
  _Evidence: live run показал false-positive critical на всех installations — `RESEARCH.md` секция `Post-Launch Edge Cases`_
  @feature2
- [ ] Добавить duplicate detection — если одна и та же command string появляется ≥2 раз в union → warning
  _Requirements: [AC-31](ACCEPTANCE_CRITERIA.md#ac-31-fr-31)_
  @feature2
- [ ] Test migration: existing scenarios 02, 17 должны продолжать работать. Scenarios 25, 26 — Green
  @feature2

### New check: hook-command-integrity (Phase 8.2) — FR-26, AC-26

- [ ] Создать `src/doctor/checks/hook-command-integrity.ts` — id=C20, group=self-sufficient
  _Requirements: [FR-26](FR.md#fr-26-hook-command-integrity-check-feature12)_
  @feature12
- [ ] Parser для 3 hook форматов (string/object/array) — reference к `.claude/rules/gotchas/installer-hook-formats.md`
  _Requirements: [AC-26](ACCEPTANCE_CRITERIA.md#ac-26-fr-26)_
  @feature12
- [ ] Regex extractors для: (a) tsx-runner pattern `node -e "..." -- "PATH"`, (b) shell pattern `bash PATH.sh`, (c) direct node `node PATH.js`
  @feature12
- [ ] Group results by event: `id=C20:{event}` с message перечисляющим до 5 missing paths
  @feature12
- [ ] Append to `src/doctor/checks/index.ts` → phase2Checks array
- [ ] Verify: scenarios 16, 17, 18 — Green
  @feature12

### New check: managed-files-integrity (Phase 8.3) — FR-27, AC-27

- [ ] Создать `src/doctor/checks/managed-files-integrity.ts` — id=C21, group=self-sufficient
  _Requirements: [FR-27](FR.md#fr-27-managed-files-hash-integrity-check-feature12)_
  @feature12
- [ ] Iterate `installedExtensions[*].managed[projectRoot].tools[]`, skip если projectRoot ∉ managed
  @feature12
- [ ] Missing file → severity=critical; hash mismatch → severity=warning (reinstallable=no)
  @feature12
- [ ] Size guard: skip hash check если file > 1MB — emit ok с note `"skipped hash (file > 1MB)"`
  _Requirements: NFR-P-1 preservation_
  @feature12
- [ ] Use `crypto.createHash('sha256')` streaming для files < 1MB; `fs.readFileSync` acceptable given size cap
  @feature12
- [ ] Verify: scenarios 19, 20, 21 — Green
  @feature12

### Fix existing check: plugin-loader (Phase 8.4) — FR-28, AC-28

- [ ] Edit `src/doctor/checks/plugin-loader.ts` — если `manifest === null` AND current projectRoot ∈ `installedExtensions[*].projectPaths` → severity=critical (не silent ok)
  _Requirements: [FR-28](FR.md#fr-28-plugin-manifest-presence-for-installed-projects-feature10)_
  @feature10
- [ ] Hint: "plugin manifest missing — Claude Code cannot load commands/skills; run reinstall"
  _Requirements: [AC-28](ACCEPTANCE_CRITERIA.md#ac-28-fr-28)_
- [ ] Verify: scenario 22 — Green
  @feature10

### Installer change: pomogator-doctor self-install (Phase 8.5) — FR-29, AC-29

- [ ] Edit `src/installer/extensions.ts` — добавить `pomogator-doctor` в list of extensions устанавливаемых по умолчанию при любом `npx dev-pomogator` (нет opt-in flag)
  _Requirements: [FR-29](FR.md#fr-29-pomogator-doctor-self-install-in-all-projectpaths-feature12)_
  @feature12
- [ ] Обновить `extensions/pomogator-doctor/extension.json` → category="infrastructure", `alwaysInstall: true`
- [ ] Добавить check в doctor: C29 self-install verification — (a) extension ∈ installedExtensions, (b) projectRoot ∈ projectPaths, (c) SessionStart hook содержит substring "pomogator-doctor/doctor-hook"
  @feature12
- [ ] Verify: scenario 23 — Green
  @feature12

### CLI flag: --all-projects (Phase 8.6) — FR-30, AC-30

- [ ] Edit `src/doctor/runner.ts` — добавить экспорт `executeChecksAllProjects(options, checks)` который использует `p-limit(4)` по `installedExtensions[*].projectPaths` deduplicated
  _Requirements: [FR-30](FR.md#fr-30-allprojects-flag-feature8)_
  @feature8
- [ ] Edit `src/doctor/reporter.ts` — новый mode `"all-projects"`: per-project section headers + aggregate summary + top-level exit code = max
  @feature8
- [ ] Edit `src/index.ts` — parse `--all-projects` flag, route to `executeChecksAllProjects`
  @feature8
- [ ] JSON mode: output `{"projects": {<path>: CheckResult[]}, "aggregate": {...}}`
  _Requirements: [FR-24](FR.md#fr-24-json-output-mode-feature8) + [AC-30](ACCEPTANCE_CRITERIA.md#ac-30-fr-30)_
  @feature8
- [ ] Verify: scenario 24 — Green
  @feature8

### Installer change: write top-level config.version (Phase 8.7) — FR-32, AC-32

- [ ] Edit `src/config/index.ts` — writer функции (`saveConfig`, `updateConfig`) SHALL include top-level `version: packageVersion` key
  _Requirements: [FR-32](FR.md#fr-32-configjson-toplevel-version-field-feature2)_
  @feature2
- [ ] Edit `src/installer/index.ts` — передавать `version` явно при initial config write
  @feature2
- [ ] Edit `src/doctor/checks/version-match.ts` — update hint если `ctx.config?.version` отсутствует: severity=warning, hint="lacks top-level version"
  _Requirements: [AC-32](ACCEPTANCE_CRITERIA.md#ac-32-fr-32)_
  @feature2
- [ ] Migration: первый install после upgrade автоматически добавит field (backfill logic через `if (!config.version) config.version = pkg.version`)
- [ ] Verify: scenario 27 — Green
  @feature2

### MCP probe retune (Phase 8.8) — FR-33, AC-33

- [ ] Edit `src/doctor/constants.ts` — `DOCTOR_TIMEOUTS.PROBE_MS = 10_000` (было 3_000)
  _Requirements: [FR-33](FR.md#fr-33-mcp-probe-timeout--error-categorization-feature4)_
  @feature4
- [ ] Edit `src/doctor/checks/mcp-probe.ts` — error categorization:
  - timeout → severity=warning (was critical)
  - spawn `ENOENT` → severity=critical + PATH-specific hint
  - spawn `EACCES` → severity=critical + permission hint
  - exit-before-handshake → severity=critical + exit code in hint
  _Requirements: [AC-33](ACCEPTANCE_CRITERIA.md#ac-33-fr-33)_
  @feature4
- [ ] Edit `fake-mcp-server.ts` fixture → добавить preset `"nonexistent"` для testing ENOENT path
  @feature4
- [ ] Verify: scenarios 28, 29 — Green
  @feature4

### New check: stale-managed-detect (Phase 8.9) — FR-34, AC-34

- [ ] Создать `src/doctor/checks/stale-managed.ts` — id=C22, group=self-sufficient
  _Requirements: [FR-34](FR.md#fr-34-stale-managed-entries-detection-feature12)_
  @feature12
- [ ] Build валидный набор tool-directory names:
  - installed extension names из `config.installedExtensions[*].name`
  - sub-tool directories из `extensions/{ext}/extension.json → tools` (discovered via глоббинг source repo) — fallback: hardcoded map для известных cases (specs-workflow → [specs-generator, specs-validator, steps-validator, mcp-setup], test-statusline → [test-statusline, bg-task-guard])
  @feature12
- [ ] Extract actual tool-dirs из `managed.tools[].path` (first segment after `.dev-pomogator/tools/`)
- [ ] Diff: orphans = actual - valid; if non-empty → warning
  @feature12
- [ ] Verify: scenarios 30, 31 — Green
  @feature12

### SessionStart banner enhancement (Phase 8.10)

- [ ] Edit `extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts` — при problems banner format:
  - Если ≥3 C20/C21 critical — message `"⚠ dev-pomogator: N hook/tool files missing in project. Run /pomogator-doctor"`
  - Иначе — generic `"⚠ pomogator-doctor: N issue(s) detected, /pomogator-doctor for details"`
  _Requirements: improved UX for webapp-style scenarios_
  @feature4
- [ ] Respect 100 char limit (NFR-U-4)
  @feature4

### Full re-verification (Phase 8.11)

- [ ] Integration E2E `tests/e2e/pomogator-doctor.test.ts` — add case "webapp-like broken install detected without false-positives"
  _Rule: integration-tests-first_
- [ ] Regression run: `/run-tests --grep pomogator-doctor` — все 31 scenario GREEN
- [ ] Manual verification: `cd webapp && dev-pomogator --doctor` → expected 21+ critical findings из C20/C21, reinstall offer, no false-positive C6
- [ ] Manual verification: `cd dev-pomogator && dev-pomogator --doctor --all-projects` → report про webapp без переключения cwd
- [ ] Update `AUDIT_REPORT.md` с re-audit findings после P0 fixes

---

## Phase 7: Refactor + E2E + docs

- [ ] Full E2E integration test `tests/e2e/pomogator-doctor.test.ts` — install → doctor → verify report
  _Leverage: `tests/e2e/helpers.ts:runInstaller`_
  _Rule: integration-tests-first_
- [ ] Refactor: remove duplication, inline constants, extract shared helpers
- [ ] Edit `README.md` — добавить раздел "Doctor Command" с onboarding examples
- [ ] Edit `CLAUDE.md` — добавить `/pomogator-doctor` в таблицу Commands
- [ ] Optional: edit `src/updater/index.ts` — post-update вызов `runDoctor({quiet:true})` для warning если что-то сломалось после update
- [ ] Verify: все 15 BDD scenarios GREEN через `/run-tests --grep pomogator-doctor`
- [ ] Verify: exit codes соответствуют FR-23 (manual CI pipeline test)
- [ ] Verify: chalk output respects NO_COLOR (NFR-U-3 — manual env test)

---

## Definition of Done

- [ ] Все 43 операции из FILE_CHANGES.md выполнены
- [ ] 15 BDD scenarios GREEN
- [ ] Integration test `tests/e2e/pomogator-doctor.test.ts` GREEN
- [ ] `npm run lint` 0 errors
- [ ] `npm run build` успешно
- [ ] 6 extension.json обновлены с dependencies field
- [ ] README.md содержит "Doctor Command" section с 3 примерами (slash, CLI, CI JSON)
- [ ] `/pomogator-doctor` работает в Claude Code после `npx dev-pomogator` установки
- [ ] `dev-pomogator --doctor --json` exit 0/1/2 корректно по severity

## Verification Plan

- Automated Tests:
  - `/run-tests --grep pomogator-doctor` — все 15 BDD scenarios + 1 E2E
  - `npm run lint`
  - `npm run build`
- Manual Verification:
  - Запустить `/pomogator-doctor` в свежем clone проекта — убедиться traffic-light output
  - Удалить `~/.dev-pomogator/tools/auto-commit/` и запустить doctor — убедиться в предложении reinstall
  - Unset AUTO_COMMIT_API_KEY и запустить — убедиться что reinstall НЕ предлагается (hint only)
  - NO_COLOR=1 environment — убедиться что ANSI codes отсутствуют
