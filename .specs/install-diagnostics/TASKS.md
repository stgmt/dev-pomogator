# Tasks

## TDD Workflow

Задачи организованы по TDD: Red → Green → Refactor.

CORE003_18 (Linux) и CORE003_19 (Windows) добавляются как failing scenarios на Phase 0, затем переходят в Green по-разному:
- CORE003_18 → Green в Phase 1 как только helper и тесты добавлены (Linux env работает)
- CORE003_19 → Green в Phase 2 BLOCKED, требует upstream npm fix (не часть этого плана)

## Phase 0: BDD Foundation (Red)

> Создать helper, .feature scenarios, и integration tests. Все сценарии должны быть присутствующими но в начале FAIL/SKIPPED.
> Classification: TEST_DATA_ACTIVE → нужны beforeAll/afterAll hooks для каждого describe блока (см. DESIGN.md "Новые hooks").

- [x] Добавить helper `runInstallerViaNpx()` + interface `NpxInstallResult` в `tests/e2e/helpers.ts` после `runInstaller()` (~строка 55)
  _Source: DESIGN.md "Компоненты" > "runInstallerViaNpx()"_
  _Requirements: [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3)_
- [ ] Добавить BDD scenario `CORE003_18` в `tests/features/core/CORE003_claude-installer.feature` после CORE003_CMEM с тегом `# @feature18` -- @feature18
  _Requirements: [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)_
- [ ] Добавить BDD scenario `CORE003_19` в `tests/features/core/CORE003_claude-installer.feature` с тегом `# @feature19` и комментом TDD red -- @feature19
  _Requirements: [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)_
- [ ] Добавить `describe.skipIf(process.platform !== 'linux')('CORE003_18: ...', ...)` блок в `tests/e2e/claude-installer.test.ts` перед `afterAll` основного describe -- @feature18
  _Hooks: beforeAll создаёт result через runInstallerViaNpx, afterAll удаляет tempDir/tempCache_
  _Requirements: [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)_
- [ ] Добавить `describe.skipIf(process.platform !== 'win32')('CORE003_19: ...', ...)` блок с identical assertions + TDD red comment -- @feature19
  _Hooks: те же что в CORE003_18_
  _Requirements: [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)_
- [ ] Verify все 6 it() блоков в CORE003_18 присутствуют (exit 0, banner, completion, log touched, cache populated, no warnings)
- [ ] Verify все 6 it() блоков в CORE003_19 присутствуют (identical to CORE003_18)

## Phase 1: Linux Green (run in Docker)

> Запустить Linux test через Docker и убедиться что CORE003_18 PASS на чистой машине.

- [ ] Запустить `npm test -- claude-installer` в фоне через `/run-tests` (background, не блокировать сессию) -- @feature18
  _Requirements: [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)_
- [ ] Verify: CORE003_18 PASS, CORE003_19 SKIPPED (skipIf не linux), все CORE003_01..CORE003_CMEM PASS как раньше
- [ ] Verify: existing tests НЕ сломаны добавлением helper-а в helpers.ts (`runInstaller` остался без изменений)

## Phase 2: Windows Green (BLOCKED)

> CORE003_19 переходит в Green только после upstream npm fix-а или local workaround. Это НЕ часть текущего плана.

- [ ] [BLOCKED] Wait for upstream npm fix on EPERM cleanup для @inquirer packages (https://github.com/npm/cli/issues — отслеживать)
- [ ] [BLOCKED] OR design local workaround: bundled installer без deep @inquirer deps, или retry-loop в installer entry point
- [ ] [BLOCKED] After fix: re-run CORE003_19 на Windows host, verify PASS без изменения assertions
- [ ] [BLOCKED] Remove "TDD red" comments из CORE003_19 в feature file и test file

## Phase 3: Validation & Documentation

- [ ] Запустить `validate-spec.ts -Path ".specs/install-diagnostics"` — должен вернуть 0 ERRORS
- [ ] Запустить `audit-spec.ts -Path ".specs/install-diagnostics"` — должен показать @feature1..@feature5 cross-refs
- [ ] Verify: `tests/features/core/CORE003_claude-installer.feature` содержит CORE003_18 и CORE003_19 с тегами @feature18/@feature19
- [ ] Verify: `tests/e2e/helpers.ts` содержит `runInstallerViaNpx()` и `NpxInstallResult` interface
- [ ] Update CHANGELOG.md с записью про добавление regression-тестов

---

## Phase 4: Second Failure Mode — Prompt-race (2026-04-20, @feature6)

> Покрывает FR-6..FR-10: distinguishing Mode A vs Mode B, docs hardening, CI lint, regression scenario CORE003_20, optional defensive wrapper.

### BDD Red foundation (Phase 4.0)

- [ ] Наполнить pending scenarios INSTALL_DIAG_05..09 (it.skip с NotImplementedError) в `tests/features/plugins/install-diagnostics/`
  _Source: install-diagnostics.feature_
  @feature6
- [ ] Создать BDD scenario `CORE003_20` в `tests/features/core/CORE003_claude-installer.feature` и pending integration test в `tests/e2e/claude-installer.test.ts`
  _Requirements: [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6)_
  @feature6
- [ ] Verify: новые scenarios в RED state

### Skill: Mode A vs Mode B detection (Phase 4.1) — FR-6, AC-7

- [ ] Edit `.claude/skills/install-diagnostics/SKILL.md` — добавить Mode B branching logic в Phase 2 evidence evaluation:
  - Check if `_npx/<hash>/` is empty / missing node_modules
  - Check install.log mtime freshness
  - Classify output header: `Mode: A`, `Mode: B`, `Mode: A+B (sequential)`
  _Requirements: [FR-6](FR.md#fr-6-promptrace-failure-mode-detection-feature6)_
  @feature6
- [ ] Edit skill to auto-reproduce с `--yes` in fresh temp cache as Mode B confirmation step (run second `runInstallerViaNpx('--claude --all', { fresh: true, forceYes: true })`)
  @feature6
- [ ] Edit skill to cite `https://github.com/npm/cli/issues/7147` when Mode B detected
  @feature6
- [ ] Verify: INSTALL_DIAG_05, INSTALL_DIAG_06 scenarios GREEN
  @feature6

### Helper extension: forceYes option (Phase 4.2)

- [ ] Edit `tests/e2e/helpers.ts` — `runInstallerViaNpx(args, options)` добавить option `forceYes?: boolean` (default true для backward compat; set to false для Mode B reproduce test)
  _Rationale: FR-9 scenario запускает БЕЗ --yes; existing helpers всегда с --yes_
  _Requirements: [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3) extension, [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6)_
  @feature6
- [ ] Verify: existing CORE003_18/19 продолжают работать с default `forceYes: true`

### Docs hardening (Phase 4.3) — FR-7, AC-8

- [ ] Запустить grep по tracked .md files (`grep -rEn '\bnpx\s+(?!--?yes\s+|-y\s+).*dev-pomogator' --include='*.md' --include='*.rst' --include='*.txt' .`) и собрать список всех violations
  @feature6
- [ ] Edit `README.md` (root) — заменить `npx github:stgmt/dev-pomogator` на `npx --yes github:stgmt/dev-pomogator` во всех install examples
  _Requirements: [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6)_
  @feature6
- [ ] Edit `CLAUDE.md` (root) — то же самое
  @feature6
- [ ] Edit `extensions/*/README.md` — grep + replace для каждого extension manifest README
  @feature6
- [ ] Edit `docs/**/*.md` (если есть)
  @feature6
- [ ] Edit `src/installer/messages.ts` (если содержит install hints) — обновить suggestion strings
  @feature6
- [ ] Add marker `<!-- lint-install: allow -->` above historical `.specs/install-diagnostics/RESEARCH.md` lines which intentionally quote user's unsafe command

### CI lint (Phase 4.4) — FR-8, AC-9

- [ ] Создать `tools/lint-install-commands.ts`:
  - Recursively find `.md` / `.rst` / `.txt` tracked files
  - Apply regex `/npx\s+(?!--?yes\s+|-y\s+)(?:github:stgmt\/)?dev-pomogator/g`
  - Skip files listed in `.lintignore-install` ИЛИ с `<!-- lint-install: allow -->` marker on line или line above
  - Print violations: `${file}:${line} — ${matchedText}` + suggestion
  - Exit 0 clean / 1 dirty
  _Requirements: [FR-8](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6)_
  @feature6
- [ ] Create vitest test `tests/e2e/docs-install-lint.test.ts` (ИЛИ extend CORE007 as `CORE007_12`) который вызывает `spawnSync('npx', ['tsx', 'tools/lint-install-commands.ts'])` и asserts exit 0 + 0 violations
  @feature6
- [ ] Add npm script `"lint:docs": "npx tsx tools/lint-install-commands.ts"` в `package.json`
  @feature6
- [ ] Verify: INSTALL_DIAG_07, INSTALL_DIAG_08 GREEN

### Regression test CORE003_20 (Phase 4.5) — FR-9, AC-10

- [ ] Add `Scenario: CORE003_20 npx prompt-race produces empty _npx cache` к `tests/features/core/CORE003_claude-installer.feature` с комментарием `# @feature6`
  _Requirements: [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6)_
  @feature6
- [ ] Add integration `it('CORE003_20 npx prompt-race ...', ...)` в `tests/e2e/claude-installer.test.ts`:
  - `runInstallerViaNpx('--claude --all', { fresh: true, forceYes: false, emptyStdin: true, timeout: 30_000 })`
  - Assert `_npx/<hash>/node_modules/dev-pomogator/package.json` does NOT exist
  - Assert `installerLogTouched === false`
  - Assert result status doesn't matter (может быть 0 или signal)
  @feature6
- [ ] Verify: INSTALL_DIAG_09 GREEN + CORE003_20 reproduces failure mode on Windows

### Optional defensive wrapper (Phase 4.6) — FR-10 [DEFERRED]

> Implement только если >1 user report в RESEARCH.md в течение 3 месяцев после Phase 4.3.

- [ ] [DEFERRED] Create `bin/dev-pomogator-safe.cjs` — first line writes `Date.now() + '\n'` to `~/.dev-pomogator/logs/wrapper-entry.log` (append), then `require('./dev-pomogator.cjs')`
  _Requirements: [FR-10](FR.md#fr-10-defensive-bin-wrapper-optionaldeferred-feature6)_
- [ ] [DEFERRED] Edit `package.json.bin.dev-pomogator` → `bin/dev-pomogator-safe.cjs`
- [ ] [DEFERRED] Edit diagnostic skill — использовать wrapper-entry.log timestamp для disambiguation edge cases (FR-6 tie-breaker)

### Documentation & validation (Phase 4.7)

- [ ] Update `README.md` спеки — упомянуть Phase 4 post-launch hardening
- [ ] Update CHANGELOG с Phase 4 entry
- [ ] Re-run `validate-spec.ts -Path ".specs/install-diagnostics"` — 0 ERRORS
- [ ] Re-run `audit-spec.ts -Path ".specs/install-diagnostics"` — 0 findings
- [ ] Manual verification on Windows PS: `npx github:stgmt/dev-pomogator --claude` (cold cache, no --yes) → skill detects Mode B + suggests FR-7 fix
- [ ] Manual verification on Linux Docker: `npx --yes github:stgmt/dev-pomogator --claude --all` → exit 0 (Mode B scenarios skipped on Linux since prompt не срабатывает там где autohide-terminal)
