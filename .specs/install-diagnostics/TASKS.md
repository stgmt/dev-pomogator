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
