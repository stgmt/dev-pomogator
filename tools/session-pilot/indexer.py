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


# Message-preview cleanup (first_message / last_message). Assistant replies often
# start with a ```json fence or span many lines, so a raw txt[:140] slice shows
# "```json { "reason": ..." garbage in the dashboard "Last message" column. Drop
# the fence markers + language tag (keep the body) and flatten whitespace to one
# line before truncating.
_FENCE_RE = re.compile(r"```+[a-zA-Z0-9_+-]*")
_WS_RE = re.compile(r"\s+")


def _clean_preview(text: str, limit: int = 140) -> str:
    if not text:
        return ""
    cleaned = _FENCE_RE.sub(" ", text)
    cleaned = _WS_RE.sub(" ", cleaned).strip()
    return cleaned[:limit]


# Preview-format version — folded into the /api/claude ETag. The ETag is otherwise
# mtime-only, so an idle session (unchanged JSONL) keeps returning 304 and the
# client never picks up a change in HOW previews are rendered. Bump this whenever
# _clean_preview's output format changes so stale 304s are invalidated. Keep in
# sync with frontend.py CACHE_KEY_PREFIX (localStorage) version bump.
_PREVIEW_FORMAT_VERSION = "p2"


# Cache state (module-level, shared across calls)
_index_cache: dict = {"ts": 0.0, "data": None}
_claude_cache: dict = {}
_mtime_cache: dict = {}
CACHE_TTL_INDEX = 5.0
CACHE_TTL_CLAUDE = 8.0
_MTIME_TTL = 2.0


# ── Headless-session filter ───────────────────────────────────────────────────
# Hide programmatic Claude sessions (Claude Agent SDK / `claude -p`, e.g. a
# LangGraph pipeline) from the worktree dashboard. They are real sessions but
# not human worktree work: a single eval/fan-out run spawns hundreds of them at
# a container cwd (e.g. /app), which flood the list, all read LIVE (just written),
# and overload render.
#
# Discriminator (data-verified, 100% clean on real host: 338/338 SDK sessions vs
# 0 in every interactive worktree dir): the JSONL carries `entrypoint:"cli"` for
# interactive CLI sessions and `entrypoint:"sdk-ts"` (any `sdk-*`) for SDK ones.
# We hide ONLY sessions we can POSITIVELY identify as `sdk-*`; unknown/missing
# entrypoint defaults to SHOW — never hide a session we can't prove is headless
# (that would hide real devcontainer work, the exact thing the user warned about).
# Override: SP_SHOW_HEADLESS=1 re-includes them (debugging).
_headless_cache: dict = {}  # str(path) -> bool (session origin is immutable per file)
_HEAD_WINDOW = 64 * 1024
_DEEP_CAP = 2 * 1024 * 1024  # bound deep scan; real SDK entrypoint sits ≤ ~1.1MB in

# Markers. Claude Code writes compact JSON (no spaces), but allow optional
# whitespace around ':' so the detector is robust to any serializer variant.
_MARK_PERM = re.compile(rb'"type"\s*:\s*"permission-mode"')  # interactive UI line — at top
_MARK_MODE = re.compile(rb'"type"\s*:\s*"mode"')             # interactive mode line — at top
_MARK_CLI = re.compile(rb'"entrypoint"\s*:\s*"cli"')         # interactive CLI entrypoint
_MARK_SDK = re.compile(rb'"entrypoint"\s*:\s*"sdk')          # SDK / `claude -p` (sdk-ts, ...)


def _hide_headless() -> bool:
    """Read env each call so tests/runtime toggles take effect without restart."""
    return os.environ.get("SP_SHOW_HEADLESS") != "1"


def _detect_headless(jsonl_path) -> bool:
    """True iff session is programmatic SDK / `claude -p` (vs interactive CLI).

    Interactive CLI sessions write a `permission-mode`/`mode` UI-state line at the
    very top (real data: byte offset <250) and `entrypoint:"cli"`. SDK/headless
    sessions never emit the UI lines and carry `entrypoint:"sdk-*"` — but that
    field can sit up to ~1.1MB in when the first message is huge (eval prompts
    embedding source.json). So: a cheap 64KB head resolves the common case
    (interactive markers OR shallow sdk); only when the head is marker-less do we
    read deeper to positively find `entrypoint:"sdk`. A file with NO entrypoint
    anywhere (minimal/legacy/unknown) defaults to SHOW — never hide on a guess.
    """
    try:
        with open(jsonl_path, "rb") as f:
            head = f.read(_HEAD_WINDOW)
            if _MARK_PERM.search(head) or _MARK_MODE.search(head) or _MARK_CLI.search(head):
                return False  # interactive — show
            if _MARK_SDK.search(head):
                return True   # headless — hide (shallow case)
            # Ambiguous: no markers in head. Could be a deep-entrypoint SDK session
            # (huge first message) OR a minimal session with no entrypoint at all.
            rest = f.read(_DEEP_CAP - _HEAD_WINDOW)
        blob = head + rest
        if _MARK_SDK.search(blob):
            return True       # headless confirmed deeper in
        return False          # entrypoint:"cli" deep, or no entrypoint → show
    except OSError:
        return False          # unreadable → don't hide (safe default)


def _is_headless_session(jsonl_path) -> bool:
    """Cached wrapper for `_detect_headless` (session origin never changes)."""
    key = str(jsonl_path)
    cached = _headless_cache.get(key)
    if cached is not None:
        return cached
    val = _detect_headless(jsonl_path)
    _headless_cache[key] = val
    return val


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
                if _hide_headless() and _is_headless_session(jsonl):
                    continue  # skip SDK / `claude -p` sessions (keep /api/claude consistent with index)
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
                                first_msg = _clean_preview(txt); break
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
                                last_msg = _clean_preview(txt)
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
    # FR-26: drop [:5] cap so /api/claude returns ALL sessions; frontend uses
    # the list as a lookup table to enrich per-session rows from /api/index
    # (rows now exploded 1-per-JSONL-UUID — see build_session_index).
    return {
        "sessions": sessions,
        "running_now": running_now,
        "last_modified": datetime.fromtimestamp(last_mtime).isoformat(timespec="seconds") if last_mtime else None,
    }


def _claude_jsonls_lightweight(worktree_path: str) -> list[dict]:
    """FR-26: enumerate ALL JSONL files for a worktree path with cheap stat-only fields.

    Distinct from `claude_sessions_for`: no head/tail parse, no msg_count, no
    first/last message extraction. Only fields derivable from `os.stat` +
    filename (UUID). Cheap enough to run for every worktree in /api/index
    without blowing the 150ms perf budget.

    Returns list of dicts:
      {uuid, source, size_bytes, mtime_unix, modified_iso, age_sec, running_now}

    Sorted by mtime desc (newest first). NO [:5] cap.
    """
    import server
    encoded_variants = set(server.encode_path_for_claude(worktree_path))
    out: list[dict] = []
    now = time.time()
    threshold = server.RUNNING_THRESHOLD_SEC
    for base_dir in server.CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists():
            continue
        for proj_dir in base_dir.iterdir():
            name = proj_dir.name
            # Same fuzzy matching as claude_sessions_for to stay consistent
            # with existing semantics — exact match OR suffix overlap for the
            # cross-platform encoding cases (WSL `-mnt-d-foo` ↔ Windows
            # `D--foo`).
            match = (
                name in encoded_variants
                or any(name.endswith(v.lstrip("-")) for v in encoded_variants if len(v) > 4)
                or any(v.lstrip("-").endswith(name) for v in encoded_variants if len(name) > 8)
            )
            if not match:
                continue
            for jsonl in proj_dir.glob("*.jsonl"):
                if _hide_headless() and _is_headless_session(jsonl):
                    continue  # skip SDK / `claude -p` sessions (not human worktree work)
                try:
                    st = jsonl.stat()
                    age = int(now - st.st_mtime)
                    out.append({
                        "uuid": jsonl.stem,
                        "source": str(base_dir),
                        "size_bytes": st.st_size,
                        "mtime_unix": int(st.st_mtime),
                        "modified_iso": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                        "age_sec": age,
                        "running_now": age < threshold,
                    })
                except OSError:
                    continue
    out.sort(key=lambda s: s["mtime_unix"], reverse=True)
    return out


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
            # Cursor editor stores its linked worktrees under <repo>/.cursor/worktrees/<id>.
            # These are not for Claude — filter them out so dashboard stays Claude-focused.
            if "/.cursor/worktrees/" in wt_path.replace("\\", "/"):
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
                # Two normalizations needed: (1) slash style — str(WindowsPath)
                # emits `\`, git emits `/`; (2) symlink/junction resolution —
                # discover_repos may scan via `~/repos` which is often a junction
                # to the real drive (e.g. D:/repos). git always returns resolved
                # real path. Without .resolve() the equality always fails on
                # symlinked scan roots → `(main)` label never appears.
                "is_main_worktree": str(repo.resolve()).replace("\\", "/") == wt_path.replace("\\", "/"),
                # v0.3: session_name/session_active/session_attach_url отсутствуют — нет Zellij
                "claude_max_mtime": int(mtime),
                "has_claude_history": mtime > 0,
            })
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rows": rows,
    }


def _decode_claude_dir_name(name: str) -> list[str]:
    """FR-24: Inverse of encode_path_for_claude — emit candidate cwd paths.

    Encoded names lose information (single dash means either separator or
    literal char in source). Emit multiple plausible decodes; consumer probes
    Path.exists() to pick the real one.

    Examples:
      "D--repos-foo"            → ["D:/repos/foo", "D:\\repos\\foo"]
      "-mnt-d-repos-foo"        → ["/mnt/d/repos/foo", "D:/repos/foo"]
      "C--Users-stigm-Desktop"  → ["C:/Users/stigm/Desktop", "C:\\Users\\stigm\\Desktop"]
      "-home-user-foo"          → ["/home/user/foo"]
    """
    out: list[str] = []
    if not name:
        return out
    # Pattern: "<DRIVE>--<rest>" — Windows-canonical (DOUBLE dash marks drive)
    if len(name) >= 4 and name[1:3] == "--" and name[0].isalpha():
        drive = name[0].upper()
        rest = name[3:].replace("-", "/")
        out.append(f"{drive}:/{rest}")
        out.append(f"{drive}:\\{rest.replace('/', chr(92))}")
        return out
    # Pattern: "-mnt-<drive>-<rest>" — WSL canonical (LEADING dash)
    if name.startswith("-mnt-") and len(name) > 6:
        drive = name[5]
        rest_with_lead = name[5:]  # "d-repos-foo"
        parts = rest_with_lead.split("-")
        if parts and len(parts[0]) == 1:
            posix = "/mnt/" + "/".join(parts)
            out.append(posix)
            # Also Windows-side view
            rest = "/".join(parts[1:])
            out.append(f"{drive.upper()}:/{rest}")
        return out
    # Pattern: "-<segment>-<segment>..." — POSIX absolute path (leading slash → leading dash)
    if name.startswith("-"):
        out.append("/" + name[1:].replace("-", "/"))
        return out
    # Generic fallback — treat all dashes as separators
    out.append(name.replace("-", "/"))
    return out


def build_session_index() -> dict:
    """FR-26 + FR-25 + FR-24: per-session rows + process scan + UNION model.

    Sources:
      A. Per worktree × per JSONL — main case. For each git worktree, find all
         matching JSONLs in ~/.claude/projects/<encoded>/ and emit 1 row per UUID.
      B. Orphan sessions — ~/.claude/projects/<encoded>/ where decoded cwd is
         NOT inside any Source A worktree (e.g. C:\\Users\\stigm\\Desktop, D:\\repos).
         Emitted with is_orphan=true, empty repo/branch.
      C. Per worktree without history — git worktree exists but no JSONLs match
         → emit 1 row with session_uuid=None so frontend still shows the
         worktree (with [✨ Fresh] enabled).
      Dedup: A wins over B for same cwd; C is per-worktree fallback when no A.

    FR-25 attachment: process_scanner.scan_claude_processes() runs once per
    build; each row gets claude_window_open + claude_window_pids based on cwd.

    Schema (additive over build_worktree_index):
      legacy: id, repo, repo_path, branch, head, worktree_path, is_main_worktree,
              claude_max_mtime, has_claude_history
      NEW (per-session): session_uuid, claude_running_now, age_sec, size_bytes
      NEW (per-cwd): claude_window_open, claude_window_pids, is_orphan, is_stale.
    """
    # FR-25: scan running claude.exe processes once per build (cached internally 5s)
    try:
        import process_scanner
        proc_map = process_scanner.scan_claude_processes()
    except Exception as e:  # noqa: BLE001 — fail-open per NFR-Perf
        import sys as _sys
        print(f"[indexer] process_scanner failed: {e}", file=_sys.stderr)
        proc_map = {}

    def _proc_for_cwd(cwd: str) -> tuple[bool, list]:
        """Return (open, pids) for normalized cwd. Both slash forms tried."""
        if not cwd:
            return False, []
        norm1 = cwd.replace("\\", "/").rstrip("/")
        if len(norm1) >= 2 and norm1[1] == ":":
            norm1 = norm1[0].upper() + norm1[1:]
        pids = proc_map.get(norm1, [])
        return bool(pids), list(pids)

    repos = discover_repos()
    rows: list[dict] = []
    seen_paths: set[str] = set()
    a_cwds: set[str] = set()  # Source A cwds (normalized) — for B dedup
    # FR-24 reverse-lookup: forward-encode each Source A worktree → encoded variants;
    # use this to dedup Source B (avoids decoder ambiguity for cwds with literal dashes
    # in dir names like `dev-pomogator` which decoder can't distinguish from `dev/pomogator`).
    import server as _server
    a_encoded_variants: set[str] = set()
    for repo in repos:
        repo_name = repo.name
        repo_path_norm = str(repo.resolve()).replace("\\", "/")
        for wt in git_worktree_list(repo):
            if "error" in wt:
                continue
            wt_path = wt.get("path", "")
            if not wt_path or wt_path in seen_paths:
                continue
            # Same Cursor-worktree filter as build_worktree_index — these aren't
            # for Claude (FR-1 dedup invariant).
            if "/.cursor/worktrees/" in wt_path.replace("\\", "/"):
                continue
            seen_paths.add(wt_path)
            wt_path_norm = wt_path.replace("\\", "/").rstrip("/")
            a_cwds.add(wt_path_norm)
            # Forward-encode this worktree to all variants; use for Source B dedup.
            for v in _server.encode_path_for_claude(wt_path):
                a_encoded_variants.add(v)
            branch = wt.get("branch", "(unknown)")
            head = wt.get("head", "")[:7]
            is_main = repo_path_norm == wt_path.replace("\\", "/")
            window_open, window_pids = _proc_for_cwd(wt_path)

            jsonls = _claude_jsonls_lightweight(wt_path)
            if jsonls:
                # Source A: one row per JSONL.
                for j in jsonls:
                    rows.append({
                        "id": f"{repo_name}__{branch}__{wt_path}__{j['uuid']}",
                        "repo": repo_name,
                        "repo_path": str(repo),
                        "branch": branch,
                        "head": head,
                        "worktree_path": wt_path,
                        "is_main_worktree": is_main,
                        "claude_max_mtime": j["mtime_unix"],
                        "has_claude_history": True,
                        # FR-26 per-session fields:
                        "session_uuid": j["uuid"],
                        "claude_running_now": j["running_now"],
                        "age_sec": j["age_sec"],
                        "size_bytes": j["size_bytes"],
                        # FR-25 per-cwd window detection:
                        "claude_window_open": window_open,
                        "claude_window_pids": window_pids,
                        # FR-24 orphan/stale flags:
                        "is_orphan": False,
                        "is_stale": False,
                    })
            else:
                # Source C: worktree exists but no JSONLs — emit single row with
                # session_uuid=None. Frontend disables [▶ Resume] (no UUID to
                # resume) but [✨ Fresh] + [📂 VSCode] remain enabled.
                rows.append({
                    "id": f"{repo_name}__{branch}__{wt_path}__none",
                    "repo": repo_name,
                    "repo_path": str(repo),
                    "branch": branch,
                    "head": head,
                    "worktree_path": wt_path,
                    "is_main_worktree": is_main,
                    "claude_max_mtime": 0,
                    "has_claude_history": False,
                    "session_uuid": None,
                    "claude_running_now": False,
                    "age_sec": None,
                    "size_bytes": 0,
                    "claude_window_open": window_open,
                    "claude_window_pids": window_pids,
                    "is_orphan": False,
                    "is_stale": False,
                })

    # FR-24 Source B: scan ~/.claude/projects/* for orphan sessions.
    # Dedup vs Source A via FORWARD encoder lookup (avoids decoder ambiguity).
    # Filter out Claude Code meta dirs (C--Users-*--claude-*).
    now_ts = time.time()
    threshold = _server.RUNNING_THRESHOLD_SEC
    for base_dir in _server.CLAUDE_PROJECTS_DIRS:
        if not base_dir.exists():
            continue
        for proj_dir in base_dir.iterdir():
            if not proj_dir.is_dir():
                continue
            name = proj_dir.name
            # Skip Claude Code own meta state dirs (e.g. C--Users-stigm--claude-projects)
            if "--claude-" in name and "Users" in name:
                continue
            # Dedup vs Source A: if this encoded name is one of Source A's
            # forward-encoded variants → already covered, skip silently.
            if name in a_encoded_variants:
                continue
            candidates = _decode_claude_dir_name(name)
            decoded = None
            decoded_exists = False
            for c in candidates:
                from pathlib import Path as _P
                cp = _P(c)
                if cp.exists():
                    decoded = c
                    decoded_exists = True
                    break
            if not decoded:
                # Use first candidate but flag stale
                decoded = candidates[0] if candidates else f"<unknown:{name}>"
                decoded_exists = False
            decoded_norm = decoded.replace("\\", "/").rstrip("/")
            # Match jsonls for this exact encoded dir (no fuzzy — orphan is exact)
            jsonls_for_dir: list[dict] = []
            for jsonl in proj_dir.glob("*.jsonl"):
                if _hide_headless() and _is_headless_session(jsonl):
                    continue  # skip SDK / `claude -p` sessions (LangGraph fan-out flood)
                try:
                    st = jsonl.stat()
                    age = int(now_ts - st.st_mtime)
                    jsonls_for_dir.append({
                        "uuid": jsonl.stem,
                        "mtime_unix": int(st.st_mtime),
                        "age_sec": age,
                        "running_now": age < threshold,
                        "size_bytes": st.st_size,
                    })
                except OSError:
                    continue
            if not jsonls_for_dir:
                continue
            jsonls_for_dir.sort(key=lambda s: s["mtime_unix"], reverse=True)
            window_open_b, window_pids_b = _proc_for_cwd(decoded_norm)
            for j in jsonls_for_dir:
                rows.append({
                    "id": f"orphan__{name}__{j['uuid']}",
                    "repo": "",
                    "repo_path": "",
                    "branch": "",
                    "head": "",
                    "worktree_path": decoded_norm,
                    "is_main_worktree": False,
                    "claude_max_mtime": j["mtime_unix"],
                    "has_claude_history": True,
                    "session_uuid": j["uuid"],
                    "claude_running_now": j["running_now"],
                    "age_sec": j["age_sec"],
                    "size_bytes": j["size_bytes"],
                    "claude_window_open": window_open_b,
                    "claude_window_pids": window_pids_b,
                    "is_orphan": True,
                    "is_stale": not decoded_exists,
                })
            seen_paths.add(decoded_norm)

    # FR-25 post-processing: PID-to-session attribution.
    # claude.exe writes to ONE specific JSONL (active session UUID). Old JSONLs
    # in same cwd are CLOSED sessions even though cwd has PID(s) running.
    # Distribute available PIDs to top-K NEWEST rows per cwd (K = len(pids));
    # other rows in same cwd get window_open=False + empty pids regardless of
    # whether proc_map has the cwd.
    #
    # Source C rows (session_uuid=None, git worktree without Claude history)
    # NEVER get window_open. EnterWorktree quirk: user's actual session may have
    # process cwd in session-pilot worktree but JSONL keyed under start cwd
    # (dev-pomogator). The JSONL row already shows LIVE; an additional "Open"
    # marker on the Source C worktree row creates a confusing shadow duplicate
    # (1 process = 2 dashboard rows). Skip Source C window detection entirely.
    rows_by_cwd: dict[str, list[dict]] = {}
    for r in rows:
        cwd_norm = r["worktree_path"].replace("\\", "/").rstrip("/")
        rows_by_cwd.setdefault(cwd_norm, []).append(r)
    for cwd, cwd_rows in rows_by_cwd.items():
        norm = cwd if (len(cwd) < 2 or cwd[1] != ":") else cwd[0].upper() + cwd[1:]
        pids_for_cwd = list(proc_map.get(norm, []))
        # Only consider rows that have a real session_uuid (Source A or orphan).
        # Source C rows are skipped from PID attribution (set window_open=False
        # unconditionally — see comment above).
        session_rows = [r for r in cwd_rows if r.get("session_uuid")]
        source_c_rows = [r for r in cwd_rows if not r.get("session_uuid")]
        sorted_session_rows = sorted(
            session_rows, key=lambda x: x.get("claude_max_mtime") or 0, reverse=True
        )
        for i, r in enumerate(sorted_session_rows):
            if i < len(pids_for_cwd):
                r["claude_window_open"] = True
                r["claude_window_pids"] = [pids_for_cwd[i]]
            else:
                r["claude_window_open"] = False
                r["claude_window_pids"] = []
        for r in source_c_rows:
            r["claude_window_open"] = False
            r["claude_window_pids"] = []

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "rows": rows,
    }


_session_index_cache: dict = {"ts": 0.0, "data": None}


def build_session_index_cached() -> dict:
    """5s TTL cache mirror of build_index_cached — FR-26 per-session index."""
    now = time.time()
    if _session_index_cache["data"] is not None and (now - _session_index_cache["ts"]) < CACHE_TTL_INDEX:
        return _session_index_cache["data"]
    data = build_session_index()
    _session_index_cache["ts"] = now
    _session_index_cache["data"] = data
    return data


def build_claude_for_path(worktree_path: str) -> dict:
    info = claude_sessions_for(worktree_path)
    mtime = claude_max_mtime_for(worktree_path)
    return {
        "worktree_path": worktree_path,
        "claude_sessions": info["sessions"],
        "claude_running_now": info["running_now"],
        "claude_last_modified": info["last_modified"],
        "claude_max_mtime": int(mtime),
        "etag": f'W/"{int(mtime)}-{_PREVIEW_FORMAT_VERSION}"',
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
