# Functional Requirements (FR)

> **Scope de-pivot (v0.4, 2026-05-12):** session-pilot снова cross-platform — Windows + Linux + macOS, native per-OS spawn chain. Возврат к кросс-платформенности из v0.3 Windows-only pivot, но **БЕЗ Zellij/WSL bridge** v0.2: каждая ОС использует свой native terminal (Windows Terminal / gnome-terminal+konsole+alacritty+kitty+xterm / Terminal.app+iTerm2) и свою native autostart механику. Python stdlib дашборд работает unmodified на всех трёх ОС — отличается только модуль `terminal_launcher.py` (OS-dispatched chain) и installer (install.ps1 / install.sh).

## FR-1: GET /api/index — fast worktree list with claude_max_mtime

> @feature1

Endpoint returns all git worktrees from configured repos + per-row `claude_max_mtime` (cheap stat, no JSONL parse). Bound by ThreadPoolExecutor parallel git stat.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-2: GET /api/claude?path= — JSONL preview with last message

> @feature2

Returns top-5 JSONL session previews for a worktree path: last_message + last_message_role + last_message_ts + msg_count + max_mtime + ETag. Cold response <300ms, includes 5 most-recently modified JSONL files.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-3: ETag/304 conditional response on /api/claude

> @feature3

GET /api/claude supports `If-None-Match: W/"<mtime>"`. Server compares against current max_mtime; match → 304 Not Modified with 0-byte body within 5ms.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2)

## FR-4: POST /api/launch — cross-platform native terminal spawn

> @feature4

POST endpoint accepts JSON `{worktree_path, mode: 'resume'|'fresh', uuid?}`. Spawns a NEW native terminal window (или background detached process в headless mode) with `claude --resume <uuid>` (resume mode) or `claude` (fresh mode) running в `worktree_path`. Detached от Python сервера — закрытие сервера НЕ убивает дочерний процесс на всех платформах.

**Platform dispatch** определяется через `sys.platform` в `terminal_launcher.py`:

| Platform | Detection | Spawn chain (first available wins) |
|----------|-----------|-------------------------------------|
| Windows (`win32`) | `sys.platform == "win32"` | (1) `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "claude ..."`<br>(2) `wt.exe -d <cwd> -- powershell.exe -NoExit -Command "..."` (PS 5.1)<br>(3) `cmd.exe /c start "" pwsh.exe -NoExit -Command "..."` (no-WT fallback)<br>Method label: `wt-spawn-pwsh` / `wt-spawn-ps51` / `cmd-fallback`. [VERIFIED 2026-05-12 — labels confirmed via direct POST /api/launch test on real Windows 11 host: response returned `method:"wt-spawn-pwsh"` when wt.exe + pwsh.exe both on PATH.] |
| Linux GUI (`linux`, `$DISPLAY` or `$WAYLAND_DISPLAY` set) | `sys.platform == "linux"` and (`os.environ.get("DISPLAY")` or `os.environ.get("WAYLAND_DISPLAY")`) | `$TERMINAL` env (if set) → `gnome-terminal --working-directory=<cwd> -- bash -c "claude ...; exec bash"` → `konsole --workdir <cwd> -e bash -c ...` → `alacritty --working-directory <cwd> -e bash -c ...` → `kitty --directory <cwd> bash -c ...` → `wezterm start --cwd <cwd> -- bash -c ...` → `xfce4-terminal --working-directory=<cwd> -e "bash -c ..."` → `tilix -w <cwd> -e "bash -c ..."` → `terminator --working-directory=<cwd> -e "bash -c ..."` → `xterm -e "cd <cwd> && claude; bash"`. Detection: `shutil.which(<name>)`. Method label: `linux-<term>` (e.g. `linux-gnome-terminal`, `linux-alacritty`). |
| Linux headless (`linux`, no DISPLAY/WAYLAND, OR all terminals missing) | как выше но `$DISPLAY` AND `$WAYLAND_DISPLAY` обе пустые, ИЛИ все GUI terminals отсутствуют в PATH | `setsid nohup bash -c "cd <cwd> && claude" </dev/null >/dev/null 2>&1 &` — fully detached. PID капчуру через `subprocess.Popen([..]).pid` (без shell). Method label: `headless-setsid`. |
| macOS (`darwin`) | `sys.platform == "darwin"` | (1) `osascript -e 'tell app "iTerm2" to ...'` если iTerm2 запущен (detect via `osascript -e 'tell app "System Events" to (name of processes) contains "iTerm2"'`)<br>(2) `osascript -e 'tell app "Terminal" to do script "cd <cwd> && claude ..."'` (default). Method label: `darwin-iterm2` / `darwin-terminal`. |
| Any platform | `$SP_TERMINAL_CMD` env var set | Template parsed with `{cwd}` and `{cmd}` placeholders. Decomposed to argv via `shlex.split` (POSIX) or via subprocess.Popen list form (Windows). Method label: `env-override`. |

5-second idempotency lock per `(worktree_path, uuid)` — повторный клик в течение 5s не плодит дубли. Persistence terminate at user's discretion. Response shape unchanged: `{ok: true, method: <label>, pid: int}` или `{ok: false, error: "no terminal found", tried: [...]}` если ни один candidate не сработал.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-3](USE_CASES.md#uc-3)

## FR-5: GET /api/message — single message by index

> @feature5

GET `/api/message?path=&session=&index=` returns N-th message + neighbors. Special index keywords: `last`, `first`. Out-of-range → 404.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4)

## FR-6: GET /api/git-status — worktree dirty/ahead/behind

> @feature6

Per-worktree git status `{added, deleted, ahead, behind}` via `git status --short` + `git rev-list --left-right HEAD...@{upstream}`. ccmanager-style display.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-5](USE_CASES.md#uc-5)

## FR-7: GET /api/health — idempotent autostart probe

> @feature7

`200 {"status":"ok", "version": "0.4.0", "uptime_sec": int, "platform": "win32"|"linux"|"darwin"}` for autostart probe — клиент (PowerShell installer на Windows / bash installer на POSIX / SessionStart hook на любой ОС) ждёт сервер до 2s после spawn. <5ms regardless of cache. `platform` field exposes detected OS для debugging cross-platform issues.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-6](USE_CASES.md#uc-6)

## FR-8: Frontend Tabulator — multi-sort + virtual scroll + filter

> @feature8

Vendored Tabulator.js: multi-key shift+click sort, virtual DOM (500+ rows), frozen Repo+Branch columns, vi-style `/` filter via `setFilter()`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-7](USE_CASES.md#uc-7)

## FR-9: Pagination strategy — top-20 priority + lazy rest

> @feature9

After /api/index, frontend sorts by `claude_max_mtime DESC`, splits into priority (top 20) + rest. 4 parallel workers drain priority first. Strategy chosen via Phase 4 benchmark documented in DESIGN.md.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-10: Modal viewer for last message

> @feature10

Click "Last message" cell → native `<dialog>` + marked.js render + [Prev]/[Next] buttons re-fetch /api/message ± 1. ESC closes.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-4](USE_CASES.md#uc-4)

## FR-11: 3-button Action column

> @feature11

Per row: [▶ Resume] [✨ Fresh] [📂 VSCode]. Resume/Fresh spawn новое native terminal окно (или background detached на headless) через /api/launch (см. FR-4). VSCode opens via `subprocess.Popen(['code', path])` — `code` binary cross-platform на PATH (Windows `code.cmd`, Linux/macOS `code` symlink). Fallback chain: `code` → `code.cmd` (Windows только) → `cursor` → `subl` (Sublime Text).

Кнопка Zellij Web из v0.2 удалена (мы больше не используем Zellij на любой ОС).

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-3](USE_CASES.md#uc-3)

## FR-12: Idle time human-readable format

> @feature12

`relativeTime(epoch)`: <60s → "just now"; <60min → Intl.RelativeTimeFormat 'minutes'; <24h → 'hours'; >24h → "Nd Nh Nm". No "1777m" anywhere.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-13: SessionStart hook idempotent autostart (cross-platform)

> @feature13

Extension's `extension.json` registers SessionStart hook command dispatched по platform Claude Code знает на момент session start (Claude Code resolves hook command via `$CLAUDE_PROJECT_DIR` + platform):

- **Windows**: `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` (PowerShell 7) или `powershell.exe -NoProfile -File start-server.ps1` (PS 5.1 fallback). PID lock в `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id` liveness check.
- **Linux/macOS**: `bash start-server.sh` (POSIX shell script). PID lock в `${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot/server.pid` + `kill -0 $pid 2>/dev/null` liveness check.

Manifest `extension.json` declares hook через 3-format objects array (см. `installer-hook-formats.md` rule) с platform-conditional command — installer выбирает `start-server.ps1` или `start-server.sh` based on host platform.

Both scripts share idempotency contract:
1. Read PID from `<state-dir>/server.pid` if exists.
2. If PID alive → log "already running" → exit 0.
3. If stale PID OR no file → spawn `python server.py` detached → write new PID.
4. Poll `http://127.0.0.1:8083/api/health` until 200 (timeout 2s) → exit 0.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-8](USE_CASES.md#uc-8)

## FR-14: SWR client cache via localStorage

> @feature14

`localStorage["session_pilot_v1_<id>"] = {mtime, etag, data}`. Page load: instant render from cache → fetch /api/index → mtime compare per row → skip unchanged → fetch with If-None-Match for stale.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-9](USE_CASES.md#uc-9)

## FR-15: Cross-platform installation scripts

> @feature15

Pair of siblings, single source of truth in `extensions/session-pilot/`:

- **`install.ps1`** (Windows): проверяет Python ≥3.10 (winget fallback prompt если absent), ставит deps (stdlib only — no-op), регистрирует SessionStart hook в Claude Code `settings.json`, опциональный Start Menu ярлык. НЕ требует WSL / admin / Zellij.
- **`install.sh`** (Linux + macOS): проверяет Python ≥3.10 (`python3 --version` parse), регистрирует SessionStart hook в `~/.claude/settings.json`, опциональный `.desktop` entry (Linux only) / Login Item (macOS only). Bash ≥4.x; `set -euo pipefail`.

```pwsh
# Windows (PowerShell 5.1+ or pwsh 7+)
iex (irm https://raw.githubusercontent.com/.../install.ps1)
# или offline:
pwsh -File extensions/session-pilot/install.ps1
```

```bash
# Linux + macOS (bash ≥4)
curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
# или offline:
bash extensions/session-pilot/install.sh
```

Shared idempotency: re-run detects existing install + alive server → exit 0 без модификации настроек. Detection: settings.json hook entry already present AND `/api/health` returns 200.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
**Use Case:** [UC-10](USE_CASES.md#uc-10)

## FR-16: Skill uses mcp__claude-in-chrome__* for browser

> @feature16

Skill scenarios use `mcp__claude-in-chrome__navigate / screenshot / read_page` for browser automation. Forbids PowerShell desktop captures (per rule `mcp-chrome-only.md`).

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
**Use Case:** [UC-3](USE_CASES.md#uc-3)

## FR-17: Cross-platform Claude path encoding

> @feature17

`encode_path_for_claude(path)` производит canonical Claude Code directory name под `~/.claude/projects/<encoded>/` для текущей платформы AND defensive cross-platform variants для shared-worktree сценариев (e.g. WSL + Windows host видят один файл по двум путям):

| Source path | Platform context | Canonical encoded | Why |
|-------------|------------------|--------------------|-----|
| `D:\repos\foo` | Windows-native | `D--repos-foo` | Drive colon stripped, each path separator → `-`, leading separator не порождает префиксный `-`. |
| `/home/user/repos/foo` | Linux-native | `-home-user-repos-foo` | Each `/` → `-`. Leading separator порождает leading `-`. |
| `/Users/stigm/repos/foo` | macOS-native | `-Users-stigm-repos-foo` | Same POSIX rule. |
| `/mnt/d/repos/foo` | WSL Linux | `-mnt-d-repos-foo` (primary) + `D--repos-foo` (fallback) | When Claude runs on Windows-native side with `D:\repos\foo` cwd, JSONLs land in `D--repos-foo` dir; when same path accessed from WSL as `/mnt/d/repos/foo`, JSONLs may land in `-mnt-d-repos-foo`. Encoder emits BOTH to maximize discovery. |
| `\\wsl.localhost\Ubuntu\home\user\foo` | Windows → WSL2 P9 mirror | `--wsl.localhost-Ubuntu-home-user-foo` + `-home-user-foo` (WSL-side fallback) | UNC paths from Windows Explorer ↔ Linux paths from inside WSL. |
| `C:\Users\stigm\.cursor\worktrees\bar` | Cursor IDE Windows worktree | `C--Users-stigm--cursor-worktrees-bar` | Dot-prefixed dir names preserve dots; double-hyphen between `Users` and `.cursor` due to leading dot. |

Encoder reads `sys.platform`, identifies canonical variant first (= production lookup path), then appends defensive cross-platform fallbacks (rarely hit but cheap to include in scan). Diagnostic CLI `--diagnose-livecycle` dumps generated variants + per-variant scan result, so unforeseen encodings (e.g. new IDE-injected worktree paths) surface immediately.

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
**Use Case:** [UC-1](USE_CASES.md#uc-1), [UC-11](USE_CASES.md#uc-11)

## FR-18: Dedicated competitor analysis artifact

> @feature18

`COMPETITIVE_ANALYSIS.md` ≥1500 words: per-tool feature list, master matrix, "Features WE LACK" priority backlog, "Features WE HAVE that they lack" differentiation. ≥3 sources cited per feature claim.

**Связанные AC:** [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18)
**Use Case:** [UC-7](USE_CASES.md#uc-7)

## FR-19: Diagnostic CLI --diagnose-livecycle

> @feature19

`python server.py --diagnose-livecycle <path>` dumps encoding variants + base dirs scanned + per-JSONL match (path/mtime/age/size) + verdict 🟢/⚪/❌.

**Связанные AC:** [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19)
**Use Case:** [UC-11](USE_CASES.md#uc-11)

## FR-20: Configurable LIVE threshold

> @feature20

`RUNNING_THRESHOLD_SEC = int(os.environ.get("LIVE_THRESHOLD_SEC", "300"))`. Default 300s (Claude Code batches JSONL writes every 2-3 min). Override via env var.

**Связанные AC:** [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-23: Taskbar / Dock launcher installer (`create-launcher`)

> @feature23

Per-OS sibling scripts which create a **pin-able launcher entry** на taskbar (Windows) / dock (macOS) / favourites bar (Linux) — пользователь кликает иконку и open-ит dashboard в standalone window (no browser chrome, no tabs, own taskbar entry — like a native desktop app via Chromium `--app=URL` flag).

**Why not bookmark/PWA install**:
- Bookmark в browser → user opens browser → finds bookmark → 3-click chain каждый раз.
- Edge/Chrome "Install as app" (PWA flow) works but requires manifest.json + user manually clicks "Install" в browser UI каждый раз для каждого worktree-set. Not scriptable.
- `--app=URL` flag — single command, programmatic, taskbar-pin-able, no manifest needed. Works since Chrome 88 / Edge 95 (2020). Same flag spelling across all 3 OS.

**Per-OS implementation**:

| OS | Script | Creates | Pin mechanism |
|----|--------|---------|----------------|
| Windows | `create-launcher.ps1` | `%USERPROFILE%\Desktop\Session Pilot.lnk` → `msedge.exe --app=http://127.0.0.1:<port>/ --user-data-dir=%LOCALAPPDATA%\session-pilot\browser-profile` | User right-click → "Show more options" → "Pin to taskbar" (Win 10 1809+ blocks programmatic Pin) |
| Linux | `create-launcher.sh` | `~/.local/share/applications/session-pilot.desktop` (XDG Desktop Entry) | DE-specific: GNOME drag to Favourites / KDE right-click "Pin to Task Manager" / XFCE drag to panel |
| macOS | `create-launcher.sh` (`uname -s` branches) | `~/Applications/Session Pilot.app` (minimal .app bundle с `launcher` shell exec) | Drag to Dock; right-click "Keep in Dock" |

**Browser detection** (chain, first hit wins):
- Windows: msedge.exe → chrome.exe (Program Files + LocalAppData paths)
- Linux: google-chrome → chromium → chromium-browser → microsoft-edge → brave-browser (via `command -v`)
- macOS: `/Applications/Google Chrome.app/...` → `/Applications/Microsoft Edge.app/...` → Brave

**Browser profile isolation**: `--user-data-dir=<state-dir>/browser-profile` prevents launcher from sharing cookies/extensions с user's main browser session — clean isolated PWA-like profile.

**Idempotent**: re-running overwrites existing .lnk / .desktop / .app — no orphan files.

**Trade-off**: на Windows последняя версия Pin-to-taskbar requires manual right-click step (`Show more options → Pin to taskbar`); legacy COM verb blocked since Win 10 1809. Script auto-opens Explorer at Desktop with icon highlighted to minimize friction. На Linux/macOS pin происходит native drag/menu.

**Связанные AC:** [AC-23](ACCEPTANCE_CRITERIA.md#ac-23-fr-23)
**Use Case:** [UC-13](USE_CASES.md#uc-13)

## FR-22: On-demand worktree bootstrap skill (`session-pilot-bootstrap`)

> @feature22

Standalone Claude Code skill `session-pilot-bootstrap` (slash-command form: `/sp-bootstrap` или `/sp-bootstrap-worktree`) который **пользователь вызывает вручную** когда оказался в orphan worktree (worktree без `.dev-pomogator/tools/` install state). НЕ auto-fire — пользователь решает когда нужен bootstrap. Сценарий мотивации: hooks (auto-commit / simplify / dedup / tui / prompt-suggest / capture / bg-task-guard / test-spec-gate) падают с `ERR_MODULE_NOT_FOUND` на stop event'ах потому что `.dev-pomogator/tools/*.ts` gitignored AND installer ни разу в этом worktree не запускался.

**Trigger phrases** (skill description):
- RU: «забутстрапь worktree», «поставь dev-pomogator в этот worktree», «почини hooks в worktree», «инициализируй worktree», «сделай orphan worktree рабочим».
- EN: «bootstrap worktree», «install dev-pomogator here», «fix hooks in this worktree», «initialize orphan worktree», «make this worktree workable».
- Skip when: cwd is main repo worktree (already installed), или cwd not in git repo, или user явно отказался.

**Workflow** (skill body):
1. **Preflight**: `git rev-parse --show-toplevel` → check cwd is repo root or inside one. `git worktree list` → identify if cwd is one of registered worktrees. Если main worktree (path matches first row из `git worktree list`) → skip; пользователь видимо ошибся.
2. **Detect orphan state**: проверить `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` (или другой sentinel managed file) — если absent → orphan. Если present → "already bootstrapped" + предложить `--force` re-bootstrap.
3. **AskUserQuestion**: предложить варианты:
   - `Bootstrap` — full install (npm install if needed + build + installer).
   - `Skip npm install` — fast path если node_modules уже есть (typical for re-bootstrap).
   - `Cancel` — exit 0 без действий.
4. **Run installer** (cross-platform — `npm` / `node` доступны на всех 3 OS):
   ```bash
   npm install --no-audit --no-fund    # only if node_modules absent
   npm run build                        # tsc + check-update bundle
   node bin/cli.js install .            # installer-output → .dev-pomogator/tools/
   ```
5. **Verify**: trigger один из stop hooks через synthetic `Stop` event (или просто проверить что `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` теперь present). Optionally: `node bin/cli.js doctor` для full health-check.
6. **Idempotent re-run**: при повторном вызове в same worktree — detect bootstrap state, log "already bootstrapped", exit 0 без действий (unless `--force`).

**Out of scope** (для FR-22):
- Не создаёт worktree (это делает `git worktree add` или Anthropic native `claude --worktree`). Skill активируется ПОСЛЕ existence worktree.
- Не spawn-ит Claude Code session в worktree (это FR-4 dashboard action или native `claude -w`).
- Не auto-fire — пользователь явно решает когда вызвать.

**Relation к session-pilot family**: skill живёт в `.claude/skills/session-pilot-bootstrap/` (sibling к `.claude/skills/session-pilot/` который служит dashboard verification scenarios). Оба skill'а под session-pilot family — управляют lifecycle worktrees. Bootstrap closes "no-tools" failure mode; dashboard closes "no-session" failure mode.

**Связанные AC:** [AC-22](ACCEPTANCE_CRITERIA.md#ac-22-fr-22)
**Use Case:** [UC-12](USE_CASES.md#uc-12)

## FR-21: OS detection + platform-dispatched module architecture

> @feature21

`terminal_launcher.py` exposes single function `launch(worktree_path, mode, uuid=None) -> dict` which internally dispatches based on `sys.platform`:

```python
PLATFORM_HANDLERS = {
    "win32":  _launch_windows,
    "linux":  _launch_linux,
    "darwin": _launch_darwin,
}

def launch(worktree_path: str, mode: str, uuid: str | None = None) -> dict:
    if os.environ.get("SP_TERMINAL_CMD"):
        return _launch_env_override(worktree_path, mode, uuid)
    handler = PLATFORM_HANDLERS.get(sys.platform)
    if handler is None:
        return {"ok": False, "error": f"unsupported platform: {sys.platform}"}
    return handler(worktree_path, mode, uuid)
```

Linux handler internally further dispatches:
1. If `$DISPLAY` AND `$WAYLAND_DISPLAY` both empty → `_launch_linux_headless` (setsid nohup).
2. Else probe terminals via `shutil.which(...)` in priority chain → first hit wins.
3. If no terminal found → fall back to `_launch_linux_headless`.

macOS handler dispatches Terminal.app vs iTerm2 via running-process check.

Single test entry `tests/test_terminal_launcher.py` parametrizes по `(platform, sub_handler)` через `monkeypatch.setattr(sys, "platform", "linux")` + `monkeypatch.setattr(shutil, "which", lambda n: "/usr/bin/" + n if n == "gnome-terminal" else None)`. Each handler returns same response shape `{ok, method, pid}` или `{ok: false, error, tried: [...]}`.

**Связанные AC:** [AC-21](ACCEPTANCE_CRITERIA.md#ac-21-fr-21)
**Use Case:** [UC-3](USE_CASES.md#uc-3), [UC-12](USE_CASES.md#uc-12)
