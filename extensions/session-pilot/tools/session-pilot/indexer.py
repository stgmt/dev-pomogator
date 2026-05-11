"""Worktree + Claude JSONL indexer — extracted from server.py (Phase 5 refactor).

Functions read from `server` module via late binding (`import server` at
call time) so test monkey-patches on `server.CLAUDE_PROJECTS_DIRS` /
`server.ZELLIJ_WEB_URL` / `server._whitelisted_paths` continue to reach
the real call site.

Public surface:
  - discover_repos() — scan filesystem for git repos
  - git_worktree_list(repo) — `git worktree list --porcelain` parse
  - zellij_sessions() — `zellij list-sessions` parse
  - claude_sessions_for(worktree_path) — full JSONL scan + head/tail/count
  - claude_max_mtime_for(worktree_path) — cheap mtime-only (cached)
  - build_worktree_index() — repos × git worktrees × zellij + max_mtime
  - build_claude_for_path(worktree_path) — full claude data + etag
  - build_index_cached() / build_claude_cached() — 5s/8s memoization
  - messages_for_session(...) — single-pass JSONL slice
  - git_status_for(worktree_path) — porcelain v1 + ahead/behind count
"""

import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path


# Cache state (module-level, shared across calls)
_index_cache: dict = {"ts": 0.0, "data": None}
_claude_cache: dict = {}
_mtime_cache: dict = {}
CACHE_TTL_INDEX = 5.0
CACHE_TTL_CLAUDE = 8.0
_MTIME_TTL = 2.0


def discover_repos() -> list[Path]:
    """Find git **main** worktrees (not linked worktrees) under scan roots.

    Linked git worktrees have `.git` as a file (gitdir pointer) — including
    those produces N×M cartesian explosion in `build_worktree_index` because
    each linked worktree's `git worktree list` returns ALL siblings. Filter
    on `.git` being a directory to keep only main worktrees.
    """
    repos: list[Path] = []
    explicit = os.environ.get("REPOS")
    if explicit:
        # Use os.pathsep — ':' clashes with Windows drive letters (C:/...).
        for p in explicit.split(os.pathsep):
            if not p:
                continue
            p = Path(p)
            if p.is_dir() and (p / ".git").is_dir():
                repos.append(p)
        return repos
    candidates = [Path.home() / "repos", Path("/mnt/d/repos"), Path("/mnt/c/repos")]
    for root in candidates:
        if not root.exists():
            continue
        for child in root.iterdir():
            if child.is_dir() and (child / ".git").is_dir():
                repos.append(child)
    return repos


def git_worktree_list(repo: Path) -> list[dict]:
    """Run `git worktree list --porcelain` and parse output."""
    try:
        out = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=str(repo), capture_output=True, text=True, check=False, timeout=10,
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
                wt["branch"] = line[len("branch "):].replace("refs/heads/", "")
            elif line == "detached":
                wt["branch"] = "(detached)"
            elif line == "bare":
                wt["bare"] = True
        if wt.get("path"):
            worktrees.append(wt)
    return worktrees


def zellij_sessions() -> list[str]:
    """v0.3: Zellij удалён. Stub возвращает [] чтобы build_worktree_index
    не ломался при чтении server.zellij_sessions(). Удалить целиком когда
    build_worktree_index перестанет вызывать."""
    return []


def claude_sessions_for(worktree_path: str) -> dict:
    """Look up Claude JSONLs for this worktree across Claude project dirs.

    Returns {sessions, running_now, last_modified}. Top 5 sessions sorted by
    mtime desc. Each session has head/tail parse + msg_count.
    """
    import server
    encoded_variants = set(server.encode_path_for_claude(worktree_path))
    sessions: list[dict] = []
    now = time.time()
    last_mtime = 0.0
    running_now = False
    for base_dir in server.CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists():
            continue
        for proj_dir in base_dir.iterdir():
            name = proj_dir.name
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
                    if (now - stat.st_mtime) < server.RUNNING_THRESHOLD_SEC:
                        running_now = True
                    first_msg = ""; last_msg = ""; last_msg_role = ""; last_msg_ts = ""; msg_count = 0
                    with open(jsonl, "rb") as f:
                        head_bytes = f.read(64 * 1024)
                        f.seek(0, 2); size = f.tell()
                        f.seek(max(0, size - 256 * 1024))
                        tail_bytes = f.read()
                    # msg_count = user/assistant сообщения С НЕПУСТЫМ текстом.
                    # Claude Code пишет в JSONL много шума: system/attachment chrome,
                    # а ещё user/assistant сообщения где content — это tool_use или
                    # tool_result блоки без текста. Всё это не имеет смысла для
                    # «Last message» модалки — UI хочет реальные обмены.
                    with open(jsonl, "r", encoding="utf-8", errors="ignore") as f:
                        for line in f:
                            line = line.strip()
                            if not line: continue
                            try:
                                lobj = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            if lobj.get("type") not in ("user", "assistant"):
                                continue
                            lc = lobj.get("message", {}).get("content", "")
                            if isinstance(lc, list):
                                ltxt = " ".join(p.get("text", "") for p in lc if isinstance(p, dict) and p.get("type") == "text").strip()
                            else:
                                ltxt = lc.strip() if isinstance(lc, str) else ""
                            if ltxt:
                                msg_count += 1
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


def _claude_max_mtime_uncached(worktree_path: str) -> float:
    import server
    encoded_variants = set(server.encode_path_for_claude(worktree_path))
    max_mtime = 0.0
    for base_dir in server.CLAUDE_PROJECTS_DIRS:
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


def claude_max_mtime_for(worktree_path: str) -> float:
    """Cached 2s — max mtime across all matching JSONLs."""
    now = time.time()
    e = _mtime_cache.get(worktree_path)
    if e and (now - e["ts"]) < _MTIME_TTL:
        return e["m"]
    m = _claude_max_mtime_uncached(worktree_path)
    _mtime_cache[worktree_path] = {"ts": now, "m": m}
    return m


def build_worktree_index() -> dict:
    """Fast: git worktree list + per-path mtime; no JSONL parse. v0.3 — no Zellij.

    Invariant: each `worktree_path` appears at most once in `rows`. Even after
    `discover_repos` filters to main worktrees only, defensive dedup guards
    against scan-root overlap (e.g. ~/repos and /mnt/d/repos pointing at the
    same physical tree).
    """
    repos = discover_repos()
    rows = []
    seen_paths: set[str] = set()
    for repo in repos:
        repo_name = repo.name
        for wt in git_worktree_list(repo):
            if "error" in wt: continue
            wt_path = wt.get("path", "")
            if not wt_path or wt_path in seen_paths:
                continue
            seen_paths.add(wt_path)
            branch = wt.get("branch", "(unknown)")
            head = wt.get("head", "")[:7]
            mtime = claude_max_mtime_for(wt_path)
            rows.append({
                "id": f"{repo_name}__{branch}__{wt_path}",
                "repo": repo_name,
                "repo_path": str(repo),
                "branch": branch,
                "head": head,
                "worktree_path": wt_path,
                "is_main_worktree": str(repo) == wt_path,
                # v0.3: session_name/session_active/session_attach_url отсутствуют — нет Zellij
                "claude_max_mtime": int(mtime),
                "has_claude_history": mtime > 0,
            })
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rows": rows,
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


def messages_for_session(worktree_path: str, session_uuid: str, index: int, context: int = 2) -> dict:
    """Read JSONL, filter to user/assistant only, return slice around `index`.

    `index` and the returned `target_index` / `total` are in the
    **user/assistant-only frame** — not in raw-JSONL-line-frame. Claude Code
    interleaves user/assistant messages with system/attachment chrome that
    has no readable text (or has tool-result blobs unrelated to the human
    conversation). For the dashboard "Last message" modal we want a clean
    conversation timeline, not raw JSONL.

    Returns:
      {messages: [{idx, role, text, ts}], total, target_index}
      where idx is the position in the user/assistant subsequence.
    """
    import server
    if worktree_path not in server._whitelisted_paths():
        return {"error": "path not in whitelist"}
    encoded_variants = set(server.encode_path_for_claude(worktree_path))
    target_path: Path | None = None
    for base_dir in server.CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists(): continue
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
        if target_path: break
    if not target_path:
        return {"error": f"session {session_uuid} not found for {worktree_path}"}

    # Pass 1: enumerate user/assistant messages WITH non-empty text. Claude
    # Code stores some user/assistant lines as pure tool_use / tool_result
    # blocks with no readable text — those would render as empty bubbles in
    # the modal (the bug pattern: assistant#4374 with msg-text="").
    ua_messages: list[dict] = []
    with target_path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") not in ("user", "assistant"):
                continue
            content = obj.get("message", {}).get("content", "")
            if isinstance(content, list):
                text = " ".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text").strip()
            else:
                text = content.strip() if isinstance(content, str) else ""
            if not text:
                continue  # skip tool-only turns — no human-readable content
            ua_messages.append({"role": obj.get("type", ""), "text": text, "ts": obj.get("timestamp", "")})

    total = len(ua_messages)
    if total == 0:
        return {"messages": [], "total": 0, "target_index": 0}

    # Clamp index into UA frame (frontend may pass stale msg_count - 1)
    if index < 0: index = 0
    if index >= total: index = total - 1
    lo = max(0, index - context)
    hi = min(total - 1, index + context)
    messages = [{"idx": i, **ua_messages[i]} for i in range(lo, hi + 1)]
    return {"messages": messages, "total": total, "target_index": index}


def git_status_for(worktree_path: str) -> dict:
    """Porcelain v1 status + ahead/behind count vs @{upstream}."""
    import server
    if worktree_path not in server._whitelisted_paths():
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
        if not line: continue
        x, y = line[0], line[1]
        if x == "?" or y == "?":
            untracked += 1; continue
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
    return {"added": added, "modified": modified, "deleted": deleted, "untracked": untracked, "ahead": ahead, "behind": behind}
