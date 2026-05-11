<#
.SYNOPSIS
  Idempotent autostart for Session Pilot v0.3 — Windows-native.

.DESCRIPTION
  Registered as Claude Code SessionStart hook. Each invocation:
    1. Read PID file at $env:LOCALAPPDATA\session-pilot\server.pid
    2. If PID alive (Get-Process succeeds) → exit 0 silently
    3. Otherwise spawn detached python.exe server.py, write new PID, exit 0
  Health probe is optional — install.ps1 does it; runtime invocations skip
  to keep SessionStart latency low.

.NOTES
  Per FR-13 (.specs/session-pilot/FR.md) + AC-13.
#>

$ErrorActionPreference = 'Stop'

$stateDir = Join-Path $env:LOCALAPPDATA 'session-pilot'
if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir | Out-Null }
$pidFile = Join-Path $stateDir 'server.pid'
$logFile = Join-Path $stateDir 'server.log'

# Idempotency: alive PID → exit silently
if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingPid -match '^\d+$') {
    $alive = Get-Process -Id [int]$existingPid -ErrorAction SilentlyContinue
    if ($alive -and $alive.ProcessName -match 'python') {
      # Server already running — quiet exit
      exit 0
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Locate server.py — same directory as this script
$serverPy = Join-Path $PSScriptRoot 'server.py'
if (-not (Test-Path $serverPy)) {
  Write-Error "server.py not found at $serverPy"
  exit 1
}

# Locate python — prefer python.exe on PATH, fall back to py launcher
$pythonExe = $null
foreach ($cand in @('python.exe', 'python3.exe', 'py.exe')) {
  $found = Get-Command $cand -ErrorAction SilentlyContinue
  if ($found) { $pythonExe = $found.Source; break }
}
if (-not $pythonExe) {
  Write-Error "python.exe not found on PATH"
  exit 1
}

# Spawn detached. -WindowStyle Hidden keeps it invisible; output goes to log file.
$proc = Start-Process -FilePath $pythonExe -ArgumentList $serverPy `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError "$logFile.err" `
  -PassThru

if (-not $proc) {
  Write-Error "Failed to spawn server"
  exit 1
}

# Write PID
$proc.Id | Out-File -FilePath $pidFile -Encoding ascii

# SessionStart hook latency budget: keep under 200ms. Don't probe health here —
# install.ps1 does that. Exit silently.
exit 0
