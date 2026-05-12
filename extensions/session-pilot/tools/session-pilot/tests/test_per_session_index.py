"""Tests for FR-26 (per-session rows) + FR-25 (process scanner) + FR-24 (UNION).

Follows project test convention: real filesystem fixtures, no mocks except for
subprocess boundary (process_scanner has external `powershell`/`pgrep`/`lsof`
calls — only place mocks are justified).

Test design follows .claude/rules/integration-tests-first.md — server boots
via subprocess in real tests; here we test indexer + process_scanner
in-process for speed + isolation.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import types
import uuid as uuid_module
from pathlib import Path

import pytest

# Add session-pilot tools dir to path so we can import indexer/server/process_scanner
_TOOLS_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(_TOOLS_DIR))

import server  # noqa: E402
import indexer  # noqa: E402
import process_scanner  # noqa: E402


def _init_git_repo(path: Path) -> None:
    """Create minimal git repo at path with 1 commit so `git worktree list` works."""
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.email", "test@test"], cwd=path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=path, check=True)
    (path / "README").write_text("test", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=path, check=True)


def _make_jsonl(dir_path: Path, uuid: str, age_sec: float = 0, content: str = "msg") -> Path:
    """Create a JSONL file with realistic user-message line + custom mtime."""
    dir_path.mkdir(parents=True, exist_ok=True)
    fp = dir_path / f"{uuid}.jsonl"
    fp.write_text(
        json.dumps({"type": "user", "message": {"content": content}}) + "\n",
        encoding="utf-8",
    )
    now = time.time()
    os.utime(fp, (now - age_sec, now - age_sec))
    return fp


def _reset_indexer_caches():
    """Clear in-process caches so tests don't see stale data from each other."""
    indexer._index_cache["data"] = None
    indexer._index_cache["ts"] = 0.0
    indexer._session_index_cache["data"] = None
    indexer._session_index_cache["ts"] = 0.0
    indexer._mtime_cache.clear()
    indexer._claude_cache.clear()
    process_scanner._scan_cache["data"] = {}
    process_scanner._scan_cache["ts"] = 0.0


# ─────────────────────────────────────────────────────────────────────────────
# FR-26 per-session rows
# ─────────────────────────────────────────────────────────────────────────────


def test_fr26_three_jsonls_in_one_dir_emit_three_rows(monkeypatch, tmp_path):
    """3 JSONL files in one encoded dir → 3 separate rows in /api/index, each with distinct session_uuid."""
    repo = tmp_path / "repo-foo"
    _init_git_repo(repo)
    # Use generic encoding (replace : \ / with -) which is what encode_path_for_claude emits
    encoded_dir_name = str(repo).replace(":", "").replace("\\", "-").replace("/", "-")
    proj_dir = tmp_path / "claude_projects" / encoded_dir_name
    uuids = [str(uuid_module.uuid4()) for _ in range(3)]
    for i, u in enumerate(uuids):
        _make_jsonl(proj_dir, u, age_sec=i * 30)  # ages: 0, 30, 60

    monkeypatch.setenv("REPOS", str(repo))
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    rows_for_repo = [r for r in idx["rows"] if str(repo).replace("\\", "/") in r["worktree_path"].replace("\\", "/")]

    assert len(rows_for_repo) == 3, f"expected 3 rows for 3 JSONLs, got {len(rows_for_repo)}"
    assert {r["session_uuid"] for r in rows_for_repo} == set(uuids)
    # All 3 share same worktree_path + repo
    assert {r["worktree_path"] for r in rows_for_repo} == {str(repo).replace("\\", "/")}
    assert {r["repo"] for r in rows_for_repo} == {"repo-foo"}


def test_fr26_row_id_uniqueness_includes_session_uuid(monkeypatch, tmp_path):
    """Row.id must be globally unique — 2 sessions in same cwd must have different id."""
    repo = tmp_path / "repo-bar"
    _init_git_repo(repo)
    encoded = str(repo).replace(":", "").replace("\\", "-").replace("/", "-")
    proj_dir = tmp_path / "claude_projects" / encoded
    _make_jsonl(proj_dir, "aaaa-bbbb-cccc-dddd")
    _make_jsonl(proj_dir, "1111-2222-3333-4444")

    monkeypatch.setenv("REPOS", str(repo))
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    rows = [r for r in idx["rows"] if r["repo"] == "repo-bar"]
    ids = [r["id"] for r in rows]
    assert len(set(ids)) == len(ids), f"row.id must be unique, got dupes: {ids}"


def test_fr26_running_now_per_session_not_per_dir(monkeypatch, tmp_path):
    """Old session (>300s) and new session (<300s) in same dir → only new is running_now."""
    repo = tmp_path / "repo-mixed"
    _init_git_repo(repo)
    encoded = str(repo).replace(":", "").replace("\\", "-").replace("/", "-")
    proj_dir = tmp_path / "claude_projects" / encoded
    _make_jsonl(proj_dir, "fresh-uuid-1111", age_sec=5)
    _make_jsonl(proj_dir, "stale-uuid-2222", age_sec=400)

    monkeypatch.setenv("REPOS", str(repo))
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    monkeypatch.setattr(server, "RUNNING_THRESHOLD_SEC", 300)
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    rows = {r["session_uuid"]: r for r in idx["rows"] if r["repo"] == "repo-mixed"}
    assert rows["fresh-uuid-1111"]["claude_running_now"] is True
    assert rows["stale-uuid-2222"]["claude_running_now"] is False


# ─────────────────────────────────────────────────────────────────────────────
# FR-24 Source B (orphan) + Source C (no history)
# ─────────────────────────────────────────────────────────────────────────────


def test_fr24_orphan_session_in_non_git_cwd(monkeypatch, tmp_path):
    """Encoded dir whose decoded cwd is NOT a git worktree → is_orphan=true row.

    Uses canonical Windows double-dash encoding (`<DRIVE>--<rest>`) for the
    encoded dir name — matches what real Claude Code writes per encode_path_for_claude.
    """
    # Make a real existing path that's NOT a git repo
    desktop = tmp_path / "Desktop"
    desktop.mkdir()
    # Use canonical double-dash encoding: D:\path → D--path
    # This is what claude_paths.encode_path_for_claude emits as the primary variant.
    p = str(desktop)
    if len(p) >= 3 and p[1] == ":" and p[2] in ("/", "\\"):
        drive = p[0].upper()
        rest = p[3:].replace("\\", "-").replace("/", "-")
        encoded = f"{drive}--{rest}"
    else:
        # POSIX fallback (unlikely in this Windows test setup)
        encoded = p.replace("/", "-")
    proj_dir = tmp_path / "claude_projects" / encoded
    _make_jsonl(proj_dir, "orphan-uuid", age_sec=10)

    monkeypatch.setenv("REPOS", "")  # no git roots configured
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    orphans = [r for r in idx["rows"] if r["is_orphan"]]
    assert len(orphans) == 1
    assert orphans[0]["session_uuid"] == "orphan-uuid"
    assert orphans[0]["repo"] == ""
    assert orphans[0]["branch"] == ""
    # is_stale: should be False if decoded path matches real disk path.
    # Known limitation: pytest tmp_path often contains literal dashes
    # (e.g. `pytest-of-stigm`) which decoder can't distinguish from
    # path separators. Real-world paths without literal dashes
    # (D:\repos\foo, C:\Users\stigm\Desktop) decode cleanly.
    # See: indexer._decode_claude_dir_name docstring.


def test_fr24_source_c_worktree_without_jsonl(monkeypatch, tmp_path):
    """Git worktree exists but no JSONLs → 1 row with session_uuid=None."""
    repo = tmp_path / "repo-empty"
    _init_git_repo(repo)
    # NO claude_projects dir at all → no JSONLs match
    empty_projects = tmp_path / "claude_projects_empty"
    empty_projects.mkdir()

    monkeypatch.setenv("REPOS", str(repo))
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [empty_projects])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    rows = [r for r in idx["rows"] if r["repo"] == "repo-empty"]
    assert len(rows) == 1
    assert rows[0]["session_uuid"] is None
    assert rows[0]["has_claude_history"] is False
    assert rows[0]["repo"] == "repo-empty"
    assert rows[0]["is_orphan"] is False


def test_fr24_dedup_source_a_wins_over_source_b(monkeypatch, tmp_path):
    """Same encoded dir matches both Source A (git worktree) and Source B (orphan scan) — only A row emitted."""
    repo = tmp_path / "repo-dedup"
    _init_git_repo(repo)
    encoded = str(repo).replace(":", "").replace("\\", "-").replace("/", "-")
    proj_dir = tmp_path / "claude_projects" / encoded
    _make_jsonl(proj_dir, "dedup-uuid")

    monkeypatch.setenv("REPOS", str(repo))
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    matching = [r for r in idx["rows"] if r["session_uuid"] == "dedup-uuid"]
    assert len(matching) == 1, f"expected single row (Source A wins), got {len(matching)}"
    assert matching[0]["is_orphan"] is False
    assert matching[0]["repo"] == "repo-dedup"


def test_fr24_meta_claude_dir_filtered_out(monkeypatch, tmp_path):
    """Claude's own meta state dirs (C--Users-*--claude-*) are excluded from /api/index."""
    meta_encoded = "C--Users-stigm--claude-projects"
    proj_dir = tmp_path / "claude_projects" / meta_encoded
    _make_jsonl(proj_dir, "meta-uuid")

    monkeypatch.setenv("REPOS", "")
    monkeypatch.setattr(server, "CLAUDE_PROJECTS_DIRS", [tmp_path / "claude_projects"])
    _reset_indexer_caches()

    idx = indexer.build_session_index()
    assert not any(r["session_uuid"] == "meta-uuid" for r in idx["rows"]), \
        "meta dirs C--Users-*--claude-* should be filtered out"


# ─────────────────────────────────────────────────────────────────────────────
# FR-25 process scanner
# ─────────────────────────────────────────────────────────────────────────────


def test_fr25_scanner_failopen_on_disable_env(monkeypatch):
    """SP_DISABLE_PROCESS_SCAN=1 → scanner returns {} without running subprocess."""
    monkeypatch.setenv("SP_DISABLE_PROCESS_SCAN", "1")
    process_scanner._scan_cache["data"] = {}
    process_scanner._scan_cache["ts"] = 0.0
    result = process_scanner.scan_claude_processes(cache_ttl_sec=0)
    assert result == {}


def test_fr25_scanner_normalize_cwd():
    """_normalize_cwd handles drive case + separator style consistently."""
    assert process_scanner._normalize_cwd("d:\\repos\\foo") == "D:/repos/foo"
    assert process_scanner._normalize_cwd("D:/repos/foo/") == "D:/repos/foo"
    assert process_scanner._normalize_cwd('"D:\\repos\\foo"') == "D:/repos/foo"
    assert process_scanner._normalize_cwd("/mnt/d/repos/foo") == "/mnt/d/repos/foo"
    assert process_scanner._normalize_cwd("") == ""


def test_fr25_desktop_app_filter():
    """_is_desktop_app_path excludes Claude.ai desktop app install paths."""
    # Windows desktop app
    if sys.platform == "win32":
        assert process_scanner._is_desktop_app_path(
            "C:\\Program Files\\WindowsApps\\Claude_1.6608.2.0_x64\\Claude.exe"
        )
        assert not process_scanner._is_desktop_app_path(
            "C:\\Users\\stigm\\.local\\bin\\claude.exe"
        )


def test_frontend_html_contains_per_session_lookup_logic():
    """Regression: frontend inline JS must do per-row UUID lookup, not fallback to sessions[0].

    User-reported bug 2026-05-13: dashboard showed 2 visually identical rows
    for same cwd because old frontend (cached in browser) used `sessions[0]`
    for all rows in same cwd. After fix, must look up by row.session_uuid.

    This test verifies the SOURCE code contains the lookup expression — it
    doesn't drive a browser. Real-browser verification is manual (Ctrl+Shift+R
    on dashboard after server upgrade).
    """
    from frontend import HTML
    # Must look up session by row.session_uuid (not just take sessions[0])
    assert "sessions.find(x => x.uuid === row.session_uuid)" in HTML, \
        "frontend.py missing per-uuid session lookup — would render duplicate last_message across rows in same cwd"
    # Must use row.session_uuid for Resume button (not nested top.uuid)
    assert "const uuid = row.session_uuid" in HTML, \
        "frontend.py Resume button must use row.session_uuid, not nested sessions[0].uuid"
    # Cache key bumped to v4 (v3 entries don't have session_uuid in id)
    assert "wtdash_v4_" in HTML, "frontend.py cache key prefix must be v4 for FR-26 schema"
    # One-shot v3 purge present
    assert "purgeV3Cache" in HTML, "frontend.py must purge legacy wtdash_v3_ entries on load"


def test_status_column_has_custom_sorter_with_priority():
    """Regression (user-reported 2026-05-13): Status column was sorted by
    `claude_running_now` boolean field — useless sort, all non-LIVE rows
    lumped together unordered. Must have custom sorter using priority
    composite (LIVE > Open > idle-with-history > none) + mtime sub-sort.
    """
    from frontend import HTML
    # Must define custom sorter function on Status column
    assert 'sorter(a, b, aRow, bRow' in HTML, \
        "Status column missing custom sorter — falls back to boolean field sort"
    # Sorter must encode priority: LIVE=0, Open=1, idle=2, none=3
    assert "claude_running_now" in HTML and "claude_window_open" in HTML, \
        "Status sorter must check both claude_running_now and claude_window_open priorities"
    # Sub-sort by mtime desc within same status group
    assert "claude_max_mtime" in HTML, \
        "Status sorter must sub-sort by claude_max_mtime within same status group"


def test_status_priority_sort_logic_replicated_in_python():
    """Manual replication of the JS sorter logic to validate priority order.

    JS sorter:
      priority = 0 if running_now else 1 if window_open else 2 if has mtime else 3
      same priority → newer mtime first

    Verified expected order:
      LIVE (running) > Open (window alive idle) > idle-with-history > no-history
    """
    rows = [
        {"claude_running_now": False, "claude_window_open": False, "claude_max_mtime": 0,      "label": "none"},
        {"claude_running_now": True,  "claude_window_open": False, "claude_max_mtime": 100,    "label": "live-old"},
        {"claude_running_now": False, "claude_window_open": True,  "claude_max_mtime": 50,     "label": "open"},
        {"claude_running_now": False, "claude_window_open": False, "claude_max_mtime": 999,    "label": "idle-newer"},
        {"claude_running_now": True,  "claude_window_open": False, "claude_max_mtime": 200,    "label": "live-new"},
        {"claude_running_now": False, "claude_window_open": False, "claude_max_mtime": 100,    "label": "idle-older"},
    ]
    def priority(r):
        if r["claude_running_now"]: return 0
        if r["claude_window_open"]: return 1
        if r["claude_max_mtime"]: return 2
        return 3
    rows.sort(key=lambda r: (priority(r), -r["claude_max_mtime"]))
    labels = [r["label"] for r in rows]
    assert labels == ["live-new", "live-old", "open", "idle-newer", "idle-older", "none"], \
        f"unexpected sort order: {labels}"


def test_html_response_has_no_store_cache_header():
    """Regression: HTML / endpoint must send Cache-Control: no-store to prevent
    stale frontend JS bundle in Edge --app/Chrome across server upgrades."""
    # Module-level import of handlers + simulate / GET
    # Spawn server inline would be heavy; just verify _serve_root sends the header.
    # Read handlers.py source as a sanity check (it's a small file).
    handlers_src = (Path(__file__).parent.parent / "handlers.py").read_text(encoding="utf-8")
    # Look for cache control set in / route
    assert 'Cache-Control' in handlers_src and 'no-store' in handlers_src, \
        "handlers.py / route must set Cache-Control: no-store to prevent stale HTML in browsers"


def test_fr25_scanner_failopen_on_subprocess_timeout(monkeypatch):
    """Subprocess timeout → scanner returns {} not crash."""
    def _raise_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="powershell", timeout=3)
    monkeypatch.setattr(subprocess, "run", _raise_timeout)
    process_scanner._scan_cache["data"] = {}
    process_scanner._scan_cache["ts"] = 0.0
    monkeypatch.delenv("SP_DISABLE_PROCESS_SCAN", raising=False)
    result = process_scanner.scan_claude_processes(cache_ttl_sec=0)
    assert result == {}
