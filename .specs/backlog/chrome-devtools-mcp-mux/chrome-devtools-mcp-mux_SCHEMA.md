# chrome-devtools-mcp-mux Schema

## ExtensionManifest.mcpServers (новое поле в `extension.json` schema)

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "string",
      "args": ["string"],
      "env": {
        "<KEY>": "string"
      }
    }
  }
}
```

- `mcpServers` — `Record<string, McpServerConfig>`. Map from server-name (= ключ который пишется в user's `.mcp.json.mcpServers`) до server config.
- `command` — `string`, **обязателен**. Команда которую spawning'ает MCP client. Для chrome-devtools-mcp-mux = `"npx"`.
- `args` — `string[]`, **обязателен**. Аргументы команды. Для chrome-devtools-mcp-mux = `["-y", "chrome-devtools-mcp-mux@<exact-semver>"]`.
- `env` — `Record<string, string>`, **опционален**. Env vars передаваемые subprocess. Для chrome-devtools-mcp-mux MVP не используется; возможен `{"CDMCP_MUX_HEADLESS": "true"}` в P1.

## `.mcp.json` (user-facing, project-scoped)

```json
{
  "mcpServers": {
    "chrome-devtools-mcp-mux": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp-mux@0.2.2"]
    }
  }
}
```

- Top-level shape: `{ "mcpServers": Record<string, ServerEntry> }`. Anthropic MCP plugins convention.
- `ServerEntry` — same shape как `McpServerConfig` выше.
- Smart merge: installer/updater должен модифицировать ТОЛЬКО ключ `chrome-devtools-mcp-mux` в `.mcpServers`, оставляя остальные keys нетронутыми.
- File может содержать другие top-level keys (например `inputs`, `name`) — installer должен preserve их.

## DoctorCheck (CDMM-* entries)

```json
{
  "id": "CDMM-1",
  "severity": "ok | warning | critical",
  "message": "string (one-line summary)",
  "fixHint": "string | null (actionable next step)",
  "reinstallable": "boolean (true → /pomogator-doctor может предложить reinstall)",
  "extension": "chrome-devtools-mcp-mux"
}
```

- `id` — string, обязателен. Pattern: `^CDMM-[1-5]$`.
- `severity` — enum. `ok` = 🟢, `warning` = 🟡, `critical` = 🔴.
- `message` — string, обязателен. Human-readable one-liner.
- `fixHint` — string или null. Null только если severity = `ok`. Иначе — actionable text (команда, путь, или config change).
- `reinstallable` — boolean. Если true — фикс через `npx dev-pomogator chrome-devtools-mcp-mux` исправит. Если false — требует manual user action (network, install Chrome, etc).
- `extension` — string. Всегда `"chrome-devtools-mcp-mux"` для этих checks.

## ConflictDetectionResult (FR-5 internal)

```json
{
  "detected": "boolean",
  "source": ".mcp.json | config.json | both | null",
  "conflictingServer": "claude-in-chrome | string | null",
  "evidence": "string (file:path[:lineNumber])",
  "options": ["skip", "revert-other", "separate-instance"]
}
```

- `detected` — true если найдено coexistence; false если no conflict.
- `source` — где обнаружено: пользовательский `.mcp.json`, dev-pomogator `~/.dev-pomogator/config.json`, оба, или null если no conflict.
- `conflictingServer` — имя конфликтующего MCP server'а (для current spec — всегда `"claude-in-chrome"`).
- `evidence` — string путь + опционально line для логирования.
- `options` — array возможных действий пользователя при interactive prompt.

## SmokeTestRequest (FR-8 JSON-RPC)

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "dev-pomogator-smoke-test", "version": "1.0" }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/list"
}
```

- `protocolVersion` — string. Smoke test использует `"2024-11-05"` (MCP spec version) — verify in Phase 0 что mux supports.
- `clientInfo.name` — `"dev-pomogator-smoke-test"` для traceability в mux daemon logs.

## BrowserChoiceMarker (FR-9 state file)

`~/.dev-pomogator/.cdmm-browser-choice.json`:

```json
{
  "choice": "edge | chrome | bundled | custom",
  "path": "string (optional, set for choice='custom' or after auto-detect for edge/chrome)",
  "dismissed": "boolean — true if user explicitly chose 'don't ask again'",
  "timestampISO": "ISO 8601 timestamp of last update"
}
```

- `choice` — string, обязателен. One of literal values listed.
- `path` — string, опционален. Resolved binary path. Absent for `choice='bundled'`. Present for others (after auto-detect succeeds OR user-provided).
- `dismissed` — boolean, обязателен. `true` blocks all future prompts in any project. `false` means user picked an option but is open to changing later (skill won't re-prompt while a valid choice exists, but updater/doctor can suggest re-config if binary path becomes stale).
- `timestampISO` — ISO 8601 string. Used by doctor to detect stale choices (e.g. > 6 months — recommend re-confirm).

## Правила валидации

- `extension.json.mcpServers["chrome-devtools-mcp-mux"].args[1]` MUST match `^chrome-devtools-mcp-mux@\d+\.\d+\.\d+$` (FR-7, AC-7).
- `extension.json.mcpServers["chrome-devtools-mcp-mux"].command` MUST be `"npx"` (KD-1 decision).
- `mcpServers` keys MUST not collide between extensions installed by dev-pomogator — installer detects and refuses if collision found (out of MVP, future enforcement).
- Doctor `id` MUST follow pattern `^CDMM-[1-5]$`; не allow CDMM-N где N > 5 без spec update.
- `.mcp.json` writes MUST be atomic (temp + `fs.move`); never partial JSON observable on disk.
- Path validation: every `.mcp.json` path resolved through `resolveWithinProject(targetProject, '.mcp.json')` to prevent traversal.
- BrowserChoiceMarker `choice` value MUST match enum `^(edge|chrome|bundled|custom)$` exactly. Unknown values rejected by helper script.
- BrowserChoiceMarker `path` MUST be omitted when `choice='bundled'`. Helper script enforces.
- BrowserChoiceMarker `path` (when present) MUST point to existing regular file (`fs.statSync(path).isFile()` + `existsSync`); helper validates before write.
