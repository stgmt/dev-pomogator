# Plan-pomogator — Требования

## Цель
Задать единый и проверяемый формат планов: структура, формат секций и минимальные правила валидности.

## Область применения
- Plan mode или явный запрос на план/roadmap/таски.
- Требования касаются **формы и структуры** плана, а не доменной корректности.

## Обязательная структура (порядок секций)
1. **User Stories**
2. **Use Cases**
3. **Requirements**
   - **FR (Functional Requirements)**
   - **Acceptance Criteria (EARS)**
   - **NFR (Non‑Functional Requirements)**: Performance, Security, Reliability, Usability
   - **Assumptions** (может быть `N/A`)
   - **Risks** (опционально, может быть `N/A`) — риски, breaking changes, внешние зависимости
   - **Out of Scope** (опционально, может быть `N/A`) — что явно НЕ входит в план
4. **Implementation Plan**
5. **Todos**
6. **Definition of Done (DoD)**
   - **Verification Plan** (Automated Tests + Manual Verification)
7. **File Changes** (в самом конце)

## Доменные требования
- FR/AC/Use Cases **должны** быть заполнены доменным содержанием из контекста задачи и источников требований.
- Пустые или абстрактные формулировки допустимы только как `TBD`/`N/A` и должны быть обоснованы.

## Формат Acceptance Criteria (EARS)
- WHEN [event] THEN [system] SHALL [response]
- IF [precondition] THEN [system] SHALL [response]
- WHEN [event] AND [condition] THEN [system] SHALL [response]

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

## Границы валидатора
- Валидатор проверяет **структуру и формат** (секций, таблиц, Todo‑разметки, тест‑команд).
- Валидатор **не** оценивает доменную корректность и полноту требований.
