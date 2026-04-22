# Specs Management - Управление спецификациями

## Когда применять

Пользователь просит работу со спеками — любым creation/update/view глаголом + словом "спеки/спека/спецификация/specs/spec/specification":

- **RU создание/scaffold:** "создай/сделай/набросай/напиши/опиши/нужна спека/спеки", "новые спеки для X", "спеки по фиче", "спецификация для X"
- **RU обновление/просмотр:** "обнови спеки", "покажи спеки", "что в спеке X", "статус спеков"
- **EN create/scaffold:** "create/make/draft/write/sketch/outline specs", "spec out", "new spec for X", "scaffold a spec"
- **EN update/view:** "update specs", "show specs", "specs status", "review the spec"

Триггер должен срабатывать на любую из этих фраз даже в терсной форме ("ок спеки по фиче сделай"). Различай намерение: scaffold нового → запускай /create-spec; update/view существующего → следуй workflow ниже без scaffold.

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
├── *_SCHEMA.md            # (опционально) Схемы данных
└── FIXTURES.md            # (опционально) Инвентаризация фикстур, lifecycle, gap analysis
```

---

## Инструменты автоматизации

### Скрипты

| Скрипт | Назначение | Пример |
|--------|------------|--------|
| `scaffold-spec.ts` | Создание структуры | `./.dev-pomogator/tools/specs-generator/scaffold-spec.ts -Name "my-feature"` |
| `validate-spec.ts` | Валидация форматов | `./.dev-pomogator/tools/specs-generator/validate-spec.ts -Path ".specs/my-feature"` |
| `spec-status.ts` | Отчёт о прогрессе + state machine | `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/my-feature"` |
| `spec-status.ts -ConfirmStop` | Подтверждение СТОП-точки | `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/my-feature" -ConfirmStop Discovery` |
| `fill-template.ts` | Заполнение плейсхолдеров | `./.dev-pomogator/tools/specs-generator/fill-template.ts -File "..." -ListPlaceholders` |
| `list-specs.ts` | Список всех спеков | `./.dev-pomogator/tools/specs-generator/list-specs.ts` |
| `audit-spec.ts` | Аудит кросс-ссылок | `./.dev-pomogator/tools/specs-generator/audit-spec.ts -Path ".specs/my-feature"` |
| `analyze-features.ts` | Анализ паттернов .feature | `./.dev-pomogator/tools/specs-generator/analyze-features.ts -Format text` |

### Документация скриптов

Полная документация: `.dev-pomogator/tools/specs-generator/README.md`

### Запреты

- `.progress.json` создаётся ТОЛЬКО через `spec-status.ts`. ЗАПРЕЩЕНО создавать его через Write tool, вручную или напрямую. Аргумент `-Path` ОБЯЗАН указывать на `.specs/<feature>/` (не `.`, не `.specs/`, не произвольную папку).

---

## Progress Display Format

При создании спеки AI ОБЯЗАН показывать прогресс на каждом шаге.

### Прогресс-блок (после каждого заполненного файла)

Формат (≤ 4 строки):

```
📊 Spec Progress: {slug} — Phase N/4: {phase_name}
Files: {done}/{total} complete — Next: {next_action}
```

Опционально: вызвать `spec-status.ts -Path ".specs/{feature}" -Format human` и вставить output. Выводить ПОСЛЕ каждого заполненного spec файла, НЕ после каждого Edit tool call.

### Executive Summary на STOP

ПЕРЕД длинным перечислением файлов вывести:

```
## 💬 Ключевые решения фазы

- Решение 1 (кратко, 1 строка)
- Решение 2
- Решение 3

Подтверди для продолжения. Детали: [FR.md](FR.md), [DESIGN.md](DESIGN.md).
```

Максимум 5 bullets. Ядро наверху, детали по ссылкам.

### Starter Message (при первом запуске)

Если `.progress.json` для feature не существует, перед началом работы показать:

```
📊 Создаём спеку: {feature-slug}
4 фазы с подтверждением на каждой:
1️⃣ Discovery — определяем кто, зачем, что (USER_STORIES, USE_CASES, RESEARCH)
2️⃣ Context — ограничения проекта, существующие паттерны (RESEARCH update)
3️⃣ Requirements — формальные FR/AC/NFR + DESIGN + BDD .feature (7 файлов)
4️⃣ Finalization — план задач TASKS + README + CHANGELOG
Начинаем с Phase 1: Discovery.
```

---

## Jira-first Workflow (Optional)

> **Opt-in trigger:** Spec папка содержит `JIRA_SOURCE.md`. Создаётся только jira-intake skill'ом (cleverence-pomogator) или аналогом — для greenfield / research спеков файла нет и весь раздел no-op. Тот же паттерн conditional activation что `TEST_DATA_ACTIVE` через DESIGN.md — без env vars, без глобальных конфигов.

### Артефакты Jira-mode

| Файл | Назначение | Lifecycle |
|------|------------|-----------|
| `JIRA_SOURCE.md` | Verbatim Jira description + comments с preserved эмфазой (`{color:red}` → `**🔴 CRITICAL:**`) | Создаётся jira-intake Phase 4b. Обновляется `/jira-intake-resync`. Не редактируется вручную. |
| `ATTACHMENTS.md` | Committed каталог аттачей: file/role/purpose/evidence/hash/size | Создаётся jira-intake Phase 5g. Binaries (`attachments/`) gitignored. |
| `.jira-cache.json` | Structured extractions: errors/ui_observations/video_steps/data_schema/config_values + attachment hashes | Schema: `extensions/specs-workflow/tools/specs-generator/templates/JIRA_CACHE.schema.json`. Читается validator/audit для cross-check. |

### Поведенческие эффекты

Когда `JIRA_SOURCE.md` присутствует:
- Каждая фаза (1, 1.5, 2, 3, 3+) ОБЯЗАНА начинаться со **Step 0** — re-read трёх Jira-артефактов (см. алгоритмы phases ниже).
- Validator активирует правило `JIRA_SOURCE_PRESERVED` (WARNING severity) — FR/AC/BDD scenarios/TASKS должны содержать `Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_` ссылки.
- Audit Phase 3+ активирует категорию `JIRA_DRIFT` — diff `.jira-cache.json` vs live Jira (если MCP доступен).
- Многомодальный re-Read для AC с ссылками `Screenshot:` / `Video:` — применяется existing правило `.claude/rules/pomogator/screenshot-driven-verification.md`.

Когда файла нет — **все** выше перечисленные эффекты no-op. Существующие спеки без Jira не трогаются.

### Когда файл создаётся

- `/jira-intake {KEY}` skill (в cleverence-pomogator) после фетча Jira issue записывает все 3 артефакта и передаёт управление /create-spec.
- Для existing spec без Jira — retroactive intake **out of scope**. Либо ждать следующей Jira-задачи, либо вручную создать `JIRA_SOURCE.md` + `.jira-cache.json` + `ATTACHMENTS.md` по шаблонам.

---

## Workflow создания (4 СТОП-точки)

### PHASE 1: Discovery

**Файлы:** USER_STORIES.md, USE_CASES.md, RESEARCH.md

**Алгоритм:**

**Step 0 (только если `.specs/{slug}/JIRA_SOURCE.md` существует — Jira-mode):**
Re-read `JIRA_SOURCE.md` (verbatim Jira text с эмфазой), `ATTACHMENTS.md` (catalog с role tags), `.jira-cache.json` (structured extractions). Extract:
- Roles/actors mentioned in description/comments → USER_STORIES candidates
- User goals (что reporter хочет исправить) → USER_STORIES "чтобы {X}" clauses
- Reproduction flow из attachments с role `reproduction-flow` (video_steps массив) → USE_CASES happy path + edge cases
Each USER_STORY MUST contain `Jira quote: "..."` line с verbatim цитатой из JIRA_SOURCE.md.
Each USE_CASE MUST reference attachment (`Evidence: {filename}`) или Jira quote как trigger.

1. Создать структуру: `./.dev-pomogator/tools/specs-generator/scaffold-spec.ts -Name "{feature}"`
2. Опросить пользователя о целях и ролях (**в Jira-mode:** уточнить только то, что НЕ покрыто JIRA_SOURCE.md — не переспрашивать reporter)
3. Заполнить USER_STORIES.md
4. Заполнить USE_CASES.md
5. Заполнить RESEARCH.md (если нужен ресерч). В Jira-mode секция `## Problem` ссылается на JIRA_SOURCE.md: `См. JIRA_SOURCE.md ## Description (Verbatim)` — не дублировать текст.
6. Проверить статус: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}"`

**СТОП #1:** Показать результаты Discovery, спросить подтверждение.
После подтверждения: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Discovery`

---

### PHASE 1.5: Project Context Analysis

**Файл:** RESEARCH.md (секция `## Project Context & Constraints`)

**Когда пропустить:**
- Пользователь явно сказал "skip context analysis" / "пропусти контекст-анализ"
- Фича greenfield (не затрагивает существующий код/правила)
- В проекте < 2 правил в `.claude/rules/`
- Фича тривиальная (1 файл, нет архитектурных решений)

**Алгоритм:**

**Step 0 (только если `.specs/{slug}/JIRA_SOURCE.md` существует — Jira-mode):**
Re-read `JIRA_SOURCE.md` Comments секцию + `.jira-cache.json` metadata (labels, components) + `ATTACHMENTS.md` каталог. Extract:
- Архитектурные constraints из обсуждений reporter/assignee в комментариях → `### Architectural Constraints Summary`
- Referenced modules/files в комментариях → дополнение к `### Relevant Rules` / `### Existing Patterns & Extensions`
- Attachments с role `env-config` → читать `.jira-cache.json` `config_values` для production constraints (timeouts, feature flags), которые станут NFR boundaries
- Attachments с role `data-sample` → `.jira-cache.json` `data_schema` → ограничения на scope enumeration для Requirements
В секцию `## Project Context & Constraints` добавить подсекцию `### Jira Context` со ссылками на конкретные quotes / `.jira-cache.json` fragments.

1. Извлечь ключевые слова из USER_STORIES.md и USE_CASES.md (домены, технологии, действия)
2. Просканировать `.claude/rules/*.md` — найти правила, релевантные ключевым словам
3. Просканировать `extensions/*/extension.json` — найти расширения, пересекающиеся по домену
4. Просканировать существующий код, упомянутый в USE_CASES — найти паттерны для reuse
4a. **Детект BDD framework в target test-projects (ОБЯЗАТЕЛЬНО если FILE_CHANGES упоминает tests/**/\*.test.\* или **/Tests/**/\*.cs или **/*_steps.py):**
    Для каждого target test-project из FILE_CHANGES.md — вызвать `bdd-framework-detector`:
    ```
    npx tsx extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts {projectPath} [testProjectHints...]
    ```
    Результат (DetectionResult — JSON) записать в RESEARCH.md `### Existing Patterns & Extensions` как отдельные строки per test-project:
    - `language` (csharp/typescript/python)
    - `framework` (installed framework name или null)
    - `installCommand` (для Phase 0 bootstrap block)
    - `hookFileHints[]` (для scaffold hooks per framework convention)
    - `configFileHint` (reqnroll.json / cucumber.js / behave.ini / pytest.ini)
    - `evidence[]` (grep output с путями и номерами строк)
    - `suggestedFrameworks[]` (fallback при framework=null — remediation target для Phase 0)
    **Эта информация критически нужна в Phase 2 Step 6 для заполнения `## BDD Test Infrastructure` DESIGN.md секции и для генерации Phase 0 bootstrap block в TASKS.md.**
5. Просканировать `**/Hooks/`, `**/hooks/`, `**/support/` — найти существующие BDD hooks (BeforeScenario/AfterScenario, setup/teardown, environment hooks)
6. Если фича создаёт/изменяет тестовые данные — записать найденные hooks в `### Existing Patterns & Extensions` с рекомендациями по аналогии
7. Заполнить секцию `## Project Context & Constraints` в RESEARCH.md:
   - `### Relevant Rules` — таблица: Rule | Path | Summary | Triggered By | Impacts
   - `### Existing Patterns & Extensions` — таблица: Source | Path | What It Provides | Relevance (включая строки DetectionResult из шага 4a)
   - `### Architectural Constraints Summary` — как ограничения влияют на будущие FR/NFR
8. Проверить статус: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}"`

**При пропуске:** записать в RESEARCH.md:
```
## Project Context & Constraints
> Skipped: {причина}
```

**СТОП #1.5:** Показать найденные ограничения проекта, спросить подтверждение перед Phase 2.
После подтверждения: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Context`

---

### PHASE 2: Requirements + Design

**Файлы:** REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, *.feature

**Алгоритм:**

**Step 0 (только если `.specs/{slug}/JIRA_SOURCE.md` существует — Jira-mode):**
Re-read `JIRA_SOURCE.md` Description + Comments + Directives Extraction + `.jira-cache.json` `directives[]`. Extract:
- Imperatives с severity `CRITICAL` (red/bold/!!!) → ОБЯЗАНЫ стать FR с тем же scope
- Scope enumeration из `directives[*].scope` (паттерн `все X кроме Y`) → каждый scope member получает FR или `[WAIVED: {quote}]`
- Exclusions из `directives[*].exclusions` → явно в `## Out of Scope` с Jira quote
- Errors из `.jira-cache.json` `structured_extractions.errors[]` → FR про error handling должен reference `{source_file}:{line}`
- UI observations (color, text blocks) → AC про UI содержат точные цвета/тексты из JIRA_SOURCE (не от головы агента)
- Config values → NFR boundaries (timeouts, limits) MUST align, не invent

**Формат Jira trace в FR/AC/BDD/Tasks (обязательно в Jira-mode, иначе WARNING от JIRA_SOURCE_PRESERVED):**
- FR-N (в FR.md): `Jira imperative: "<verbatim quote from JIRA_SOURCE.md>"` в пределах 15 строк после заголовка
- AC-N (в ACCEPTANCE_CRITERIA.md): `Jira acceptance: "..."` ИЛИ `Evidence: {file#fragment или .jira-cache.json path}` в пределах 15 строк после заголовка
- BDD Scenario (в *.feature): `# Jira trace: "<quote>"` comment в пределах 10 строк ПЕРЕД `Scenario:`
- Task (в TASKS.md): `_Jira: <fragment / quote reference>_` inline в теле task block в пределах 20 строк после `### 📋 \`task-id\``

Примеры:
```markdown
## FR-1: Валидация остатков для всех non-INBOUND доктайпов
Jira imperative: "все доступные сейчас доктайпы, КРОМЕ INBOUND"
...
```
```gherkin
# Jira trace: "блокировать добавление товара если его нет на остатках"
# @feature1
Scenario: SPECJIRA001_01 Picking blocks over-limit qty
```

1. Заполнить FR.md (формат: ## FR-N: {Название}). В Jira-mode — каждый FR со строкой `Jira imperative:`.
2. Заполнить NFR.md (секции: Performance, Security, Reliability, Usability). В Jira-mode — constraints из `.jira-cache.json` `config_values` cross-checked.
3. Заполнить ACCEPTANCE_CRITERIA.md (EARS формат). В Jira-mode — каждый AC со строкой `Jira acceptance:` или `Evidence:`.
4. Заполнить REQUIREMENTS.md (индекс ссылок)
5. Заполнить DESIGN.md
5a. **OUT OF SCOPE пропагация (ОБЯЗАТЕЛЬНО):**
    Если FR помечен `> OUT OF SCOPE`, агент ОБЯЗАН пометить связанные UC, AC и User Stories.
    Формат: `> OUT OF SCOPE — см. FR-N`
5b. **External Service Verification (ОБЯЗАТЕЛЬНО для фич с внешними сервисами):**
    Для каждого внешнего сервиса в DESIGN.md:
    - Проверить env vars / API config через официальную документацию (Context7 или WebSearch)
    - Пометить проверенные: `[VERIFIED: {источник}]`
    - Пометить непроверенные: `[UNVERIFIED]`
5c. **Multimodal re-verification (ОБЯЗАТЕЛЬНО в Jira-mode):**
    Для каждого AC, содержащего ссылку `Screenshot: {filename}` или `Video: {filename}:{timestamp}`:
    - Прочитать attachment из `.specs/{slug}/attachments/{filename}` (если присутствует локально) через Read tool (multimodal)
    - Применить правило `.claude/rules/pomogator/screenshot-driven-verification.md`: описать что ВИДНО, сравнить с ОЖИДАНИЕМ AC, вывести `CONFIRMED` / `DENIED` с обоснованием
    - Если file отсутствует локально (gitignored + переключена ветка) → пометить AC `[EVIDENCE_MISSING: run /jira-intake-resync]` и не утверждать детали UI от головы.
6. **BDD Test Infrastructure Assessment (ОБЯЗАТЕЛЬНО — НЕ пропускать)**

   Агент ОБЯЗАН выполнить следующий алгоритм. Результат записывается в секцию
   `## BDD Test Infrastructure` в DESIGN.md. Секция НЕ МОЖЕТ быть удалена.

   **Шаг 6.1a: TEST_DATA Classification (data impact)**

   Ответить на 4 вопроса (ДА/НЕТ):
   1. Фича создаёт, изменяет или удаляет данные через API/БД/файлы?
   2. Фича изменяет состояние системы, которое нужно откатить после теста?
   3. BDD сценарии из .feature требуют предустановленных данных (Given-шаги с данными)?
   4. Фича взаимодействует с внешними сервисами, требующими mock/stub на уровне теста?

   - Если хотя бы 1 ответ ДА → `TEST_DATA=TEST_DATA_ACTIVE` → перейти к Шагу 6.2
   - Если все ответы НЕТ → `TEST_DATA=TEST_DATA_NONE` → подсекции hooks/fixtures не требуются

   **Шаг 6.1b: TEST_FORMAT Classification (test format) — обязательный новый шаг**

   Дефолт: `TEST_FORMAT=BDD` (для ВСЕХ языков). Escape hatch `TEST_FORMAT=UNIT` используется **только** когда установка BDD framework фактически невозможна — требует непустую `## Risks` секцию в DESIGN.md с обоснованием (иначе validator ERROR).

   **НЕ классифицировать проект как "без BDD" как стабильное состояние.** Если framework ещё не установлен — это **remediation target** для Phase 0 bootstrap block, а не причина выбирать UNIT.

   **Шаг 6.1c: Framework Choice (только если TEST_FORMAT=BDD)**

   Использовать DetectionResult из Phase 1.5 Шаг 4a (`bdd-framework-detector` output):
   - `framework ≠ null` → использовать detected framework, Evidence = positive grep-строка
   - `framework === null` → выбрать из `suggestedFrameworks[]` (обычно первый), Evidence = "not installed in {projectPath} — remediation target (Phase 0 bootstrap block)"

   **Записать в DESIGN.md `## BDD Test Infrastructure`:**
   ```
   **TEST_DATA:** {TEST_DATA_ACTIVE | TEST_DATA_NONE}
   **TEST_FORMAT:** {BDD | UNIT}
   **Framework:** {Reqnroll | SpecFlow | Cucumber.js | Playwright BDD | Behave | pytest-bdd | N/A при UNIT}
   **Install Command:** {actual команда из DetectionResult.installCommand или "already installed"}
   **Evidence:** {detector evidence строки или "grep {marker} in {path}:{line}" или reference на RESEARCH.md Existing Patterns}
   **Verdict:** {какие hooks нужны / Phase 0 bootstrap требуется / hooks не требуются}
   ```

   **Если TEST_DATA_NONE** → перейти к Шагу 7 (FILE_CHANGES.md). Подсекции hooks/cleanup/fixtures не заполнять.

   **Шаг 6.2: Сканирование существующих hooks (ОБЯЗАТЕЛЬНО для TEST_DATA_ACTIVE)**

   Искать в проекте:
   - `**/Hooks/**`, `**/hooks/**`, `**/support/**`
   - `tests/**/hook*`, `tests/**/setup*`, `tests/**/teardown*`
   - `tests/**/helpers*`, `tests/**/fixtures/**`
   - Файлы с `Before`, `After`, `BeforeAll`, `AfterAll` в содержимом

   Для каждого найденного файла заполнить таблицу в DESIGN.md:

   | Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |

   - Если hooks найдены → заполнить подсекцию `### Существующие hooks` с реальными путями
   - Если hooks НЕ найдены → записать: `### Существующие hooks — Не найдены в проекте`

   **Шаг 6.3: Проектирование hooks для этой фичи (ОБЯЗАТЕЛЬНО для TEST_DATA_ACTIVE)**

   Для каждого BDD сценария из .feature, который создаёт/изменяет данные:
   1. Определить: какие данные создаются в Given/When
   2. Определить: как откатить эти данные (API delete, DB rollback, file cleanup)
   3. Если существующий hook подходит → указать `Reuse: {путь}`
   4. Если нужен новый hook → спроектировать с указанием:
      - Путь к файлу hook-а (конкретный, не "TBD")
      - Тип: Before/After/BeforeAll/AfterAll
      - Scope: per-scenario / per-feature / global
      - Cleanup order (если каскадные зависимости)
      - По аналогии с каким существующим hook-ом

   Заполнить в DESIGN.md:
   - `### Новые hooks` — таблица с конкретными файлами и описанием
   - `### Cleanup Strategy` — порядок удаления, каскадные зависимости
   - `### Test Data & Fixtures` — lifecycle каждого fixture
   - `### Shared Context / State Management` — ключи контекста

   **Шаг 6.4: Валидация полноты (self-check)**

   Перед переходом к Шагу 7, проверить:
   - [ ] Каждый Given-шаг из .feature, создающий данные, имеет cleanup hook
   - [ ] Каждый новый hook указан в FILE_CHANGES.md (create)
   - [ ] Каждый переиспользуемый hook указан в FILE_CHANGES.md (edit или reference)
   - [ ] Cleanup Strategy покрывает все каскадные зависимости
   - [ ] Shared Context ключи не конфликтуют с существующими

   **Шаг 6.5: FIXTURES.md (если TEST_DATA_ACTIVE)**

   Если классификация TEST_DATA_ACTIVE → создать FIXTURES.md с детальной информацией:
   - Перенести данные из DESIGN.md "Test Data & Fixtures" таблицы в развёрнутый формат
   - Для каждой фикстуры: Type, Format, Setup, Teardown, Dependencies, Used by (@featureN)
   - Заполнить Dependencies Graph и Gap Analysis
   - В DESIGN.md добавить ссылку: `_Details: see [FIXTURES.md](FIXTURES.md)_`

   Если TEST_DATA_NONE → FIXTURES.md оставить с placeholder-ами (опционально удалить).

7. Заполнить FILE_CHANGES.md
8. **Анализ паттернов .feature (ОБЯЗАТЕЛЬНО перед написанием .feature):**
   `./.dev-pomogator/tools/specs-generator/analyze-features.ts -Format text [-FeatureSlug "{slug}"] [-DomainCode "{DOMAIN}"]`
   На основе отчёта:
   - Использовать Background из самого частого паттерна (не выдумывать)
   - Переиспользовать формулировки шагов из Step Dictionary
   - Использовать следующий свободный domain number из отчёта
   - **Таблицы**: использовать ТОЛЬКО колонки из Table Patterns (не добавлять лишние)
   - **Setup через Given**: данные из ScenarioContext (vendor/customer ID, warehouse ID) — НЕ класть в таблицу
   - **Serial/Batch items**: использовать отдельные When-шаги без таблиц (как в реальных тестах)
   - **Assertions**: копировать формулировки Then из Assertion Patterns
   - Если есть кандидаты — взять за основу, указать `# Source:`
9. Создать {feature-slug}.feature (по правилам ниже, опираясь на отчёт analyze-features)
10. Валидация: `./.dev-pomogator/tools/specs-generator/validate-spec.ts -Path ".specs/{feature}"`
11. Исправить ошибки если есть

**СТОП #2:** Показать Requirements + Design, спросить подтверждение.
После подтверждения: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Requirements`

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

Примеры реальных Background из решения (можно переиспользовать дословно):
- `Given dev-pomogator is installed`
- `And specs-workflow extension is enabled`
- `Given the specs-generator scripts are installed`

Если `Background` уже есть — используй существующий без замены.

### 3) Нет кандидатов .feature

Если подходящих `.feature` нет:
- Используй шаблон, но **все шаги** бери из существующих feature/fixtures/steps
- Пометь файл как черновик (`# DRAFT`) и укажи, на какие источники опирался

### 4) Data Table правила (из analyze-features отчёта)

- В таблицах использовать **ТОЛЬКО** колонки, которые реально передаются в API payload
- Данные, которые резолвятся через ScenarioContext (customer/vendor ID, warehouse ID), передаются через Given step, а НЕ через таблицу
- Serial/batch items используют отдельные When-шаги без таблиц
- Assertion формулировки копировать из отчёта (не придумывать свои)
- Если отчёт показывает кандидат-feature — скопировать его table pattern дословно

---

### PHASE 3: Finalization

**Файлы:** TASKS.md, README.md

**Алгоритм:**

**Step 0 (только если `.specs/{slug}/JIRA_SOURCE.md` существует — Jira-mode):**
Re-read `JIRA_SOURCE.md` Description + `.jira-cache.json` `directives[]` + `ATTACHMENTS.md` с ролями `reproduction-flow` / `error-evidence`. Extract:
- Reproduction steps (video_steps в `.jira-cache.json`) → mapping к implementation tasks (каждый шаг → phase/task). Порядок tasks должен **отражать** порядок видео.
- Error evidence (file:line) → task обязан содержать `_Jira: <file>:<line>_` или `_Jira: <JIRA_SOURCE.md#fragment>_`.
- Directives enumeration → каждый FR (один scope member) → как минимум одна green-task с `_Jira:_` reference.

**Каждая task в TASKS.md ОБЯЗАНА содержать `_Jira:_` строку** в теле блока (в пределах 20 строк после `### 📋 \`task-id\``). Пример:
```markdown
### 📋 `block-picking-over-limit`
> Добавить `picking` в isOutboundDocument() enum.
- **files:** `src/services/StockValidationService.ts` *(edit)*
- **refs:** FR-1, AC-1
- **deps:** *none*
- **_Jira:_** "все доступные сейчас доктайпы, КРОМЕ INBOUND" (JIRA_SOURCE.md Description)
```

1. Заполнить TASKS.md **по TDD-порядку:**
   - **Phase -1 (Infrastructure):** Если DESIGN.md упоминает БД, docker, .env, secrets — добавить Phase -1: Infrastructure Prerequisites. Env vars пометить `[VERIFIED: source]`.
   - **Phase 0 (Red):** .feature файл + step definitions + hooks (заглушки) -- ПЕРВЫЕ задачи
   - **Phase 1-N (Green):** Реализация бизнес-логики, где каждая группа задач привязана к @featureN сценариям
   - **Последний Phase (Refactor):** Рефакторинг + финальная верификация всех сценариев
   - Каждая задача реализации ОБЯЗАНА ссылаться на @featureN сценарий
   - Каждый Phase завершается verify-шагом: "сценарии @featureN переходят из Red в Green"
   - **Config dedup:** Задачи ССЫЛАЮТСЯ на секции DESIGN.md для конфигов, НЕ копируют блоки конфигов дословно. Формат: `_Config: см. DESIGN.md секция "..."_`

   **Phase 0 hooks enforcement (ОБЯЗАТЕЛЬНО):**
   - Если DESIGN.md содержит `TEST_DATA_ACTIVE` → Phase 0 ОБЯЗАН содержать:
     - Задачу для **каждого** hook из DESIGN.md секции "Новые hooks"
     - Задачу для **каждого** fixture из DESIGN.md секции "Test Data & Fixtures"
   - Формат hook-задачи: `- [ ] Создать hook: {путь} ({тип}, {scope}) — cleanup для {данные}`
     `_Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_`
   - Если DESIGN.md содержит `TEST_DATA_NONE` → hook-задачи не нужны
   - Если Phase 0 не содержит hook-задач при TEST_DATA_ACTIVE → ОШИБКА, исправить

2. Сгенерировать README.md
3. Финальная валидация

**Правила TDD-порядка в TASKS.md:**
- .feature, step definitions, и hooks -- ВСЕГДА Phase 0 (первые задачи)
- Зависимости реализации: implementation задачи зависят от Phase 0
- Каждая implementation задача содержит `@featureN` тег
- Каждый Phase содержит verify-шаг (Red->Green проверка)
- Рефакторинг -- ПОСЛЕДНИЙ Phase (после всех Green)

**СТОП #3:** Финальный отчёт со summary.
После подтверждения: `./.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Finalization`

---

### PHASE 3+: Audit (автоматически после СТОП #3)

**Когда запускается:** Автоматически после финализации (СТОП #3 подтверждён), ПЕРЕД объявлением спеки готовой.

**Файл:** AUDIT_REPORT.md (опциональный, не входит в 13 обязательных)

**Алгоритм:**

**Step 0 (только если `.specs/{slug}/JIRA_SOURCE.md` существует — Jira-mode):**
Re-read all three Jira artifacts: `JIRA_SOURCE.md`, `ATTACHMENTS.md`, `.jira-cache.json`. Подготовить checklist для JIRA_DRIFT категории (см. Шаг 2):
- Список CRITICAL directives из `.jira-cache.json` → проверить coverage FR
- Список attachments с hashes → проверить что referenced evidence в FR/AC всё ещё matches
- `last_fetch_at` timestamp → если > 7 дней назад, рекомендация `/jira-intake-resync` до audit

#### Шаг 1: Автоматические проверки

Запустить: `./.dev-pomogator/tools/specs-generator/audit-spec.ts -Path ".specs/{feature}" -Format json`

Скрипт проверяет:
- FR↔AC покрытие (каждый FR-N имеет AC-N)
- FR/AC↔BDD покрытие через @featureN теги
- Полноту traceability matrix в REQUIREMENTS.md
- Незакрытые open questions в RESEARCH.md (`- [ ]`)
- TASKS.md→FR/NFR кросс-ссылки
- Терминологическую консистентность (PascalCase/camelCase варианты)
- **JIRA_DRIFT (только Jira-mode):** `checkJiraDrift` из `audit-checks.ts` сравнивает `.jira-cache.json` vs live Jira (если MCP доступен). Без MCP → INFO "skipped".

#### Шаг 2: AI семантический анализ (6 категорий)

Агент ОБЯЗАН выполнить следующие проверки, читая файлы спеки И реальный код проекта:

**ОШИБКИ (Errors) — расхождения с кодом:**
1. Прочитать DESIGN.md секции про компоненты, reuse plan, файлы реализации — проверить что указанные файлы/классы/методы СУЩЕСТВУЮТ в кодовой базе
2. Прочитать FILE_CHANGES.md — файлы с action=edit реально существуют, файлы с action=create ещё НЕ существуют
3. Проверить правильность имён клиентов/сервисов/API в DESIGN.md и FR.md
4. Найти пометки "Need to add" / "TODO: create" — проверить что эти компоненты действительно отсутствуют

**ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) — непокрытые требования:**
1. Для каждого FR-N проверить полную цепочку: FR → AC → BDD сценарий → задача в TASKS.md
2. Для каждого UC проверить: есть ли связанный FR
3. Для каждой User Story проверить: есть ли связанные UC/FR
4. Для каждого AC проверить: есть ли BDD сценарий (включая edge cases и rollback)
5. **AUDIT_REPORT_EXISTS**: если Phase 3+ Audit завершён — проверить что `.specs/{feature}/AUDIT_REPORT.md` существует и заполнен

**НЕКОНСИСТЕНТНОСТЬ (Inconsistency) — терминологические расхождения:**
1. Сравнить именование сущностей (идентификаторы, параметры API, имена полей) между FR.md, DESIGN.md, .feature, TASKS.md, SCHEMA.md
2. Проверить форматы ID (vendorId vs customerVendorId vs vendor_id)
3. Проверить что тестовые данные в .feature реалистичны (не "PRA" вместо числового ID)
4. **TABLE_ROW_COUNT**: проверить что section headers ("N dirs", "N files", "N entries") совпадают с количеством строк в markdown таблице ниже них

**РУДИМЕНТЫ (Rudiments) — устаревшая информация:**
1. Проверить RESEARCH.md на open questions (`- [ ]`) которые уже имеют ответ в других файлах спеки
2. Проверить нет ли client-side требований в серверной спеке (и наоборот)
3. Проверить нет ли устаревших ссылок, TODO которые уже сделаны, или дублирующих UC

**ФАНТАЗИИ (Fantasies) — непроверенные допущения:**
1. Проверить RESEARCH.md — все ли утверждения об API имеют источник (URL, файл, тест, документация)
2. Проверить DESIGN.md — нет ли API endpoints/методов, помеченных как "работает" без пруфа
3. Проверить нет ли утверждений "API поддерживает X" / "метод возвращает Y" без верификации через live API или тесты

**UNDEFINED_BEHAVIOR (Undefined Behavior) — непокрытые edge cases:**

> Если файл `.claude/rules/specs-workflow/undefined-behavior-taxonomy.md` существует — прочитать его и использовать 9 категорий ниже. Если не существует — пропустить эту категорию (fail-open).

Для каждого FR/UC который описывает workflow (последовательность шагов системы):
1. Извлечь "шаги" (действия системы) из FR.md и USE_CASES.md
2. Для каждого шага проверить релевантные категории из taxonomy: null_empty, network, auth, resource, boundary, concurrency, logic, format, external
3. Для каждого непокрытого случая (спека/AC/.feature НЕ отвечает на вопрос) — добавить finding: node / category / question / severity
4. Для ЗАВИСИМЫХ шагов проверить combined failures (из 12 failure scenarios в taxonomy): "Что если A упал И B упал?"
5. При написании/проверке .feature использовать BVA boundary values из taxonomy для edge case значений

**JIRA_DRIFT (только в Jira-mode — `.jira-cache.json` присутствует):**

Агент ОБЯЗАН выполнить cross-check spec artifacts против Jira source:
1. **Missing trace**: Для каждого FR/AC/BDD scenario/TASKS entry — найти `Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_` line. Отсутствие → finding `JIRA_DRIFT / missing_trace` (severity: WARNING). _(Дублирует JIRA_SOURCE_PRESERVED validator для consolidated view в AUDIT_REPORT.md.)_
2. **Scope enumeration gap**: Для каждого `directives[]` с `scope[]` в `.jira-cache.json` — проверить, что **каждый** scope member имеет FR покрытие OR явный `[WAIVED: "{Jira quote}"]` в `## Out of Scope`. Missing enumeration member → `JIRA_DRIFT / scope_gap`.
3. **CRITICAL directive without FR**: Для каждого directive с `severity: CRITICAL` — ОБЯЗАТЕЛЬНО matching FR с `Jira imperative:` соответствующий quote. Missing → `JIRA_DRIFT / missing_trace` severity ERROR (единственный ERROR-level в категории — CRITICAL directive не прощается).
4. **Hallucinated FR**: FR без `Jira imperative:` (в Jira-mode) **И** без явного `[DERIVED: architectural necessity]` markera — `JIRA_DRIFT / hallucinated_fr` severity WARNING (FR не трассируется ни к Jira, ни к явно помеченному derived решению).
5. **Live drift (если MCP доступен)**: `checkJiraDrift()` (уже вызван в Шаг 1) — результаты добавить в финальный AUDIT_REPORT категорию JIRA_DRIFT.
6. **Multimodal evidence verify**: Для каждого AC с `Screenshot:` / `Video:` reference — попытаться Read attachment; если success — многомодальный re-check описания AC vs ВИДНО (CONFIRMED/DENIED по правилу `screenshot-driven-verification`). Расхождение → `JIRA_DRIFT / visual_mismatch` severity WARNING.

#### Шаг 3: Исправление найденных проблем

Агент ОБЯЗАН автоматически исправить ВСЕ найденные проблемы (автоматические + AI семантические):

1. **ОШИБКИ** — исправить ссылки на несуществующие методы/файлы, убрать "Need to add" для уже существующих компонентов, указать правильные имена
2. **ЛОГИЧЕСКИЕ ПРОБЕЛЫ** — добавить недостающие AC для FR, добавить BDD сценарии для непокрытых AC, добавить ссылки в TASKS.md и REQUIREMENTS.md
3. **НЕКОНСИСТЕНТНОСТЬ** — унифицировать терминологию (выбрать один вариант, заменить во всех файлах), исправить нереалистичные тестовые данные
4. **РУДИМЕНТЫ** — закрыть решённые open questions (`- [x]`), удалить дублирующие UC, убрать client-side требования из серверной спеки
5. **ФАНТАЗИИ** — пометить непроверенные допущения как `[UNVERIFIED]`, добавить задачу live API verification в TASKS.md
6. **UNDEFINED_BEHAVIOR** — для critical/high findings: добавить FR/AC/BDD сценарий покрывающий edge case. Для medium/low: добавить `[KNOWN_UB: {category}]` пометку в FR/AC и задачу в TASKS.md

#### Шаг 4: Повторный аудит

1. Перезапустить `audit-spec.ts` на исправленных файлах
2. Повторить AI семантический анализ
3. Если findings > 0 — повторить Шаг 3 (максимум 3 итерации)

#### Шаг 5: Генерация AUDIT_REPORT.md

1. Создать `.specs/{feature}/AUDIT_REPORT.md` по шаблону из `.dev-pomogator/tools/specs-generator/templates/AUDIT_REPORT.md.template`
2. Записать ВСЕ найденные и исправленные проблемы (что было → что исправлено)
3. Показать summary таблицу пользователю

#### Шаг 6: Финальный /simplify review

После создания AUDIT_REPORT.md — запустить `/simplify` ОДИН раз для финального review всех файлов спеки. Это **единственный** вызов /simplify в workflow — НЕ запускать после каждой STOP-точки (слишком тяжело: 4 цикла по 3 review agents = спам в чат и трата токенов).

**НЕ СТОП-ТОЧКА.** Аудит, исправления и финальный /simplify выполняются автоматически. Пользователь уже дал подтверждение на СТОП #3.

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
| CONTEXT_SECTION | `## Project Context & Constraints` в RESEARCH.md с подсекциями или skip reason | WARNING |
| TDD_TASK_ORDER | Phase 0 (BDD Foundation) или .feature задача в TASKS.md | WARNING |
| CROSS_REF_LINKS | Markdown ссылки `[ID](file.md#anchor)` — целевой файл и якорь существуют | WARNING |
| LINK_VALIDITY | FR/AC/NFR в REQUIREMENTS/TASKS — кликабельные линки, не plain text | ERROR |
| BDD_INFRA | `## BDD Test Infrastructure` в DESIGN.md с Classification (TEST_DATA_ACTIVE/TEST_DATA_NONE) | WARNING |
| BDD_HOOKS_TASKS | Если TEST_DATA_ACTIVE, Phase 0 в TASKS.md содержит задачи для всех hooks из DESIGN.md | WARNING |
| OUT_OF_SCOPE_PROPAGATION | FR с OUT OF SCOPE → связанные UC/AC/User Stories тоже помечены | WARNING |
| UNVERIFIED_CONFIG | Env vars в DESIGN.md без `[VERIFIED]`/`[UNVERIFIED]` маркера | INFO |
| INFRA_TASKS_MISSING | DESIGN.md упоминает инфраструктуру, TASKS.md без infra-задач | WARNING |
| CONFIG_DUPLICATION | Идентичные блоки 3+ строк в DESIGN.md и TASKS.md | INFO |
| OPEN_QUESTIONS | Незакрытые `- [ ]` в RESEARCH.md (escape: `> DEFERRED:` на предыдущей строке) | WARNING |
| FIXTURES_CONSISTENCY | TEST_DATA_ACTIVE в DESIGN.md, но FIXTURES.md отсутствует или пуст | WARNING |
| JIRA_SOURCE_PRESERVED | _(conditional: только если `JIRA_SOURCE.md` exists)_ FR/AC/BDD/TASKS содержат trace (`Jira imperative:` / `Jira acceptance:` / `Evidence:` / `# Jira trace:` / `_Jira:_`) к `JIRA_SOURCE.md`. Opt-out: удалить `JIRA_SOURCE.md` → правило no-op. | WARNING |
| JIRA_DRIFT | _(conditional: только если `.jira-cache.json` exists)_ `.jira-cache.json` cached snapshot vs live Jira (при MCP доступе): новые comments, изменённые attachments, drift description; missing trace; scope enumeration gaps; hallucinated FR; visual mismatch. MCP недоступен → INFO "skipped". | WARNING / ERROR (missing CRITICAL directive) |
| FILE_CHANGES_COMPLETENESS | Файлы из TASKS.md `**files:**` отсутствуют в FILE_CHANGES.md | WARNING |
| FILE_CHANGES_VERIFY | FILE_CHANGES.md action=edit для несуществующего файла | ERROR |
| COUNT_CONSISTENCY | Числовые claims ("N FR") расходятся с фактическими counts | WARNING |
| FEATURE_TAG_PROPAGATION | @featureN из .feature отсутствует в TASKS.md | WARNING |
| SCENARIO_COUNT_SYNC | "N scenarios" в README/CHANGELOG расходится с actual .feature count | WARNING |
| AC_TAG_SYNC | @featureN в FR-N отсутствует в matching AC-N header | WARNING |
| PHANTOM_CREATE_SOURCE | FILE_CHANGES action=create "Move from X" — source X не существует | WARNING |
| PROSE_COUNT_SYNC | "N phase/orphan/duplicate" claims расходятся с actual counts | WARNING |
| TABLE_ROW_COUNT | _(AI check)_ Section header count vs actual table rows | — |
| AUDIT_REPORT_EXISTS | _(AI check)_ AUDIT_REPORT.md отсутствует после Phase 3+ | — |

---

## Связанные правила

- `plan-pomogator.md` — использует EARS формат из спеков
- `research-workflow.md` — интегрируется с RESEARCH.md

## Эталонная структура

Референс: `.specs/hook-worklog-checker/`
