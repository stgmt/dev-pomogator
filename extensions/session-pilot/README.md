# session-pilot

Multi-repo worktree dashboard for Claude Code users with 10+ active sessions.

**Browser at `http://localhost:8083`** shows every git worktree across configured repos with:
- 🟢 LIVE / idle / none indicator per Claude session (cross-OS path encoding: WSL ↔ Windows)
- One-click [▶ Resume] → injects `claude --resume <uuid>` into a Zellij session
- One-click [✨ Fresh] / [📂 VSCode] / [🪟 Zellij] alternatives
- Multi-key sort (shift+click): group by repo, sort by activity within
- Modal viewer for last message with prev/next navigation
- SWR cache (server ETag + client localStorage) so reloads are instant
- Top-20 first paint + lazy enrichment for the rest

Pairs with **Zellij Web Client** at `http://localhost:8082` for actual terminal access.

## Quick start

```bash
# In WSL Ubuntu
bash extensions/session-pilot/tools/session-pilot/start-server.sh
# Open http://localhost:8083 in any browser (also accessible from Windows host
# if you set up `netsh portproxy add v4tov4 listenport=8083 connectaddress=<WSL_IP> connectport=8083`)
```

## Architecture

| Port | Service | Description |
|------|---------|-------------|
| 8082 | Zellij Web Client | Terminal sessions UI (vendored Zellij feature, port owned by zellij itself) |
| 8083 | session-pilot dashboard | Python HTTP server in this extension |

## Status

v0.1.0 — initial release migrated from `.dev-pomogator/bin/` prototype on `feat/session-pilot` branch. See `.specs/session-pilot/COMPETITIVE_ANALYSIS.md` for what we have vs vibe-kanban / agent-of-empires / ccmanager / kanna / claudito / claude-code-web / claudecodeui.

## Develop

This extension was created from a working prototype using a MOVE-not-rewrite strategy — the original 700-line `worktree-dashboard.py` is now `tools/session-pilot/server.py` unchanged. Refactoring into smaller modules happens in subsequent phases (see plan in `.specs/session-pilot/`).

For ongoing development use the paired skill: `.claude/skills/session-pilot/SKILL.md`. Triggers include "open worktree dashboard", "launch claude в worktree X", "create worktree for Y".
