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
LAUNCH = _HERE.parents[1] / "launch.ps1"                  # tools/session-pilot/launch.ps1
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


# ---------- SP051: launcher path integrity after v2 canonical migration ----------
def test_SP051_launcher_paths_resolve_to_existing_siblings():
    """Deterministic, ungated regression guard for the v1->v2 path break.

    The canonical migration moved the bundle from extensions/session-pilot/... to
    tools/session-pilot/. The launcher scripts kept v1-relative paths (`..\\..\\launch.ps1`,
    `tools\\session-pilot\\sp-common.ps1`, `extensions\\session-pilot\\...\\server.py`),
    so the Desktop shortcut launched a non-existent script and failed silently. The
    GUI tests that exercise launch.ps1 are SP_GUI_TEST-gated, so nothing caught it.
    This test runs everywhere (file reads only) and fails if any launcher script
    references a sibling that does not resolve, or still carries the v1 prefix.
    """
    sp_dir = _HERE.parents[1]  # tools/session-pilot
    # 1. The siblings every launcher script depends on must exist in tools/session-pilot.
    for f in ("launch.ps1", "sp-common.ps1", "server.py", "start-server.ps1", "create-launcher.ps1"):
        assert (sp_dir / f).is_file(), f"missing launcher sibling: {f}"

    # 2. No launcher script may carry the v1 'extensions/session-pilot' prefix.
    scripts = ["launch.ps1", "create-launcher.ps1", "install.ps1", "start-server.ps1", "session-pilot.bat"]
    for name in scripts:
        text = (sp_dir / name).read_text(encoding="utf-8")
        assert "extensions\\session-pilot" not in text and "extensions/session-pilot" not in text, \
            f"{name} still references the deleted v1 extensions/session-pilot path"

    # 3. The same-dir $PSScriptRoot references must resolve to existing files
    #    (emulate PowerShell: $PSScriptRoot == the script's own directory).
    import re
    create = (sp_dir / "create-launcher.ps1").read_text(encoding="utf-8")
    m = re.search(r"Join-Path \$PSScriptRoot '([^']*launch\.ps1)'", create)
    assert m, "create-launcher.ps1 no longer joins launch.ps1 via $PSScriptRoot"
    assert (sp_dir / m.group(1)).resolve().is_file(), \
        f"create-launcher.ps1 launch.ps1 path does not resolve: {m.group(1)}"

    launch = (sp_dir / "launch.ps1").read_text(encoding="utf-8")
    m = re.search(r"Join-Path \$PSScriptRoot '([^']*sp-common\.ps1)'", launch)
    assert m, "launch.ps1 no longer dot-sources sp-common.ps1 via $PSScriptRoot"
    assert (sp_dir / m.group(1)).resolve().is_file(), \
        f"launch.ps1 sp-common.ps1 path does not resolve: {m.group(1)}"


# ---------- SP052: every delivery-path entrypoint file exists (cross-platform) ----------
def test_SP052_delivery_path_entrypoints_exist():
    """'No dangling entry point' guard (extends SP051 to the full delivery surface).

    session-pilot has 4 ways to come alive (autostart hook, desktop shortcut, the
    skill, the installer). The durability audit
    (audit-reports/session-pilot-durability-2026-07-02.md) found several referenced
    files MISSING (start-server.sh, install.sh) -> the skill's `bash start-server.sh`
    and the whole Linux/mac path were dead. This guard fails if any entrypoint
    disappears again. File reads only -> runs on EVERY OS incl. Linux CI.
    """
    sp = _HERE.parents[1]  # tools/session-pilot
    required = [
        "start-server.ps1", "start-server.sh",          # server starters (Win / *nix)
        "install.ps1", "install.sh",                    # installers (Win / *nix)
        "autostart_hook.ts",                            # the durable SessionStart hook
        "create-launcher.ps1", "create-launcher.sh",    # desktop/dock launchers
        "launch.ps1", "sp-common.ps1", "server.py",
    ]
    missing = [f for f in required if not (sp / f).is_file()]
    assert not missing, f"missing session-pilot delivery-path entrypoints: {missing}"

    # If the skill invokes `bash start-server.sh`, that file MUST exist (it was
    # absent, breaking the skill's health-check flow on every OS).
    skill = _HERE.parents[3] / ".claude" / "skills" / "session-pilot" / "SKILL.md"
    if skill.is_file() and "start-server.sh" in skill.read_text(encoding="utf-8"):
        assert (sp / "start-server.sh").is_file(), \
            "SKILL.md references start-server.sh but the file is missing"


# ---------- SP053: autostart hook wired in BOTH distribution manifests (cross-platform) ----------
def test_SP053_autostart_hook_registered_in_both_manifests():
    """The autostart SessionStart hook must be registered where it TRAVELS.

    Root cause of 'dead on another machine': the autostart wiring lived only in the
    per-machine, non-distributed .claude/settings.local.json. This guard fails if
    autostart_hook.ts is not registered in BOTH:
      - .claude-plugin/hooks.json  (canonical plugin distribution -> other machines)
      - .claude/settings.json      (repo dogfood)
    JSON reads only -> runs on EVERY OS incl. Linux CI. This is THE guard that stops
    the durability regression from silently coming back.
    """
    import json
    root = _HERE.parents[3]  # repo root

    def _wired(manifest_path):
        assert manifest_path.is_file(), f"manifest missing: {manifest_path}"
        d = json.loads(manifest_path.read_text(encoding="utf-8"))
        ss = d.get("hooks", {}).get("SessionStart", [])
        cmds = [h.get("command", "") for e in ss for h in e.get("hooks", [])]
        return any("session-pilot/autostart_hook.ts" in c for c in cmds)

    assert _wired(root / ".claude-plugin" / "hooks.json"), \
        "autostart_hook.ts NOT in .claude-plugin/hooks.json -> won't travel to other machines"
    assert _wired(root / ".claude" / "settings.json"), \
        "autostart_hook.ts NOT in .claude/settings.json -> repo dogfood not wired"


# ---------- SP054: cold-start via the REAL hook brings the server up (Windows) ----------
def test_SP054_cold_start_via_hook_brings_server_up():
    """Integration: kill the server, run the autostart hook EXACTLY as the harness
    does (bootstrap.cjs -> tsx-runner -> autostart_hook.ts), assert /api/health
    responds. Per dead-integration-guard: cold-start via the REAL launcher -- do NOT
    presume a running server the way test_e2e does. Windows-only (LOCALAPPDATA +
    powershell); the Linux/bash path is exercised by the CI 'cold start' step.
    """
    if sys.platform != "win32":
        raise _Skip("Windows-only cold-start (Linux/bash path covered by CI)")
    import urllib.request
    root = _HERE.parents[3]
    state = Path(os.environ["LOCALAPPDATA"]) / "session-pilot"
    pidf = state / "server.pid"
    if pidf.exists():
        try:
            subprocess.run(["taskkill", "/F", "/PID", str(int(pidf.read_text().split()[0]))],
                           capture_output=True)
        except Exception:
            pass
        try: pidf.unlink()
        except OSError: pass
    time.sleep(1)

    def _health() -> bool:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8083/api/health", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    boot = ("require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT,"
            "'tools','_shared','bootstrap.cjs'))")
    r = subprocess.run(
        ["node", "-e", boot, "--", "tools/session-pilot/autostart_hook.ts"],
        cwd=str(root), input="{}", text=True, capture_output=True, timeout=30,
        env={**os.environ, "CLAUDE_PLUGIN_ROOT": str(root)},
    )
    assert r.returncode == 0, f"hook exited {r.returncode}: {r.stderr[:400]}"
    up = any(_health() or time.sleep(0.5) for _ in range(16))
    assert up, "server did NOT come up after the autostart hook -- durable delivery path is broken"


# ---------- runner ----------
def _run(name_filter) -> int:
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn) and name_filter(name):
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
    return failed


if __name__ == "__main__":
    # Cross-platform delivery-path guards (file/JSON only) run EVERYWHERE, incl.
    # Linux CI -- they are the recurrence-stopper for the durability rot.
    XPLAT = {
        "test_SP051_launcher_paths_resolve_to_existing_siblings",
        "test_SP052_delivery_path_entrypoints_exist",
        "test_SP053_autostart_hook_registered_in_both_manifests",
    }
    failed = _run(lambda n: n in XPLAT)
    if sys.platform == "win32" and _PWSH:
        failed += _run(lambda n: n not in XPLAT)
    else:
        print("SKIP Windows-only launcher tests (SP047-050, SP054) -- non-Windows")
    sys.exit(1 if failed else 0)
