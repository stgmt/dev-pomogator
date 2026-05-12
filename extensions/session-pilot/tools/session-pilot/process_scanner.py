"""FR-25: process-based "open window" detection.

Distinct signal from JSONL-mtime LIVE (FR-20). LIVE = "writing JSONL within last
300s"; OPEN = "claude.exe process exists with this cwd, regardless of whether
it's typing right now". Idle-but-open windows look identical to closed-and-stale
windows in mtime-only model — this module bridges the gap.

Public:
    scan_claude_processes(cache_ttl_sec=5.0) -> dict[str, list[int]]

Returns {normalized_cwd: [pid, ...]} for all running claude.exe CLI sessions.
Excludes Claude.ai desktop app (cwd == install dir). Fails open on
timeout/error/disable — empty dict, never raise.

Per-OS dispatch via sys.platform:
  - win32: Get-CimInstance Win32_Process JSON output + parent chain walk
           extracts cwd from `wt -d <cwd>` parent CommandLine
  - linux: pgrep -x claude + os.readlink(/proc/<pid>/cwd)
  - darwin: pgrep -x claude + lsof -p <pid> -d cwd -Fn parse

Env vars:
  SP_DISABLE_PROCESS_SCAN=1 — opt-out (returns {} immediately)
  SP_PROCESS_SCAN_TIMEOUT_SEC=3 — subprocess timeout (default 3s)
"""

from __future__ import annotations
import json
import os
import re
import subprocess
import sys
import time


_scan_cache: dict = {"ts": 0.0, "data": {}}

_WT_CWD_RE = re.compile(r'-d\s+"?([^"]+?)"?(?:\s|$)', re.IGNORECASE)
_DESKTOP_APP_PATTERNS_WIN = (
    "WindowsApps\\Claude_",
    "Program Files\\Claude\\",
    "Program Files (x86)\\Claude\\",
)
_DESKTOP_APP_PATTERNS_NIX = (
    "/Applications/Claude.app/",
    "/snap/claude-desktop/",
    "/opt/Claude/",
)


def _normalize_cwd(p: str) -> str:
    """Normalize cwd for cross-format matching (\\ vs /, drive letter case)."""
    if not p:
        return ""
    p = p.strip().strip('"').rstrip("/").rstrip("\\")
    # Use forward slashes uniformly — indexer emits worktree_path with /.
    p = p.replace("\\", "/")
    # Uppercase drive letter (D:/repos vs d:/repos)
    if len(p) >= 2 and p[1] == ":":
        p = p[0].upper() + p[1:]
    return p


def _is_desktop_app_path(exe_path: str) -> bool:
    """Filter Claude.ai desktop app — we only want CLI sessions."""
    if not exe_path:
        return False
    if sys.platform == "win32":
        return any(pat in exe_path for pat in _DESKTOP_APP_PATTERNS_WIN)
    return any(pat in exe_path for pat in _DESKTOP_APP_PATTERNS_NIX)


def _scan_windows(timeout_sec: float) -> dict[str, list[int]]:
    """Windows: Win32_Process via PowerShell. Walk parent chain for `wt -d <cwd>`."""
    # Pull all claude.exe + cmd.exe + pwsh.exe + WindowsTerminal.exe in one query.
    # Parent chain walking needs all of these to find the wt invocation cwd.
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter "
        '"Name=\'claude.exe\' or Name=\'cmd.exe\' or Name=\'pwsh.exe\' '
        "or Name='powershell.exe' or Name='WindowsTerminal.exe'\" | "
        "Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | "
        "ConvertTo-Json -Compress -Depth 2"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=timeout_sec, check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        print(f"[process_scanner] Windows scan failed: {e}", file=sys.stderr)
        return {}
    if result.returncode != 0 or not result.stdout.strip():
        return {}
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}
    # ConvertTo-Json returns dict for single match, list otherwise. Normalize.
    if isinstance(parsed, dict):
        parsed = [parsed]
    # Build PID lookup
    by_pid: dict[int, dict] = {}
    for proc in parsed:
        try:
            pid = int(proc.get("ProcessId", 0))
        except (TypeError, ValueError):
            continue
        if pid:
            by_pid[pid] = proc

    out: dict[str, list[int]] = {}

    def find_cwd_in_chain(pid: int, depth: int = 0) -> str:
        """Walk parents up to 4 levels looking for `wt -d <cwd>` CommandLine."""
        if depth > 4 or pid <= 0:
            return ""
        proc = by_pid.get(pid)
        if not proc:
            return ""
        cmdline = proc.get("CommandLine") or ""
        m = _WT_CWD_RE.search(cmdline)
        if m:
            return m.group(1)
        try:
            ppid = int(proc.get("ParentProcessId", 0))
        except (TypeError, ValueError):
            return ""
        if ppid and ppid != pid:
            return find_cwd_in_chain(ppid, depth + 1)
        return ""

    for pid, proc in by_pid.items():
        if proc.get("Name", "").lower() != "claude.exe":
            continue
        if _is_desktop_app_path(proc.get("ExecutablePath", "")):
            continue
        cwd = find_cwd_in_chain(pid)
        if not cwd:
            continue
        norm = _normalize_cwd(cwd)
        if not norm:
            continue
        out.setdefault(norm, []).append(pid)
    return out


def _scan_linux(timeout_sec: float) -> dict[str, list[int]]:
    """Linux: pgrep + /proc/<pid>/cwd symlink read."""
    try:
        result = subprocess.run(
            ["pgrep", "-x", "claude"],
            capture_output=True, text=True, timeout=timeout_sec, check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return {}
    if result.returncode not in (0, 1):  # 1 = no match, still OK
        return {}
    out: dict[str, list[int]] = {}
    for line in result.stdout.splitlines():
        try:
            pid = int(line.strip())
        except ValueError:
            continue
        try:
            exe = os.readlink(f"/proc/{pid}/exe")
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            continue
        if _is_desktop_app_path(exe):
            continue
        norm = _normalize_cwd(cwd)
        if norm:
            out.setdefault(norm, []).append(pid)
    return out


def _scan_darwin(timeout_sec: float) -> dict[str, list[int]]:
    """macOS: pgrep + lsof for cwd extraction (no /proc on macOS)."""
    try:
        result = subprocess.run(
            ["pgrep", "-x", "claude"],
            capture_output=True, text=True, timeout=timeout_sec, check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return {}
    if result.returncode not in (0, 1):
        return {}
    out: dict[str, list[int]] = {}
    for line in result.stdout.splitlines():
        try:
            pid = int(line.strip())
        except ValueError:
            continue
        try:
            lsof = subprocess.run(
                ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
                capture_output=True, text=True, timeout=2.0, check=False,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            continue
        cwd = ""
        for lsof_line in lsof.stdout.splitlines():
            if lsof_line.startswith("n"):
                cwd = lsof_line[1:]
                break
        if not cwd:
            continue
        # Skip Claude.app desktop sessions
        if _is_desktop_app_path(cwd):
            continue
        norm = _normalize_cwd(cwd)
        if norm:
            out.setdefault(norm, []).append(pid)
    return out


def _scan_uncached(timeout_sec: float) -> dict[str, list[int]]:
    """Dispatch to per-OS scanner. Returns {} on unsupported platform."""
    if sys.platform == "win32":
        return _scan_windows(timeout_sec)
    if sys.platform == "linux":
        return _scan_linux(timeout_sec)
    if sys.platform == "darwin":
        return _scan_darwin(timeout_sec)
    return {}


def scan_claude_processes(cache_ttl_sec: float = 5.0) -> dict[str, list[int]]:
    """Return {normalized_cwd: [pid, ...]} for running Claude Code CLI sessions.

    Cached cache_ttl_sec seconds (default 5s). Fails open (returns {} on any error).
    Honor SP_DISABLE_PROCESS_SCAN=1 env var (opt-out for AV-slow hosts).
    """
    if os.environ.get("SP_DISABLE_PROCESS_SCAN") == "1":
        return {}
    now = time.time()
    if _scan_cache["data"] and (now - _scan_cache["ts"]) < cache_ttl_sec:
        return _scan_cache["data"]
    try:
        timeout = float(os.environ.get("SP_PROCESS_SCAN_TIMEOUT_SEC", "3"))
    except ValueError:
        timeout = 3.0
    t0 = time.time()
    data = _scan_uncached(timeout)
    elapsed_ms = int((time.time() - t0) * 1000)
    if elapsed_ms > 200:
        print(f"[process_scanner] slow scan: {elapsed_ms}ms (budget 200ms)", file=sys.stderr)
    _scan_cache["ts"] = now
    _scan_cache["data"] = data
    return data


if __name__ == "__main__":
    # CLI for diagnostics: python process_scanner.py
    import json as _json
    result = scan_claude_processes(cache_ttl_sec=0)  # bypass cache
    print(_json.dumps(result, indent=2, ensure_ascii=False))
