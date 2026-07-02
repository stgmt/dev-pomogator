<#
.SYNOPSIS
  Idempotent autostart for Session Pilot v0.3 -- Windows-native.

.DESCRIPTION
  Registered as Claude Code SessionStart hook. Each invocation:
    1. Read PID file at $env:LOCALAPPDATA\session-pilot\server.pid
    2. If PID alive (Get-Process succeeds) -> exit 0 silently
    3. Otherwise spawn detached python.exe server.py, write new PID, exit 0
  Health probe is optional -- install.ps1 does it; runtime invocations skip
  to keep SessionStart latency low.

.NOTES
  Per FR-13 (.specs/session-pilot/FR.md) + AC-13.
#>

$ErrorActionPreference = 'Stop'

# Shared constants ($SpStateDir, $SpPort, ...). Cheap: Add-Type is lazy in sp-common,
# so dot-sourcing here does NOT compile C# -- keeps the SessionStart latency budget.
. (Join-Path $PSScriptRoot 'sp-common.ps1')

$stateDir = $SpStateDir
if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir | Out-Null }
$pidFile = Join-Path $stateDir 'server.pid'
$logFile = Join-Path $stateDir 'server.log'
$launcherLog = Join-Path $stateDir 'launcher.log'

# Launcher-level breadcrumb -- records WHAT the launcher did, so a silent failure
# leaves a trace (server.log only ever holds the server's own stdout). This is the
# gap the durability audit named as Fix C: start-server.ps1 used to Write-Error
# into the void. Now every decision lands in launcher.log.
function Write-SpLog($m) {
  try {
    Add-Content -Path $launcherLog -ErrorAction SilentlyContinue -Value (
      '[{0}] start-server.ps1: {1}' -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $m)
  } catch {}
}

# Opt-out parity with autostart_hook.ts / start-server.sh.
if ($env:SP_NO_AUTOSTART -in @('1','true','yes','on')) { Write-SpLog 'SP_NO_AUTOSTART set -- skipping'; exit 0 }

# Idempotency: alive PID -> exit silently
if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingPid -match '^\d+$') {
    $alive = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
    if ($alive -and $alive.ProcessName -match 'python') {
      # Server already running -- quiet exit
      Write-SpLog "already running (pid $existingPid) -- quiet exit"
      exit 0
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Locate server.py -- same directory as this script
$serverPy = Join-Path $PSScriptRoot 'server.py'
if (-not (Test-Path $serverPy)) {
  Write-Error "server.py not found at $serverPy"
  exit 1
}

# Locate python -- prefer python.exe on PATH, fall back to py launcher
$pythonExe = $null
foreach ($cand in @('python.exe', 'python3.exe', 'py.exe')) {
  $found = Get-Command $cand -ErrorAction SilentlyContinue
  if ($found) { $pythonExe = $found.Source; break }
}
if (-not $pythonExe) {
  Write-SpLog "python.exe not found on PATH -- abort"
  Write-Error "python.exe not found on PATH"
  exit 1
}
Write-SpLog "spawning: $pythonExe $serverPy (bind $(if ($env:WT_DASHBOARD_BIND) { $env:WT_DASHBOARD_BIND } else { '127.0.0.1' }):$SpPort)"

# Spawn detached. -WindowStyle Hidden keeps it invisible; output goes to log file.
$proc = Start-Process -FilePath $pythonExe -ArgumentList $serverPy `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError "$logFile.err" `
  -PassThru

if (-not $proc) {
  Write-SpLog "Failed to spawn server"
  Write-Error "Failed to spawn server"
  exit 1
}

# Write PID
$proc.Id | Out-File -FilePath $pidFile -Encoding ascii
Write-SpLog "spawned pid $($proc.Id)"

# SessionStart hook latency budget: keep under 200ms. Don't probe health here --
# install.ps1 does that. Exit silently.
exit 0
