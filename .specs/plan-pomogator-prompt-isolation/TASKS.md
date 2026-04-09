# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature сценарии и e2e регрессионные тесты ПЕРЕД реализацией бизнес-логики.
> Все тесты должны FAIL (Red) на этом этапе.
>
> Classification из DESIGN.md: **TEST_DATA_NONE** — hooks/fixtures BDD framework не требуются. Каждый тест self-contained через `os.tmpdir()` HOME override.

- [ ] Добавить describe `PLUGIN007_43 prompt-capture & plan-gate session isolation` в `tests/e2e/plan-validator.test.ts` после существующего PLUGIN007_42 (около line 897) с beforeEach создающим временный HOME через `os.tmpdir()` и afterEach удаляющим
- [ ] Создать it `PLUGIN007_43_01: prompt-capture writes to session-specific file` через spawnSync('npx', ['tsx', captureScript], {input: JSON.stringify({session_id, prompt}), env: {...process.env, HOME: tmpHome, USERPROFILE: tmpHome}})
  _Source: spec FR-1 + AC-1, BDD scenario PLUGIN007_43_01 @feature1_
- [ ] Создать it `PLUGIN007_43_02: prompt-capture writes nothing without session_id` (input без session_id, проверить что директория .dev-pomogator не создана или пуста)
  _Source: spec FR-2 + AC-2, BDD scenario PLUGIN007_43_02 @feature2_
- [ ] Создать it `PLUGIN007_43_03: prompt-capture filters task-notification` (input с `<task-notification>` prompt, проверить что файл не создан или не содержит entry)
  _Source: spec FR-3 + AC-3, BDD scenario PLUGIN007_43_03 @feature3_
- [ ] Создать it `PLUGIN007_43_04: loadUserPrompts returns empty for unknown session` (создать другой `.plan-prompts-other.json`, импортировать `loadUserPrompts` из plan-gate, вызвать с unknown sessionId, проверить пустую строку)
  _Source: spec FR-4 + AC-4, BDD scenario PLUGIN007_43_04 @feature4_
- [ ] Создать it `PLUGIN007_43_05: formatPromptsFromFile filters task-notification on read` (создать файл с mix entries, импортировать `formatPromptsFromFile`, вызвать, проверить что в результате нет "<task-notification" но есть real prompts)
  _Source: spec FR-5 + AC-5, BDD scenario PLUGIN007_43_05 @feature5_
- [ ] Добавить 5 BDD сценариев `# @feature43` в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` после PLUGIN007_42 (1:1 mapping с тестами PLUGIN007_43_01..05)
- [ ] Убедиться что все 5 тестов FAIL (Red) — `vitest run -t PLUGIN007_43`

## Phase 1: prompt-capture fix (Green @feature1-3)

> Реализовать fix для prompt-capture.ts, чтобы тесты PLUGIN007_43_01..03 стали Green.

- [ ] Переименовать `conversation_id` → `session_id` в `HookInput` interface (line 31 файла `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts`) -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1)_
- [ ] В main() (line 88) заменить `const sessionId = input.conversation_id || 'default';` на `const sessionId = input.session_id; if (!sessionId) return;` -- @feature1 @feature2
  _Requirements: [FR-1](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1), [FR-2](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2)_
- [ ] В main() после `if (!prompt) return;` (line 86) добавить `if (/^<task-notification\b/i.test(prompt)) return;` -- @feature3
  _Requirements: [FR-3](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3)_
- [ ] Verify: тесты PLUGIN007_43_01, PLUGIN007_43_02, PLUGIN007_43_03 переходят из Red в Green

## Phase 2: plan-gate fix (Green @feature4-5)

> Реализовать fix для plan-gate.ts, чтобы тесты PLUGIN007_43_04..05 стали Green.

- [ ] В `loadUserPrompts` (lines 64-102 файла `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts`) удалить весь fallback блок `// Fallback: find most recent prompt file` (lines 74-97) -- @feature4
  _Requirements: [FR-4](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4)_
- [ ] Упростить `loadUserPrompts` до early return при `!sessionId` и одного вызова `formatPromptsFromFile(getPromptFilePath(sessionId))` -- @feature4
  _Requirements: [FR-4](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4)_
- [ ] В `formatPromptsFromFile` (lines 104-117) перед `data.prompts.slice(-MAX_PROMPT_DISPLAY)` добавить filter `const real = data.prompts.filter((p) => !/^<task-notification\b/i.test(p.text)); if (real.length === 0) return null;` -- @feature5
  _Requirements: [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5)_
- [ ] Использовать `real.slice(-MAX_PROMPT_DISPLAY)` вместо `data.prompts.slice(...)` в map block -- @feature5
  _Requirements: [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5)_
- [ ] Изменить `function formatPromptsFromFile(...)` на `export function formatPromptsFromFile(...)` для импорта в тестах -- @feature5 @feature7
  _Requirements: [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5), [FR-7](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно-feature7)_
- [ ] Verify: тесты PLUGIN007_43_04, PLUGIN007_43_05 переходят из Red в Green

## Phase 3: Refactor & Polish

- [ ] `npm run build` — компиляция TypeScript, проверка типов
- [ ] Скопировать обновлённые `prompt-capture.ts` и `plan-gate.ts` в installed location `.dev-pomogator/tools/plan-pomogator/` (post-edit-verification.md правило)
- [ ] Запустить `/run-tests --filter PLUGIN007` через `run_in_background: true` (no-blocking-on-tests.md)
- [ ] Дождаться завершения тестов через task-notification, проверить все 5 PLUGIN007_43_NN зелёные
- [ ] Bump `extensions/plan-pomogator/extension.json` версия `1.8.0` → `1.8.1` (semver patch для bugfix)
- [ ] Удалить stale `~/.dev-pomogator/.plan-prompts-default.json` через `rm` (одноразовая cleanup, не commit)
- [ ] Запустить `/simplify` review всех изменений (simplify-extended.md)
- [ ] Запустить `validate-spec.ts -Path .specs/plan-pomogator-prompt-isolation` → 0 ERROR замечаний (FR-6)
  _Requirements: [FR-6](FR.md#fr-6-спецификация-specsplan-pomogator-prompt-isolation-полна-и-валидна)_
- [ ] Все BDD сценарии PLUGIN007_43..47 GREEN
- [ ] Manual verification: создать заведомо broken план, ExitPlanMode → проверить что Phase 2 deny НЕ содержит `<task-notification>` блоков и фраз из других задач
