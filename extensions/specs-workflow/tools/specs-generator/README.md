# Specs Generator

Набор скриптов для автоматизации работы со спецификациями в папке `.specs/`.

## Обзор инструментов

```
tools/specs-generator/
├── README.md              # Этот файл
├── scaffold-spec.ps1      # Создание структуры папки с шаблонами
├── validate-spec.ps1      # Валидация структуры и форматов
├── spec-status.ps1        # Отчёт о прогрессе заполнения
├── fill-template.ps1      # Заполнение плейсхолдеров в файле
├── list-specs.ps1         # Список всех спеков с их статусом
├── logs/                  # Директория для логов (gitignore)
└── templates/             # Шаблоны файлов
```

## Быстрый старт

```powershell
# Создать новую спеку
.\tools\specs-generator\scaffold-spec.ps1 -Name "my-feature"

# Проверить статус
.\tools\specs-generator\spec-status.ps1 -Path ".specs/my-feature"

# Валидация
.\tools\specs-generator\validate-spec.ps1 -Path ".specs/my-feature"

# Список всех спеков
.\tools\specs-generator\list-specs.ps1
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

## Логирование

Все скрипты пишут логи в `tools/specs-generator/logs/`.

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
