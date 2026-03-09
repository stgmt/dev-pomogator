# Acceptance Criteria (EARS)

## AC-1 (FR-1): Stop Hook — генерация подсказки @feature1

**Требование:** [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки)

WHEN Stop hook fires AND `stop_hook_active` is false AND API key configured THEN system SHALL parse transcript for first user message, combine with `last_assistant_message`, call Haiku LLM, and write state file only if suggestion is non-empty.

## AC-2 (FR-2): Submit Hook — инжекция подсказки @feature2

**Требование:** [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-)

WHEN user submits "+" AND valid non-expired suggestion exists in state file THEN system SHALL add suggestion text via `additionalContext` and clear state file.

## AC-3 (FR-2): Pass-through без подсказки @feature2

**Требование:** [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-)

WHEN user submits "+" AND no state file exists or TTL expired THEN system SHALL pass through without modification.

## AC-4 (FR-5): Disabled @feature5

**Требование:** [FR-5](FR.md#fr-5-fail-open)

IF `PROMPT_SUGGEST_ENABLED=false` THEN both hooks SHALL return immediately with exit(0).

## AC-5 (FR-7): Silence @feature7

**Требование:** [FR-7](FR.md#fr-7-silence--пустой-ответ-llm)

WHEN LLM returns empty or whitespace-only response THEN system SHALL NOT write state file AND SHALL NOT output systemMessage.

## AC-6 (FR-9): systemMessage @feature9

**Требование:** [FR-9](FR.md#fr-9-systemmessage-с--emoji)

WHEN Stop hook generates non-empty suggestion THEN system SHALL output JSON with `systemMessage` field containing 💡 emoji prefix followed by suggestion text.

## AC-7 (FR-3): OpenRouter API @feature3

**Требование:** [FR-3](FR.md#fr-3-auto-detect-api)

WHEN OPENROUTER_API_KEY is set THEN system SHALL use `https://openrouter.ai/api/v1` as base URL.

## AC-8 (FR-3): aipomogator API @feature3

**Требование:** [FR-3](FR.md#fr-3-auto-detect-api)

WHEN only AUTO_COMMIT_API_KEY is set AND OPENROUTER_API_KEY is not set THEN system SHALL use `https://aipomogator.ru/go/v1` as base URL.

## AC-9 (FR-8): stop_hook_active @feature8

**Требование:** [FR-8](FR.md#fr-8-stop_hook_active-guard)

WHEN stop_hook_active is true THEN Stop hook SHALL skip suggestion generation and output empty JSON.
