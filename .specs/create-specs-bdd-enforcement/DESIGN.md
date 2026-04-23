# Design

## Реализуемые требования

- [FR-1: Phase 2 Step 6 extends с TEST_FORMAT](FR.md#fr-1-phase-2-step-6-extends-с-test_format-classification-feature1)
- [FR-2: Phase 1.5 детект framework](FR.md#fr-2-phase-15-project-context-детектит-bdd-framework-в-target-test-projects-feature2)
- [FR-3: analyze-features multi-folder scan](FR.md#fr-3-analyze-featurests-multi-folder-recursive-scan-feature3)
- [FR-4: scaffold-spec -TestFormat flag](FR.md#fr-4-scaffold-spects-поддерживает--testformat-flag-feature4)
- [FR-5: State machine gate](FR.md#fr-5-state-machine-гейтит-requirementsfinalization-на-bdd-classification-feature5)
- [FR-6: Phase 0 bootstrap block](FR.md#fr-6-tasksmd-phase-0-bootstrap-block-install--hooks--fixtures-config-feature6)
- [FR-7: Validator severity upgrade](FR.md#fr-7-validator-bdd_infra-rule-severity-upgrade-warning--error-feature7)
- [FR-8: Shared detector module](FR.md#fr-8-shared-bdd-framework-detectorts-module-переиспользует-steps-validatordetectorts-feature8)
- [FR-9: Create new spec](FR.md#fr-9-создание-спеки-specscreate-specs-bdd-enforcement-с-cross-reference-на-spec-phase-gate-feature9)

## Компоненты

- `bdd-framework-detector.ts` — новый shared модуль детекции BDD framework в target test-projects (thin wrapper на `steps-validator/detector.ts`)
- `specs-generator-core.mjs` — edit: расширить createDefaultProgressState, добавить gate Requirements→Finalization, upgrade BDD_INFRA severity, multi-folder analyze-features, pre-check ConfirmStop
- `scaffold-spec.ts` — edit: добавить `-TestFormat [bdd|unit|auto]` flag, branch создания `.feature` vs `SCENARIOS.md`
- `templates/DESIGN.md.template` — edit: новые поля TEST_FORMAT, Framework, Install Command, Evidence
- `templates/TASKS.md.template` — edit: conditional Phase 0 bootstrap block (3 обязательных task)
- `specs-management.md` rule — edit: Phase 1.5 detect step + Phase 2 Step 6.1a/b/c split
- `bdd-enforcement.md` rule — create: BDD default principle + framework decision tree + install/bootstrap recipes

## Leverage / Code reuse

- `extensions/specs-workflow/tools/steps-validator/detector.ts` — уже умеет детектить language (TS/Python/C#) и BDD framework (Cucumber.js/Playwright BDD, Behave/pytest-bdd, Reqnroll/SpecFlow). REUSE через import в `bdd-framework-detector.ts`, не дублировать logic
- `specs-generator-core.mjs:createDefaultProgressState` (lines ~381-393) — extend, не переписывать; новые поля с `false`/`null` defaults
- `specs-generator-core.mjs:commandValidateSpec BDD_INFRA` (lines ~925-960) — upgrade severity, оставить структуру проверок
- `specs-generator-core.mjs:analyzeFeatures` (lines ~2620-2623) — replace hardcoded paths с glob, сохранить остальную логику (classification, step extraction)
- `.specs/spec-phase-gate/` — reference для phase-gate hook architecture (cross-reference в README.md)

## Где лежит реализация

- App-код:
  - `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (state machine, validator, scaffold, analyze-features)
  - `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` (новый)
  - `extensions/specs-workflow/tools/specs-generator/scaffold-spec.ts` (wrapper)
  - `extensions/specs-workflow/tools/steps-validator/detector.ts` (reuse target, без изменений)
- Templates: `extensions/specs-workflow/tools/specs-generator/templates/{DESIGN,TASKS}.md.template`
- Rules: `.claude/rules/specs-workflow/{specs-management,bdd-enforcement,specs-validation}.md` + mirror в `extensions/specs-workflow/rules/claude/`
- Wiring: `extensions/specs-workflow/extension.json` (version 1.14.0 → 1.15.0, add rules/toolFiles)

## Директории и файлы

- `extensions/specs-workflow/tools/specs-generator/`
- `extensions/specs-workflow/tools/specs-generator/templates/`
- `extensions/specs-workflow/rules/claude/`
- `.claude/rules/specs-workflow/`
- `.specs/create-specs-bdd-enforcement/` (13 файлов + .feature)
- `tests/e2e/create-specs-bdd-enforcement.test.ts`
- `tests/fixtures/bdd-enforcement/` (парные missing/installed mini-projects)

## Алгоритм

### Phase 1.5 Project Context (новый шаг детекта)

1. Агент читает `.specs/{feature}/FILE_CHANGES.md` → извлекает paths тестовых файлов (`tests/**`, `**/Tests/**`)
2. Для каждой unique test-project root (дир до `tests/` или `Tests/`) вызывает `detectTargetFramework(projectPath, testProjectHints)`
3. Результат записывается в `RESEARCH.md` секцию `### Existing Patterns & Extensions` (framework / evidence / installCommand / hookFileHints)
4. Агент использует результат для заполнения Phase 2 Step 6 DESIGN.md

### Phase 2 Step 6 (новая классификация — two axes)

**Step 6.1a: TEST_DATA classification** (существующая, 4 data-questions) → TEST_DATA_ACTIVE | TEST_DATA_NONE

**Step 6.1b: TEST_FORMAT classification** (новая) → BDD (default) | UNIT (emergency escape, требует Risks justification)

**Step 6.1c: Framework choice** (новая) — если TEST_FORMAT=BDD:
- Использовать DetectionResult.framework если framework ≠ null (installed — Evidence positive)
- Иначе: использовать DetectionResult.suggestedFrameworks[0] + добавить install command + bootstrap tasks в Phase 0

### State machine gate (ConfirmStop Requirements)

1. `commandConfirmStop('Requirements')` читает DESIGN.md
2. Проверяет regex:
   - `\*\*TEST_DATA:\*\*\s*(TEST_DATA_ACTIVE|TEST_DATA_NONE)`
   - `\*\*TEST_FORMAT:\*\*\s*(BDD|UNIT)`
3. Если TEST_FORMAT=BDD — дополнительно:
   - `\*\*Framework:\*\*\s*(Reqnroll|SpecFlow|Cucumber\.js|Playwright BDD|Behave|pytest-bdd)`
   - `\*\*Install Command:\*\*\s*\S+`
4. Если regexes не match → throw Error, exit code 1, blocker с actionable hint

### scaffold-spec -TestFormat (новый branch)

1. `scaffold-spec.ts -TestFormat auto` (default)
2. `commandScaffoldSpec()` вызывает `detectTargetFramework(cwd, [])` → получает DetectionResult
3. Branch:
   - `result.framework ≠ null` → создаёт `.feature` + DESIGN.md с заполненным Framework
   - `result.framework === null` → создаёт `.feature` + DESIGN.md с placeholder Framework (первая из suggestedFrameworks) + Install Command в Evidence
   - `-TestFormat unit` → создаёт `SCENARIOS.md` (doc-only) вместо `.feature`
   - `-TestFormat bdd` → без вызова detector, создаёт `.feature`

### analyze-features multi-folder scan

1. Вместо hardcoded `[repoRoot/tests/features, repoRoot/.specs]`
2. Glob: `**/*.feature` с ignore `['**/node_modules/**', '**/dist/**', '**/build/**', '**/bin/**', '**/obj/**', '**/.git/**']`
3. Respect `.gitignore` (read от repoRoot) если присутствует
4. Cap: 10000 files max; если больше — warning + truncate
5. Классификация production/spec/fixture сохраняется (production = НЕ под `.specs/` И НЕ содержит `/fixtures/`)

## API

### detectTargetFramework (bdd-framework-detector.ts)

- Signature: `detectTargetFramework(projectPath: string, testProjectHints: string[]): DetectionResult`
- Input:
  - `projectPath`: absolute path к корню проекта / solution / repo
  - `testProjectHints`: массив путей-подсказок (из FILE_CHANGES или argv) где искать test-проекты; если пусто — детектор ищет сам (glob `**/Tests`/`**/tests`/`**/__tests__`)
- Output (`DetectionResult`):
  ```typescript
  interface DetectionResult {
    language: 'csharp' | 'typescript' | 'python' | null;
    framework: 'Reqnroll' | 'SpecFlow' | 'Cucumber.js' | 'Playwright BDD' | 'Behave' | 'pytest-bdd' | null;
    installCommand: string | null;
    hookFileHints: string[];
    configFileHint: string | null;
    fixturesFolderHint: string | null;
    evidence: string[];
    suggestedFrameworks: string[];
  }
  ```
- Errors: never throws — fail-open с `framework: null` + evidence сообщение

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Секция НЕ может быть удалена. Агент обязан классифицировать фичу по двум осям: TEST_DATA + TEST_FORMAT.

**Classification:** TEST_DATA_NONE
**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** `npm install --save-dev @cucumber/cucumber`
**Evidence:** `grep @cucumber/cucumber package.json → not found (remediation target; see Phase 0 bootstrap block in TASKS.md)`. Target test-projects: `tests/e2e/` (vitest currently), `tests/fixtures/bdd-enforcement/` (parity fixtures).
**Verdict:** Новые интеграционные тесты SBDE001_01..06 в `tests/e2e/create-specs-bdd-enforcement.test.ts` запускаются через vitest + spawnSync (integration через реальные CLI команды), и параллельно описаны как BDD scenarios в `create-specs-bdd-enforcement.feature`. Полная миграция всех existing vitest тестов на Cucumber.js выходит за рамки этой спеки (см. Out of Scope в FR.md).

Данная спека — это МЕТА-работа: она сама является демонстрацией нового формата. TEST_DATA=NONE потому что тесты не создают/модифицируют данные в long-lived стейте — только scaffold fixture-проектов в temp dir для integration тестов.

### Существующие hooks

Не найдены в проекте (BDD-фреймворк ещё не установлен; существующие vitest тесты используют `beforeEach`/`afterEach` встроенные конструкции).

### Новые hooks

N/A для этой спеки (TEST_DATA_NONE — stateless integration тесты).

### Cleanup Strategy

N/A — integration тесты используют `os.tmpdir()` для fixture-проектов, автоматически подчищаются.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `csharp-reqnroll-installed` | `tests/fixtures/bdd-enforcement/csharp-reqnroll-installed/` | C# xUnit с установленным Reqnroll (positive detection case) | shared, read-only |
| `csharp-reqnroll-missing` | `tests/fixtures/bdd-enforcement/csharp-reqnroll-missing/` | C# xUnit без Reqnroll (remediation target) | shared, read-only |
| `ts-cucumber-installed` | `tests/fixtures/bdd-enforcement/ts-cucumber-installed/` | TS vitest + @cucumber/cucumber (positive) | shared, read-only |
| `ts-cucumber-missing` | `tests/fixtures/bdd-enforcement/ts-cucumber-missing/` | TS vitest без BDD (remediation target) | shared, read-only |
| `python-pytest-bdd-installed` | `tests/fixtures/bdd-enforcement/python-pytest-bdd-installed/` | Python pytest + pytest-bdd (positive) | shared, read-only |
| `python-pytest-bdd-missing` | `tests/fixtures/bdd-enforcement/python-pytest-bdd-missing/` | Python pytest без BDD (remediation target) | shared, read-only |
| `multi-folder-features` | `tests/fixtures/bdd-enforcement/multi-folder-features/` | `.feature` в `Cloud/server/Tests/Features/` + `src/Tests/Features/` | shared, read-only |

### Shared Context / State Management

N/A для stateless integration тестов.
