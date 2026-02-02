# specs-workflow Plugin

Комплексный плагин для управления спецификациями с 3-фазным workflow, автоматической валидацией и интеграцией с BDD.

## Возможности

- **3-фазный workflow** создания спецификаций (Discovery -> Requirements -> Finalization)
- **Specs Validator** - проверка покрытия `@featureN` тегов между MD и .feature файлами
- **Steps Validator** - проверка качества BDD step definitions (C#, TypeScript, Python)
- **Research Workflow** - структурированный ресерч с верификацией гипотез
- **PowerShell скрипты** для автоматизации работы со спеками
- **Хуки** для автоматической валидации в Cursor и Claude Code

---

## Полный Workflow плагина

```
                                    ┌─────────────────────────────────────┐
                                    │         USER REQUEST                │
                                    │  "создай спеки для my-feature"      │
                                    └──────────────┬──────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                    /create-spec my-feature                                │
│                         scaffold-spec.ps1 → создаёт 13 файлов-шаблонов                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ▼                              ▼                              ▼
    ┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────────────┐
    │      PHASE 1: Discovery   │  │  PHASE 2: Requirements    │  │   PHASE 3: Finalization   │
    │                           │  │       + Design            │  │                           │
    │  ┌─────────────────────┐  │  │  ┌─────────────────────┐  │  │  ┌─────────────────────┐  │
    │  │  USER_STORIES.md    │  │  │  │  FR.md              │  │  │  │  TASKS.md           │  │
    │  │  (первый файл!)     │  │  │  │  NFR.md             │  │  │  │  FILE_CHANGES.md    │  │
    │  ├─────────────────────┤  │  │  │  ACCEPTANCE_CRITERIA│  │  │  │  README.md          │  │
    │  │  USE_CASES.md       │  │  │  │  REQUIREMENTS.md    │  │  │  │  (последний файл!)  │  │
    │  ├─────────────────────┤  │  │  ├─────────────────────┤  │  │  └─────────────────────┘  │
    │  │  RESEARCH.md        │◄─┼──┼──│  DESIGN.md          │  │  │                           │
    │  │  (research-workflow)│  │  │  │  SCHEMA.md          │  │  │                           │
    │  └─────────────────────┘  │  │  │  *.feature (BDD)    │  │  │                           │
    │                           │  │  └─────────────────────┘  │  │                           │
    │         ┌─────────┐       │  │         ┌─────────┐       │  │         ┌─────────┐       │
    │         │ STOP #1 │       │  │         │ STOP #2 │       │  │         │ STOP #3 │       │
    │         │ confirm │       │  │         │ confirm │       │  │         │  final  │       │
    │         └─────────┘       │  │         └─────────┘       │  │         └─────────┘       │
    └───────────────────────────┘  └───────────────────────────┘  └───────────────────────────┘
                    │                              │                              │
                    └──────────────────────────────┼──────────────────────────────┘
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              SPEC COMPLETE (13 files)                                     │
│                    validate-spec.ps1 → проверяет форматы и структуру                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                    ┌──────────────────────────────┴──────────────────────────────┐
                    │                                                             │
                    ▼                                                             ▼
    ┌───────────────────────────────────────┐             ┌───────────────────────────────────────┐
    │         SPECS VALIDATOR               │             │         STEPS VALIDATOR               │
    │    (beforeSubmitPrompt hook)          │             │           (Stop hook)                 │
    │                                       │             │                                       │
    │  Проверяет @featureN теги:            │             │  Проверяет качество step definitions: │
    │  ┌─────────────────────────────────┐  │             │  ┌─────────────────────────────────┐  │
    │  │ FR.md @feature1 ────────────┐   │  │             │  │ C# (Reqnroll/SpecFlow)          │  │
    │  │ ACCEPTANCE_CRITERIA @feature1│   │  │             │  │ TypeScript (Cucumber/Playwright)│  │
    │  │ USE_CASES.md @feature1 ─────│───┼──┼─► .feature  │  │ Python (Behave/pytest-bdd)      │  │
    │  │ TASKS.md @feature1 ─────────┘   │  │             │  └─────────────────────────────────┘  │
    │  └─────────────────────────────────┘  │             │                                       │
    │                                       │             │  ┌─────────────────────────────────┐  │
    │  Output:                              │             │  │ Then step + Assert.* = GOOD     │  │
    │  - validation-report.md               │             │  │ Then step + empty = BAD         │  │
    │  - stdout warnings                    │             │  │ TODO/STUBBED = WARNING          │  │
    └───────────────────────────────────────┘             │  └─────────────────────────────────┘  │
                                                          │                                       │
                                                          │  Output:                              │
                                                          │  - steps-validation-report.md         │
                                                          │  - stdout warnings                    │
                                                          └───────────────────────────────────────┘
```

---

## Research Workflow (интегрирован в PHASE 1)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              RESEARCH WORKFLOW                                       │
│                       Триггер: "исследуй", "ресерч", "найди"                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                           │
           ┌───────────────────────────────┼───────────────────────────────┐
           │                               │                               │
           ▼                               ▼                               ▼
┌─────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────┐
│   ФАЗА 1: Уточнение │     │   ФАЗА 2: Исследование      │     │  ФАЗА 3: Верификация│
│                     │     │                             │     │                     │
│  Предложить 5       │     │  1. Проверить локальный код │     │  Каждую гипотезу    │
│  вариантов          │     │  2. MCP: Context7, octocode │     │  проверить через    │
│  направлений        │     │  3. Web Search (3 попытки)  │     │  3+ источников      │
│                     │     │  4. Сформировать гипотезы   │     │                     │
│  Ждать выбора       │     │                             │     │  Приоритет:         │
│  пользователя       │     │                             │     │  1. Context7 (docs) │
└─────────────────────┘     └─────────────────────────────┘     │  2. GitHub Code     │
                                                                │  3. Web Search      │
                                                                └─────────────────────┘
                                                                           │
                                                                           ▼
                                                          ┌─────────────────────────────────┐
                                                          │       ФАЗА 4: Отчёт             │
                                                          │                                 │
                                                          │  - Верифицированные гипотезы   │
                                                          │  - Ключевые пруфы с цитатами   │
                                                          │  - Ограничения                 │
                                                          │  - Рекомендации                │
                                                          │                                 │
                                                          │  → Сохранить в RESEARCH.md     │
                                                          └─────────────────────────────────┘
```

---

## Компоненты

### Rules

| Platform | Location | Files |
|----------|----------|-------|
| Cursor | `.cursor/rules/` | `specs-management.mdc`, `no-mocks-fallbacks.mdc`, `dev-plan.mdc`, `research-workflow.mdc`, `specs-validation.mdc` |
| Claude Code | `.claude/rules/` | `specs-management.md`, `no-mocks-fallbacks.md`, `dev-plan.md`, `research-workflow.md`, `specs-validation.md` |

Дополнительно:
- `.feature` для спеков создаются на основе существующих feature/fixtures/steps; при отсутствии `Background` добавляется hook‑фикстура на основе существующих шагов
- Правило `no-mocks-fallbacks` запрещает моки/фолбеки и требует явных исключений

### Tools

| Tool | Location | Description |
|------|----------|-------------|
| specs-generator | `tools/specs-generator/` | PowerShell скрипты + 13 шаблонов |
| specs-validator | `tools/specs-validator/` | Валидация покрытия @featureN тегов |
| steps-validator | `tools/steps-validator/` | Валидация качества step definitions |

### Commands

| Command | Description |
|---------|-------------|
| `/create-spec <name>` | Создать структуру спецификации |

### Hooks

| Event | Cursor | Claude | Validator |
|-------|--------|--------|-----------|
| Before prompt | `beforeSubmitPrompt` | `UserPromptSubmit` | specs-validator |
| After completion | `Stop` | `Stop` | steps-validator |

---

## Dev Plan Format (правило dev-plan)

Формат планов разработки, активируемый в Plan mode или по запросу "plan/спека/roadmap".

### Обязательные секции плана

| # | Секция | Содержание |
|---|--------|------------|
| 1 | **User Stories** | "Как {роль}, я хочу {цель}, чтобы {ценность}" |
| 2 | **Use Cases** | Happy path + edge cases |
| 3 | **Requirements** | FR + NFR + Acceptance Criteria (EARS формат) |
| 4 | **Implementation Plan** | Пошаговый план + Leverage (что переиспользуем) |
| 5 | **Todos** | Atomic tasks (1-3 файла, 15-30 мин, 1 outcome) |
| 6 | **Definition of Done** | Критерии готовности + Verification Plan |
| 7 | **File Changes** | Таблица Path/Action/Reason (ОБЯЗАТЕЛЬНО в конце!) |

### EARS формат (Acceptance Criteria)

```
WHEN [event] THEN [system] SHALL [response]
IF [precondition] THEN [system] SHALL [response]
WHEN [event] AND [condition] THEN [system] SHALL [response]
```

### NFR категории (минимум)

- **Performance** - время отклика, throughput
- **Security** - авторизация, шифрование
- **Reliability** - fault tolerance, recovery
- **Usability** - UX, accessibility

### Todo формат

```markdown
- [ ] **todo-id**: Описание задачи
  - _files_: `path/to/file.ts` (create/edit/delete)
  - _Requirements refs_: FR-1, NFR-Security-2
  - _Leverage_: `existing/module.ts`
```

---

## Specs Validator

Автоматически проверяет синхронизацию между MD файлами и BDD сценариями через теги `@featureN`.

### Как работает

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SPECS VALIDATOR FLOW                                        │
│                    Хук: beforeSubmitPrompt (Cursor) / UserPromptSubmit (Claude)         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  1. FIND .specs/ FOLDER       │
                              │     Ищет папку .specs/ в      │
                              │     workspace_roots           │
                              └───────────────┬───────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  2. CHECK COMPLETENESS        │
                              │     Для каждой поддиректории: │
                              │     - 12 MD файлов?           │
                              │     - 1+ .feature файл?       │
                              │     = "Полная фича"           │
                              └───────────────┬───────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │ Только ПОЛНЫЕ фичи                                │
                    ▼                                                   ▼
    ┌───────────────────────────────────┐       ┌───────────────────────────────────┐
    │  3a. PARSE MD FILES               │       │  3b. PARSE .FEATURE FILES         │
    │                                   │       │                                   │
    │  Файлы:                           │       │  Ищет:                            │
    │  - FR.md                          │       │  - # @featureN                    │
    │  - ACCEPTANCE_CRITERIA.md         │       │  - Scenario: название             │
    │  - USE_CASES.md                   │       │                                   │
    │  - TASKS.md                       │       │  Результат:                       │
    │                                   │       │  { tag: "@feature1",              │
    │  Regex: /@feature\d+/             │       │    scenario: "User can login" }   │
    │                                   │       │                                   │
    │  Результат:                       │       │                                   │
    │  { tag: "@feature1",              │       │                                   │
    │    source: "FR.md",               │       │                                   │
    │    line: 15,                      │       │                                   │
    │    text: "FR-1: Авторизация" }    │       │                                   │
    └───────────────┬───────────────────┘       └───────────────┬───────────────────┘
                    │                                           │
                    └─────────────────────┬─────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────────────┐
                          │  4. MATCH TAGS                        │
                          │                                       │
                          │  MD Tags          .feature Tags       │
                          │  ─────────        ─────────────       │
                          │  @feature1   ◄──► @feature1 ✓ COVERED │
                          │  @feature2   ──── (нет)    ✗ NOT_COVERED
                          │  (нет)       ◄─── @feature3 ⚠ ORPHAN  │
                          └───────────────────┬───────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
                    ▼                                                   ▼
    ┌───────────────────────────────────┐       ┌───────────────────────────────────┐
    │  5a. GENERATE REPORT              │       │  5b. PRINT WARNINGS               │
    │                                   │       │                                   │
    │  Файл:                            │       │  stdout:                          │
    │  .specs/{feature}/                │       │                                   │
    │    validation-report.md           │       │  ⚠ NOT_COVERED: @feature2         │
    │                                   │       │    FR.md:15 - FR-1: Авторизация   │
    │  Содержит:                        │       │    → Добавьте # @feature2 в       │
    │  - Summary (covered/total)        │       │      .feature файл                │
    │  - NOT_COVERED list               │       │                                   │
    │  - ORPHAN list                    │       │  ⚠ ORPHAN: @feature3              │
    │  - Recommendations                │       │    login.feature - Scenario X     │
    └───────────────────────────────────┘       │    → Нет записи в MD файлах       │
                                                └───────────────────────────────────┘
```

### Когда срабатывает

- **Cursor**: хук `beforeSubmitPrompt` (перед каждым промптом)
- **Claude**: хук `UserPromptSubmit` (перед каждым промптом)

### Структура полной фичи

Валидация запускается только для **полных** фич, содержащих все 13 файлов:

```
.specs/{feature}/
├── ACCEPTANCE_CRITERIA.md   # Критерии приёмки
├── CHANGELOG.md             # История изменений
├── DESIGN.md                # Архитектура и дизайн
├── FILE_CHANGES.md          # Таблица изменений файлов
├── FR.md                    # Функциональные требования
├── NFR.md                   # Нефункциональные требования
├── README.md                # Обзор фичи
├── REQUIREMENTS.md          # Сводка требований
├── RESEARCH.md              # Исследования
├── SCHEMA.md                # Схемы данных
├── TASKS.md                 # Задачи
├── USE_CASES.md             # Сценарии использования
├── USER_STORIES.md          # Пользовательские истории
└── *.feature                # BDD сценарии (Gherkin)
```

### Использование тегов @featureN

**В MD файлах (FR.md, ACCEPTANCE_CRITERIA.md, USE_CASES.md, TASKS.md):**

```markdown
## FR-1: Авторизация пользователя @feature1
## AC-1 (FR-1): Успешный логин @feature1
```

**В .feature файлах:**

```gherkin
# @feature1
Scenario: User can login with valid credentials
  Given user is on login page
  When user enters valid credentials
  Then user sees dashboard
```

### Типы проблем

| Проблема | Описание | Действие |
|----------|----------|----------|
| NOT_COVERED | `@featureN` в MD без сценария в .feature | Добавить `# @featureN` перед Scenario |
| ORPHAN | `@featureN` в .feature без записи в MD | Добавить `@featureN` в FR/AC/UC файл |

### Конфигурация

Создайте `.specs-validator.yaml` в корне проекта:

```yaml
# Отключить валидацию
enabled: false

# Уровень серьёзности (warn/error)
severity: warn

# Игнорировать спеки
ignore:
  - legacy-feature
  - experimental/*
```

### Выходные данные

- **stdout**: предупреждения о NOT_COVERED и ORPHAN тегах
- **файл**: `.specs/{feature}/validation-report.md` в каждой полной фиче

---

## Steps Validator

Проверяет качество BDD step definitions, находя пустые, pending и заглушечные шаги.

### Как работает

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              STEPS VALIDATOR FLOW                                        │
│                              Хук: Stop (Cursor / Claude)                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │  1. DETECT LANGUAGE           │
                              │                               │
                              │  Ищет файлы:                  │
                              │  *.Steps.cs → C#              │
                              │  *.steps.ts → TypeScript      │
                              │  *_steps.py → Python          │
                              └───────────────┬───────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
    ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
    │   C# PARSER           │ │   TypeScript PARSER   │ │   Python PARSER       │
    │                       │ │                       │ │                       │
    │ Атрибуты:             │ │ Декораторы:           │ │ Декораторы:           │
    │ [Given(@"...")]       │ │ Given("...")          │ │ @given("...")         │
    │ [When(@"...")]        │ │ When("...")           │ │ @when("...")          │
    │ [Then(@"...")]        │ │ Then("...")           │ │ @then("...")          │
    │ [StepDefinition]      │ │                       │ │                       │
    │                       │ │ Playwright:           │ │ pytest-bdd:           │
    │ Фреймворки:           │ │ test.step()           │ │ @scenario()           │
    │ Reqnroll, SpecFlow    │ │ expect()              │ │                       │
    └───────────┬───────────┘ └───────────┬───────────┘ └───────────┬───────────┘
                │                         │                         │
                └─────────────────────────┼─────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────────────┐
                          │  2. EXTRACT STEP INFO                 │
                          │                                       │
                          │  Для каждого step definition:         │
                          │  ┌─────────────────────────────────┐  │
                          │  │ type: "Then"                    │  │
                          │  │ pattern: "user sees dashboard"  │  │
                          │  │ methodName: "ThenUserSees..."   │  │
                          │  │ body: "{ Assert.True(...) }"    │  │
                          │  │ file: "LoginSteps.cs"           │  │
                          │  │ line: 45                        │  │
                          │  └─────────────────────────────────┘  │
                          └───────────────────┬───────────────────┘
                                              │
                                              ▼
                          ┌───────────────────────────────────────┐
                          │  3. ANALYZE QUALITY                   │
                          │                                       │
                          │  ┌─────────────────────────────────┐  │
                          │  │ Step Type = Then?               │  │
                          │  │      │                          │  │
                          │  │      ├─ YES ──► Требует assertion│  │
                          │  │      │                          │  │
                          │  │      └─ NO ───► Setup/Action OK │  │
                          │  └─────────────────────────────────┘  │
                          │                                       │
                          │  And/But наследует от предыдущего:    │
                          │  Given → And = Given (OK без assert)  │
                          │  Then → And = Then (требует assert)   │
                          └───────────────────┬───────────────────┘
                                              │
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │  4. CHECK PATTERNS                                                                   │
    │                                                                                      │
    │  ┌─────────────────────────────┐  ┌─────────────────────────────┐                   │
    │  │  ✅ ASSERTION PATTERNS      │  │  ❌ BAD PATTERNS            │                   │
    │  │                             │  │                             │                   │
    │  │  Assert.Equal(...)          │  │  throw PendingStepException │                   │
    │  │  Assert.True/False/NotNull  │  │  throw NotImplementedException                 │
    │  │  .Should().Be(...)          │  │  ScenarioContext.Pending()  │                   │
    │  │  expect(...).toBe(...)      │  │  { } (пустое тело)          │                   │
    │  │  throw InvalidOperationEx   │  │  return; (только return)   │                   │
    │  │  if (...) throw ...         │  │  pass (Python)              │                   │
    │  │  WaitForSelectorAsync       │  │                             │                   │
    │  │  ThenMethodCall()           │  │  ⚠️ WARNING PATTERNS        │                   │
    │  │                             │  │  // TODO: ...               │                   │
    │  │  Python:                    │  │  // FIXME: ...              │                   │
    │  │  assert ...                 │  │  "STUBBED"                  │                   │
    │  │  pytest.raises(...)         │  │  "SKIPPED"                  │                   │
    │  └─────────────────────────────┘  └─────────────────────────────┘                   │
    │                                                                                      │
    │  Логика для Then steps:                                                             │
    │  ┌──────────────────────────────────────────────────────────────────────────────┐   │
    │  │ hasAssertion?  hasBadPattern?  hasWarning?  →  Status                        │   │
    │  │ ────────────   ─────────────   ───────────     ──────                        │   │
    │  │ YES            NO              NO           →  ✅ GOOD                        │   │
    │  │ NO             YES             *            →  ❌ BAD                         │   │
    │  │ NO             NO              NO           →  ❌ BAD (no assertion)          │   │
    │  │ YES            NO              YES          →  ⚠️ WARNING                     │   │
    │  │ NO             NO              YES          →  ⚠️ WARNING                     │   │
    │  └──────────────────────────────────────────────────────────────────────────────┘   │
    │                                                                                      │
    │  Console.WriteLine в Then:                                                          │
    │  ┌──────────────────────────────────────────────────────────────────────────────┐   │
    │  │ Console.WriteLine + Assert.* = ✅ GOOD (лог + проверка)                      │   │
    │  │ Console.WriteLine + throw    = ✅ GOOD (лог + проверка)                      │   │
    │  │ Console.WriteLine ONLY       = ❌ BAD  (только лог, нет проверки!)           │   │
    │  └──────────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
                    ▼                                                   ▼
    ┌───────────────────────────────────┐       ┌───────────────────────────────────┐
    │  5a. GENERATE REPORT              │       │  5b. PRINT WARNINGS               │
    │                                   │       │                                   │
    │  Файл:                            │       │  stdout:                          │
    │  steps-validation-report.md       │       │                                   │
    │  (в корне проекта)                │       │  ❌ BAD: ThenUserSeesSuccess      │
    │                                   │       │     LoginSteps.cs:45              │
    │  Содержит:                        │       │     Pattern: "user sees success"  │
    │  - Summary (good/bad/warning)     │       │     Issue: No assertion found     │
    │  - BAD steps list                 │       │                                   │
    │  - WARNING steps list             │       │  ⚠️ WARNING: ThenDataIsSaved      │
    │  - File links                     │       │     DataSteps.cs:78               │
    │  - Recommendations                │       │     Issue: Contains TODO          │
    └───────────────────────────────────┘       └───────────────────────────────────┘
```

### Когда срабатывает

- **Cursor/Claude**: хук `Stop` (после завершения работы агента)

### Поддерживаемые языки

| Язык | Фреймворки | Файлы |
|------|------------|-------|
| C# | Reqnroll, SpecFlow | `*Steps.cs`, `*StepDefinitions.cs` |
| TypeScript | Cucumber.js, Playwright BDD | `*.steps.ts`, `*.spec.ts` |
| Python | Behave, pytest-bdd | `steps_*.py`, `*_steps.py` |

### Типы проблем

| Статус | Описание | Примеры |
|--------|----------|---------|
| BAD | Шаг без реальной проверки | `throw new PendingStepException()`, пустое тело, `NotImplementedException` |
| WARNING | Потенциальная проблема | `// TODO`, `STUBBED`, `SKIPPED` |
| GOOD | Шаг с assertions | `Assert.*`, `.Should()`, `throw new InvalidOperationException()` |

### Логика валидации

```
Step Type    Требования
─────────    ──────────
Then         ОБЯЗАТЕЛЬНО assertion (Assert.*, throw check, .Should())
Given        Допускается setup без проверок
When         Допускается action без проверок
And/But      Наследует строгость от предыдущего шага
```

> **Важно:** `Console.WriteLine` сам по себе НЕ является проблемой.
> Проблема только если это `Then` шаг и **кроме логов ничего нет**.

### Конфигурация

Создайте `.steps-validator.yaml` в корне проекта:

```yaml
enabled: true

# Добавить свои assertion паттерны
custom_assertions:
  csharp:
    - 'MyCustomAssert\.'
    - 'Verify\('

# Игнорировать файлы
ignore:
  - '**/Generated/**'
  - '**/*Mock*.cs'

# Строгость проверки
strictness:
  Then: high
  Given: low
  When: low
```

### Выходные данные

- **stdout**: предупреждения о BAD и WARNING шагах
- **файл**: `steps-validation-report.md` в корне проекта

### Документация паттернов

Подробное описание паттернов для C#: [CSHARP_PATTERNS.md](tools/steps-validator/docs/CSHARP_PATTERNS.md)

---

## 3-фазный Workflow

### Фазы

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   1. Discovery  │ --> │ 2. Requirements +    │ --> │ 3. Finalization │
│                 │     │    Design            │     │                 │
│ - USER_STORIES  │     │ - FR, NFR            │     │ - TASKS         │
│ - USE_CASES     │     │ - ACCEPTANCE_CRITERIA│     │ - FILE_CHANGES  │
│ - RESEARCH      │     │ - DESIGN             │     │ - README        │
│                 │     │ - SCHEMA             │     │                 │
└────────┬────────┘     └──────────┬───────────┘     └────────┬────────┘
         │                         │                          │
      STOP #1                   STOP #2                    STOP #3
   (подтверждение)          (подтверждение)            (финал)
```

### STOP Points

1. **STOP #1** - после Discovery: подтверждение scope и user stories
2. **STOP #2** - после Requirements: подтверждение дизайна и архитектуры
3. **STOP #3** - после Finalization: финальный review перед реализацией

---

## PowerShell скрипты

| Script | Description | Usage |
|--------|-------------|-------|
| `scaffold-spec.ps1` | Создать структуру спека | `.\scaffold-spec.ps1 -Name my-feature` |
| `validate-spec.ps1` | Валидировать формат | `.\validate-spec.ps1 -Path .specs/my-feature` |
| `spec-status.ps1` | Показать прогресс | `.\spec-status.ps1 -Path .specs/my-feature` |
| `fill-template.ps1` | Заполнить placeholder'ы | `.\fill-template.ps1 -Template FR.md -Values @{name="..."}`|
| `list-specs.ps1` | Список всех спеков | `.\list-specs.ps1` |

---

## Использование

### Создать новый спек

```
/create-spec my-feature
```

Создаст `.specs/my-feature/` со всеми 13 файлами-шаблонами.

### Проверить статус спека

```powershell
.\tools\specs-generator\spec-status.ps1 -Path ".specs/my-feature"
```

### Валидировать спек

```powershell
.\tools\specs-generator\validate-spec.ps1 -Path ".specs/my-feature"
```

### Запустить steps-validator вручную

```bash
npx tsx ~/.dev-pomogator/scripts/steps-validator/validate-steps.ts /path/to/project
```

### Запустить specs-validator вручную

```bash
echo '{"workspace_roots": ["/path/to/project"]}' | npx tsx ~/.dev-pomogator/scripts/specs-validator/validate-specs.ts
```

---

## Правила валидации спецификаций

| Правило | Описание | Severity |
|---------|----------|----------|
| STRUCTURE | Наличие всех 13 обязательных файлов | ERROR |
| PLACEHOLDER | Незаполненные плейсхолдеры `{...}` | WARNING |
| FR_FORMAT | Формат `## FR-N: {Название}` | ERROR |
| UC_FORMAT | Формат `## UC-N: {Название}` | ERROR |
| EARS_FORMAT | WHEN/IF...THEN...SHALL | WARNING |
| NFR_SECTIONS | Performance/Security/Reliability/Usability | WARNING |
| FEATURE_NAMING | `{DOMAIN}{NNN}_{название}.feature` | WARNING |

---

## Триггеры и команды

### Specs Management

| Триггер (RU) | Триггер (EN) | Действие |
|--------------|--------------|----------|
| "создай спеки" | "create specs" | Создать новую спецификацию |
| "обнови спеки" | "update specs" | Редактировать существующую |
| "покажи спеки" | "show specs" | Просмотр спецификации |
| "статус спеков" | "specs status" | Отчёт о прогрессе |

### Research Workflow

| Триггер (RU) | Триггер (EN) | Действие |
|--------------|--------------|----------|
| "исследуй" | "research" | Запустить ресерч workflow |
| "найди" | "find" | Поиск информации |
| "погугли" | "google" | Web search |

### Dev Plan

| Триггер | Действие |
|---------|----------|
| Plan mode активен | Генерировать план в полном формате |
| "план для..." | Создать план разработки |
| "спека для..." | Создать план + спецификацию |

---

## Установка

### Все плагины (по умолчанию)

```bash
npx dev-pomogator --cursor
npx dev-pomogator --claude
```

### Только этот плагин

```bash
npx dev-pomogator --cursor --plugins=specs-workflow
npx dev-pomogator --claude --plugins=specs-workflow
```

---

## Файловая структура плагина

```
extensions/specs-workflow/
├── extension.json              # Манифест плагина
├── README.md                   # Эта документация
├── cursor/
│   ├── commands/
│   │   └── create-spec.md      # Команда /create-spec
│   └── rules/
│       ├── specs-management.mdc
│       ├── dev-plan.mdc
│       ├── research-workflow.mdc
│       └── specs-validation.mdc
├── claude/
│   ├── commands/
│   │   └── create-spec.md
│   └── rules/
│       ├── specs-management.md
│       ├── dev-plan.md
│       ├── research-workflow.md
│       └── specs-validation.md
└── tools/
    ├── specs-generator/        # PowerShell автоматизация
    │   ├── *.ps1               # Скрипты
    │   └── templates/          # 13 шаблонов
    ├── specs-validator/        # Валидатор @featureN тегов
    │   ├── validate-specs.ts   # Entry point
    │   ├── completeness.ts     # Проверка полноты фичи
    │   ├── matcher.ts          # Matching тегов
    │   ├── reporter.ts         # Генерация отчёта
    │   └── parsers/
    │       ├── md-parser.ts    # Парсер MD файлов
    │       └── feature-parser.ts
    └── steps-validator/        # Валидатор step definitions
        ├── validate-steps.ts   # Entry point
        ├── analyzer.ts         # Анализ качества
        ├── detector.ts         # Детекция языка
        ├── reporter.ts         # Генерация отчёта
        ├── parsers/
        │   ├── csharp-parser.ts
        │   ├── typescript-parser.ts
        │   └── python-parser.ts
        └── docs/
            └── CSHARP_PATTERNS.md
```
