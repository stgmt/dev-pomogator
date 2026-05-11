"""
Tests for terminal_launcher.py — Windows-native spawn chain replacing zellij_util.py.

Coverage:
  T_TL_01: _build_claude_cmd builds resume command from uuid
  T_TL_02: _build_claude_cmd builds bare claude for fresh mode (uuid ignored)
  T_TL_03: spawn_terminal honours SP_TERMINAL_CMD env override (highest priority)
  T_TL_04: spawn_terminal falls through to cmd-fallback when wt.exe absent
  T_TL_05: open_vscode returns error when no code CLI on PATH
  T_TL_06: _detached_kwargs returns close_fds always; creationflags only on Windows
  T_TL_07: _wt_available + _pwsh_available probe PATH

No actual process spawn — we monkey-patch subprocess.Popen + shutil.which to
deterministic stubs and assert on the argv that would have been passed.
"""

import os
import subprocess
import sys
import unittest.mock
from pathlib import Path

SP_TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SP_TOOLS))

import terminal_launcher as tl


# ---------- builders ----------

def test_T_TL_01_build_claude_cmd_resume():
    cmd = tl._build_claude_cmd("resume", "abc-def-1234-5678")
    assert cmd == "claude --resume abc-def-1234-5678", cmd


def test_T_TL_02_build_claude_cmd_fresh_ignores_uuid():
    assert tl._build_claude_cmd("fresh", None) == "claude"
    assert tl._build_claude_cmd("fresh", "abc-def") == "claude", "fresh mode must ignore uuid"


# ---------- detached kwargs ----------

def test_T_TL_06_detached_kwargs_close_fds():
    kw = tl._detached_kwargs()
    assert kw.get("close_fds") is True, kw
    if sys.platform == "win32":
        # CREATE_NEW_PROCESS_GROUP (0x200) must be set on Windows
        assert kw.get("creationflags", 0) & 0x200, kw
    else:
        # Non-Windows path: start_new_session must be set instead
        assert kw.get("start_new_session") is True, kw


# ---------- env override (highest priority) ----------

def test_T_TL_03_env_template_override():
    spawned = {}

    class FakeProc:
        pid = 99999

    def fake_popen(args, **kwargs):
        spawned["args"] = args
        spawned["kwargs"] = kwargs
        return FakeProc()

    with unittest.mock.patch.dict(
        os.environ, {"SP_TERMINAL_CMD": "myterm --workdir {cwd} -- pwsh -c '{cmd}'"}
    ):
        with unittest.mock.patch.object(subprocess, "Popen", side_effect=fake_popen):
            result = tl.spawn_terminal("D:\\repos\\foo", "resume", "abc-def-1234")

    assert result["ok"] is True, result
    assert result["method"] == "env-override", result
    assert result["pid"] == 99999
    # Template was substituted: {cwd} → D:\repos\foo, {cmd} → claude --resume abc-def-1234
    assert "D:\\repos\\foo" in spawned["args"], spawned
    assert "claude --resume abc-def-1234" in spawned["args"], spawned
    # shell=True path
    assert spawned["kwargs"].get("shell") is True


# ---------- wt fallback to cmd ----------

def test_T_TL_04_cmd_fallback_when_no_wt():
    spawned = {}

    class FakeProc:
        pid = 88888

    def fake_popen(args, **kwargs):
        spawned["args"] = args
        return FakeProc()

    def fake_which(exe):
        # Simulate fresh Windows 10 without wt.exe, no pwsh.exe, only powershell.exe
        if exe in ("wt.exe", "wt"):
            return None
        if exe in ("pwsh.exe", "pwsh"):
            return None
        if exe == "cmd.exe":
            return "C:\\Windows\\System32\\cmd.exe"
        return None

    # Ensure SP_TERMINAL_CMD is not set
    env_no_override = {k: v for k, v in os.environ.items() if k != "SP_TERMINAL_CMD"}
    with unittest.mock.patch.dict(os.environ, env_no_override, clear=True):
        with unittest.mock.patch("shutil.which", side_effect=fake_which):
            with unittest.mock.patch.object(subprocess, "Popen", side_effect=fake_popen):
                result = tl.spawn_terminal("D:\\repos\\bar", "resume", "deadbeef-cafe-1234-5678-aabbccddeeff")

    assert result["ok"] is True, result
    assert result["method"].startswith("cmd-fallback"), result
    assert result["method"].endswith("powershell"), "should fall back to powershell.exe when pwsh missing"
    assert "cmd.exe" in spawned["args"][0]
    assert "/c" in spawned["args"]
    assert "start" in spawned["args"]
    assert "D:\\repos\\bar" in spawned["args"], "cwd must be passed as /D <cwd>"


# ---------- open_vscode ----------

def test_T_TL_05_open_vscode_no_cli_returns_error():
    with unittest.mock.patch("shutil.which", return_value=None):
        result = tl.open_vscode("D:\\repos\\foo")
    assert result["ok"] is False
    assert "not found" in result["error"].lower()


def test_T_TL_07_wt_pwsh_availability_check():
    # Both available
    with unittest.mock.patch("shutil.which", side_effect=lambda x: "C:\\fake\\path"):
        assert tl._wt_available() is True
        assert tl._pwsh_available() is True
    # Neither available
    with unittest.mock.patch("shutil.which", return_value=None):
        assert tl._wt_available() is False
        assert tl._pwsh_available() is False


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
