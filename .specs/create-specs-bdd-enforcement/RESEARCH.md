# Research

## Контекст

В реальном use-case (smarts, тикет MS-18177 «empty client messages») агент через `/create-spec` нагенерил `.specs/ms-18177-empty-client-messages/` с `.feature` файлом на 8 сценариев, но написал тесты как 6 plain xUnit `[Fact]` в `Cleverence.MobileSMARTS.Tests`. `.feature` мёртвый — не исполняется, ссылка между ним и xUnit тестами только через `/// Specification:` комментарий. Одновременно в том же solution есть `Cleverence.Server.Tests` с Reqnroll 2.3.0 и полноценным BDD (`Features/ConnectorPersistence.feature` + `ConnectorPersistenceSteps.cs` + `ConnectorPersistenceHooks.cs`).

Постмортем агента зафиксировал цепочку решений:
1. Scaffolder автоматически создал `.feature` — это шаблон, не утверждение про executable BDD
2. `analyze-features.ts` вернул пусто (сканит только `tests/features/**`) — агент интерпретировал как «BDD в проекте не принят»
3. Соседние `Messaging_A1..A6_Tests.cs` в target test-проекте — plain xUnit → convention-следование
4. Agent заполнил DESIGN.md `TEST_DATA_NONE` → посчитал что вопрос формата тестов решён (подменил вопрос про data на вопрос про format)
5. В итоге: `.feature` остался draft-документом, а xUnit тесты не связаны с BDD сценариями

## Источники

- Постмортем агента в чате (raw evidence о цепочке решений)
- `.claude/rules/specs-workflow/specs-management.md` — текущая Phase 2 Step 6 «BDD Test Infrastructure Assessment» с 4 data-questions и отсутствием test-format classification
- `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` — state machine, validator, analyze-features реализации
- `extensions/specs-workflow/tools/steps-validator/detector.ts` — существующий детектор языка и BDD-фреймворка для step files
- `.specs/spec-phase-gate/` — complete Phase-Gate архитектура (15 файлов), полезна как reference: там спроектирован 3-layer hook для enforce фаз

## Технические находки

### 1. State machine не гейтит Requirements→Finalization на Classification

`specs-generator-core.mjs` в районе `createDefaultProgressState()` (lines ~381-393) хранит флаги `completedAt`, `stopConfirmed`, `stopConfirmedAt` по фазам. `commandConfirmStop()` (lines ~1188-1197) проставляет `stopConfirmed=true` без проверки заполненности DESIGN.md BDD Test Infrastructure Classification.

Gate в районе lines ~1209-1217 считает Requirements complete если все required файлы существуют и непусты. Classification-check отсутствует → Step 6 де-факто skippable даже несмотря на текст правила «ОБЯЗАТЕЛЬНО — НЕ пропускать».

### 2. Validator BDD_INFRA rule severity = WARNING

Lines ~925-960 `commandValidateSpec()`: проверяет наличие `## BDD Test Infrastructure` секции и Classification поля, но severity WARNING. Exit code 0 → validator не блокирует. Upgrade на ERROR нужен для enforcement.

### 3. analyze-features.ts scan захардкожен

Lines ~2620-2623: `analyzeFeatures()` сканит только `[repoRoot/tests/features, repoRoot/.specs]`. `Cloud/server/*/Features/` (smarts case) — пропущены. Требуется multi-folder recursive scan `**/*.feature` с ignore стандартных build-папок.

### 4. steps-validator/detector.ts — готовая база для BDD framework detection

`extensions/specs-workflow/tools/steps-validator/detector.ts` уже умеет детектить 3 пары (TypeScript → Cucumber.js / Playwright BDD, Python → Behave / pytest-bdd, C# → Reqnroll / SpecFlow). Можно reuse в новом `bdd-framework-detector.ts` для scaffold-spec и Phase 1.5 Project Context Analysis.

### 5. scaffold-spec.ts всегда создаёт .feature

`commandScaffoldSpec()` безусловно генерирует `{slug}.feature` файл. Нет branch-логики «если target test-проект не поддерживает BDD — создай `SCENARIOS.md` doc-only или форсируй install fraamework task». Результат: мёртвые `.feature` накапливаются в `.specs/` как декоративные артефакты.

### 6. specs-management.md Phase 2 Step 6 — подмена вопроса

Текущий алгоритм Step 6.1 задаёт 4 data-questions (creates/modifies/rolls-back data, requires preset data, external services) и классифицирует TEST_DATA_ACTIVE / TEST_DATA_NONE. Вопрос «BDD vs UNIT?» + «какой framework?» не задаётся. Агент корректно отвечает «нет» на все 4 data-questions → получает TEST_DATA_NONE → проскакивает в Finalization, без упоминания test format.

## Где лежит реализация

- Источник правила: `.claude/rules/specs-workflow/specs-management.md` (installed copy) + `extensions/specs-workflow/rules/claude/specs-management.md` (source)
- State machine / validator / scaffold / analyze-features: `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (~3000 строк, single-file ядро) + wrappers (`scaffold-spec.ts`, `spec-status.ts`, `validate-spec.ts`, `audit-spec.ts`, `analyze-features.ts`)
- Templates: `extensions/specs-workflow/tools/specs-generator/templates/{DESIGN,TASKS,FR,NFR,...}.md.template`
- Существующий детектор для reuse: `extensions/specs-workflow/tools/steps-validator/detector.ts`
- Manifest: `extensions/specs-workflow/extension.json` (version 1.14.0 → 1.15.0)

## Выводы

1. **BDD — default везде.** Универсально для всех языков. «Без BDD» — не стабильное состояние проекта, а remediation target для Phase 0 bootstrap.
2. **Step 6 должен стать non-skippable** через гейт в state machine (ConfirmStop Requirements проверяет DESIGN.md Classification regex перед переводом фазы).
3. **Новый Classification — два поля:** TEST_DATA (существующее) + TEST_FORMAT (BDD | UNIT) + Framework + Install Command + Evidence.
4. **Phase 0 bootstrap block** обязателен если framework missing: install-bdd-framework → bootstrap-bdd-hooks → bootstrap-bdd-fixtures-config.
5. **analyze-features multi-folder** — glob `**/*.feature` с ignore, respecting `.gitignore`.
6. **scaffold-spec -TestFormat flag** — auto (default, вызов detector), bdd (forced), unit (emergency escape с обязательным Risks justification).
7. **Sharded detector module** reuses `steps-validator/detector.ts` — не дублировать код, thin wrapper.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| specs-management | `.claude/rules/specs-workflow/specs-management.md` | 4-phase spec workflow, Phase 2 Step 6 BDD Test Infrastructure Assessment | `/create-spec`, "создай спеки" | FR-1, FR-2, FR-6 |
| specs-validation | `.claude/rules/specs-workflow/specs-validation.md` | Validator rules таблица, BDD_INFRA rule currently WARNING | работа с `.specs/` | FR-7 |
| no-test-helper-duplication | `.claude/rules/test-quality/no-test-helper-duplication.md` | Helper code reuse через `tests/e2e/helpers.ts` | создание тестов | FR-8 (detector reuse) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Manifest — single source of truth, update `toolFiles`/`rules` при изменениях | изменения в extension | FR-9 (manifest bump) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через `runInstaller`/`spawnSync`, не isolated unit | написание тестов | Integration tests SBDE001_01..06 |
| plan-pomogator | `.claude/rules/plan-pomogator/plan-pomogator.md` | Format планов с 10 секций | работа в Plan mode | N/A (процесс) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| steps-validator/detector | `extensions/specs-workflow/tools/steps-validator/detector.ts` | Детект языка + BDD framework (TS/Cucumber.js/Playwright BDD, Python/Behave/pytest-bdd, C#/Reqnroll/SpecFlow) | REUSE через thin wrapper в новом `bdd-framework-detector.ts` (FR-8) |
| specs-generator-core | `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` | State machine, validator, scaffold, analyze-features (single-file ~3000 LOC) | EDIT lines ~381-393 (progress schema), 925-960 (BDD_INFRA), 1188-1217 (ConfirmStop gate), 2620-2623 (analyze-features) |
| spec-phase-gate | `.specs/spec-phase-gate/` | Complete phase-gate hook architecture (15 файлов) | REFERENCE в README.md новой спеки; cross-reference для enforcement design |
| reqnroll-ce-guard | `extensions/reqnroll-ce-guard/` + `.claude/rules/reqnroll-ce-guard/` | Hook блокирует невалидные Reqnroll step patterns | REFERENCE — показывает как hooks блокируют код на уровне Write/Edit |

### Architectural Constraints Summary

- `.progress.json` schema миграция: старые файлы без новых полей должны читаться без ошибки (graceful fallback: undefined → default false/null).
- Escape hatch `-TestFormat unit` НЕ удаляется — сохраняется для крайних случаев, но требует Risks justification и блокируется validator-ом если обоснования нет.
- Performance: recursive `**/*.feature` scan на крупных repo — ограничение 10000 files max с warning (protection против патологических случаев).
- Backward compat: existing `.specs/*/DESIGN.md` без `## BDD Test Infrastructure` секции — поведение не меняется (WARNING как раньше); новая ERROR-severity валидация применяется только когда секция присутствует но неполная. Migration tool out of scope.
