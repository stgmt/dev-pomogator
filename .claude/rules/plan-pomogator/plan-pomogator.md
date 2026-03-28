# Plan-pomogator — Формат планов разработки

## Цель правила

Это правило задаёт **единый формат планов разработки**. Если пользователь просит план (или включён Plan mode) — план **обязан** содержать 9 секций ниже и завершаться **непустой** таблицей **File Changes** (что именно будет создано/изменено/удалено и почему).

## Источник требований и копипаст-шаблон

- Спецификация требований к формату планов: `.dev-pomogator/tools/plan-pomogator/requirements.md`
- **Перед написанием плана** прочитай шаблон: `.dev-pomogator/tools/plan-pomogator/template.md`
- **Specs Management**: `.claude/rules/pomogator/specs-management.md` (structure `.specs/`, scripts `.dev-pomogator/tools/specs-generator/`)

> Примечание (render-safe): плейсхолдеры вида `<роль>` могут интерпретироваться как HTML-теги и пропадать в рендере. Используй `{роль}` / `{цель}` / `{ценность}`.

## Когда применять полный формат плана

- Полный формат плана обязателен, если:
  - пользователь явно просит план/спеку/roadmap/таски; или
  - задача нетривиальная (несколько компонентов/файлов/шагов); или
  - активен Plan mode.
- Если вопрос тривиальный (1 шаг, 1 файл, без архитектурных решений) — отвечай напрямую, **не раздувая план**.

## Уточняющие вопросы

- Если ответы критичны для архитектуры/объёма — задай 1–3 уточняющих вопроса.
- Если можно принять разумный дефолт — зафиксируй его в плане как **Assumption** и попроси подтвердить.

## Обязательная структура плана (шаблон)

План должен быть в Markdown и содержать секции **в этом порядке**. Каждая секция использует emoji-заголовок:

1. **👤 User Stories**
   - Список user stories в формате "Как {роль}, я хочу {цель}, чтобы {ценность}".

2. **Use Cases**
   - Основные сценарии использования (happy path + ключевые edge cases).

3. **Requirements**
   - **FR (Functional Requirements)**: что система должна делать.
   - **Acceptance Criteria (EARS)**: для ключевых FR добавляй критерии в формате:
     - WHEN [event] THEN [system] SHALL [response]
     - IF [precondition] THEN [system] SHALL [response]
     - WHEN [event] AND [condition] THEN [system] SHALL [response]
   - **NFR (Non-Functional Requirements)**: безопасность, производительность, совместимость, эксплуатация, UX и т.д.
   - **Минимальные категории NFR** (если не применимо — явно писать `N/A`):
     - Performance
     - Security
     - Reliability
     - Usability
   - **Assumptions**: явная секция допущений (может быть `N/A`).
   - **Risks** (опционально): риски, breaking changes, внешние зависимости (может быть `N/A`).
   - **Out of Scope** (опционально): что явно НЕ входит в этот план (может быть `N/A`).
   - FR/AC/Use Cases заполняются **доменным содержанием** из контекста задачи и источников требований.

4. **Implementation Plan**
   - Пошаговый план работ (достаточно конкретный, чтобы исполнять "механически").
   - Если план зависит от изучения кода/файлов — явно указать, какие файлы будут просмотрены и зачем.
   - Явно фиксируй **Leverage / Code reuse**: что переиспользуем/расширяем (пути к существующим файлам/классам/функциям), прежде чем предлагать создавать новое.

5. **Impact Analysis (обязательно для delete/rename/move/replace)**
   - Если план содержит действия `delete`, `rename`, `move` или `replace` — агент ОБЯЗАН выполнить `grep -ri <keyword>` по проекту для каждой затрагиваемой сущности (имя файла, имя расширения, имя функции/класса).
   - Результаты оформляются в таблицу:

     | Keyword | Files Found | Action in Plan |
     |---------|-------------|----------------|
     | `example-name` | `path/to/file1.ts`, `path/to/config.json` | delete, edit |

   - Каждый найденный файл ОБЯЗАН быть в File Changes ИЛИ явно исключён с обоснованием:
     - `[excluded: historical research, not code]` — допустимо для `.specs/*/RESEARCH.md`
     - `[excluded: auto-generated, will regenerate]` — допустимо для `.dev-pomogator/tools/`
   - Если план содержит только `create`/`edit` — секция может содержать `N/A — нет удалений/переименований`.
   - **ЗАПРЕЩЕНО**: формировать File Changes без предварительного Impact Analysis для планов с удалениями/переименованиями.

6. **📋 Todos**
   - Каждая задача — отдельный `### 📋 \`todo-id\`` блок с уникальным id в `kebab-case`.
   - Блоки разделяются `---` (горизонтальная линия).
   - Формат каждого блока:
     - `### 📋 \`todo-id\`` — заголовок с id в backticks
     - `> описание` — blockquote с описанием задачи
     - `- **files:** \`path\` *(action)*` — файлы и действия
     - `- **changes:**` — **ОБЯЗАТЕЛЬНО**: конкретные изменения (sub-bullets: что найти/добавить/удалить/заменить)
     - `- **refs:** FR-1, NFR-Usability` — ссылки на требования
     - `- **leverage:** \`path/to/reuse\`` — что переиспользуем (опционально)
     - `- **deps:** *none*` или `- **deps:** \`other-task\`` — зависимости
   - **Пример `changes:` (хорошо):**
     ```
     - **changes:**
       - Добавить функцию `validateActionability(lines, indices, warnings)` после `validateCrossReferences` — проверяет word count и generic phrases
       - В `validateTodos()` добавить проверку `hasChanges` по аналогии с `hasFiles`/`hasRefs`/`hasDeps`
     ```
   - **Пример `changes:` (плохо):**
     ```
     - **changes:**
       - Обновить логику
       - Изменить файл
     ```
   - **Atomic Task Requirements (обязательно)**:
     - 1–3 файла на задачу
     - 15–30 минут на задачу (ориентир)
     - 1 проверяемый outcome

7. **Definition of Done (DoD)**
   - Критерии готовности: реализация соответствует Requirements/Use Cases, обновлены конфиги/документация при необходимости, нет утечек секретов, выполнены проверки/тест-план (в рамках правил репозитория).
   - **Verification Plan**:
     - **Automated Tests**: точные команды, которые будут запущены
     - **Manual Verification**: шаги ручной проверки (если применимо)

8. **File Changes (Plan Output) — ОБЯЗАТЕЛЬНО В САМОМ КОНЦЕ**
   - В конце плана должна быть таблица со **всеми файлами**, которые планируется:
     - `create` / `edit` / `delete` / `rename` / `move` / `replace`
   - Таблица **НЕ может быть пустой**: минимум 1 строка данных (кроме заголовка).
   - Минимальные колонки таблицы:
     - `Path`
     - `Action`
     - `Reason`
   - `Path` — только относительный путь в репозитории (без абсолютных путей вида `D:\...`).
   - Если путь неизвестен — укажи `TBD` и добавь шаг в Implementation Plan на уточнение/поиск.

Пример (корректно):
```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
| `.dev-pomogator/tools/plan-pomogator/requirements.md` | create | Зафиксировать требования к формату планов с примерами good/bad. |
```

Пример (некорректно — пустая таблица):
```markdown
## 📁 File Changes
| Path | Action | Reason |
|------|--------|--------|
```

## Валидация плана (ручная)

- Перед завершением плана запусти валидатор структуры:
  - `npx tsx .dev-pomogator/tools/plan-pomogator/validate-plan.ts <path-to-plan.md>`
- Валидатор проверяет **формат и структуру**, но не оценивает доменную корректность.

## Phase 2: Валидация требований

После прохождения Phase 1 (0 ошибок структуры), валидатор дополнительно проверяет:
- Секция Context содержит `### Extracted Requirements`
- Минимум 2 нумерованных пункта (`1. ...`, `2. ...`)
- Пункты извлекаются из сообщений пользователя в текущем диалоге

## Phase 4: Actionability (предупреждения)

После прохождения Phase 1-3 (0 ошибок), валидатор проверяет качество описаний:
- Каждый todo имеет `changes:` с минимум 1 sub-bullet
- Каждый changes bullet содержит минимум 10 слов
- Implementation Plan шаги содержат минимум 12 слов
- File Changes Reason содержит минимум 5 слов
- Нет generic фраз ("update logic", "fix code", "edit file", "implement feature", "modify file", ...)

Phase 4 выдаёт **предупреждения** (не блокирует ExitPlanMode).

## Pre-flight Checklist (перед ExitPlanMode)

- [ ] 9 секций с emoji в порядке: 🎯 Context → 👤 User Stories → 🔀 Use Cases → 📐 Requirements → 🔧 Implementation Plan → 💥 Impact Analysis → 📋 Todos → ✅ DoD → 📁 File Changes
- [ ] Context → `### Extracted Requirements` → ≥2 нумерованных пунктов (`1. ...`, `2. ...`)
- [ ] Requirements: `### FR` → `### Acceptance Criteria (EARS)` → `### NFR` (Performance, Security, Reliability, Usability) → `### Assumptions`
- [ ] Todos: `### 📋 \`todo-id\`` + `> описание` + `- **files:**` + `- **changes:**` + `- **refs:**` + `- **deps:**` — блоки разделены `---`
- [ ] Todos: каждый todo содержит `- **changes:**` с конкретными sub-bullets (что найти/добавить/удалить/заменить)
- [ ] DoD → `### Verification Plan` → `Automated Tests:` → `- `команда`` (в backticks, формат: `- `...``)
- [ ] File Changes: `| Path | Action | Reason |` — ≥1 строка данных, относительные пути, ПОСЛЕДНЯЯ секция
- [ ] Если delete/rename/move/replace → `## 💥 Impact Analysis` с таблицей Keyword/Files/Action (не N/A)
- [ ] Каждый путь в File Changes упомянут в Implementation Plan или Todos (нет stale путей от других планов)

## Запреты и ограничения

- НЕ вставляй в планы/примеры секреты (логины, пароли, токены).
- Не предлагай отключать фичи/тесты/ставить ignore вместо исправления.
- Следуй существующим правилам репозитория (TDD, fail-fast, без моков для E2E и т.п.).
- НЕ копируй File Changes, Requirements или Implementation Plan из предыдущих планов. Каждый план создаётся С НУЛЯ для текущей задачи. См. `plan-freshness.md`.
