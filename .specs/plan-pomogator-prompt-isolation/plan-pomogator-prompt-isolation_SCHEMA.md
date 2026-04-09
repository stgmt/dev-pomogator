# Plan Pomogator Prompt Isolation Schema

Описание структуры данных для prompt cache JSON файлов и hook input contracts.

## PromptFile (runtime cache)

Файл `~/.dev-pomogator/.plan-prompts-{session_id}.json` (один на сессию):

```json
{
  "sessionId": "string",
  "prompts": [
    {
      "ts": 1234567890123,
      "text": "real user prompt text"
    }
  ]
}
```

- `sessionId`: string — sanitized session ID (через `sanitizeSessionId` regex `/[^a-zA-Z0-9_-]/g` → `_`)
- `prompts`: PromptEntry[] — rolling window последних 10 промптов (`MAX_PROMPTS = 10` в `prompt-store.ts`)
- `prompts[].ts`: number — timestamp millisec от `Date.now()` при capture
- `prompts[].text`: string — оригинальный текст промпта (после `.trim()`, БЕЗ `<task-notification>` записей после fix)

## UserPromptSubmit Hook Input (Claude Code → prompt-capture.ts)

Stdin JSON от Claude Code:

```json
{
  "session_id": "abc-123",
  "cwd": "D:\\repos\\project",
  "prompt": "user message text"
}
```

- `session_id`: string (snake_case!) — current Claude Code session identifier. **CRITICAL**: НЕ `conversation_id` (это была причина Bug 1)
- `cwd`: string — current working directory (опционально, не используется prompt-capture)
- `prompt`: string — текст пользовательского сообщения (может быть `<task-notification>...</task-notification>` для системных нотификаций — должны быть отфильтрованы по FR-3)

## PreToolUse Hook Input (Claude Code → plan-gate.ts)

Stdin JSON от Claude Code при ExitPlanMode:

```json
{
  "session_id": "abc-123",
  "cwd": "D:\\repos\\project",
  "hook_event_name": "PreToolUse",
  "tool_name": "ExitPlanMode",
  "tool_input": {
    "planFilePath": "C:\\Users\\user\\.claude\\plans\\xyz.md"
  },
  "tool_use_id": "toolu_..."
}
```

- `session_id`: string — current Claude Code session identifier (используется для `loadUserPrompts(session_id)`)
- `tool_name`: string — должно быть `"ExitPlanMode"` иначе hook делает passthrough
- `tool_input.planFilePath`: string — абсолютный путь к плану файлу

## Hook Output (plan-gate → Claude Code)

Stdout JSON для deny:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "[plan-gate] План \"x.md\" не прошёл валидацию Phase 2 — требования (1 ошибок):\n  line 3: ...\n\nПоследние сообщения пользователя:\n  1. «real user prompt»\n\nИсправь план и попробуй снова."
  }
}
```

- `permissionDecisionReason`: string — содержит deny error message + результат `loadUserPrompts(session_id)` (после fix только реальные промпты текущей сессии без `<task-notification>`)

## Filename pattern

```
~/.dev-pomogator/.plan-prompts-{sanitizedSessionId}.json
```

Где `sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')`. После fix НИКОГДА не должен быть `default` (это означало бы возрождение Bug 1).

## Правила валидации

- `sessionId` НЕ может быть пустой строкой или undefined (FR-2: prompt-capture делает early return)
- `prompts[].text` НЕ должен начинаться с `<task-notification` после fix (FR-3: filter на capture; FR-5: defense filter на read)
- `prompts.length` <= `MAX_PROMPTS` (10) — rolling window enforced в `prompt-capture.ts:101-103`
- Файл пишется атомарно через temp + rename (NFR-S2 + `prompt-store.ts:48-54`)
- GC: файлы старше 2 часов удаляются probabilistically (1-in-10 writes) — после fix работает per-session корректно
