# Jira-first Workflow (Optional, conditional)

## Contents

- [Trigger / Activation](#trigger--activation)
- [Артефакты Jira-mode](#артефакты-jira-mode)
- [Поведенческие эффекты](#поведенческие-эффекты)
- [Когда файл создаётся](#когда-файл-создаётся)
- [Step 0 в каждой phase](#step-0-в-каждой-phase)
- [Format Jira trace в FR/AC/BDD/Tasks](#format-jira-trace-в-fracbddtasks)

## Trigger / Activation

**Opt-in trigger:** Spec папка содержит `JIRA_SOURCE.md`. Создаётся только jira-intake skill'ом (cleverence-pomogator) или аналогом — для greenfield / research спеков файла нет и весь раздел no-op. Тот же паттерн conditional activation что `TEST_DATA_ACTIVE` через DESIGN.md — без env vars, без глобальных конфигов.

## Артефакты Jira-mode

| Файл | Назначение | Lifecycle |
|------|------------|-----------|
| `JIRA_SOURCE.md` | Verbatim Jira description + comments с preserved эмфазой (`{color:red}` → `**🔴 CRITICAL:**`) | Создаётся jira-intake Phase 4b. Обновляется `/jira-intake-resync`. Не редактируется вручную. |
| `ATTACHMENTS.md` | Committed каталог аттачей: file/role/purpose/evidence/hash/size | Создаётся jira-intake Phase 5g. Binaries (`attachments/`) gitignored. |
| `.jira-cache.json` | Structured extractions: errors/ui_observations/video_steps/data_schema/config_values + attachment hashes | Schema: `tools/specs-generator/templates/JIRA_CACHE.schema.json`. Читается validator/audit для cross-check. |

## Поведенческие эффекты

Когда `JIRA_SOURCE.md` присутствует:

- Каждая фаза (1, 1.5, 2, 3, 3+) ОБЯЗАНА начинаться со **Step 0** — re-read трёх Jira-артефактов (см. ниже).
- Validator активирует правило `JIRA_SOURCE_PRESERVED` (WARNING severity) — FR/AC/BDD scenarios/TASKS должны содержать `Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_` ссылки.
- Audit Phase 3+ активирует категорию `JIRA_DRIFT` — diff `.jira-cache.json` vs live Jira (если MCP доступен).
- Многомодальный re-Read для AC с ссылками `Screenshot:` / `Video:` — применяется existing правило `.claude/rules/pomogator/screenshot-driven-verification.md`.

Когда файла нет — **все** выше перечисленные эффекты no-op. Существующие спеки без Jira не трогаются.

## Когда файл создаётся

- `/jira-intake {KEY}` skill (в cleverence-pomogator) после фетча Jira issue записывает все 3 артефакта и передаёт управление create-spec.
- Для existing spec без Jira — retroactive intake **out of scope**. Либо ждать следующей Jira-задачи, либо вручную создать `JIRA_SOURCE.md` + `.jira-cache.json` + `ATTACHMENTS.md` по шаблонам.

## MCP-rails: как читать Jira-артефакты (FR-39/P19-6)

Под enforce сырой `Read`/`ls` по `.specs/**` блокируется — все Jira-артефакты читай через дверь:

- **Существование** (вместо «если `JIRA_SOURCE.md` существует»): `list_spec_docs({ spec })` → проверь `'JIRA_SOURCE.md'` в `docs[]`. Файла нет → весь Jira-mode no-op.
- **JIRA_SOURCE.md / ATTACHMENTS.md** (оба `.md`): `read_spec_doc({ spec, doc: "JIRA_SOURCE.md" })`, `read_spec_doc({ spec, doc: "ATTACHMENTS.md" })`. Везде ниже «Re-read JIRA_SOURCE.md» = этот вызов.
- **Бинарные вложения** (`attachments/<file>` для multimodal): `read_attachment({ spec, path: "attachments/<file>" })` (см. phase2 Step 5c).
- **`.jira-cache.json`**: `read_spec_doc({ spec, doc: ".jira-cache.json" })` — read-дверь отдаёт этот named read-only артефакт (как `.progress.json`; okName-фильтр расширен в P19-1). Структурные extractions (errors/ui_observations/video_steps/config_values).

## Step 0 в каждой phase

### Phase 1 Step 0 (Discovery)

Re-read `JIRA_SOURCE.md` (verbatim Jira text с эмфазой), `ATTACHMENTS.md` (catalog с role tags), `.jira-cache.json` (structured extractions). Extract:

- Roles/actors mentioned in description/comments → USER_STORIES candidates
- User goals (что reporter хочет исправить) → USER_STORIES "чтобы {X}" clauses
- Reproduction flow из attachments с role `reproduction-flow` (video_steps массив) → USE_CASES happy path + edge cases

Each USER_STORY MUST contain `Jira quote: "..."` line с verbatim цитатой из JIRA_SOURCE.md.
Each USE_CASE MUST reference attachment (`Evidence: {filename}`) или Jira quote как trigger.

### Phase 1.5 Step 0 (Project Context)

Re-read `JIRA_SOURCE.md` Comments секцию + `.jira-cache.json` metadata (labels, components) + `ATTACHMENTS.md` каталог. Extract:

- Архитектурные constraints из обсуждений reporter/assignee в комментариях → `### Architectural Constraints Summary`
- Referenced modules/files в комментариях → дополнение к `### Relevant Rules` / `### Existing Patterns & Extensions`
- Attachments с role `env-config` → читать `.jira-cache.json` `config_values` для production constraints (timeouts, feature flags), которые станут NFR boundaries
- Attachments с role `data-sample` → `.jira-cache.json` `data_schema` → ограничения на scope enumeration для Requirements

В секцию `## Project Context & Constraints` добавить подсекцию `### Jira Context` со ссылками на конкретные quotes / `.jira-cache.json` fragments.

### Phase 2 Step 0 (Requirements + Design)

Re-read `JIRA_SOURCE.md` Description + Comments + Directives Extraction + `.jira-cache.json` `directives[]`. Extract:

- Imperatives с severity `CRITICAL` (red/bold/!!!) → ОБЯЗАНЫ стать FR с тем же scope
- Scope enumeration из `directives[*].scope` (паттерн `все X кроме Y`) → каждый scope member получает FR или `[WAIVED: {quote}]`
- Exclusions из `directives[*].exclusions` → явно в `## Out of Scope` с Jira quote
- Errors из `.jira-cache.json` `structured_extractions.errors[]` → FR про error handling должен reference `{source_file}:{line}`
- UI observations (color, text blocks) → AC про UI содержат точные цвета/тексты из JIRA_SOURCE (не от головы агента)
- Config values → NFR boundaries (timeouts, limits) MUST align, не invent

### Phase 3 Step 0 (Finalization)

Re-read `JIRA_SOURCE.md` Description + `.jira-cache.json` `directives[]` + `ATTACHMENTS.md` с ролями `reproduction-flow` / `error-evidence`. Extract:

- Reproduction steps (video_steps в `.jira-cache.json`) → mapping к implementation tasks (каждый шаг → phase/task). Порядок tasks должен **отражать** порядок видео.
- Error evidence (file:line) → task обязан содержать `_Jira: <file>:<line>_` или `_Jira: <JIRA_SOURCE.md#fragment>_`.
- Directives enumeration → каждый FR (один scope member) → как минимум одна green-task с `_Jira:_` reference.

### Phase 3+ Step 0 (Audit)

Re-read all three Jira artifacts: `JIRA_SOURCE.md`, `ATTACHMENTS.md`, `.jira-cache.json`. Подготовить checklist для JIRA_DRIFT категории:

- Список CRITICAL directives из `.jira-cache.json` → проверить coverage FR
- Список attachments с hashes → проверить что referenced evidence в FR/AC всё ещё matches
- `last_fetch_at` timestamp → если > 7 дней назад, рекомендация `/jira-intake-resync` до audit

## Format Jira trace в FR/AC/BDD/Tasks

Обязательно в Jira-mode, иначе WARNING от `JIRA_SOURCE_PRESERVED` validator:

- **FR-N (в FR.md):** `Jira imperative: "<verbatim quote from JIRA_SOURCE.md>"` в пределах 15 строк после заголовка
- **AC-N (в ACCEPTANCE_CRITERIA.md):** `Jira acceptance: "..."` ИЛИ `Evidence: {file#fragment или .jira-cache.json path}` в пределах 15 строк после заголовка
- **BDD Scenario (в *.feature):** `# Jira trace: "<quote>"` comment в пределах 10 строк ПЕРЕД `Scenario:`
- **Task (в TASKS.md):** `_Jira: <fragment / quote reference>_` inline в теле task block в пределах 20 строк после `### 📋 \`task-id\``

Примеры:

```markdown
## FR-1: Валидация остатков для всех non-INBOUND доктайпов
Jira imperative: "все доступные сейчас доктайпы, КРОМЕ INBOUND"
...
```

```gherkin
# Jira trace: "блокировать добавление товара если его нет на остатках"
@feature1
Scenario: SPECJIRA001_01 Picking blocks over-limit qty
```

```markdown
### 📋 `block-picking-over-limit`
> Добавить `picking` в isOutboundDocument() enum.
- **files:** `src/services/StockValidationService.ts` *(edit)*
- **refs:** FR-1, AC-1
- **deps:** *none*
- **_Jira:_** "все доступные сейчас доктайпы, КРОМЕ INBOUND" (JIRA_SOURCE.md Description)
```
