# session-pilot Schema

API & data model documentation. All endpoints under `http://localhost:8083`.

## /api/index — fast worktree list (no JSONL parse)

Response shape:

```json
{
  "generated_at": "2026-05-10T01:30:00",
  "rows": [
    {
      "id": "<repo>__<branch>__<wt_path>",
      "repo": "dev-pomogator",
      "repo_path": "/mnt/d/repos/dev-pomogator",
      "branch": "main",
      "head": "e97d028",
      "worktree_path": "/mnt/d/repos/dev-pomogator",
      "is_main_worktree": true,
      "session_name": "dev-pomogator__main",
      "session_active": true,
      "session_attach_url": "http://localhost:8082/?session=dev-pomogator__main",
      "claude_max_mtime": 1778361564,
      "has_claude_history": true
    }
  ],
  "all_zellij_sessions": ["dev-pomogator__main", "lm-saas__master"]
}
```

- `id` (string): unique row identifier formed as `<repo>__<branch>__<wt_path>` for client cache keys
- `repo` (string): repository folder basename
- `repo_path` (string): absolute path to repo root
- `branch` (string): current branch name; `(detached)` for detached HEAD; `(unknown)` if `git symbolic-ref` fails
- `head` (string): 7-char short SHA of HEAD commit
- `worktree_path` (string): absolute path to this worktree (may differ from `repo_path` for non-main worktrees)
- `is_main_worktree` (boolean): true if `worktree_path == repo_path`
- `session_name` (string): sanitized Zellij session name `<repo>__<branch>` with non-alphanumeric replaced by `_`
- `session_active` (boolean): true if `session_name` appears in `zellij list-sessions` output
- `session_attach_url` (string|null): Zellij Web Client URL if session active; `null` otherwise
- `claude_max_mtime` (integer): Unix epoch of latest JSONL mtime in any matching `~/.claude/projects/<encoded>/` directory; `0` if none
- `has_claude_history` (boolean): `claude_max_mtime > 0`

## /api/claude?path=<wt_path> — top-5 JSONL preview with ETag

Request: `GET /api/claude?path=<URL-encoded worktree path>`
Optional header: `If-None-Match: W/"<previous-etag>"`

Response 200 shape:

```json
{
  "worktree_path": "/mnt/d/repos/dev-pomogator",
  "claude_running_now": true,
  "claude_last_modified": "2026-05-10T01:30:25",
  "claude_max_mtime": 1778361625,
  "etag": "W/\"1778361625\"",
  "claude_sessions": [
    {
      "uuid": "1339c50d-6bb2-4985-9641-168f8ae209b4",
      "source": "/home/stigm/.claude/projects",
      "size_bytes": 312182,
      "modified": "2026-05-10T01:30:25",
      "age_sec": 12,
      "msg_count": 855,
      "first_message": "<truncated to 140 chars>",
      "last_message": "<truncated to 140 chars>",
      "last_message_role": "user|assistant",
      "last_message_ts": "2026-05-10T01:30:24Z"
    }
  ]
}
```

Response 304: `If-None-Match` matches current `claude_max_mtime` → `304 Not Modified` with `ETag` header and 0-byte body within ≤5ms.

- `claude_running_now` (boolean): true if any matching JSONL has `mtime > now() - LIVE_THRESHOLD_SEC` (default 300s)
- `etag` (string): weak ETag formatted as `W/"<int(claude_max_mtime)>"`
- `claude_sessions[]` (array): top-5 most-recently modified JSONL files; sorted DESC by mtime; truncated `first_message` and `last_message` to 140 chars

## POST /api/launch — claude resume/fresh injection

Request body:

```json
{
  "worktree_path": "/mnt/d/repos/foo",
  "session_name": "foo__main",
  "mode": "resume",
  "uuid": "abc-def-1234-5678-..."
}
```

- `worktree_path` (string, required): MUST be present in current `/api/index` response (whitelist enforced); 403 otherwise
- `session_name` (string, required): regex `^[A-Za-z0-9_-]+$`, length 1–80; 400 otherwise
- `mode` (string, required): `"resume"` or `"fresh"`; 400 otherwise
- `uuid` (string, required if `mode=resume`): regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` case-insensitive; 400 otherwise

Response 200 (success):

```json
{
  "ok": true,
  "method": "write-chars" | "new-layout" | "cached",
  "session": "foo__main",
  "url": "http://localhost:8082/?session=foo__main",
  "command": "claude --resume abc-def-...",
  "note": "<only if method=cached>"
}
```

- `method = "write-chars"`: existing Zellij session, command injected via `action focus-pane-id terminal_1 && action write-chars "<cmd>\n"`
- `method = "new-layout"`: new Zellij session created via `setsid script -qfc "zellij -s NAME -n /tmp/sp-<rand>.kdl"`
- `method = "cached"`: same `(session, uuid)` POSTed within 5s idempotency window — no new action, returns previous response

Response 400: validation error.
Response 403: path not in whitelist.
Response 500: zellij action failed.

## POST /api/open-vscode — open path in VSCode/Cursor

Request body:

```json
{ "path": "/mnt/d/repos/foo" }
```

- `path` (string, required): MUST be in current `/api/index` whitelist; 403 otherwise

Response 200: `{"ok": true}` after `subprocess.Popen(['code', path])`
Response 500: `code` CLI not in PATH or other Popen error

## GET /api/health — autostart probe

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_sec": 3600
}
```

Latency target: <5ms (no I/O).

## GET /api/message?path=&session=&index=N — single message (Phase 5, not yet implemented)

```json
{
  "uuid": "abc-def-...",
  "index": 42,
  "role": "user|assistant",
  "timestamp": "2026-05-10T01:30:24Z",
  "content": "<full text>",
  "neighbors": { "prev": 41, "next": 43 }
}
```

- Special index values: `"first"`, `"last"`
- 404 if `index` out of range

## GET /api/git-status?path= — worktree dirty/ahead/behind (v0.2)

```json
{
  "worktree_path": "/mnt/d/repos/foo",
  "added": 10,
  "deleted": 5,
  "ahead": 3,
  "behind": 1,
  "branch": "feat/x",
  "upstream": "origin/feat/x"
}
```

Server cache TTL 10s.

## Client-side localStorage cache (SWR)

Key format: `wtdash_v3_<row.id>` where `row.id` from /api/index.

Value:

```json
{
  "mtime": 1778361564,
  "etag": "W/\"1778361564\"",
  "data": {
    "claude_sessions": [...],
    "claude_running_now": true,
    "claude_last_modified": "..."
  }
}
```

Cache invalidation: per-row mtime comparison after `/api/index`. If `cached.mtime !== row.claude_max_mtime` → fetch with `If-None-Match`. If matches → server returns 304, client uses cache. If not → server returns 200 with fresh data, client overwrites cache entry.

Quota: localStorage ~5MB browser limit. With 45 rows × ~3KB = 135KB. Safe margin for 1000+ worktrees.

Manual cache clear: `Ctrl+Shift+Backspace` keyboard shortcut clears all `wtdash_v3_*` keys + reloads.

## KDL layout templates (Zellij)

`tools/session-pilot/layouts/claude-resume.kdl.tmpl`:

```kdl
layout {
    pane name="__NAME__" {
        cwd "__CWD__"
        command "claude"
        args "--resume" "__UUID__"
    }
}
```

`tools/session-pilot/layouts/claude-fresh.kdl.tmpl`:

```kdl
layout {
    pane name="__NAME__" {
        cwd "__CWD__"
        command "claude"
    }
}
```

Placeholders substituted server-side before write to `/tmp/sp-<rand>.kdl`. Temp file `os.unlink` after 60s via `threading.Timer`.

## Configuration (env vars)

| Env Var | Default | Description |
|---------|---------|-------------|
| `WT_DASHBOARD_PORT` | `8083` | HTTP server port |
| `WT_DASHBOARD_BIND` | `0.0.0.0` | Bind address; `127.0.0.1` for loopback only |
| `LIVE_THRESHOLD_SEC` | `300` | mtime threshold for `claude_running_now=true`; raise if Claude write batching wider |
| `ZELLIJ_BIN` | `~/.local/bin/zellij` | Path to Zellij binary |
| `ZELLIJ_WEB_URL` | `http://localhost:8082` | Zellij Web Client base URL (for `session_attach_url`) |
| `WINUSER` | `stigm` | Windows username for `/mnt/c/Users/<WINUSER>/.claude/projects` mount path |
| `REPOS` | (auto) | Colon-separated list of repo roots; if unset, autodiscovers `~/repos/*` and `/mnt/d/repos/*` |

## Validation rules (cross-endpoint invariants)

1. **Path whitelist**: every `worktree_path` in POST endpoints MUST appear in current `/api/index` `rows[].worktree_path`. Prevents arbitrary command/path injection.
2. **UUID regex**: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` case-insensitive for `/api/launch?mode=resume`.
3. **Session name**: `^[A-Za-z0-9_-]+$`, length 1–80. Shell metacharacters and path separators rejected.
4. **Idempotency lock**: `(session_name, uuid)` tuple cached 5s; second POST in window returns previous response with `method="cached"`.
5. **ETag format**: weak ETag `W/"<int>"` where int = `max(stat.st_mtime for jsonl in matching dirs)`. Client cache invalidation purely by mtime — no time-based TTL.
6. **Cross-OS path encoding**: `encode_path_for_claude(p)` returns ALL plausible variants (Linux `/mnt/d/...` ↔ Windows `D:\...` ↔ `D--...` ↔ `-mnt-d-...`). Both `~/.claude/projects` AND `/mnt/c/Users/.../  .claude/projects` directories scanned.
