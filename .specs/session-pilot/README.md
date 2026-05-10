# Session Pilot

Multi-repo worktree dashboard for Claude Code users with 10+ active sessions. Browser at `http://localhost:8083` shows every git worktree across configured repos with LIVE/idle status, last message preview, and one-click `claude --resume` action button. Pairs with Zellij Web Client (`:8082`) for actual terminal access — we don't reinvent terminal embedding.

## Ключевые идеи

- **Aggregator dashboard, not a terminal wrapper** — separate concern from the working environment (Zellij owns terminal); we own discovery + status + recall
- **Cross-OS path encoding for Claude JSONLs** — handles WSL `/mnt/d/repos/foo` ↔ Windows `D:\repos\foo` ambiguity unique to mixed Win+WSL setups
- **SWR cache (server ETag + client localStorage with mtime versioning)** — 38/45 rows skip fetch on warm reload; 7 stale rows hit 304 path (5ms each)
- **Action button works** — POST /api/launch injects `claude --resume <uuid>` via Zellij `action write-chars` for existing sessions OR `setsid script -qfc zellij -s NAME -n FILE` for new sessions with KDL layout
- **9 unique features vs 7 alternatives** (vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui) — see [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md)
- **300s LIVE threshold** based on empirical Claude write-batching observation (B-1 incident, lm-saas detection bug)
- **Diagnostic CLI** `python server.py --diagnose-livecycle <path>` — exposes encoding variants + glob results + per-file mtime for troubleshooting

## Где лежит реализация

- **App-код**: `extensions/session-pilot/tools/session-pilot/server.py` (single-file Phase 1, refactor candidate Phase 5)
- **KDL templates**: `extensions/session-pilot/tools/session-pilot/layouts/{claude-resume,claude-fresh}.kdl.tmpl`
- **Wiring**: `extensions/session-pilot/extension.json` (manifest with toolFiles array)
- **Skill**: `.claude/skills/session-pilot/SKILL.md` (verification scenarios with `mcp__claude-in-chrome__*`)
- **Rules**: `.claude/rules/session-pilot/{action-button-injection, claude-projects-encoding, perf-budget, mcp-chrome-only}.md`
- **Tests**: `extensions/session-pilot/tools/session-pilot/tests/{test_encode_path,test_launch_idempotent}.py` (11 tests pass; review notes Phase 6c — strengthen via mutation testing v0.2)

## Quickstart

```bash
# In WSL Ubuntu
bash extensions/session-pilot/tools/session-pilot/start-server.sh
# Server binds 127.0.0.1:8083; opens http://localhost:8083 from a browser
# inside WSL (or http://<WSL_IP>:8083 via portproxy from Windows host)

# From Windows host (one-time setup, run in elevated PowerShell):
$wslIp = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=8083 connectaddress=$wslIp connectport=8083
netsh interface portproxy add v4tov4 listenport=8082 connectaddress=$wslIp connectport=8082
```

## Install for fresh machine (T35)

End-to-end bootstrap from clean WSL Ubuntu 24.04:

```bash
# 1. Required runtimes
sudo apt update && sudo apt install -y python3 curl
# 2. Zellij + zjstatus (for one-click resume target)
mkdir -p ~/.local/bin && curl -L https://github.com/zellij-org/zellij/releases/latest/download/zellij-x86_64-unknown-linux-musl.tar.gz | tar xz -C ~/.local/bin/
# 3. Clone dev-pomogator
git clone https://github.com/stgmt/dev-pomogator.git ~/repos/dev-pomogator
cd ~/repos/dev-pomogator
# 4. Install session-pilot as a managed extension
node dist/installer/extensions.js install session-pilot --project "$PWD"
# 5. Start the dashboard (SessionStart hook also auto-starts on Claude Code launch)
bash extensions/session-pilot/tools/session-pilot/start-server.sh
# 6. (Windows host only) portproxy from elevated PowerShell — see Quickstart
# 7. Open http://localhost:8083 in your browser
```

Health check: `curl -fsS http://127.0.0.1:8083/api/health` → `{"ok": true, ...}`.

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
