# План работ

## 💬 Простыми словами

> Эта секция — для человека, не для AI. Монстр-план ниже — для исполнения. Здесь — быстрое объяснение задачи живым языком, чтобы ревьюер понял за 30 секунд правильно ли AI услышал задачу. AI ОБЯЗАН вывести содержимое этой секции в чат как обычное текстовое сообщение перед ExitPlanMode и дождаться подтверждения.

### Сейчас (как работает)
Опиши текущее состояние простыми словами без жаргона. 2-5 предложений.

### Как должно быть (как я понял)
Опиши желаемое состояние своими словами. Не FR/AC, а живой текст.

### Правильно понял?
Это правильное понимание задачи? Если есть сомнения — добавь варианты A/B/C интерпретации.

## 🎯 Context
{Описание проблемы, что вызвало задачу, желаемый результат}

### Extracted Requirements
1. {Требование из диалога}
2. {Требование из диалога}

## 👤 User Stories
- Как {роль}, я хочу {цель}, чтобы {ценность}.

## 🔀 Use Cases
- UC-1: {happy path}
- Edge cases: {ключевые отклонения/ошибки}

## 📐 Requirements

> FR/AC/Use Cases должны быть доменными и браться из контекста задачи.

### FR (Functional Requirements)
- FR-1: {описание}

### Acceptance Criteria (EARS)
- WHEN {event} THEN {system} SHALL {response}

### NFR (Non-Functional Requirements)
- Performance: {N/A или описание}
- Security: {N/A или описание}
- Reliability: {N/A или описание}
- Usability: {N/A или описание}

### Assumptions
- N/A

### Risks
- N/A

### Out of Scope
- N/A

## 🔧 Implementation Plan
1. {шаг 1}
2. {шаг 2}

## 💥 Impact Analysis

| Keyword | Files Found | Action in Plan |
|---------|-------------|----------------|
| `{keyword}` | `{path/to/file}` | {action} |

> N/A — нет удалений/переименований (удалить эту строку если есть delete/rename/move)

## 📋 Todos

---

### 📋 `{todo-id}`

> {Описание задачи — что нужно сделать и зачем}

- **files:** `{path}` *({action})*
- **changes:**
  - {Конкретное изменение: что найти/добавить/удалить/заменить и где}
  - {Ещё изменение, если нужно}
- **refs:** {FR-1, NFR-Usability}
- **leverage:** `{path/to/reuse}` *(опционально)*
- **deps:** *none*

---

## ✅ Definition of Done (DoD)
- {критерий}

### Verification Plan
- Automated Tests:
  - `{команда}`
- Manual Verification:
  - {шаг проверки}

## 📁 File Changes
| Path | Action | Reason |
|---|---|---|
| `TBD` | `create` | {причина} |
