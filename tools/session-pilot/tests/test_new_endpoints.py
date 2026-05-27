"""
Integration tests for T28 (/api/message) and T29 (/api/git-status) endpoints.

Tests invoke the underlying functions directly with monkey-patched
CLAUDE_PROJECTS_DIRS + _whitelisted_paths — no HTTP server boot needed.
Per integration-tests-first: real disk state, real git subprocess, no mocks
for the SUT itself; the whitelist/paths layer is the patch boundary.

Coverage:
  T28_01: messages_for_session returns target + context
  T28_02: target at start of file → no prev neighbors
  T28_03: target at end of file → no next neighbors
  T28_04: context=0 → only target message
  T28_05: session_uuid not found → error response
  T28_06: path not in whitelist → error response
  T28_07: malformed JSON line skipped, valid lines still returned
  T29_01: git_status_for clean repo returns zeros
  T29_02: git_status_for repo with modifications returns counts
  T29_03: git_status_for whitelist gating
  T29_04: git_status_for non-git directory returns error
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))
import server  # noqa: E402


# ---------- helpers ----------

def _make_jsonl(path: Path, entries: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")
    return path


def _msg(role: str, text: str, ts: str = "2026-05-10T10:00:00Z") -> dict:
    return {"type": role, "timestamp": ts, "message": {"content": text}}


def _setup_session(tmp: Path, worktree: str, uuid: str, n_messages: int = 10):
    proj = tmp / ".claude" / "projects" / server.encode_path_for_claude(worktree)[0]
    proj.mkdir(parents=True, exist_ok=True)
    _make_jsonl(proj / f"{uuid}.jsonl", [
        _msg("user" if i % 2 == 0 else "assistant", f"msg {i}", f"2026-05-10T10:0{i}:00Z")
        for i in range(n_messages)
    ])
    server.CLAUDE_PROJECTS_DIRS = [tmp / ".claude" / "projects"]
    server._whitelisted_paths = lambda: {worktree}
    return proj


def _make_git_repo(tmp: Path) -> Path:
    repo = tmp / "repo"
    repo.mkdir(parents=True)
    env = {**os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, env=env, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, env=env, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, env=env, check=True)
    (repo / "initial.txt").write_text("hello\n")
    subprocess.run(["git", "add", "."], cwd=repo, env=env, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=repo, env=env, check=True)
    return repo


# ---------- T28 messages_for_session ----------

def test_T28_01_target_with_context():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess1", 10)
        r = server.messages_for_session("/mnt/d/repos/foo", "sess1", 5, 2)
        assert "error" not in r, r
        assert r["total"] == 10, r
        assert r["target_index"] == 5
        indices = [m["idx"] for m in r["messages"]]
        assert indices == [3, 4, 5, 6, 7], indices


def test_T28_02_target_at_start():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess2", 10)
        r = server.messages_for_session("/mnt/d/repos/foo", "sess2", 0, 2)
        indices = [m["idx"] for m in r["messages"]]
        assert indices == [0, 1, 2], indices


def test_T28_03_target_at_end():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess3", 10)
        r = server.messages_for_session("/mnt/d/repos/foo", "sess3", 9, 2)
        indices = [m["idx"] for m in r["messages"]]
        assert indices == [7, 8, 9], indices


def test_T28_04_context_zero():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess4", 5)
        r = server.messages_for_session("/mnt/d/repos/foo", "sess4", 2, 0)
        assert [m["idx"] for m in r["messages"]] == [2]


def test_T28_05_unknown_session():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess5", 5)
        r = server.messages_for_session("/mnt/d/repos/foo", "does-not-exist", 0, 2)
        assert "error" in r, r
        assert "not found" in r["error"].lower()


def test_T28_06_path_not_whitelisted():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        _setup_session(tmp, "/mnt/d/repos/foo", "sess6", 5)
        # whitelist only "/mnt/d/repos/foo"; query a different path
        r = server.messages_for_session("/mnt/d/repos/bar", "sess6", 0, 2)
        assert "error" in r and "whitelist" in r["error"].lower(), r


def test_T28_07_malformed_line_skipped():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        proj = tmp / ".claude" / "projects" / server.encode_path_for_claude("/mnt/d/repos/foo")[0]
        proj.mkdir(parents=True)
        with (proj / "sess7.jsonl").open("w", encoding="utf-8") as f:
            f.write("not json\n")
            f.write(json.dumps(_msg("user", "valid")) + "\n")
            f.write(json.dumps(_msg("assistant", "also valid")) + "\n")
        server.CLAUDE_PROJECTS_DIRS = [tmp / ".claude" / "projects"]
        server._whitelisted_paths = lambda: {"/mnt/d/repos/foo"}
        r = server.messages_for_session("/mnt/d/repos/foo", "sess7", 1, 1)
        # Indices 0, 1, 2 in slice; line 0 is malformed → skipped; lines 1, 2 returned
        texts = [m["text"] for m in r["messages"]]
        assert "valid" in texts and "also valid" in texts, r


# ---------- T29 git_status_for ----------

def test_T29_01_clean_repo_returns_zeros():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        repo = _make_git_repo(tmp)
        repo_str = str(repo).replace("\\", "/")
        server._whitelisted_paths = lambda: {repo_str}
        r = server.git_status_for(repo_str)
        assert "error" not in r, r
        assert r == {"added": 0, "modified": 0, "deleted": 0, "untracked": 0, "ahead": 0, "behind": 0}, r


def test_T29_02_modifications_counted():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        repo = _make_git_repo(tmp)
        # mod, untracked, staged-add
        (repo / "initial.txt").write_text("modified content\n")
        (repo / "untracked.txt").write_text("new\n")
        (repo / "to-add.txt").write_text("staged\n")
        subprocess.run(["git", "add", "to-add.txt"], cwd=repo, check=True,
                       env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})
        repo_str = str(repo).replace("\\", "/")
        server._whitelisted_paths = lambda: {repo_str}
        r = server.git_status_for(repo_str)
        assert "error" not in r, r
        assert r["modified"] >= 1, r
        assert r["untracked"] >= 1, r
        assert r["added"] >= 1, r


def test_T29_03_whitelist_gating():
    server._whitelisted_paths = lambda: {"/some/other/path"}
    r = server.git_status_for("/not/in/list")
    assert "error" in r and "whitelist" in r["error"].lower(), r


def test_T29_04_non_git_dir_error():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        non_git = tmp / "not-a-repo"
        non_git.mkdir()
        repo_str = str(non_git).replace("\\", "/")
        server._whitelisted_paths = lambda: {repo_str}
        r = server.git_status_for(repo_str)
        # git status outside a repo exits non-zero — wrapper returns {error: ...}
        assert "error" in r, r


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
