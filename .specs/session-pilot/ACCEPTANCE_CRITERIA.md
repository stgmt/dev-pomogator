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

**Требование:** [FR-4](FR.md#fr-4-post-apilaunch--cross-platform-native-terminal-spawn)

WHEN user POSTs to `/api/launch` with `{worktree_path, mode: "resume", uuid}` THEN system SHALL spawn detached native terminal AND respond with `{ok: true, method: <label>, pid: int}` where `<label>` depends on platform:

- **WHEN** `sys.platform == "win32"` AND `wt.exe` is on PATH **THEN** spawn `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "claude --resume <uuid>"` AND `method == "wt-spawn-pwsh"`.
- **WHEN** `sys.platform == "win32"` AND `wt.exe` NOT on PATH **THEN** fallback `cmd.exe /c start "" pwsh.exe -NoExit -Command "..."` AND `method == "cmd-fallback"`.
- **WHEN** `sys.platform == "linux"` AND `$DISPLAY` (or `$WAYLAND_DISPLAY`) is set AND `gnome-terminal` on PATH **THEN** spawn `gnome-terminal --working-directory=<cwd> -- bash -c "claude --resume <uuid>; exec bash"` AND `method == "linux-gnome-terminal"`. WHEN any other Linux terminal in priority chain hits first THEN `method` reflects that (`linux-konsole` / `linux-alacritty` / etc.).
- **WHEN** `sys.platform == "linux"` AND both `$DISPLAY` AND `$WAYLAND_DISPLAY` empty (OR all GUI terminals absent) **THEN** spawn `setsid nohup bash -c "cd <cwd> && claude --resume <uuid>" </dev/null >/dev/null 2>&1 &` AND `method == "headless-setsid"`.
- **WHEN** `sys.platform == "darwin"` AND iTerm2 process running **THEN** spawn via `osascript -e 'tell app "iTerm2" to create window ...'` AND `method == "darwin-iterm2"`.
- **WHEN** `sys.platform == "darwin"` AND iTerm2 not running **THEN** spawn via `osascript -e 'tell app "Terminal" to do script "cd <cwd> && claude ..."'` AND `method == "darwin-terminal"`.
- **WHEN** `$SP_TERMINAL_CMD` env var is set (any OS) **THEN** template substituted with `{cwd}` and `{cmd}` placeholders, decomposed to argv via `shlex.split` (POSIX) / list-form (Windows), spawned via Popen AND `method == "env-override"`.
- **WHEN** none of the above match (no terminal found on any platform) **THEN** respond `{ok: false, error: "no terminal found", tried: [...]}` with HTTP 503.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-get-apimessage--single-message-by-index)

WHEN user requests `GET /api/message?path=X&session=UUID&index=42` AND JSONL file has ≥43 messages THEN system SHALL return message #42 with `{role, content, timestamp, neighbors: {prev: 41, next: 43}}`.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-get-apigit-status--worktree-dirtyaheadbehind)

WHEN user requests `GET /api/git-status?path=X` THEN system SHALL return `{added: N, deleted: M, ahead: K, behind: L}` based on `git status --short` + `git rev-list --left-right HEAD...@{upstream}` parsed output.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-get-apihealth--idempotent-autostart-probe)

WHEN start-server.ps1 (Windows) OR start-server.sh (Linux/macOS) launches AND user requests `GET /api/health` THEN system SHALL respond with HTTP 200 + `{"status": "ok", "version": "0.4.0", "uptime_sec": int, "platform": "win32"|"linux"|"darwin"}` within 5ms.

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

**Требование:** [FR-13](FR.md#fr-13-sessionstart-hook-idempotent-autostart-cross-platform)

WHEN Claude Code session starts AND server is not running THEN SessionStart hook SHALL execute platform-specific start script AND server SHALL bind to port 8083 within 2 seconds:

- **WHEN** `sys.platform == "win32"` **THEN** hook runs `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` (fallback `powershell.exe -File ...` if PS7 absent). PID lock в `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id $pid -ErrorAction SilentlyContinue` alive check.
- **WHEN** `sys.platform == "linux"` OR `sys.platform == "darwin"` **THEN** hook runs `bash start-server.sh`. PID lock в `${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot/server.pid` + `kill -0 $pid 2>/dev/null` alive check.

WHEN server is already running (PID file exists AND PID alive) THEN script SHALL log "already running" AND exit 0 without spawning duplicate, regardless of OS.

## AC-14 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-swr-client-cache-via-localstorage)

WHEN user reloads dashboard with filled localStorage AND server's `claude_max_mtime` for 38/45 paths matches cached `mtime` THEN frontend SHALL render 38 rows instantly without fetch AND only 7 stale rows SHALL trigger /api/claude fetch.

## AC-15 (FR-15)

**Требование:** [FR-15](FR.md#fr-15-cross-platform-installation-scripts)

WHEN user runs installer matching host OS AND Python ≥3.10 присутствует THEN script SHALL: (1) install Python deps (stdlib-only → no-op for v0.4), (2) register SessionStart hook in Claude Code settings.json with platform-specific command, (3) verify `http://127.0.0.1:8083/api/health` returns 200 within 5s, (4) exit 0:

- **WHEN** host is Windows AND user runs `pwsh -File extensions/session-pilot/install.ps1` (или remote `iex (irm ...)`) **THEN** SessionStart hook registered as `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1`.
- **WHEN** host is Linux OR macOS AND user runs `bash extensions/session-pilot/install.sh` (или remote `curl -fsSL ... | bash`) **THEN** SessionStart hook registered as `bash start-server.sh`.

WHEN installer re-run AND hook already registered AND `/api/health` returns 200 THEN script SHALL detect idempotency, log "already installed", exit 0 без модификации settings.json, regardless of OS.

## AC-16 (FR-16)

**Требование:** [FR-16](FR.md#fr-16-skill-uses-mcp__claude-in-chrome__-for-browser)

WHEN skill scenario verifies dashboard state THEN it SHALL use `mcp__claude-in-chrome__screenshot` to capture browser AND SHALL NOT use PowerShell `[System.Drawing.Bitmap]` desktop captures.

## AC-17 (FR-17)

**Требование:** [FR-17](FR.md#fr-17-cross-platform-claude-path-encoding)

WHEN `encode_path_for_claude(path)` is called THEN return value SHALL be a list `[canonical, ...defensive_fallbacks]` where:

- **WHEN** path is `D:\repos\lm-saas` AND `sys.platform == "win32"` **THEN** result[0] == `"D--repos-lm-saas"` (canonical Windows).
- **WHEN** path is `/home/user/repos/foo` AND `sys.platform == "linux"` **THEN** result[0] == `"-home-user-repos-foo"` (canonical Linux).
- **WHEN** path is `/Users/stigm/repos/foo` AND `sys.platform == "darwin"` **THEN** result[0] == `"-Users-stigm-repos-foo"` (canonical macOS).
- **WHEN** path is `/mnt/d/repos/foo` (WSL view) **THEN** result SHALL contain BOTH `"-mnt-d-repos-foo"` AND `"D--repos-foo"` — caller can match either side.
- **WHEN** path is `\\wsl.localhost\Ubuntu\home\user\foo` (Windows view of WSL) **THEN** result SHALL contain BOTH `"--wsl.localhost-Ubuntu-home-user-foo"` AND `"-home-user-foo"`.
- **WHEN** path is `C:\Users\stigm\.cursor\worktrees\bar` (Cursor IDE Windows worktree) **THEN** result[0] == `"C--Users-stigm--cursor-worktrees-bar"` (dot-prefixed dirs preserve dots).

Result list MUST be ordered: canonical first, fallbacks after. Scanner uses first hit found on filesystem to determine display row.

## AC-18 (FR-18)

**Требование:** [FR-18](FR.md#fr-18-dedicated-competitor-analysis-artifact)

WHEN reviewer opens `.specs/session-pilot/COMPETITIVE_ANALYSIS.md` THEN file SHALL contain ≥1500 words AND per-tool sections for vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui AND ≥3 source citations per feature claim with [VERIFIED] markers.

## AC-19 (FR-19)

**Требование:** [FR-19](FR.md#fr-19-diagnostic-cli---diagnose-livecycle)

WHEN user runs `python server.py --diagnose-livecycle D:\repos\lm-saas` THEN output SHALL list all encoding variants AND all base dirs scanned (`%USERPROFILE%\.claude\projects`) AND per-JSONL match (path/mtime/age/size) AND verdict 🟢 LIVE / ⚪ idle / ❌ no match.

## AC-20 (FR-20)

**Требование:** [FR-20](FR.md#fr-20-configurable-live-threshold)

WHEN `LIVE_THRESHOLD_SEC=300` (default) AND lm-saas worktree's youngest JSONL is 26 seconds old THEN server SHALL mark worktree as `claude_running_now: true`. WHEN env `LIVE_THRESHOLD_SEC=600` is set THEN threshold SHALL be 600s instead.

## AC-23 (FR-23)

**Требование:** [FR-23](FR.md#fr-23-taskbar--dock-launcher-installer-create-launcher)

WHEN user runs platform-matching launcher installer:
- **WHEN** `sys.platform == "win32"` AND user runs `pwsh -File create-launcher.ps1` AND `msedge.exe` (or `chrome.exe`) exists в standard install path **THEN** script SHALL create `%USERPROFILE%\Desktop\Session Pilot.lnk` with `TargetPath` set to browser exe AND `Arguments` containing `--app=http://127.0.0.1:<port>/ --user-data-dir=%LOCALAPPDATA%\session-pilot\browser-profile` AND open Explorer with the icon highlighted for user pin step.
- **WHEN** `sys.platform == "linux"` AND user runs `bash create-launcher.sh` AND any of {google-chrome, chromium, chromium-browser, microsoft-edge, brave-browser} on PATH **THEN** script SHALL create `~/.local/share/applications/session-pilot.desktop` valid XDG Desktop Entry with `Exec=<browser> --app=<url> --user-data-dir=...` AND `chmod +x` the file AND optionally run `update-desktop-database` if installed.
- **WHEN** `sys.platform == "darwin"` AND user runs `bash create-launcher.sh` AND any browser `.app` bundle exists в `/Applications/` **THEN** script SHALL create `~/Applications/Session Pilot.app` containing valid `Info.plist` + executable `Contents/MacOS/launcher` shell script which exec-s browser с `--app=URL`.

WHEN no Chromium-family browser found на host THEN script SHALL exit non-zero with explanatory message ("Edge or Chrome not found... Install one of them, or bookmark URL manually") AND NOT create partial launcher artifact.

WHEN script re-run на same host THEN it SHALL overwrite existing launcher file (idempotent) with current settings AND exit 0.

Port override: `WT_DASHBOARD_PORT` env var OR `-Port` arg (Windows) controls URL port — default 8083.

## AC-22 (FR-22)

**Требование:** [FR-22](FR.md#fr-22-on-demand-worktree-bootstrap-skill-session-pilot-bootstrap)

WHEN user invokes skill `session-pilot-bootstrap` (slash `/sp-bootstrap`) AND cwd is git worktree registered in `git worktree list` AND cwd != main worktree AND `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` is absent THEN skill SHALL:

1. Present AskUserQuestion: {Bootstrap, Skip npm install, Cancel}.
2. **WHEN** user chooses Bootstrap **THEN** skill SHALL run: `npm install --no-audit --no-fund` (only if `node_modules/` absent), `npm run build`, `node bin/cli.js install .` — in this exact order.
3. **WHEN** all 3 commands exit 0 THEN skill SHALL verify `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` теперь present AND respond "bootstrap complete".
4. **WHEN** any command exits non-zero THEN skill SHALL respond `{ok: false, failed_step: <step-name>, exit_code: int, stderr: <tail>}` AND NOT attempt rollback (installer is itself idempotent — partial install acceptable, user can re-invoke).

WHEN skill invoked AND cwd is main worktree (matches first row из `git worktree list`) THEN skill SHALL respond "main worktree already bootstrapped (via dev workflow); skip" AND exit 0 без действий.

WHEN skill invoked AND `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` IS present (already bootstrapped) THEN skill SHALL respond "already bootstrapped" AND exit 0, UNLESS user provided `--force` arg in which case re-run installer.

WHEN skill invoked AND cwd is NOT inside any git repo (per `git rev-parse --show-toplevel`) THEN skill SHALL respond `{ok: false, error: "not a git repository"}` AND exit 0 (non-fatal — user invoked accidentally outside repo).

Cross-platform: skill workflow uses only `npm` / `node` / `git` commands which are cross-platform. No OS-specific branches — skill behavior identical on Windows/Linux/macOS.

## AC-21 (FR-21)

**Требование:** [FR-21](FR.md#fr-21-os-detection--platform-dispatched-module-architecture)

WHEN `terminal_launcher.launch(worktree_path, mode, uuid)` is called THEN function SHALL dispatch to handler based on `sys.platform`:

- **WHEN** `$SP_TERMINAL_CMD` env is set (any OS) **THEN** function SHALL invoke `_launch_env_override` BEFORE any OS-specific handler.
- **WHEN** `sys.platform == "win32"` **THEN** function SHALL invoke `_launch_windows`.
- **WHEN** `sys.platform == "linux"` **THEN** function SHALL invoke `_launch_linux` which SHALL further dispatch to `_launch_linux_gui` (if `$DISPLAY` OR `$WAYLAND_DISPLAY` set AND some terminal on PATH) OR `_launch_linux_headless` (otherwise).
- **WHEN** `sys.platform == "darwin"` **THEN** function SHALL invoke `_launch_darwin` which SHALL further dispatch to iTerm2 if running, Terminal.app otherwise.
- **WHEN** `sys.platform` is anything else (e.g. `freebsd`, `cygwin`) **THEN** function SHALL respond `{ok: false, error: "unsupported platform: <name>"}` without crashing.

Test `tests/test_terminal_launcher.py` SHALL parametrize platform via `monkeypatch.setattr(sys, "platform", X)` AND mock `shutil.which` to control terminal availability AND assert correct handler invocation + response shape for each (platform, terminal-availability) combination.
