# Create Specs BDD Enforcement

Фича для плагина `specs-workflow`: делает Phase 2 Step 6 «BDD Test Infrastructure Assessment» непропускаемым через state machine; добавляет классификацию TEST_FORMAT (BDD дефолт везде, UNIT — emergency escape с обязательным обоснованием); форсит в Phase 0 TASKS.md обязательный bootstrap block «install BDD framework + hooks + fixtures + config» когда framework отсутствует в target test-project; расширяет `analyze-features.ts` multi-folder recursive scan.

## Ключевые идеи

- **BDD — default везде.** Для всех языков. «Без BDD» — не стабильное состояние, а remediation target для Phase 0 bootstrap.
- **State machine enforce-ит Step 6.** `spec-status.ts -ConfirmStop Requirements` падает с exit code 1 если DESIGN.md не содержит TEST_DATA + TEST_FORMAT + Framework полей.
- **Phase 0 bootstrap block = 3 task в строгой последовательности** (install-bdd-framework → bootstrap-bdd-hooks → bootstrap-bdd-fixtures-config). Все implementation tasks зависят от последней.
- **Shared detector переиспользует `steps-validator/detector.ts`** — 6 пар language/framework (C#/Reqnroll|SpecFlow, TS/Cucumber.js|Playwright BDD, Python/Behave|pytest-bdd).
- **`analyze-features.ts` рекурсивно сканит `**/*.feature`** с ignore build-папок.

## См. также

- [.specs/spec-phase-gate/](../spec-phase-gate/) — complete Phase-Gate hook architecture (3-layer: PreToolUse phase-gate enforcement + UserPromptSubmit phase-status injection + Audit checks). Эта спека наслаивает BDD enforcement поверх phase-gate hooks.
- [.specs/spec-workflow-feature-steps-validation/](../spec-workflow-feature-steps-validation/) — On-hook validator BDD step definitions (TS/Python/C# language detection). REUSE через новый `bdd-framework-detector.ts`.

## Где лежит реализация

- **App-код**: `extensions/specs-workflow/tools/specs-generator/` (specs-generator-core.mjs, scaffold-spec.ts, bdd-framework-detector.ts NEW)
- **Wiring**: `extensions/specs-workflow/extension.json` (version 1.15.0, rules + toolFiles manifest)
- **Rules**: `.claude/rules/specs-workflow/{specs-management,bdd-enforcement,specs-validation}.md` + mirror в `extensions/specs-workflow/rules/claude/`
- **Templates**: `extensions/specs-workflow/tools/specs-generator/templates/{DESIGN,TASKS}.md.template`
- **Tests**: `tests/e2e/create-specs-bdd-enforcement.test.ts` + `tests/fixtures/bdd-enforcement/` (парные missing/installed mini-projects)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 4 stories (tech lead, dev, agent, maintainer)
- [USE_CASES.md](USE_CASES.md) — UC-1..4 (C# remediation, multi-folder scan, state machine gate, escape hatch)
- [RESEARCH.md](RESEARCH.md) — problem evidence из MS-18177, Phase 1.5 Project Context, existing assets
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR ↔ AC ↔ @feature
- [FR.md](FR.md) — 9 FR с @feature1..9 тегами
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS формат AC-1..9
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability
- [DESIGN.md](DESIGN.md) — архитектура + обязательная BDD Test Infrastructure секция (показывает новый формат)
- [TASKS.md](TASKS.md) — TDD order: Phase 0 BDD foundation → Phase 1-6 реализация → Phase 7 manifest + dogfood
- [FILE_CHANGES.md](FILE_CHANGES.md) — все create/edit файлы с FR ссылками
- [create-specs-bdd-enforcement.feature](create-specs-bdd-enforcement.feature) — 6 BDD scenarios SBDE001_01..06
- [CHANGELOG.md](CHANGELOG.md) — changelog спеки
