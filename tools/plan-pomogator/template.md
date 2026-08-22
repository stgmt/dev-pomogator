# План работ

## 💬 Простыми словами

> Эта секция — для человека, не для AI. Монстр-план ниже — для исполнения. AI ОБЯЗАН показать это summary перед ExitPlanMode. Если пользователь уже дал явную команду продолжать (`делай план`, `пиши план`, `go ahead`), явная команда продолжать уже считается подтверждением: не останавливайся и не спрашивай повторно, сразу пиши и валидируй полный план.

### Сейчас (как работает)
Опиши текущее состояние простыми словами без жаргона. 2-5 предложений.

### Как должно быть (как я понял)
Опиши желаемое состояние своими словами. Не FR/AC, а живой текст.

### Правильно понял?
Зафиксируй подтверждённое понимание. Если явной команды писать план ещё не было и остаётся существенная неоднозначность — задай один конкретный вопрос; после `делай план` повторный вопрос запрещён.

## 🎯 Context
{Описание проблемы, что вызвало задачу, желаемый результат}

### Extracted Requirements
1. {Требование из диалога}
2. {Требование из диалога}

## 📚 Existing-Spec Inventory

> До проектирования проверь существующие спеки и распределённые точки владения. Для каждого пункта укажи проверенный путь, slug/статус/документ или `N/A` с причиной; не угадывай статус по README.

### Domain/Lifecycle
- Specs: `{.specs/<slug>}` — lifecycle status, `FR.md`/`TASKS.md`/`.feature`, связанные sub-specs и пересечения владения.

### Installation/Runtime
- Installation/config/Docker/hooks/doctor: `{path}` — владелец и контракт запуска/конфигурации.
- Skills/references/rules/templates/allowed-tools/CLAUDE.md: `{path}` — что уже задаёт поведение.

### Verification
- BDD: `{tests/...feature}`; existing non-BDD coverage: `{path}`; lint/test skill and canonical command: `{path or command}`.

### Repository Baseline
- SHA: `{git rev-parse HEAD}`; worktree status: `{git status --short}`; unresolved findings or `N/A`.

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

### 🔎 Источники / Пруфы
> Каждый внешний/технический факт плана (возможности инструмента/библиотеки, «X поддерживает Y», «быстрее», «по умолчанию») — с меткой-пруфом: `[src:<url>]` (веб) / `[ref:<file:line>]` (код) / `[cmd:<вывод>]` (проверено). Гипотезы помечать как гипотезы. Правило: `.claude/rules/plan-pomogator/claims-need-evidence.md`.
- {факт} {[src:<url>] / [ref:<file:line>] / [cmd:<вывод>]}

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
