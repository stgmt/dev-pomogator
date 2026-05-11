"""Output invariants for build_worktree_index + discover_repos.

These tests guard the *shape* of the indexer's output across the full
discover_repos → git_worktree_list → build_worktree_index chain, not the
correctness of any single leaf function. They catch the class of bug where
each leaf is correct but their composition produces an N×M cartesian
explosion (regression: 5 worktrees × 5 worktrees = 25 rows, all dupes).

Cases:
  IDX_INV_01: discover_repos skips a linked worktree (`.git` is a file, not dir)
  IDX_INV_02: discover_repos accepts a main worktree (`.git` is a dir)
  IDX_INV_03: build_worktree_index returns unique worktree_path
              even when discover_repos hands it the same repo twice
  IDX_INV_04: end-to-end — 1 main repo with 2 linked worktrees gives
              exactly 3 rows (not 9, not 12)
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))
import indexer  # noqa: E402
import server  # noqa: E402


def _git(*args, cwd):
    return subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=True,
    )


def _init_repo_with_commit(repo: Path) -> None:
    """Make a real git repo with one commit so `git worktree add` works."""
    repo.mkdir(parents=True, exist_ok=True)
    _git("init", "-q", "-b", "main", cwd=repo)
    _git("config", "user.email", "t@e.com", cwd=repo)
    _git("config", "user.name", "t", cwd=repo)
    (repo / "README").write_text("ok", encoding="utf-8")
    _git("add", ".", cwd=repo)
    _git("commit", "-q", "-m", "init", cwd=repo)


def test_IDX_INV_01_discover_repos_skips_linked_worktree(monkeypatch):
    """A linked worktree (`.git` = file) MUST NOT be returned as a repo."""
    with tempfile.TemporaryDirectory(prefix="idx-inv-") as td:
        root = Path(td)
        main = root / "main"
        linked = root / "linked"
        _init_repo_with_commit(main)
        _git("worktree", "add", "-b", "feat", str(linked), cwd=main)
        # Sanity-check fixture: linked/.git must be a file
        assert (linked / ".git").is_file()
        assert (main / ".git").is_dir()

        monkeypatch.setenv("REPOS", os.pathsep.join([str(main), str(linked)]))
        repos = indexer.discover_repos()
        assert main in repos, repos
        assert linked not in repos, f"linked worktree leaked into repos: {repos}"


def test_IDX_INV_02_discover_repos_accepts_main_worktree(monkeypatch):
    with tempfile.TemporaryDirectory(prefix="idx-inv-") as td:
        root = Path(td)
        main = root / "main"
        _init_repo_with_commit(main)
        monkeypatch.setenv("REPOS", str(main))
        repos = indexer.discover_repos()
        assert repos == [main], repos


def test_IDX_INV_03_no_duplicate_worktree_paths(monkeypatch):
    """Even if discover_repos returns the same repo twice (e.g., two scan
    roots overlap), build_worktree_index MUST emit each worktree_path once."""
    with tempfile.TemporaryDirectory(prefix="idx-inv-") as td:
        root = Path(td)
        main = root / "main"
        _init_repo_with_commit(main)

        # Force discover_repos to return the same repo twice
        monkeypatch.setattr(indexer, "discover_repos", lambda: [main, main])
        # Disable claude scan side effects
        monkeypatch.setattr(indexer, "claude_max_mtime_for", lambda p: 0.0)

        idx = indexer.build_worktree_index()
        paths = [r["worktree_path"] for r in idx["rows"]]
        assert len(paths) == len(set(paths)), f"duplicate worktree_paths: {paths}"


def test_IDX_INV_04_end_to_end_no_cartesian_explosion(monkeypatch):
    """1 real main + 2 real linked worktrees → exactly 3 rows.

    Pre-fix: linked worktrees registered as repos, each calls
    `git worktree list` returning all 3 → 3 × 3 = 9 rows.
    Post-fix: 1 repo × 3 worktrees = 3 rows.
    """
    with tempfile.TemporaryDirectory(prefix="idx-inv-") as td:
        root = Path(td)
        main = root / "main"
        wt_a = root / "feat-a"
        wt_b = root / "feat-b"
        _init_repo_with_commit(main)
        _git("worktree", "add", "-b", "feat-a", str(wt_a), cwd=main)
        _git("worktree", "add", "-b", "feat-b", str(wt_b), cwd=main)

        # Point discover_repos at all 3 paths via REPOS to simulate the
        # original bug condition: a naive scanner that sees `.git` on each
        # would treat all 3 as repos. discover_repos with the .is_dir filter
        # should keep only `main`.
        monkeypatch.setenv("REPOS", os.pathsep.join([str(main), str(wt_a), str(wt_b)]))
        monkeypatch.setattr(indexer, "claude_max_mtime_for", lambda p: 0.0)

        idx = indexer.build_worktree_index()
        paths = sorted(r["worktree_path"] for r in idx["rows"])
        # git canonicalizes paths — compare on resolved form
        expected = sorted(str(p.resolve()) for p in (main, wt_a, wt_b))
        # Some platforms emit paths via git's POSIX-ish form on Windows;
        # compare with a tolerant lowercase + forward-slash normalization.
        norm = lambda s: s.replace("\\", "/").lower()
        assert sorted(map(norm, paths)) == sorted(map(norm, expected)), (
            f"\nactual:   {paths}\nexpected: {expected}"
        )
        assert len(paths) == 3, f"cartesian explosion: got {len(paths)} rows: {paths}"

        # is_main_worktree invariant: exactly one row should be marked main
        # (the row whose worktree_path equals the discovered repo path, after
        # cross-platform slash normalization). Before fix: str(WindowsPath) on
        # Windows uses `\`, git emits `/`, so equality always returned false →
        # `(main)` label never appeared on dashboard.
        main_rows = [r for r in idx["rows"] if r["is_main_worktree"]]
        assert len(main_rows) == 1, (
            f"Expected exactly 1 main worktree, got {len(main_rows)}: "
            f"{[(r['worktree_path'], r['is_main_worktree']) for r in idx['rows']]}"
        )
        assert norm(main_rows[0]["worktree_path"]) == norm(str(main.resolve())), (
            f"Wrong row marked as main: {main_rows[0]['worktree_path']} "
            f"vs expected {main.resolve()}"
        )


def test_IDX_INV_06_is_main_worktree_through_symlink(monkeypatch):
    """Real-world repro: on Windows `~/repos` is often a junction/symlink to
    the real drive (e.g. D:/repos). discover_repos returns the symlink path
    (str = C:/Users/.../repos/foo), git always returns the resolved real path
    (D:/repos/foo). Naive str equality misses this case → `(main)` label
    never appears on dashboard.

    Skipped on platforms without symlink privilege (Windows non-admin).
    """
    with tempfile.TemporaryDirectory(prefix="idx-inv-sym-") as td:
        root = Path(td)
        real_repo = root / "real_main"
        sym_repo = root / "sym_main"
        _init_repo_with_commit(real_repo)
        try:
            sym_repo.symlink_to(real_repo, target_is_directory=True)
        except (OSError, NotImplementedError):
            import pytest
            pytest.skip("symlinks not available on this platform/user")

        # Feed discover_repos the SYMLINK path; build_worktree_index should
        # still mark the row as main_worktree because git returns the real path.
        monkeypatch.setattr(indexer, "discover_repos", lambda: [sym_repo])
        monkeypatch.setattr(indexer, "claude_max_mtime_for", lambda p: 0.0)

        idx = indexer.build_worktree_index()
        main_rows = [r for r in idx["rows"] if r["is_main_worktree"]]
        assert len(main_rows) == 1, (
            f"Symlinked scan root broke is_main_worktree comparison. "
            f"Rows: {[(r['worktree_path'], r['is_main_worktree']) for r in idx['rows']]}"
        )


def test_IDX_INV_05_cursor_worktrees_filtered_out(monkeypatch):
    """Cursor editor manages its own linked worktrees under <repo>/.cursor/worktrees/<id>.
    Those are for Cursor, not Claude — they should never appear on the dashboard.

    Real-world reproduction: user's machine had ~16 such Cursor worktrees in
    `git worktree list` output for `zoho` and `presentation-ai-pomogator` repos,
    cluttering the dashboard with paths like
    `C:/Users/stigm/.cursor/worktrees/zoho/drt` that the user never opens in
    Claude.
    """
    with tempfile.TemporaryDirectory(prefix="idx-inv-cursor-") as td:
        root = Path(td)
        main = root / "main"
        normal_wt = root / "feat-normal"
        # Build a fake cursor worktree under <root>/.cursor/worktrees/<id>
        cursor_wt = root / ".cursor" / "worktrees" / "cursor-id-abc"
        _init_repo_with_commit(main)
        _git("worktree", "add", "-b", "feat-normal", str(normal_wt), cwd=main)
        cursor_wt.parent.mkdir(parents=True, exist_ok=True)
        _git("worktree", "add", "-b", "feat-cursor", str(cursor_wt), cwd=main)

        monkeypatch.setenv("REPOS", str(main))
        monkeypatch.setattr(indexer, "claude_max_mtime_for", lambda p: 0.0)

        idx = indexer.build_worktree_index()
        paths = [r["worktree_path"] for r in idx["rows"]]
        # Cursor worktree MUST NOT appear; normal worktree must
        for p in paths:
            assert "/.cursor/worktrees/" not in p.replace("\\", "/"), (
                f"Cursor worktree leaked into dashboard: {p}"
            )
        assert any("feat-normal" in p for p in paths), (
            f"Normal worktree was filtered too aggressively: {paths}"
        )


if __name__ == "__main__":
    # Stand-alone runner (no pytest required)
    class _MP:
        def __init__(self):
            self._env_saved = {}
            self._attrs = []
        def setenv(self, k, v):
            import os
            self._env_saved[k] = os.environ.get(k)
            os.environ[k] = v
        def setattr(self, obj, name, val):
            self._attrs.append((obj, name, getattr(obj, name)))
            setattr(obj, name, val)
        def undo(self):
            import os
            for k, v in self._env_saved.items():
                if v is None: os.environ.pop(k, None)
                else: os.environ[k] = v
            for obj, name, val in self._attrs:
                setattr(obj, name, val)

    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            mp = _MP()
            try:
                fn(mp)
                print(f"PASS {name}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}"); failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}"); failed += 1
            finally:
                mp.undo()
    sys.exit(1 if failed else 0)
