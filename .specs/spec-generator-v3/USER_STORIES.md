# User Stories

> v3 format. Hook `user-story-form-guard` enforces: Priority + Why + Independent Test + Acceptance Scenarios per block.

### User Story 1: Автозаполнение USER_STORIES формы (Priority: P1)

As a **maintainer**, I want **`discovery-forms` skill автоматически заполнял USER_STORIES.md с Priority+Why+IT+AC для каждой истории**, чтобы **я не пишу их вручную и не пропускаю поля**.

**Why:** Без обязательных 4 полей User Story теряет связь с Acceptance (требует three-hop lookup FR→AC→.feature).

**Independent Test:** Создать пустую `.specs/foo/` (v3), вызвать `Skill("discovery-forms")` — USER_STORIES.md содержит минимум 1 полный блок US-1 со всеми 4 полями (SPECGEN003_16).

**Acceptance Scenarios:**

Given пустая `.specs/foo/USER_STORIES.md` (template)
When parent `create-spec` вызывает `Skill("discovery-forms")`
Then файл содержит `### User Story 1: ... (Priority: P1)` + `**Why:**` + `**Independent Test:**` + `**Acceptance Scenarios:**` inline

### User Story 2: Блокировка ручной записи без формы (Priority: P1)

As a **maintainer**, I want **чтобы попытка Write USER_STORIES.md без Priority блокировалась PreToolUse hook'ом**, чтобы **агент не мог "забыть" поля при ручном editing**.

**Why:** Галлюцинации побеждаются только hard-block'ом, soft warnings игнорируются.

**Independent Test:** В `.specs/foo/` (v3) попытка Write USER_STORIES.md с `- Как роль...` без Priority — hook возвращает exit 2 с actionable message (SPECGEN003_01).

**Acceptance Scenarios:**

Given spec c `.progress.version: 3`
When агент пишет USER_STORIES.md без `(Priority: P1)` в заголовке US
Then hook `user-story-form-guard.ts` возвращает exit 2 + JSON `permissionDecision: deny` + hint про Skill

### User Story 3: Task Board с Done When + Status + Est (Priority: P1)

As a **maintainer**, I want **`task-board-forms` заполнял TASKS.md с Done When/Status/Est per task и генерил Task Summary Table в начале файла**, чтобы **completion criteria явны, а прогресс виден O(1)**.

**Why:** Текущий TASKS.md требует прокрутки 94+ строк, `_refs:_` three-hop для completion criteria.

**Independent Test:** `Skill("task-board-forms")` в v3 spec → TASKS.md начинается с `## Task Summary Table` + каждый task блок имеет `Status: TODO | Est: 30m` + `**Done When:**` с ≥1 checkbox (SPECGEN003_17, _19, _20).

**Acceptance Scenarios:**

Given `.specs/foo/TASKS.md` с базовыми task блоками
When parent вызывает `Skill("task-board-forms")`
Then TASKS.md содержит Task Summary Table в начале + каждый task enriched с Status/Est/Done When

### User Story 4: Миграция не ломает existing specs (Priority: P1)

As a **maintainer**, I want **чтобы 30+ existing specs (v1/v2) продолжали работать без изменений**, чтобы **v3 upgrade не требовал миграционной компании**.

**Why:** Миграция 30+ спеков = дни работы + риск сломать completed specs.

**Independent Test:** Write/Edit в existing `.specs/bg-task-guard/USER_STORIES.md` (v1/v2) без v3 формата — hook пропускает (exit 0) + audit log `ALLOW_AFTER_MIGRATION` (SPECGEN003_04, _18).

**Acceptance Scenarios:**

Given `.specs/bg-task-guard/.progress.json` без `version` field
When агент пишет USER_STORIES.md в этот spec
Then `user-story-form-guard.ts` делает `exit 0` (migration pass-through) не проверяя формат

### User Story 5: Meta-guard защищает от обхода через manifest (Priority: P1)

As a **maintainer**, I want **попытка агента удалить form-guard из extension.json блокировалась meta-guard'ом**, чтобы **агент не мог выключить защиту и "забыть"**.

**Why:** Env var bypass агенты обходят. Нужна защита самой конфигурации hooks.

**Independent Test:** Попытка Edit extension.json удаляющая `user-story-form-guard.ts` — meta-guard exit 2 с message "cannot remove form-guards" (SPECGEN003_25).

**Acceptance Scenarios:**

Given extension.json с 6 form-guards в hooks.PreToolUse
When Claude attempts Edit removing user-story-form-guard entry
Then meta-guard exits 2
And stderr contains "human review"

### User Story 6: UserPromptSubmit summary показывает попытки обхода (Priority: P2)

As a **maintainer**, I want **в начале каждого prompt видеть summary `📊 Form guards (24h): N DENY, M PARSER_CRASH`**, чтобы **обнаружить попытки агента обойти защиту или баги парсера**.

**Why:** Audit log без surfacing = черный ящик. Summary в UserPromptSubmit даёт постоянную visibility без Read инструмента.

**Independent Test:** Инжектировать 3 DENY + 1 PARSER_CRASH в `~/.dev-pomogator/logs/form-guards.log` → любой prompt выводит summary с этими counts (SPECGEN003_28).

**Acceptance Scenarios:**

Given form-guards.log has 3 DENY + 1 PARSER_CRASH within last 24h
When validate-specs.ts UserPromptSubmit hook runs
Then stdout contains "📊 Form guards (24h):" + counts
