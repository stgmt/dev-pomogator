"""
SP047-SP050: single-instance launcher + standalone-app identity.

1:1 with the scenarios in .specs/session-pilot/session-pilot.feature (@feature27 /
@feature23). All tests call the REAL PowerShell (sp-common.ps1 / launch.ps1 /
create-launcher helpers) — no inline copies, no file-inspection-only asserts.

  SP047  first launch opens exactly one window            (GUI integration, gated)
  SP048  re-launch focuses existing, never opens a 2nd    (GUI integration, gated)
  SP049  shortcut carries custom icon + AppUserModelID     (deterministic)
  SP050  Test-SpProfileMatch predicate drives single-inst  (deterministic)

GUI tests (SP047/SP048) open/close real Edge windows, so they are gated behind
SP_GUI_TEST=1 (default: skip cleanly) to keep the default suite fast and
side-effect-free. Run the full set with: SP_GUI_TEST=1 python tests/test_launcher.py

Windows-only (Edge / WScript.Shell / Shell.Application). Skips cleanly elsewhere.
"""

import base64
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve()
COMMON = _HERE.parent.parent / "sp-common.ps1"            # tools/session-pilot/sp-common.ps1
LAUNCH = _HERE.parents[3] / "launch.ps1"                  # extensions/session-pilot/launch.ps1
_PWSH = shutil.which("pwsh") or shutil.which("powershell")
_GUI = os.environ.get("SP_GUI_TEST") == "1"


class _Skip(Exception):
    """Raised to skip a test (counts as PASS in the runner)."""


def _ps(snippet: str, timeout: int = 60) -> str:
    """Dot-source sp-common.ps1, run snippet, return trimmed stdout.

    Uses -EncodedCommand (UTF-16LE base64) so embedded quotes/paths survive
    Windows command-line quoting untouched.
    """
    script = f". '{COMMON}'\n{snippet}\n"
    enc = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    r = subprocess.run(
        [_PWSH, "-NoProfile", "-NonInteractive", "-EncodedCommand", enc],
        capture_output=True, text=True, timeout=timeout,
    )
    if r.returncode != 0:
        raise AssertionError(f"pwsh exited {r.returncode}: {r.stderr.strip()}")
    return r.stdout.strip()


def _window_count() -> int:
    return int(_ps(
        "@(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
        "Where-Object { Test-SpProfileMatch $_.CommandLine } | "
        "ForEach-Object { Get-Process -Id $_.ProcessId -EA SilentlyContinue } | "
        "Where-Object { $_.MainWindowHandle -ne 0 }).Count"
    ))


def _close_windows():
    _ps(
        "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
        "Where-Object { Test-SpProfileMatch $_.CommandLine } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"
    )
    time.sleep(1)


def _run_launch(timeout: int = 60) -> str:
    r = subprocess.run(
        [_PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(LAUNCH)],
        capture_output=True, text=True, timeout=timeout,
    )
    return (r.stdout + r.stderr).strip()


# ---------- SP047: first launch opens exactly one window (GUI) ----------
def test_SP047_first_launch_opens_one_window():
    if not _GUI:
        raise _Skip("set SP_GUI_TEST=1 to run GUI integration")
    _close_windows()
    assert _window_count() == 0, "precondition: no dashboard window"
    try:
        _run_launch()
        time.sleep(5)
        assert _window_count() == 1, f"expected exactly 1 window, got {_window_count()}"
    finally:
        _close_windows()


# ---------- SP048: re-launch focuses existing, no 2nd window (GUI) ----------
def test_SP048_relaunch_focuses_existing_no_second_window():
    if not _GUI:
        raise _Skip("set SP_GUI_TEST=1 to run GUI integration")
    _close_windows()
    try:
        _run_launch(); time.sleep(5)
        assert _window_count() == 1, "setup: one window after first launch"
        out = _run_launch(); time.sleep(2)
        assert "focusing existing" in out.lower(), f"expected focus message, got: {out!r}"
        assert _window_count() == 1, f"single-instance broken: {_window_count()} windows"
    finally:
        _close_windows()


# ---------- SP049: shortcut carries custom icon + AppUserModelID ----------
def test_SP049_shortcut_has_custom_icon_and_appusermodelid():
    # Exercises the real create-launcher building blocks (Ensure-SpIcon +
    # Set-SpShortcutAppId) on a throwaway .lnk, then reads the identity back via
    # the shell — proves icon generation + the IPropertyStore AUMID stamp persist.
    out = _ps(
        "$icon = Ensure-SpIcon; "
        "$okIcon = [bool]($icon -and (Test-Path $icon) -and (Get-Item $icon).Length -gt 0); "
        "$t = Join-Path $env:TEMP 'sp-test-sp049.lnk'; "
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($t); "
        "$s.TargetPath = 'C:\\Windows\\System32\\cmd.exe'; $s.IconLocation = $icon; $s.Save(); "
        "Set-SpShortcutAppId $t; "
        "$sh = New-Object -ComObject Shell.Application; "
        "$f = $sh.Namespace((Split-Path $t)); $it = $f.ParseName((Split-Path $t -Leaf)); "
        "$aumid = $it.ExtendedProperty('System.AppUserModel.ID'); "
        "Remove-Item $t -EA SilentlyContinue; "
        "\"$okIcon|$aumid|$($icon.ToLower().EndsWith('session-pilot.ico'))\""
    )
    ok_icon, aumid, icon_named = out.split("|")
    assert ok_icon == "True", f"icon not generated: {out}"
    assert aumid == "ClaudeCode.SessionPilot", f"AppUserModelID not stamped: {out}"
    assert icon_named == "True", f"icon path not session-pilot.ico: {out}"


# ---------- SP050: profile-match predicate drives single-instance ----------
def test_SP050_profile_match_predicate():
    out = _ps(
        "$p = $SpProfileDir; "
        "$hit  = Test-SpProfileMatch \"msedge.exe --app=x --user-data-dir=$p\"; "
        "$miss = Test-SpProfileMatch 'msedge.exe --app=http://127.0.0.1:8083/'; "
        "$ci   = Test-SpProfileMatch \"x --user-data-dir=$($p.ToUpper())\"; "
        "\"$hit|$miss|$ci\""
    )
    assert out == "True|False|True", f"predicate wrong: {out}"


# ---------- runner ----------
if __name__ == "__main__":
    if sys.platform != "win32" or not _PWSH:
        print("SKIP test_launcher (Windows + PowerShell required)")
        sys.exit(0)
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except _Skip as e:
                print(f"SKIP {name}: {e}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
