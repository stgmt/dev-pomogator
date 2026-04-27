# Phase 2 Step 6: BDD Test Infrastructure Assessment

## Contents

- [Step 6.1a: TEST_DATA Classification](#step-61a-test_data-classification-data-impact)
- [Step 6.1b: TEST_FORMAT Classification](#step-61b-test_format-classification-test-format)
- [Step 6.1c: Framework Choice](#step-61c-framework-choice-только-если-test_formatbdd)
- [Step 6.2: Сканирование существующих hooks](#step-62-сканирование-существующих-hooks-обязательно-для-test_data_active)
- [Step 6.3: Проектирование hooks](#step-63-проектирование-hooks-для-этой-фичи-обязательно-для-test_data_active)
- [Step 6.4: Валидация полноты](#step-64-валидация-полноты-self-check)
- [Step 6.5: FIXTURES.md](#step-65-fixturesmd-если-test_data_active)

**Цель:** Классифицировать фичу по test data impact и format, выбрать BDD framework, спроектировать hooks и fixtures. Записать в `## BDD Test Infrastructure` секцию DESIGN.md (секция НЕ МОЖЕТ быть удалена).

## Step 6.1a: TEST_DATA Classification (data impact)

Ответить на 4 вопроса (ДА/НЕТ):

1. Фича создаёт, изменяет или удаляет данные через API/БД/файлы?
2. Фича изменяет состояние системы, которое нужно откатить после теста?
3. BDD сценарии из `.feature` требуют предустановленных данных (Given-шаги с данными)?
4. Фича взаимодействует с внешними сервисами, требующими mock/stub на уровне теста?

- Если хотя бы 1 ответ ДА → `TEST_DATA=TEST_DATA_ACTIVE` → перейти к Шагу 6.2
- Если все ответы НЕТ → `TEST_DATA=TEST_DATA_NONE` → подсекции hooks/fixtures не требуются

## Step 6.1b: TEST_FORMAT Classification (test format)

Дефолт: `TEST_FORMAT=BDD` (для ВСЕХ языков). Escape hatch `TEST_FORMAT=UNIT` используется **только** когда установка BDD framework фактически невозможна — требует непустую `## Risks` секцию в DESIGN.md с обоснованием (иначе validator ERROR).

**НЕ классифицировать проект как "без BDD" как стабильное состояние.** Если framework ещё не установлен — это **remediation target** для Phase 0 bootstrap block, а не причина выбирать UNIT. Подробнее — [`bdd-enforcement.md`](bdd-enforcement.md).

## Step 6.1c: Framework Choice (только если TEST_FORMAT=BDD)

Использовать DetectionResult из Phase 1.5 Шаг 4a (`bdd-framework-detector` output):

- `framework ≠ null` → использовать detected framework, Evidence = positive grep-строка
- `framework === null` → выбрать из `suggestedFrameworks[]` (обычно первый), Evidence = "not installed in {projectPath} — remediation target (Phase 0 bootstrap block)"

**Записать в DESIGN.md `## BDD Test Infrastructure`:**

```
**Classification:** TEST_DATA_ACTIVE | TEST_DATA_NONE
**TEST_DATA:** TEST_DATA_ACTIVE | TEST_DATA_NONE
**TEST_FORMAT:** BDD | UNIT
**Framework:** Reqnroll | SpecFlow | Cucumber.js | Playwright BDD | Behave | pytest-bdd | N/A при UNIT
**Install Command:** {actual команда из DetectionResult.installCommand или "already installed"}
**Evidence:** {detector evidence строки или "grep {marker} in {path}:{line}" или reference на RESEARCH.md Existing Patterns}
**Verdict:** {какие hooks нужны / Phase 0 bootstrap требуется / hooks не требуются}
```

**Если TEST_DATA_NONE** → перейти к Шагу 7 (FILE_CHANGES.md). Подсекции hooks/cleanup/fixtures не заполнять.

## Step 6.2: Сканирование существующих hooks (ОБЯЗАТЕЛЬНО для TEST_DATA_ACTIVE)

Искать в проекте:

- `**/Hooks/**`, `**/hooks/**`, `**/support/**`
- `tests/**/hook*`, `tests/**/setup*`, `tests/**/teardown*`
- `tests/**/helpers*`, `tests/**/fixtures/**`
- Файлы с `Before`, `After`, `BeforeAll`, `AfterAll` в содержимом

Для каждого найденного файла заполнить таблицу в DESIGN.md:

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |

- Если hooks найдены → заполнить подсекцию `### Существующие hooks` с реальными путями
- Если hooks НЕ найдены → записать: `### Существующие hooks — Не найдены в проекте`

## Step 6.3: Проектирование hooks для этой фичи (ОБЯЗАТЕЛЬНО для TEST_DATA_ACTIVE)

Для каждого BDD сценария из `.feature`, который создаёт/изменяет данные:

1. Определить: какие данные создаются в Given/When
2. Определить: как откатить эти данные (API delete, DB rollback, file cleanup)
3. Если существующий hook подходит → указать `Reuse: {путь}`
4. Если нужен новый hook → спроектировать с указанием:
   - Путь к файлу hook-а (конкретный, не "TBD")
   - Тип: Before/After/BeforeAll/AfterAll
   - Scope: per-scenario / per-feature / global
   - Cleanup order (если каскадные зависимости)
   - По аналогии с каким существующим hook-ом

Заполнить в DESIGN.md:

- `### Новые hooks` — таблица с конкретными файлами и описанием
- `### Cleanup Strategy` — порядок удаления, каскадные зависимости
- `### Test Data & Fixtures` — lifecycle каждого fixture
- `### Shared Context / State Management` — ключи контекста

## Step 6.4: Валидация полноты (self-check)

Перед переходом к Шагу 7, проверить:

- [ ] Каждый Given-шаг из `.feature`, создающий данные, имеет cleanup hook
- [ ] Каждый новый hook указан в FILE_CHANGES.md (`create`)
- [ ] Каждый переиспользуемый hook указан в FILE_CHANGES.md (`edit` или reference)
- [ ] Cleanup Strategy покрывает все каскадные зависимости
- [ ] Shared Context ключи не конфликтуют с существующими

## Step 6.5: FIXTURES.md (если TEST_DATA_ACTIVE)

Если классификация TEST_DATA_ACTIVE → создать FIXTURES.md с детальной информацией:

- Перенести данные из DESIGN.md "Test Data & Fixtures" таблицы в развёрнутый формат
- Для каждой фикстуры: Type, Format, Setup, Teardown, Dependencies, Used by (`@featureN`)
- Заполнить Dependencies Graph и Gap Analysis
- В DESIGN.md добавить ссылку: `_Details: see [FIXTURES.md](FIXTURES.md)_`

Если TEST_DATA_NONE → FIXTURES.md оставить с placeholder-ами (опционально удалить).

## Связанные references

- [`bdd-enforcement.md`](bdd-enforcement.md) — BDD-default policy, Phase 0 bootstrap block
- [`phase1.5_project-context.md`](phase1.5_project-context.md) — Step 4a `bdd-framework-detector`
- [`phase3_finalization.md`](phase3_finalization.md) — Phase 0 hooks enforcement в TASKS.md
