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
- `codex_hooks = true`: required flag for direct hook parity.
- `[mcp_servers.<name>]`: project-level MCP entries for Codex.
- Project-level config эффективен только в trusted projects.
- Система не должна автоматически писать user-specific `[windows]`, auth или sandbox preference в repo config.

## Codex Hooks Config (`.codex/hooks.json`)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/codex-dispatch/session-start.js",
            "statusMessage": "Preparing Codex session...",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/codex-dispatch/user-prompt-submit.js",
            "statusMessage": "Checking prompt policy...",
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/codex-dispatch/pre-tool-bash.js",
            "statusMessage": "Checking shell command...",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .dev-pomogator/tools/codex-dispatch/post-tool-bash.js",
            "statusMessage": "Processing shell result...",
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
            "command": "node .dev-pomogator/tools/codex-dispatch/stop.js",
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
- `SessionStart`, `Stop`: доступны с `Codex >= 0.114.0`.
- `UserPromptSubmit`: доступен с `Codex >= 0.116.0`.
- `PreToolUse`, `PostToolUse`: доступны с `Codex >= 0.117.0`, matcher currently meaningful only for `Bash`.
- `type`: в MVP ожидается `command`.
- `command`: выполняемая команда.
- `statusMessage`: текст для UX during hook execution.
- `timeout`: upper bound выполнения hook команды.
- Managed design rule: один managed dispatcher на event, а не много отдельных extension hooks.
- Global `~/.codex/hooks.json` и project `<repo>/.codex/hooks.json` могут сосуществовать additively.

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
  "extension": "specs-workflow",
  "supportLevel": "partial",
  "minimumCodexVersion": "0.117.0",
  "paritySurfaces": [
    "AGENTS",
    "skills",
    "mcp_servers",
    "UserPromptSubmit"
  ],
  "blockedCapabilities": [
    "Write/Edit interception outside Bash",
    "Claude-style phase gate parity"
  ],
  "excludedReason": null,
  "notes": "Partial parity until non-Bash guard replacement exists."
}
```

- `extension`: имя extension manifest.
- `supportLevel`: `supported`, `partial`, `excluded`.
- `minimumCodexVersion`: минимальная версия Codex для заявленной route, если applicable.
- `paritySurfaces`: подтверждённые Codex-native surfaces, через которые реализуется parity.
- `blockedCapabilities`: известные неснятые ограничения.
- `excludedReason`: причина исключения; для `test-statusline` должна быть заполнена.
- `notes`: краткое пояснение для human review.

## Правила валидации

- `.codex/hooks.json` не должен содержать event names кроме подтверждённых в спецификации без дополнительного research proof.
- Hook-driven scenarios должны быть version-gated (`0.114.0`, `0.116.0`, `0.117.0`, `0.120.0+` where applicable).
- Managed hooks для одного event должны materialize как один dispatcher, а не как набор независимых extension hooks.
- `PreToolUse`/`PostToolUse` не должны использоваться в design как универсальный эквивалент interception для `Write`, `MCP`, `WebSearch` и других non-Bash tools.
- `.codex/config.toml` не должен содержать auth secrets или user-level login data.
- Любой file conflict в `AGENTS.md`, `CLAUDE.md`, `.codex/*`, `.agents/skills/*` должен оставлять trace в merge report.
- Support matrix обязана явно содержать `test-statusline` как `excluded` extension и все остальные текущие installable extensions как `supported`, `partial` или `excluded`.
