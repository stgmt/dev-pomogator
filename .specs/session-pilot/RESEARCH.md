# Research

## Контекст

session-pilot is a worktree dashboard plugin that emerged iteratively from a working prototype in `.dev-pomogator/bin/worktree-dashboard.py`. This research consolidates technical decisions made during the prototype phase plus competitive analysis (full deep-dive in COMPETITIVE_ANALYSIS.md once Phase 2 of plan completes).

## Источники

- Zellij CLI actions reference: https://zellij.dev/documentation/cli-actions
- Zellij Web Client tutorial: https://zellij.dev/tutorials/web-client/
- Zellij Session Resurrection docs: https://zellij.dev/documentation/session-resurrection.html
- Tabulator.js library: https://tabulator.info (MIT, multi-key sort native via shift+click, virtual scroll)
- marked.js markdown: https://marked.js.org (MIT, ~30KB minified)
- Intl.RelativeTimeFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat
- ccmanager (kbwo): https://github.com/kbwo/ccmanager
- agent-of-empires (njbrake): https://github.com/njbrake/agent-of-empires
- vibe-kanban (BloopAI): https://github.com/BloopAI/vibe-kanban (sunsetting)
- claudecodeui (siteboon): https://github.com/siteboon/claudecodeui (10.7k stars)

## Технические находки

### Cross-platform spawn research (v0.4, 2026-05-12)

Standalone research session via `research-workflow` skill, 4 parallel sub-agents, ≥3 independent sources per hypothesis. Triggered после v0.3 Windows-only pivot чтобы de-pivot к cross-platform — но БЕЗ Zellij/WSL bridge которые мы dropped.

#### Claude Code CLI flags relevant к spawn dispatch

**Source**: code.claude.com/docs/en/cli-reference (fetched verbatim), docs.anthropic.com/en/docs/claude-code mirror.

- `claude --cwd <path>` **[FALSIFIED]**: не существует. [Issue #26287](https://github.com/anthropics/claude-code/issues/26287) — feature request closed inactive. Positional path argument тоже отсутствует. Workaround: `cd <path> && claude` в shell перед launch.
- `claude --worktree <name>` / `-w` **[VERIFIED]**: native Anthropic worktree mechanism. Quote: *"Start Claude in an isolated git worktree at `<repo>/.claude/worktrees/<name>`. If no name is given, one is auto-generated"*. Cross-platform — работает на любой ОС где Claude Code запускается.
- `claude --resume <uuid>` / `-r`: верифицировано — подхватывает session по UUID. Inherits shell cwd. Эта механика — основа сессии в session-pilot dashboard (FR-4).
- `claude --add-dir <path>`: **only** добавляет dir в read/edit scope, НЕ меняет cwd (важный edge для headless detached спавна — мы не используем).

#### Session cwd cannot change mid-process

**[VERIFIED]** через 3 angles:
- Anthropic CONTRIBUTOR `rboyce-ant` в [#1628](https://github.com/anthropics/claude-code/issues/1628): *"if you need to change the original working directory, the best way to do that is to exit Claude Code and start a new session"*.
- [#42844 OPEN regression](https://github.com/anthropics/claude-code/issues/42844): Bash `cd` сбрасывается каждой командой ("Shell cwd was reset to ..."). 
- 4 ещё открытых feature requests на `/cd` slash command — ни один не merged.

Implication для session-pilot: каждый ▶ Resume / ✨ Fresh MUST spawn **новый процесс** (новое terminal окно / новый headless setsid). Reload/recall существующей сессии без spawn невозможен на любой ОС.

#### Windows spawn pattern — `Start-Process -PassThru` canonical

**[VERIFIED]** через 3 angles:
- MS Learn `Start-Process` docs: *"`-PassThru` Returns a process object for each process that the cmdlet started"* + *"By default on Windows, PowerShell opens a new window"* + *"the launched process lives on independent from the calling process"* (Windows-specific вы детач).
- Real-world: `Azure/azure-sdk-for-net` `eng/common/mcp/azure-sdk-mcp.ps1` — `$proc = Start-Process -PassThru -WorkingDirectory $RunDirectory ...`.
- Inside Python: `subprocess.Popen([wt, ...])` эквивалентен — возвращает Popen object с `.pid`, detached от parent при `start_new_session=False` (default) + Popen-managed lifetime.

`wt.exe -d <path>` нравится UX но **PID теряется** ([microsoft/terminal#8856](https://github.com/microsoft/terminal/issues/8856)): wt.exe shim hands off to WindowsTerminal.exe service, спавненный pwsh child PID unknowable. Solution: use `wt.exe` для UX, track wt.exe shim PID (а не pwsh child) — достаточно для liveness check.

#### Linux terminal detection chain

**[VERIFIED]** через man pages + release notes + community examples:

| Terminal | cwd arg | command arg | Detection (which) |
|----------|---------|-------------|-------------------|
| `gnome-terminal` | `--working-directory=<path>` | `-- bash -c "..."` | shutil.which("gnome-terminal") |
| `konsole` | `--workdir <path>` | `-e bash -c "..."` | shutil.which("konsole") |
| `alacritty` | `--working-directory <path>` | `-e bash -c "..."` | shutil.which("alacritty") |
| `kitty` | `--directory <path>` | `bash -c "..."` (positional) | shutil.which("kitty") |
| `wezterm` | `start --cwd <path>` | `-- bash -c "..."` | shutil.which("wezterm") |
| `xfce4-terminal` | `--working-directory=<path>` | `-e "bash -c '...'"` | shutil.which("xfce4-terminal") |
| `tilix` | `-w <path>` | `-e "bash -c '...'"` | shutil.which("tilix") |
| `terminator` | `--working-directory=<path>` | `-e "bash -c '...'"` | shutil.which("terminator") |
| `xterm` | (none) | `-e "cd <path> && ..."` | shutil.which("xterm") |

Order matters: `$TERMINAL` env var first (user opt-in override), then desktop-environment-preferred (gnome → konsole → alacritty), then minimal fallback (xterm).

**Headless detection**: `$DISPLAY` AND `$WAYLAND_DISPLAY` обе пустые ИЛИ no GUI terminal found → `setsid nohup bash -c "cd <path> && claude" </dev/null >/dev/null 2>&1 &` через `subprocess.Popen(start_new_session=True)`. PID капчуру через Popen `.pid`. `start_new_session=True` calls `setsid()` в child atomically (CPython `_posixsubprocess.c` L763-779) [VERIFIED].

#### macOS osascript pattern

**[VERIFIED]** через Apple Developer docs Terminal AppleScript dictionary + iTerm2 docs:

- Terminal.app: `osascript -e 'tell application "Terminal" to do script "cd <cwd> && claude --resume <uuid>"'` — opens new tab/window with command running.
- iTerm2: `osascript -e 'tell application "iTerm2" to create window with default profile command "claude --resume <uuid>"'` — separate AppleScript dictionary, requires iTerm2 запущен или auto-launches.
- iTerm2 detection: `osascript -e 'tell application "System Events" to (name of processes) contains "iTerm2"'` returns `true`/`false` <50ms. Single call before spawn decides which path.

Security: argv-based — `-e` flag принимает script string as arg, ssscript itself не interpolates shell vars (osascript evaluates AppleScript inside). UUID validation через regex `^[0-9a-f-]{36}$` still required чтобы uuid не содержал quote characters which would break AppleScript string literal.

#### Worktree dir conventions (informational, не applicable к session-pilot)

session-pilot читает существующие worktrees (через `git worktree list`), не создаёт их. Но research выявил dominant convention:

- `.worktrees/<branch>` нестед — **dominant** (49+ репов в .gitignore search), включая Claude-aware dotfiles.
- `<repo>-worktrees/<branch>` sibling — secondary.
- `~/worktrees/<repo>/<branch>` centralized — rare, advocated для AI-agent fleets.

Anthropic native `claude -w` creates worktrees в `<repo>/.claude/worktrees/<name>` — это subset of nested convention. `.gitignore` обязан содержать `.claude/worktrees/` чтобы worktree files не trackались.

#### Prior art (8 projects, none Windows-native)

| Repo | Stars | Подход | OS gap |
|------|-------|--------|--------|
| automazeio/ccpm | 8089 | multi-agent один worktree, GitHub Issues sync | mac/linux only |
| smtg-ai/claude-squad | 7421 | tmux pane per agent | mac/linux (Windows tmux file есть но не функциональный) |
| stravu/crystal | 3050 | Electron multi-window | mac/linux only |
| njbrake/agent-of-empires | 2172 | tmux + Web UI mobile | mac/linux only |
| Priivacy-ai/spec-kitty | 1208 | Kanban dashboard | mac/linux only |
| craigsc/cmux | 531 | process-per-worktree, .worktrees/<br>nested | mac/linux (pure bash) |
| baixianger/claude-orchestration-in-cmux | <50 | Claude orchestrates Claude via cmux | mac/linux only |
| umputun/ralphex | <200 | one process per plan | mac/linux + Docker |

**Implication**: session-pilot v0.4 cross-platform — competitive moat. Никто из 8 existing tools не имеет Windows-native support. Session-pilot уже имеет Windows (v0.3 work); добавление Linux+macOS native (без tmux dependency) — unique positioning.

#### Claude Code project memory location

**[VERIFIED via direct observation in this session]**: Claude Code derives memory dir slug по rule "drive colon stripped + each path separator → `-`":

- Windows: `D:\repos\dev-pomogator` → `~/.claude/projects/D--repos-dev-pomogator/`
- Linux (assumed by symmetry, not directly observed): `/home/user/repos/foo` → `~/.claude/projects/-home-user-repos-foo/`
- macOS (assumed): `/Users/stigm/repos/foo` → `~/.claude/projects/-Users-stigm-repos-foo/`

This encoding rule = canonical для FR-17 (path encoder). Docs не enumerate the rule explicitly ([anthropics/claude-code#25947](https://github.com/anthropics/claude-code/issues/25947) confirms existence of `<encoded-project-path>` slug but не documents encoding) — Linux/macOS variants [ASSUMED] from Windows-observed pattern и общая Claude Code convention. Implementation должен validate против `~/.claude/projects/` content during install.

### Zellij action injection — 2 paths

`zellij --session NAME action write-chars "<cmd>\n"` injects keystrokes into focused pane. Works whether attached or not (focused pane persists across detach). Race condition: if focus shifted after call, the keystrokes go to wrong pane. Mitigation: `zellij --session NAME action focus-pane-id terminal_1` THEN write-chars.

For NEW sessions: `zellij --session NAME --layout /tmp/<file>.kdl` creates session with predefined panes. KDL `pane { command "claude"; args "--resume" "<uuid>"; cwd "<path>" }` launches claude on session start. Use `setsid ... &` to detach from HTTP backend.

### Cross-OS Claude path encoding

Claude Code stores conversation JSONLs at `~/.claude/projects/<encoded>/<uuid>.jsonl`. Encoding rules:
- Linux (WSL): `/mnt/d/repos/foo` → `-mnt-d-repos-foo`
- Windows native: `D:\repos\foo` → `D--repos-foo`

When user works in WSL but Claude is launched on Windows-native CWD (e.g., from VSCode/Cursor which uses `D:\repos\...`), JSONLs land in `D--repos-*` directory. Dashboard scans BOTH `~/.claude/projects` (WSL) AND `/mnt/c/Users/stigm/.claude/projects` (Windows mount) AND must generate BOTH variants for each worktree path.

### Claude Code batches JSONL writes

Empirical observation (May 2026): Claude Code does NOT flush JSONL on every keystroke. Writes are batched approximately every 2-3 minutes during active typing. This means:
- mtime threshold of 90s misses ACTIVE sessions (false negative for LIVE indicator)
- Default threshold should be ~300s (5 min) to balance freshness vs false negatives
- B-1 incident: lm-saas worktree showed idle despite user actively typing, youngest JSONL was 146s old

### SWR (stale-while-revalidate) cache pattern

Vercel's SWR pattern: serve cache instantly, fetch fresh in background, replace UI when fresh arrives. Implementation:
- Server: ETag header `W/"<mtime>"` for /api/claude responses
- Server: handle `If-None-Match` request header → 304 with empty body if match
- Client: localStorage `session_pilot_v1_<id> = {mtime, etag, data}` per row
- Client: on /api/index response, compare per-row mtime; if unchanged → use cache; if stale → fetch with If-None-Match

Result: 38/45 rows skip fetch entirely on warm reload; 7 stale rows fetch with 304 path (5ms each).

### Pagination strategies (Phase 4 benchmark)

Three alternatives to evaluate:
- **Alt A (priority queue)**: Frontend sorts /api/index response by mtime DESC, splits into top-20 priority + rest queues. 4 workers drain priority first.
- **Alt B (LIVE-only first)**: Only fetch /api/claude for rows with `claude_running_now`. Other rows lazy via IntersectionObserver on scroll.
- **Alt C (SQLite index)**: Background daemon maintains SQLite index of all JSONLs. Server queries SQL → near-instant response.

Phase 4 measures Performance.now() metrics for each on synthetic 300-row dataset. Decision documented in DESIGN.md.

## Где лежит реализация

- App-код: `extensions/session-pilot/tools/session-pilot/server.py` (700-line single file Phase 1, refactor in Phase 5)
- UI: `extensions/session-pilot/tools/session-pilot/ui/` (created in Phase 5)
- Tests: `extensions/session-pilot/tools/session-pilot/tests/`
- KDL templates: `extensions/session-pilot/tools/session-pilot/layouts/`
- Skill: `.claude/skills/session-pilot/SKILL.md`
- Rules: `.claude/rules/session-pilot/{action-button-injection, claude-projects-encoding, perf-budget, mcp-chrome-only}.md`

## Выводы

1. **Zellij `action write-chars` works** for command injection into existing sessions (must focus-pane-id first to avoid races).
2. **KDL layouts are reliable** for new session creation with predefined commands. Use setsid for HTTP backend detach.
3. **Cross-OS encoding** must generate BOTH variants per path; Claude on Windows writes to `D--*` even when /mnt/d cwd.
4. **300s LIVE threshold** balances Claude's batching with freshness signal for users.
5. **SWR + ETag** makes reloads near-instant after first load (only stale rows refetch).
6. **Tabulator native multi-sort** (shift+click) eliminates need for custom sort code.
7. **Native `<dialog>`** + marked.js sufficient for modal viewer (no React/Vue needed).

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-layout | `.claude/rules/extension-layout.md` | Rules/skills must live in `.claude/` root, not extensions/{name}/ | Any extension creation | All FRs (defines plugin structure) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json must list all toolFiles for updater | Adding files to plugin | FR-1..FR-20 (manifest tracking) |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | Use .ts extension in imports for native strip-types | TypeScript files in extensions/ | N/A — Python plugin |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Tests must run real server, not mock | Test creation | NFR-Anti-4 |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Background long tests, never block session | Running tests | NFR-Perf, Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| specs-workflow | `extensions/specs-workflow/` | scaffold-spec.ts, audit-spec.ts, spec-status.ts | Used for this spec's lifecycle |
| plan-pomogator | `extensions/plan-pomogator/` | Plan template + validation hooks | Used for implementation plan |
| onboard-repo | `extensions/onboard-repo/` | Schema validator pattern for `.specs/.onboarding.json` | Reference for AJV-based validation |
| tui-test-runner | `extensions/tui-test-runner/` | YAML status file pattern for live monitoring | Reference for /api/health pattern |

### Architectural Constraints Summary

- All plugin files must be enumerated in `extension.json.toolFiles` for updater integrity (extension-manifest-integrity rule)
- Skills must live in `.claude/skills/{name}/`, not inside extension dir (extension-layout rule)
- Tests must run real server via subprocess, not mocked HTTP (integration-tests-first rule)
- Background long tasks (Docker tests etc.) must not block Claude session (no-blocking-on-tests rule)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Zellij `action write-chars` race-condition: focus shifts before keystrokes injected | Medium | Medium | Always call `action focus-pane-id terminal_1` BEFORE write-chars; document in rule action-button-injection.md |
| Cross-OS path encoding misses new variant (Cursor IDE, WSL2 mirrored mode, etc.) | High | High | Diagnostic CLI `--diagnose-livecycle` exposes encoding gaps quickly; regression tests in test_encode_path.py with broad fixture set |
| Tabulator vendored 150KB slows first paint on slow connection | Low | Low | Cache-Control: max-age=86400 for vendored assets; consider service worker for offline |
| Pagination alternative chosen poorly → user sees worse perf | Medium | High | Phase 4 benchmark with Performance.now() instrumentation on synthetic 300-row dataset before committing |
| Claude Code changes JSONL location/format in future | Low | High | Diagnostic CLI dumps actual scanned dirs; user can adjust CLAUDE_PROJECTS_DIRS via env |
| WSL2 NAT mode breaks netsh portproxy after Windows update | Low | Medium | Document in README; provide fallback `Invoke-WebRequest http://<WSL_IP>:8083` instructions |
| Playwright frontend e2e spawn race on WSL2: browser teardown vs `setsid` detach in HTTP handler thread sometimes loses Zellij session registration even though POST returns 200 | Medium → Low (fixed v0.2) | Low | **FIXED v0.2** via `_zellij_spawn_with_layout` rewrite (commit at PR #17). Research (2026-05-11) refined the diagnosis: SIGPIPE-via-process-group theory was incorrect — SIGPIPE is thread-directed (man signal(7)). Real mechanism is **fd inheritance**: previous shell hop `bash -c "setsid script -qfc ... /dev/null &"` kept the PTY master inside the `script` process whose lifetime was tied to the HTTP handler thread; when Playwright closed the browser context, master fd closed → kernel delivered EOF/SIGHUP to Zellij child. Combined with libfuse-style #27 race (parent exit vs child setsid). Fix details: (1) **drop shell wrapper** — direct `subprocess.Popen([ZELLIJ_BIN, ...], start_new_session=True, close_fds=True, stdin/stdout/stderr=slave_fd)`. `start_new_session=True` calls `setsid()` in child between fork+execve atomically via CPython `_posixsubprocess.c` L763-779 [VERIFIED Python 3.2+ docs + CPython source]. (2) **own the PTY** — `pty.openpty()`, slave goes to child as stdio, master parked in module-global `_PTY_MASTERS` so GC doesn't close it. Kernel reclaims on server exit. Verified by `test_zellij_spawn_isolation.py` (asserts child pgid ≠ server pgid + child survives parent SIGPIPE). Sources: docs.python.org/3 subprocess `start_new_session`, libfuse Issue #27, microsoft/WSL #8161, man signal(7). |
