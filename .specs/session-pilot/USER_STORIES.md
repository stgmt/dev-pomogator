# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Multi-repo worktree dashboard with meaningful info (Priority: P1)

As a developer with 10+ active worktrees, I want to see all my Claude sessions in one browser page with repo + branch + worktree path + HEAD + last activity + last message preview, чтобы быстро вспомнить над чем работал.

**Why:** Current Zellij Session Manager shows random animal-name sessions ("glowing-platypus") with no repo/branch info — impossible to know which session belongs to which worktree.

**Independent Test:** Open `http://localhost:8083`, verify table renders with columns Status / Repo / Branch / HEAD / Worktree path / Last activity / Last message / Msgs / Zellij session / Action.

**Acceptance Scenarios:**

Given dashboard is running on port 8083
When user opens `http://localhost:8083` in browser
Then table shows all git worktrees from configured repos with all 10 columns populated, sorted by last activity DESC

---

### User Story 2: One-click Claude resume (Priority: P1)

As a developer, I want to click [▶ Resume] button in a row to launch `claude --resume <uuid>` in a Zellij session for that worktree, чтобы не печатать команду руками.

**Why:** Currently the Action button only opens Zellij URL — does NOT inject the command. User has to type `claude --resume <uuid>` manually in each session.

**Independent Test:** Click [▶ Resume] on a row with known UUID, verify Zellij session is created/attached AND `claude --resume <uuid>` command is running in the focused pane.

**Acceptance Scenarios:**

Given a worktree row with claude_running_now=False but having JSONL history
And UUID `abc-def-...` is the latest session for that worktree
When user clicks [▶ Resume] button
Then backend POST /api/launch returns ok=true
And Zellij session named `<repo>__<branch>` exists (visible in `zellij list-sessions`)
And the Zellij pane is running `claude --resume abc-def-...`
And browser navigates to `http://localhost:8082/?session=<repo>__<branch>` via `mcp__claude-in-chrome__navigate`

---

### User Story 3: Reboot survival via SessionStart hook (Priority: P1)

As a developer who reboots Windows daily, I want dashboard server to autostart on login + Zellij sessions to be restorable, чтобы не настраивать всё заново после каждого reboot.

**Why:** Manual restart of dashboard + remembering which `claude --resume <uuid>` to run for each worktree is the original "10+ окон" pain.

**Independent Test:** Reboot machine, login, open dashboard URL — verify server is alive (200 from /api/health) AND Zellij sessions list contains previously-active sessions.

**Acceptance Scenarios:**

Given dashboard was running before reboot
When user reboots Windows
And logs back in
Then SessionStart hook starts dashboard server idempotently
And `curl http://localhost:8083/api/health` returns 200
And Zellij Web Client at localhost:8082 shows previously-active sessions (via Zellij session resurrection)

---

### User Story 4: Pagination — top 20 first paint (Priority: P1)

As a developer with 45 worktrees, I want top 20 most-recent sessions to appear within 1 second, остальные подгружаются прозрачно в фоне без блокировки UI.

**Why:** "Loading Claude history (9/45)…" takes ~12 seconds cold load — too slow for daily use.

**Independent Test:** Cold load dashboard (clear localStorage), measure time-to-first-paint of top-20 rows via Performance.now().

**Acceptance Scenarios:**

Given dashboard cold load (empty localStorage)
And 45 worktrees configured (9 with Claude history)
When user navigates to `http://localhost:8083`
Then top-20 rows (sorted by claude_max_mtime DESC) are fully populated within 1 second
And remaining 25 rows show "scanning..." placeholder
And background workers continue enrichment without blocking UI scroll/sort/filter

---

### User Story 5: Modal for full last message (Priority: P2)

As a developer, I want to click on the truncated "Last message" cell to see full message in a modal with prev/next navigation, чтобы вспомнить контекст.

**Why:** In-cell preview is truncated to ~140 chars — full context is lost.

**Independent Test:** Click last_message cell in any row, verify `<dialog>` opens with full text + prev/next buttons work.

**Acceptance Scenarios:**

Given a row has claude_sessions[0] with last_message="..."
When user clicks the "Last message" cell
Then a `<dialog>` element opens via `dialog.showModal()`
And full message content is rendered through marked.js (markdown supported)
And [Prev] / [Next] buttons re-fetch index ± 1 via GET /api/message
And ESC key closes the dialog (browser default)

---

### User Story 6: Multi-key sort with libs (Priority: P2)

As a developer, I want shift+click multi-key sort: primary by Repo, secondary by Last Activity, чтобы увидеть мои репо сгруппированно с свежими сверху.

**Why:** Single-key sort means I can't simultaneously group-by-repo AND see freshest within. User said: «не изобретай велосипеды юзай либы».

**Independent Test:** Click "Repo" column header → table sorts alphabetically by repo. Shift+click "Last Activity" → table now grouped by repo with activity DESC within.

**Acceptance Scenarios:**

Given dashboard shows 45 rows
When user clicks "Repo" header
Then table is sorted alphabetically by Repo column
When user shift+clicks "Last Activity" header
Then table maintains primary sort by Repo
And secondary sort by Last Activity DESC within each Repo group
(Native Tabulator.js behavior, no custom code)

---

### User Story 7: Plugin distribution + skill (Priority: P2)

As a maintainer, I want session-pilot delivered as a versioned dev-pomogator extension with paired skill + spec, чтобы новые контрибы могли работать с ним без потери знаний.

**Why:** Original prototype was in `.dev-pomogator/bin/` (gitignored) — not version-controlled, no docs, no maintenance plan.

**Independent Test:** Run `npm install dev-pomogator` on a fresh machine, verify session-pilot extension is installed AND skill triggers work AND spec audit exits 0.

**Acceptance Scenarios:**

Given a fresh machine with dev-pomogator package installed
When user runs `dev-pomogator install` in a project
Then session-pilot files are copied to target via toolFiles manifest
And SessionStart hook is registered to autostart server
And skill `.claude/skills/session-pilot/SKILL.md` is installed
And `Skill("session-pilot")` triggers respond to "open dashboard" / "launch claude в worktree X"

---

### User Story 8: Cross-OS access (Priority: P2)

As a developer using both WSL Ubuntu (for the server) and Windows host (for the browser), I want dashboard accessible from BOTH localhost endpoints, чтобы не настраивать proxy руками.

**Why:** WSL2 NAT mode doesn't always forward localhost — `netsh portproxy add v4tov4` is needed.

**Independent Test:** From WSL: `curl http://localhost:8083/api/health` → 200. From Windows PowerShell: `Invoke-WebRequest http://localhost:8083/api/health` → 200.

**Acceptance Scenarios:**

Given dashboard server bound to 0.0.0.0:8083 in WSL
And `netsh portproxy add v4tov4 listenport=8083 connectaddress=<WSL_IP>` configured
When user opens browser on Windows host
Then `http://localhost:8083` returns dashboard HTML
And `http://localhost:8083/api/index` returns JSON same as from WSL curl

## Feature tag map (US ↔ @featureN)

For traceability between user stories and BDD scenarios in
[session-pilot.feature](session-pilot.feature). Audit
FEATURE_TAG_PROPAGATION verifies every @featureN in .feature
appears in this file.

| User Story | Covered features |
|------------|------------------|
| US-1: Multi-repo dashboard | @feature1 @feature2 @feature9 @feature17 |
| US-2: One-click Resume | @feature4 @feature11 |
| US-3: Reboot survival | @feature13 @feature7 |
| US-4: Pagination top-20 | @feature9 @feature8 |
| US-5: Modal viewer | @feature5 @feature10 |
| US-6: Multi-key sort | @feature8 |
| US-7: Plugin distribution | @feature16 @feature18 @feature19 @feature20 |
| US-8: Cross-OS access | @feature15 @feature17 |
| Cross-cutting | @feature3 @feature6 @feature12 @feature14 |

## Risk Assessment

(Auto-populated by `discovery-forms` skill — see `RESEARCH.md ## Risk Assessment` for cross-cutting risks identified during Phase 1.)
