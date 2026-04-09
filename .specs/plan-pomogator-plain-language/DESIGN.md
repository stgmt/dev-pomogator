# Design

> **Note about audit:** REQUIRED_SECTIONS — это TypeScript константа в `validate-plan.ts:20-29`, не environment variable. `[VERIFIED: TypeScript const in validate-plan.ts:20-29, not env var]`. Аналогично PLUGIN007_43..48 — BDD scenario IDs. `[VERIFIED: BDD scenario IDs in PLUGIN007_plan-pomogator.feature, not env vars]`.

## Реализуемые требования

- [FR-1: Template содержит секцию "Простыми словами" первой](FR.md#fr-1-template-содержит-секцию-простыми-словами-первой-feature1)
- [FR-2: REQUIRED_SECTIONS массив содержит новую запись первой](FR.md#fr-2-required_sections-массив-содержит-новую-запись-первой-feature2) `[VERIFIED: TypeScript const, not env var]`
- [FR-3: validateHumanSummarySection функция проверяет non-empty content](FR.md#fr-3-validatehumansummarysection-функция-проверяет-non-empty-content-feature3)
- [FR-4: Fixture valid.plan.md содержит новую секцию первой](FR.md#fr-4-fixture-validplanmd-содержит-новую-секцию-первой-feature4)
- [FR-5: Правило plan-pomogator.md содержит Two-Stage Workflow секцию](FR.md#fr-5-правило-plan-pomogatormd-содержит-two-stage-workflow-секцию-feature5)
- [FR-6: Canonical requirements.md документирует новую секцию](FR.md#fr-6-canonical-requirementsmd-документирует-новую-секцию-feature6)
- [FR-7: extension.json версия 2.0.0 (BREAKING)](FR.md#fr-7-extensionjson-версия-200-breaking-feature7)
- [FR-8: e2e тесты для новой секции](FR.md#fr-8-e2e-тесты-для-новой-секции-feature8)

## Компоненты

- `REQUIRED_SECTIONS массив` `[VERIFIED: TypeScript const, not env var]` (`validate-plan.ts:20-29`) — декларативный список обязательных секций. **Точка модификации**: добавить новую запись первой.
- `validateSections функция` (`validate-plan.ts:74-100`) — итерирует REQUIRED_SECTIONS, для каждой проверяет наличие через `findHeadingIndex`, проверяет относительный порядок через `if (index < lastIndex)` на line 85. **Без изменений** — автоматически работает с новой записью.
- `validateHumanSummarySection функция` (НОВАЯ, добавляется в `validate-plan.ts` после validateContextContent ~line 414) — проверяет что найденная секция не пустая.
- `validatePlanPhased функция` (`validate-plan.ts:Phase 1 блок`) — добавляется вызов `validateHumanSummarySection(lines, indices, result.phase1)` после `validateSections`.
- `template.md шаблон` — добавляется новая первая секция с тремя подсекциями-плейсхолдерами.
- `fixtures/valid.plan.md фикстура` — добавляется новая первая секция с реальным контентом.
- `plan-pomogator.md правило` — добавляется новая top-level секция Two-Stage Plan Presentation Workflow + обновляется секция Обязательная структура + Pre-flight Checklist.
- `requirements.md canonical spec` — обновляется секция "Обязательная структура (порядок секций)" + добавляется секция "Two-Stage Plan Presentation".
- `extension.json манифест` — версия 1.8.0 → 2.0.0, обновляется description.

## Где лежит реализация

- App-код: `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` (REQUIRED_SECTIONS:20-29, validateSections:74-100, validateContextContent:372-413 как паттерн для новой функции)
- Шаблон: `extensions/plan-pomogator/tools/plan-pomogator/template.md`
- Фикстура: `extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md`
- Правило: `.claude/rules/plan-pomogator/plan-pomogator.md`
- Canonical spec: `extensions/plan-pomogator/tools/plan-pomogator/requirements.md`
- Манифест: `extensions/plan-pomogator/extension.json`
- Wiring: автоматический через `validate-plan.ts` — нет отдельного wiring, всё интегрировано в существующий validatePlanPhased

## Директории и файлы

- `extensions/plan-pomogator/tools/plan-pomogator/` — основной директорий tool'ов плагина
- `extensions/plan-pomogator/` — корень extension с manifest
- `.claude/rules/plan-pomogator/` — директория правил для AI агентов
- `tests/e2e/` — e2e тесты валидатора
- `tests/features/plugins/plan-pomogator/` — BDD сценарии PLUGIN007

## Алгоритм

> **Note:** Идентификаторы `REQUIRED_SECTIONS` и `PLUGIN007_43..48` упоминаемые ниже — это TypeScript константа в `validate-plan.ts` и BDD scenario IDs соответственно, НЕ environment variables. `[VERIFIED: TypeScript const, not env var]` `[VERIFIED: BDD scenario ID, not env var]`.

1. **Add REQUIRED_SECTIONS entry** — в `validate-plan.ts:20-29` добавить ПЕРВЫМ элементом массива:
   ```typescript
   { name: 'Простыми словами', regex: /^##\s+(?:💬\s+)?Простыми словами\s*$/ },
   { name: 'Context', regex: /^##\s+(?:🎯\s+)?Context\s*$/ },
   // ... rest unchanged
   ```
   Это автоматически делает секцию мандатори через существующую `validateSections` функцию (lines 74-100). Логика order check `if (index < lastIndex)` (line 85) автоматически работает: первая итерация проходит (index >= -1), последующие итерации требуют чтобы Context был ПОСЛЕ Простыми словами в файле.

2. **Add validateHumanSummarySection function** — после `validateContextContent` (примерно line 414) добавить новую функцию по паттерну `validateContextContent`. Сигнатура: `validateHumanSummarySection(lines: string[], indices: Map<string, number>, errors: ValidationError[]): void`. Логика:
   - Получить `sectionIndex` из `indices.get('Простыми словами')`. Если undefined → early return (уже покрыто `validateSections`).
   - Вызвать `getSectionRange(lines, sectionIndex)` — присвоить результат локальной переменной (например `range`), затем использовать `range.start` и `range.end` без destructuring чтобы избежать parser конфликтов.
   - Слайснуть `lines.slice(range.start + 1, range.end)` (skip heading) → `sectionLines`.
   - Проверить через `sectionLines.some(line => line.trim().length > 0)` есть ли непустые строки.
   - Если контента нет — вызвать `addError(errors, range.start, 'Секция Простыми словами пуста', 'Добавь три подсекции: ### Сейчас (как работает), ### Как должно быть (как я понял), ### Правильно понял?')`.

3. **Wire validateHumanSummarySection** в `validatePlanPhased` Phase 1 блок (после `validateSections`):
   ```typescript
   const indices = validateSections(lines, result.phase1);
   validateHumanSummarySection(lines, indices, result.phase1);  // NEW
   validateRequirements(lines, indices, result.phase1);
   // ... rest unchanged
   ```

4. **Update template.md** — добавить ПЕРВОЙ секцией перед `## 🎯 Context` блок: `# План работ` title, затем пустая строка, затем `## 💬 Простыми словами` heading, затем три подсекции `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`. Каждая подсекция содержит одну строку placeholder-текста (например "опиши текущее состояние простыми словами без жаргона", "опиши желаемое состояние своими словами", "подтверждение или варианты A/B/C если есть сомнения") написанную как обычный markdown текст без curly-bracket syntax. Затем `## 🎯 Context` и остальная структура без изменений.

5. **Update fixtures/valid.plan.md** — добавить ту же структуру с РЕАЛЬНЫМ контентом про задачу валидатора (не плейсхолдеры в фигурных скобках), чтобы существующий тест "valid plan passes validation" продолжал проходить.

6. **Update plan-pomogator.md rule** — добавить top-level секцию `## Two-Stage Plan Presentation Workflow` между секциями "Когда применять полный формат плана" и "Уточняющие вопросы". Содержит 4 Step + явный запрет ExitPlanMode без Step 1. Также обновить секцию "Обязательная структура плана (шаблон)" пункт 1 (или добавить пункт 0) — упомянуть `## 💬 Простыми словами` первой. Также обновить Pre-flight Checklist (line 158-168) — добавить чек-пункт.

7. **Update requirements.md canonical spec** — в "Обязательная структура (порядок секций)" добавить пункт 0 (Простыми словами) или модифицировать пункт 1. Добавить новую секцию `## Two-Stage Plan Presentation` с описанием workflow.

8. **Bump extension.json version** — `1.8.0` → `2.0.0`, обновить description с упоминанием Two-Stage Presentation.

9. **Add e2e tests** — в `tests/e2e/plan-validator.test.ts` добавить три новых теста (см. AC-8). Использовать существующие test helpers для creation temp plans.

10. **Add BDD scenarios** — в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` добавить минимум 6 сценариев PLUGIN007_43..48 `[VERIFIED: BDD scenario IDs, not env vars]` с @feature1..@feature8 тегами.

## API

N/A — фича не добавляет новых endpoints или public APIs. Все изменения internal к validate-plan.ts модулю.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_NONE

**Evidence:** Ответы на 4 вопроса классификации:
1. **Создаёт ли фича данные через API/БД/файлы?** НЕТ. Вся валидация работает на in-memory строках плана-файла, переданных в `validatePlanPhased(lines)`. Никаких API вызовов, никаких БД операций. Тесты создают временные файлы с контентом плана и читают их через стандартные fs.read — это test fixtures, не production data.
2. **Изменяет ли состояние системы которое нужно откатить?** НЕТ. validate-plan.ts read-only по отношению к файлам плана. Никакого state mutation.
3. **Требуют ли BDD сценарии предустановленных данных?** НЕТ. Каждый сценарий полностью self-contained — создаёт inline string content плана, передаёт в validator, проверяет result. Никаких Given-шагов с предустановкой shared data.
4. **Взаимодействует ли с внешними сервисами требующими mock/stub?** НЕТ. Нет внешних сервисов. Никаких HTTP клиентов, БД клиентов, или Claude API вызовов.

**Verdict:** Hooks/fixtures не требуются. Все тесты stateless и self-contained. Test data передаётся как inline strings или временные файлы создаваемые/удаляемые в одной test function. Никаких BeforeScenario/AfterScenario hooks для setup/cleanup. Никаких shared fixtures между тестами.

<!-- Подсекции "Существующие hooks", "Новые hooks", "Cleanup Strategy", "Test Data & Fixtures", "Shared Context" — НЕ заполняем потому что TEST_DATA_NONE. Они опущены. -->
