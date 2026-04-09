# Design

## Реализуемые требования

- [FR-1: prompt-capture использует session_id из hook input](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1)
- [FR-2: prompt-capture не пишет default.json при отсутствии session_id](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2)
- [FR-3: prompt-capture фильтрует task-notification псевдо-промпты](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3)
- [FR-4: plan-gate loadUserPrompts не имеет most-recent fallback](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4)
- [FR-5: plan-gate formatPromptsFromFile фильтрует task-notification на чтении](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5)

## Компоненты

- **`prompt-capture.ts`** (UserPromptSubmit hook writer) — принимает hook input от Claude Code, валидирует, фильтрует псевдо-промпты, сохраняет в session-specific JSON файл с rolling window 10 промптов.
- **`plan-gate.ts`** (PreToolUse hook reader) — при ExitPlanMode валидирует план в 4 фазах. На Phase 2 ошибке читает текущие промпты сессии для inclusion в deny-сообщение.
- **`prompt-store.ts`** (shared module) — НЕ ИЗМЕНЯЕТСЯ. Стабильный contract для read/write/path operations: `getPromptFilePath`, `readPromptFile`, `writePromptFile`, `sanitizeSessionId`. Reuse полностью.

## Где лежит реализация

- App-код (source of truth): `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts`, `plan-gate.ts`, `prompt-store.ts`
- Installed copies (реально вызываются hook-ом): `.dev-pomogator/tools/plan-pomogator/prompt-capture.ts`, `plan-gate.ts`, `prompt-store.ts`
- Hook регистрация (manifest): `extensions/plan-pomogator/extension.json:35-48`
- Runtime cache: `~/.dev-pomogator/.plan-prompts-{session_id}.json` (one file per session)

## Директории и файлы

- `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts` (edit, lines 31, 85, 88)
- `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` (edit, lines 64-117)
- `.dev-pomogator/tools/plan-pomogator/prompt-capture.ts` (edit — installed copy)
- `.dev-pomogator/tools/plan-pomogator/plan-gate.ts` (edit — installed copy)
- `tests/e2e/plan-validator.test.ts` (edit — добавить describe PLUGIN007_43)
- `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (edit — добавить 5 сценариев)
- `extensions/plan-pomogator/extension.json` (edit — version bump)

## Алгоритм

### Изменение в prompt-capture.ts main()

1. **Read stdin** — без изменений (`readStdin()` функция)
2. **Parse JSON** — без изменений (try/catch fail-open)
3. **Trim prompt** — без изменений (`prompt.trim()`)
4. **Empty check** — без изменений (`if (!prompt) return`)
5. **NEW: Filter task-notification** — добавить `if (/^<task-notification\b/i.test(prompt)) return;` для skip псевдо-промптов от background задач
6. **Session ID extraction** — заменить `const sessionId = input.conversation_id || 'default'` на `const sessionId = input.session_id; if (!sessionId) return;` для использования правильного field name и graceful exit без default fallback
7. **Read existing / append / rolling window / write** — без изменений (logic preserved)
8. **Probabilistic GC** — без изменений (после fix будет per-session, GC заработает естественно)

### Изменение в plan-gate.ts loadUserPrompts()

Текущая логика (lines 64-102):
1. Try session-specific file → return if found
2. Fallback: readdirSync, find most-recent by mtime → return if found
3. Return empty string

Новая логика:
1. If `!sessionId` → return empty string immediately
2. Try `formatPromptsFromFile(getPromptFilePath(sessionId))` → return result or empty string
3. Удаляется весь fallback блок (lines 74-97)

### Изменение в plan-gate.ts formatPromptsFromFile()

Текущая логика (lines 104-117):
1. Read prompt file → return null if empty
2. Slice last MAX_PROMPT_DISPLAY entries
3. Format with truncation

Новая логика:
1. Read prompt file → return null if empty
2. **NEW: Filter task-notification entries** — `const real = data.prompts.filter((p) => !/^<task-notification\b/i.test(p.text)); if (real.length === 0) return null;`
3. Slice last MAX_PROMPT_DISPLAY from `real` (not `data.prompts`)
4. Format with truncation

Также: добавить `export` к `function formatPromptsFromFile` для использования в тестах PLUGIN007_43_05.

## API

N/A — фича не добавляет новых HTTP endpoints или public APIs. Все изменения internal к hook скриптам, contract через stdin/stdout JSON остаётся прежним.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_NONE

**Evidence:** Ответы на 4 вопроса классификации:
1. **Создаёт ли фича данные через API/БД/файлы?** Частично — тесты создают временный HOME через `os.tmpdir()` и spawnSync пишет в него JSON файлы. Но это test fixtures которые удаляются в `afterEach`, не production data, не shared state между тестами. Каждый it-блок создаёт свой `tmpHome` и удаляет его.
2. **Изменяет ли фича состояние системы которое нужно откатить?** НЕТ. prompt-capture пишет в `~/.dev-pomogator/.plan-prompts-*.json`, тесты переопределяют HOME env var через spawnSync, поэтому реальный home пользователя не затрагивается. Никакого global state mutation.
3. **Требуют ли BDD сценарии предустановленных данных?** НЕТ. Каждый сценарий PLUGIN007_43..47 полностью self-contained: создаёт inline JSON content (для FR-5 fixtures), spawnSync вызывает скрипт со stdin input, проверяет результат на файловой системе или через прямой импорт функции.
4. **Взаимодействует ли с внешними сервисами требующими mock/stub?** НЕТ. Никаких HTTP клиентов, БД, Claude API. Только child process spawn (`npx tsx prompt-capture.ts`) с inherited stdio через pipe.

**Verdict:** Hooks/fixtures BDD framework не требуются. Все 5 регрессионных тестов stateless и self-contained: каждый создаёт временный HOME в `beforeEach`, запускает spawnSync с inline input, проверяет файлы в этом HOME, удаляет HOME в `afterEach`. Никаких BeforeScenario/AfterScenario hooks для setup/cleanup. Никаких shared fixtures между тестами.

<!-- Подсекции "Существующие hooks", "Новые hooks", "Cleanup Strategy", "Test Data & Fixtures", "Shared Context" — НЕ заполняем потому что TEST_DATA_NONE. Они опущены. -->
