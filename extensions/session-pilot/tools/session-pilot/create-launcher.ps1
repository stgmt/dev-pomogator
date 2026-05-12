<#
.SYNOPSIS
  Create a Session Pilot taskbar launcher for Windows — Desktop .lnk that opens
  the dashboard in Edge `--app=` mode (standalone window with own taskbar entry).

.DESCRIPTION
  Per FR-23 / AC-23 (.specs/session-pilot/FR.md). Creates `Session Pilot.lnk` on
  user's Desktop pointing to `msedge.exe --app=http://127.0.0.1:<port>` (Chrome
  fallback if Edge absent). Edge/Chrome `--app=URL` flag opens the URL as a
  standalone PWA-style window — has its own icon in taskbar, no browser chrome,
  bookmark bar, or tabs.

  Idempotent: re-running overwrites the .lnk with current settings.

  After running, user manually right-clicks the desktop icon → "Pin to taskbar"
  (Win 10/11 deprecated the programmatic Pin verb). One-time manual step.

.PARAMETER Port
  Dashboard port (default 8083). Override via env $env:WT_DASHBOARD_PORT or this arg.

.PARAMETER Pin
  Try the legacy COM verb to pin to taskbar. Win 10 1809+ blocks this for security;
  fallback is to open Explorer at the .lnk location and instruct user.

.EXAMPLE
  pwsh -File extensions/session-pilot/tools/session-pilot/create-launcher.ps1

.EXAMPLE
  pwsh -File create-launcher.ps1 -Port 8084
#>

[CmdletBinding()]
param(
  [int]$Port = $(if ($env:WT_DASHBOARD_PORT) { [int]$env:WT_DASHBOARD_PORT } else { 8083 }),
  [switch]$Pin
)

$ErrorActionPreference = 'Stop'

$url = "http://127.0.0.1:$Port/"

# Locate browser: Edge first, then Chrome, then default browser
$browserExe = $null
$candidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
foreach ($c in $candidates) {
  if (Test-Path $c) { $browserExe = $c; break }
}

if (-not $browserExe) {
  Write-Error "Edge or Chrome not found in standard install paths. Install one of them, or edit this script to point at your browser's --app-supporting exe."
  exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Session Pilot.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $browserExe
$shortcut.Arguments = "--app=$url --user-data-dir=`"$env:LOCALAPPDATA\session-pilot\browser-profile`""
$shortcut.WorkingDirectory = Split-Path $browserExe -Parent
$shortcut.IconLocation = "$browserExe,0"
$shortcut.Description = "Session Pilot — multi-worktree Claude Code dashboard at $url"
$shortcut.WindowStyle = 1  # Normal window
$shortcut.Save()

Write-Host "✅ Created: $lnkPath"
Write-Host "   Target:  $browserExe --app=$url"
Write-Host ""
Write-Host "Next step — pin to taskbar:"
Write-Host "  1. Find 'Session Pilot' icon on Desktop"
Write-Host "  2. Right-click → 'Show more options' → 'Pin to taskbar'"
Write-Host "     (Win 10/11 hides Pin behind 'Show more options' shift-right-click)"
Write-Host ""

if ($Pin) {
  # Legacy Shell.Application verb invocation — works on older Win 10, blocked on Win 11 22H2+
  try {
    $shellApp = New-Object -ComObject Shell.Application
    $folder = $shellApp.Namespace($desktop)
    $item = $folder.ParseName('Session Pilot.lnk')
    $verb = $item.Verbs() | Where-Object { $_.Name -replace '&','' -match '(?i)pin to taskbar|закрепить на панели задач' } | Select-Object -First 1
    if ($verb) {
      $verb.DoIt()
      Write-Host "✅ Pinned to taskbar via legacy COM verb (Win 10 only — Win 11 silently no-ops)"
    } else {
      Write-Host "⚠ Pin verb not available. Manual right-click → Pin to taskbar required."
    }
  } catch {
    Write-Host "⚠ Pin attempt failed: $_. Manual right-click → Pin to taskbar required."
  }
}

# Open Explorer at Desktop with icon highlighted, so user can immediately drag/pin
Start-Process explorer.exe "/select,`"$lnkPath`""

exit 0
