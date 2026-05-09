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


def encode_path_for_claude(p: str) -> list[str]:
    """
    Claude encodes project path differently per OS:
      Linux:   /mnt/d/repos/foo      -> -mnt-d-repos-foo
      Windows: D:\\repos\\foo         -> D--repos-foo
    Same worktree may be referenced by both (when /mnt/d -> D:\\). Return all variants.
    """
    variants = set()
    p = p.rstrip("/").rstrip("\\")
    # Linux-style
    variants.add(p.replace("/", "-").replace(":", "").replace("\\", "-"))
    # Windows-style: replace : with empty, \\ with -, also handle /
    win_form = p.replace(":", "").replace("\\", "-").replace("/", "-")
    variants.add(win_form)
    # If path starts with /mnt/X/, also try X:-... encoding
    if p.startswith("/mnt/") and len(p) > 6:
        drive = p[5].upper()
        rest = p[6:]
        win = f"{drive}-{rest.replace('/', '-').replace(':', '')}"
        variants.add(win)
    # If path starts with X:/, also try -mnt-x-... encoding
    if len(p) >= 3 and p[1] == ":" and p[2] in ("/", "\\"):
        drive = p[0].lower()
        rest = p[3:].replace("\\", "-").replace("/", "-")
        variants.add(f"-mnt-{drive}-{rest}")
    return [v.lstrip("-") for v in variants] + [v for v in variants if v.startswith("-")] + list(variants)


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
  .progress-wrap { background: #1a1a1e; border: 1px solid #333; border-radius: 4px; height: 6px; margin: 8px 0 16px; overflow: hidden; }
  .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); height: 100%; width: 0%; transition: width 0.3s ease; }
  .progress-text { color: #888; font-size: 11px; margin-bottom: 6px; }
  td.loading { color: #555; font-style: italic; font-size: 11px; }
  .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid #333; border-top-color: #fbbf24; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head><body>
<h1>Worktree Dashboard <button class="refresh" onclick="hardReload()">↻ Refresh</button></h1>
<div class="meta" id="meta">Loading worktrees…</div>
<div class="progress-text" id="progressText"></div>
<div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
<table id="tbl"></table>
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
}

function clearProgress() {
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '';
}

function setProgress(pct, label) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = label || '';
}

function render() {
  applySort(_rows);
  let html = `<thead><tr>
    ${sortHdr('Status', 'claude_running_now')}
    ${sortHdr('Repo', 'repo')}
    ${sortHdr('Branch', 'branch')}
    ${sortHdr('HEAD', 'head')}
    ${sortHdr('Worktree path', 'worktree_path')}
    ${sortHdr('Last activity', '_last_msg_ts')}
    ${sortHdr('Last message', '_last_msg_text')}
    ${sortHdr('Msgs', '_msg_count')}
    ${sortHdr('Zellij session', 'session_name')}
    <th>Action</th>
  </tr></thead><tbody>`;
  for (const row of _rows) {
    let status;
    if (!row._claude_loaded) status = '<span class="spinner"></span>';
    else if (row.claude_running_now) status = '<span class="status live">● LIVE</span>';
    else if (row.claude_last_modified) {
      const ageMin = Math.floor((Date.now()/1000 - new Date(row.claude_last_modified).getTime()/1000) / 60);
      status = `<span class="status idle">idle ${ageMin}m</span>`;
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
      <td class="last-msg ${loadingCell}">${row._claude_loaded ? (role ? `<span class="role-${role}">${role}:</span> ` : '') + escapeHtml(lastText) : 'scanning JSONL…'}</td>
      <td class="num">${row._claude_loaded ? (top?.msg_count ?? '—') : '…'}</td>
      <td class="session ${row.session_active ? 'active' : 'inactive'}">${escapeHtml(row.session_name)}${row.session_active ? ' ●' : ''}</td>
      <td>${row.session_attach_url
        ? `<a class="open-link" href="${row.session_attach_url}" target="_blank">Open in Zellij</a>`
        : `<span class="open-link disabled">—</span>`
      }</td>
    </tr>`;
  }
  html += '</tbody>';
  document.getElementById('tbl').innerHTML = html;
}
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sortHdr(label, key) {
  const arrow = window._sortBy === key ? (window._sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="sortable" onclick="setSort('${key}')">${label}${arrow}</th>`;
}
function setSort(key) {
  if (window._sortBy === key) {
    window._sortDir = window._sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window._sortBy = key; window._sortDir = 'desc';
  }
  render();
}
function applySort(rows) {
  const key = window._sortBy, dir = window._sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (typeof av === 'boolean') av = av ? 1 : 0;
    if (typeof bv === 'boolean') bv = bv ? 1 : 0;
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });
}
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
    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))
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

    bind = os.environ.get("WT_DASHBOARD_BIND", "0.0.0.0")
    print(f"Worktree dashboard listening on http://{bind}:{PORT}", flush=True)
    HTTPServer((bind, PORT), Handler).serve_forever()
