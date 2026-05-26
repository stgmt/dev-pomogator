<#
.SYNOPSIS
  Create a Session Pilot taskbar launcher for Windows — a Desktop .lnk that runs
  the single-instance launcher (launch.ps1) with a custom icon + AppUserModelID.

.DESCRIPTION
  Per FR-23 + FR-27 (.specs/session-pilot/FR.md). Creates `Session Pilot.lnk` on
  the Desktop pointing at a hidden PowerShell that runs launch.ps1. launch.ps1:
    - focuses an already-open dashboard window (single-instance), OR
    - ensures the server is up and opens exactly one Edge/Chrome `--app=` window.
  The shortcut carries a generated `session-pilot.ico` and the AppUserModelID
  `ClaudeCode.SessionPilot` so it reads as a distinct, pinnable taskbar app
  (not "Edge").

  Idempotent: re-running overwrites the .lnk with current settings.
  Win 10/11 deprecated programmatic taskbar pinning — one-time manual pin step.

.PARAMETER Pin
  Try the legacy Shell.Application "Pin to taskbar" verb (Win 10 only; Win 11 no-ops).

.NOTES
  Config + helpers come from sp-common.ps1. Port via $env:WT_DASHBOARD_PORT.
#>
[CmdletBinding()]
param([switch]$Pin)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sp-common.ps1')

# launch.ps1 lives two levels up (extensions/session-pilot/launch.ps1)
$launch = (Resolve-Path (Join-Path $PSScriptRoot '..\..\launch.ps1')).Path

# A standalone --app window needs Edge/Chrome; warn (launch.ps1 falls back to default browser)
if (-not (Find-SpBrowser)) {
  Write-Warning "Edge/Chrome not found — the launcher will fall back to the default browser (no standalone window)."
}

# Version-stable PowerShell exe for the shortcut target (survives pwsh updates)
$psExe = $null
$stub = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'        # Store alias — stable
$sys  = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'  # always present
if (Test-Path $stub) { $psExe = $stub } elseif (Test-Path $sys) { $psExe = $sys }
else { Write-Error 'No stable PowerShell executable found.'; exit 1 }

$icon = Ensure-SpIcon
$iconLocation = if ($icon) { $icon } else { "$psExe,0" }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Session Pilot.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = $psExe
$shortcut.Arguments        = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launch`""
$shortcut.WorkingDirectory = Split-Path $launch -Parent
$shortcut.IconLocation     = $iconLocation
$shortcut.Description       = "Session Pilot — multi-worktree Claude Code dashboard ($SpUrl)"
$shortcut.WindowStyle      = 7   # minimized — no console flash
$shortcut.Save()

# Distinct, pinnable taskbar identity (best-effort; non-fatal if it fails)
Set-SpShortcutAppId $lnkPath

Write-Host "✅ Created: $lnkPath"
Write-Host "   Runs:    launch.ps1 (single-instance) — icon: $iconLocation"
Write-Host ""
Write-Host "Next step — pin to taskbar:"
Write-Host "  1. Find 'Session Pilot' icon on Desktop"
Write-Host "  2. Right-click → 'Show more options' → 'Pin to taskbar'"
Write-Host ""

if ($Pin) {
  try {
    $shellApp = New-Object -ComObject Shell.Application
    $folder = $shellApp.Namespace($desktop)
    $item = $folder.ParseName('Session Pilot.lnk')
    $verb = $item.Verbs() | Where-Object { $_.Name -replace '&','' -match '(?i)pin to taskbar|закрепить на панели задач' } | Select-Object -First 1
    if ($verb) { $verb.DoIt(); Write-Host "✅ Pinned to taskbar via legacy COM verb (Win 10 only)" }
    else { Write-Host "⚠ Pin verb not available. Manual right-click → Pin to taskbar required." }
  } catch { Write-Host "⚠ Pin attempt failed: $_. Manual right-click → Pin to taskbar required." }
}

# Open Explorer with the icon highlighted so the user can immediately drag/pin
Start-Process explorer.exe "/select,`"$lnkPath`""
exit 0
