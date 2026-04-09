# Functional Requirements (FR)

## FR-1: prompt-capture использует session_id из hook input @feature1

`prompt-capture.ts` ОБЯЗАН читать `input.session_id` (snake_case, как передаёт Claude Code в UserPromptSubmit hook input) и использовать его как primary key для имени файла кэша `~/.dev-pomogator/.plan-prompts-{session_id}.json`. Поле `conversation_id` НЕ ДОЛЖНО использоваться (legacy название из ошибочной реализации).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--план-не-проходит-phase-2-deny-содержит-только-релевантные-промпты-feature1)

## FR-2: prompt-capture не пишет default.json при отсутствии session_id @feature2

Если `input.session_id` отсутствует или пустая строка, `prompt-capture.ts` ОБЯЗАН выйти БЕЗ записи в файл (`return` без записи). Никакого fallback на `'default'` или другой синтетический ID. Это предотвращает возрождение проблемы общего файла, в который пишут все сессии.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-5](USE_CASES.md#uc-5-edge-case-отсутствие-session_id-feature2)

## FR-3: prompt-capture фильтрует task-notification псевдо-промпты @feature3

`prompt-capture.ts` ОБЯЗАН пропускать (не сохранять в кэш) промпты, начинающиеся с `<task-notification` (case-insensitive, с возможным атрибутом или закрывающей `>`). Эти псевдо-промпты инжектятся Claude Code как user-message от завершившихся background-задач, но они НЕ являются реальным пользовательским вводом. Регекс проверки: `/^<task-notification\b/i`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-background-задача-с-task-notification--фильтрация-системных-псевдо-промптов-feature3)

## FR-4: plan-gate loadUserPrompts не имеет most-recent fallback @feature4

`plan-gate.ts` функция `loadUserPrompts(sessionId)` ОБЯЗАНА вернуть пустую строку при отсутствии `sessionId` или при отсутствии файла `.plan-prompts-{sessionId}.json` — БЕЗ fallback на most-recent файл из общей директории `~/.dev-pomogator/`. Удаляется блок `// Fallback: find most recent prompt file` (текущие строки 74-97). Это нарушает правило `hook-global-state-cwd-scoping.md` для глобальных директорий.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-3](USE_CASES.md#uc-3-параллельные-сессии--изоляция-кэшей-feature4), [UC-4](USE_CASES.md#uc-4-legacy-defaultjson--graceful-degradation-feature4)

## FR-5: plan-gate formatPromptsFromFile фильтрует task-notification на чтении @feature5

`plan-gate.ts` функция `formatPromptsFromFile` ОБЯЗАНА (defense-in-depth) фильтровать на чтении любые записи `.text` начинающиеся с `<task-notification` (тот же регекс что в FR-3) ПЕРЕД формированием формата вывода. Это защищает от: (а) legacy `default.json` файлов у пользователей которые получат update, (б) будущих багов в capture-коде, (в) ручного редактирования файлов кэша.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-6](USE_CASES.md#uc-6-defense-in-depth-plan-gate-видит-legacy-mix-данные-feature5)

## FR-6: Спецификация .specs/plan-pomogator-prompt-isolation/ полна и валидна

> Meta-FR (process requirement): описывает качество самой спеки, не runtime поведение. Не имеет BDD сценария потому что проверяется через `validate-spec.ts` (см. AC-6), а не через Gherkin.

Спецификация ОБЯЗАНА содержать все 15 файлов структуры (USER_STORIES, USE_CASES, RESEARCH, REQUIREMENTS, FR, NFR, ACCEPTANCE_CRITERIA, DESIGN, TASKS, FILE_CHANGES, README, CHANGELOG, .feature, _SCHEMA, FIXTURES) и проходить `validate-spec.ts -Path .specs/plan-pomogator-prompt-isolation` без ERROR-уровень замечаний (warnings допустимы при оправдании). Это процессное требование пользователя для фиксации багфикса.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** см. US-4 в USER_STORIES.md

## FR-7: Регрессионные тесты покрывают FR-1..FR-5 интеграционно

> Meta-FR (process requirement): описывает test coverage для FR-1..FR-5, а не runtime поведение. Не имеет собственного BDD сценария потому что сами регрессионные тесты И есть BDD сценарии (PLUGIN007_43_01..05) для FR-1..FR-5.

Регрессионные e2e тесты ОБЯЗАНЫ покрывать FR-1..FR-5 через интеграционные сценарии: `spawnSync('npx tsx prompt-capture.ts', input)` для FR-1..FR-3 (тест реального скрипта с временным `HOME` env var) и прямой импорт `formatPromptsFromFile` через ES module для FR-5 (юнит-уровень для read-side функции). Тест-suite размещается в `tests/e2e/plan-validator.test.ts` под describe `PLUGIN007_43 prompt-capture & plan-gate session isolation`. Дополнительно — 5 BDD сценариев в глобальном `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` для 1:1 соответствия согласно `extension-test-quality.md`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** см. US-1, US-2, US-3 в USER_STORIES.md
