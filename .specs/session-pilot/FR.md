# Functional Requirements (FR)

> **Scope pivot (v0.3, 2026-05-11):** session-pilot теперь Windows-native только.
> WSL + Zellij + cross-OS работали в v0.2 (см. git history), v0.3 переписан под
> Windows PowerShell. Терминал — `wt.exe` (Windows Terminal) с fallback на
> `powershell.exe` / `cmd.exe`. Дашборд остаётся pure Python в `python.exe` на
> хосте, без WSL слоя.

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

## FR-4: POST /api/launch — Windows terminal spawn

> @feature4

POST endpoint accepts JSON `{worktree_path, mode: 'resume'|'fresh', uuid?}`. Spawns a NEW Windows terminal window with `claude --resume <uuid>` (resume mode) or `claude` (fresh mode) running in `worktree_path`. Detached от Python сервера — закрытие сервера НЕ убивает терминал.

Chain (first available wins):
1. `wt.exe -d <worktree_path> -- pwsh.exe -NoExit -Command "claude ..."` (Windows Terminal preferred)
2. `wt.exe -d <worktree_path> -- powershell.exe -NoExit -Command "claude ..."` (Windows PowerShell 5.1 fallback)
3. `cmd.exe /c start "" pwsh.exe -NoExit -Command "claude ..."` (fallback if `wt` not on PATH)
4. Override via `$env:SP_TERMINAL_CMD` template (e.g. `"alacritty.exe --working-directory {cwd} -e pwsh -NoExit -c '{cmd}'"`).

5-second idempotency lock per `(worktree_path, uuid)` — повторный клик в течение 5s не плодит дубли. Persistence terminate at user's discretion — закрытие окна = конец сессии Claude. Реоткрытие через `claude --resume <uuid>` подхватывает JSONL state.

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

`200 {"status":"ok", "version": "0.3.0", "uptime_sec": int}` for autostart probe — клиент (PowerShell installer / SessionStart hook) ждёт сервер до 2s после spawn. <5ms regardless of cache.

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

Per row: [▶ Resume] [✨ Fresh] [📂 VSCode]. Resume/Fresh spawn новое окно Windows Terminal через /api/launch (см. FR-4). VSCode opens via `subprocess.Popen(['code.cmd', path])` или `code.exe` если CLI shim не на PATH.

Кнопка Zellij Web из v0.2 удалена (мы больше не используем Zellij).

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-3](USE_CASES.md#uc-3)

## FR-12: Idle time human-readable format

> @feature12

`relativeTime(epoch)`: <60s → "just now"; <60min → Intl.RelativeTimeFormat 'minutes'; <24h → 'hours'; >24h → "Nd Nh Nm". No "1777m" anywhere.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-13: SessionStart hook idempotent autostart

> @feature13

Extension's `extension.json` registers SessionStart hook → `pwsh.exe -File start-server.ps1` (PowerShell 7) or `powershell.exe -File start-server.ps1` (PS 5.1 fallback). Idempotent: PID lock в `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id` liveness check.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-8](USE_CASES.md#uc-8)

## FR-14: SWR client cache via localStorage

> @feature14

`localStorage["session_pilot_v1_<id>"] = {mtime, etag, data}`. Page load: instant render from cache → fetch /api/index → mtime compare per row → skip unchanged → fetch with If-None-Match for stale.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-9](USE_CASES.md#uc-9)

## FR-15: PowerShell installation script

> @feature15

`install.ps1` идемпотентно настраивает session-pilot на Windows: проверяет Python ≥3.10, ставит зависимости, регистрирует SessionStart hook в Claude Code settings, создаёт ярлык в `$env:APPDATA\Microsoft\Windows\Start Menu\Programs\` (опционально). НЕ требует WSL, admin rights, ни Zellij/tmux.

```pwsh
iex (irm https://raw.githubusercontent.com/.../install.ps1)
# или offline:
pwsh -File extensions/session-pilot/install.ps1
```

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
**Use Case:** [UC-10](USE_CASES.md#uc-10)

## FR-16: Skill uses mcp__claude-in-chrome__* for browser

> @feature16

Skill scenarios use `mcp__claude-in-chrome__navigate / screenshot / read_page` for browser automation. Forbids PowerShell desktop captures (per rule `mcp-chrome-only.md`).

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
**Use Case:** [UC-3](USE_CASES.md#uc-3)

## FR-17: Windows-native path encoding

> @feature17

`encode_path_for_claude(path)` для Windows-native пути `D:\repos\foo` производит `D--repos-foo` — формат который Claude Code использует для `~\.claude\projects\` директорий на Windows. Дополнительные варианты (generic char-strip) оставлены как defensive fallback.

WSL-варианты (`/mnt/X/...` → `-mnt-X-...`) удалены — v0.3 не таргетит WSL. (Encoder функция кодово поддерживает все варианты, но в production-paths их быть не должно.)

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

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
