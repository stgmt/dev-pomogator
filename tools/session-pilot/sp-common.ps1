<#
.SYNOPSIS
  Session Pilot launcher -- shared configuration + helpers.

.DESCRIPTION
  Single source of truth dot-sourced by launch.ps1, create-launcher.ps1 and
  start-server.ps1. Holds the port/url/profile/app-id/icon constants and the
  window-detection / focus / icon / shortcut-identity helpers that make the
  dashboard behave like a single-instance standalone Windows app.

  Single-instance key: the dashboard always runs in a dedicated --user-data-dir
  ($SpProfileDir). Any msedge.exe whose command line references that dir IS our
  window -- a reliable detection key (no fragile title matching required).
#>

# -- Constants -----------------------------------------------------------------
$script:SpToolsDir   = $PSScriptRoot                                  # tools/session-pilot
$SpPort      = if ($env:WT_DASHBOARD_PORT) { [int]$env:WT_DASHBOARD_PORT } else { 8083 }
$SpUrl       = "http://127.0.0.1:$SpPort/"
$SpHealthUrl = "http://127.0.0.1:$SpPort/api/health"
$SpStateDir  = Join-Path $env:LOCALAPPDATA 'session-pilot'
$SpProfileDir = Join-Path $SpStateDir 'browser-profile'
$SpAppId     = 'ClaudeCode.SessionPilot'        # AppUserModelID -- distinct taskbar identity
$SpWindowTitle = 'Worktree Dashboard'           # dashboard <title>, secondary detect signal
$SpIconPath  = Join-Path $SpStateDir 'session-pilot.ico'
$SpStarter   = Join-Path $script:SpToolsDir 'start-server.ps1'

# -- Win32 P/Invoke (window restore + foreground) -- compiled lazily ------------
# Add-Type C# compilation costs ~100-300ms, so it is NOT done at dot-source time.
# start-server.ps1 (a SessionStart hook with a <200ms budget) dot-sources this
# file for constants only and never triggers the compile.
function Initialize-SpWin {
  if (([System.Management.Automation.PSTypeName]'SpWin').Type) { return }
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SpWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string id);
  public const int SW_RESTORE = 9;
}
"@
}

function Set-SpProcessAppId {
  # Best-effort taskbar grouping for this launcher process.
  Initialize-SpWin
  try { [SpWin]::SetCurrentProcessExplicitAppUserModelID($SpAppId) | Out-Null } catch {}
}

# -- Browser detection (Edge -> Chrome -> none) --------------------------------
function Find-SpBrowser {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

# -- Server health + ensure ----------------------------------------------------
function Test-SpHealth {
  try { Invoke-WebRequest -Uri $SpHealthUrl -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true }
  catch { return $false }
}

function Ensure-SpServer {
  # Probe health; if down, run start-server.ps1 and wait up to 6s. Returns $true if up.
  if (Test-SpHealth) { return $true }
  if (-not (Test-Path $SpStarter)) {
    Write-Warning "start-server.ps1 not found at $SpStarter -- cannot autostart server."
    return $false
  }
  & $SpStarter
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-SpHealth) { return $true }
  }
  return $false
}

# -- Single-instance window detection ------------------------------------------
function Test-SpProfileMatch {
  # Pure predicate: does this browser command line belong to OUR dashboard?
  # (i.e. references the dedicated --user-data-dir profile). Case-insensitive.
  # Extracted for deterministic testing of the single-instance match logic.
  param([string]$CommandLine)
  return [bool]($CommandLine -and $CommandLine.ToLower().Contains($SpProfileDir.ToLower()))
}

function Get-SpDashboardProcess {
  # Return the browser process running OUR dashboard (matched by the dedicated
  # --user-data-dir profile in its command line) that owns a visible window.
  # Returns $null if none. Stale/dead windows naturally don't match.
  try {
    $cim = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction Stop |
      Where-Object { Test-SpProfileMatch $_.CommandLine }
  } catch { return $null }
  foreach ($c in $cim) {
    $p = Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) { return $p }
  }
  return $null
}

function Show-SpWindow {
  param([Parameter(Mandatory)][IntPtr]$Handle)
  Initialize-SpWin
  [SpWin]::ShowWindow($Handle, [SpWin]::SW_RESTORE) | Out-Null
  [SpWin]::SetForegroundWindow($Handle) | Out-Null
}

# -- Icon generation -----------------------------------------------------------
function Ensure-SpIcon {
  # Generate a simple branded .ico (rounded square + "SP") into $SpIconPath if
  # absent. Self-contained -- no binary asset committed to the repo.
  if (Test-Path $SpIconPath) { return $SpIconPath }
  if (-not (Test-Path $SpStateDir)) { New-Item -ItemType Directory -Path $SpStateDir -Force | Out-Null }
  try {
    Add-Type -AssemblyName System.Drawing
    $size = 64
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 36, 41, 51))
    $g.FillRectangle($bg, 2, 2, $size-4, $size-4)
    $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 88, 166, 255))
    $font = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString('SP', $font, $accent, (New-Object System.Drawing.RectangleF(0,0,$size,$size)), $fmt)
    $g.Dispose()
    $hicon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hicon)
    $fs = [System.IO.File]::Create($SpIconPath)
    $icon.Save($fs)
    $fs.Close(); $icon.Dispose(); $bmp.Dispose()
    return $SpIconPath
  } catch {
    Write-Warning "Could not generate icon ($_) -- shortcut will fall back to browser icon."
    return $null
  }
}

# -- AppUserModelID on shortcut (IShellLink + IPropertyStore) -- compiled lazily -
function Initialize-SpShortcut {
  if (([System.Management.Automation.PSTypeName]'SpShortcut').Type) { return }
  Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class SpShortcut {
  [StructLayout(LayoutKind.Sequential)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] public struct PROPVARIANT {
    public ushort vt; public ushort r1; public ushort r2; public ushort r3; public IntPtr p; public int p2;
  }

  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out uint c);
    int GetAt(uint i, out PROPERTYKEY k);
    int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    int SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    int Commit();
  }

  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPersistFile {
    int GetClassID(out Guid pClassID);
    int IsDirty();
    int Load([MarshalAs(UnmanagedType.LPWStr)] string f, int mode);
    int Save([MarshalAs(UnmanagedType.LPWStr)] string f, [MarshalAs(UnmanagedType.Bool)] bool remember);
    int SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);
    int GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
  }

  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink {}

  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pvar);
  const ushort VT_LPWSTR = 31;

  public static void SetAppId(string lnkPath, string appId) {
    object o = new CShellLink();
    ((IPersistFile)o).Load(lnkPath, 2 /* STGM_READWRITE */);
    IPropertyStore store = (IPropertyStore)o;
    PROPERTYKEY key = new PROPERTYKEY {
      fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5
    };
    // Build PROPVARIANT(VT_LPWSTR) manually -- avoids propsys.dll
    // InitPropVariantFromString (not exported by name on all Windows builds).
    PROPVARIANT pv = new PROPVARIANT();
    pv.vt = VT_LPWSTR;
    pv.p = Marshal.StringToCoTaskMemUni(appId);
    store.SetValue(ref key, ref pv);
    store.Commit();
    PropVariantClear(ref pv);  // frees the LPWSTR buffer for VT_LPWSTR
    ((IPersistFile)o).Save(lnkPath, true);
    Marshal.ReleaseComObject(o);
  }
}
"@
}

function Set-SpShortcutAppId {
  param([Parameter(Mandatory)][string]$LnkPath)
  # Best-effort -- failure here is non-fatal (icon + single-instance still work).
  Initialize-SpShortcut
  try { [SpShortcut]::SetAppId($LnkPath, $SpAppId) } catch { Write-Warning "Could not set AppUserModelID on shortcut: $_" }
}
