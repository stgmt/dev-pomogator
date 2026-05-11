"""
Tests for messages_for_session — the API behind the "Last message" modal.

Invariants enforced:
  MSG_01: filters out system/attachment chrome — only user/assistant survive
  MSG_02: returned slice is centered on target_index (in user/assistant frame)
  MSG_03: total reflects user/assistant count, not raw JSONL line count
  MSG_04: every returned message has non-empty text from user/assistant content
          (the bug we caught: system entries showed up with text="" producing
          the empty modal user reported)
  MSG_05: out-of-range index clamps to [0, total-1] (frontend may pass stale
          msg_count from a session that grew since cache)
  MSG_06: claude_sessions_for.msg_count counts user/assistant only, not raw lines
          (so frontend cellClick handler points at the right modal target)
"""

import json
import os
import sys
import tempfile
import time
from pathlib import Path

SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))
import indexer  # noqa: E402
import server  # noqa: E402


def _msg(role: str, text: str, ts: str = "2026-05-11T10:00:00Z") -> dict:
    return {"type": role, "timestamp": ts, "message": {"content": text}}


def _system(text: str = "") -> dict:
    return {"type": "system", "timestamp": "2026-05-11T10:00:00Z", "message": {"content": text}}


def _attachment(ts: str = "2026-05-11T09:15:24.034Z") -> dict:
    """Real-world shape: no readable text — like what user saw in the broken modal."""
    return {"type": "attachment", "timestamp": ts}


def _tool_only_assistant(tool_name: str = "Bash") -> dict:
    """Real-world shape: assistant turn that's ONLY a tool_use block, no text.
    Claude writes these to JSONL when it calls a tool without prose. Type
    is 'assistant' so the user/assistant filter doesn't catch it — must be
    caught by the empty-text filter."""
    return {
        "type": "assistant",
        "timestamp": "2026-05-11T10:00:00Z",
        "message": {"content": [{"type": "tool_use", "name": tool_name, "input": {}}]},
    }


def _tool_result_user(tool_use_id: str = "toolu_01") -> dict:
    """Real-world shape: user turn that's ONLY a tool_result block (no text).
    Claude emits these after every tool_use to carry the tool's output back."""
    return {
        "type": "user",
        "timestamp": "2026-05-11T10:00:01Z",
        "message": {"content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "output"}]},
    }


def _setup_session(tmp: Path, worktree_path: str, session_uuid: str, entries: list[dict]) -> None:
    """Build ~/.claude/projects/<encoded>/<uuid>.jsonl with given entries.
    Configures server.CLAUDE_PROJECTS_DIRS and server._whitelisted_paths."""
    claude_root = tmp / ".claude" / "projects"
    variants = server.encode_path_for_claude(worktree_path)
    encoded = variants[0]
    proj = claude_root / encoded
    proj.mkdir(parents=True, exist_ok=True)
    jsonl = proj / f"{session_uuid}.jsonl"
    with jsonl.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")
    server.CLAUDE_PROJECTS_DIRS = [claude_root]
    # Whitelist the worktree path so messages_for_session doesn't reject it
    server._whitelisted_paths = lambda: {worktree_path}


def test_MSG_01_filters_out_system_and_attachment():
    """Modal must show conversation, not service entries."""
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        # Mimic what user saw: 2 conversation turns + trailing system/attachment chrome
        _setup_session(tmp, "/test/wt", "abc", [
            _msg("user", "hello"),
            _msg("assistant", "hi"),
            _attachment(),         # text="" — would appear blank in modal (the bug)
            _system("ctx 1"),      # text but type=system — still chrome
            _system("ctx 2"),
        ])
        r = indexer.messages_for_session("/test/wt", "abc", 1, context=10)
        roles = [m["role"] for m in r["messages"]]
        assert roles == ["user", "assistant"], f"system/attachment leaked: {roles}"


def test_MSG_02_slice_centered_on_target():
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        entries = [_msg("user" if i % 2 == 0 else "assistant", f"m{i}") for i in range(10)]
        _setup_session(tmp, "/test/wt2", "uuid2", entries)
        r = indexer.messages_for_session("/test/wt2", "uuid2", 5, context=2)
        idxs = [m["idx"] for m in r["messages"]]
        assert idxs == [3, 4, 5, 6, 7], f"expected centered window, got {idxs}"
        assert r["target_index"] == 5
        assert r["total"] == 10


def test_MSG_03_total_reflects_ua_count_not_raw_lines():
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        # 3 real exchanges + 5 chrome lines = 8 raw lines, 3 UA messages
        _setup_session(tmp, "/test/wt3", "uuid3", [
            _msg("user", "q1"),
            _system("ctx"),
            _msg("assistant", "a1"),
            _attachment(),
            _system("ctx"),
            _msg("user", "q2"),
            _system("ctx"),
            _system("ctx"),
        ])
        r = indexer.messages_for_session("/test/wt3", "uuid3", 0, context=10)
        assert r["total"] == 3, f"total should be UA count (3), got {r['total']}"


def test_MSG_04_all_returned_messages_have_non_empty_text():
    """The original bug: modal showed entries with empty text. Filter must
    ensure every returned message has actual conversation content OR be
    one of the legitimate empty-but-real cases (we test happy path)."""
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        _setup_session(tmp, "/test/wt4", "uuid4", [
            _msg("user", "real text"),
            _attachment(),  # text="" — must NOT appear in result
            _msg("assistant", "more real text"),
        ])
        r = indexer.messages_for_session("/test/wt4", "uuid4", 0, context=5)
        # The filter drops attachment; all surviving messages must have text
        texts = [m["text"] for m in r["messages"]]
        assert all(t for t in texts), f"empty text leaked: {texts}"
        assert texts == ["real text", "more real text"]


def test_MSG_05_out_of_range_index_clamps():
    """Frontend may pass stale (msg_count - 1) for sessions where new
    chrome was appended; clamping prevents 'no messages returned' empty modal."""
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        _setup_session(tmp, "/test/wt5", "uuid5", [
            _msg("user", "u0"),
            _msg("assistant", "a0"),
            _msg("user", "u1"),
        ])
        # Frontend passes 99 (way past end)
        r = indexer.messages_for_session("/test/wt5", "uuid5", 99, context=5)
        assert r["total"] == 3
        assert r["target_index"] == 2  # clamped to last UA index
        assert len(r["messages"]) == 3


def test_MSG_07_filters_tool_only_user_assistant_turns():
    """Real-world bug pattern: assistant turn = pure tool_use, user turn = pure
    tool_result. Both have type ∈ {user, assistant} so the type filter passes
    them through; but they have no human-readable text and rendered as empty
    bubbles in the modal. Filter must drop them too.

    This is the test I should have written first time — MSG_04 only covered
    text="" attachments, not text="" user/assistant tool-chrome. Reality had
    both patterns in the same JSONL."""
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        _setup_session(tmp, "/test/wt7", "uuid7", [
            _msg("user", "real q1"),
            _tool_only_assistant("Read"),       # type=assistant but text=""
            _tool_result_user("toolu_01"),       # type=user but text=""
            _msg("assistant", "real answer"),
            _tool_only_assistant("Edit"),
            _tool_result_user("toolu_02"),
        ])
        r = indexer.messages_for_session("/test/wt7", "uuid7", 0, context=10)
        texts = [m["text"] for m in r["messages"]]
        roles = [m["role"] for m in r["messages"]]
        assert texts == ["real q1", "real answer"], (
            f"tool-only turns leaked: roles={roles}, texts={texts}"
        )
        assert r["total"] == 2, f"total should drop tool-only turns, got {r['total']}"


def test_MSG_06_claude_sessions_msg_count_is_ua_only():
    """claude_sessions_for.msg_count must count only user/assistant lines.
    Frontend cellClick uses (msg_count - 1) as index — if msg_count were raw
    line count, click would land on trailing system/attachment chrome (the
    original reported bug: modal opened on 'attachment#7001' instead of
    real last message)."""
    with tempfile.TemporaryDirectory(prefix="msg-") as td:
        tmp = Path(td)
        _setup_session(tmp, "/test/wt6", "uuid6", [
            _msg("user", "q1"),
            _tool_only_assistant("Read"),         # type=assistant but no text — must NOT count
            _tool_result_user("toolu_01"),         # type=user but no text — must NOT count
            _msg("assistant", "a1"),
            _attachment(),                         # type=attachment — must NOT count
            _system("trailing system"),            # type=system — must NOT count
        ])
        info = server.claude_sessions_for("/test/wt6")
        s = info["sessions"][0]
        assert s["msg_count"] == 2, (
            f"msg_count should be 2 (UA with text only), got {s['msg_count']} — "
            f"frontend cellClick would land on chrome, modal shows empty"
        )


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
