# Use Cases

## UC-1: Open dashboard and see all worktrees with last activity

Developer with 10+ active worktrees opens `http://localhost:8083` to find which worktree has recent Claude activity.

- Open `http://localhost:8083` in browser
- Wait <1s for top-20 most-recent rows
- See LIVE 🟢 indicators on currently-active worktrees
- Click row to inspect last_message preview

## UC-2: Reload dashboard quickly via SWR cache

Developer reloads dashboard frequently throughout day (alt-tab, switch windows). Most reloads hit localStorage cache.

- Press F5 OR navigate back to dashboard tab
- 38/45 rows render instantly from localStorage (mtime unchanged)
- Only 7 stale rows trigger fetch with If-None-Match → server returns 304
- Total reload <300ms

## UC-3: Launch claude --resume in Zellij with one click

Developer wants to continue work on feature/auth worktree from yesterday.

- Find row for `feature/auth` worktree (sorted by last activity)
- Click [▶ Resume] button
- Backend POST /api/launch injects `claude --resume <last-uuid>` via Zellij `action write-chars`
- `mcp__claude-in-chrome__navigate` opens `http://localhost:8082/?session=<repo>__feature_auth`
- Developer is in Zellij with claude bootstrapped

## UC-4: Inspect full last message in modal

Developer sees truncated last_message preview in row, wants full context.

- Click on truncated cell text
- Native `<dialog>` opens with full text rendered through marked.js
- Click [Prev]/[Next] to navigate adjacent messages in same session
- Press Esc to close

## UC-5: View per-worktree git status

Developer wants to know which worktree has uncommitted changes before switching.

- See "Git" column showing `+10 -5 / ↑3 ↓1` per row
- Sort by git status to find dirtiest worktree first
- Open in VSCode via [📂 VSCode] action button

## UC-6: SessionStart autostart after reboot

Developer reboots Windows daily.

- After login, Claude Code session starts
- SessionStart hook executes `bash start-server.sh`
- Script: read PID, kill -0 check; if dead → setsid python3 server.py &
- `curl http://localhost:8083/api/health` returns 200 within 2s

## UC-7: Multi-key shift+click sort

Developer with 8 repos × 5 worktrees = 40 rows wants to group by repo, sorted by activity within.

- Click "Repo" column header → primary sort alphabetically
- Shift+click "Last Activity" header → secondary sort DESC within each repo
- Tabulator handles natively, no custom code

## UC-8: Spawn fresh Claude in new worktree

Developer creates new feature branch, wants fresh Claude (no resume).

- `git worktree add ../feature-X -b feat/X`
- Dashboard shows new row (no Claude history yet)
- Click [✨ Fresh] button
- Backend creates Zellij session named `<repo>__feat_X` with KDL layout `command "claude" cwd "<wt>"`
- Open Zellij, claude is running

## UC-9: Cross-OS access from Windows browser to WSL server

Developer's server runs in WSL Ubuntu, browser is on Windows.

- Run `netsh portproxy add v4tov4 listenport=8083 connectaddress=<WSL_IP>`
- Open `http://localhost:8083` in Edge on Windows
- Same response as from `curl http://127.0.0.1:8083` inside WSL

## UC-10: Diagnose missing LIVE indicator

Developer is actively working in lm-saas but dashboard shows it as idle.

- Run `python3 server.py --diagnose-livecycle /mnt/d/repos/lm-saas`
- Output shows youngest JSONL is 146s old (> default 90s threshold)
- Set `LIVE_THRESHOLD_SEC=300` and restart server
- Verify lm-saas now LIVE 🟢 in dashboard

## UC-11: Edge — JSONL written to unexpected encoding

Developer's Cursor IDE creates worktree at `C:\Users\stigm\.cursor\worktrees\foo` — Claude JSONL written to `C--Users-stigm--cursor-worktrees-foo`.

- Diagnose CLI shows ❌ no match for that path's encoding variants
- Add new variant generation rule to `encode_path_for_claude()` covering `\\.cursor\\worktrees\\` paths
- Regression test in `tests/test_encode_path.py`
