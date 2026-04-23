# Functional Requirements (FR)

## FR-1: Phase 2 Step 6 extends с TEST_FORMAT classification @feature1

Phase 2 Step 6 «BDD Test Infrastructure Assessment» расширяется новыми полями: TEST_FORMAT (BDD | UNIT, дефолт BDD), Framework (имя выбранного BDD-фреймворка из supported list), Install Command (actual команда для установки), Evidence (grep-строки подтверждающие наличие или отсутствие framework). Классификация TEST_DATA_ACTIVE/NONE сохраняется как раньше (ортогональная ось).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-scaffold-спеки-в-проекте-где-bdd-фреймворк-ещё-не-установлен-feature6)

## FR-2: Phase 1.5 Project Context детектит BDD framework в target test-projects @feature2

Phase 1.5 Project Context Analysis в `.claude/rules/specs-workflow/specs-management.md` добавляет шаг: для каждого test-проекта упомянутого в FILE_CHANGES.md — вызвать `bdd-framework-detector.ts` и записать результат в RESEARCH.md «Existing Patterns & Extensions» таблицу (framework, evidence, installCommand, hookFileHints).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## FR-3: analyze-features.ts multi-folder recursive scan @feature3

`analyze-features.ts` (через core `analyzeFeatures()`) сканит `.feature` файлы рекурсивно по паттерну `**/*.feature` с ignore `node_modules`, `dist`, `build`, `bin`, `obj`, `.git`. Сохраняется классификация production/spec/fixture. Performance cap: 10000 файлов max с warning.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-multi-folder-scan-feature-в-solution-с-несколькими-test-проектами-feature3)

## FR-4: scaffold-spec.ts поддерживает -TestFormat flag @feature4

`scaffold-spec.ts` принимает `-TestFormat [bdd|unit|auto]`, дефолт `auto`. Поведение: `auto` — вызов detector, pick best match или fail actionable; `bdd` — форсирует создание `.feature`; `unit` — escape hatch, создаёт `SCENARIOS.md` вместо `.feature` с header «DOC ONLY — no executable BDD».

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-emergency-escape-hatch-testformat-unit-с-обязательным-обоснованием-feature4)

## FR-5: State machine гейтит Requirements→Finalization на BDD Classification @feature5

`commandConfirmStop(Requirements)` в `specs-generator-core.mjs` проверяет DESIGN.md на наличие `**TEST_DATA:**` + `**TEST_FORMAT:**` + (если TEST_FORMAT=BDD) `**Framework:**`. При отсутствии → throw Error, exit code 1, blocker message с actionable hint. `.progress.json` phases.Requirements получает новые поля `bddInfraClassificationComplete` и `bddFrameworkSelected` (graceful fallback для старых файлов).

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-state-machine-блокирует-confirmstop-requirements-без-classification-feature5)

## FR-6: TASKS.md Phase 0 bootstrap block (install + hooks + fixtures-config) @feature6

Когда DESIGN.md Framework отсутствует в target (Evidence = «not installed»), `templates/TASKS.md.template` генерирует Phase 0 bootstrap block из 3 обязательных task в строгой последовательности:
1. `install-bdd-framework` — install command (из DetectionResult.installCommand)
2. `bootstrap-bdd-hooks` — создать Hooks folder + 4 stub файла (BeforeAll/AfterAll/BeforeScenario/AfterScenario per framework convention). `depends: install-bdd-framework`
3. `bootstrap-bdd-fixtures-config` — создать fixtures folder + framework config file (reqnroll.json / cucumber.js / behave.ini / pytest.ini) с минимальным valid content. `depends: bootstrap-bdd-hooks`

Все implementation tasks показывают `depends: bootstrap-bdd-fixtures-config`. Если framework уже установлен (Evidence positive) — block заменяется одной строкой «(BDD foundation already in place)».

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-scaffold-спеки-в-проекте-где-bdd-фреймворк-ещё-не-установлен-feature6)

## FR-7: Validator BDD_INFRA rule severity upgrade WARNING → ERROR @feature7

`commandValidateSpec()` BDD_INFRA rule (и новый `BDD_INFRA_CLASSIFICATION_COMPLETE`) получают severity ERROR (было WARNING). Exit code 1 при missing Classification. Правило `BDD_INFRA_CLASSIFICATION_COMPLETE`: проверяет что `**TEST_FORMAT:**` matches `BDD|UNIT`; если BDD — require `**Framework:**` + `**Install Command:**` + `**Evidence:**`; если UNIT — require непустую Risks секцию в DESIGN.md с justification.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## FR-8: Shared bdd-framework-detector.ts module переиспользует steps-validator/detector.ts @feature8

Новый модуль `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` импортирует существующую логику из `extensions/specs-workflow/tools/steps-validator/detector.ts` (без дублирования — thin wrapper или re-export). API: `detectTargetFramework(projectPath, testProjectHints[]): DetectionResult` возвращает `{ language, framework, installCommand, hookFileHints[], configFileHint, fixturesFolderHint, evidence[], suggestedFrameworks[] }`. Support 6 пар: C#/Reqnroll, C#/SpecFlow, TS/Cucumber.js, TS/Playwright BDD, Python/Behave, Python/pytest-bdd. Fallback: framework=null + suggestedFrameworks на основе detected language.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

## FR-9: Создание спеки .specs/create-specs-bdd-enforcement/ с cross-reference на spec-phase-gate @feature9

Новая спека в `.specs/create-specs-bdd-enforcement/` содержит 13 обязательных файлов + `create-specs-bdd-enforcement.feature` с 6 BDD сценариями (SBDE001_01..06). README.md содержит cross-reference на `.specs/spec-phase-gate/` (там спроектирован phase-gate hook, мы добавляем BDD enforcement поверх).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
