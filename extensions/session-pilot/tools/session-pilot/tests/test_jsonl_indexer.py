"""
T34: JSONL indexer correctness tests.

claude_sessions_for() in server.py is the core of the dashboard — it scans
~/.claude/projects/<encoded_path>/*.jsonl, parses head + tail for first/last
messages, counts lines, and reports LIVE / idle status.

These tests build synthetic JSONL fixtures, monkey-patch CLAUDE_PROJECTS_DIRS
to point at a tempdir, and exercise the indexer end-to-end against real disk
state. Per integration-tests-first rule — no mocks, no stubs.

Coverage:
  T34_01: happy path — single JSONL, head/tail messages parsed correctly
  T34_02: msg_count matches actual line count
  T34_03: LIVE flag — recent mtime triggers running_now=True
  T34_04: LIVE flag — old mtime keeps running_now=False
  T34_05: empty JSONL — no crash, no spurious last_message
  T34_06: malformed JSON line — skipped, valid lines still parsed
  T34_07: content as list-of-blocks (assistant turn) parsed via text extraction
  T34_08: multiple sessions in same project dir — all returned, sorted by mtime
  T34_09: no matching project dir — sessions=[], running_now=False
  T34_10: variant encoding match — WSL-style worktree path matches Windows-encoded dir
  T34_11: preview strips ```fence markers + collapses whitespace before truncating
  T34_12: /api/claude ETag folds in preview-format version (idle-session 304 cache-bust)
"""

import importlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path


# Module-import once, monkey-patch per-test
SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))
import server  # noqa: E402


def _make_jsonl(path: Path, entries: list[dict]) -> Path:
    """Write a JSONL fixture. Returns path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")
    return path


def _msg(role: str, text: str, ts: str = "2026-05-10T10:00:00Z") -> dict:
    return {"type": role, "timestamp": ts, "message": {"content": text}}


def _setup_project(tmp: Path, worktree_path: str) -> Path:
    """Create ~/.claude/projects/<encoded>/ under tmp + return that dir.

    Picks the FIRST variant of encode_path_for_claude as the dir name —
    deterministic enough for testing. Monkey-patches CLAUDE_PROJECTS_DIRS
    to point at tmp/.claude/projects.
    """
    claude_root = tmp / ".claude" / "projects"
    variants = server.encode_path_for_claude(worktree_path)
    encoded = variants[0]
    proj = claude_root / encoded
    proj.mkdir(parents=True, exist_ok=True)
    server.CLAUDE_PROJECTS_DIRS = [claude_root]
    return proj


def _with_tmpdir():
    """Context-manager helper: yields a fresh tempdir Path. Cleanup is
    delegated to OS / TemporaryDirectory."""
    return tempfile.TemporaryDirectory(prefix="jsonl-idx-")


# ---------- happy path ----------

def test_T34_01_head_tail_parsed():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/foo")
        _make_jsonl(proj / "abc123.jsonl", [
            _msg("user", "first hello", "2026-05-10T10:00:00Z"),
            _msg("assistant", "first reply"),
            _msg("user", "middle ping"),
            _msg("assistant", "final answer", "2026-05-10T10:05:00Z"),
        ])
        info = server.claude_sessions_for("/mnt/d/repos/foo")
        assert len(info["sessions"]) == 1, f"got {info['sessions']}"
        s = info["sessions"][0]
        assert s["uuid"] == "abc123"
        assert s["first_message"].startswith("first hello"), s["first_message"]
        assert s["last_message"].startswith("final answer"), s["last_message"]
        assert s["last_message_role"] == "assistant"
        assert s["last_message_ts"] == "2026-05-10T10:05:00Z"


def test_T34_02_msg_count_matches_lines():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/bar")
        n = 17
        _make_jsonl(proj / "count.jsonl", [_msg("user", f"line {i}") for i in range(n)])
        info = server.claude_sessions_for("/mnt/d/repos/bar")
        assert info["sessions"][0]["msg_count"] == n, info["sessions"][0]


# ---------- LIVE indicator ----------

def test_T34_03_live_recent_mtime():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/live")
        f = _make_jsonl(proj / "fresh.jsonl", [_msg("user", "hi")])
        # mtime = now → well under default 300s threshold
        info = server.claude_sessions_for("/mnt/d/repos/live")
        assert info["running_now"] is True, info


def test_T34_04_idle_old_mtime():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/idle")
        f = _make_jsonl(proj / "old.jsonl", [_msg("user", "ancient")])
        # backdate mtime by 1 hour — well past 300s threshold
        old = time.time() - 3600
        os.utime(f, (old, old))
        info = server.claude_sessions_for("/mnt/d/repos/idle")
        assert info["running_now"] is False, info


# ---------- robustness ----------

def test_T34_05_empty_jsonl_no_crash():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/empty")
        (proj / "empty.jsonl").write_text("", encoding="utf-8")
        info = server.claude_sessions_for("/mnt/d/repos/empty")
        assert len(info["sessions"]) == 1
        s = info["sessions"][0]
        assert s["msg_count"] == 0, s
        assert s["first_message"] == "", s
        assert s["last_message"] == "", s


def test_T34_06_malformed_line_skipped():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/mal")
        path = proj / "mixed.jsonl"
        with path.open("w", encoding="utf-8") as f:
            f.write("{not json at all\n")
            f.write(json.dumps(_msg("user", "valid one")) + "\n")
            f.write("garbled {{}}}\n")
        info = server.claude_sessions_for("/mnt/d/repos/mal")
        assert info["sessions"][0]["last_message"].startswith("valid one"), info["sessions"]


def test_T34_07_content_as_list_of_blocks():
    """Assistant turns sometimes have content = [{type:'text', text:'...'}, ...]."""
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/list")
        path = proj / "list.jsonl"
        entry = {
            "type": "assistant",
            "timestamp": "2026-05-10T11:00:00Z",
            "message": {"content": [
                {"type": "text", "text": "block one"},
                {"type": "tool_use", "name": "Read"},
                {"type": "text", "text": "block two"},
            ]},
        }
        path.write_text(json.dumps(entry) + "\n", encoding="utf-8")
        info = server.claude_sessions_for("/mnt/d/repos/list")
        # Both text blocks joined with space
        last = info["sessions"][0]["last_message"]
        assert "block one" in last and "block two" in last, last


def test_T34_08_multiple_sessions_returned():
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/multi")
        _make_jsonl(proj / "s1.jsonl", [_msg("user", "session 1")])
        _make_jsonl(proj / "s2.jsonl", [_msg("user", "session 2")])
        _make_jsonl(proj / "s3.jsonl", [_msg("user", "session 3")])
        info = server.claude_sessions_for("/mnt/d/repos/multi")
        uuids = {s["uuid"] for s in info["sessions"]}
        assert uuids == {"s1", "s2", "s3"}, uuids


def test_T34_09_no_match_empty_result():
    with _with_tmpdir() as td:
        tmp = Path(td)
        # Set base dirs but DON'T create any matching project dir
        server.CLAUDE_PROJECTS_DIRS = [tmp / ".claude" / "projects"]
        (tmp / ".claude" / "projects").mkdir(parents=True)
        info = server.claude_sessions_for("/mnt/d/repos/nonexistent")
        assert info["sessions"] == []
        assert info["running_now"] is False


def test_T34_10_variant_encoding_match():
    """Worktree at `/mnt/d/repos/foo`; Claude wrote to `D--repos-foo` (Windows
    canonical). Indexer should match via variant set."""
    with _with_tmpdir() as td:
        tmp = Path(td)
        claude_root = tmp / ".claude" / "projects"
        # Manually create the Windows-canonical dir name
        proj = claude_root / "D--repos-foo"
        proj.mkdir(parents=True)
        _make_jsonl(proj / "cross.jsonl", [_msg("user", "cross-os")])
        server.CLAUDE_PROJECTS_DIRS = [claude_root]
        # Worktree path in WSL form — encoder must produce D--repos-foo variant
        info = server.claude_sessions_for("/mnt/d/repos/foo")
        assert len(info["sessions"]) == 1, info
        assert info["sessions"][0]["last_message"].startswith("cross-os")


def test_T34_11_preview_strips_fence_and_whitespace():
    """Regression: assistant replies wrapped in a ```json fence or spanning
    multiple lines must not leak the ``` markers / newlines into the
    first_message / last_message preview (dashboard "Last message" column
    showed `assistant: ```json { "reason": ...`). Body content is preserved,
    just flattened to one line."""
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/fence")
        raw = '```json\n{\n  "reason": "the verdict",\n  "ok": true\n}\n```'
        _make_jsonl(proj / "fence.jsonl", [
            _msg("user", "```python\nprint(1)\n```", "2026-05-10T10:00:00Z"),
            _msg("assistant", raw, "2026-05-10T10:05:00Z"),
        ])
        info = server.claude_sessions_for("/mnt/d/repos/fence")
        s = info["sessions"][0]
        for field in ("first_message", "last_message"):
            val = s[field]
            assert "```" not in val, f"{field} still has fence: {val!r}"
            assert "\n" not in val, f"{field} still has newline: {val!r}"
        assert '"reason": "the verdict"' in s["last_message"], s["last_message"]
        assert s["last_message_role"] == "assistant"


def test_T34_12_etag_carries_preview_version():
    """Regression: the /api/claude ETag must fold in the preview-format version,
    not just mtime. An idle session (unchanged JSONL → unchanged mtime) otherwise
    keeps returning 304, so the client never picks up cleaned previews after a
    _clean_preview format change — the "top row still shows ```json" bug."""
    import indexer
    with _with_tmpdir() as td:
        tmp = Path(td)
        proj = _setup_project(tmp, "/mnt/d/repos/etagtest")
        _make_jsonl(proj / "et.jsonl", [_msg("assistant", "hello", "2026-05-10T10:00:00Z")])
        data = server.build_claude_for_path("/mnt/d/repos/etagtest")
        etag = data["etag"]
        assert indexer._PREVIEW_FORMAT_VERSION in etag, f"etag missing preview version: {etag}"
        mtime = data["claude_max_mtime"]
        assert etag != f'W/"{mtime}"', "etag must differ from legacy mtime-only form (would 304-serve stale)"


# ---------- runner ----------

if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
