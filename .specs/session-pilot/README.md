# Session Pilot

> **v0.3 — Windows-native** (pivot from v0.2 WSL/Zellij). Multi-repo worktree dashboard for Claude Code users with 10+ active sessions. Browser at `http://127.0.0.1:8083` shows every git worktree with LIVE/idle status, last message preview, and one-click `claude --resume` action button → spawns new Windows Terminal window. No Zellij, no WSL, no cross-OS layer.

## Ключевые идеи

- **Aggregator dashboard, not a terminal wrapper** — discovery + status + one-click recall. Терминалом владеет ОС (Windows Terminal / cmd / pwsh).
- **Per-click new terminal window** — каждый ▶ Resume spawn-ит свежее окно `wt.exe -d <cwd> -- pwsh -NoExit -Command "claude --resume <uuid>"`. Claude сам подхватывает JSONL state.
- **Windows-native path encoding** — `D:\repos\foo` → `D--repos-foo` (Claude Code Windows canonical).
- **SWR cache** (server ETag + client localStorage with mtime versioning) — 38/45 rows skip fetch on warm reload; 7 stale rows hit 304 path (5ms each).
- **9 unique features vs 7 alternatives** (vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui) — see [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md).
- **300s LIVE threshold** based on empirical Claude write-batching observation.
- **Diagnostic CLI** `python server.py --diagnose-livecycle <path>` — exposes encoding variants + glob results + per-file mtime.

## Где лежит реализация (v0.3 целевая структура)

- **App-код**: `extensions/session-pilot/tools/session-pilot/` — 7 модулей (`server.py` entry / `indexer.py` / `handlers.py` / `frontend.py` / `terminal_launcher.py` (заменяет `zellij_util.py`) / `diagnose.py` / `claude_paths.py`).
- **PowerShell**: `install.ps1`, `start-server.ps1` (заменяют `start-server.sh` + KDL templates).
- **Wiring**: `extensions/session-pilot/extension.json` — manifest с PowerShell SessionStart hook.
- **Skill**: `.claude/skills/session-pilot/SKILL.md` (verification scenarios via `mcp__claude-in-chrome__*`).
- **Tests**: `extensions/session-pilot/tools/session-pilot/tests/*.py` (62+ tests, mutation 97.8%).

## Quickstart (Windows 11 / 10 1809+)

```pwsh
# 1. Один раз — установка
pwsh -File extensions/session-pilot/install.ps1
# Проверяет Python ≥3.10, ставит deps, регистрирует SessionStart hook, поднимает сервер.

# 2. Открыть в браузере
Start-Process http://127.0.0.1:8083

# 3. Здоровье
Invoke-WebRequest http://127.0.0.1:8083/api/health
# → {"status": "ok", "version": "0.3.0", "uptime_sec": <int>}
```

Сервер сам перезапускается через SessionStart hook когда запускаешь Claude Code (idempotent — если уже работает, не плодит дубли).

## Что было в v0.2 (legacy)

WSL Ubuntu + Zellij + Zellij Web Client (8082) + KDL layouts + PTY race-fix. Если нужны эти фичи — `git checkout v0.2` (см. CHANGELOG.md). v0.3 переписан под чистый Windows.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 8 stories с Why/Independent Test/Acceptance Scenarios
- [USE_CASES.md](USE_CASES.md) — 11 happy paths + edge cases
- [FR.md](FR.md) — 20 functional requirements с @feature tags
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability/Compatibility + Anti-халява
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 20 EARS acceptance criteria
- [DESIGN.md](DESIGN.md) — 9 architectural decisions (KD-1..KD-9) + pagination strategy decision matrix
- [REQUIREMENTS.md](REQUIREMENTS.md) — 40-row CHK verification matrix (28 Verified, 12 Draft for v0.2)
- [TASKS.md](TASKS.md) — 35 tasks (T01-T24 DONE, T25 PR pending, T26-T35 v0.2 backlog)
- [RESEARCH.md](RESEARCH.md) — Zellij injection / cross-OS encoding / SWR pattern findings + 6 risks
- [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) — 3518-word per-tool deep dive of 7 alternatives
- [FILE_CHANGES.md](FILE_CHANGES.md) — 30 files mapped to FR refs
- [FIXTURES.md](FIXTURES.md) — test fixture inventory + expected encoding variants
- [session-pilot_SCHEMA.md](session-pilot_SCHEMA.md) — full API contract (7 endpoints) + localStorage cache schema + env vars
- [session-pilot.feature](session-pilot.feature) — 22 BDD scenarios (SP002..SP017 implemented + SP018..SP023 deferred to v0.2 with @v02 tag)

## Status

v0.1.0 — initial release on `feat/session-pilot` branch. Phase 1-7 complete except T25 (`git push` + PR). v0.2 backlog: mutation testing strength (T26-T27), modal viewer (T28), git-status endpoint (T29), Tabulator multi-sort (T30-T33), additional tests (T34), distribution docs (T35).
