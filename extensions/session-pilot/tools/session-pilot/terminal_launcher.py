"""Windows-native terminal launcher — replaces zellij_util.py for v0.3.

Spawns a detached new terminal window with `claude --resume <uuid>` (or bare
`claude` for fresh mode) running in the given worktree path.

Spawn chain (first available wins):
  1. `$env:SP_TERMINAL_CMD` template override (placeholders {cwd}, {cmd})
  2. `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "<cmd>"`           (Windows Terminal + PS7)
  3. `wt.exe -d <cwd> -- powershell.exe -NoExit -Command "<cmd>"`     (WT + PS 5.1)
  4. `cmd.exe /c start "" pwsh.exe -NoExit -Command "<cmd>"`          (no WT — minimal Win 10)
  5. `cmd.exe /c start "" powershell.exe -NoExit -Command "<cmd>"`    (no PS7 either)

Returns dict with `{ok: bool, method: str, pid: int | None, error?: str}`.

Idempotency lock per `(worktree_path, uuid_or_fresh)` lives in server module
(reused from v0.2 architecture — see `_launch_lock` in server.py).

No PTY allocation, no `_PTY_MASTERS` race-fix — Windows spawn is straight
Popen with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` creationflags. No
fd inheritance issue because we pass `stdin/stdout/stderr=DEVNULL` explicitly.
"""

import os
import shutil
import subprocess
import sys


# Windows-only creationflags. Imported lazily because pytest on Linux/macOS
# (used in some CI runners) doesn't have these — module would fail to import.
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000  # only when spawning a wrapper, not the visible terminal


def _detached_kwargs() -> dict:
    """Popen kwargs that give us a fully-detached child on Windows."""
    if sys.platform != "win32":
        # On non-Windows (test runners only — v0.3 is Win-target) just request
        # a new session via start_new_session=True for graceful detach.
        return {"start_new_session": True, "close_fds": True}
    return {
        "creationflags": DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
        "close_fds": True,
    }


def _wt_available() -> bool:
    return shutil.which("wt.exe") is not None or shutil.which("wt") is not None


def _pwsh_available() -> bool:
    """Check for PowerShell 7 (pwsh.exe) on PATH."""
    return shutil.which("pwsh.exe") is not None or shutil.which("pwsh") is not None


def _build_claude_cmd(mode: str, uuid: str | None) -> str:
    """Build the claude invocation string — used as the -Command argument to PS."""
    if mode == "resume" and uuid:
        return f"claude --resume {uuid}"
    return "claude"


def _env_template_spawn(template: str, cmd: str, cwd: str) -> dict:
    """Apply user-defined SP_TERMINAL_CMD template. Placeholders: {cwd}, {cmd}."""
    # Defensive: forbid arbitrary other placeholders. Replace ONLY {cwd} + {cmd}.
    rendered = template.replace("{cwd}", cwd).replace("{cmd}", cmd)
    try:
        # Shell mode is needed because user-provided template may contain spaces / pipes / etc.
        # SP_TERMINAL_CMD is opt-in by user — they accept the trust boundary.
        proc = subprocess.Popen(
            rendered,
            shell=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **_detached_kwargs(),
        )
    except Exception as e:
        return {"ok": False, "method": "env-override", "error": str(e)}
    return {"ok": True, "method": "env-override", "pid": proc.pid}


def _wt_spawn(cmd: str, cwd: str) -> dict:
    """wt.exe -d <cwd> -- <shell> -NoExit -Command "<cmd>"."""
    ps_exe = "pwsh.exe" if _pwsh_available() else "powershell.exe"
    method = f"wt-spawn-{'pwsh' if ps_exe == 'pwsh.exe' else 'powershell'}"
    args = [
        "wt.exe",
        "-d", cwd,
        "--",
        ps_exe,
        "-NoExit",
        "-Command", cmd,
    ]
    try:
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **_detached_kwargs(),
        )
    except FileNotFoundError as e:
        return {"ok": False, "method": method, "error": f"wt.exe not found: {e}"}
    except Exception as e:
        return {"ok": False, "method": method, "error": str(e)}
    return {"ok": True, "method": method, "pid": proc.pid}


def _cmd_fallback_spawn(cmd: str, cwd: str) -> dict:
    """cmd.exe /c start "" /D <cwd> <shell> -NoExit -Command "<cmd>"."""
    ps_exe = "pwsh.exe" if _pwsh_available() else "powershell.exe"
    method = f"cmd-fallback-{'pwsh' if ps_exe == 'pwsh.exe' else 'powershell'}"
    # `start ""` opens a new window; "" is the (empty) window title placeholder.
    # /D sets working directory.
    args = [
        "cmd.exe", "/c", "start", "",
        "/D", cwd,
        ps_exe, "-NoExit",
        "-Command", cmd,
    ]
    try:
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **_detached_kwargs(),
        )
    except FileNotFoundError as e:
        return {"ok": False, "method": method, "error": f"cmd.exe not found: {e}"}
    except Exception as e:
        return {"ok": False, "method": method, "error": str(e)}
    return {"ok": True, "method": method, "pid": proc.pid}


def spawn_terminal(worktree_path: str, mode: str, uuid: str | None) -> dict:
    """Top-level entry: spawn a new Windows Terminal (or fallback) running
    `claude --resume <uuid>` or `claude` in `worktree_path`.

    Returns {ok, method, pid?, error?}. Method tells caller which chain rung
    actually fired (useful for tests + observability).
    """
    cmd = _build_claude_cmd(mode, uuid)

    # 1. User env override wins
    template = os.environ.get("SP_TERMINAL_CMD")
    if template:
        return _env_template_spawn(template, cmd, worktree_path)

    # 2. Windows Terminal preferred
    if _wt_available():
        result = _wt_spawn(cmd, worktree_path)
        if result["ok"]:
            return result
        # else fall through

    # 3. cmd.exe fallback
    return _cmd_fallback_spawn(cmd, worktree_path)


def open_vscode(path: str) -> dict:
    """Open `path` in VSCode/Cursor via `code.cmd` shim (Windows).

    `code` без расширения часто отсутствует в PATH на Windows — VSCode
    устанавливает `code.cmd` shim. Try `code.cmd` first, fall back to `code`.
    """
    exe = None
    for candidate in ("code.cmd", "code.exe", "code"):
        if shutil.which(candidate):
            exe = candidate
            break
    if exe is None:
        return {"ok": False, "error": "'code' CLI not found in PATH. Install VSCode or Cursor."}
    try:
        subprocess.Popen(
            [exe, path],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            **_detached_kwargs(),
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "method": exe}
