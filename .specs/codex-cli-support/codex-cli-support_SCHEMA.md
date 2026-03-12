# Codex CLI Support Schema

## Codex Project Config (`.codex/config.toml`)

```toml
[features]
codex_hooks = true

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp@latest"]

[mcp_servers.octocode]
command = "npx"
args = ["-y", "octocode-mcp@latest"]
```

- `[features]`: project-level feature flags for Codex.
- `codex_hooks = true`: required flag for experimental hooks support in `Codex >= 0.114.0`.
- `[mcp_servers.<name>]`: project-level MCP entries for Codex.

## Codex Hooks Config (`.codex/hooks.json`)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/example/session_start.js",
            "statusMessage": "Preparing Codex session...",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/example/stop.js",
            "statusMessage": "Running stop automation...",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- `hooks`: корневой объект hook configuration.
- `SessionStart`: список hook groups, запускаемых на старте сессии.
- `Stop`: список hook groups, запускаемых на завершении/stop.
- `type`: в MVP ожидается `command`.
- `command`: выполняемая команда.
- `statusMessage`: текст для UX during hook execution.
- `timeout`: upper bound выполнения hook команды.
- Baseline: schema рассчитана на `Codex >= 0.114.0`.

## Managed Merge Report

```json
{
  "platform": "codex",
  "warnings": [
    {
      "path": "AGENTS.md",
      "backupPath": ".dev-pomogator/.user-overrides/AGENTS.md",
      "action": "merge_required"
    }
  ],
  "backedUpFiles": [
    ".codex/config.toml",
    ".codex/hooks.json"
  ],
  "managedWrites": [
    ".agents/skills/deep-insights/SKILL.md"
  ]
}
```

- `platform`: всегда `codex` для этой фичи.
- `warnings`: конфликты project-level файлов, требующие explicit merge handling.
- `path`: конфликтующий project file.
- `backupPath`: путь к созданному backup.
- `action`: ожидаемое действие (`merge_required`, `managed_overwrite`, `user_preserved`).
- `backedUpFiles`: список файлов, для которых был создан backup.
- `managedWrites`: список managed paths, которые installer/update path обновил.

## Codex Support Matrix Entry

```json
{
  "extension": "prompt-suggest",
  "included": true,
  "paritySurfaces": [
    "Stop",
    "skill",
    "AGENTS"
  ],
  "excludedReason": null
}
```

- `extension`: имя extension manifest.
- `included`: входит ли extension в Codex support matrix.
- `paritySurfaces`: подтверждённые Codex-native surfaces, через которые реализуется parity.
- `excludedReason`: причина исключения; для `test-statusline` должна быть заполнена.

## Правила валидации

- `.codex/hooks.json` не должен содержать event names кроме подтверждённых в спецификации без дополнительного research proof.
- Hook-driven scenarios должны требовать `Codex >= 0.114.0` и project-level `codex_hooks = true`.
- `.codex/config.toml` не должен содержать auth secrets или user-level login data.
- Любой file conflict в `AGENTS.md`, `CLAUDE.md`, `.codex/*`, `.agents/skills/*` должен оставлять trace в merge report.
- Support matrix обязана явно содержать `test-statusline` как excluded extension и все остальные текущие installable extensions как included или explicitly routed.

