# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/prompt-suggest/extension.json` | create | [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-) — манифест расширения |
| `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_core.ts` | create | [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-3](FR.md#fr-3-auto-detect-api) — config, state, LLM, JSONL parser |
| `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_prompt.md` | create | [FR-6](FR.md#fr-6-системный-промпт-v2) — системный промпт |
| `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_stop.ts` | create | [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки), [FR-9](FR.md#fr-9-systemmessage-с--emoji) — Stop hook |
| `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_submit.ts` | create | [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-) — Submit hook |
| `tests/features/plugins/prompt-suggest/PLUGIN010_prompt-suggest.feature` | create | BDD сценарии для тестового runner-а |
