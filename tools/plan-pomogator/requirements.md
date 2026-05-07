# Plan-pomogator — Требования

## Цель
Задать единый и проверяемый формат планов: структура, формат секций и минимальные правила валидности.

## Область применения
- Plan mode или явный запрос на план/roadmap/таски.
- Требования касаются **формы и структуры** плана, а не доменной корректности.

## Обязательная структура (порядок секций)
0. **Простыми словами** — ОБЯЗАТЕЛЬНО первая секция (перед Context). Top-level секция для human review с тремя подсекциями: `### Сейчас (как работает)`, `### Как должно быть (как я понял)`, `### Правильно понял?`. Содержимое — живой язык без технического жаргона. AI **обязан** вывести содержимое в чат как обычное сообщение перед ExitPlanMode и дождаться подтверждения. См. секцию `## Two-Stage Plan Presentation` ниже.
1. **Context** — описание проблемы + `### Extracted Requirements` (нумерованный список требований из диалога, минимум 2)
2. **User Stories**
3. **Use Cases**
4. **Requirements**
   - **FR (Functional Requirements)**
   - **Acceptance Criteria (EARS)**
   - **NFR (Non‑Functional Requirements)**: Performance, Security, Reliability, Usability
   - **Assumptions** (может быть `N/A`)
   - **Risks** (опционально, может быть `N/A`) — риски, breaking changes, внешние зависимости
   - **Out of Scope** (опционально, может быть `N/A`) — что явно НЕ входит в план
5. **Implementation Plan**
6. **Impact Analysis** (обязательно для delete/rename/move, иначе `N/A`)
7. **Todos**
8. **Definition of Done (DoD)**
   - **Verification Plan** (Automated Tests + Manual Verification)
9. **File Changes** (в самом конце)

## Доменные требования
- FR/AC/Use Cases **должны** быть заполнены доменным содержанием из контекста задачи и источников требований.
- Пустые или абстрактные формулировки допустимы только как `TBD`/`N/A` и должны быть обоснованы.

## Формат Acceptance Criteria (EARS)
- WHEN [event] THEN [system] SHALL [response]
- IF [precondition] THEN [system] SHALL [response]
- WHEN [event] AND [condition] THEN [system] SHALL [response]

## Impact Analysis
- **Обязателен** если File Changes содержит `delete`, `rename`, `move` или `replace`.
- Таблица `Keyword | Files Found | Action in Plan` — grep по проекту для каждой затрагиваемой сущности.
- Каждый найденный файл ОБЯЗАН быть в File Changes или явно исключён с обоснованием.
- Для планов только с `create`/`edit` — `N/A`.

## Формат Todos
Каждая задача:
- `id` в `kebab-case`
- `description` и `dependencies` — **вложенные строки**
- В `description` обязательно указывать:
  - `files:` пути + действия (`create/edit/delete/rename/move/replace`)
  - `Requirements refs:` ссылки на FR/NFR/AC
  - `Leverage:` (если применимо)

Пример:
```markdown
- id: normalize-input
  description: Нормализовать входные данные; files: edit src/module.ts; Requirements refs: FR-1, NFR-Usability; Leverage: src/module.ts
  dependencies: [inspect-input]
```

## File Changes
- Markdown‑таблица **не** в fenced code‑block
- Таблица **не пустая**
- `Path` только относительный (без `C:\...` или `/abs/...`)

## Verification Plan
- **Automated Tests**: только конкретные команды (в backticks)
- **Manual Verification**: шаги проверки (если применимо)

## Двухфазная валидация

Валидатор работает в две фазы:
- **Phase 1 (структура)**: наличие секций, порядок, формат таблиц, Todo‑разметка, тест‑команды
- **Phase 2 (требования)**: проверка `### Extracted Requirements` в `## Context` — запускается ТОЛЬКО когда Phase 1 = 0 ошибок

Phase 2 проверяет:
- Наличие подсекции `### Extracted Requirements` внутри `## Context`
- Минимум 2 нумерованных пункта (`1. ...`, `2. ...`)
- При отклонении plan-gate показывает агенту последние промпты пользователя из кэша

## Prompt Capture (UserPromptSubmit hook)

`prompt-capture.ts` сохраняет каждый промпт пользователя в `~/.dev-pomogator/.plan-prompts-{sessionId}.json`.
- Rolling window: последние 10 промптов
- GC: файлы старше 2 часов удаляются автоматически
- plan-gate.ts читает промпты и включает последние 5 в Phase 2 deny-сообщение

## Границы валидатора
- Phase 1 проверяет **структуру и формат** (секций, таблиц, Todo‑разметки, тест‑команд).
- Phase 2 проверяет **наличие** перечня требований, но **не** оценивает доменную корректность и полноту.

## Two-Stage Plan Presentation

Монстр-план — документ для AI агента (исполнения). Человеку-ревьюеру тяжело ревьюить 10 секций. Поэтому каждый план **обязан** иметь top-level секцию `## 💬 Простыми словами` ПЕРВОЙ (перед `## 🎯 Context`).

**Алгоритм:**

1. **Step 1**: Перед написанием план-файла AI выводит секцию `## 💬 Простыми словами` (с тремя подсекциями) в чат как обычное текстовое сообщение.
2. **Step 2**: AI ждёт подтверждения от пользователя в свободной форме.
3. **Step 3**: После подтверждения AI пишет план-файл с этой секцией ПЕРВОЙ (перед Context).
4. **Step 4**: AI вызывает ExitPlanMode. plan-gate.ts валидирует наличие и непустоту секции через REQUIRED_SECTIONS массив + validateHumanSummarySection функцию (Phase 1 mandatory).

**ЗАПРЕЩЕНО**: вызывать ExitPlanMode без выполненного Step 1.

**Validation:**
- `REQUIRED_SECTIONS` array первой записью содержит `Простыми словами` regex — отсутствие секции → Phase 1 error "Отсутствует секция: Простыми словами"
- `validateHumanSummarySection(lines, indices, errors)` проверяет non-empty content — пустая секция (только heading) → Phase 1 error "Секция Простыми словами пуста"
- Backward compatibility: существующие планы без секции **сломаются** на ExitPlanMode validation. Это явный trade-off в обмен на UX (`major version 2.0.0 BREAKING`).
