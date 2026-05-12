# Changelog

All notable changes to this **spec** are documented here. For implementation changelog see [`extensions/session-pilot/CHANGELOG.md`](../../extensions/session-pilot/CHANGELOG.md).

## [Unreleased]

### Changed — v0.4 de-pivot back to cross-platform (2026-05-12)

Спека снова cross-platform — Windows + Linux + macOS — после v0.3 Windows-only pivot. **Возврат к идее v0.2 но БЕЗ Zellij/WSL bridge**: каждая ОС использует native terminal stack (Windows: wt/pwsh/cmd; Linux: gnome-terminal/konsole/alacritty/kitty/wezterm/xfce4-terminal/tilix/terminator/xterm + setsid headless fallback; macOS: Terminal.app/iTerm2 via osascript). Python stdlib dashboard unmodified — изменился только `terminal_launcher.py` (OS-dispatched) и `claude_paths.py` (per-OS canonical encoding).

**Что меняется в спеке**:

- **FR-4** (POST /api/launch) — было Windows wt/pwsh/cmd chain; стало platform-dispatched через `sys.platform`: Windows chain как раньше, Linux ветка с probe `$TERMINAL` → 9 терминалов через `shutil.which` → headless `setsid nohup` fallback, macOS osascript Terminal/iTerm2. Same response shape `{ok, method, pid}` с расширенным набором `method` labels (`wt-spawn` / `cmd-fallback` / `linux-gnome-terminal` / `linux-alacritty` / ... / `headless-setsid` / `darwin-terminal` / `darwin-iterm2` / `env-override`).
- **FR-7** (health) — `version` bumped to `0.4.0`; added `platform` field exposing detected OS.
- **FR-11** (Action column) — VSCode button fallback chain `code` → `code.cmd` (Windows) → `cursor` → `subl`. Cross-platform `code` binary on PATH.
- **FR-13** (SessionStart autostart) — было pwsh-only; стало platform-dispatched: `pwsh.exe` на Windows / `bash start-server.sh` на POSIX. PID lock dir per-OS (`$LOCALAPPDATA\session-pilot\` / `${XDG_STATE_HOME:-~/.local/state}/session-pilot/`).
- **FR-15** (Install) — пара sibling-installers: `install.ps1` (Windows, unchanged) + `install.sh` (Linux + macOS, новый). Shared idempotency contract.
- **FR-17** (Path encoding) — was Windows-only `D--repos-foo`; стало per-OS canonical + cross-platform defensive fallbacks для WSL/UNC shared-worktree scenarios. Encoder API теперь returns `list[str]` (canonical first, fallbacks after).
- **FR-21 NEW** — OS detection + platform-dispatched module architecture: 2 isolated modules (`terminal_launcher.py` + `claude_paths.py`) знают про `sys.platform`, rest of codebase OS-agnostic. Flat dispatch without inheritance ceremony.
- **FR-22 NEW** — On-demand worktree bootstrap skill `session-pilot-bootstrap` (slash `/sp-bootstrap`). Closes "orphan worktree" failure mode: `.dev-pomogator/tools/*.ts` gitignored → fresh `git worktree add` checkout без installer state → stop hooks падают `ERR_MODULE_NOT_FOUND`. Skill on-demand (НЕ auto-fire post-checkout, НЕ symlink) — пользователь явно вызывает когда нужен. Workflow: detect orphan via `git worktree list` + sentinel file check → AskUserQuestion {Bootstrap, Skip npm install, Cancel} → `npm install` (conditional) + `npm run build` + `node bin/cli.js install .` → verify sentinel. Idempotent. Cross-platform (uses only npm/node/git — no OS branches). Sibling к main `session-pilot` dashboard skill: dashboard закрывает "no-session" gap, bootstrap закрывает "no-tools" gap.
- **FR-23 NEW + IMPL** — Taskbar / Dock launcher installer. Per-OS sibling scripts: `create-launcher.ps1` (Windows → Desktop `.lnk` → `msedge.exe --app=URL`) + `create-launcher.sh` (Linux → XDG `.desktop` entry; macOS → minimal `.app` bundle). Uses Chromium `--app=URL` flag to open dashboard в standalone window (own taskbar entry, no browser chrome). Browser detection chain (Edge → Chrome → Chromium → Brave). Browser profile isolation via `--user-data-dir`. Idempotent. **Shipped in this PR**: scripts created at `extensions/session-pilot/tools/session-pilot/create-launcher.{ps1,sh}` (implementation complete; manifest wiring T48 remaining).
- **Method label sync** — AC-4 / FR-4 / SP005 / SP021 fixed to match implementation: `"wt-spawn"` → `"wt-spawn-pwsh"` (impl uses Pwsh 7 specific label; PS 5.1 fallback would be `"wt-spawn-ps51"`); `"spawn"` → `"code.cmd"` (VS Code open endpoint). [VERIFIED 2026-05-12 via direct POST /api/launch + POST /api/open-vscode tests on Windows 11 — server responded with these exact method labels.]
- **NFR-Compat-1..6** — restored cross-platform targets: Win 10+/Win 11, Linux (X11/Wayland/headless), macOS 12+. WSL supported as Linux target (encoder generates both POSIX `-mnt-d-...` + Windows `D--...` variants).
- **NFR-Sec-3** — env var renamed `WT_DASHBOARD_BIND` → `SP_DASHBOARD_BIND` (platform-neutral prefix).
- **NFR-Sec-2/4/5** — security model updated to spec argv-based safety across all 3 OS spawn paths (no `shell=True` anywhere).
- **NFR-Rel-1** — PID lock paths per-OS.
- **DESIGN.md**:
  - **KD-3 rewritten** — Cross-platform native terminal spawn chain (replaces v0.3 Windows-only KD-3); rationale for why per-OS native (not Zellij, not tmux) + dispatch table.
  - **KD-5 rewritten** — Cross-platform Claude path encoding (full per-OS canonical + fallback table including WSL/UNC scenarios).
  - **KD-9 expanded** — SessionStart hook idempotency contract cross-platform (Windows pwsh + POSIX bash) с shared 4-step protocol.
  - **KD-10 NEW** — Per-platform module dispatch architecture: only 2 modules know OS, flat dispatch over inheritance.
  - **Architecture diagram** — updated ASCII art showing 3-platform spawn branches + per-OS Claude projects dirs.
- **session-pilot.feature** — total 36 Scenario lines (v0.3 had 22). Feature header reworded to "Cross-platform multi-repo worktree dashboard"; SP005/SP006 expanded to SP005 (Windows wt) + SP006 (Windows cmd fallback) + Scenario Outline SP005L (Linux GUI с 9 terminal Examples) + SP005LH (Linux headless setsid + GUI-fallback-to-headless) + SP005D (macOS Terminal.app + iTerm2-preferred-if-running) + SP005E (env override) + SP005F (unsupported platform clean error); SP012 → SP012W (Windows) + SP012P (POSIX) + stale-PID variants for each; SP014 → SP014W (Windows) + SP014P (POSIX); SP015 → Scenario Outline `SP015_path_encoding_cross_platform` with 6 platform Examples; **SP024..SP028 NEW** для FR-22 (bootstrap skill orphan-worktree / main-worktree-skip / idempotent re-run / non-git-repo / failed-step reporting).
- **AC-4, AC-7, AC-13, AC-15, AC-17, AC-21** — restructured around `WHEN sys.platform == X` variants; AC-21 NEW for OS-detection dispatch; AC-22 NEW для bootstrap skill (orphan worktree detection + installer chain + idempotent + main-worktree-skip + non-git-repo fail + per-step failure reporting).
- **RESEARCH.md** — new section "Cross-platform spawn research (v0.4)" с [VERIFIED] findings from 2026-05-12 parallel research session (4 sub-agents): Claude Code CLI flags (no --cwd, native --worktree exists), prior art table (8 projects, none Windows), Windows spawn pattern (`Start-Process -PassThru` canonical), Linux terminal chain detection, macOS osascript, headless setsid fallback.

**Что НЕ меняется** (server core unchanged):

- FR-1, FR-2, FR-3, FR-5, FR-6, FR-8, FR-9, FR-10, FR-12, FR-14, FR-18, FR-19, FR-20 — серверная логика, кеши, frontend Tabulator, диагностический CLI, LIVE threshold. Все cross-platform-safe (Python stdlib).
- Architecture core: server.py / indexer.py / handlers.py / frontend.py / diagnose.py — все OS-agnostic. UI vendored assets — OS-agnostic.
- v0.3 implementation в `feat/session-pilot` branch остаётся базой. v0.4 implementation = добавить `_launch_linux*` + `_launch_darwin*` handlers + path encoder POSIX rule + install.sh.

**Имплементация v0.4 — отдельный PR** (после v0.3 PR T25 landed). В этой spec-итерации только spec changes.

### Changed — v0.3 pivot to Windows PowerShell native (2026-05-11)

Спека переведена с WSL+Zellij+cross-OS на чистую Windows. Реализация v0.2 (Zellij, KDL layouts, race-fix `_PTY_MASTERS`, netsh portproxy, cross-OS path encoding) остаётся в git history (commit диапазон v0.1.0..v0.2.x).

**Что меняется в спеке**:

- **FR-4** (POST /api/launch) — было `zellij action write-chars` / `setsid zellij --layout`; стало `wt.exe -d <cwd> -- pwsh -NoExit -Command "claude --resume <uuid>"` с fallback на `cmd.exe /c start` и override через `$env:SP_TERMINAL_CMD`.
- **FR-11** (Action column) — было 4 кнопки `[▶ Resume] [✨ Fresh] [📂 VSCode] [🪟 Zellij]`; стало 3: `[▶ Resume] [✨ Fresh] [📂 VSCode]`. Zellij Web button удалена.
- **FR-13** (SessionStart autostart) — было `bash start-server.sh`; стало `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` с PowerShell 5.1 fallback.
- **FR-15** (Cross-OS access) — было WSL→Windows netsh portproxy bridge; стало one-command `install.ps1` для свежей Windows машины.
- **FR-17** (Cross-OS path encoding) — было дуальные варианты `/mnt/d/...` ↔ `D--...`; стало Windows-native canonical `D--repos-foo` (WSL варианты убраны).
- **NFR-Compat** — Win 10 (1809+) / Win 11 only. WSL/Linux/macOS marked OUT-OF-SCOPE для v0.3. Кросс-платформа — см. cross-platform-research отчёт (node-pty + xterm.js, не планируется в этой итерации).
- **DESIGN.md** — KD-3 (Windows Terminal spawn chain заменяет Zellij injection); KD-5 (Windows-native path encoding); KD-9 (PowerShell SessionStart hook).
- **session-pilot.feature** — SP005/SP006 (was Zellij existing/new) переписаны под wt.exe / cmd fallback. SP014 (was netsh cross-OS) переписан под `install.ps1`. SP015/SP016 — Windows path `D:\repos\...` примеры.
- **USER_STORIES.md** — US-2 (one-click resume in Windows Terminal), US-3 (reboot survival via PS hook), US-8 (one-command Windows install).

**Что НЕ меняется**:

- FR-1, FR-2, FR-3, FR-5, FR-6, FR-8, FR-9, FR-10, FR-12, FR-14, FR-18, FR-19, FR-20 — серверная логика, кеши, frontend Tabulator, диагностический CLI, LIVE threshold.
- Архитектура `server.py` 7-модулей (frontend/indexer/handlers/diagnose/claude_paths + новый `terminal_launcher.py` вместо `zellij_util.py`).
- Tests: 62 Python suite + 6 vitest. Mutation 97.8%.

**Имплементация v0.3 — отдельный PR**, в этой PR-итерации только spec changes.

## [0.1.0] - 2026-05-10

### Added — spec scaffold + content (Phase 6a)

- **USER_STORIES.md** — 8 stories with v3 form (Priority + Why + Independent Test + Acceptance Scenarios) covering multi-repo dashboard, one-click resume, reboot survival, pagination, modal viewer, multi-sort, plugin distribution, cross-OS access
- **USE_CASES.md** — 11 use cases covering happy paths (UC-1..UC-10) + edge cases (UC-11: unforeseen encoding variant)
- **FR.md** — 20 functional requirements with @feature1..@feature20 tags + cross-refs to ACs and Use Cases
- **NFR.md** — Performance/Security/Reliability/Usability/Compatibility + 4-rule «Anti-халява» section enforcing skill scenario verification
- **ACCEPTANCE_CRITERIA.md** — 20 EARS-format acceptance criteria with FR cross-references
- **session-pilot.feature** — initial BDD scenarios at v0.1.0 release (SP002..SP017 implemented Phase 1-7 + SP018..SP023 deferred to v0.2 with @v02 tag) covering all FRs.
- **RESEARCH.md** — Zellij action injection findings, cross-OS path encoding analysis, Claude write-batching empirical observation, SWR pattern, pagination alternatives, 6-row Risk Assessment
- **DESIGN.md** — 9 key decisions (KD-1: MOVE not rewrite, KD-2: pagination Alt A→B→C progression with decision matrix, KD-3: Zellij `-n` flag gotcha, KD-4: SWR ETag+localStorage, KD-5: cross-OS encoding, KD-6: 300s LIVE threshold, KD-7: vendored libs, KD-8: native `<dialog>`, KD-9: SessionStart hook over systemd)
- **REQUIREMENTS.md** — 40-row CHK verification matrix (28 Verified Phase 1-7, 12 Draft for v0.2)
- **TASKS.md** — 35 tasks with v3 form (Done When + Status + Est) tracked across Phase 1-7 + v0.2 backlog
- **FILE_CHANGES.md** — 30 files mapped to FR refs with Phase tracking
- **session-pilot_SCHEMA.md** — full API contract for 7 endpoints + localStorage SWR cache schema + KDL templates + 7 env vars + 6 cross-endpoint validation invariants

### Added — competitor analysis (Phase 2)

- **COMPETITIVE_ANALYSIS.md** — 3518-word dedicated artifact analyzing vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui. Includes per-tool deep dives, 30-feature master matrix, P0/P1/P2/P3 «Features WE LACK» backlog, 10-feature «Features WE HAVE that they lack» differentiation list, v0.2/v0.3/v0.4 roadmap. Method: research-workflow skill with [VERIFIED]/[SINGLE_SOURCE] markers.

### Added — fixture inventory (Phase 6c)

- **FIXTURES.md** — synthetic JSONL fixture inventory + expected encoding variants table + B-1 lm-saas regression case + per-test fixture references

### Phase progression

| Phase | Date | Spec deliverable | Implementation |
|-------|------|------------------|----------------|
| Phase 1 | 2026-05-09 | (n/a — code MOVE only) | 9 prototype files moved to extensions/session-pilot/tools/session-pilot/ |
| Phase 2 | 2026-05-09 | COMPETITIVE_ANALYSIS.md | (research-only artifact) |
| Phase 3 | 2026-05-09 | (n/a — code phase) | POST /api/launch + 4-button frontend + KDL templates |
| Phase 3b | 2026-05-09 | (n/a — bug fix) | LIVE_THRESHOLD_SEC 90→300, --diagnose-livecycle CLI |
| Phase 4 | 2026-05-09 | DESIGN.md «Pagination strategy» section | (decision documented; implementation = Alt A current) |
| Phase 5 | deferred v0.2 | (Tabulator UX deferred) | Tabulator + modal + Intl.RelativeTimeFormat — T28-T33 |
| Phase 6a | 2026-05-09..10 | 13-file spec scaffold + populate | (no code) |
| Phase 6b | 2026-05-10 | (n/a — skill+rules) | SKILL.md + 4 rules |
| Phase 6c | 2026-05-10 | FIXTURES.md, REQUIREMENTS.md, TASKS.md, SCHEMA.md, README.md, CHANGELOG.md | tests/test_encode_path.py + test_launch_idempotent.py |
| Phase 7 | 2026-05-10 | (validation only) | audit-spec.ts 0 errors, extension-layout-validate.ts exit 0, 11/11 tests pass |

### Spec audit status

- `audit-spec.ts -Path .specs/session-pilot` — 0 ERROR-severity findings
- `requirements-chk-guard` validates 40 CHK rows
- `task-form-guard` validates 35 tasks (Done When + Status + Est)
- `extension-layout-validate.ts` — exit 0
- 39 LOGIC_GAP findings remain (informational; v0.2 work)

### Known gaps for v0.2 (per audit)

- **Test strength** — current 11 tests are weak per strong-tests skill review (permissive matchers, no mutation feedback, no cleanup, happy-path bias). T26 to add mutmut + strengthen.
- **Phase 5 deferred** — Tabulator + modal + Intl.RelativeTimeFormat + vi-style filter + SessionStart hook wiring all queued T28-T33.
- **Documentation** — distribution README for fresh-machine install (T35).

## [0.0.x] - 2026-05-09 (pre-spec, prototype iteration in main session)

Pre-spec exploration: prototype evolved through user-driven iterations as `worktree-dashboard.py` in `.dev-pomogator/bin/` (gitignored scratch). Key milestones from main-branch session (no formal spec yet):

- 2026-05-09 ~16:00 — initial prototype with /api/index + /api/claude
- 2026-05-09 ~17:00 — SWR ETag/304 + localStorage cache added
- 2026-05-09 ~18:00 — netsh portproxy WSL+Windows host access
- 2026-05-09 ~19:00 — progress bar + visibilitychange listener
- 2026-05-09 ~20:00 — multi-key sort table prep + competitor research begun
- 2026-05-09 ~21:00 — plan formalized; spec scaffolding started in worktree

This pre-spec history is informational only. v0.1.0 is the first formally specified release.
