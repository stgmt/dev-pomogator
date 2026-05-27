<#
.SYNOPSIS
  Session Pilot v0.3 — Windows install script.

.DESCRIPTION
  Idempotent setup:
    1. Verify Python >=3.10
    2. Install Python deps (none in v0.3 — stdlib only)
    3. Register SessionStart hook in Claude Code settings.local.json
    4. Start the dashboard server
    5. Verify /api/health responds 200 within 5s

.PARAMETER ProjectRoot
  Optional override for dev-pomogator clone root. Auto-detected via $PSScriptRoot.

.PARAMETER Force
  Re-register hook even if already present.

.EXAMPLE
  pwsh -File tools/session-pilot/install.ps1

.EXAMPLE
  iex (irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/session-pilot/install.ps1)

.NOTES
  Per FR-15 (.specs/session-pilot/FR.md) + AC-15. v0.3 pivot — Windows-only.
#>

[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!!] $msg" -ForegroundColor Yellow }

# -- Step 1: Python version check ---------------------------------------------
Write-Step "Checking Python >=3.10"
$pythonCmd = $null
foreach ($candidate in @('python.exe', 'python3.exe', 'py.exe')) {
  $found = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($found) { $pythonCmd = $found.Source; break }
}
if (-not $pythonCmd) {
  throw "Python not found on PATH. Install Python >=3.10 from python.org or Microsoft Store."
}
$verStr = & $pythonCmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1
$ver = [Version]"$verStr"
if ($ver -lt [Version]'3.10') {
  throw "Python $ver found at $pythonCmd, need >=3.10."
}
Write-Ok "Python $ver at $pythonCmd"

# -- Step 2: deps ---- v0.3 uses stdlib only, nothing to install --------------
Write-Step "Python deps (none in v0.3 — stdlib only)"
Write-Ok "skipped (stdlib only)"

# -- Step 3: Locate session-pilot bundle --------------------------------------
if (-not $ProjectRoot) {
  # Default: assume script lives in tools/session-pilot/, walk up 2 levels
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}
$serverPy = Join-Path $ProjectRoot 'extensions\session-pilot\tools\session-pilot\server.py'
if (-not (Test-Path $serverPy)) {
  throw "server.py not found at expected path $serverPy. Pass -ProjectRoot <path-to-dev-pomogator>."
}
Write-Ok "Project root: $ProjectRoot"

# -- Step 4: Register SessionStart hook in Claude Code settings.local.json ---
Write-Step "Registering SessionStart hook"
$claudeDir = Join-Path $ProjectRoot '.claude'
if (-not (Test-Path $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir | Out-Null }
$settingsPath = Join-Path $claudeDir 'settings.local.json'

$startServerPs1 = Join-Path $PSScriptRoot 'start-server.ps1'
if (-not (Test-Path $startServerPs1)) {
  throw "start-server.ps1 not found next to install.ps1. Are you running from a complete checkout?"
}

$hookCmd = "pwsh.exe -NoProfile -ExecutionPolicy Bypass -File `"$startServerPs1`""
# Fallback to powershell.exe if pwsh not available — discover at install time
if (-not (Get-Command 'pwsh.exe' -ErrorAction SilentlyContinue)) {
  $hookCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startServerPs1`""
  Write-Warn "PowerShell 7 (pwsh) not found — falling back to Windows PowerShell 5.1"
}

if (Test-Path $settingsPath) {
  $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [pscustomobject]@{}
}
if (-not $settings.PSObject.Properties['hooks']) {
  $settings | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([pscustomobject]@{})
}
if (-not $settings.hooks.PSObject.Properties['SessionStart']) {
  $settings.hooks | Add-Member -NotePropertyName 'SessionStart' -NotePropertyValue (@())
}

$existing = @($settings.hooks.SessionStart) | Where-Object {
  $_.hooks -and ($_.hooks | Where-Object { $_.command -like '*start-server.ps1*' })
}
if ($existing -and -not $Force) {
  Write-Ok "SessionStart hook already present (use -Force to re-register)"
} else {
  if ($existing) {
    Write-Warn "Re-registering existing hook (-Force)"
    $settings.hooks.SessionStart = @($settings.hooks.SessionStart) | Where-Object {
      -not ($_.hooks -and ($_.hooks | Where-Object { $_.command -like '*start-server.ps1*' }))
    }
  }
  $newEntry = [pscustomobject]@{
    matcher = '*'
    hooks = @([pscustomobject]@{
      type    = 'command'
      command = $hookCmd
      timeout = 30
    })
  }
  $settings.hooks.SessionStart = @($settings.hooks.SessionStart) + $newEntry
  $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding utf8
  Write-Ok "Hook registered in $settingsPath"
}

# -- Step 5: Start server + probe /api/health ---------------------------------
Write-Step "Starting server + probing /api/health"
& $startServerPs1
$deadline = (Get-Date).AddSeconds(5)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:8083/api/health' -UseBasicParsing -TimeoutSec 1
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Milliseconds 200 }
}
if (-not $healthy) {
  throw "Server did not become healthy within 5s. Check $env:LOCALAPPDATA\session-pilot\server.log"
}
Write-Ok "Server alive: http://127.0.0.1:8083"

Write-Host ""
Write-Host "Session Pilot v0.3 installed." -ForegroundColor Green
Write-Host "Dashboard: http://127.0.0.1:8083" -ForegroundColor Cyan
Write-Host "Server log: $env:LOCALAPPDATA\session-pilot\server.log"
