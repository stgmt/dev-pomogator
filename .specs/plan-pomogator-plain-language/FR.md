# Functional Requirements (FR)

## FR-1: Template содержит секцию "Простыми словами" первой @feature1

Шаблон `extensions/plan-pomogator/tools/plan-pomogator/template.md` содержит `## 💬 Простыми словами` как ПЕРВУЮ top-level секцию (перед `## 🎯 Context`) с тремя подсекциями-плейсхолдерами: `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1)

## FR-2: REQUIRED_SECTIONS массив содержит новую запись первой @feature2

В `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts:20-29` массив `REQUIRED_SECTIONS` содержит новую запись `{ name: 'Простыми словами', regex: /^##\s+(?:💬\s+)?Простыми словами\s*$/ }` ПЕРВЫМ элементом (до `Context`). Это автоматически делает секцию мандатори через существующую `validateSections` функцию (lines 74-100) без изменений в её логике.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1), [UC-4](USE_CASES.md#uc-4-backward-compat-breaking--старый-план-без-секции-feature5-feature6), [UC-6](USE_CASES.md#uc-6-edge-case--секция-в-неправильном-порядке-feature2)

## FR-3: validateHumanSummarySection функция проверяет non-empty content @feature3

В `validate-plan.ts` добавлена новая функция `validateHumanSummarySection(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void` (по паттерну `validateContextContent` lines 372-413). Функция: (1) находит индекс `Простыми словами` секции в `indices`, (2) использует `getSectionRange` для slice контента, (3) проверяет что есть хотя бы одна непустая строка ПОСЛЕ heading (не считая heading и пустых строк), (4) если только heading без контента — `addError` с сообщением "Секция Простыми словами пуста" и hint с шаблоном трёх подсекций. Вызов добавлен в `validatePlanPhased` в Phase 1 блоке после `validateSections`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-5](USE_CASES.md#uc-5-edge-case--пустая-секция-feature2)

## FR-4: Fixture valid.plan.md содержит новую секцию первой @feature4

Файл `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md` обновлён — добавлена `## 💬 Простыми словами` секция первой (перед `## 🎯 Context`) с реальным контентом (не плейсхолдеры) для трёх подсекций. Это нужно чтобы существующий тест `valid plan passes validation` продолжал проходить после промоушена секции в REQUIRED_SECTIONS.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1)

## FR-5: Правило plan-pomogator.md содержит Two-Stage Workflow секцию @feature5

Файл `.claude/rules/plan-pomogator/plan-pomogator.md` обновлён — добавлена новая top-level секция `## Two-Stage Plan Presentation Workflow` (между секциями "Когда применять полный формат плана" и "Уточняющие вопросы") с явной инструкцией для AI: (Step 1) вывести `## 💬 Простыми словами` контент в чат как обычное текстовое сообщение ПЕРЕД написанием плана-файла, (Step 2) дождаться подтверждения от пользователя в свободной форме, (Step 3) если поправка — повторить Step 1, иначе — написать план-файл с секцией первой, (Step 4) вызвать ExitPlanMode. Явный запрет: ЗАПРЕЩЕНО вызывать ExitPlanMode без выполненного Step 1. Также обновлена секция "Обязательная структура плана (шаблон)" — `## 💬 Простыми словами` упомянута первой в порядке секций. Также обновлён Pre-flight Checklist — добавлен чек-пункт `[ ] ## 💬 Простыми словами секция первая в плане + содержимое отправлено в чат + подтверждено пользователем перед ExitPlanMode`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1), [UC-2](USE_CASES.md#uc-2-correction-loop--пользователь-поправляет-feature1-feature3), [UC-3](USE_CASES.md#uc-3-uncertainty-abc-variants-feature4)

## FR-6: Canonical requirements.md документирует новую секцию @feature6

Файл `extensions/plan-pomogator/tools/plan-pomogator/requirements.md` обновлён — в секции "Обязательная структура (порядок секций)" добавлен пункт 0 (или модифицирован пункт 1) описывающий `## 💬 Простыми словами` как первую обязательную секцию с тремя подсекциями. Также добавлена секция "Two-Stage Plan Presentation" с описанием workflow и обоснованием почему секция first.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-с-simple-summary-в-шапке-feature1)

## FR-7: extension.json версия 2.0.0 (BREAKING) @feature7

Файл `extensions/plan-pomogator/extension.json` обновлён — поле `version` изменено с `1.8.0` на `2.0.0` (major bump из-за breaking change). Поле `description` обновлено с упоминанием "Two-Stage Presentation: chat summary + monster plan dialog". CHANGELOG manifest или git commit message содержат явную BREAKING CHANGE метку.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-backward-compat-breaking--старый-план-без-секции-feature5-feature6)

## FR-8: e2e тесты для новой секции @feature8

Файл `tests/e2e/plan-validator.test.ts` обновлён — добавлены три новых теста: (1) "Phase 1 detects missing Простыми словами section" — план без секции → result.phase1 содержит error "Отсутствует секция: Простыми словами"; (2) "Phase 1 validateHumanSummarySection detects empty section" — план с секцией без контента → result.phase1 содержит error "Секция Простыми словами пуста"; (3) "Phase 1 accepts plan with non-empty Простыми словами section" — план с правильно заполненной секцией первой → result.phase1 пустой. Также добавлено минимум 6 BDD сценариев в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (PLUGIN007_43..48) с @featureN тегами 1:1 mapping к новым сценариям в спеке.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** Все UC через automated testing
