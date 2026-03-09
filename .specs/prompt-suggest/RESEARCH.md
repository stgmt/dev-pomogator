# Research

## Контекст

Исследование архитектуры подсказок к промптам для Claude Code: какие решения существуют, как делать качественные подсказки, какие API доступны.

## Источники

- [Claude Code Prompt Suggestion Generator v2](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/agent-prompt-prompt-suggestion-generator-v2.md) — production промпт Anthropic
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — официальная документация API хуков

## Технические находки

### Claude Code v2 Prompt Suggestion Generator

Anthropic уже решили задачу генерации подсказок. Их production промпт (296 токенов) определяет:
- **User perspective**: предсказывать что ЮЗЕР набрал бы, не что AI считает нужным
- **"Just about to type that" test**: gold standard качества подсказки
- **Silence option**: если неочевидно → не предлагать ничего
- **2-12 слов**, match user's style
- **NEVER SUGGEST list**: evaluative ("looks good"), questions ("what about...?"), Claude-voice ("Let me..."), new ideas, multiple sentences
- **Few-shot examples**: конкретные пары контекст→подсказка

### Claude Code Hooks API — Stop hook

- Input: `session_id`, `transcript_path`, `cwd`, `stop_hook_active`, `last_assistant_message`
- Output: `decision` ("approve"/"block"), `reason`, `systemMessage`
- `systemMessage` — текст, показываемый юзеру сразу после остановки агента
- `stop_hook_active` — true если другой Stop hook уже заблокировал остановку
- `last_assistant_message` — последний ответ Claude без парсинга транскрипта

### Claude Code Hooks API — UserPromptSubmit hook

- Input: `session_id`, `prompt`, `cwd`
- Output: `decision`, `reason`, `additionalContext`
- `additionalContext` — текст, добавляемый к контексту Claude
- `suppressMessage` НЕ существует в API

### systemMessage для визуализации подсказки

Stop hook может вернуть `systemMessage` — юзер видит текст сразу после остановки. Используем для `💡 {suggestion}` — глаз цепляется за emoji, быстро читаешь, решаешь нажать `+` или нет.

## Где лежит реализация

- Hook scripts: `extensions/prompt-suggest/tools/prompt-suggest/`
- State file: `~/.claude/prompt-suggestion.json`
- Manifest: `extensions/prompt-suggest/extension.json`

## Выводы

1. Используем v2 промпт Anthropic как основу системного промпта (адаптация)
2. `last_assistant_message` из Stop hook + первый user message из transcript JSONL → данные для LLM
3. `systemMessage` с 💡 emoji → мгновенная визуализация подсказки
4. `additionalContext` в Submit hook → инжекция подсказки при вводе "+"
5. State file (`~/.claude/prompt-suggestion.json`) → IPC между Stop и Submit hooks

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp+rename | Запись state file | FR-1, NFR-Reliability |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth | Создание расширения | Manifest |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты только через Docker | BDD сценарии | .feature |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|------------------|-----------|
| auto-simplify | `extensions/auto-simplify/tools/auto-simplify/simplify_stop.ts` | Stop hook fail-open pattern, stdin reader, atomic marker write | Stop hook паттерн |
| auto-commit | `extensions/auto-commit/tools/auto-commit/auto_commit_stop.ts` | LLM call, redactSecrets(), transcript parse | LLM caller, redact |
| auto-commit | `extensions/auto-commit/tools/auto-commit/auto_commit_llm.ts` | OpenAI-compatible LLM client | callLLM() reference |
| learnings-capture | `extensions/suggest-rules/tools/learnings-capture/capture.ts` | UserPromptSubmit hook pattern, platform detection | Submit hook паттерн |

### Architectural Constraints Summary

- Stop hook должен быть fail-open (exit 0 всегда) — аналогично auto-simplify
- State file пишется атомарно (temp + rename) — правило atomic-config-save
- Extension manifest — единственный source of truth для installer-а
- Хуки требуют Claude Code runtime → manual verification, не Docker E2E тесты
