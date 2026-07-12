<#
.SYNOPSIS
    Launch Windows Terminal with Codex + TUI test runner side-by-side.

.DESCRIPTION
    Opens Windows Terminal with two horizontal panes:
    - Top: Codex in the selected project directory
    - Bottom: Python TUI test runner in compact mode when available

    Every invocation is logged to ~/.dev-pomogator/logs/context-menu-launch.log.
    YOLO launches grant Codex trust for the exact selected project directory in
    ~/.codex/config.toml before invoking codex with Codex-native full-access
    flags.

.PARAMETER ProjectDir
    Project directory. Defaults to git root or current directory.

.PARAMETER Yolo
    Launch Codex with full-access approval/sandbox bypass flags.
#>
param(
    [string]$ProjectDir,
    [switch]$Yolo,
    [switch]$NoTui
)

$homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$logDir = Join-Path $homeDir '.dev-pomogator/logs'
try { if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null } } catch {}
$script:LaunchLogFile = Join-Path $logDir 'context-menu-launch.log'

function Write-LaunchLog {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    try { Add-Content -Path $script:LaunchLogFile -Value "[$ts] $Message" -Encoding UTF8 } catch {}
}

function Get-CodexExitLogBatch {
    param([string]$Dir)
    @"
set CM_EXIT=%ERRORLEVEL%
if not "%CM_EXIT%"=="0" (
  echo [%date% %time%] ERROR: codex exited with code %CM_EXIT% (dir=$Dir) >> "$script:LaunchLogFile"
) else (
  echo [%date% %time%] codex exited 0 (dir=$Dir) >> "$script:LaunchLogFile"
)
"@
}

function Quote-BatchToken {
    param([string]$Value)
    if ($Value -match '[\s&()^]') {
        return '"' + ($Value -replace '"', '""') + '"'
    }
    return $Value
}

function Format-BatchCommand {
    param(
        [string]$Executable,
        [string[]]$Arguments = @()
    )

    # Batch shims (.cmd/.bat) must be invoked with CALL from another .cmd,
    # otherwise the launcher never resumes to log CM_EXIT after the CLI exits.
    $prefix = if ($Executable -match '\.(cmd|bat)$') { 'call ' } else { '' }
    $command = $prefix + (Quote-BatchToken $Executable)
    if ($Arguments.Count -gt 0) {
        $command += ' ' + ($Arguments -join ' ')
    }
    return $command
}

function Format-TomlBasicString {
    param([string]$Value)
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Ensure-CodexProjectTrust {
    param([string]$Dir)

    $codexDir = Join-Path $homeDir '.codex'
    $configPath = Join-Path $codexDir 'config.toml'
    $dirKey = (Resolve-Path $Dir).Path
    $header = '[projects.' + (Format-TomlBasicString -Value $dirKey) + ']'

    try { if (-not (Test-Path $codexDir)) { New-Item -ItemType Directory -Path $codexDir -Force | Out-Null } } catch {}

    $content = ''
    if (Test-Path $configPath) {
        try { $content = Get-Content -Path $configPath -Raw -Encoding UTF8 } catch { $content = '' }
    }

    $escapedHeader = [regex]::Escape($header)
    $tablePattern = "(?ms)^$escapedHeader\s*$.*?(?=^\[|\z)"
    $trustLine = 'trust_level = "trusted"'
    $updated = $content

    if ($content -match $tablePattern) {
        $table = [regex]::Match($content, $tablePattern).Value
        if ($table -match '(?m)^\s*trust_level\s*=\s*"trusted"\s*$') {
            Write-LaunchLog "codex trust: already trusted for $dirKey"
            return
        }

        if ($table -match '(?m)^\s*trust_level\s*=') {
            $newTable = [regex]::Replace($table, '(?m)^\s*trust_level\s*=.*$', $trustLine, 1)
        } else {
            $newTable = $table.TrimEnd() + "`n" + $trustLine + "`n"
        }
        $updated = [regex]::Replace($content, $tablePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newTable }, 1)
    } else {
        $block = $header + "`n" + $trustLine + "`n"
        $updated = if ($content.Trim().Length -gt 0) { $content.TrimEnd() + "`n`n" + $block } else { $block }
    }

    $tempFile = "$configPath.tmp.$PID"
    try {
        $noBomUtf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($tempFile, $updated, $noBomUtf8)
        Move-Item -Path $tempFile -Destination $configPath -Force
        Write-LaunchLog "codex trust granted for $dirKey"
    } catch {
        Write-LaunchLog "codex trust: ERROR writing ${configPath}: $($_.Exception.Message)"
        try { Remove-Item -Path $tempFile -ErrorAction SilentlyContinue } catch {}
    }
}

function Get-CodexCommandWithArgs {
    param([string[]]$Arguments = @())
    $codex = Get-Command codex -ErrorAction SilentlyContinue
    $codexPath = if ($codex) { $codex.Source } else { 'codex' }
    Write-LaunchLog "codex command: $codexPath"
    return Format-BatchCommand -Executable $codexPath -Arguments $Arguments
}

function Get-CodexCommand {
    param([string]$Dir)

    $codexArgs = @('-C', ('"' + $Dir + '"'))
    if ($Yolo) {
        $codexArgs += @('--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust')
    }

    return Get-CodexCommandWithArgs -Arguments $codexArgs
}

function Start-CodexOnly {
    param([string]$Dir)
    if ($Yolo) {
        Ensure-CodexProjectTrust -Dir $Dir
    }
    Write-LaunchLog "launching codex-only (Yolo=$Yolo) dir=$Dir"

    if ($env:CONTEXT_MENU_NONINTERACTIVE -eq '1') {
        Write-LaunchLog 'noninteractive mode requested -> skipping wt.exe'
        return
    }

    $launcherDir = Join-Path $env:TEMP 'dev-pomogator-launch'
    if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }
    $codexOnlyLauncher = Join-Path $launcherDir 'codex-only-pane.cmd'
    $codexCmd = Get-CodexCommand -Dir $Dir
    $codexVersionCmd = Get-CodexCommandWithArgs -Arguments @('--version')
    @"
@echo off
title Codex YOLO - $Dir
cd /d "$Dir"
echo [dev-pomogator] Codex context-menu no-TUI launch
echo [dev-pomogator] cwd=%CD%
echo [dev-pomogator] command=$codexCmd
where codex
$codexVersionCmd
echo [dev-pomogator] starting Codex in 2 seconds...
timeout /t 2 /nobreak >nul
$codexCmd
$(Get-CodexExitLogBatch -Dir $Dir)
if not "%CM_EXIT%"=="0" pause
"@ | Set-Content -Path $codexOnlyLauncher -Encoding ASCII

    wt.exe -d $Dir cmd /k $codexOnlyLauncher
}

Write-LaunchLog '=== launch-Codex-tui.ps1 invoked ==='
Write-LaunchLog "args: ProjectDir='$ProjectDir' Yolo=$Yolo raw=[$($args -join ' ')] pid=$PID"
Write-LaunchLog "host: PSVersion=$($PSVersionTable.PSVersion) user=$env:USERNAME cwd=$($PWD.Path)"

$ErrorActionPreference = 'Stop'

try {
    if (-not $ProjectDir) {
        try {
            $ProjectDir = (git rev-parse --show-toplevel 2>$null)
        } catch {}
        if (-not $ProjectDir) {
            $ProjectDir = $PWD.Path
        }
    }
    $ProjectDir = (Resolve-Path $ProjectDir).Path
    Write-LaunchLog "resolved ProjectDir: $ProjectDir"

    if ($NoTui) {
        Write-LaunchLog "NoTui requested -> launching Codex only"
        Start-CodexOnly $ProjectDir
        Write-LaunchLog 'launch OK (codex-only, -NoTui)'
        exit 0
    }

    $sessionPrefix = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $statusDir = Join-Path (Join-Path $ProjectDir '.dev-pomogator') '.test-status'
    if (-not (Test-Path $statusDir)) {
        New-Item -ItemType Directory -Path $statusDir -Force | Out-Null
    }

    $statusFile = Join-Path $statusDir "status.$sessionPrefix.yaml"
    $logFile = Join-Path $statusDir "log.$sessionPrefix.txt"

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
        Write-LaunchLog 'python3 not found -> launching Codex only'
        Start-CodexOnly $ProjectDir
        Write-LaunchLog 'launch OK (codex-only, no python)'
        exit 0
    }

    $tuiModule = Join-Path (Join-Path (Join-Path $ProjectDir 'tools') 'tui-test-runner') 'tui'
    if (-not (Test-Path $tuiModule)) {
        $tuiModule = Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir '.dev-pomogator') 'tools') 'tui-test-runner') 'tui'
    }
    if (-not (Test-Path $tuiModule)) {
        $tuiModule = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir 'extensions') 'tui-test-runner') 'tools') 'tui-test-runner') 'tui'
    }
    if (-not (Test-Path $tuiModule)) {
        Write-LaunchLog 'TUI module not found -> launching Codex only'
        Start-CodexOnly $ProjectDir
        Write-LaunchLog 'launch OK (codex-only, no TUI module)'
        exit 0
    }

    if ($Yolo) {
        Ensure-CodexProjectTrust -Dir $ProjectDir
    }

    $launcherDir = Join-Path $env:TEMP 'dev-pomogator-launch'
    if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }
    $codexPaneLauncher = Join-Path $launcherDir "codex-pane-$sessionPrefix.cmd"
    $codexCmd = Get-CodexCommand -Dir $ProjectDir
    @"
@echo off
$codexCmd
$(Get-CodexExitLogBatch -Dir $ProjectDir)
"@ | Set-Content -Path $codexPaneLauncher -Encoding ASCII

    $tuiCommand = "$python -m tools.tui-test-runner.tui.app --status-file `"$statusFile`" --log-file `"$logFile`" --compact"
    Write-LaunchLog "launching wt split: codex pane + TUI"
    wt.exe -d $ProjectDir cmd /k $codexPaneLauncher `; split-pane -V -s 0.07 -d $ProjectDir powershell -NoExit -Command $tuiCommand
    Write-LaunchLog 'launch OK (wt split)'
} catch {
    Write-LaunchLog "ERROR: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
    Write-Error $_
    if ($env:CONTEXT_MENU_NONINTERACTIVE -eq '1') {
        exit 1
    }
    try { Read-Host 'Press Enter to close' | Out-Null } catch {}
    exit 1
}
