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


def _zellij_spawn_with_layout(session: str, worktree_path: str, mode: str, uuid: str | None) -> dict:
    """Spawn new Zellij session with KDL layout running claude.

    Uses setsid to detach from HTTP backend, schedules tmp file cleanup."""
    import tempfile, shlex
    tmpl_name = "claude-resume.kdl.tmpl" if mode == "resume" else "claude-fresh.kdl.tmpl"
    tmpl = (LAYOUTS_DIR / tmpl_name).read_text(encoding="utf-8")
    rendered = tmpl.replace("__CWD__", worktree_path).replace("__NAME__", session)
    if mode == "resume" and uuid:
        rendered = rendered.replace("__UUID__", uuid)

    # Write to /tmp with mkstemp (mode 0600) for safety
    fd, kdl_path = tempfile.mkstemp(prefix="sp-", suffix=".kdl", dir="/tmp")
    try:
        os.write(fd, rendered.encode("utf-8"))
    finally:
        os.close(fd)

    # Spawn detached. Zellij needs a TTY to start, so we use `script` (allocates pty).
    # CRITICAL: use -n / --new-session-with-layout (NOT -l) for new sessions —
    # `-l` interprets as "add tab to existing session NAMED arg", which fails if session doesn't exist.
    # `-n` always creates a new session with the layout.
    inner = f"{shlex.quote(ZELLIJ_BIN)} -s {shlex.quote(session)} -n {shlex.quote(kdl_path)}"
    cmd = f"setsid script -qfc {shlex.quote(inner)} /dev/null </dev/null >/dev/null 2>&1 &"
    subprocess.Popen(["bash", "-c", cmd], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Schedule cleanup
    import threading
    def _cleanup():
        try: os.unlink(kdl_path)
        except OSError: pass
    threading.Timer(60.0, _cleanup).start()

    return {"ok": True, "method": "new-layout", "kdl_path": kdl_path}


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


HTML = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Worktree Dashboard</title>
<script>const ZELLIJ_WEB_URL_JS = '__ZELLIJ_WEB_URL__';</script>
<style>
  body { background: #0e0e10; color: #e6e6e6; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", monospace; margin: 0; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .meta { color: #888; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #2a2a2e; vertical-align: top; }
  th { background: #1c1c20; color: #aab; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  tr:hover td { background: #16161a; }
  .repo { color: #7dd3fc; font-weight: 600; }
  .branch { color: #fbbf24; font-family: monospace; }
  .branch.main { color: #22c55e; }
  .head { color: #888; font-family: monospace; font-size: 12px; }
  .path { color: #888; font-family: monospace; font-size: 12px; }
  .session.active { color: #22c55e; font-weight: 600; }
  .session.inactive { color: #555; }
  .open-link { display: inline-block; padding: 4px 10px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; }
  .open-link:hover { background: #1d4ed8; }
  .open-link.disabled { background: #333; color: #777; pointer-events: none; }
  .claude-sessions { font-size: 11px; color: #aaa; }
  .claude-sessions div { padding: 2px 0; border-top: 1px dashed #333; }
  .claude-sessions div:first-child { border: 0; }
  .claude-uuid { color: #f472b6; font-family: monospace; }
  .empty { text-align: center; color: #555; padding: 40px; }
  .refresh { float: right; padding: 6px 14px; background: #2a2a2e; color: #ddd; border: 1px solid #444; border-radius: 4px; cursor: pointer; }
  .status.live { color: #22c55e; font-weight: 700; animation: pulse 1.5s infinite; }
  .status.idle { color: #888; font-size: 11px; }
  .status.idle small { color: #666; font-size: 10px; }
  .status.none { color: #444; }
  .row-live td { background: rgba(34, 197, 94, 0.06) !important; }
  .row-live .repo { color: #4ade80; }
  .live-dot { color: #22c55e; animation: pulse 1.2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: #fbbf24; }
  td.last-msg { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; }
  td.ts { font-family: monospace; color: #888; font-size: 11px; white-space: nowrap; }
  td.num { text-align: right; color: #aaa; font-family: monospace; }
  .role-user { color: #60a5fa; font-weight: 600; }
  .role-assistant { color: #f472b6; font-weight: 600; }
  td.actions { white-space: nowrap; min-width: 130px; }
  .act-btn {
    display: inline-block; min-width: 28px; height: 28px; padding: 2px 6px;
    margin-right: 3px; border: 1px solid #444; border-radius: 4px;
    background: #2a2a2e; color: #ddd; cursor: pointer;
    text-align: center; line-height: 22px; text-decoration: none;
    font-size: 14px; transition: background 0.15s;
  }
  .act-btn:hover:not(.disabled):not(:disabled) { background: #3a3a3e; border-color: #666; }
  .act-btn.disabled, .act-btn:disabled { background: #1a1a1e; color: #555; cursor: not-allowed; border-color: #333; }
  .act-btn[href] { line-height: 22px; }
  .progress-wrap { background: #1a1a1e; border: 1px solid #333; border-radius: 4px; height: 6px; margin: 8px 0 16px; overflow: hidden; }
  .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); height: 100%; width: 0%; transition: width 0.3s ease; }
  .progress-text { color: #888; font-size: 11px; margin-bottom: 6px; }
  td.loading { color: #555; font-style: italic; font-size: 11px; }
  .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid #333; border-top-color: #fbbf24; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  td.git { font-size: 11px; white-space: nowrap; }
  .git-loading { color: #555; font-style: italic; }
  .git-na { color: #555; }
  .git-clean { color: #4ade80; }
  .git-add { color: #4ade80; }
  .git-mod { color: #fbbf24; }
  .git-del { color: #f87171; }
  .git-un  { color: #6b7280; }
  .git-ahead { color: #60a5fa; }
  .git-behind { color: #c084fc; }
  td.last-msg { cursor: pointer; }
  td.last-msg:hover { background: rgba(96, 165, 250, 0.06); }
  dialog#msgModal { background: #15161b; color: #d4d4d4; border: 1px solid #2a2a2e; border-radius: 6px; max-width: 720px; width: 70vw; max-height: 80vh; padding: 0; }
  dialog#msgModal::backdrop { background: rgba(0,0,0,0.6); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #2a2a2e; background: #1a1a1f; }
  .modal-body { padding: 14px; overflow-y: auto; max-height: calc(80vh - 50px); }
  .modal-close, .modal-nav { background: #2a2a2e; color: #d4d4d4; border: 1px solid #444; border-radius: 4px; padding: 2px 8px; cursor: pointer; margin-left: 4px; font-size: 12px; }
  .modal-close:hover, .modal-nav:hover { background: #3a3a3e; }
  .modal-nav:disabled { opacity: 0.4; cursor: not-allowed; }
  .msg-block { padding: 6px 0; border-bottom: 1px solid #2a2a2e; }
  .msg-block:last-child { border-bottom: none; }
  .msg-block.target { background: rgba(96, 165, 250, 0.08); padding: 8px; border-radius: 4px; }
  .msg-role { display: inline-block; font-weight: bold; font-size: 11px; margin-right: 6px; }
  .msg-role.user { color: #60a5fa; }
  .msg-role.assistant { color: #fbbf24; }
  .msg-ts { font-size: 10px; color: #666; margin-left: 6px; }
  .msg-text { margin-top: 4px; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
</style>
</head><body>
<h1>Worktree Dashboard <button class="refresh" onclick="hardReload()">↻ Refresh</button>
  <input id="filterInput" type="text" placeholder="/ to filter…"
    oninput="window._filterQuery = this.value; render();"
    style="margin-left:12px; background:#1a1a1f; color:#d4d4d4; border:1px solid #2a2a2e; border-radius:4px; padding:4px 8px; font-size:12px; width:240px;"
  /></h1>
<div class="meta" id="meta">Loading worktrees…</div>
<div class="progress-text" id="progressText"></div>
<div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
<table id="tbl"></table>
<dialog id="msgModal">
  <div class="modal-header">
    <strong id="msgModalTitle">Message viewer</strong>
    <span>
      <button class="modal-nav" id="msgModalPrev" title="Previous message (←)">◀</button>
      <button class="modal-nav" id="msgModalNext" title="Next message (→)">▶</button>
      <button class="modal-close" onclick="document.getElementById('msgModal').close()" title="Close (Esc)">✕</button>
    </span>
  </div>
  <div class="modal-body" id="msgModalBody">Loading…</div>
</dialog>
<script>
let _rows = [];          // current row state
let _wtById = {};        // id -> row reference

async function hardReload() {
  // Force re-fetch ignoring cache. Server itself caches 5/8s; we just retry.
  loadIndex();
}

// SWR-style cache in localStorage. Keyed by row.id, stores:
//   { mtime: <claude_max_mtime>, etag: 'W/"…"', data: {claude_sessions, claude_running_now, claude_last_modified} }
const CACHE_KEY_PREFIX = 'wtdash_v3_';

function cacheGet(id) {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + id) || 'null'); }
  catch { return null; }
}
function cacheSet(id, entry) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + id, JSON.stringify(entry)); } catch {}
}

function applyCachedClaude(row) {
  const cached = cacheGet(row.id);
  if (!cached) return false;
  const c = cached.data;
  Object.assign(row, c, {_claude_loaded: true, _from_cache: true, _cached_etag: cached.etag});
  const top = (c.claude_sessions || [])[0] || {};
  row._last_msg_text = top.last_message || top.first_message || '';
  row._last_msg_role = top.last_message_role || '';
  row._last_msg_ts = top.last_message_ts || c.claude_last_modified || '';
  row._msg_count = top.msg_count || 0;
  row._age_sec = top.age_sec ?? 9e9;
  return true;
}

async function loadIndex() {
  setProgress(0, 'Loading worktree index…');
  try {
    const r = await fetch('/api/index', {cache: 'no-store'});
    const data = await r.json();
    document.getElementById('meta').textContent =
      `${data.rows.length} worktrees · ${data.all_zellij_sessions.length} live Zellij sessions · generated ${data.generated_at}`;
    if (data.rows.length === 0) {
      document.getElementById('tbl').innerHTML = '<tr><td class="empty">No git worktrees found.</td></tr>';
      setProgress(100, 'Done');
      return;
    }
    // Init rows. Pull data from cache instantly per row.
    _rows = data.rows.map(r => {
      const merged = Object.assign({}, r, {
        claude_sessions: [],
        claude_running_now: false,
        claude_last_modified: null,
        _claude_loaded: false,
      });
      // Rows without Claude history are "loaded" immediately — nothing to fetch
      if (!r.has_claude_history) merged._claude_loaded = true;
      applyCachedClaude(merged); // fills from localStorage if available
      return merged;
    });
    _wtById = {};
    _rows.forEach(r => _wtById[r.id] = r);
    if (!window._sortBy) { window._sortBy = '_last_msg_ts'; window._sortDir = 'desc'; }
    render(); // INSTANT render with whatever's in cache
    enrichClaude();  // revalidate only what's stale
  } catch (e) {
    setProgress(0, 'Failed: ' + e.message);
  }
}

async function enrichClaude() {
  // SWR: skip rows whose server-reported mtime matches our cached mtime AND we have data
  const stale = _rows.filter(row => {
    if (!row.has_claude_history) return false;            // never had Claude — skip
    const cached = cacheGet(row.id);
    if (!cached) return true;                              // no cache — must fetch
    if (cached.mtime !== row.claude_max_mtime) return true;// changed — must fetch
    return false;                                          // cache fresh, skip
  });
  const total = stale.length;
  if (total === 0) {
    const cached = _rows.filter(r => r._from_cache && r.has_claude_history).length;
    const noHist = _rows.filter(r => !r.has_claude_history).length;
    setProgress(100, `Instant: ${cached} from cache · ${noHist} no history · 0 fetched`);
    setTimeout(clearProgress, 2000);
    return;
  }
  let done = 0;
  // Compute real categories
  const totalRows = _rows.length;
  const noHistory = _rows.filter(r => !r.has_claude_history).length;
  const fromCache = _rows.filter(r => r._from_cache && r.has_claude_history).length;
  setProgress(0, `Fetching ${total} stale · ${fromCache} from cache · ${noHistory} no history`);
  const queue = [...stale];
  const workers = Array(4).fill(0).map(async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const cached = cacheGet(row.id);
        const headers = {};
        if (cached?.etag) headers['If-None-Match'] = cached.etag;
        const r = await fetch('/api/claude?path=' + encodeURIComponent(row.worktree_path), {cache: 'no-store', headers});
        if (r.status === 304 && cached) {
          // Server confirmed: nothing changed. Just use cache.
          applyCachedClaude(row);
        } else {
          const c = await r.json();
          Object.assign(row, c, {_claude_loaded: true, _from_cache: false});
          const top = (c.claude_sessions || [])[0] || {};
          row._last_msg_text = top.last_message || top.first_message || '';
          row._last_msg_role = top.last_message_role || '';
          row._last_msg_ts = top.last_message_ts || c.claude_last_modified || '';
          row._msg_count = top.msg_count || 0;
          row._age_sec = top.age_sec ?? 9e9;
          // Persist
          cacheSet(row.id, {mtime: c.claude_max_mtime, etag: c.etag, data: {
            claude_sessions: c.claude_sessions,
            claude_running_now: c.claude_running_now,
            claude_last_modified: c.claude_last_modified,
          }});
        }
      } catch (e) {
        row._claude_loaded = true;
        row._error = e.message;
      }
      done++;
      setProgress((done / total) * 100, `Fetching (${done}/${total}) · ${fromCache} from cache · ${noHistory} no history`);
      if (done % 3 === 0 || done === total) render();
    }
  });
  await Promise.all(workers);
  setProgress(100, `Done · ${total} fetched, ${fromCache} from cache`);
  setTimeout(clearProgress, 2000);
  // Fire-and-forget git_status enrichment — independent of claude data, no
  // SWR cache (fresh on every poll). Errors are tolerated (row._git_status = null).
  enrichGitStatus();
}

async function enrichGitStatus() {
  const rows = [..._rows];
  const queue = [...rows];
  const workers = Array(4).fill(0).map(async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const r = await fetch('/api/git-status?path=' + encodeURIComponent(row.worktree_path), {cache: 'no-store'});
        row._git_status = await r.json();
        row._git_dirty_total = (row._git_status.added||0) + (row._git_status.modified||0) + (row._git_status.deleted||0) + (row._git_status.untracked||0);
      } catch (e) {
        row._git_status = {error: e.message};
        row._git_dirty_total = 0;
      }
    }
  });
  await Promise.all(workers);
  render();
}

function clearProgress() {
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '';
}

function setProgress(pct, label) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = label || '';
}

let _msgModalState = null;  // {worktree, session, total, index}
async function openMsgModal(worktree, session, index) {
  const modal = document.getElementById('msgModal');
  document.getElementById('msgModalTitle').textContent = `${session.slice(0,8)} · message ${index}`;
  document.getElementById('msgModalBody').textContent = 'Loading…';
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  try {
    const url = `/api/message?path=${encodeURIComponent(worktree)}&session=${encodeURIComponent(session)}&index=${index}&context=2`;
    const r = await fetch(url, {cache: 'no-store'});
    const d = await r.json();
    if (d.error) {
      document.getElementById('msgModalBody').textContent = `Error: ${d.error}`;
      return;
    }
    _msgModalState = {worktree, session, total: d.total, index};
    renderMsgModal(d);
  } catch (e) {
    document.getElementById('msgModalBody').textContent = `Error: ${e.message}`;
  }
}
function renderMsgModal(d) {
  const body = document.getElementById('msgModalBody');
  body.innerHTML = d.messages.map(m => {
    const isTarget = m.idx === d.target_index;
    return `<div class="msg-block ${isTarget ? 'target' : ''}">
      <span class="msg-role ${m.role}">${m.role}#${m.idx}</span>
      <span class="msg-ts">${escapeHtml(m.ts || '')}</span>
      <div class="msg-text">${escapeHtml(m.text)}</div>
    </div>`;
  }).join('');
  document.getElementById('msgModalPrev').disabled = _msgModalState.index <= 0;
  document.getElementById('msgModalNext').disabled = _msgModalState.index >= _msgModalState.total - 1;
  document.getElementById('msgModalTitle').textContent =
    `${_msgModalState.session.slice(0,8)} · message ${_msgModalState.index} / ${_msgModalState.total - 1}`;
}
async function navMsg(delta) {
  if (!_msgModalState) return;
  const next = _msgModalState.index + delta;
  if (next < 0 || next >= _msgModalState.total) return;
  _msgModalState.index = next;
  const url = `/api/message?path=${encodeURIComponent(_msgModalState.worktree)}&session=${encodeURIComponent(_msgModalState.session)}&index=${next}&context=2`;
  const r = await fetch(url, {cache: 'no-store'});
  const d = await r.json();
  if (!d.error) renderMsgModal(d);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('msgModalPrev')?.addEventListener('click', () => navMsg(-1));
  document.getElementById('msgModalNext')?.addEventListener('click', () => navMsg(+1));
  document.addEventListener('keydown', (e) => {
    const open = document.getElementById('msgModal')?.open;
    if (!open) return;
    if (e.key === 'ArrowLeft') navMsg(-1);
    if (e.key === 'ArrowRight') navMsg(+1);
  });
});

function render() {
  applySort(_rows);
  const _filtered = applyFilter(_rows);
  let html = `<thead><tr>
    ${sortHdr('Status', 'claude_running_now')}
    ${sortHdr('Repo', 'repo')}
    ${sortHdr('Branch', 'branch')}
    ${sortHdr('HEAD', 'head')}
    ${sortHdr('Worktree path', 'worktree_path')}
    ${sortHdr('Last activity', '_last_msg_ts')}
    ${sortHdr('Last message', '_last_msg_text')}
    ${sortHdr('Msgs', '_msg_count')}
    ${sortHdr('Git', '_git_dirty_total')}
    ${sortHdr('Zellij session', 'session_name')}
    <th>Action</th>
  </tr></thead><tbody>`;
  for (const row of _filtered) {
    let status;
    if (!row._claude_loaded) status = '<span class="spinner"></span>';
    else if (row.claude_running_now) status = '<span class="status live">● LIVE</span>';
    else if (row.claude_last_modified) {
      const ageMin = Math.floor((Date.now()/1000 - new Date(row.claude_last_modified).getTime()/1000) / 60);
      status = `<span class="status idle">idle ${formatIdle(ageMin)}</span>`;
    }
    else status = '<span class="status none">—</span>';
    const top = (row.claude_sessions || [])[0];
    const lastTs = top?.last_message_ts || row.claude_last_modified || '';
    const lastText = top?.last_message || top?.first_message || '';
    const role = top?.last_message_role || '';
    const loadingCell = !row._claude_loaded ? 'loading' : '';
    html += `<tr class="${row.claude_running_now ? 'row-live' : ''}">
      <td>${status}</td>
      <td class="repo">${escapeHtml(row.repo)}${row.is_main_worktree ? ' <span style="color:#888">(main)</span>' : ''}</td>
      <td class="branch ${row.branch === 'main' || row.branch === 'master' ? 'main' : ''}">${escapeHtml(row.branch)}</td>
      <td class="head">${escapeHtml(row.head)}</td>
      <td class="path" title="${escapeHtml(row.worktree_path)}">${escapeHtml(row.worktree_path)}</td>
      <td class="ts ${loadingCell}">${row._claude_loaded ? escapeHtml(lastTs ? lastTs.replace('T',' ').slice(0, 19) : '—') : '…'}</td>
      <td class="last-msg ${loadingCell}" ${top?.uuid ? `onclick="openMsgModal(${JSON.stringify(row.worktree_path)}, ${JSON.stringify(top.uuid)}, ${(top.msg_count || 1) - 1})" title="Click to view full message + neighbours"` : ''}>${row._claude_loaded ? (role ? `<span class="role-${role}">${role}:</span> ` : '') + escapeHtml(lastText) : 'scanning JSONL…'}</td>
      <td class="num">${row._claude_loaded ? (top?.msg_count ?? '—') : '…'}</td>
      <td class="git" id="git-${escapeHtml(row.worktree_path)}">${formatGitStatus(row._git_status)}</td>
      <td class="session ${row.session_active ? 'active' : 'inactive'}">${escapeHtml(row.session_name)}${row.session_active ? ' ●' : ''}</td>
      <td class="actions">
        ${(() => {
          const top = (row.claude_sessions || [])[0];
          const uuid = top?.uuid;
          const canResume = !!uuid;
          const sess = encodeURIComponent(row.session_name);
          const wt = encodeURIComponent(row.worktree_path);
          const zURL = `${ZELLIJ_WEB_URL_JS}/?session=${sess}`;
          return `
            <button class="act-btn ${canResume ? '' : 'disabled'}" title="Resume claude --resume ${uuid?.slice(0,8) || '?'}…"
                    ${canResume ? `onclick="actLaunch(this, ${JSON.stringify(row.worktree_path)}, ${JSON.stringify(row.session_name)}, 'resume', ${JSON.stringify(uuid)})"` : 'disabled'}>▶</button>
            <button class="act-btn" title="Fresh claude (no resume) in ${row.worktree_path}"
                    onclick="actLaunch(this, ${JSON.stringify(row.worktree_path)}, ${JSON.stringify(row.session_name)}, 'fresh', null)">✨</button>
            <button class="act-btn" title="Open in VSCode/Cursor (code ${row.worktree_path})"
                    onclick="actVSCode(this, ${JSON.stringify(row.worktree_path)})">📂</button>
            <a class="act-btn" title="Open Zellij Web Client (no command injection — for revisiting running session)"
               href="${zURL}" target="_blank" rel="noopener">🪟</a>
          `;
        })()}
      </td>
    </tr>`;
  }
  html += '</tbody>';
  document.getElementById('tbl').innerHTML = html;
  // Reflect filter state in meta
  const meta = document.getElementById('meta');
  if (meta && window._filterQuery) {
    meta.textContent = `${_filtered.length} of ${_rows.length} worktrees (filter: "${window._filterQuery}")`;
  }
}
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatIdle(totalMin) {
  // Human-readable idle duration. <60m: "Nm". <24h: "Nh Mm". >=24h: "Nd Hh Mm".
  const m = Math.max(0, Math.floor(totalMin));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h < 24) return mins ? `${h}h ${mins}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hours = h % 24;
  return mins ? `${d}d ${hours}h ${mins}m` : (hours ? `${d}d ${hours}h` : `${d}d`);
}
function formatGitStatus(s) {
  // Compact one-cell git status: "+A ~M -D ?U / ↑K ↓L". Falls back to '…' or '—'.
  if (s === undefined) return '<span class="git-loading">…</span>';
  if (!s || s.error) return '<span class="git-na" title="' + (s?.error || 'unknown') + '">—</span>';
  const dirty = (s.added||0) + (s.modified||0) + (s.deleted||0) + (s.untracked||0);
  const parts = [];
  if (s.added)     parts.push(`<span class="git-add">+${s.added}</span>`);
  if (s.modified)  parts.push(`<span class="git-mod">~${s.modified}</span>`);
  if (s.deleted)   parts.push(`<span class="git-del">-${s.deleted}</span>`);
  if (s.untracked) parts.push(`<span class="git-un">?${s.untracked}</span>`);
  if (dirty === 0) parts.push('<span class="git-clean">clean</span>');
  if (s.ahead)  parts.push(`<span class="git-ahead">↑${s.ahead}</span>`);
  if (s.behind) parts.push(`<span class="git-behind">↓${s.behind}</span>`);
  return parts.join(' ');
}
// Multi-key sort stack: array of {key, dir}. shift+click appends/cycles; plain click replaces.
// Persisted to _sortStack for compatibility with old _sortBy reads.
function sortHdr(label, key) {
  const stack = window._sortStack || [];
  const idx = stack.findIndex(e => e.key === key);
  let arrow = '';
  if (idx >= 0) {
    const e = stack[idx];
    const dirGlyph = e.dir === 'asc' ? '▲' : '▼';
    arrow = stack.length > 1 ? ` ${dirGlyph}${idx + 1}` : ` ${dirGlyph}`;
  }
  return `<th class="sortable" onclick="setSort('${key}', event.shiftKey)">${label}${arrow}</th>`;
}
function setSort(key, additive) {
  if (!window._sortStack) window._sortStack = [];
  const stack = window._sortStack;
  const idx = stack.findIndex(e => e.key === key);
  if (additive) {
    if (idx >= 0) {
      // already in stack — toggle dir on the existing position
      stack[idx].dir = stack[idx].dir === 'asc' ? 'desc' : 'asc';
    } else {
      stack.push({key, dir: 'desc'});
    }
  } else {
    if (stack.length === 1 && idx === 0) {
      stack[0].dir = stack[0].dir === 'asc' ? 'desc' : 'asc';
    } else {
      window._sortStack = [{key, dir: 'desc'}];
    }
  }
  // legacy refs
  const primary = window._sortStack[0];
  window._sortBy = primary?.key;
  window._sortDir = primary?.dir;
  render();
}
function applySort(rows) {
  const stack = window._sortStack && window._sortStack.length ? window._sortStack : [{key: '_last_msg_ts', dir: 'desc'}];
  rows.sort((a, b) => {
    for (const {key, dir} of stack) {
      const sign = dir === 'asc' ? 1 : -1;
      let av = a[key], bv = b[key];
      if (typeof av === 'boolean') av = av ? 1 : 0;
      if (typeof bv === 'boolean') bv = bv ? 1 : 0;
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (av < bv) return -1 * sign;
      if (av > bv) return  1 * sign;
    }
    return 0;
  });
}

// Vi-style `/` filter — focuses input, substring-matches across repo/branch/path/last-msg.
window._filterQuery = '';
function applyFilter(rows) {
  const q = (window._filterQuery || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => {
    const hay = [r.repo, r.branch, r.head, r.worktree_path, r._last_msg_text, r.session_name]
      .filter(x => typeof x === 'string').join(' ').toLowerCase();
    return hay.includes(q);
  });
}
document.addEventListener('keydown', (e) => {
  // Don't hijack typing in inputs
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    if (e.key === 'Escape' && e.target.id === 'filterInput') {
      e.target.value = '';
      window._filterQuery = '';
      e.target.blur();
      render();
    }
    return;
  }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const inp = document.getElementById('filterInput');
    if (inp) inp.focus();
  }
});
loadIndex();
setInterval(loadIndex, 30000);

// Refresh on tab focus (Chrome throttles setInterval on hidden tabs)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setProgress(0, 'Tab focused — refreshing…');
    loadIndex();
  }
});

// Force-clear cache button (for SWR debugging / stale states)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'Backspace') {
    Object.keys(localStorage).filter(k => k.startsWith('wtdash_v3_')).forEach(k => localStorage.removeItem(k));
    setProgress(0, 'Cache cleared. Reloading…');
    loadIndex();
  }
});

// Action button handlers — Phase 3
async function actLaunch(btn, worktree_path, session_name, mode, uuid) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch('/api/launch', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({worktree_path, session_name, mode, uuid}),
    });
    const data = await r.json();
    if (!data.ok) {
      alert('Launch failed: ' + (data.error || JSON.stringify(data)));
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
      return;
    }
    btn.textContent = '✓';
    // Open Zellij URL in new tab. mcp__claude-in-chrome__navigate (when available)
    // would be preferred but is only callable from Claude Code agent context.
    // From browser JS we use window.open which is best-effort.
    window.open(data.url, '_blank', 'noopener');
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    // Trigger refresh to update LIVE indicator
    setTimeout(loadIndex, 2000);
  } catch (e) {
    alert('Network error: ' + e.message);
    btn.textContent = '❌';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
}

async function actVSCode(btn, path) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch('/api/open-vscode', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path}),
    });
    const data = await r.json();
    btn.textContent = data.ok ? '✓' : '❌';
    if (!data.ok) alert('VSCode launch failed: ' + (data.error || ''));
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  } catch (e) {
    btn.textContent = '❌'; alert('Network error: ' + e.message);
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
}
</script>
</body></html>
"""


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

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html_rendered = HTML.replace("__ZELLIJ_WEB_URL__", ZELLIJ_WEB_URL)
            self.wfile.write(html_rendered.encode("utf-8"))
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


def diagnose_livecycle(worktree_path: str) -> int:
    """Diagnostic CLI: dump every encoding variant + glob match + per-file mtime for a worktree.

    Usage: python server.py --diagnose-livecycle /mnt/d/repos/lm-saas
    """
    print(f"=== diagnose-livecycle for: {worktree_path}")
    variants = encode_path_for_claude(worktree_path)
    print(f"\nEncoding variants ({len(variants)}):")
    for v in sorted(set(variants)):
        print(f"  - {v}")

    print(f"\nClaude project base dirs ({len(CLAUDE_PROJECTS_DIRS)}):")
    for d in CLAUDE_PROJECTS_DIRS:
        exists = "✓ exists" if d.exists() else "✗ missing"
        print(f"  - {d}  [{exists}]")

    now = time.time()
    total_jsonls = 0
    matches: list[dict] = []
    for base in CLAUDE_PROJECTS_DIRS:
        if not base.exists():
            continue
        for proj in base.iterdir():
            name = proj.name
            match = (
                name in variants
                or any(name.endswith(v.lstrip("-")) for v in variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in variants if len(name) > 8)
            )
            if not match:
                continue
            for jsonl in proj.glob("*.jsonl"):
                try:
                    st = jsonl.stat()
                    age = now - st.st_mtime
                    matches.append({
                        "path": str(jsonl), "size": st.st_size,
                        "mtime": st.st_mtime, "age_sec": int(age),
                    })
                    total_jsonls += 1
                except OSError:
                    pass

    print(f"\nMatched JSONLs ({len(matches)}):")
    matches.sort(key=lambda m: m["age_sec"])
    for m in matches[:20]:
        live_marker = "🟢 LIVE" if m["age_sec"] < RUNNING_THRESHOLD_SEC else f"   {m['age_sec']}s"
        print(f"  {live_marker:10s}  {m['size']:>8}b  {m['path']}")
    if len(matches) > 20:
        print(f"  ... and {len(matches) - 20} more")

    if not matches:
        print(f"\n❌ NO MATCHES — investigate. Encoding variants don't match any Claude project dir name.")
        print(f"   List Claude project dirs found:")
        for base in CLAUDE_PROJECTS_DIRS:
            if base.exists():
                names = sorted([p.name for p in base.iterdir() if p.is_dir()])[:30]
                print(f"   {base}:")
                for n in names:
                    print(f"     {n}")
        return 1

    youngest = matches[0]["age_sec"]
    print(f"\nVerdict:")
    if youngest < RUNNING_THRESHOLD_SEC:
        print(f"  🟢 LIVE — youngest JSONL is {youngest}s old (< {RUNNING_THRESHOLD_SEC}s threshold)")
    else:
        print(f"  ⚪ idle — youngest JSONL is {youngest}s old (> {RUNNING_THRESHOLD_SEC}s threshold)")
        print(f"     If you're actively typing, raise threshold via: LIVE_THRESHOLD_SEC=300 python server.py")

    return 0


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
