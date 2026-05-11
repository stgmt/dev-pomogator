# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-get-apiindex--fast-worktree-list-with-claude_max_mtime)

WHEN dashboard server is warm AND user requests `GET /api/index` THEN system SHALL respond with HTTP 200 + JSON array of worktree rows within 150ms.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-get-apiclaudepath--jsonl-preview-with-last-message)

WHEN user requests `GET /api/claude?path=/mnt/d/repos/foo` AND path has Claude history THEN system SHALL return top-5 JSONL session previews with `last_message`, `last_message_role`, `last_message_ts`, `msg_count`, and `claude_max_mtime` within 300ms cold.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-etag304-conditional-response-on-apiclaude)

WHEN client sends `GET /api/claude?path=X` with `If-None-Match: W/"<mtime>"` matching server's current max_mtime THEN system SHALL respond with HTTP 304 Not Modified + 0-byte body within 5ms.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-post-apilaunch--claude-resumefresh-injection)

WHEN user POSTs to `/api/launch` with `{worktree_path: "D:\\repos\\foo", mode: "resume", uuid: "abc-123-def"}` THEN system SHALL spawn detached `wt.exe -d D:\repos\foo -- pwsh.exe -NoExit -Command "claude --resume abc-123-def"` AND respond with `{ok: true, method: "wt-spawn", pid: int}`. WHEN `wt.exe` not in PATH THEN system SHALL fallback to `cmd.exe /c start "" pwsh.exe -NoExit -Command "..."` AND respond with `method: "cmd-fallback"`. WHEN `$env:SP_TERMINAL_CMD` is set THEN system SHALL use that template instead AND respond with `method: "env-override"`.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-get-apimessage--single-message-by-index)

WHEN user requests `GET /api/message?path=X&session=UUID&index=42` AND JSONL file has ≥43 messages THEN system SHALL return message #42 with `{role, content, timestamp, neighbors: {prev: 41, next: 43}}`.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-get-apigit-status--worktree-dirtyaheadbehind)

WHEN user requests `GET /api/git-status?path=X` THEN system SHALL return `{added: N, deleted: M, ahead: K, behind: L}` based on `git status --short` + `git rev-list --left-right HEAD...@{upstream}` parsed output.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-get-apihealth--idempotent-autostart-probe)

WHEN start-server.sh launches AND user requests `GET /api/health` THEN system SHALL respond with HTTP 200 + `{"status": "ok"}` within 5ms.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-frontend-tabulator--multi-sort--virtual-scroll--filter)

WHEN user clicks "Repo" column header THEN table SHALL sort alphabetically by Repo. WHEN user shift-clicks "Last Activity" header subsequently THEN table SHALL maintain primary sort by Repo AND apply secondary sort by Last Activity DESC within each Repo group (Tabulator native behavior).

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-pagination-strategy--top-20-priority--lazy-rest)

WHEN dashboard cold-loads with 45 worktrees (9 with Claude history) THEN top-20 rows (sorted by `claude_max_mtime` DESC) SHALL be fully populated within 1 second AND remaining 25 rows SHALL show "scanning…" placeholder until background workers complete.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-modal-viewer-for-last-message)

WHEN user clicks "Last message" cell в any row THEN `<dialog>` element SHALL open via `dialog.showModal()` AND content SHALL be rendered through marked.js AND [Prev]/[Next] buttons SHALL re-fetch `/api/message?index=±1`.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-4-button-action-column)

WHEN user clicks [▶ Resume] button THEN system SHALL POST /api/launch with mode=resume → backend spawns Windows Terminal с `claude --resume <uuid>`. WHEN user clicks [✨ Fresh] THEN system SHALL POST with mode=fresh → spawns Windows Terminal с bare `claude`. WHEN user clicks [📂 VSCode] THEN system SHALL POST /api/open-vscode → `subprocess.Popen(['code.cmd', path])`.

Кнопка Zellij Web (была в v0.2) удалена — v0.3 не использует Zellij.

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-idle-time-human-readable-format)

WHEN row has `claude_last_modified` 1777 minutes ago (29h 37m) THEN UI SHALL display "1d 5h 37m" AND tooltip SHALL show absolute ISO8601 timestamp. WHEN row has timestamp 5 minutes ago THEN UI SHALL display "5 minutes ago" via `Intl.RelativeTimeFormat`.

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-sessionstart-hook-idempotent-autostart)

WHEN Claude Code session starts on Windows AND server is not running THEN SessionStart hook SHALL execute `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` (fallback `powershell.exe -File ...` if PS7 absent) AND server SHALL bind to port 8083 within 2 seconds. WHEN server is already running (PID in `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process` alive) THEN script SHALL exit 0 without spawning duplicate.

## AC-14 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-swr-client-cache-via-localstorage)

WHEN user reloads dashboard with filled localStorage AND server's `claude_max_mtime` for 38/45 paths matches cached `mtime` THEN frontend SHALL render 38 rows instantly without fetch AND only 7 stale rows SHALL trigger /api/claude fetch.

## AC-15 (FR-15)

**Требование:** [FR-15](FR.md#fr-15-powershell-installation-script)

WHEN user runs `pwsh -File extensions/session-pilot/install.ps1` (or remote `iex (irm ...)`) AND Python ≥3.10 присутствует THEN script SHALL: (1) install Python deps, (2) register SessionStart hook in Claude Code settings, (3) verify `http://127.0.0.1:8083/api/health` returns 200 within 5s, (4) exit 0. WHEN script re-run AND hook already registered AND server alive THEN script SHALL detect idempotency, log "already installed", exit 0 без модификации настроек.

## AC-16 (FR-16)

**Требование:** [FR-16](FR.md#fr-16-skill-uses-mcp__claude-in-chrome__-for-browser)

WHEN skill scenario verifies dashboard state THEN it SHALL use `mcp__claude-in-chrome__screenshot` to capture browser AND SHALL NOT use PowerShell `[System.Drawing.Bitmap]` desktop captures.

## AC-17 (FR-17)

**Требование:** [FR-17](FR.md#fr-17-windows-native-path-encoding)

WHEN `encode_path_for_claude("D:\\repos\\lm-saas")` (Windows-native path) is called THEN return value SHALL include `D--repos-lm-saas` (canonical Claude Code on Windows directory name). Generic char-strip fallbacks (`D-repos-lm-saas`, `mnt-d-repos-lm-saas`) MAY also appear for defensive matching — they не должны влиять на production lookups.

## AC-18 (FR-18)

**Требование:** [FR-18](FR.md#fr-18-dedicated-competitor-analysis-artifact)

WHEN reviewer opens `.specs/session-pilot/COMPETITIVE_ANALYSIS.md` THEN file SHALL contain ≥1500 words AND per-tool sections for vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui AND ≥3 source citations per feature claim with [VERIFIED] markers.

## AC-19 (FR-19)

**Требование:** [FR-19](FR.md#fr-19-diagnostic-cli---diagnose-livecycle)

WHEN user runs `python server.py --diagnose-livecycle D:\repos\lm-saas` THEN output SHALL list all encoding variants AND all base dirs scanned (`%USERPROFILE%\.claude\projects`) AND per-JSONL match (path/mtime/age/size) AND verdict 🟢 LIVE / ⚪ idle / ❌ no match.

## AC-20 (FR-20)

**Требование:** [FR-20](FR.md#fr-20-configurable-live-threshold)

WHEN `LIVE_THRESHOLD_SEC=300` (default) AND lm-saas worktree's youngest JSONL is 26 seconds old THEN server SHALL mark worktree as `claude_running_now: true`. WHEN env `LIVE_THRESHOLD_SEC=600` is set THEN threshold SHALL be 600s instead.
