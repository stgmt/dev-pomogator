# План работ

## 🎯 Context
Необходим валидатор структуры планов для обеспечения единого формата.

### Extracted Requirements
1. Валидатор проверяет наличие обязательных секций и их порядок
2. При ошибках выдаёт actionable hints с точными инструкциями по исправлению

## 👤 User Stories
- Как разработчик, я хочу автоматическую проверку структуры плана, чтобы не пропустить обязательные секции.

## 🔀 Use Cases
- UC-1: Пользователь запускает валидатор на корректном плане — получает OK.
- Edge cases: некорректная структура Todos, пустой File Changes, отсутствующие секции.

## 📐 Requirements

### FR (Functional Requirements)
- FR-1: Валидатор проверяет наличие 9 секций в правильном порядке и формат каждой секции.

### Acceptance Criteria (EARS)
- WHEN валидатор запускается на файле плана THEN система SHALL вернуть список структурных ошибок или OK с кодом 0.

### NFR (Non-Functional Requirements)
- Performance: валидация < 1 сек на файле до 500 строк
- Security: без сетевых вызовов, работа только с локальной файловой системой
- Reliability: ненулевой exit code при ошибках, fail-open при недоступности файла
- Usability: каждая ошибка содержит actionable hint с инструкцией по исправлению

### Assumptions
- N/A

## 🔧 Implementation Plan
1. Создать `validate-plan.ts` с функцией `validatePlanPhased()` — многофазная валидация секций, формата Todos и таблицы File Changes.
2. Добавить CLI wrapper с exit code 1 при ошибках и человеко-читаемым выводом ошибок вместе с хинтами по исправлению.

## 💥 Impact Analysis

> N/A — нет удалений/переименований

## 📋 Todos

---

### 📋 `implement-validator`

> Создать скрипт валидации структуры планов с поддержкой многофазной проверки и actionable hints

- **files:** `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` *(create)*
- **changes:**
  - Реализовать функцию `validateSections()` проверяющую наличие и порядок 9 обязательных секций с emoji-заголовками
  - Реализовать функцию `validateTodos()` проверяющую формат `### 📋 todo-id` блоков включая description, files, refs, changes, deps
- **refs:** FR-1, NFR-Usability
- **leverage:** `extensions/specs-workflow/tools/specs-generator/validate-spec.sh` *(паттерн CLI валидатора)*
- **deps:** *none*

---

## ✅ Definition of Done (DoD)
- Валидатор корректно сообщает обо всех структурных ошибках с actionable hints.

### Verification Plan
- Automated Tests:
  - `npx tsx extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts extensions/plan-pomogator/tools/plan-pomogator/fixtures/valid.plan.md`
- Manual Verification:
  - Запустить валидатор на заведомо битом плане и проверить наличие хинтов.

## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `extensions/plan-pomogator/tools/plan-pomogator/validate-plan.ts` | create | Скрипт многофазной валидации структуры планов с actionable hints для каждой ошибки. |
