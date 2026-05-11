#!/usr/bin/env python3
"""
Worktree Dashboard — HTTP сервер на порту 8083.

Endpoint /          — HTML страница со списком всех ворктри + Zellij-сессий + Claude истории
Endpoint /api/data  — JSON с тем же содержимым

Конфиг: REPOS env var, list of repo roots colon-separated.
Default: $HOME/repos/* (autodiscover any directory containing .git)
"""

from __future__ import annotations
import json
import os
import re
import subprocess
import time
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("WT_DASHBOARD_PORT", "8083"))
ZELLIJ_BIN = os.environ.get("ZELLIJ_BIN", str(Path.home() / ".local/bin/zellij"))
ZELLIJ_WEB_URL = os.environ.get("ZELLIJ_WEB_URL", "http://localhost:8082")
CLAUDE_PROJECTS_DIRS = [
    Path.home() / ".claude" / "projects",                     # WSL/Linux Claude
    Path("/mnt/c/Users") / os.environ.get("WINUSER", "stigm") / ".claude" / "projects",  # Windows native
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
_launch_lock: dict = {}  # (session, uuid) -> timestamp; 5s idempotency window
LAUNCH_LOCK_TTL = 5.0
LAYOUTS_DIR = Path(__file__).parent / "layouts"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


# Zellij interaction moved to zellij_util.py (Phase 5 refactor — saves ~120 LOC).
# Re-export so tests + handlers see same symbols.
from zellij_util import (  # noqa: E402
    _PTY_MASTERS,
    _zellij_session_exists,
    _zellij_inject,
    _zellij_spawn_with_layout,
    _open_vscode,
)


def _whitelisted_paths() -> set[str]:
    """All paths from current /api/index — used for /api/launch and /api/open-vscode whitelist."""
    return {r["worktree_path"] for r in build_index_cached()["rows"]}


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
    HTTPServer((bind, PORT), Handler).serve_forever()
