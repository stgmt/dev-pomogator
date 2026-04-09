# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red → Green → Refactor.
> Phase 0 (BDD foundation) — первая, реализация после, рефакторинг последний.
> DESIGN.md классифицирован как `TEST_DATA_NONE` → hooks/fixtures не требуются.

## Phase -1: Infrastructure Prerequisites

Не требуется. Фича не вводит новых сервисов, БД, миграций или secrets. Все изменения локальные в `extensions/plan-pomogator/` и `.claude/rules/plan-pomogator/`.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл с BDD сценариями ПЕРЕД реализацией. Все сценарии должны FAIL (Red).
> DESIGN.md `TEST_DATA_NONE` → hooks/fixtures задачи не нужны.

- [ ] Скопировать `.specs/plan-pomogator-plain-language/plan-pomogator-plain-language.feature` сценарии PLUGIN007_43..48 в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (append к существующим 42 сценариям)
  _Source: [.feature](plan-pomogator-plain-language.feature)_
- [ ] Создать step definitions заглушки в существующем step definitions файле для plan-pomogator (если нужно — большинство шагов уже есть)
- [ ] Запустить тесты — убедиться что новые сценарии PLUGIN007_43..48 FAIL (Red) с понятными ошибками (не "step not found", а реальные assertions failures)

## Phase 1: Validator Modification (Green)

> Реализовать изменения в validate-plan.ts: новая запись в REQUIRED_SECTIONS + новая функция validateHumanSummarySection.

- [ ] Добавить в `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts:20-29` массив `REQUIRED_SECTIONS` ПЕРВЫМ элементом запись `{ name: 'Простыми словами', regex: /^##\s+(?:💬\s+)?Простыми словами\s*$/ }` — @feature2
  _Requirements: [FR-2](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2)_
- [ ] Добавить функцию `validateHumanSummarySection(lines, indices, errors)` в `validate-plan.ts` после `validateContextContent` (line ~414) по паттерну validateContextContent — @feature3
  _Requirements: [FR-3](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3)_
  _Pattern: `validate-plan.ts:372-413` (validateContextContent)_
- [ ] Добавить вызов `validateHumanSummarySection(lines, indices, result.phase1)` в `validatePlanPhased` Phase 1 блок после `validateSections` — @feature3
  _Requirements: [FR-3](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3)_
- [ ] Verify: сценарии PLUGIN007_43 и PLUGIN007_44 переходят из Red в Green (validator теперь ловит missing/empty section)

## Phase 2: Template + Fixture Update (Green)

> Обновить template.md и fixture с новой первой секцией.

- [ ] Добавить `## 💬 Простыми словами` секцию ПЕРВОЙ (перед `## 🎯 Context`) в `extensions/plan-pomogator/tools/plan-pomogator/template.md` с тремя подсекциями-плейсхолдерами (без `{}` curly bracket syntax — обычный markdown текст) — @feature1
  _Requirements: [FR-1](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1)_
- [ ] Добавить ту же секцию первой в `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md` с РЕАЛЬНЫМ контентом (про задачу валидатора, не плейсхолдеры) — @feature4
  _Requirements: [FR-4](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4)_
- [ ] Verify: сценарии PLUGIN007_45 (happy path) и PLUGIN007_46 (template structure) переходят из Red в Green

## Phase 3: Rule + Canonical Spec Update (Green)

> Обновить правило plan-pomogator.md с Two-Stage Workflow секцией и canonical requirements.md.

- [ ] Добавить новую top-level секцию `## Two-Stage Plan Presentation Workflow` в `.claude/rules/plan-pomogator/plan-pomogator.md` между секциями "Когда применять полный формат плана" и "Уточняющие вопросы" с 4 нумерованными Step — @feature5
  _Requirements: [FR-5](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5)_
- [ ] В той же секции добавить явный запрет "ЗАПРЕЩЕНО вызывать ExitPlanMode без выполненного Step 1"
- [ ] В секции "Обязательная структура плана (шаблон)" пункт 1 — упомянуть `## 💬 Простыми словами` ПЕРВОЙ обязательной секцией
- [ ] В Pre-flight Checklist (line 158-168) — добавить чек-пункт `[ ] ## 💬 Простыми словами секция первая в плане + содержимое отправлено в чат + подтверждено пользователем перед ExitPlanMode`
- [ ] Обновить `extensions/plan-pomogator/tools/plan-pomogator/requirements.md` — в "Обязательная структура (порядок секций)" добавить пункт 0 (или модифицировать пункт 1) с описанием новой обязательной секции — @feature6
  _Requirements: [FR-6](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6)_
- [ ] Verify: сценарий PLUGIN007_47 (rule contains Two-Stage Workflow) переходит из Red в Green

## Phase 4: Manifest Bump + e2e Tests (Green)

> Bump версии manifest и добавить e2e тесты.

- [ ] Bump `extensions/plan-pomogator/extension.json` поле `version` с `1.8.0` на `2.0.0` (BREAKING) — @feature7
  _Requirements: [FR-7](FR.md#fr-7-extensionjson-версия-200-breaking-feature7)_
- [ ] Обновить `description` в extension.json с упоминанием "Two-Stage Presentation: chat summary + monster plan dialog"
- [ ] Добавить три новых теста в `tests/e2e/plan-validator.test.ts`: (1) "Phase 1 detects missing Простыми словами section", (2) "Phase 1 validateHumanSummarySection detects empty section", (3) "Phase 1 accepts plan with non-empty Простыми словами section" — @feature8
  _Requirements: [FR-8](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8)_
- [ ] Verify: сценарий PLUGIN007_48 (extension version 2.0.0) переходит из Red в Green
- [ ] Verify: все три новых e2e теста проходят
- [ ] Verify: все 6 BDD сценариев PLUGIN007_43..48 GREEN

## Phase 5: Refactor & Polish

- [ ] Запустить полный test suite через `/run-tests plan-validator` в background — убедиться что нет регрессии в существующих 42+ сценариях PLUGIN007
- [ ] Запустить `npm run build` — убедиться что TypeScript компилируется без ошибок
- [ ] Скопировать обновлённые extension files в `.dev-pomogator/tools/plan-pomogator/` (или дождаться auto-updater)
- [ ] Manual verification: войти в Plan mode в Claude Code, запросить план для нетривиальной фичи, убедиться что AI выводит `## 💬 Простыми словами` в чат как текст перед ExitPlanMode и затем пишет план-файл с этой секцией первой
- [ ] Обновить CHANGELOG.md спеки с записью `## [1.0.0] - {date} - Implementation completed` (после успешной реализации)
- [ ] Commit с явной BREAKING CHANGE меткой в message: `feat(plan-pomogator)!: BREAKING add mandatory ## 💬 Простыми словами section`
