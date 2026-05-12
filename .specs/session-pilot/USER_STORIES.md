# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Multi-repo worktree dashboard with meaningful info @feature1 @feature2 @feature3 @feature6 @feature9 @feature12 @feature14 @feature17 (Priority: P1)

As a developer with 10+ active worktrees, I want to see all my Claude sessions in one browser page with repo + branch + worktree path + HEAD + last activity + last message preview, чтобы быстро вспомнить над чем работал.

**Why:** Без дашборда — невозможно понять какая сессия Claude Code какому worktree-у принадлежит без ручного `dir ~\.claude\projects\` и парсинга JSONL файлов.

**Independent Test:** Open `http://127.0.0.1:8083`, verify table renders with columns Status / Repo / Branch / HEAD / Worktree path / Last activity / Last message / Msgs / Git / Action.

**Acceptance Scenarios:**

Given dashboard is running on port 8083
When user opens `http://localhost:8083` in browser
Then table shows all git worktrees from configured repos with all 10 columns populated, sorted by last activity DESC

---

> **v0.4 notes:**
> — Cross-platform de-pivot adds @feature21 (OS detection + dispatch architecture) which manifests in US-2 (one-click resume) и US-8 (one-command install). Each spawn from Resume/Fresh now dispatches per-OS via terminal_launcher.py.
> — @feature22 (on-demand worktree bootstrap skill — US-9 below) sibling to dashboard recall: dashboard closes "no-session" gap для existing worktrees, bootstrap-skill closes "no-tools" gap для orphan worktrees.

### User Story 9: On-demand orphan worktree bootstrap @feature22 (Priority: P2)

As a developer who creates git worktrees manually via `git worktree add` (без `claude --worktree` autobootstrap), I want a skill `/sp-bootstrap` which я вызываю **only когда нужно** (видя `ERR_MODULE_NOT_FOUND` в hook output), to install dev-pomogator's `.dev-pomogator/tools/` artefacts в текущем worktree, чтобы stop hooks (auto-commit, simplify, dedup, tui, prompt-suggest, capture, bg-task-guard, test-spec-gate) перестали падать.

**Why:** dev-pomogator hooks paths указывают на `.dev-pomogator/tools/*.ts` (installer-output, gitignored). Свежий `git worktree add` создаёт checkout без installer state — hooks падают `ERR_MODULE_NOT_FOUND`. Не хочу auto-fire bootstrap на каждый `git worktree add` (медленно ~50s, не всегда нужен — иногда worktree throwaway); хочу skill on-demand.

**Independent Test:** В orphan worktree (без `.dev-pomogator/tools/`) вызвать `/sp-bootstrap`, выбрать Bootstrap, дождаться "bootstrap complete", trigger Stop event (e.g. через любой prompt → response cycle), убедиться что 8 stop hooks больше не пишут `ERR_MODULE_NOT_FOUND`.

**Acceptance Scenarios:**

Given cwd is orphan worktree без `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts`
When user invokes skill `session-pilot-bootstrap`
Then skill presents AskUserQuestion {Bootstrap, Skip npm install, Cancel}
When user chooses Bootstrap
Then skill runs `npm install --no-audit --no-fund` (if node_modules absent) + `npm run build` + `node bin/cli.js install .`
And responds "bootstrap complete"
And next Stop event runs hooks cleanly

Given cwd is main worktree (already bootstrapped via dev workflow)
When user invokes skill `session-pilot-bootstrap`
Then skill responds "main worktree already bootstrapped; skip"
And exits without action

Given cwd is orphan worktree already bootstrapped previously
When user re-invokes skill (without --force)
Then skill responds "already bootstrapped"
And exits without re-running installer

---

### User Story 2: One-click Claude resume in native terminal (cross-platform) @feature4 @feature11 @feature21 (Priority: P1)

As a developer on Windows OR Linux OR macOS, I want to click [▶ Resume] button in a row to launch `claude --resume <uuid>` in a new native terminal window (или background-detached процесс на headless Linux) for that worktree, чтобы не печатать команду руками — независимо от того с какой ОС работаю.

**Why:** Без one-click надо: вручную открыть Windows Terminal, `cd D:\repos\<wt>`, найти UUID, набрать `claude --resume <uuid>`. Дашборд знает всё это — должен делать сам.

**Independent Test:** Click [▶ Resume] on a row with known UUID. Verify new Windows Terminal window opens with cwd set to worktree path AND `claude --resume <uuid>` running in it.

**Acceptance Scenarios:**

Given a worktree row with claude_running_now=False but having JSONL history
And UUID `abc-def-...` is the latest session for that worktree
When user clicks [▶ Resume] button
Then backend POST /api/launch returns ok=true with method ∈ {wt-spawn, cmd-fallback, env-override}
And a new Windows Terminal (or PowerShell) window opens detached from the server process
And the new terminal's cwd is `D:\repos\<wt>`
And `claude --resume abc-def-...` is the active running command in that terminal

---

### User Story 3: Reboot survival via SessionStart PowerShell hook @feature7 @feature13 (Priority: P1)

As a developer who reboots Windows daily, I want dashboard server to autostart on Claude Code startup, чтобы не настраивать всё заново после каждого reboot.

**Why:** Manual restart of dashboard + remembering which `claude --resume <uuid>` to run for each worktree is the original "10+ окон" pain. After reboot dashboard должен быть готов мгновенно — открыл браузер, увидел список, кликнул [▶ Resume].

(Замечание: terminal windows c Claude не выживают reboot — это OK, дашборд показывает JSONL state and one-click Resume восстанавливает разговор через `claude --resume <uuid>`.)

**Independent Test:** Reboot machine, login, launch Claude Code → SessionStart hook fires → open `http://127.0.0.1:8083` → dashboard renders.

**Acceptance Scenarios:**

Given dashboard server was running before reboot
When user reboots Windows
And logs back in
And launches Claude Code
Then SessionStart hook executes `pwsh.exe -File start-server.ps1` idempotently
And `Invoke-WebRequest http://127.0.0.1:8083/api/health` returns 200 within 2s
And dashboard at http://127.0.0.1:8083 renders all worktrees with their last JSONL state preserved

---

### User Story 4: Pagination — top 20 first paint @feature8 @feature9 (Priority: P1)

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

### User Story 5: Modal for full last message @feature5 @feature10 (Priority: P2)

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

### User Story 6: Multi-key sort with libs @feature8 (Priority: P2)

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

### User Story 7: Plugin distribution + skill @feature16 @feature18 @feature19 @feature20 (Priority: P2)

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

### User Story 8: One-command Windows install @feature15 @feature17 (Priority: P2)

As a Windows developer setting up session-pilot for the first time, I want one PowerShell command that installs everything, чтобы не возиться вручную.

**Why:** Manual install — установка Python, прописывание hook в settings.json, проверка что порт свободен, запуск сервера — error-prone и плохо документируется. Single `install.ps1` делает всё за пользователя.

**Independent Test:** On a fresh Windows VM, run `pwsh -File install.ps1`. Verify: deps installed, hook registered, server up на :8083, dashboard renders в браузере.

**Acceptance Scenarios:**

Given a fresh Windows machine with Python ≥3.10 and PowerShell ≥5.1
When user runs `pwsh -File extensions/session-pilot/install.ps1`
Then script installs Python deps idempotently
And script writes `pwsh.exe -File start-server.ps1` SessionStart hook into Claude Code settings.json
And script verifies `Invoke-WebRequest http://127.0.0.1:8083/api/health` returns 200 within 5s
And on re-run script detects existing install and exits 0 без модификации

## Risk Assessment

(Auto-populated by `discovery-forms` skill — see `RESEARCH.md ## Risk Assessment` for cross-cutting risks identified during Phase 1.)
