<#
.SYNOPSIS
    Launch Windows Terminal with Claude Code + TUI test runner side-by-side.

.DESCRIPTION
    Opens Windows Terminal with two horizontal panes:
    - Top (96%): Claude Code in the project directory
    - Bottom (12%, ~3 rows): Python TUI test runner in compact mode (Alt+Shift+Up to expand)

    The TUI automatically picks up test progress when /run-tests is used.

.PARAMETER ProjectDir
    Project directory. Defaults to git root or current directory.

.EXAMPLE
    .\scripts\launch-claude-tui.ps1
    .\scripts\launch-claude-tui.ps1 -ProjectDir D:\repos\my-project
#>
param(
    [string]$ProjectDir,
    [switch]$Yolo
)

$ErrorActionPreference = 'Stop'

# --- Resolve project root ---
if (-not $ProjectDir) {
    try {
        $ProjectDir = (git rev-parse --show-toplevel 2>$null)
    } catch {}
    if (-not $ProjectDir) {
        $ProjectDir = $PWD.Path
    }
}
$ProjectDir = (Resolve-Path $ProjectDir).Path

# --- Generate session prefix (8 hex chars) ---
$sessionPrefix = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# --- Ensure status directory exists ---
$statusDir = Join-Path (Join-Path $ProjectDir '.dev-pomogator') '.test-status'
if (-not (Test-Path $statusDir)) {
    New-Item -ItemType Directory -Path $statusDir -Force | Out-Null
}

$statusFile = Join-Path $statusDir "status.$sessionPrefix.yaml"
$logFile = Join-Path $statusDir "log.$sessionPrefix.txt"

# --- Detect Python ---
$python = $null
foreach ($candidate in @('python', 'python3', 'py')) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match 'Python 3\.') {
            $python = $candidate
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Warning "Python 3 not found. TUI pane will not start."
    Write-Host "Launching Claude Code only..."
    wt.exe -d $ProjectDir claude
    exit 0
}

# --- Build TUI command ---
$tuiModule = Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir '.dev-pomogator') 'tools') 'tui-test-runner') 'tui'
if (-not (Test-Path $tuiModule)) {
    # Fallback to extension source
    $tuiModule = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir 'extensions') 'tui-test-runner') 'tools') 'tui-test-runner') 'tui'
}

# PYTHONPATH must point to parent of tui/ so "python -m tui" resolves
$tuiParent = Split-Path $tuiModule -Parent

# --- Build wt.exe command ---
# Layout: Claude Code (75%) | TUI (25%)
# wt.exe parses each pane's command as separate arguments after the subcommand.
# Use cmd /c with a batch-style command string for env vars.

# Create a temporary launcher .cmd for Claude pane (avoids quoting hell with wt.exe)
$launcherDir = Join-Path $env:TEMP 'dev-pomogator-launch'
if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }

$claudeLauncher = Join-Path $launcherDir 'claude-pane.cmd'
@"
@echo off
set TEST_STATUSLINE_SESSION=$sessionPrefix
set TEST_STATUSLINE_PROJECT=$ProjectDir
$(if ($Yolo) { 'claude --dangerously-skip-permissions' } else { 'claude' })
"@ | Set-Content -Path $claudeLauncher -Encoding ASCII

$tuiLauncher = Join-Path $launcherDir 'tui-pane.cmd'
@"
@echo off
set PYTHONPATH=$tuiParent
$python -m tui --status-file "$statusFile" --log-file "$logFile" --framework auto
pause
"@ | Set-Content -Path $tuiLauncher -Encoding ASCII

# wt.exe with split-pane
wt.exe -d $ProjectDir cmd /k $claudeLauncher `; split-pane -H -s 0.07 -d $ProjectDir cmd /k $tuiLauncher

Write-Host "Launched Windows Terminal with Claude Code + TUI"
Write-Host "  Session: $sessionPrefix"
Write-Host "  Status:  $statusFile"
