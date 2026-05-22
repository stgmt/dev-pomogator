# claude-in-chrome-multisession Schema

## OwnedTabs (state file)

`~/.dev-pomogator/cdmm-sessions/<sanitized-sessionId>/owned-tabs.json`:

```json
{
  "sessionId": "<original Claude Code session UUID>",
  "tabIds": [<integer>, ...],
  "createdAt": "<ISO 8601>",
  "lastUsedAt": "<ISO 8601>"
}
```

- `sessionId` — string, required. Original UUID.
- `tabIds` — number[], required. Numeric Chrome tab IDs.
- `createdAt` — ISO 8601 string, required.
- `lastUsedAt` — ISO 8601 string, required. Updated on every ALLOW.

**Sanitization rule:** directory name = `sanitize(sessionId) = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')`.

## HookInput (stdin)

```json
{
  "session_id": "<uuid>",
  "transcript_path": "<absolute>",
  "cwd": "<absolute>",
  "permission_mode": "auto" | "acceptEdits" | "...",
  "hook_event_name": "PreToolUse" | "PostToolUse",
  "tool_name": "mcp__claude-in-chrome__<tool>",
  "tool_input": <object>,
  "tool_response": <array (PostToolUse only)>,
  "tool_use_id": "toolu_..."
}
```

## DenyResponse (stdout when DENY)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<message visible to Claude>"
  }
}
```

Followed by `process.exit(2)`.

## LogEvent (cims-guard.log JSONL)

```json
{"ts":"<ISO 8601>","event":"<event-name>","sessionId":"<uuid>", ...}
```

| event | additional fields |
|-------|-------------------|
| `parse_error` | `rawLength` |
| `skip` | `sessionId?`, `toolName?`, `eventName?` |
| `recorded_tab` | `sessionId`, `newTabId` |
| `no_tabid_in_response` | `sessionId` |
| `allow_no_tabid` | `sessionId`, `toolName` |
| `allow_owned` | `sessionId`, `toolName`, `tabId` |
| `deny_other_session` | `sessionId`, `toolName`, `tabId`, `otherOwner` |
| `allow_adopted_orphan` | `sessionId`, `toolName`, `tabId` |

## ClaimTabAddOutput

```json
{"ok": true, "sessionId": "<sid>", "tabIds": [<numbers>]}
```

## ClaimTabReleaseOutput

```json
{"ok": true, "sessionId": "<sid>", "removed": <bool>, "tabIds": [<remaining>]}
```

## ClaimTabListOutput

```json
{
  "sessions": [
    {
      "sessionId": "<sid>",
      "tabCount": <int>,
      "tabIds": [<numbers>],
      "createdAt": "<ISO>",
      "lastUsedAt": "<ISO>",
      "ageMs": <int> | null
    }
  ],
  "totalSessions": <int>
}
```

## ClaimTabCleanOutput

```json
{"removed": [{"sessionId": "<sid>", "ageHours": <number>}], "count": <int>}
```

## ClaimTabResetOutput

```json
{"ok": true, "reset": "<absolute path>"}
```

## Правила валидации

- `OwnedTabs.tabIds` MUST be array of finite numbers.
- `OwnedTabs.sessionId` MUST not be empty.
- ISO 8601 timestamps via `new Date().toISOString()`.
- `LogEvent` lines MUST be one JSON object per line, terminated с `\n`.
- DenyResponse `permissionDecisionReason` — human-readable string.
- `findOtherOwner` MUST be tolerant к corrupt other-session JSON (try/catch per dir).
