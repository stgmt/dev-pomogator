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


def discover_repos() -> list[Path]:
    """Find git repos. Default: scan ~/repos and /mnt/d/repos for any .git directories."""
    repos: list[Path] = []
    explicit = os.environ.get("REPOS")
    if explicit:
        for p in explicit.split(":"):
            p = Path(p)
            if p.exists() and (p / ".git").exists():
                repos.append(p)
        return repos

    candidates = [
        Path.home() / "repos",
        Path("/mnt/d/repos"),
        Path("/mnt/c/repos"),
    ]
    for root in candidates:
        if not root.exists():
            continue
        for child in root.iterdir():
            if child.is_dir() and (child / ".git").exists():
                repos.append(child)
    return repos


def git_worktree_list(repo: Path) -> list[dict]:
    """Run `git worktree list --porcelain` and parse output."""
    try:
        out = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except Exception as e:
        return [{"error": str(e)}]
    if out.returncode != 0:
        return [{"error": out.stderr.strip() or "git failed"}]

    blocks = out.stdout.strip().split("\n\n")
    worktrees = []
    for block in blocks:
        wt: dict = {}
        for line in block.splitlines():
            if line.startswith("worktree "):
                wt["path"] = line[len("worktree "):]
            elif line.startswith("HEAD "):
                wt["head"] = line[len("HEAD "):]
            elif line.startswith("branch "):
                # Format: refs/heads/<branch>
                br = line[len("branch "):]
                wt["branch"] = br.replace("refs/heads/", "")
            elif line == "detached":
                wt["branch"] = "(detached)"
            elif line == "bare":
                wt["bare"] = True
        if wt.get("path"):
            worktrees.append(wt)
    return worktrees


def zellij_sessions() -> list[str]:
    """Return list of session names from `zellij list-sessions`."""
    try:
        out = subprocess.run(
            [ZELLIJ_BIN, "list-sessions", "--no-formatting"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except Exception:
        return []
    if out.returncode != 0:
        return []
    sessions = []
    for line in out.stdout.splitlines():
        # Lines look like: "feature-auth [Created 5m ago]" — take first token
        m = re.match(r"^(\S+)", line)
        if m:
            sessions.append(m.group(1))
    return sessions


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


def claude_sessions_for(worktree_path: str) -> dict:
    """
    Look up Claude JSONLs for this worktree across both Linux + Windows Claude dirs.
    Returns {sessions: [...], running_now: bool, last_modified: iso_str}.
    """
    encoded_variants = set(encode_path_for_claude(worktree_path))
    sessions: list[dict] = []
    now = time.time()
    last_mtime = 0.0
    running_now = False

    for base_dir in CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists():
            continue
        for proj_dir in base_dir.iterdir():
            name = proj_dir.name
            # Match exact OR endswith (some Claude variants strip prefix)
            match = (
                name in encoded_variants
                or any(name.endswith(v.lstrip("-")) for v in encoded_variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in encoded_variants if len(name) > 8)
            )
            if not match:
                continue
            for jsonl in proj_dir.glob("*.jsonl"):
                try:
                    stat = jsonl.stat()
                    if stat.st_mtime > last_mtime:
                        last_mtime = stat.st_mtime
                    if (now - stat.st_mtime) < RUNNING_THRESHOLD_SEC:
                        running_now = True

                    # FAST: read first 64KB for first_message, last 256KB for last_message + count via byte scan
                    first_msg = ""; last_msg = ""; last_msg_role = ""; last_msg_ts = ""; msg_count = 0
                    with open(jsonl, "rb") as f:
                        head_bytes = f.read(64 * 1024)
                        f.seek(0, 2); size = f.tell()
                        f.seek(max(0, size - 256 * 1024))
                        tail_bytes = f.read()
                    # message count = number of \n in whole file via shell-free byte-count.
                    # Cheap heuristic: stat-based estimate from size / avg line.
                    # Better: full count via single pass.
                    with open(jsonl, "rb") as f:
                        msg_count = sum(1 for _ in f)
                    # Parse first_msg from head
                    for line in head_bytes.decode("utf-8", errors="ignore").split("\n"):
                        if not line.strip(): continue
                        try: obj = json.loads(line)
                        except: continue
                        if obj.get("type") in ("user", "assistant"):
                            content = obj.get("message", {}).get("content", "")
                            txt = content if isinstance(content, str) else " ".join(
                                i.get("text","") for i in content if isinstance(i, dict) and i.get("type")=="text"
                            ) if isinstance(content, list) else ""
                            if txt:
                                first_msg = txt[:140]; break
                    # Parse last_msg from tail (iterate lines reverse)
                    tail_lines = tail_bytes.decode("utf-8", errors="ignore").split("\n")
                    for line in reversed(tail_lines):
                        if not line.strip(): continue
                        try: obj = json.loads(line)
                        except: continue
                        if obj.get("type") in ("user", "assistant"):
                            content = obj.get("message", {}).get("content", "")
                            txt = content if isinstance(content, str) else " ".join(
                                i.get("text","") for i in content if isinstance(i, dict) and i.get("type")=="text"
                            ) if isinstance(content, list) else ""
                            if txt:
                                last_msg = txt[:140]
                                last_msg_role = obj.get("type")
                                last_msg_ts = obj.get("timestamp", "")
                                break
                    if False:  # removed legacy block
                        pass
                    sessions.append({
                        "uuid": jsonl.stem,
                        "source": str(base_dir),
                        "size_bytes": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                        "age_sec": int(now - stat.st_mtime),
                        "msg_count": msg_count,
                        "first_message": first_msg,
                        "last_message": last_msg,
                        "last_message_role": last_msg_role,
                        "last_message_ts": last_msg_ts,
                    })
                except Exception:
                    continue
    sessions.sort(key=lambda s: s["modified"], reverse=True)
    return {
        "sessions": sessions[:5],
        "running_now": running_now,
        "last_modified": datetime.fromtimestamp(last_mtime).isoformat(timespec="seconds") if last_mtime else None,
    }


_START_TIME = time.time()
_launch_lock: dict = {}  # (session, uuid) -> timestamp; 5s idempotency window
LAUNCH_LOCK_TTL = 5.0
LAYOUTS_DIR = Path(__file__).parent / "layouts"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _zellij_session_exists(name: str) -> bool:
    try:
        out = subprocess.run(
            [ZELLIJ_BIN, "list-sessions", "--no-formatting"],
            capture_output=True, text=True, timeout=5, check=False,
        )
    except Exception:
        return False
    if out.returncode != 0:
        return False
    for line in out.stdout.splitlines():
        m = re.match(r"^(\S+)", line)
        if m and m.group(1) == name:
            return True
    return False


def _zellij_inject(session: str, command: str) -> dict:
    """Inject command into existing Zellij session via action write-chars."""
    try:
        # Focus first pane to avoid race-condition (focus might be elsewhere)
        subprocess.run([ZELLIJ_BIN, "--session", session, "action", "focus-pane-id", "terminal_1"],
                       capture_output=True, timeout=3, check=False)
        # Inject keystrokes (\n triggers execution)
        out = subprocess.run([ZELLIJ_BIN, "--session", session, "action", "write-chars", command + "\n"],
                             capture_output=True, text=True, timeout=3, check=False)
        if out.returncode != 0:
            return {"ok": False, "error": f"write-chars failed: {out.stderr[:200]}"}
    except Exception as e:
        return {"ok": False, "error": f"zellij action failed: {e}"}
    return {"ok": True, "method": "write-chars"}


# Keep PTY master fds alive for the lifetime of the server so spawned Zellij
# children never receive SIGHUP from a closed master. The kernel cleans up
# when the server itself exits. Without this list, Python GC closes the master
# fd shortly after Popen returns → Zellij sees EOF on its controlling TTY →
# dies. See RESEARCH.md / NFR-Compat-6 spawn race notes.
_PTY_MASTERS: list[int] = []


def _zellij_spawn_with_layout(session: str, worktree_path: str, mode: str, uuid: str | None) -> dict:
    """Spawn new Zellij session with KDL layout running claude.

    Race-resistant spawn (was: `bash -c "setsid script -qfc ... /dev/null &"`).
    Switched to native Python Popen with:
      - `start_new_session=True` — Popen calls setsid() in child between fork
        and execve, atomically (CPython _posixsubprocess.c L763-779). Same
        guarantee as the old shell `setsid`, no shell hop, no race window.
      - `pty.openpty()` — allocates a controlling TTY for Zellij. Slave fd
        becomes child stdin/stdout/stderr. Master fd is parked in module
        global `_PTY_MASTERS` so GC doesn't close it (which would deliver
        EOF/SIGHUP to Zellij during the WSL2 Playwright teardown race).
      - `close_fds=True` — child does NOT inherit HTTP handler socket fds.
    """
    import tempfile, pty
    tmpl_name = "claude-resume.kdl.tmpl" if mode == "resume" else "claude-fresh.kdl.tmpl"
    tmpl = (LAYOUTS_DIR / tmpl_name).read_text(encoding="utf-8")
    rendered = tmpl.replace("__CWD__", worktree_path).replace("__NAME__", session)
    if mode == "resume" and uuid:
        rendered = rendered.replace("__UUID__", uuid)

    fd, kdl_path = tempfile.mkstemp(prefix="sp-", suffix=".kdl", dir="/tmp")
    try:
        os.write(fd, rendered.encode("utf-8"))
    finally:
        os.close(fd)

    # Allocate PTY pair. Zellij requires a controlling terminal to start —
    # without one it bails with "Zellij detected the current environment is
    # not a terminal". The slave fd is the child's stdio; master stays in
    # the server process (parked in _PTY_MASTERS).
    master_fd, slave_fd = pty.openpty()

    try:
        proc = subprocess.Popen(
            [ZELLIJ_BIN, "-s", session, "-n", kdl_path],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            start_new_session=True,
            close_fds=True,
        )
    except FileNotFoundError as e:
        os.close(master_fd); os.close(slave_fd)
        return {"ok": False, "error": f"zellij not found at {ZELLIJ_BIN}: {e}"}
    finally:
        # Slave is now owned by the child (it inherits a duplicate of the fd).
        # Close our end so the kernel reclaims it when the child exits.
        os.close(slave_fd)

    # Park master fd — keep it open for the server's lifetime. Without this,
    # GC closes master → kernel sends EOF/SIGHUP to Zellij → spawn race.
    _PTY_MASTERS.append(master_fd)

    # Schedule cleanup of KDL temp file
    import threading
    def _cleanup():
        try: os.unlink(kdl_path)
        except OSError: pass
    threading.Timer(60.0, _cleanup).start()

    return {
        "ok": True,
        "method": "new-layout",
        "kdl_path": kdl_path,
        "child_pid": proc.pid,
    }


def _open_vscode(path: str) -> dict:
    """Open path in VSCode/Cursor via 'code' CLI. Path must be whitelisted."""
    try:
        subprocess.Popen(["code", path], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        return {"ok": False, "error": "'code' CLI not found in PATH. Install VSCode/Cursor or use Open-Folder."}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True}


def _whitelisted_paths() -> set[str]:
    """All paths from current /api/index — used for /api/launch and /api/open-vscode whitelist."""
    return {r["worktree_path"] for r in build_index_cached()["rows"]}


def messages_for_session(worktree_path: str, session_uuid: str, index: int, context: int = 2) -> dict:
    """Return message at index plus context (prev/next) for a session JSONL.

    Streams the JSONL file once, collecting only the slice [index-context, index+context].
    Returns {messages: [{idx, role, text, ts}], total: N, target_index: int}.
    Error responses use HTTP 200 with {error: str} per frontend tolerance convention.
    """
    if worktree_path not in _whitelisted_paths():
        return {"error": "path not in whitelist"}
    encoded_variants = set(encode_path_for_claude(worktree_path))
    target_path: Path | None = None
    for base_dir in CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists():
            continue
        for proj_dir in base_dir.iterdir():
            name = proj_dir.name
            if (
                name in encoded_variants
                or any(name.endswith(v.lstrip("-")) for v in encoded_variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in encoded_variants if len(name) > 8)
            ):
                cand = proj_dir / f"{session_uuid}.jsonl"
                if cand.exists():
                    target_path = cand
                    break
        if target_path:
            break
    if not target_path:
        return {"error": f"session {session_uuid} not found for {worktree_path}"}

    lo = max(0, index - context)
    hi = index + context  # inclusive in selection logic
    messages: list[dict] = []
    total = 0
    with target_path.open("r", encoding="utf-8", errors="ignore") as f:
        for i, line in enumerate(f):
            total += 1
            if i < lo or i > hi:
                continue
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            content = obj.get("message", {}).get("content", "")
            if isinstance(content, list):
                text = " ".join(
                    p.get("text", "") for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                )
            else:
                text = content if isinstance(content, str) else ""
            messages.append({
                "idx": i,
                "role": obj.get("type", ""),
                "text": text,
                "ts": obj.get("timestamp", ""),
            })
    return {"messages": messages, "total": total, "target_index": index}


def git_status_for(worktree_path: str) -> dict:
    """Return {added, modified, deleted, untracked, ahead, behind} for a worktree.

    Reads `git status --porcelain=v1` for staged/unstaged file counts and
    `git rev-list --left-right --count <upstream>...HEAD` for ahead/behind
    relative to the tracked upstream. Returns zeros for missing upstream.
    Errors return {error: str} with HTTP 200 — frontend tolerates missing data.
    """
    if worktree_path not in _whitelisted_paths():
        return {"error": "path not in whitelist"}
    try:
        st = subprocess.run(
            ["git", "-C", worktree_path, "status", "--porcelain=v1"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if st.returncode != 0:
            return {"error": st.stderr.strip()[:200] or "git status failed"}
    except FileNotFoundError:
        return {"error": "git not in PATH"}
    except subprocess.TimeoutExpired:
        return {"error": "git status timeout"}

    added = modified = deleted = untracked = 0
    for line in st.stdout.splitlines():
        if not line:
            continue
        # Porcelain v1: first two chars are X (staged) + Y (unstaged) status codes
        x, y = line[0], line[1]
        if x == "?" or y == "?":
            untracked += 1
            continue
        if x == "A" or y == "A":
            added += 1
        elif x == "M" or y == "M":
            modified += 1
        elif x == "D" or y == "D":
            deleted += 1

    ahead = behind = 0
    try:
        rl = subprocess.run(
            ["git", "-C", worktree_path, "rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if rl.returncode == 0 and rl.stdout.strip():
            parts = rl.stdout.strip().split()
            if len(parts) == 2:
                behind, ahead = int(parts[0]), int(parts[1])
    except Exception:
        pass

    return {
        "added": added,
        "modified": modified,
        "deleted": deleted,
        "untracked": untracked,
        "ahead": ahead,
        "behind": behind,
    }


_index_cache: dict = {"ts": 0.0, "data": None}
_claude_cache: dict = {}
CACHE_TTL_INDEX = 5.0
CACHE_TTL_CLAUDE = 8.0


def build_index_cached() -> dict:
    now = time.time()
    if _index_cache["data"] is not None and (now - _index_cache["ts"]) < CACHE_TTL_INDEX:
        return _index_cache["data"]
    data = build_worktree_index()
    _index_cache["ts"] = now
    _index_cache["data"] = data
    return data


def build_claude_cached(path: str) -> dict:
    now = time.time()
    e = _claude_cache.get(path)
    if e and (now - e["ts"]) < CACHE_TTL_CLAUDE:
        return e["data"]
    data = build_claude_for_path(path)
    _claude_cache[path] = {"ts": now, "data": data}
    return data


_mtime_cache: dict = {}
_MTIME_TTL = 2.0


def claude_max_mtime_for(worktree_path: str) -> float:
    """Cheap: max mtime across all JSONLs in matching project dirs. No content parsing.

    Cached 2s — typical /api/index takes ~1s anyway."""
    now = time.time()
    e = _mtime_cache.get(worktree_path)
    if e and (now - e["ts"]) < _MTIME_TTL:
        return e["m"]
    m = _claude_max_mtime_uncached(worktree_path)
    _mtime_cache[worktree_path] = {"ts": now, "m": m}
    return m


def _claude_max_mtime_uncached(worktree_path: str) -> float:
    encoded_variants = set(encode_path_for_claude(worktree_path))
    max_mtime = 0.0
    for base_dir in CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists(): continue
        for proj_dir in base_dir.iterdir():
            name = proj_dir.name
            match = (
                name in encoded_variants
                or any(name.endswith(v.lstrip("-")) for v in encoded_variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in encoded_variants if len(name) > 8)
            )
            if not match: continue
            for jsonl in proj_dir.glob("*.jsonl"):
                try:
                    m = jsonl.stat().st_mtime
                    if m > max_mtime: max_mtime = m
                except OSError: continue
    return max_mtime


def build_worktree_index() -> dict:
    """Fast: just git worktree list + zellij sessions + per-path Claude max mtime, no JSONL parsing."""
    repos = discover_repos()
    sessions_set = set(zellij_sessions())
    rows = []
    for repo in repos:
        repo_name = repo.name
        for wt in git_worktree_list(repo):
            if "error" in wt: continue
            wt_path = wt.get("path", "")
            branch = wt.get("branch", "(unknown)")
            head = wt.get("head", "")[:7]
            session_name_clean = re.sub(r"[^a-zA-Z0-9_-]", "_", f"{repo_name}__{branch}").rstrip("_")
            session_active = session_name_clean in sessions_set
            mtime = claude_max_mtime_for(wt_path)
            rows.append({
                "id": f"{repo_name}__{branch}__{wt_path}",
                "repo": repo_name,
                "repo_path": str(repo),
                "branch": branch,
                "head": head,
                "worktree_path": wt_path,
                "is_main_worktree": str(repo) == wt_path,
                "session_name": session_name_clean,
                "session_active": session_active,
                "session_attach_url": f"{ZELLIJ_WEB_URL}/?session={session_name_clean}" if session_active else None,
                "claude_max_mtime": int(mtime),  # versioning key for client cache
                "has_claude_history": mtime > 0,
            })
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rows": rows,
        "all_zellij_sessions": sorted(sessions_set),
    }


def build_claude_for_path(worktree_path: str) -> dict:
    info = claude_sessions_for(worktree_path)
    mtime = claude_max_mtime_for(worktree_path)
    return {
        "worktree_path": worktree_path,
        "claude_sessions": info["sessions"],
        "claude_running_now": info["running_now"],
        "claude_last_modified": info["last_modified"],
        "claude_max_mtime": int(mtime),
        "etag": f'W/"{int(mtime)}"',
    }



# HTML/CSS/JS dashboard moved to frontend.py (Phase 5 refactor — saves ~580 LOC here).
from frontend import HTML  # noqa: E402



def _send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        url = urlparse(self.path)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body_raw = self.rfile.read(length) if length else b""
            body = json.loads(body_raw.decode("utf-8")) if body_raw else {}
        except Exception:
            _send_json(self, {"error": "invalid JSON body"}, 400); return

        if url.path == "/api/launch":
            self._handle_launch(body)
        elif url.path == "/api/open-vscode":
            self._handle_open_vscode(body)
        else:
            self.send_response(404); self.end_headers()

    def _handle_launch(self, body: dict) -> None:
        wt = body.get("worktree_path", "")
        sess = body.get("session_name", "")
        mode = body.get("mode", "resume")
        uuid_v = body.get("uuid")

        # Path whitelist (security)
        if wt not in _whitelisted_paths():
            _send_json(self, {"ok": False, "error": "worktree_path not in current index whitelist"}, 403); return
        # Session name sanity (alphanum + _ + - only)
        if not re.match(r"^[A-Za-z0-9_-]+$", sess) or len(sess) > 80:
            _send_json(self, {"ok": False, "error": "invalid session_name"}, 400); return
        # Mode
        if mode not in ("resume", "fresh"):
            _send_json(self, {"ok": False, "error": "mode must be 'resume' or 'fresh'"}, 400); return
        # UUID validation (only required for resume mode)
        if mode == "resume":
            if not uuid_v or not UUID_RE.match(uuid_v):
                _send_json(self, {"ok": False, "error": "invalid uuid (must match ^[0-9a-f-]{36}$)"}, 400); return

        # Idempotency lock
        key = (sess, uuid_v or "fresh")
        now = time.time()
        last = _launch_lock.get(key, 0.0)
        if now - last < LAUNCH_LOCK_TTL:
            _send_json(self, {"ok": True, "method": "cached", "session": sess,
                              "url": f"{ZELLIJ_WEB_URL}/?session={sess}",
                              "note": f"idempotency lock — last action {int(now - last)}s ago"}); return
        _launch_lock[key] = now

        # Build command
        cmd = f"claude --resume {uuid_v}" if mode == "resume" else "claude"

        # Decision tree
        if _zellij_session_exists(sess):
            result = _zellij_inject(sess, cmd)
        else:
            result = _zellij_spawn_with_layout(sess, wt, mode, uuid_v)

        if not result.get("ok"):
            _send_json(self, result, 500); return

        _send_json(self, {
            "ok": True,
            "method": result["method"],
            "session": sess,
            "url": f"{ZELLIJ_WEB_URL}/?session={sess}",
            "command": cmd,
        })

    def _handle_open_vscode(self, body: dict) -> None:
        wt = body.get("path", "")
        if wt not in _whitelisted_paths():
            _send_json(self, {"ok": False, "error": "path not in current index whitelist"}, 403); return
        result = _open_vscode(wt)
        _send_json(self, result, 200 if result["ok"] else 500)

    def _serve_vendor(self, url_path: str):
        """Serve static vendored assets from ui/vendor/ — whitelist-gated by
        filename (no `..` traversal, only known extensions)."""
        from pathlib import Path as _P
        # Strip /vendor/ prefix and reject any path containing '..'
        rel = url_path[len("/vendor/"):]
        if ".." in rel or rel.startswith("/") or "\\" in rel:
            self.send_response(403); self.end_headers(); return
        vendor_root = _P(__file__).parent / "ui" / "vendor"
        target = (vendor_root / rel).resolve()
        # Confirm target stays inside vendor_root after resolution
        try:
            target.relative_to(vendor_root.resolve())
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        # Content-type by extension
        ext = target.suffix.lower()
        ctype = {
            ".js":  "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".woff2": "font/woff2",
            ".woff":  "font/woff",
            ".ttf":   "font/ttf",
        }.get(ext, "application/octet-stream")
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html_rendered = HTML.replace("__ZELLIJ_WEB_URL__", ZELLIJ_WEB_URL)
            self.wfile.write(html_rendered.encode("utf-8"))
        elif url.path.startswith("/vendor/"):
            self._serve_vendor(url.path)
        elif url.path == "/api/health":
            _send_json(self, {"status": "ok", "version": "0.1.0", "uptime_sec": int(time.time() - _START_TIME)})
        elif url.path == "/api/index":
            _send_json(self, build_index_cached())
        elif url.path == "/api/claude":
            path = (qs.get("path") or [""])[0]
            if not path:
                _send_json(self, {"error": "missing 'path' query param"}, 400)
                return
            data = build_claude_cached(path)
            etag = data.get("etag", "")
            inm = self.headers.get("If-None-Match", "")
            if etag and inm and inm == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache, must-revalidate")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            if etag: self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/api/data":
            # Legacy combined endpoint (slow). Now built lazily.
            idx = build_index_cached()
            for r in idx["rows"]:
                r.update(build_claude_cached(r["worktree_path"]))
            _send_json(self, idx)
        elif url.path == "/api/git-status":
            path = (qs.get("path") or [""])[0]
            if not path:
                _send_json(self, {"error": "missing 'path' query param"}, 400)
                return
            _send_json(self, git_status_for(path))
        elif url.path == "/api/message":
            path = (qs.get("path") or [""])[0]
            session = (qs.get("session") or [""])[0]
            try:
                index = int((qs.get("index") or ["0"])[0])
                context = int((qs.get("context") or ["2"])[0])
            except ValueError:
                _send_json(self, {"error": "index/context must be integers"}, 400)
                return
            if not path or not session:
                _send_json(self, {"error": "missing 'path' or 'session' query param"}, 400)
                return
            _send_json(self, messages_for_session(path, session, index, context))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args, **kwargs):
        pass


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
