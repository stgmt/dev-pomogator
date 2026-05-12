# Use Cases

## UC-1: Open dashboard and see all worktrees with last activity @feature1 @feature2 @feature12 @feature18

Developer with 10+ active worktrees opens `http://localhost:8083` to find which worktree has recent Claude activity.

- Open `http://localhost:8083` in browser
- Wait <1s for top-20 most-recent rows
- See LIVE 🟢 indicators on currently-active worktrees
- Click row to inspect last_message preview

## UC-2: Reload dashboard quickly via SWR cache @feature9

Developer reloads dashboard frequently throughout day (alt-tab, switch windows). Most reloads hit localStorage cache.

- Press F5 OR navigate back to dashboard tab
- 38/45 rows render instantly from localStorage (mtime unchanged)
- Only 7 stale rows trigger fetch with If-None-Match → server returns 304
- Total reload <300ms

## UC-3: Launch claude --resume in a new native terminal window @feature4 @feature21

Developer wants to continue work on feature/auth worktree from yesterday.

- Find row for `feature/auth` worktree (sorted by last activity)
- Click [▶ Resume] button
- Backend POST /api/launch spawns detached `wt.exe -d D:\repos\foo -- pwsh -NoExit -Command "claude --resume <uuid>"`
- New Windows Terminal window opens; cwd set to worktree path; Claude Code reads JSONL state and continues conversation
- Closing the window terminates Claude. Re-clicking [▶ Resume] later spawns another window — Claude re-reads same JSONL, conversation continues.

## UC-4: Inspect full last message in modal @feature5 @feature10

Developer sees truncated last_message preview in row, wants full context.

- Click on truncated cell text
- Native `<dialog>` opens with full text rendered through marked.js
- Click [Prev]/[Next] to navigate adjacent messages in same session
- Press Esc to close

## UC-5: View per-worktree git status @feature6

Developer wants to know which worktree has uncommitted changes before switching.

- See "Git" column showing `+10 -5 / ↑3 ↓1` per row
- Sort by git status to find dirtiest worktree first
- Open in VSCode via [📂 VSCode] action button

## UC-6: SessionStart autostart after Windows reboot @feature7 @feature13

Developer reboots Windows daily.

- After login, Claude Code session starts
- SessionStart hook executes `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1`
- Script: read `$env:LOCALAPPDATA\session-pilot\server.pid`, run `Get-Process -Id $pid -ErrorAction SilentlyContinue`; if dead/missing → `Start-Process -WindowStyle Hidden python.exe -ArgumentList server.py` and write new PID
- `Invoke-WebRequest http://127.0.0.1:8083/api/health` returns 200 within 2s

## UC-7: Multi-key shift+click sort @feature8

Developer with 8 repos × 5 worktrees = 40 rows wants to group by repo, sorted by activity within.

- Click "Repo" column header → primary sort alphabetically
- Shift+click "Last Activity" header → secondary sort DESC within each repo
- Tabulator handles natively, no custom code

## UC-8: Spawn fresh Claude in new worktree @feature11 @feature21

Developer creates new feature branch, wants fresh Claude (no resume).

- `git worktree add ../feature-X -b feat/X`
- Dashboard shows new row (no Claude history yet)
- Click [✨ Fresh] button
- Backend POST /api/launch with mode=fresh → spawns `wt.exe -d <wt-path> -- pwsh -NoExit -Command "claude"`
- New Windows Terminal window opens, bare `claude` running (no --resume, no prior context)

## UC-9: Install on fresh Windows machine @feature15 @feature16 @feature17

Developer just got new work laptop, wants session-pilot up in 5 minutes.

- Open PowerShell 7 (or Windows PowerShell 5.1)
- Run `iex (irm https://raw.githubusercontent.com/.../install.ps1)` (or local `pwsh -File install.ps1`)
- Script verifies: Python ≥3.10 → installs deps → registers SessionStart hook → probes /api/health
- Open Edge/Chrome → `http://127.0.0.1:8083` → dashboard renders

## UC-10: Diagnose missing LIVE indicator @feature3 @feature19 @feature20

Developer is actively working in lm-saas but dashboard shows it as idle.

- Run `python server.py --diagnose-livecycle D:\repos\lm-saas`
- Output shows youngest JSONL is 146s old (> default 90s threshold)
- Set `$env:LIVE_THRESHOLD_SEC=300; python server.py` and restart server
- Verify lm-saas now LIVE 🟢 in dashboard

## UC-13: One-click taskbar launcher для dashboard @feature23

Developer открывает dashboard 10+ раз в день (alt-tab between worktrees). Browser bookmark workflow = 3-click chain каждый раз. Хочет one-click icon на taskbar.

- Developer runs `pwsh -File extensions/session-pilot/tools/session-pilot/create-launcher.ps1` (Windows) / `bash create-launcher.sh` (Linux/macOS).
- Script detects browser (Edge/Chrome/Chromium/Brave), creates platform-specific launcher artifact:
  - Windows: `~/Desktop/Session Pilot.lnk` pointing at `msedge.exe --app=http://127.0.0.1:8083/`
  - Linux: `~/.local/share/applications/session-pilot.desktop`
  - macOS: `~/Applications/Session Pilot.app`
- На Windows script auto-opens Explorer at Desktop with icon highlighted.
- Developer right-clicks icon → "Pin to taskbar" (Windows) / drags to Dock (macOS) / right-click "Pin to Task Manager" (KDE).
- One-click thereafter — иконка opens dashboard в standalone window (no browser tabs, dedicated taskbar entry).

## UC-12: Bootstrap orphan worktree via skill @feature22

Developer creates new worktree manually via `git worktree add ../dev-pomogator-feat-x -b feat/x main` (без `claude --worktree` autobootstrap, без installer-run). Открывает Claude Code в новом worktree. На первом `Stop` event 8 hooks падают с `ERR_MODULE_NOT_FOUND` — `.dev-pomogator/tools/*.ts` gitignored и не существует в свежем worktree. Hooks non-blocking, но засоряют output.

- Developer notices repeated `ERR_MODULE_NOT_FOUND` в hook output.
- Developer запоминает: «у меня orphan worktree, нет installer state».
- Developer вызывает skill: «забутстрапь worktree» / `/sp-bootstrap`.
- Skill detect-ит cwd = orphan worktree (через `git worktree list` + missing sentinel `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts`).
- Skill AskUserQuestion: Bootstrap / Skip npm install / Cancel.
- User выбирает Bootstrap.
- Skill runs `npm install` (~30s, if node_modules absent) + `npm run build` (~15s, tsc) + `node bin/cli.js install .` (~5s, installer).
- Skill verifies: `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` present → "bootstrap complete".
- Next Stop event — hooks run cleanly, no ERR_MODULE_NOT_FOUND.

## UC-11: Edge — JSONL written to unexpected encoding @feature14

Developer's Cursor IDE creates worktree at `C:\Users\stigm\.cursor\worktrees\foo` — Claude JSONL written to `C--Users-stigm--cursor-worktrees-foo`.

- Diagnose CLI shows ❌ no match for that path's encoding variants
- Add new variant generation rule to `encode_path_for_claude()` covering `\.cursor\worktrees\` paths
- Regression test in `tests/test_encode_path.py`

