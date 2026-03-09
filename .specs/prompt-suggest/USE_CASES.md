# Use Cases

## UC-1: Happy path — генерация и активация подсказки @feature1 @feature2 @feature9

**Актёры:** Разработчик, Claude Code, Haiku LLM

**Предусловия:** API ключ настроен, сессия завершается нормально

**Основной поток:**
1. Агент завершает работу (Stop event)
2. Stop hook читает `last_assistant_message` и первый user message из transcript
3. Stop hook вызывает Haiku LLM с адаптированным v2 промптом
4. LLM возвращает подсказку (2-12 слов)
5. Stop hook записывает state file `~/.claude/prompt-suggestion.json`
6. Stop hook выводит `systemMessage: "💡 {suggestion}"` — юзер видит подсказку
7. Юзер набирает `+` в следующей сессии
8. UserPromptSubmit hook инжектит подсказку через `additionalContext`
9. Claude выполняет подсказанное действие

## UC-2: Нет ключа API @feature3

**Предусловия:** Ни OPENROUTER_API_KEY, ни AUTO_COMMIT_API_KEY не установлены

**Поток:** Оба хука завершаются exit(0) без действий.

## UC-3: "+" без подсказки @feature2

**Предусловия:** State file не существует

**Поток:** UserPromptSubmit hook пропускает `+` без модификации (pass-through).

## UC-4: TTL истёк @feature4

**Предусловия:** State file существует, но timestamp + TTL < now

**Поток:** UserPromptSubmit hook очищает state file и пропускает `+` (pass-through).

## UC-5: Disabled @feature5

**Предусловия:** `PROMPT_SUGGEST_ENABLED=false`

**Поток:** Оба хука завершаются exit(0) без действий.

## UC-6: Silence — LLM не предложил подсказку @feature7

**Предусловия:** API ключ настроен, сессия завершается

**Поток:** LLM возвращает пустой ответ → state file НЕ создаётся, systemMessage НЕ выводится.

## UC-7: stop_hook_active = true @feature8

**Предусловия:** Другой Stop hook заблокировал остановку

**Поток:** Stop hook видит `stop_hook_active: true` → skip генерации (предотвращение бесконечного цикла).
