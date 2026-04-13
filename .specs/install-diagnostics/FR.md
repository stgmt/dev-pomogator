# Functional Requirements (FR)

## FR-1: Linux npx install regression coverage @feature1

Test suite ДОЛЖЕН содержать BDD-сценарий `CORE003_18` в `tests/features/core/CORE003_claude-installer.feature` и парный integration-тест в `tests/e2e/claude-installer.test.ts`, который проверяет что:

- `npx --yes github:stgmt/dev-pomogator --claude --all` на Linux exit с кодом `0`
- stdout содержит rocket banner `🚀 dev-pomogator installer (non-interactive)`
- stdout содержит completion message `✨ Installation complete`
- mtime `~/.dev-pomogator/logs/install.log` advances during run (proves installer.main() ran)
- `_npx/<hash>/node_modules/dev-pomogator/package.json` существует после install (proves bin extracted)
- stderr НЕ содержит `npm warn cleanup` сообщений (no Windows-style EPERM на Linux)

**Назначение:** Изначально задумывался как control test (passing). Но reproduction показал что Linux ТОЖЕ failing-by-design на текущем github HEAD из-за той же причины что и Windows: untracked source files (`src/utils/path-safety.ts`, `src/installer/plugin-json.ts`, `installedShared` field в `schema.ts`) ломают tsc compile в `prepare` script.

**Текущий статус:** TDD red. Должен стать PASS после commit-а missing файлов в git. См. [RESEARCH.md "Action Items"](RESEARCH.md#action-items-для-разработчика-не-часть-этой-спеки).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-linux-control-test-passes-in-docker-ci)

## FR-2: Windows npx install regression coverage @feature2

Test suite ДОЛЖЕН содержать BDD-сценарий `CORE003_19` в `tests/features/core/CORE003_claude-installer.feature` и парный integration-тест в `tests/e2e/claude-installer.test.ts`, который проверяет что:

- `npx --yes github:stgmt/dev-pomogator --claude --all` на Windows exit с кодом `0`
- stdout содержит rocket banner и completion message
- mtime install.log advances
- _npx cache populated с dev-pomogator
- stderr НЕ содержит `npm warn cleanup` (regression-тест на silent failure bug)

**Назначение:** TDD red regression-тест на known silent install failure. **Должен FAIL** на Windows host пока missing файлы не закоммичены (см. [RESEARCH.md](RESEARCH.md)). После commit-а missing source файлов станет green автоматически — assertions идентичны Linux test (FR-1).

**TDD red rationale:** failing test = живая документация bug-а для будущего fix-коммитера. Когда тест зелёный — bug точно исправлен, не нужен manual verification.

**Windows-specific симптом:** дополнительно к exit 2, на Windows reify rollback генерирует `npm warn cleanup ... EPERM ... rmdir @inquirer/external-editor/dist/esm` сообщения (на Linux их нет). Эти warnings — симптом, не корень. Корень одинаков на обеих платформах: tsc fails в prepare script.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-post-fix-feature2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-windows-regression-test-fails-on-windows-host-tdd-red--current-state), [UC-3](USE_CASES.md#uc-3-windows-regression-test-passes-after-upstream-fix-post-fix-state)

## FR-3: runInstallerViaNpx helper API @feature3

Helper-функция `runInstallerViaNpx(args, options)` ДОЛЖНА существовать в `tests/e2e/helpers.ts` и предоставлять следующий API:

- **Input**: `args: string` (default `'--claude --all'`), `options: { fresh?: boolean }`
- **Output**: `Promise<NpxInstallResult>` с полями:
  - `stdout: string` — captured stdout
  - `stderr: string` — captured stderr
  - `exitCode: number` — process exit code
  - `cleanupWarnings: string[]` — lines from stderr matching `/npm warn cleanup/i`
  - `cachePopulated: boolean` — true если `_npx/<hash>/node_modules/dev-pomogator/package.json` existed после run
  - `installerLogTouched: boolean` — true если mtime install.log advanced during run
  - `tempDir: string` — created via `mkdtempSync` (caller responsible for cleanup)
  - `tempCache: string | null` — created via `mkdtempSync` если `options.fresh === true`

**Поведение:**
- Создаёт isolated temp working dir через `fs.mkdtempSync(path.join(os.tmpdir(), 'pom-npx-'))`
- При `options.fresh === true` создаёт fresh `NPM_CONFIG_CACHE` через mkdtemp
- Замеряет mtime install.log ДО запуска
- Запускает `npx --loglevel verbose --yes github:stgmt/dev-pomogator <args>` через `spawnSync` с `input: 'y\n'`
- Парсит stderr на cleanup warnings
- Проверяет cache state и log mtime после run
- Возвращает structured result

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-feature3)
**Leverage:** см. existing `runInstaller()` в `tests/e2e/helpers.ts:35-55` как reference

## FR-4: install-diagnostics spec structure @feature4

`.specs/install-diagnostics/` ДОЛЖНА быть создана с full 13-file structure согласно `.claude/rules/specs-workflow/specs-validation.md`. Все 13 обязательных файлов + опциональный `install-diagnostics.feature` ДОЛЖНЫ быть заполнены focused-контентом про silent install bug.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-feature4)

## FR-5: Cross-references via @featureN tags @feature5

@featureN теги ДОЛЖНЫ связывать:

- FR-1 (этот FR.md) ↔ AC-1 (ACCEPTANCE_CRITERIA.md) ↔ CORE003_18 scenario (CORE003 feature file)
- FR-2 ↔ AC-2/AC-3 ↔ CORE003_19 scenario
- FR-3 ↔ AC-4
- FR-4 ↔ AC-5
- FR-5 ↔ AC-6
- Каждый `it()` блок в `tests/e2e/claude-installer.test.ts` для CORE003_18/19 ДОЛЖЕН иметь `// @feature18` / `// @feature19` comment

**Назначение:** автоматическая трассируемость требований до тестов. `audit-spec.ts -Path ".specs/install-diagnostics"` должен находить все cross-refs без ошибок.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5-feature5)
