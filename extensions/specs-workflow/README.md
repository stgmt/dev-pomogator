# specs-workflow Plugin

Комплексный плагин для управления спецификациями с 3-фазным workflow, автоматической валидацией и интеграцией с BDD.

## Возможности

- **3-фазный workflow** создания спецификаций (Discovery -> Requirements -> Finalization)
- **Specs Validator** - проверка покрытия `@featureN` тегов между MD и .feature файлами
- **Steps Validator** - проверка качества BDD step definitions (C#, TypeScript, Python)
- **PowerShell скрипты** для автоматизации работы со спеками
- **Хуки** для автоматической валидации в Cursor и Claude Code

## Компоненты

### Rules

| Platform | Location | Files |
|----------|----------|-------|
| Cursor | `.cursor/rules/` | `specs-management.mdc`, `dev-plan.mdc`, `research-workflow.mdc`, `specs-validation.mdc` |
| Claude Code | `.claude/rules/` | `specs-management.md`, `dev-plan.md`, `research-workflow.md`, `specs-validation.md` |

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

## Specs Validator

Автоматически проверяет синхронизацию между MD файлами и BDD сценариями через теги `@featureN`.

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
