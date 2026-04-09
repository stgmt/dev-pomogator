# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1)

WHEN разработчик читает `extensions/plan-pomogator/tools/plan-pomogator/template.md` THEN файл SHALL содержать `## 💬 Простыми словами` heading на line 3 (после `# План работ` title и пустой строки) И SHALL содержать три подсекции (`### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`) с плейсхолдерами в фигурных скобках.

WHEN валидатор запускается на template.md THEN валидатор SHALL найти `## 💬 Простыми словами` ПЕРВОЙ обнаруженной top-level секцией (через `findHeadingIndex` в validateSections).

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2)

WHEN валидатор запускается на плане без `## 💬 Простыми словами` секции THEN validateSections SHALL вернуть error в `result.phase1` с message "Отсутствует секция: Простыми словами" И с actionable hint "Добавь первой секцией: ## 💬 Простыми словами".

WHEN валидатор запускается на плане с `## 💬 Простыми словами` AFTER `## 🎯 Context` (нарушенный порядок) THEN validateSections SHALL вернуть error "Секция Простыми словами находится не в требуемом порядке" через order check `if (index < lastIndex)` на validate-plan.ts:85.

IF существует план с `## 💬 Простыми словами` секцией первой AND все остальные 8 секций (Context, User Stories, Use Cases, Requirements, Implementation Plan, Todos, Definition of Done, File Changes) присутствуют в правильном порядке THEN validateSections SHALL вернуть `result.phase1 = []` (Phase 1 проходит).

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3)

WHEN валидатор запускается на плане с `## 💬 Простыми словами` heading но без контента (только heading и пустая строка перед следующей секцией) THEN validateHumanSummarySection SHALL добавить error в `result.phase1` с message "Секция Простыми словами пуста" И с hint содержащим шаблон трёх подсекций.

IF секция `## 💬 Простыми словами` содержит хотя бы одну непустую строку контента (не считая heading и пустых строк) THEN validateHumanSummarySection SHALL НЕ добавлять связанных errors в `result.phase1`.

WHEN validateHumanSummarySection запускается AND секция отсутствует в `indices` map THEN функция SHALL early-return без error (отсутствие секции уже покрыто validateSections в FR-2).

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4)

WHEN запускается e2e тест "valid plan passes validation" с обновлённой `fixtures/valid.plan.md` THEN validatePlanPhased SHALL вернуть `result.phase1 = [], result.phase2 = [], result.phase3 = [], result.phase4 = []` (полный pass без errors и warnings).

IF fixture файл прочитан THEN он SHALL содержать `## 💬 Простыми словами` heading на одной из первых 5 строк AND под ним должны быть три непустые подсекции (Сейчас / Как должно быть / Правильно понял?) с реальным контентом про задачу валидатора (не плейсхолдеры).

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5)

WHEN правило `.claude/rules/plan-pomogator/plan-pomogator.md` прочитано THEN оно SHALL содержать top-level секцию `## Two-Stage Plan Presentation Workflow` И эта секция SHALL содержать ровно 4 нумерованных Step (Step 1: вывести в чат, Step 2: дождаться, Step 3: написать план-файл, Step 4: ExitPlanMode) И SHALL содержать явный запрет "ЗАПРЕЩЕНО вызывать ExitPlanMode без выполненного Step 1".

WHEN секция "Обязательная структура плана (шаблон)" в правиле прочитана THEN она SHALL упоминать `## 💬 Простыми словами` ПЕРВОЙ в порядке обязательных секций.

WHEN Pre-flight Checklist в правиле прочитан THEN он SHALL содержать чек-пункт упоминающий `## 💬 Простыми словами` секцию И отправку её содержимого в чат перед ExitPlanMode.

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6)

WHEN canonical spec `extensions/plan-pomogator/tools/plan-pomogator/requirements.md` прочитан THEN он SHALL содержать `## 💬 Простыми словами` упомянутую как ПЕРВУЮ обязательную секцию (или новый пункт 0, или модифицированный пункт 1) в секции "Обязательная структура (порядок секций)".

IF requirements.md содержит секцию "Two-Stage Plan Presentation" THEN секция SHALL описывать workflow (chat → confirmation → file → ExitPlanMode) И SHALL обосновать почему секция первая (для visibility в шапке).

## AC-7 (FR-7) @feature7

**Требование:** [FR-7](FR.md#fr-7-extensionjson-версия-200-breaking-feature7)

WHEN `extensions/plan-pomogator/extension.json` прочитан THEN поле `version` SHALL равняться `"2.0.0"` (не `"1.8.0"` или `"1.9.0"`).

IF поле `description` обновлено THEN оно SHALL содержать упоминание "Two-Stage Presentation" или "chat summary" или "Простыми словами" чтобы breaking change был явно отмечен.

## AC-8 (FR-8) @feature8

**Требование:** [FR-8](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8)

WHEN запускаются e2e тесты `npm run test -- plan-validator` THEN test suite SHALL содержать минимум три новых теста: "Phase 1 detects missing Простыми словами section", "Phase 1 validateHumanSummarySection detects empty section", "Phase 1 accepts plan with non-empty Простыми словами section".

WHEN запускаются BDD тесты PLUGIN007 THEN .feature файл `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` SHALL содержать минимум 6 новых сценариев PLUGIN007_43..48 с @feature1..@feature8 тегами linking back to FR-1..FR-8.

WHEN все три новых e2e теста запускаются на актуальном коде после реализации FR-1..FR-7 THEN все три теста SHALL pass (status = passed, exit code 0).
