<#
.SYNOPSIS
  Session Pilot one-click launcher — single-instance standalone app window.

.DESCRIPTION
  The desktop shortcut / session-pilot.bat call this. Behavior:
    1. If a dashboard window is already open → restore + focus it, exit.
       (Single-instance: never spawn a 2nd window — fixes the 10-20-windows pain.)
    2. Otherwise ensure the server is up (start-server.ps1 if down), then open
       exactly ONE Edge/Chrome `--app=` window (standalone, own taskbar entry).
       Falls back to the default browser if neither Edge nor Chrome is installed.

  All config + helpers live in tools/session-pilot/sp-common.ps1 (single source
  of truth for port/url/profile/app-id/window-detection/focus).

.NOTES
  Per FR-23 + FR-27 (.specs/session-pilot/FR.md). Port via $env:WT_DASHBOARD_PORT.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\session-pilot\sp-common.ps1')
Set-SpProcessAppId   # best-effort taskbar grouping under $SpAppId

# -- 1: single-instance — focus existing window if one is already open ---------
$existing = Get-SpDashboardProcess
if ($existing) {
  Write-Host "Session Pilot already open — focusing existing window."
  Show-SpWindow $existing.MainWindowHandle
  exit 0
}

# -- 2: ensure server alive ----------------------------------------------------
if (Test-SpHealth) {
  Write-Host "Server already running on $SpUrl"
} else {
  Write-Host "Starting Session Pilot..."
  if (Ensure-SpServer) { Write-Host "Server up on $SpUrl" }
  else { Write-Warning "Server did not respond within 6s — opening anyway, check $SpStateDir\server.log.err" }
}

# -- 3: open exactly one standalone app window ---------------------------------
$browser = Find-SpBrowser
if ($browser) {
  Start-Process $browser -ArgumentList "--app=$SpUrl", "--user-data-dir=`"$SpProfileDir`""
  Write-Host "Opened standalone window via $(Split-Path $browser -Leaf)"
} else {
  Write-Warning "Edge/Chrome not found — opening in default browser (no standalone window)."
  Start-Process $SpUrl
}
