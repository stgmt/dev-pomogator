"""Zellij interaction layer — extracted from server.py (Phase 5 refactor).

Public surface:
  - `_PTY_MASTERS`: module-global list of open PTY master fds (race-fix per
    NFR-Compat-6 / T36 — kernel reclaims on server exit; do NOT close prematurely)
  - `_zellij_session_exists(name)`: shell out to `zellij list-sessions`
  - `_zellij_inject(session, command)`: focus-pane + action write-chars
  - `_zellij_spawn_with_layout(...)`: native Popen with start_new_session=True
    + own pty.openpty() (race-resistant per RESEARCH.md T36)
  - `_open_vscode(path)`: detached `code <path>` spawn

Tests monkey-patch `server.ZELLIJ_BIN` / `server.LAYOUTS_DIR` (and similar).
Each function below reads those attributes via late binding (`import server`
at call-time) so patches reach the real call site.
"""

import os
import re
import subprocess


# Race-fix: PTY master fds parked here for server lifetime.
# Spawned Zellij children would receive SIGHUP if GC closed master.
# Kernel reclaims on process exit. See NFR-Compat-6.
_PTY_MASTERS: list[int] = []


def _zellij_session_exists(name: str) -> bool:
    import server  # late binding — pick up monkey-patched ZELLIJ_BIN in tests
    try:
        out = subprocess.run(
            [server.ZELLIJ_BIN, "list-sessions", "--no-formatting"],
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
    import server
    try:
        subprocess.run([server.ZELLIJ_BIN, "--session", session, "action", "focus-pane-id", "terminal_1"],
                       capture_output=True, timeout=3, check=False)
        out = subprocess.run([server.ZELLIJ_BIN, "--session", session, "action", "write-chars", command + "\n"],
                             capture_output=True, text=True, timeout=3, check=False)
        if out.returncode != 0:
            return {"ok": False, "error": f"write-chars failed: {out.stderr[:200]}"}
    except Exception as e:
        return {"ok": False, "error": f"zellij action failed: {e}"}
    return {"ok": True, "method": "write-chars"}


def _zellij_spawn_with_layout(session: str, worktree_path: str, mode: str, uuid: str | None) -> dict:
    """Spawn new Zellij session with KDL layout — race-resistant.

    See `server.py` history + RESEARCH.md spawn-race Risk row for full diagnosis.
    """
    import server
    import tempfile, pty
    tmpl_name = "claude-resume.kdl.tmpl" if mode == "resume" else "claude-fresh.kdl.tmpl"
    tmpl = (server.LAYOUTS_DIR / tmpl_name).read_text(encoding="utf-8")
    rendered = tmpl.replace("__CWD__", worktree_path).replace("__NAME__", session)
    if mode == "resume" and uuid:
        rendered = rendered.replace("__UUID__", uuid)

    fd, kdl_path = tempfile.mkstemp(prefix="sp-", suffix=".kdl", dir="/tmp")
    try:
        os.write(fd, rendered.encode("utf-8"))
    finally:
        os.close(fd)

    master_fd, slave_fd = pty.openpty()

    try:
        proc = subprocess.Popen(
            [server.ZELLIJ_BIN, "-s", session, "-n", kdl_path],
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            start_new_session=True, close_fds=True,
        )
    except FileNotFoundError as e:
        os.close(master_fd); os.close(slave_fd)
        return {"ok": False, "error": f"zellij not found at {server.ZELLIJ_BIN}: {e}"}
    finally:
        os.close(slave_fd)

    _PTY_MASTERS.append(master_fd)

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
