# Changelog

All notable changes to session-pilot will be documented here.

## 0.1.0 — 2026-05-10 (initial release)

### Added
- Worktree dashboard at `http://localhost:8083` showing all git worktrees across configured repos
- LIVE / idle / none indicator per Claude session via cross-OS path encoding (WSL `/mnt/d/...` ↔ Windows `D:\...`)
- Last message preview from JSONL with timestamp and message count
- SWR cache: server ETag/304 + client localStorage with mtime versioning
- Progress bar with parallel worker count during background enrichment
- WSL + Windows host access via `netsh portproxy` (bind 0.0.0.0)
- Smart cache: 38/45 rows skip fetch on reload if mtime unchanged

### Migrated from prototype
- `tools/session-pilot/server.py` — formerly `.dev-pomogator/bin/worktree-dashboard.py`
- `tools/session-pilot/start-server.sh` — formerly `start-dashboard.sh`
- `tools/session-pilot/zclaude` — Zellij session launcher with worktree-aware naming
- `tools/session-pilot/scripts/demo-*.sh` — bootstrap helpers
- `tools/session-pilot/tests/check-api.py`, `test-etag.sh` — smoke tests

### Known issues
- Action button only opens Zellij URL — does NOT yet inject `claude --resume <uuid>` (Phase 3 in plan)
- lm-saas worktree may not show LIVE despite active typing (Phase 3b — diagnose encoding/threshold)
- Idle time shown in raw minutes — Phase 5 fixes to `1d 5h 37m` format
- Loading 9/45 sessions takes ~12s cold — Phase 4 benchmarks pagination alternatives

See `.specs/session-pilot/` for full feature roadmap.
