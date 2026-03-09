# Functional Requirements (FR)

## FR-1: Stop Hook — генерация подсказки @feature1

Stop hook читает `last_assistant_message` из stdin и первый user message из `transcript_path` (JSONL), вызывает Haiku LLM с адаптированным v2 промптом, записывает результат в state file `~/.claude/prompt-suggestion.json`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-stop-hook-генерация-подсказки)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--генерация-и-активация-подсказки)

## FR-2: Submit Hook — инжекция подсказки через "+" @feature2

UserPromptSubmit hook при `prompt.trim() === "+"` читает state file, проверяет TTL, и добавляет подсказку через `additionalContext`. После инжекции state file очищается.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-submit-hook-инжекция-подсказки), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-pass-through-без-подсказки)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--генерация-и-активация-подсказки), [UC-3](USE_CASES.md#uc-3--без-подсказки), [UC-4](USE_CASES.md#uc-4-ttl-истёк)

## FR-3: Auto-detect API @feature3

Автоматическое определение API: OPENROUTER_API_KEY → `https://openrouter.ai/api/v1`, AUTO_COMMIT_API_KEY → `https://aipomogator.ru/go/v1`. Приоритет: OPENROUTER.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-3-openrouter-api), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-3-aipomogator-api)
**Use Case:** [UC-2](USE_CASES.md#uc-2-нет-ключа-api)

## FR-4: TTL для state file @feature4

State file имеет TTL 600000 мс (10 мин), настраиваемый через `PROMPT_SUGGEST_TTL`. Истёкшие подсказки очищаются при чтении.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-pass-through-без-подсказки)
**Use Case:** [UC-4](USE_CASES.md#uc-4-ttl-истёк)

## FR-5: Fail-open @feature5

Оба хука завершаются exit(0) на любую ошибку. Ошибки логируются в stderr. Если `PROMPT_SUGGEST_ENABLED=false` — оба хука возвращают немедленно.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-5-disabled)
**Use Case:** [UC-5](USE_CASES.md#uc-5-disabled)

## FR-6: Системный промпт v2 @feature6

Системный промпт адаптирован из Claude Code Prompt Suggestion Generator v2: user perspective, "just about to type that" test, 2-12 слов, silence option, NEVER SUGGEST list (evaluative, questions, Claude-voice, new ideas), few-shot examples, match user's language/style.

**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--генерация-и-активация-подсказки)

## FR-7: Silence — пустой ответ LLM @feature7

Если LLM вернул пустоту (silence) → state file НЕ создаётся, systemMessage НЕ выводится.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7-silence)
**Use Case:** [UC-6](USE_CASES.md#uc-6-silence--llm-не-предложил-подсказку)

## FR-8: stop_hook_active guard @feature8

Если `stop_hook_active === true` в stdin Stop hook — skip генерации подсказки (предотвращение бесконечного цикла).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-stop_hook_active)
**Use Case:** [UC-7](USE_CASES.md#uc-7-stop_hook_active--true)

## FR-9: systemMessage с 💡 emoji @feature9

Stop hook выводит подсказку через `systemMessage: "💡 {suggestion}"` — юзер видит её сразу после остановки агента. Визуальная заметность через emoji.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-9-systemmessage)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path--генерация-и-активация-подсказки)
