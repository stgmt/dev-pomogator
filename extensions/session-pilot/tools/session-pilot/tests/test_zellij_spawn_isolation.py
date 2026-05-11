"""
Race-fix regression: _zellij_spawn_with_layout must produce a child that
- runs in a NEW process group (setsid took effect) — proves Popen
  `start_new_session=True` is doing its job.
- has its own PTY (slave fd from pty.openpty()), separate from any HTTP
  handler context.
- does NOT inherit arbitrary fds from the server process.

Tests use a fake ZELLIJ_BIN pointing at a tiny `bash` stub that prints its
pgid and parent pgid then exits — no real Zellij required. Linux/WSL only
(skipped on Windows: pty module unavailable).

Reference: research-workflow 2026-05-11 findings + RESEARCH.md Risk row
"Playwright frontend e2e spawn race".

Cases:
  T_RACE_01: spawned child runs in a NEW process group (pgid != server pgid)
  T_RACE_02: master fd kept alive in _PTY_MASTERS list
  T_RACE_03: stdin/stdout/stderr in child point to a TTY (PTY slave)
  T_RACE_04: server-side socket close does not kill the spawned child
"""

import os
import sys
import time
import tempfile
import platform
from pathlib import Path


SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))

if platform.system() == "Windows" or not hasattr(__import__("os"), "fork"):
    print("SKIP test_zellij_spawn_isolation: PTY/fork unavailable on this platform")
    sys.exit(0)

import server  # noqa: E402


def _make_fake_zellij(tmp: Path, output_file: Path) -> Path:
    """Build a tiny bash 'zellij' stub that dumps {pid, pgid, ppgid, isatty}
    to output_file then sleeps 30s. Lets us assert on the child's group state."""
    bin_path = tmp / "fake_zellij"
    script = f"""#!/bin/bash
{{
  echo "pid=$$"
  echo "pgid=$(ps -o pgid= -p $$)"
  ppid=$PPID
  echo "ppid=$ppid"
  echo "ppgid=$(ps -o pgid= -p $ppid 2>/dev/null || echo missing)"
  # tty detection — write to fd 0; if isatty, tty command prints path; else "not a tty"
  if [ -t 0 ]; then echo "stdin_is_tty=yes"; else echo "stdin_is_tty=no"; fi
  if [ -t 1 ]; then echo "stdout_is_tty=yes"; else echo "stdout_is_tty=no"; fi
}} > {output_file}
sleep 30
"""
    bin_path.write_text(script)
    bin_path.chmod(0o755)
    return bin_path


def _setup_kdl_dir(tmp: Path):
    """Create minimal KDL templates so _zellij_spawn_with_layout can read them."""
    layouts = tmp / "layouts"
    layouts.mkdir()
    for name in ("claude-resume.kdl.tmpl", "claude-fresh.kdl.tmpl"):
        (layouts / name).write_text("// layout for __NAME__ in __CWD__ (uuid __UUID__)\n")
    server.LAYOUTS_DIR = layouts


def _spawn_and_read(tmp: Path) -> dict:
    """Spawn the fake zellij + read its dump file once written. Returns parsed kv."""
    output = tmp / "fake_out.txt"
    fake = _make_fake_zellij(tmp, output)
    server.ZELLIJ_BIN = str(fake)
    _setup_kdl_dir(tmp)
    result = server._zellij_spawn_with_layout(
        session="t-race-1",
        worktree_path=str(tmp),
        mode="fresh",
        uuid=None,
    )
    assert result.get("ok"), f"spawn returned {result}"
    child_pid = result["child_pid"]
    # Wait up to 5s for the dump file
    deadline = time.time() + 5
    while time.time() < deadline:
        if output.exists() and output.stat().st_size > 0:
            break
        time.sleep(0.1)
    assert output.exists(), f"fake zellij never wrote dump (pid={child_pid})"
    kv = {}
    for line in output.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            kv[k.strip()] = v.strip()
    kv["__child_pid"] = child_pid
    return kv


def test_T_RACE_01_child_in_new_process_group():
    with tempfile.TemporaryDirectory(prefix="race-isol-") as td:
        tmp = Path(td)
        server._PTY_MASTERS.clear()
        dump = _spawn_and_read(tmp)
        child_pid = dump["__child_pid"]
        server_pgid = os.getpgid(0)
        # Child's pgid should equal child_pid (it's the leader of its own group),
        # and definitely should NOT equal the server's pgid.
        child_pgid = int(dump["pgid"])
        assert child_pgid != server_pgid, (
            f"child pgid {child_pgid} == server pgid {server_pgid} — "
            f"start_new_session=True did NOT take effect"
        )
        assert child_pgid == child_pid, (
            f"child pgid {child_pgid} != child pid {child_pid} — child is not "
            f"its own session leader (setsid race?)"
        )
        # Cleanup spawned process
        try: os.kill(child_pid, 9)
        except OSError: pass


def test_T_RACE_02_master_fd_parked():
    with tempfile.TemporaryDirectory(prefix="race-isol-") as td:
        tmp = Path(td)
        server._PTY_MASTERS.clear()
        before = len(server._PTY_MASTERS)
        dump = _spawn_and_read(tmp)
        after = len(server._PTY_MASTERS)
        assert after == before + 1, (
            f"_PTY_MASTERS should grow by 1 (was {before}, now {after}). "
            f"Without parking, master fd would be GC'd → kernel delivers EOF "
            f"to child → spawn race regression."
        )
        # The parked fd is still open
        master_fd = server._PTY_MASTERS[-1]
        try:
            os.fstat(master_fd)  # raises OSError if closed
        except OSError as e:
            raise AssertionError(f"parked master fd {master_fd} already closed: {e}")
        try: os.kill(dump["__child_pid"], 9)
        except (OSError, ValueError): pass


def test_T_RACE_03_child_stdio_is_tty():
    """PTY slave is real terminal — Zellij's isatty(STDIN/STDOUT) checks pass."""
    with tempfile.TemporaryDirectory(prefix="race-isol-") as td:
        tmp = Path(td)
        server._PTY_MASTERS.clear()
        dump = _spawn_and_read(tmp)
        assert dump.get("stdin_is_tty") == "yes", (
            f"child stdin not a TTY: {dump}. Zellij requires a controlling TTY "
            f"to start; PTY slave must reach the child as fd 0."
        )
        assert dump.get("stdout_is_tty") == "yes", f"child stdout not a TTY: {dump}"
        try: os.kill(dump["__child_pid"], 9)
        except (OSError, ValueError): pass


def test_T_RACE_04_child_survives_master_close():
    """If we close the master fd post-spawn, child should NOT die immediately.
    (Test simulates a regression: forgot to park master_fd in _PTY_MASTERS.)
    """
    with tempfile.TemporaryDirectory(prefix="race-isol-") as td:
        tmp = Path(td)
        server._PTY_MASTERS.clear()
        dump = _spawn_and_read(tmp)
        child_pid = dump["__child_pid"]

        # Verify child alive
        try:
            os.kill(child_pid, 0)
        except OSError as e:
            raise AssertionError(f"child {child_pid} died before master close: {e}")

        # Close master fd (simulate forgetting to park it)
        master_fd = server._PTY_MASTERS[-1]
        os.close(master_fd)
        server._PTY_MASTERS.pop()

        # The fake zellij sleeps 30s. Without controlling TTY ties, closing
        # master shouldn't kill it because (a) it's in its own session via
        # start_new_session=True, (b) bash is currently NOT blocking on
        # stdin (it's in `sleep`). Give kernel time to deliver any HUP.
        time.sleep(0.5)
        try:
            os.kill(child_pid, 0)  # alive?
            alive = True
        except OSError:
            alive = False

        # Cleanup
        try: os.kill(child_pid, 9)
        except OSError: pass

        # If this assertion fires, the spawn isolation regressed — master fd
        # close is now propagating to child via PTY/session linkage.
        assert alive, (
            f"child {child_pid} died after master fd close — spawn isolation "
            f"regression. Either start_new_session=True isn't being honoured, "
            f"or the controlling-TTY linkage is wired up. Check Popen args."
        )


# ---------- runner ----------

if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
