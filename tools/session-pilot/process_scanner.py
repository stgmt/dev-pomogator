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


def _is_claude_internal_cwd(norm_cwd: str) -> bool:
    """Filter cwds that are Claude Code internal state dirs (not user work sessions).

    Examples:
      C:/Users/stigm/.claude/chrome             — chrome-native-host MCP wrapper
      C:/Users/stigm/.claude-mem/observer-sessions — claude-mem MCP observer
      /home/user/.claude/*                       — POSIX equivalent

    These claude.exe processes are MCP servers / Claude-internal helpers, NOT
    user-initiated CLI sessions. Shouldn't appear in dashboard `💡 Open` indicator.
    """
    if not norm_cwd:
        return False
    lower = norm_cwd.lower().replace("\\", "/")
    return (
        "/.claude/" in lower
        or "/.claude-" in lower
        or lower.endswith("/.claude")
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


def _get_cwd_via_peb(pid: int) -> str:
    """Read actual current cwd of a Windows process via PEB.

    Walks: OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ)
    → NtQueryInformationProcess(ProcessBasicInformation) → PEB.ProcessParameters
    → ProcessParameters.CurrentDirectory (UNICODE_STRING) → buffer read.

    Returns "" on any failure (access denied, dead process, layout mismatch).
    Accurate post-launch cwd — survives chdir inside the target process.
    Critical for WT single-instance scenarios where parent CommandLine has
    only initial spawn cwd, not actual current cwd of child claude.exe.

    Offsets are for 64-bit Windows process accessed from 64-bit Python.
    Source: ReactOS + MS docs ProcessParameters layout.
    """
    if sys.platform != "win32":
        return ""
    import ctypes
    from ctypes import wintypes

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    PROCESS_VM_READ = 0x0010

    class PROCESS_BASIC_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("ExitStatus", ctypes.c_long),
            ("PebBaseAddress", ctypes.c_void_p),
            ("AffinityMask", ctypes.c_void_p),
            ("BasePriority", ctypes.c_long),
            ("UniqueProcessId", ctypes.c_void_p),
            ("InheritedFromUniqueProcessId", ctypes.c_void_p),
        ]

    try:
        ntdll = ctypes.WinDLL("ntdll", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    except OSError:
        return ""

    OpenProcess = kernel32.OpenProcess
    OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    OpenProcess.restype = wintypes.HANDLE

    CloseHandle = kernel32.CloseHandle
    CloseHandle.argtypes = [wintypes.HANDLE]
    CloseHandle.restype = wintypes.BOOL

    ReadProcessMemory = kernel32.ReadProcessMemory
    ReadProcessMemory.argtypes = [
        wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t),
    ]
    ReadProcessMemory.restype = wintypes.BOOL

    NtQueryInformationProcess = ntdll.NtQueryInformationProcess
    NtQueryInformationProcess.restype = ctypes.c_long  # NTSTATUS

    h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        return ""
    try:
        pbi = PROCESS_BASIC_INFORMATION()
        ret_len = ctypes.c_ulong()
        status = NtQueryInformationProcess(
            h, 0, ctypes.byref(pbi), ctypes.sizeof(pbi), ctypes.byref(ret_len)
        )
        if status != 0 or not pbi.PebBaseAddress:
            return ""

        # Read PEB.ProcessParameters (offset 0x20 in 64-bit PEB)
        pp_addr = ctypes.c_void_p()
        bytes_read = ctypes.c_size_t()
        if not ReadProcessMemory(
            h, pbi.PebBaseAddress + 0x20,
            ctypes.byref(pp_addr), ctypes.sizeof(pp_addr), ctypes.byref(bytes_read),
        ) or not pp_addr.value:
            return ""

        # CurrentDirectory.DosPath UNICODE_STRING at offset 0x38 from ProcessParameters
        # UNICODE_STRING: USHORT Length, USHORT MaxLength, PWSTR Buffer (16 bytes total in 64-bit)
        length = ctypes.c_ushort()
        if not ReadProcessMemory(
            h, pp_addr.value + 0x38,
            ctypes.byref(length), ctypes.sizeof(length), ctypes.byref(bytes_read),
        ):
            return ""
        if length.value == 0 or length.value > 8192:  # sanity bound
            return ""

        # Buffer pointer at offset 0x40 (Length+MaxLength = 4 bytes, then 4 padding, then pointer at 0x40)
        buffer_addr = ctypes.c_void_p()
        if not ReadProcessMemory(
            h, pp_addr.value + 0x40,
            ctypes.byref(buffer_addr), ctypes.sizeof(buffer_addr), ctypes.byref(bytes_read),
        ) or not buffer_addr.value:
            return ""

        cwd_buf = ctypes.create_unicode_buffer(length.value // 2 + 1)
        if not ReadProcessMemory(
            h, buffer_addr.value,
            cwd_buf, length.value, ctypes.byref(bytes_read),
        ):
            return ""
        return cwd_buf.value
    except Exception:  # noqa: BLE001 — defensive — fail-open
        return ""
    finally:
        CloseHandle(h)


def _scan_windows(timeout_sec: float) -> dict[str, list[int]]:
    """Windows: list claude.exe PIDs via PowerShell, read each one's cwd via PEB.

    Replaced previous parent-chain heuristic (`wt -d <cwd>`) which gave WRONG
    cwd when WindowsTerminal was single-instance (shared one WT process across
    multiple windows, only initial spawn cwd in CommandLine).

    PEB read gives ACTUAL current cwd of the running claude.exe — survives
    `cd` inside the process (via claude-pane.cmd `cd /d <target>` scripts).
    """
    # First: enumerate just claude.exe PIDs + ExecutablePath via fast PS query
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | "
        "Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress -Depth 2"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=timeout_sec, check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        print(f"[process_scanner] Windows PS query failed: {e}", file=sys.stderr)
        return {}
    if result.returncode != 0 or not result.stdout.strip():
        return {}
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}
    if isinstance(parsed, dict):
        parsed = [parsed]

    out: dict[str, list[int]] = {}
    for proc in parsed:
        try:
            pid = int(proc.get("ProcessId", 0))
        except (TypeError, ValueError):
            continue
        if pid <= 0:
            continue
        exe_path = proc.get("ExecutablePath", "") or ""
        if _is_desktop_app_path(exe_path):
            continue  # skip Claude.ai desktop app
        # Read REAL cwd from PEB — accurate across single-instance WT scenarios
        cwd = _get_cwd_via_peb(pid)
        if not cwd:
            continue
        norm = _normalize_cwd(cwd)
        if not norm:
            continue
        if _is_claude_internal_cwd(norm):
            continue  # skip MCP/internal helpers
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
