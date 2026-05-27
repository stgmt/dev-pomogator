#!/usr/bin/env python3
"""
Session Pilot — Windows-native dashboard server on port 8083 (v0.3+).

Endpoints:
  GET  /              — Tabulator dashboard SPA (HTML/CSS/JS from frontend.py)
  GET  /api/index     — fast worktree list with claude_max_mtime
  GET  /api/claude    — JSONL preview with last message (ETag/304)
  GET  /api/health    — uptime probe
  POST /api/launch    — spawn detached Windows Terminal with `claude --resume <uuid>`
  POST /api/open-vscode — open path in VSCode/Cursor
  GET  /api/git-status — porcelain v1 + ahead/behind
  GET  /api/message   — single message + neighbours
  GET  /vendor/*      — Tabulator vendored assets

Конфиг: REPOS env var, list of repo roots colon-separated.
Default: %USERPROFILE%\\repos\\* (autodiscover any directory containing .git)

v0.3 pivot (spec at .specs/session-pilot/CHANGELOG.md): Windows PowerShell
native только. No Zellij, no WSL, no cross-OS paths.
"""

from __future__ import annotations
import json
import os
import re
import subprocess
import time
from datetime import datetime
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("WT_DASHBOARD_PORT", "8083"))
# Claude Code on Windows writes JSONL to %USERPROFILE%\.claude\projects\
# Keep WSL path as defensive secondary for users who installed on WSL Ubuntu
# under the new install.ps1 (which sets HOME on Windows).
CLAUDE_PROJECTS_DIRS = [
    Path.home() / ".claude" / "projects",  # Windows: %USERPROFILE%\.claude\projects
]
RUNNING_THRESHOLD_SEC = int(os.environ.get("LIVE_THRESHOLD_SEC", "300"))  # JSONL modified in last Ns = "running now". Default 300 (5 min) because Claude Code batches JSONL writes ~every 2-3 min during active typing — 90s misses real activity


# Worktree + JSONL indexer moved to indexer.py (Phase 5 refactor).
# Re-export so tests + handlers see same symbols on `server` module.
# Imported lazily below — actual import statement placed after globals
# (CLAUDE_PROJECTS_DIRS etc.) so indexer.py's late-binding `import server`
# resolves them correctly.


# encode_path_for_claude lives in claude_paths.py as single source of truth
# (mutmut test target imports identical body — sync invariant guarded by
# tests/test_encode_path_module.test_sync_with_canonical).
# Load via importlib spec rather than mutating sys.path: avoids shadowing if
# user happens to have a sibling claude_paths.py earlier in their path.
def _load_encode_path_for_claude():
    import importlib.util
    from pathlib import Path
    src = Path(__file__).parent / "claude_paths.py"
    spec = importlib.util.spec_from_file_location("session_pilot_claude_paths", src)
    if spec is None or spec.loader is None:
        raise ImportError(f"claude_paths.py not loadable at {src}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.encode_path_for_claude


encode_path_for_claude = _load_encode_path_for_claude()


# claude_sessions_for moved to indexer.py


_START_TIME = time.time()
_launch_lock: dict = {}  # (worktree_path, uuid_or_fresh) -> timestamp; 5s idempotency window
LAUNCH_LOCK_TTL = 5.0
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


# Terminal spawn moved to terminal_launcher.py (v0.3 pivot — replaces zellij_util.py).
# Re-export so handlers + tests see same symbols on `server` module.
from terminal_launcher import (  # noqa: E402
    spawn_terminal,
    open_vscode,
)


def _whitelisted_paths() -> set[str]:
    """All paths from current /api/index — used for /api/launch and /api/open-vscode whitelist.

    FR-26: /api/index now returns per-session rows via build_session_index_cached;
    set() comprehension naturally dedupes N sessions sharing one cwd → 1 entry.
    """
    return {r["worktree_path"] for r in build_session_index_cached()["rows"]}


# Re-export indexer functions so tests + handlers see same symbols on `server`.
# indexer.py uses late-binding `import server` to read CLAUDE_PROJECTS_DIRS etc.,
# so monkey-patches via `server.CLAUDE_PROJECTS_DIRS = ...` continue to work.
from indexer import (  # noqa: E402
    discover_repos,
    git_worktree_list,
    zellij_sessions,
    claude_sessions_for,
    claude_max_mtime_for,
    _claude_max_mtime_uncached,
    build_worktree_index,
    build_session_index,           # FR-26: per-session rows
    build_session_index_cached,    # FR-26
    build_claude_for_path,
    build_index_cached,
    build_claude_cached,
    messages_for_session,
    git_status_for,
)


# HTML/CSS/JS dashboard moved to frontend.py (Phase 5 refactor — saves ~580 LOC here).
from frontend import HTML  # noqa: E402



# HTTP request handlers moved to handlers.py (Phase 5 refactor).
from handlers import _send_json, Handler  # noqa: E402


# diagnose_livecycle moved to diagnose.py (Phase 5 refactor — saves ~70 LOC here).
# Thin wrapper retained for backward compat with --diagnose-livecycle CLI invocation.
import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).parent))
from diagnose import diagnose_livecycle as _diagnose_livecycle_impl  # noqa: E402


def diagnose_livecycle(worktree_path: str) -> int:
    """Backward-compat wrapper. Real implementation in diagnose.py."""
    return _diagnose_livecycle_impl(
        worktree_path,
        encode_path_for_claude=encode_path_for_claude,
        claude_projects_dirs=CLAUDE_PROJECTS_DIRS,
        running_threshold_sec=RUNNING_THRESHOLD_SEC,
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2 and sys.argv[1] == "--diagnose-livecycle":
        if len(sys.argv) < 3:
            print("Usage: python server.py --diagnose-livecycle <worktree-path>", file=sys.stderr)
            sys.exit(2)
        sys.exit(diagnose_livecycle(sys.argv[2]))

    # Default 127.0.0.1 per NFR-Sec-3 — opt-in 0.0.0.0 via env for cross-host access
    bind = os.environ.get("WT_DASHBOARD_BIND", "127.0.0.1")
    print(f"Worktree dashboard listening on http://{bind}:{PORT}", flush=True)
    # ThreadingHTTPServer (one thread per request, daemon) — the single-threaded
    # HTTPServer blocked all requests during a slow process_scanner sweep (1-2s
    # over many claude.exe), so concurrent probes got connection-refused. Module
    # caches are SWR/advisory (GIL-atomic dict ops) — stale reads are tolerated.
    ThreadingHTTPServer((bind, PORT), Handler).serve_forever()
