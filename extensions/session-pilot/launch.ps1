<#
.SYNOPSIS
  Session Pilot one-click launcher — ensure server up, open dashboard as a
  standalone app window (own taskbar icon).

.DESCRIPTION
  The desktop shortcut / session-pilot.bat call this. Idempotent:
    1. Probe http://127.0.0.1:<Port>/api/health
    2. If down → run start-server.ps1, wait up to 6s for health
    3. Open the dashboard in Edge/Chrome `--app=` mode (standalone PWA-style
       window with its own taskbar entry + site favicon). Falls back to the
       default browser if neither Edge nor Chrome is installed.

  Single source of truth for the port — fixes the previous 8083-vs-8084
  mismatch between the .bat and the .lnk.

.PARAMETER Port
  Dashboard port. Default 8083 (or $env:WT_DASHBOARD_PORT if set).

.NOTES
  Per FR-22/FR-23 (.specs/session-pilot/FR.md). Replaces the arg-ignoring
  inline PowerShell that used to live in session-pilot.bat.
#>
[CmdletBinding()]
param(
  [int]$Port = $(if ($env:WT_DASHBOARD_PORT) { [int]$env:WT_DASHBOARD_PORT } else { 8083 })
)

$ErrorActionPreference = 'Stop'

$url     = "http://127.0.0.1:$Port/"
$health  = "http://127.0.0.1:$Port/api/health"
$starter = Join-Path $PSScriptRoot 'tools\session-pilot\start-server.ps1'
$profileDir = Join-Path $env:LOCALAPPDATA 'session-pilot\browser-profile'

function Test-Health {
  try { Invoke-WebRequest -Uri $health -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true }
  catch { return $false }
}

# -- 1/2: ensure server alive --------------------------------------------------
if (Test-Health) {
  Write-Host "Session Pilot already running on $url"
} else {
  Write-Host "Starting Session Pilot..."
  if (-not (Test-Path $starter)) {
    Write-Warning "start-server.ps1 not found at $starter — cannot autostart server."
  } else {
    & $starter
    $alive = $false
    for ($i = 0; $i -lt 12; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-Health) { $alive = $true; break }
    }
    if ($alive) { Write-Host "Server up on $url" }
    else { Write-Warning "Server did not respond within 6s — opening anyway, check $env:LOCALAPPDATA\session-pilot\server.log.err" }
  }
}

# -- 3: open dashboard as a standalone app window ------------------------------
$browser = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
  Start-Process $browser -ArgumentList "--app=$url", "--user-data-dir=`"$profileDir`""
  Write-Host "Opened standalone window via $(Split-Path $browser -Leaf)"
} else {
  Write-Warning "Edge/Chrome not found — opening in default browser (no standalone window)."
  Start-Process $url
}
