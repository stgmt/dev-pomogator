# Specs Management - Управление спецификациями

## Когда применять

Пользователь просит:
- **RU:** "создай спеки", "обнови спеки", "спецификация для...", "покажи спеки", "статус спеков"
- **EN:** "create specs", "update specs", "spec for...", "show specs", "specs status"

---

## Структура спецификации

Каждая спека располагается в `.specs/{feature-slug}/` и содержит 13 файлов:

```
.specs/{feature-slug}/
├── README.md              # Overview, навигация (создаётся ПОСЛЕДНИМ)
├── USER_STORIES.md        # User Stories (создаётся ПЕРВЫМ)
├── USE_CASES.md           # Use Cases (UC-1, UC-2...)
├── RESEARCH.md            # Исследование, технические находки
├── REQUIREMENTS.md        # Индекс требований (ссылки на FR/NFR/AC)
├── FR.md                  # Functional Requirements (FR-1, FR-2...)
├── NFR.md                 # Non-Functional Requirements
├── ACCEPTANCE_CRITERIA.md # Критерии приёмки (EARS формат)
├── DESIGN.md              # Архитектура, компоненты, API
├── TASKS.md               # План задач с чеклистами
├── FILE_CHANGES.md        # Список изменяемых файлов
├── CHANGELOG.md           # Changelog (Keep-a-Changelog)
├── {feature-slug}.feature # BDD сценарии (Gherkin)
└── *_SCHEMA.md            # (опционально) Схемы данных
```

---

## Инструменты автоматизации

### Скрипты

| Скрипт | Назначение | Пример |
|--------|------------|--------|
| `scaffold-spec.ps1` | Создание структуры | `.\tools\specs-generator\scaffold-spec.ps1 -Name "my-feature"` |
| `validate-spec.ps1` | Валидация форматов | `.\tools\specs-generator\validate-spec.ps1 -Path ".specs/my-feature"` |
| `spec-status.ps1` | Отчёт о прогрессе | `.\tools\specs-generator\spec-status.ps1 -Path ".specs/my-feature"` |
| `fill-template.ps1` | Заполнение плейсхолдеров | `.\tools\specs-generator\fill-template.ps1 -File "..." -ListPlaceholders` |
| `list-specs.ps1` | Список всех спеков | `.\tools\specs-generator\list-specs.ps1` |

### Документация скриптов

Полная документация: `tools/specs-generator/README.md`

---

## Workflow создания (3 СТОП-точки)

### PHASE 1: Discovery

**Файлы:** USER_STORIES.md, USE_CASES.md, RESEARCH.md

**Алгоритм:**
1. Создать структуру: `.\tools\specs-generator\scaffold-spec.ps1 -Name "{feature}"`
2. Опросить пользователя о целях и ролях
3. Заполнить USER_STORIES.md
4. Заполнить USE_CASES.md
5. Заполнить RESEARCH.md (если нужен ресерч)
6. Проверить статус: `.\tools\specs-generator\spec-status.ps1 -Path ".specs/{feature}"`

**СТОП #1:** Показать результаты Discovery, спросить подтверждение.

---

### PHASE 2: Requirements + Design

**Файлы:** REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, *.feature

**Алгоритм:**
1. Заполнить FR.md (формат: ## FR-N: {Название})
2. Заполнить NFR.md (секции: Performance, Security, Reliability, Usability)
3. Заполнить ACCEPTANCE_CRITERIA.md (EARS формат)
4. Заполнить REQUIREMENTS.md (индекс ссылок)
5. Заполнить DESIGN.md
6. Заполнить FILE_CHANGES.md
7. Создать {feature-slug}.feature (по правилам ниже)
8. Валидация: `.\tools\specs-generator\validate-spec.ps1 -Path ".specs/{feature}"`
9. Исправить ошибки если есть

**СТОП #2:** Показать Requirements + Design, спросить подтверждение.

---

## Правила создания .feature (без отрыва от реальности)

### 1) Сначала искать существующие .feature

Искать в:
- `tests/features/**`
- `.specs/**`

Приоритет соответствия:
1. Совпадение кода `DOMAINNNN_` в имени файла (например, `CORE001_`, `PLUGIN003_`)
2. Совпадение с `feature-slug` в имени файла
3. Совпадение по строке `Feature:` внутри файла

Если найден один кандидат — используй его как основу:
- Сохраняй формулировки шагов без «перепридумывания»
- Добавь `# @featureN` к нужным сценариям
- Явно укажи источник вверху файла, например: `# Source: tests/features/...`

Если кандидатов несколько — выбери по приоритету и перечисли все варианты в комментарии `# Candidates: ...`.

### 2) Background hook‑фикстура

Если в выбранном `.feature` нет `Background`, добавь его:
- Используй **существующие** формулировки шагов (не выдумывай новые)
- Источники формулировок:
  - `tests/features/**`
  - `tests/fixtures/steps-validator/**` (реальные шаги для валидатора)
  - `shared/hooks/hooks.json` (для понимания доступных хуков)

Примеры реальных Background из решения (можно переиспользовать дословно):
- `Given dev-pomogator is installed`
- `And specs-workflow extension is enabled`
- `Given the specs-generator scripts are installed`

Если `Background` уже есть — используй существующий без замены.

### 3) Нет кандидатов .feature

Если подходящих `.feature` нет:
- Используй шаблон, но **все шаги** бери из существующих feature/fixtures/steps
- Пометь файл как черновик (`# DRAFT`) и укажи, на какие источники опирался

---

### PHASE 3: Finalization

**Файлы:** TASKS.md, README.md

**Алгоритм:**
1. Заполнить TASKS.md
2. Сгенерировать README.md
3. Финальная валидация

**СТОП #3:** Финальный отчёт со summary.

---

## Операции с существующими спеками

### READ: Просмотр спеков
Триггер: "покажи спеки для X" / "show specs for X"

### UPDATE: Редактирование спеков
Триггер: "обнови спеки для X" / "update specs for X"

### STATUS: Проверка прогресса
Триггер: "статус спеков" / "specs status"

---

## Правила валидации

| Правило | Описание | Severity |
|---------|----------|----------|
| STRUCTURE | Наличие обязательных файлов | ERROR |
| PLACEHOLDER | Незаполненные плейсхолдеры | WARNING |
| FR_FORMAT | Формат ## FR-N: {Название} | ERROR |
| UC_FORMAT | Формат ## UC-N: {Название} | ERROR |
| EARS_FORMAT | WHEN/IF...THEN...SHALL | WARNING |
| NFR_SECTIONS | Performance/Security/Reliability/Usability | WARNING |
| FEATURE_NAMING | {DOMAIN}{NNN}_{Название} | WARNING |

---

## Связанные правила

- `plan-pomogator.md` — использует EARS формат из спеков
- `research-workflow.md` — интегрируется с RESEARCH.md

## Эталонная структура

Референс: `.specs/hook-worklog-checker/`
