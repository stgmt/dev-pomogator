# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл и скопировать в tests/features.
> Сценарии документируют поведение — ручная верификация через Claude Code runtime.

- [ ] Скопировать `.specs/prompt-suggest/prompt-suggest.feature` в `tests/features/plugins/prompt-suggest/PLUGIN010_prompt-suggest.feature`
  _Requirements: все FR/AC_

## Phase 1: Extension Manifest + Core Module (Green) @feature1 @feature3 @feature5

> Создать манифест расширения и core module с конфигом, state, LLM, utils.

- [ ] Создать `extensions/prompt-suggest/extension.json` — platforms=["claude"], hooks (Stop + UserPromptSubmit), toolFiles @feature1 @feature2
  _Requirements: [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-)_

- [ ] Создать `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_core.ts` — типы, loadConfig, state CRUD (atomic write), JSONL парсер, callSuggestionLLM, redactSecrets, log @feature1 @feature3 @feature5
  _Requirements: [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-3](FR.md#fr-3-auto-detect-api), [FR-4](FR.md#fr-4-ttl-для-state-file), [FR-5](FR.md#fr-5-fail-open), [FR-7](FR.md#fr-7-silence--пустой-ответ-llm)_
  _Leverage: `extensions/auto-commit/tools/auto-commit/auto_commit_stop.ts` (redactSecrets), `extensions/auto-commit/tools/auto-commit/auto_commit_core.ts` (atomic write)_

- [ ] Создать `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_prompt.md` — адаптация v2 промпта @feature6
  _Requirements: [FR-6](FR.md#fr-6-системный-промпт-v2)_
  _Leverage: [Claude Code v2 prompt](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/agent-prompt-prompt-suggestion-generator-v2.md)_

- [ ] Verify: extension.json валиден, core.ts компилируется, prompt.md соответствует v2

## Phase 2: Stop Hook (Green) @feature1 @feature7 @feature8 @feature9

> Реализовать Stop hook: stdin → parse → LLM → state + systemMessage.

- [ ] Создать `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_stop.ts` — Stop hook с полным flow @feature1 @feature7 @feature8 @feature9
  _Requirements: [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-7](FR.md#fr-7-silence--пустой-ответ-llm), [FR-8](FR.md#fr-8-stop_hook_active-guard), [FR-9](FR.md#fr-9-systemmessage-с--emoji)_
  _Leverage: `extensions/auto-simplify/tools/auto-simplify/simplify_stop.ts` (stdin pattern, fail-open)_

- [ ] Verify: сценарии @feature1, @feature7, @feature8, @feature9 — ручная проверка через Claude Code

## Phase 3: Submit Hook (Green) @feature2 @feature4

> Реализовать Submit hook: "+" → additionalContext.

- [ ] Создать `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_submit.ts` — Submit hook с TTL check @feature2 @feature4
  _Requirements: [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-), [FR-4](FR.md#fr-4-ttl-для-state-file)_
  _Leverage: `extensions/suggest-rules/tools/learnings-capture/capture.ts` (UserPromptSubmit pattern)_

- [ ] Verify: сценарии @feature2, @feature4 — ручная проверка через Claude Code

## Phase 4: Build, Install & Verify

- [ ] `npm run build` — компиляция без ошибок
- [ ] `node dist/index.cjs --claude --all` — установка, хуки в `.claude/settings.json`
- [ ] Ручная верификация: сессия → 💡 подсказка → `+` → инжекция
