# Plan Pomogator Prompt Isolation

Багфикс для plan-pomogator hooks `prompt-capture.ts` и `plan-gate.ts`. Устраняет cross-session leak в Phase 2 deny-сообщении plan-gate, когда показывались промпты из других задач/сессий, а также фильтрует системные псевдо-промпты `<task-notification>` от background задач.

## Ключевые идеи

- **Session isolation через session_id**: `prompt-capture.ts` читает `input.session_id` (не `conversation_id`) для записи в session-specific файл `.plan-prompts-{session_id}.json`. Без fallback на общий `default.json`.
- **Filter task-notification на capture**: Псевдо-промпты от background задач Claude Code (`<task-notification>...</task-notification>`) пропускаются на этапе записи через regex `^<task-notification\b/i`.
- **No most-recent fallback в plan-gate**: `loadUserPrompts` НЕ ищет «свежий» файл из общей home-директории при отсутствии session-specific. Возвращает пустую строку (нарушение `hook-global-state-cwd-scoping.md`).
- **Defense-in-depth filter на чтении**: `formatPromptsFromFile` дополнительно фильтрует task-notification entries при чтении файла, защищая от legacy данных.

## Где лежит реализация

- **App-код (source)**: `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts`, `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts`
- **Installed copies**: `.dev-pomogator/tools/plan-pomogator/prompt-capture.ts`, `.dev-pomogator/tools/plan-pomogator/plan-gate.ts`
- **Hook регистрация**: `extensions/plan-pomogator/extension.json` (PreToolUse + UserPromptSubmit)
- **Runtime cache**: `~/.dev-pomogator/.plan-prompts-{session_id}.json`
- **Тесты**: `tests/e2e/plan-validator.test.ts` (describe `PLUGIN007_43`), `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (5 сценариев `@feature43`)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 4 user stories для разных ролей (developer, parallel sessions, maintainer)
- [USE_CASES.md](USE_CASES.md) — 6 use cases (happy path + background task + parallel + legacy + edge case + defense)
- [RESEARCH.md](RESEARCH.md) — Root cause анализ 4 багов с line numbers + Project Context & Constraints
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix FR ↔ AC ↔ @featureN
- [FR.md](FR.md) — 7 functional requirements с маппингом на код
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability требования
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 7 EARS критериев приёмки
- [DESIGN.md](DESIGN.md) — Архитектура fix + BDD Test Infrastructure (TEST_DATA_NONE)
- [TASKS.md](TASKS.md) — TDD план задач Phase 0 → Phase 1 → Phase 2 → Phase 3
- [FILE_CHANGES.md](FILE_CHANGES.md) — Список всех файлов реализации
- [plan-pomogator-prompt-isolation.feature](plan-pomogator-prompt-isolation.feature) — 5 BDD сценариев Gherkin
- [CHANGELOG.md](CHANGELOG.md) — История изменений спеки
