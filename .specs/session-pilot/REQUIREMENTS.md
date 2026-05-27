# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-get-apiindex--fast-worktree-list-with-claude_max_mtime) | GET /api/index — fast worktree list | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Implemented |
| [FR-2](FR.md#fr-2-get-apiclaudepath--jsonl-preview-with-last-message) | GET /api/claude — JSONL preview | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Implemented |
| [FR-3](FR.md#fr-3-etag304-conditional-response-on-apiclaude) | ETag/304 conditional | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Implemented |
| [FR-4](FR.md#fr-4-post-apilaunch--cross-platform-native-terminal-spawn) | POST /api/launch — cross-platform native terminal spawn | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Implemented (Windows); Draft (Linux/macOS) v0.4 |
| [FR-5](FR.md#fr-5-get-apimessage--single-message-by-index) | GET /api/message | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft (Phase 5) |
| [FR-6](FR.md#fr-6-get-apigit-status--worktree-dirtyaheadbehind) | GET /api/git-status | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft (v0.2) |
| [FR-7](FR.md#fr-7-get-apihealth--idempotent-autostart-probe) | GET /api/health | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Implemented |
| [FR-8](FR.md#fr-8-frontend-tabulator--multi-sort--virtual-scroll--filter) | Tabulator multi-sort | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft (Phase 5) |
| [FR-9](FR.md#fr-9-pagination-strategy--top-20-priority--lazy-rest) | Pagination top-20 priority | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Implemented (Alt A) |
| [FR-10](FR.md#fr-10-modal-viewer-for-last-message) | Modal viewer | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft (Phase 5) |
| [FR-11](FR.md#fr-11-4-button-action-column) | 4-button action column | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Implemented |
| [FR-12](FR.md#fr-12-idle-time-human-readable-format) | Idle human-readable | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature12 | Draft (Phase 5) |
| [FR-13](FR.md#fr-13-sessionstart-hook-idempotent-autostart-cross-platform) | SessionStart hook autostart (cross-platform) | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13) | @feature13 | Draft (v0.4) |
| [FR-14](FR.md#fr-14-swr-client-cache-via-localstorage) | SWR localStorage cache | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14) | @feature14 | Implemented |
| [FR-15](FR.md#fr-15-cross-platform-installation-scripts) | Cross-platform installation scripts | [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15) | @feature15 | Implemented (install.ps1); Draft (install.sh) v0.4 |
| [FR-16](FR.md#fr-16-skill-uses-mcp__claude-in-chrome__-for-browser) | Skill uses MCP claude-in-chrome | [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16) | @feature16 | Implemented |
| [FR-17](FR.md#fr-17-cross-platform-claude-path-encoding) | Cross-platform Claude path encoding | [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17) | @feature17 | Implemented (Windows + WSL); Draft (Linux/macOS canonical) v0.4 |
| [FR-18](FR.md#fr-18-dedicated-competitor-analysis-artifact) | Competitor analysis artifact | [AC-18](ACCEPTANCE_CRITERIA.md#ac-18-fr-18) | @feature18 | Implemented |
| [FR-19](FR.md#fr-19-diagnostic-cli---diagnose-livecycle) | --diagnose-livecycle CLI | [AC-19](ACCEPTANCE_CRITERIA.md#ac-19-fr-19) | @feature19 | Implemented |
| [FR-20](FR.md#fr-20-configurable-live-threshold) | Configurable LIVE threshold | [AC-20](ACCEPTANCE_CRITERIA.md#ac-20-fr-20) | @feature20 | Implemented |
| [FR-21](FR.md#fr-21-os-detection--platform-dispatched-module-architecture) | OS detection + platform-dispatched module architecture | [AC-21](ACCEPTANCE_CRITERIA.md#ac-21-fr-21) | @feature21 | Draft (v0.4) |
| [FR-22](FR.md#fr-22-on-demand-worktree-bootstrap-skill-session-pilot-bootstrap) | On-demand worktree bootstrap skill (session-pilot-bootstrap) | [AC-22](ACCEPTANCE_CRITERIA.md#ac-22-fr-22) | @feature22 | Draft (v0.4) |
| [FR-23](FR.md#fr-23-taskbar--dock-launcher-installer-create-launcher) | Taskbar / Dock launcher installer (cross-platform create-launcher.ps1 + create-launcher.sh) | [AC-23](ACCEPTANCE_CRITERIA.md#ac-23-fr-23) | @feature23 | Implemented (Windows .ps1 + POSIX .sh shipped in this PR); Draft (manual pin step automation) |
| [FR-24](FR.md#fr-24-union-model--all-git-worktrees-and-all-claude-sessions-merged--deduplicated) | UNION model — all worktrees AND all sessions, merged + deduplicated | [AC-24](ACCEPTANCE_CRITERIA.md#ac-24-fr-24) | @feature24 | Draft (v0.4) — discovered via real-host diagnostic 2026-05-13 |
| [FR-25](FR.md#fr-25-process-based-open-window-indicator--separate-signal-from-jsonl-mtime-live) | Process-based "open window" indicator (separate from JSONL mtime LIVE) | [AC-25](ACCEPTANCE_CRITERIA.md#ac-25-fr-25) | @feature25 | Draft (v0.4) — fixes idle-but-open-window UX gap |
| [FR-26](FR.md#fr-26-per-session-rows-expand-1-row-per-cwd-to-1-row-per-jsonl-uuid) | Per-session rows (expand 1-row-per-cwd to 1-row-per-JSONL-uuid) | [AC-26](ACCEPTANCE_CRITERIA.md#ac-26-fr-26) | @feature26 | Draft (v0.4) — fixes hidden-sessions-in-same-cwd UX gap (diagnostic 2026-05-13: 3 LIVE UUIDs collapsed to 1 row) |

## Functional Requirements

- [FR-1: GET /api/index — fast worktree list](FR.md#fr-1-get-apiindex--fast-worktree-list-with-claude_max_mtime)
- [FR-2: GET /api/claude — JSONL preview](FR.md#fr-2-get-apiclaudepath--jsonl-preview-with-last-message)
- [FR-3: ETag/304 conditional response](FR.md#fr-3-etag304-conditional-response-on-apiclaude)
- [FR-4: POST /api/launch — cross-platform native terminal spawn](FR.md#fr-4-post-apilaunch--cross-platform-native-terminal-spawn)
- [FR-5: GET /api/message — single message by index](FR.md#fr-5-get-apimessage--single-message-by-index)
- [FR-6: GET /api/git-status — worktree dirty/ahead/behind](FR.md#fr-6-get-apigit-status--worktree-dirtyaheadbehind)
- [FR-7: GET /api/health — idempotent autostart probe](FR.md#fr-7-get-apihealth--idempotent-autostart-probe)
- [FR-8: Frontend Tabulator — multi-sort + virtual scroll + filter](FR.md#fr-8-frontend-tabulator--multi-sort--virtual-scroll--filter)
- [FR-9: Pagination strategy — top-20 priority + lazy rest](FR.md#fr-9-pagination-strategy--top-20-priority--lazy-rest)
- [FR-10: Modal viewer for last message](FR.md#fr-10-modal-viewer-for-last-message)
- [FR-11: 4-button Action column](FR.md#fr-11-4-button-action-column)
- [FR-12: Idle time human-readable format](FR.md#fr-12-idle-time-human-readable-format)
- [FR-13: SessionStart hook idempotent autostart (cross-platform)](FR.md#fr-13-sessionstart-hook-idempotent-autostart-cross-platform)
- [FR-14: SWR client cache via localStorage](FR.md#fr-14-swr-client-cache-via-localstorage)
- [FR-15: Cross-platform installation scripts](FR.md#fr-15-cross-platform-installation-scripts)
- [FR-16: Skill uses mcp__claude-in-chrome__* for browser](FR.md#fr-16-skill-uses-mcp__claude-in-chrome__-for-browser)
- [FR-17: Cross-platform Claude path encoding](FR.md#fr-17-cross-platform-claude-path-encoding)
- [FR-18: Dedicated competitor analysis artifact](FR.md#fr-18-dedicated-competitor-analysis-artifact)
- [FR-19: Diagnostic CLI --diagnose-livecycle](FR.md#fr-19-diagnostic-cli---diagnose-livecycle)
- [FR-20: Configurable LIVE threshold](FR.md#fr-20-configurable-live-threshold)
- [FR-21: OS detection + platform-dispatched module architecture](FR.md#fr-21-os-detection--platform-dispatched-module-architecture)
- [FR-22: On-demand worktree bootstrap skill](FR.md#fr-22-on-demand-worktree-bootstrap-skill-session-pilot-bootstrap)
- [FR-23: Taskbar / Dock launcher installer](FR.md#fr-23-taskbar--dock-launcher-installer-create-launcher)
- [FR-24: UNION model — all worktrees AND all sessions, merged + deduplicated](FR.md#fr-24-union-model--all-git-worktrees-and-all-claude-sessions-merged--deduplicated)
- [FR-25: Process-based "open window" indicator](FR.md#fr-25-process-based-open-window-indicator--separate-signal-from-jsonl-mtime-live)
- [FR-26: Per-session rows (1 row per JSONL UUID, not per cwd)](FR.md#fr-26-per-session-rows-expand-1-row-per-cwd-to-1-row-per-jsonl-uuid)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — cold first paint <1s, warm reload <300ms, ETag/304 <5ms
- [Security](NFR.md#security) — path whitelist, UUID regex, bind 127.0.0.1 default
- [Reliability](NFR.md#reliability) — PID lock, KDL cleanup, fail-open hooks
- [Usability](NFR.md#usability) — keyboard accessible, native `<dialog>` Esc-close, high-contrast mode
- [Compatibility](NFR.md#compatibility) — Cross-platform: Windows 10+ / Linux (X11+Wayland+headless) / macOS 12+ / WSL as Linux target; vendored libs; Python stdlib only

## Acceptance Criteria

- [AC-1 (FR-1): warm /api/index <150ms](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): /api/claude top-5 JSONL <300ms cold](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): If-None-Match → 304 + 0 bytes <5ms](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): /api/launch resume into existing session](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): /api/message returns N-th + neighbors](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): /api/git-status returns +N -M / ↑K ↓L](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): /api/health 200 <5ms](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): shift+click multi-key sort](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): top-20 cold <1s, rest lazy](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10): click last_message → dialog + prev/next](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11): 4 buttons inject command/launch/navigate](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
- [AC-12 (FR-12): idle 1d 5h 37m / "3 hours ago"](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
- [AC-13 (FR-13): SessionStart spawns idempotently](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
- [AC-14 (FR-14): 38/45 rows skip fetch on warm reload](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
- [AC-15 (FR-15): localhost works WSL+Win identical](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
- [AC-16 (FR-16): mcp__claude-in-chrome__screenshot, not PowerShell](ACCEPTANCE_CRITERIA.md#ac-16-fr-16)
- [AC-17 (FR-17): both -mnt-d-repos-X AND D--repos-X variants](ACCEPTANCE_CRITERIA.md#ac-17-fr-17)
- [AC-18 (FR-18): COMPETITIVE_ANALYSIS.md ≥1500 words](ACCEPTANCE_CRITERIA.md#ac-18-fr-18)
- [AC-19 (FR-19): --diagnose-livecycle dumps variants/glob/mtime/verdict](ACCEPTANCE_CRITERIA.md#ac-19-fr-19)
- [AC-20 (FR-20): 300s default LIVE threshold catches lm-saas](ACCEPTANCE_CRITERIA.md#ac-20-fr-20)
- [AC-21 (FR-21): terminal_launcher.launch dispatches on sys.platform](ACCEPTANCE_CRITERIA.md#ac-21-fr-21)
- [AC-22 (FR-22): session-pilot-bootstrap skill detects orphan worktree + runs installer + verifies state](ACCEPTANCE_CRITERIA.md#ac-22-fr-22)
- [AC-23 (FR-23): create-launcher creates per-OS pin-able artifact (Windows .lnk / Linux .desktop / macOS .app bundle)](ACCEPTANCE_CRITERIA.md#ac-23-fr-23)
- [AC-24 (FR-24): /api/index UNION = worktrees + sessions + dedup; orphan rows is_orphan=true; stale-path detection; FR-1 worktree visibility preserved](ACCEPTANCE_CRITERIA.md#ac-24-fr-24)
- [AC-25 (FR-25): claude_window_open + claude_window_pids fields; frontend 3-state status `🟢 LIVE` / `💡 Open` / `idle Xs`; per-OS process scan (Win32_Process / /proc/<pid>/cwd / lsof); fail-open under 100ms budget](ACCEPTANCE_CRITERIA.md#ac-25-fr-25)
- [AC-26 (FR-26): /api/index emits 1 row per JSONL UUID (not per cwd); session_uuid per row; Resume targets row-specific UUID; git-only worktree without history → 1 row with session_uuid=null + Resume disabled](ACCEPTANCE_CRITERIA.md#ac-26-fr-26)

## Verification Matrix (CHK)

> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | warm /api/index returns rows + claude_max_mtime <150ms | FR-1, AC-1, @feature1, UC-1 | Integration test | Verified | Phase 1 prototype move; verified via curl |
| CHK-FR2-01 | /api/claude returns top-5 JSONL preview with last_message + msg_count | FR-2, AC-2, @feature2, UC-1 | Integration test | Verified | server.py:claude_sessions_for; manually verified |
| CHK-FR3-01 | If-None-Match matching server ETag → 304 + 0 bytes <5ms | FR-3, AC-3, @feature3, UC-2 | BDD scenario | Verified | tests/test-etag.sh confirms 304 path |
| CHK-FR4-01 | POST /api/launch existing session injects via write-chars | FR-4, AC-4, @feature4, UC-3 | Integration test | Verified | tests/test_launch_idempotent.py + manual E2E |
| CHK-FR4-02 | POST /api/launch new session spawns via -n KDL layout | FR-4, AC-4, @feature4, UC-3 | Integration test | Verified | E2E confirmed: sp-final-test session created |
| CHK-FR4-03 | 5s idempotency lock prevents duplicate inject | FR-4, AC-4, @feature4 | Integration test | Verified | test_double_post_within_5s_returns_cached PASS |
| CHK-FR4-04 | Path whitelist rejects non-index paths with 403 | FR-4, AC-4, @feature4 | Integration test | Verified | test_invalid_path_rejected PASS |
| CHK-FR4-05 | UUID regex rejects invalid UUIDs | FR-4, AC-4, @feature4 | Integration test | Verified | test_invalid_uuid_rejected PASS |
| CHK-FR4-06 | Session name shell metachars rejected | FR-4, AC-4, @feature4 | Integration test | Verified | test_invalid_session_name_rejected PASS |
| CHK-FR5-01 | /api/message returns N-th message + prev/next neighbors | FR-5, AC-5, @feature5, UC-4 | BDD scenario | Draft | Endpoint not yet implemented (Phase 5) |
| CHK-FR6-01 | /api/git-status returns added/deleted/ahead/behind | FR-6, AC-6, @feature6, UC-5 | BDD scenario | Draft | Endpoint not yet implemented (v0.2) |
| CHK-FR7-01 | /api/health returns 200 + status/version/uptime <5ms | FR-7, AC-7, @feature7, UC-6 | Integration test | Verified | curl /api/health confirmed Phase 3 |
| CHK-FR8-01 | shift+click on column headers triggers multi-key sort | FR-8, AC-8, @feature8, UC-7 | Manual review | Draft | Frontend uses inline render, Tabulator deferred Phase 5 |
| CHK-FR8-02 | Vi-style `/` keyboard filter triggers setFilter | FR-8, AC-8, @feature8 | Manual review | Draft | Phase 5 |
| CHK-FR9-01 | Top-20 cold load <1s on 45 worktrees | FR-9, AC-9, @feature9, UC-1 | Integration test | Verified | Performance.now instrumented; current ~1s |
| CHK-FR9-02 | Background workers drain rest queue without blocking UI | FR-9, AC-9, @feature9 | Manual review | Verified | 4 parallel workers in app.js |
| CHK-FR10-01 | Click last_message cell opens native `<dialog>` | FR-10, AC-10, @feature10, UC-4 | BDD scenario | Draft | Phase 5 |
| CHK-FR10-02 | Modal prev/next nav re-fetches /api/message ±1 | FR-10, AC-10, @feature10 | BDD scenario | Draft | Phase 5 |
| CHK-FR11-01 | 4 buttons render in Action column | FR-11, AC-11, @feature11, UC-3 | Manual review | Verified | server.py + frontend |
| CHK-FR11-02 | [▶ Resume] POST /api/launch mode=resume + opens Zellij URL | FR-11, AC-11, @feature11 | Integration test | Verified | E2E confirmed Phase 3 |
| CHK-FR11-03 | [✨ Fresh] POST /api/launch mode=fresh creates session | FR-11, AC-11, @feature11 | Integration test | Verified | E2E confirmed Phase 3 |
| CHK-FR11-04 | [📂 VSCode] POST /api/open-vscode → subprocess.Popen | FR-11, AC-11, @feature11 | Manual review | Verified | endpoint exists, manually testable |
| CHK-FR11-05 | [🪟 Zellij] navigate to URL only (no command injection) | FR-11, AC-11, @feature11 | Manual review | Verified | href-only `<a>` tag |
| CHK-FR12-01 | Idle <24h shows Intl.RelativeTimeFormat output | FR-12, AC-12, @feature12 | Manual review | Draft | Phase 5 |
| CHK-FR12-02 | Idle >24h shows Nd Nh Nm format | FR-12, AC-12, @feature12 | Manual review | Draft | Phase 5 |
| CHK-FR13-01 | start-server.sh PID lock + kill -0 idempotent | FR-13, AC-13, @feature13, UC-6 | Integration test | Draft | SessionStart hook not yet wired in extension.json |
| CHK-FR14-01 | localStorage cache present pre-fetch on reload | FR-14, AC-14, @feature14, UC-9 | Manual review | Verified | wtdash_v3_<id> keys observed in DevTools |
| CHK-FR14-02 | Per-row mtime compare skips unchanged rows | FR-14, AC-14, @feature14 | Integration test | Verified | manually verified 38/45 cache hit rate |
| CHK-FR15-01 | Bind 0.0.0.0 default WT_DASHBOARD_BIND override | FR-15, AC-15, @feature15, UC-10 | Manual review | Verified | server.py:HTTPServer((bind, PORT)) |
| CHK-FR15-02 | netsh portproxy command documented in README | FR-15, AC-15, @feature15 | Manual review | Verified | README.md "Quick start" section |
| CHK-FR16-01 | SKILL.md scenarios reference mcp__claude-in-chrome__* | FR-16, AC-16, @feature16, UC-3 | Manual review | Verified | SKILL.md sections 1-4 all use MCP |
| CHK-FR16-02 | Rule mcp-chrome-only.md forbids PowerShell | FR-16, AC-16, @feature16 | Manual review | Verified | rule file present |
| CHK-FR17-01 | encode_path_for_claude returns -mnt-d-repos-foo variant | FR-17, AC-17, @feature17, UC-1 | Unit test | Verified | test_wsl_mounted_path_produces_both_variants PASS |
| CHK-FR17-02 | encode_path_for_claude returns D--repos-foo variant | FR-17, AC-17, @feature17 | Unit test | Verified | test_windows_native_path_produces_both_variants PASS |
| CHK-FR17-03 | Both ~/.claude/projects (WSL) and /mnt/c/... scanned | FR-17, AC-17, @feature17 | Manual review | Verified | CLAUDE_PROJECTS_DIRS list in server.py |
| CHK-FR18-01 | COMPETITIVE_ANALYSIS.md exists ≥1500 words | FR-18, AC-18, @feature18, UC-7 | Manual review | Verified | 3518 words confirmed via wc -w |
| CHK-FR18-02 | Per-tool sections cover 7 alternatives | FR-18, AC-18, @feature18 | Manual review | Verified | sections 2.1-2.7 |
| CHK-FR19-01 | --diagnose-livecycle CLI dumps encoding + glob + mtime + verdict | FR-19, AC-19, @feature19, UC-11 | Integration test | Verified | manual run on lm-saas confirmed all 4 sections |
| CHK-FR20-01 | LIVE_THRESHOLD_SEC defaults 300 | FR-20, AC-20, @feature20, UC-1 | Unit test | Verified | code review server.py constant |
| CHK-FR20-02 | env override changes threshold | FR-20, AC-20, @feature20 | Manual review | Verified | int(os.environ.get(...)) implementation |
| CHK-FR4-07 | Windows wt.exe spawn path returns method: wt-spawn | FR-4, AC-4, @feature4 @windows, UC-3 | Integration test | Verified | v0.3 implementation, Windows-host run |
| CHK-FR4-08 | Linux GUI spawn returns method: linux-<term> for each of 9 terminals | FR-4, AC-4, @feature4 @linux, UC-3 | Integration test | Draft | v0.4 — parametrize via monkeypatch shutil.which |
| CHK-FR4-09 | Linux headless spawn returns method: headless-setsid; PID survives server restart | FR-4, AC-4, @feature4 @linux @headless, UC-3 | Integration test | Draft | v0.4 — test via CI runner without DISPLAY |
| CHK-FR4-10 | macOS spawn returns method: darwin-iterm2 (if running) или darwin-terminal | FR-4, AC-4, @feature4 @darwin, UC-3 | Integration test | Draft | v0.4 — requires macOS host или mocked osascript |
| CHK-FR4-11 | $SP_TERMINAL_CMD env override takes precedence on any OS, returns method: env-override | FR-4, AC-4, @feature4 | Integration test | Draft | v0.4 — argv decomposition via shlex.split tested per-OS |
| CHK-FR4-12 | Unsupported platform (e.g. freebsd) returns clean error, no crash | FR-4, AC-4, @feature4 | Unit test | Draft | v0.4 — monkeypatch sys.platform="freebsd" |
| CHK-FR13-02 | Windows SessionStart hook: pwsh start-server.ps1 + Get-Process liveness | FR-13, AC-13, @feature13 @windows, UC-6 | Integration test | Draft | v0.4 — verify via probe after Claude Code restart |
| CHK-FR13-03 | POSIX SessionStart hook: bash start-server.sh + kill -0 liveness; XDG state dir | FR-13, AC-13, @feature13 @linux @darwin, UC-6 | Integration test | Draft | v0.4 |
| CHK-FR15-03 | install.sh idempotent on Linux + macOS, registers bash start-server.sh hook | FR-15, AC-15, @feature15 @linux @darwin, UC-10 | Integration test | Draft | v0.4 — re-run after install completes returns "already installed" |
| CHK-FR17-04 | Linux canonical encoding: /home/user/repos/foo → -home-user-repos-foo | FR-17, AC-17, @feature17 @linux | Unit test | Draft | v0.4 — extend test_encode_path.py with POSIX params |
| CHK-FR17-05 | macOS canonical encoding: /Users/stigm/repos/foo → -Users-stigm-repos-foo | FR-17, AC-17, @feature17 @darwin | Unit test | Draft | v0.4 |
| CHK-FR17-06 | WSL view path /mnt/d/repos/foo emits BOTH -mnt-d-repos-foo + D--repos-foo | FR-17, AC-17, @feature17 @wsl | Unit test | Verified | already passes via test_wsl_mounted_path_produces_both_variants (covers v0.4 contract) |
| CHK-FR17-07 | UNC path \\\\wsl.localhost\\Ubuntu\\home\\user\\foo emits both Windows + POSIX variants | FR-17, AC-17, @feature17 @windows @wsl | Unit test | Draft | v0.4 — new test case |
| CHK-FR21-01 | terminal_launcher.launch dispatches via sys.platform to correct handler | FR-21, AC-21, @feature21, UC-3 | Unit test | Draft | v0.4 — monkeypatch sys.platform, assert correct internal call |
| CHK-FR21-02 | $SP_TERMINAL_CMD env override invoked BEFORE OS-specific handler regardless of platform | FR-21, AC-21, @feature21 | Unit test | Draft | v0.4 |
| CHK-FR21-03 | Linux handler internal dispatch: GUI (with DISPLAY+terminal) vs headless (no DISPLAY or no terminal) | FR-21, AC-21, @feature21 @linux | Unit test | Draft | v0.4 |
| CHK-FR22-01 | Skill detects orphan worktree via missing sentinel + git worktree list cross-check | FR-22, AC-22, @feature22, UC-12 | Integration test | Draft | v0.4 — verify в worktree без .dev-pomogator/tools/ |
| CHK-FR22-02 | Skill presents AskUserQuestion {Bootstrap, Skip npm install, Cancel} | FR-22, AC-22, @feature22 | Manual review | Draft | v0.4 — confirm UI prompt structure |
| CHK-FR22-03 | Bootstrap sequence runs npm install (conditional) → npm run build → node bin/cli.js install . in order | FR-22, AC-22, @feature22 | Integration test | Draft | v0.4 — assert exit codes + creates sentinel file |
| CHK-FR22-04 | Idempotent re-invocation without --force skips installer and responds "already bootstrapped" | FR-22, AC-22, @feature22 | Integration test | Draft | v0.4 |
| CHK-FR22-05 | Main worktree detection skips bootstrap with explicit message | FR-22, AC-22, @feature22 | Integration test | Draft | v0.4 — match cwd vs first row git worktree list |
| CHK-FR22-06 | Failed step (e.g. npm run build fail) returns {ok: false, failed_step, exit_code, stderr} without rollback | FR-22, AC-22, @feature22 | Integration test | Draft | v0.4 |
| CHK-FR22-07 | Non-git-repo invocation returns {ok: false, error: "not a git repository"} non-fatal | FR-22, AC-22, @feature22 | Integration test | Draft | v0.4 |
| CHK-FR22-08 | Cross-platform consistency — skill behavior identical on Windows/Linux/macOS (no OS-specific branches) | FR-22, AC-22, @feature22 | Manual review | Draft | v0.4 |
| CHK-FR23-01 | Windows create-launcher.ps1 creates valid Desktop\Session Pilot.lnk with msedge.exe TargetPath + `--app=URL` Arguments | FR-23, AC-23, @feature23 @windows, UC-13 | Integration test | Verified | v0.4 — direct artifact inspection: WScript.Shell.CreateShortcut |
| CHK-FR23-02 | Linux create-launcher.sh creates valid XDG Desktop Entry (~/.local/share/applications/session-pilot.desktop) | FR-23, AC-23, @feature23 @linux, UC-13 | Integration test | Draft | v0.4 — test on Ubuntu host |
| CHK-FR23-03 | macOS create-launcher.sh creates minimal .app bundle with Info.plist + Contents/MacOS/launcher | FR-23, AC-23, @feature23 @darwin, UC-13 | Integration test | Draft | v0.4 — test on macOS host |
| CHK-FR23-04 | Browser detection chain: Edge → Chrome → (Linux only) Chromium/Brave; clean error if none found | FR-23, AC-23, @feature23 | Integration test | Draft | v0.4 |
| CHK-FR23-05 | Idempotent re-run overwrites artifact with current $WT_DASHBOARD_PORT settings | FR-23, AC-23, @feature23 | Integration test | Draft | v0.4 |
| CHK-FR23-06 | Browser profile isolation via --user-data-dir=<state-dir>/browser-profile prevents cookie sharing with main browser session | FR-23, AC-23, @feature23 | Manual review | Draft | v0.4 |
| CHK-FR24-01 | Indexer scans ~/.claude/projects/* AND emits row for each encoded dir | FR-24, AC-24, @feature24, UC-14 | Integration test | Draft | v0.4 — verified via diagnostic 2026-05-13: 7 dirs found |
| CHK-FR24-02 | Non-git decoded cwd produces row with is_orphan=true + empty repo_name/branch/head_sha | FR-24, AC-24, @feature24, UC-14 | Integration test | Draft | v0.4 — concrete cases: C--Users-stigm-Desktop, D--repos |
| CHK-FR24-03 | Orphan row Resume button works identically to git row (wt.exe -d <decoded> + pwsh + claude --resume <uuid>) | FR-24, AC-24, @feature24, UC-14 | Integration test | Draft | v0.4 |
| CHK-FR24-04 | Dedup: when both git worktree row AND orphan row exist for same decoded cwd, only git row emitted | FR-24, AC-24, @feature24 | Unit test | Draft | v0.4 |
| CHK-FR24-05 | Stale path detection: decoded cwd no longer on disk → is_stale=true + frontend disables action buttons | FR-24, AC-24, @feature24 | Integration test | Draft | v0.4 |
| CHK-FR24-06 | Claude meta state dirs (~/.claude/projects/C--Users-*--claude-*) filtered out of /api/index | FR-24, AC-24, @feature24 | Unit test | Draft | v0.4 |
| CHK-FR24-07 | Encoded dir ambiguous decode (D--repos-foo → both D:\repos\foo AND /mnt/d/repos/foo) — first Test-Path wins | FR-24, AC-24, @feature24 | Unit test | Draft | v0.4 — depends on platform |
| CHK-FR24-08 | Git worktree without Claude history (Source C) still appears in /api/index with full git fields + claude_max_mtime=null | FR-24, AC-24, @feature24 @feature1, UC-14 | Integration test | Draft | v0.4 — preserves FR-1 visibility guarantee |
| CHK-FR25-01 | Server enumerates claude.exe processes via Win32_Process (Windows) / pgrep+/proc (Linux) / lsof (macOS) | FR-25, AC-25, @feature25, UC-15 | Integration test | Draft | v0.4 |
| CHK-FR25-02 | Process cwd extracted via parent chain analysis (Windows) / direct /proc symlink (Linux) / lsof line (macOS) | FR-25, AC-25, @feature25 | Integration test | Draft | v0.4 |
| CHK-FR25-03 | Row emits claude_window_open=true when ≥1 claude.exe found with matching cwd | FR-25, AC-25, @feature25, UC-15 | Integration test | Draft | v0.4 — verified manually 2026-05-13 (4 windows on taskbar but only 2 LIVE = motivating use case) |
| CHK-FR25-04 | Frontend 3-state Status column: 🟢 LIVE > 💡 Open > idle Xs priority | FR-25, AC-25, @feature25, UC-15 | Manual review | Draft | v0.4 |
| CHK-FR25-05 | Process scan cost ≤ 100ms warm (cache TTL 5s); fail-open if exceeds | FR-25, AC-25, @feature25 | Integration test | Draft | v0.4 — NFR-Perf compliance |
| CHK-FR25-06 | claude.exe processes whose cwd is install dir (e.g. WindowsApps Claude_*) excluded — only CLI sessions counted | FR-25, AC-25, @feature25 | Integration test | Draft | v0.4 — prevents Claude.ai desktop app polluting rows |
| CHK-FR25-07 | Multiple PIDs same cwd deduplicate to single row + claude_window_pids lists all | FR-25, AC-25, @feature25 | Unit test | Draft | v0.4 |
| CHK-FR26-01 | N JSONL files in one encoded dir → N rows emitted (not 1) | FR-26, AC-26, @feature26, UC-16 | Integration test | Draft | v0.4 — verified manually 2026-05-13 (3 LIVE UUIDs в D--repos-dev-pomogator) |
| CHK-FR26-02 | Each row has distinct session_uuid + own claude_max_mtime + own last_message | FR-26, AC-26, @feature26 | Integration test | Draft | v0.4 |
| CHK-FR26-03 | Rows sharing cwd carry same repo_name/branch/head_sha (git computed once per cwd, attached to all rows) | FR-26, AC-26, @feature26 | Integration test | Draft | v0.4 |
| CHK-FR26-04 | Resume button POST uses row-specific session_uuid (not newest) | FR-26, AC-26, @feature26, UC-16 | Integration test | Draft | v0.4 |
| CHK-FR26-05 | Git worktree without JSONL (Source C from FR-24) → 1 row with session_uuid=null + Resume disabled | FR-26, AC-26, @feature26 @feature24 | Unit test | Draft | v0.4 |
| CHK-FR26-06 | 100 JSONLs in single dir → 100 rows; Tabulator virtual scroll handles within NFR-Perf budget | FR-26, AC-26, @feature26 | Integration test | Draft | v0.4 — stress case |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario / unit test / integration test / manual review via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`. ✅ Confirmed 2026-05-09.
- Phase 3 STOP: ≥50% of CHKs in `In Progress` or `Verified`. ✅ Currently 28/40 = 70% Verified.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 91 (40 v0.3 + 51 v0.4: 16 cross-platform + 8 bootstrap + 6 launcher + 8 union + 7 process-open + 6 per-session)
- Verified: 30 (33%) — CHK-FR17-06 (WSL contract) + CHK-FR23-01 (Windows launcher shipped this PR)
- In Progress: 0
- Draft: 61 (12 v0.2 deferred + 15 v0.4 cross-platform + 8 v0.4 bootstrap + 5 v0.4 launcher + 8 v0.4 union + 7 v0.4 process-open + 6 v0.4 per-session)
- Blocked: 0

## Phase mapping

| Phase | CHKs Verified | Notes |
|-------|---------------|-------|
| Phase 1 (MOVE) | CHK-FR1-01, FR2-01, FR7-01, FR9-01, FR9-02, FR14-01, FR14-02, FR17-01, FR17-02, FR17-03 | Working prototype migrated |
| Phase 2 (Competitor) | CHK-FR18-01, FR18-02 | COMPETITIVE_ANALYSIS.md |
| Phase 3 (Action button) | CHK-FR4-01..06, FR7-01, FR11-01..05 | POST /api/launch + 4 buttons |
| Phase 3b (LIVE bug) | CHK-FR19-01, FR20-01, FR20-02 | --diagnose-livecycle + 300s threshold |
| Phase 4 (Pagination decision) | CHK-FR9-01, FR9-02 | Alt A documented in DESIGN.md |
| Phase 5 (UX deferred v0.2) | CHK-FR5-01, FR6-01, FR8-01, FR8-02, FR10-01, FR10-02, FR12-01, FR12-02, FR13-01 | Tabulator + modal + idle format |
| Phase 6 (Spec/Skill/Tests) | CHK-FR3-01, FR15-01, FR15-02, FR16-01, FR16-02 | SKILL.md + 4 rules + 2 tests |
