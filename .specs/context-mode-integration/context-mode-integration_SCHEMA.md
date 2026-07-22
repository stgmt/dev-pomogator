# context-mode Integration Schema

## Pipeline

```text
[SessionStart hook]
  -> [resolve home + opt-out + lock]
  -> [read plugin/MCP evidence]
  -> { SetupDecision }
  -> [optional MCP-only config or detached CLI installer + fallback instructions]

[/pomogator-doctor]
  -> [registry probe]
  -> [manifest probe]
  -> [process probe]
  -> [handshake probe]
  -> [hook safety probe]
  -> { ContextModeDoctorReport }

[PreToolUse hook]
  -> [ctx tool availability]
  -> [path class]
  -> { allow | CASE-A redirect | reconnect hint }
```

## SetupDecision

```json
{
  "status": "PLUGIN_REGISTERED | MCP_ONLY_CONFIGURED | INSTALL_MISSING | SKIP_OPTOUT | SKIP_BACKOFF | ERROR_FAIL_OPEN",
  "home": "C:/Users/example/.claude",
  "evidence": ["installed_plugins.json enabledPlugins true"],
  "instructions": ["/plugin marketplace add mksglu/context-mode", "/plugin install context-mode@context-mode", "/reload-plugins"],
  "lockPath": "C:/Users/example/.dev-pomogator/.context-mode-bootstrap.lock",
  "launchedInstallerCommand": true
}
```

## ContextModeDoctorReport

```json
{
  "status": "OK | INSTALL_MISSING | CONFIG_POISONED | MCP_ONLY_CONFIGURED | MCP_DEAD_IN_SESSION | HANDSHAKE_FAILED | HOOK_UNSAFE | ERROR_FAIL_OPEN",
  "registration": "present | missing | poisoned | malformed",
  "manifestCommand": "node <plugin>/start.mjs",
  "process": "alive | dead | unknown",
  "handshake": "ok | failed | skipped",
  "hookSafety": "safe | unsafe | not-installed | unknown",
  "remediation": ["heal installed_plugins.json", "reconnect via /mcp", "verify ctx tools"]
}
```

## HookDecision

```json
{
  "permissionDecision": "allow | deny",
  "reason": "native fallback because context-mode MCP unavailable",
  "pathClass": "source | config | spec | log | generated | lockfile | unknown",
  "ctxToolsAvailable": true,
  "killSwitch": false
}
```

## Validation Rules

- `ERROR_FAIL_OPEN` exits 0 and never blocks Claude Code.
- `INSTALL_MISSING` must include exact user commands.
- `MCP_DEAD_IN_SESSION` remediation must mention `/mcp` before full restart.
- `HOOK_UNSAFE` is reported when a hook can deny to unavailable `ctx_*` tools.
- Fixture schemas must mirror real artifact keys, especially `enabledPlugins["context-mode@context-mode"]`.
