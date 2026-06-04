# Native Statusline Schema

Домен: NATIVE Claude Code statusLine. Контракты данных между reconciler, writer, хуком и settings.json.

## Pipeline

```
[SessionStart stdin JSON] → [hook: env gate DEV_POMOGATOR_STATUSLINE]
                                      ↓ (not off)
        [read ~/.claude/settings.json] → [reconcileStatusLine(existing.command)]
                                      ↓
              { action: install | noop | keep-user }
                   ↓ install                ↓ noop / keep-user
        [atomic write statusLine]          [no write]
                   ↓
        [hook stdout: systemMessage]       [hook stdout: empty]   → exit 0 (always)
```

## ReconcileResult (выход reconcileStatusLine)

```json
{
  "action": "install | noop | keep-user",
  "command": "string"
}
```

- `action`: `install` — слот пустой/undefined; `noop` — слот содержит маркер `ccstatusline`; `keep-user` — чужая команда без маркера.
- `command`: для `install` = `npx -y ccstatusline@latest`; для `noop`/`keep-user` = существующая команда (без изменений).

## settings.json statusLine (цель записи)

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest"
  }
}
```

- `type`: всегда `"command"` (единственный валидный тип для Claude Code statusLine).
- `command`: записываемый литерал. Прочие top-level поля settings.json (env, permissions, hooks, …) сохраняются read-modify-write.

## WriteResult (выход writeNativeStatusLine)

```json
{
  "changed": "boolean",
  "action": "install | noop | keep-user"
}
```

- `changed`: `true` только когда был выполнен `install` (реальная запись на диск).

## Hook output (stdout SessionStart)

```json
{ "systemMessage": "string (только при changed=true)" }
```

- При `changed=false` — пустой объект `{}`. Хук всегда exit 0.

## Правила валидации

- `type` ОБЯЗАН быть `"command"`; иное → нормализуется в `"command"`.
- Запись ТОЛЬКО при `action=install`; `noop`/`keep-user` → файл не трогается (идемпотентность).
- При `DEV_POMOGATOR_STATUSLINE=off` — никакой записи независимо от action.
- При невалидном JSON в settings.json — fail-open: exit 0, без мутации.
- Atomic write: temp file + rename (никогда не частичная запись поверх оригинала).
- Маркер владения: подстрока `ccstatusline` в `statusLine.command`.
