# Session Pilot

> **v0.4 — Cross-platform native** (de-pivot from v0.3 Windows-only). Multi-repo worktree dashboard для Claude Code пользователей с 10+ active sessions на Windows / Linux / macOS. Browser at `http://127.0.0.1:8083` shows every git worktree with LIVE/idle status, last message preview, one-click `claude --resume` action button → spawns новое native terminal окно (или background-detached процесс на headless Linux). No Zellij, no tmux dependency, no WSL bridge — каждая ОС использует свой native terminal stack.

## Ключевые идеи

- **Aggregator dashboard, not a terminal wrapper** — discovery + status + one-click recall. Терминалом владеет ОС (Windows Terminal / gnome-terminal / Terminal.app / etc.).
- **Per-click new terminal window** — каждый ▶ Resume spawn-ит свежее окно через OS-dispatched chain (`wt.exe`/`pwsh` на Windows, `gnome-terminal`/`konsole`/`alacritty`/... на Linux, `osascript Terminal/iTerm2` на macOS, `setsid nohup` на headless Linux). Claude сам подхватывает JSONL state.
- **Per-OS path encoding** — Windows `D:\repos\foo` → `D--repos-foo`; Linux `/home/user/repos/foo` → `-home-user-repos-foo`; macOS `/Users/stigm/repos/foo` → `-Users-stigm-repos-foo`. WSL shared scenarios получают both POSIX `-mnt-d-...` + Windows `D--...` variants.
- **SWR cache** (server ETag + client localStorage with mtime versioning) — 38/45 rows skip fetch on warm reload; 7 stale rows hit 304 path (5ms each).
- **9 unique features vs 7 alternatives** (vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui) — see [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md).
- **300s LIVE threshold** based on empirical Claude write-batching observation.
- **Diagnostic CLI** `python server.py --diagnose-livecycle <path>` — exposes encoding variants + glob results + per-file mtime.
- **2 isolated modules** know OS (`terminal_launcher.py` + `claude_paths.py`); rest of server is OS-agnostic stdlib Python.
- **`/sp-bootstrap` skill** для orphan worktrees — on-demand bootstrap fix когда `git worktree add` создал checkout без installer state и stop hooks падают `ERR_MODULE_NOT_FOUND`. Sibling к dashboard recall workflow.

## Где лежит реализация (v0.3 целевая структура)

- **App-код**: `extensions/session-pilot/tools/session-pilot/` — 7 модулей (`server.py` entry / `indexer.py` / `handlers.py` / `frontend.py` / `terminal_launcher.py` (заменяет `zellij_util.py`) / `diagnose.py` / `claude_paths.py`).
- **PowerShell**: `install.ps1`, `start-server.ps1` (заменяют `start-server.sh` + KDL templates).
- **Wiring**: `extensions/session-pilot/extension.json` — manifest с PowerShell SessionStart hook.
- **Skill**: `.claude/skills/session-pilot/SKILL.md` (verification scenarios via `mcp__claude-in-chrome__*`).
- **Tests**: `extensions/session-pilot/tools/session-pilot/tests/*.py` (62+ tests, mutation 97.8%).

## Quickstart

### Windows 11 / 10 (1809+)

```pwsh
# 1. Один раз — установка
pwsh -File extensions/session-pilot/install.ps1
# Проверяет Python ≥3.10, регистрирует SessionStart hook, поднимает сервер.

# 2. Открыть в браузере
Start-Process http://127.0.0.1:8083

# 3. Здоровье
Invoke-WebRequest http://127.0.0.1:8083/api/health
# → {"status": "ok", "version": "0.4.0", "uptime_sec": <int>, "platform": "win32"}
```

### Linux (Ubuntu 22.04+ / Fedora 38+ / Arch / ...) — GUI и headless

```bash
# 1. Один раз — установка
bash extensions/session-pilot/install.sh

# 2-GUI. Открыть в браузере
xdg-open http://127.0.0.1:8083

# 2-headless. Проверить через curl (CI/SSH без X11/Wayland)
curl -fsS http://127.0.0.1:8083/api/health
# → {"status": "ok", "version": "0.4.0", "uptime_sec": <int>, "platform": "linux"}
```

На headless Linux Resume/Fresh buttons spawn-ят процесс через `setsid nohup` (без терминального окна), статус проверяется через `ps -p <pid>`.

### macOS 12 (Monterey)+

```bash
# 1. Один раз — установка
bash extensions/session-pilot/install.sh

# 2. Открыть в браузере
open http://127.0.0.1:8083

# 3. Здоровье
curl -fsS http://127.0.0.1:8083/api/health
# → {"status": "ok", "version": "0.4.0", "uptime_sec": <int>, "platform": "darwin"}
```

Сервер сам перезапускается через SessionStart hook (idempotent — если уже работает, не плодит дубли). Hook command per-OS: `pwsh.exe ... start-server.ps1` (Windows) / `bash start-server.sh` (POSIX).

## История версий

- **v0.4 (2026-05-12)** — Cross-platform native (Windows + Linux + macOS). De-pivot от v0.3.
- **v0.3 (2026-05-11)** — Windows-native pivot, drop WSL/Zellij. Implementation в этом branch (`feat/session-pilot`).
- **v0.2** — WSL Ubuntu + Zellij + Zellij Web Client (8082) + KDL layouts + PTY race-fix. `git checkout v0.2` если нужны эти фичи.
- **v0.1** — initial prototype в `.dev-pomogator/bin/worktree-dashboard.py`.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 8 stories с Why/Independent Test/Acceptance Scenarios
- [USE_CASES.md](USE_CASES.md) — 11 happy paths + edge cases
- [FR.md](FR.md) — 21 functional requirements с @feature tags (FR-21 NEW: OS dispatch architecture)
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability/Compatibility (cross-platform: Win+Linux+macOS+WSL) + Anti-халява
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 21 EARS acceptance criteria with per-platform variants
- [DESIGN.md](DESIGN.md) — 10 architectural decisions (KD-1..KD-10) + pagination strategy decision matrix
- [REQUIREMENTS.md](REQUIREMENTS.md) — CHK verification matrix
- [TASKS.md](TASKS.md) — 35 tasks (T01-T24 DONE, T25 PR pending, T26-T35 v0.2 backlog; v0.4 cross-platform tasks to be added in next spec iteration)
- [RESEARCH.md](RESEARCH.md) — Cross-platform spawn (v0.4) / Zellij injection (legacy) / Claude write-batching / SWR pattern findings + risks
- [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) — 3518-word per-tool deep dive of 7 alternatives
- [FILE_CHANGES.md](FILE_CHANGES.md) — 30 files mapped to FR refs
- [FIXTURES.md](FIXTURES.md) — test fixture inventory + expected encoding variants
- [session-pilot_SCHEMA.md](session-pilot_SCHEMA.md) — full API contract (7 endpoints) + localStorage cache schema + env vars
- [session-pilot.feature](session-pilot.feature) — BDD scenarios with cross-platform Scenario Outlines (SP005L Linux-GUI, SP005LH headless, SP005D macOS, SP005E env override, SP012W/SP012P autostart per-OS, SP014W/SP014P install per-OS, SP015 encoding Scenario Outline)

## Status

v0.1.0 implementation — released on `feat/session-pilot` branch. Phase 1-7 complete except T25 (`git push` + PR). v0.2 backlog: mutation testing strength (T26-T27), modal viewer (T28), git-status endpoint (T29), Tabulator multi-sort (T30-T33), additional tests (T34), distribution docs (T35). **v0.4 spec ready** (this CHANGELOG entry); implementation = add `_launch_linux*` + `_launch_darwin*` handlers + POSIX encoder rule + `install.sh` (separate PR after T25 lands).
