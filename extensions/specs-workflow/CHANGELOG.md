# Changelog

All notable changes to the `specs-workflow` extension are documented here.

## [1.15.0] - 2026-04-21

### Added

- **BDD Enforcement — везде BDD default.** Phase 2 Step 6 теперь классифицирует фичу по двум осям: TEST_DATA (существующая) + TEST_FORMAT (новая; BDD default, UNIT escape hatch с Risks justification) + Framework + Install Command + Evidence. (FR-1, FR-7)
- **Non-skippable Phase 2 Step 6.** State machine `commandConfirmStop(Requirements)` pre-check DESIGN.md — exit code 1 + actionable blocker без BDD Test Infrastructure Classification. (FR-5)
- **`bdd-framework-detector.ts` shared module** — детектит BDD framework в target test-projects (6 пар: C#/Reqnroll|SpecFlow, TS/Cucumber.js|Playwright BDD, Python/Behave|pytest-bdd) + возвращает installCommand + hookFileHints + configFileHint + fixturesFolderHint + evidence + suggestedFrameworks. Переиспользует логику `steps-validator/detector.ts`. (FR-8)
- **Phase 1.5 Project Context Analysis** — новый шаг 4a: детект framework в target test-projects из FILE_CHANGES, запись DetectionResult в RESEARCH.md `### Existing Patterns & Extensions`. (FR-2)
- **`scaffold-spec.ts -TestFormat [bdd|unit|auto]`** — новый флаг (default `auto`). `unit` создаёт `SCENARIOS.md` (doc-only) вместо `.feature`. (FR-4)
- **TASKS.md Phase 0 bootstrap block** — conditional: если Framework отсутствует в target, generator ставит 3 task в строгой последовательности (install-bdd-framework → bootstrap-bdd-hooks → bootstrap-bdd-fixtures-config), все implementation tasks зависят от последней. (FR-6)
- **`.claude/rules/specs-workflow/bdd-enforcement.md`** — новое правило: BDD default principle, framework decision tree (language→framework matrix), install + bootstrap recipes per framework, escape hatch semantics. (FR-6)
- **`analyze-features.ts` multi-folder recursive scan** — сканит `**/*.feature` от repoRoot с ignore `node_modules`/`dist`/`build`/`bin`/`obj`/`.git`/`.dev-pomogator`. Cap 10000 files. Находит BDD в non-default layouts (`Cloud/server/*/Features/`, `src/apps/Tests/Features/` и т.д.). (FR-3)
- **Validator `BDD_INFRA_CLASSIFICATION_COMPLETE` rule** — severity ERROR (было WARNING). Проверяет TEST_DATA + TEST_FORMAT поля; если TEST_FORMAT=BDD → требует Framework + Install Command + Evidence; если TEST_FORMAT=UNIT → требует Risks ≥30 символов. (FR-7)

### Changed

- **`.progress.json` schema v2**: `phases.Requirements` получил новые поля `bddInfraClassificationComplete: false` и `bddFrameworkSelected: null`. Graceful fallback для старых `.progress.json` файлов через `ensureProgressStateSchema()`.
- **DESIGN.md template**: `## BDD Test Infrastructure` секция переписана — вместо единственного `**Classification:**` поля теперь 6 полей (TEST_DATA, TEST_FORMAT, Framework, Install Command, Evidence, Verdict) + Step 6.1a/b/c guidance.
- **TASKS.md template**: Phase 0 получил conditional bootstrap block (3 обязательных task когда Framework missing) с `depends:` chain.
- **`.claude/rules/specs-workflow/specs-management.md`**: Phase 1.5 Шаг 4a (BDD detect), Phase 2 Step 6.1 разделён на 6.1a (TEST_DATA) + 6.1b (TEST_FORMAT) + 6.1c (Framework).

### Fixed

- **analyze-features.ts больше не пропускает BDD в нестандартных папках** (регрессия из MS-18177: Reqnroll в `Cloud/server/Cleverence.Server.Tests/Features/` был невидим для инструмента).
- **Validator BDD_INFRA severity — теперь ERROR** (ранее WARNING не блокировал validate-spec exit code).

## [1.14.0] — предыдущая версия

См. commit history.
