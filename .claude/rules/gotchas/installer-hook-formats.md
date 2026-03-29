---
paths:
  - "src/installer/**"
  - "extensions/*/extension.json"
---

# extension.json hooks — 3 формата

Hooks в `extension.json` имеют 3 формата. Код, обрабатывающий hooks, ОБЯЗАН поддерживать все 3.

## Форматы

### 1. String (простой)

```json
{
  "SessionStart": "npx tsx .dev-pomogator/tools/script.ts"
}
```

### 2. Object (с matcher/timeout)

```json
{
  "PreToolUse": {
    "matcher": "Bash",
    "command": "npx tsx .dev-pomogator/tools/guard.ts",
    "timeout": 30
  }
}
```

### 3. Array (с вложенными hooks)

```json
{
  "PostToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "bash .dev-pomogator/tools/bg-task-guard/mark-bg-task.sh"
        }
      ]
    }
  ]
}
```

## Антипаттерн

```typescript
// ❌ Предполагает только string | {command}
const rawCommand = typeof rawHook === 'string' ? rawHook : rawHook.command;
// rawHook = [{...}] → rawHook.command = undefined → .replace() crash
```

## Как правильно

```typescript
// ✅ Обработать все 3 формата
if (typeof rawHook === 'string') {
  entries.push({ command: rawHook, matcher: '' });
} else if (Array.isArray(rawHook)) {
  for (const group of rawHook) {
    for (const h of group.hooks ?? []) {
      if (h.command) entries.push({ command: h.command, matcher: group.matcher ?? '' });
    }
  }
} else if (rawHook.command) {
  entries.push({ command: rawHook.command, matcher: rawHook.matcher ?? '' });
}
```

## Чеклист

- [ ] Код обрабатывает `typeof hook === 'string'`
- [ ] Код обрабатывает `Array.isArray(hook)` с вложенными `hooks[]`
- [ ] Код обрабатывает `hook.command` (object format)
- [ ] Null-safe: `.replace()` не вызывается на undefined
