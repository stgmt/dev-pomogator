# Specs Generator

Набор скриптов для автоматизации работы со спецификациями в папке `.specs/`.

## Обзор инструментов

```
.dev-pomogator/tools/specs-generator/
├── README.md              # Этот файл
├── scaffold-spec.ps1      # Создание структуры папки с шаблонами
├── validate-spec.ps1      # Валидация структуры и форматов
├── spec-status.ps1        # Отчёт о прогрессе заполнения
├── fill-template.ps1      # Заполнение плейсхолдеров в файле
├── list-specs.ps1         # Список всех спеков с их статусом
├── audit-spec.ps1         # Аудит кросс-ссылок и консистентности
├── analyze-features.ps1   # Анализ паттернов .feature файлов
├── logs/                  # Директория для логов (gitignore)
└── templates/             # Шаблоны файлов
```

## Быстрый старт

```powershell
# Создать новую спеку
.\.dev-pomogator\tools\specs-generator\scaffold-spec.ps1 -Name "my-feature"

# Проверить статус
.\.dev-pomogator\tools\specs-generator\spec-status.ps1 -Path ".specs/my-feature"

# Валидация
.\.dev-pomogator\tools\specs-generator\validate-spec.ps1 -Path ".specs/my-feature"

# Список всех спеков
.\.dev-pomogator\tools\specs-generator\list-specs.ps1

# Аудит кросс-ссылок
.\.dev-pomogator\tools\specs-generator\audit-spec.ps1 -Path ".specs/my-feature"

# Анализ паттернов .feature файлов (ПЕРЕД написанием .feature)
.\.dev-pomogator\tools\specs-generator\analyze-features.ps1 -Format text

# Анализ с поиском кандидатов
.\.dev-pomogator\tools\specs-generator\analyze-features.ps1 -FeatureSlug "my-feature" -Format text
```

## Скрипты

### scaffold-spec.ps1

Создаёт структуру папки `.specs/{feature-slug}/` со всеми шаблонами.

**Важно:** запускать внутри репозитория. Если repo root не найден, скрипт завершится с ошибкой и не создаст `.specs`.

```powershell
# Базовое использование
.\scaffold-spec.ps1 -Name "hook-worklog-checker"

# С указанием домена для .feature файла
.\scaffold-spec.ps1 -Name "hook-worklog-checker" -Domain "INF"

# Перезаписать существующую
.\scaffold-spec.ps1 -Name "hook-worklog-checker" -Force
```

**Параметры:**
- `-Name` (обязательный) — slug фичи в kebab-case
- `-Domain` — код домена (INF, PAY, AUTH...)
- `-Force` — перезаписать если существует
- `-Verbose` — подробный вывод
- `-Format json|text` — формат вывода (default: json)

**Exit codes:**
- 0 — успех
- 1 — папка уже существует
- 2 — неверный формат имени

---

### validate-spec.ps1

Проверяет структуру, форматы, плейсхолдеры в спеке.

```powershell
# Полная валидация
.\validate-spec.ps1 -Path ".specs/hook-worklog-checker"

# Только ошибки (без warnings)
.\validate-spec.ps1 -Path ".specs/hook-worklog-checker" -ErrorsOnly

# Текстовый вывод
.\validate-spec.ps1 -Path ".specs/hook-worklog-checker" -Format text
```

**Правила валидации:**
- `STRUCTURE` — наличие обязательных файлов
- `PLACEHOLDER` — незаполненные `{...}` плейсхолдеры
- `FR_FORMAT` — формат `## FR-N: {Название}` в FR.md
- `UC_FORMAT` — формат `## UC-N: {Название}` в USE_CASES.md
- `EARS_FORMAT` — WHEN/IF...THEN...SHALL в ACCEPTANCE_CRITERIA.md
- `NFR_SECTIONS` — секции Performance/Security/Reliability/Usability
- `FEATURE_NAMING` — формат `{DOMAIN}{NNN}_{Название}` в .feature
- `CONTEXT_SECTION` — секция `## Project Context & Constraints` в RESEARCH.md (Phase 1.5)
- `TDD_TASK_ORDER` — Phase 0 (BDD Foundation) или .feature задача в TASKS.md

**Exit codes:**
- 0 — валидация пройдена
- 1 — есть ошибки

---

### spec-status.ps1

Показывает прогресс заполнения спеки.

```powershell
# Полный статус
.\spec-status.ps1 -Path ".specs/hook-worklog-checker"

# Краткий формат
.\spec-status.ps1 -Path ".specs/hook-worklog-checker" -Brief
```

**Выводит:**
- Текущая фаза (Discovery, Requirements, Finalization)
- Подфаза (Context Analysis pending — если Discovery завершён, но `## Project Context & Constraints` в RESEARCH.md отсутствует)
- Процент прогресса
- Статус каждого файла (complete, partial, empty, not_created)
- Рекомендуемое следующее действие

---

### fill-template.ps1

Заполняет плейсхолдеры в конкретном файле.

```powershell
# Показать плейсхолдеры
.\fill-template.ps1 -File ".specs/my-feature/USER_STORIES.md" -ListPlaceholders

# Заполнить плейсхолдеры
.\fill-template.ps1 -File ".specs/my-feature/USER_STORIES.md" `
  -Values '{"роль": "разработчик", "цель": "автоматизировать процесс"}'
```

**Параметры:**
- `-File` (обязательный) — путь к файлу
- `-Values` — JSON с парами placeholder->value
- `-ListPlaceholders` — только показать плейсхолдеры

---

### list-specs.ps1

Показывает список всех спеков в репозитории.

```powershell
# Все спеки
.\list-specs.ps1

# Только незавершённые
.\list-specs.ps1 -Incomplete

# Фильтр по имени
.\list-specs.ps1 -Filter "zoho"
```

**Выводит:**
- Список спеков с их статусом
- Summary: total/complete/partial/empty

---

### audit-spec.ps1

Аудит кросс-ссылок и консистентности спецификации. Выполняет автоматические проверки и выдаёт список проблем для AI семантического анализа.

```powershell
# JSON формат (для AI агента)
.\audit-spec.ps1 -Path ".specs/my-feature"

# Текстовый формат (для человека)
.\audit-spec.ps1 -Path ".specs/my-feature" -Format text

# С подробным выводом
.\audit-spec.ps1 -Path ".specs/my-feature" -Format text -VerboseOutput
```

**Автоматические проверки:**
- `FR_AC_COVERAGE` — каждый FR-N имеет хотя бы один AC-N(FR-N)
- `FR_BDD_COVERAGE` — @featureN теги из FR/AC присутствуют в .feature
- `REQUIREMENTS_TRACEABILITY` — REQUIREMENTS.md ссылается на все FR-N
- `TASKS_FR_REFS` — TASKS.md содержит ссылки на FR/NFR
- `OPEN_QUESTIONS` — незакрытые `- [ ]` в RESEARCH.md
- `TERM_CONSISTENCY` — PascalCase/camelCase варианты одного термина

**Выходной формат JSON:**
- `findings` — массив находок с категорией, severity, сообщением
- `summary` — итоги по 5 категориям (ERRORS, LOGIC_GAPS, INCONSISTENCY, RUDIMENTS, FANTASIES)
- `ai_checks_pending` — список проверок для AI семантического анализа

**Exit codes:**
- 0 — всегда (report-only, не блокирует workflow)

---

### analyze-features.ps1

Анализирует все `.feature` файлы в проекте и выдаёт структурированный отчёт с паттернами. **Обязательно запускать ПЕРЕД написанием нового .feature файла** в Phase 2 specs workflow.

```powershell
# Полный отчёт (текст)
.\analyze-features.ps1 -Format text

# Поиск кандидатов по slug
.\analyze-features.ps1 -FeatureSlug "blind-receiving" -Format text

# Поиск по домену
.\analyze-features.ps1 -DomainCode "PLUGIN" -Format text

# Свободный поиск
.\analyze-features.ps1 -Query "shipment" -Format text

# JSON (для AI агента)
.\analyze-features.ps1 -Format json
```

**Параметры:**
- `-FeatureSlug` — фильтр кандидатов по slug
- `-DomainCode` — фильтр по domain code (CORE, PLUGIN)
- `-Query` — свободный поиск в Feature: lines
- `-VerboseOutput` — подробный лог
- `-Format json|text` — формат вывода (default: json)

**Секции отчёта:**
- **Step Dictionary** — все Given/When/Then шаги с частотой использования
- **Background Patterns** — переиспользуемые комбинации Background шагов
- **Naming Patterns** — domain codes, распределение, следующий свободный номер
- **Data Table Patterns** — какие колонки используются в таблицах (чтобы не добавлять лишние)
- **Setup vs Table** — что передаётся через Given step (entity setup), а что в таблице
- **Assertion Patterns** — формулировки Then шагов по типам (status, error, contains, data)
- **Candidates** — найденные похожие features (при фильтрации)
- **Recommendations** — предлагаемый Background, следующий domain number

**Exit codes:**
- 0 — всегда (report-only, не блокирует workflow)

---

## Логирование

Все скрипты пишут логи в `.dev-pomogator/tools/specs-generator/logs/`.

**Формат:** `[YYYY-MM-DD HH:mm:ss] [LEVEL] Message`

**Уровни:** INFO, WARN, ERROR

**Пример:**
```
[2026-01-15 10:30:00] [INFO] Creating spec folder: .specs/hook-worklog-checker
[2026-01-15 10:30:00] [INFO] Copying template: USER_STORIES.md.template -> USER_STORIES.md
[2026-01-15 10:30:01] [INFO] Created 14 files in .specs/hook-worklog-checker
```

---

## Структура спеки

Каждая спека содержит 13 файлов:

```
.specs/{feature-slug}/
├── README.md              # Overview, навигация
├── USER_STORIES.md        # User Stories
├── USE_CASES.md           # Use Cases (UC-1, UC-2...)
├── RESEARCH.md            # Исследование, технические находки
├── REQUIREMENTS.md        # Индекс требований
├── FR.md                  # Functional Requirements (FR-1...)
├── NFR.md                 # Non-Functional Requirements
├── ACCEPTANCE_CRITERIA.md # Критерии приёмки (EARS формат)
├── DESIGN.md              # Архитектура, компоненты, API
├── TASKS.md               # План задач с чеклистами
├── FILE_CHANGES.md        # Список изменяемых файлов
├── {feature-slug}.feature # BDD сценарии (Gherkin)
└── *_SCHEMA.md            # (опционально) Схемы данных
```

---

## Связанные правила

- `.cursor/rules/specs-management.mdc` — Cursor Rule для AI агента
- `.cursor/rules/plan-pomogator.mdc` — формат планов разработки
- `.cursor/rules/research-workflow.mdc` — workflow ресерча
