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

# --- UNC-safe path handling ---------------------------------------------------------------------
# See scripts/launch-claude-tui.ps1 for the full rationale. In short: PathInfo.Path is
# PROVIDER-QUALIFIED for UNC ("Microsoft.PowerShell.Core\FileSystem::\\srv\share"), which wt.exe -d
# parses as a RELATIVE path (dying with 0x8007010b) and which lands the trust entry under a phantom
# key. .ProviderPath is the bare path and is identical to .Path for drive-backed paths, so this is a
# no-op off UNC. GetFullPath normalizes separators (git reports //server/share) without disturbing
# POSIX paths under pwsh/Linux.
function Resolve-FsPath {
    param([Parameter(Mandatory)][string]$Path)
    $resolved = (Resolve-Path -LiteralPath $Path).ProviderPath
    return [System.IO.Path]::GetFullPath($resolved)
}

# cmd.exe cannot hold a UNC working directory (it defaults to C:\Windows), so UNC projects get a
# PowerShell-hosted pane. Two leading separators only: a POSIX /root/project must NOT match.
function Test-UncPath {
    param([string]$Path)
    return [bool]($Path -match '^[\\/]{2}[^\\/]')
}

function Quote-PsSingle {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

# Inside a UNC pane a .cmd/.bat shim re-enters cmd.exe, which refuses the UNC working directory and
# drops the child into C:\Windows (verified with a node child: process.cwd()===C:\Windows). npm's
# cmd-shim writes a sibling .ps1 next to every .cmd; PowerShell runs it in-process and the UNC cwd
# survives. See scripts/launch-claude-tui.ps1 for the full rationale.
function Resolve-UncSafeExecutable {
    param([string]$Path, [string]$Label)
    if ($Path -notmatch '\.(cmd|bat)$') { return $Path }
    $ps1Shim = [System.IO.Path]::ChangeExtension($Path, '.ps1')
    if (Test-Path -LiteralPath $ps1Shim) {
        Write-LaunchLog "UNC: $Label is a cmd shim; using its sibling PowerShell shim instead: $ps1Shim"
        return $ps1Shim
    }
    # ASCII only in code lines: powershell.exe 5.1 decodes a BOM-less file as Windows-1252, where the
    # trailing byte of a UTF-8 em-dash becomes U+201D, which the parser accepts as a closing double
    # quote - silently truncating the string and breaking the whole script.
    Write-LaunchLog "UNC: WARNING $Label is a cmd shim ($Path) with no sibling .ps1 - cmd.exe cannot hold a UNC cwd, so the session may start in C:\Windows"
    return $Path
}

function Get-CodexExitLogBatch {
    param([string]$Dir)
    $escapedDir = $Dir -replace '%', '%%'
    $escapedLog = $script:LaunchLogFile -replace '%', '%%'
    @"
set CM_EXIT=%%ERRORLEVEL%%
if not "%%CM_EXIT%%"=="0" (
  echo [%%date%% %%time%%] ERROR: codex exited with code %%CM_EXIT%% (dir=$escapedDir) >> "$escapedLog"
) else (
  echo [%%date%% %%time%%] codex exited 0 (dir=$escapedDir) >> "$escapedLog"
)
"@
}

function Quote-BatchToken {
    param([string]$Value)
    $escaped = $Value -replace '%', '%%'
    if ($escaped -match '[\s&()^]') {
        return '"' + ($escaped -replace '"', '""') + '"'
    }
    return $escaped
}

function Format-BatchCommand {
    param(
        [string]$Executable,
        [string[]]$Arguments = @()
    )

    # cmd.exe cannot EXECUTE a .ps1 - it falls through to the shell file association and the pane
    # hangs instead of starting the CLI. npm's cmd-shim installs x.cmd AND x.ps1 side by side and
    # Get-Command returns the .ps1 (ExternalScript outranks Application), so every npm-installed CLI
    # arrives here as a .ps1. See scripts/launch-claude-tui.ps1 for the full rationale.
    if ($Executable -match '\.ps1$') {
        $command = 'powershell -NoProfile -ExecutionPolicy Bypass -File ' + (Quote-BatchToken $Executable)
        if ($Arguments.Count -gt 0) {
            $command += ' ' + ($Arguments -join ' ')
        }
        return $command
    }

    # Batch shims (.cmd/.bat) must be invoked with CALL from another .cmd,
    # otherwise the launcher never resumes to log CM_EXIT after the CLI exits.
    $prefix = if ($Executable -match '\.(cmd|bat)$') { 'call ' } else { '' }
    $command = $prefix + (Quote-BatchToken $Executable)
    if ($Arguments.Count -gt 0) {
        $command += ' ' + ($Arguments -join ' ')
    }
    return $command
}

# Mirror image of Resolve-UncSafeExecutable, for the cmd-hosted panes: a cmd pane needs something
# CALL can run, so prefer the sibling .cmd when Get-Command handed back a .ps1 shim.
function Resolve-BatchSafeExecutable {
    param([string]$Path, [string]$Label)
    if ($Path -notmatch '\.ps1$') { return $Path }
    $cmdShim = [System.IO.Path]::ChangeExtension($Path, '.cmd')
    if (Test-Path -LiteralPath $cmdShim) {
        Write-LaunchLog "$Label is a PowerShell shim; using its sibling cmd shim for the cmd pane: $cmdShim"
        return $cmdShim
    }
    Write-LaunchLog "$Label is a PowerShell shim ($Path) with no sibling .cmd; driving it through powershell"
    return $Path
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
    $dirKey = Resolve-FsPath $Dir
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
    $codexPath = Resolve-BatchSafeExecutable -Path $(if ($codex) { $codex.Source } else { 'codex' }) -Label 'codex'
    Write-LaunchLog "codex command: $codexPath"
    return Format-BatchCommand -Executable $codexPath -Arguments $Arguments
}

function Get-CodexCommand {
    param([string]$Dir)

    $codexArgs = @('-C', (Quote-BatchToken $Dir))
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

    $skipTerminal = $env:CONTEXT_MENU_NONINTERACTIVE -eq '1'
    if ($skipTerminal) {
        Write-LaunchLog 'noninteractive mode requested -> generating launcher but skipping wt.exe'
    }

    $launcherRoot = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
    $launcherDir = Join-Path $launcherRoot 'dev-pomogator-launch'
    if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }

    # UNC project: cmd.exe would refuse the cwd and default to C:\Windows. Host the pane in
    # PowerShell, which carries a UNC cwd natively. Drive-backed projects keep the cmd pane below.
    if (Test-UncPath $Dir) {
        $codexOnlyLauncherPs = Join-Path $launcherDir ("codex-only-pane.$PID.$([guid]::NewGuid().ToString('N').Substring(0, 8)).ps1")
        $codex = Get-Command codex -ErrorAction SilentlyContinue
        $codexExe = Resolve-UncSafeExecutable -Path $(if ($codex) { $codex.Source } else { 'codex' }) -Label 'codex'
        if ($codexExe -match '\.(cmd|bat)$') {
            throw "Codex resolves to a cmd shim without a sibling PowerShell shim; refusing an unsafe UNC launch: $codexExe"
        }
        Write-LaunchLog "codex command: $codexExe"
        $qDir = Quote-PsSingle $Dir
        $qExe = Quote-PsSingle $codexExe
        $qLog = Quote-PsSingle $script:LaunchLogFile
        $codexPsArgs = @((Quote-PsSingle '-C'), $qDir)
        if ($Yolo) {
            $codexPsArgs += @((Quote-PsSingle '--dangerously-bypass-approvals-and-sandbox'), (Quote-PsSingle '--dangerously-bypass-hook-trust'))
        }
        $codexPsArgLine = $codexPsArgs -join ' '
        # Caller-supplied values are emitted as QUOTED PS LITERALS and concatenated, never
        # interpolated into a double-quoted string in the generated file: a project path may legally
        # contain '$' (a double-quoted pane string would expand it) or "'" (breaks a naive literal).
        @"
`$ErrorActionPreference = 'Continue'
`$dpDir = $qDir
`$dpLog = $qLog
`$Host.UI.RawUI.WindowTitle = 'Codex - ' + `$dpDir
Set-Location -LiteralPath `$dpDir
Write-Host '[dev-pomogator] Codex context-menu no-TUI launch (UNC-safe PowerShell pane)'
Write-Host ('[dev-pomogator] cwd=' + (Get-Location).ProviderPath)
Write-Host ('[dev-pomogator] command=' + $qExe)
& $qExe --version
Write-Host '[dev-pomogator] starting Codex in 2 seconds...'
Start-Sleep -Seconds 2
& $qExe $codexPsArgLine
`$cmExit = `$LASTEXITCODE
`$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
`$status = if (`$cmExit -ne 0) { 'ERROR: codex exited with code ' + `$cmExit } else { 'codex exited 0' }
try { Add-Content -LiteralPath `$dpLog -Value ('[' + `$ts + '] ' + `$status + ' (dir=' + `$dpDir + ')') -Encoding UTF8 } catch {}
if (`$cmExit -ne 0) { Read-Host 'Press Enter to close' }
"@ | Set-Content -Path $codexOnlyLauncherPs -Encoding UTF8

        Write-LaunchLog "UNC project dir -> PowerShell pane: $codexOnlyLauncherPs"
        if (-not $skipTerminal) {
            wt.exe powershell -NoLogo -ExecutionPolicy Bypass -NoExit -File $codexOnlyLauncherPs
        }
        return
    }

    $codexOnlyLauncher = Join-Path $launcherDir ("codex-only-pane.$PID.$([guid]::NewGuid().ToString('N').Substring(0, 8)).cmd")
    $batchDir = Quote-BatchToken $Dir
    $codexCmd = Get-CodexCommand -Dir $Dir
    $codexVersionCmd = Get-CodexCommandWithArgs -Arguments @('--version')
    @"
@echo off
title Codex YOLO
cd /d $batchDir
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

    if (-not $skipTerminal) {
        wt.exe -d $Dir cmd /k $codexOnlyLauncher
    }
}

Write-LaunchLog '=== launch-Codex-tui.ps1 invoked ==='
Write-LaunchLog "args: ProjectDir='$ProjectDir' Yolo=$Yolo raw=[$($args -join ' ')] pid=$PID"
Write-LaunchLog "host: PSVersion=$($PSVersionTable.PSVersion) user=$env:USERNAME cwd=$($PWD.ProviderPath)"

$ErrorActionPreference = 'Stop'

try {
    if (-not $ProjectDir) {
        try {
            $ProjectDir = (git rev-parse --show-toplevel 2>$null)
        } catch {}
        if (-not $ProjectDir) {
            $ProjectDir = $PWD.ProviderPath
        }
    }
    $ProjectDir = Resolve-FsPath $ProjectDir
    Write-LaunchLog "resolved ProjectDir: $ProjectDir"

    if ($NoTui) {
        Write-LaunchLog "NoTui requested -> launching Codex only"
        Start-CodexOnly $ProjectDir
        Write-LaunchLog 'launch OK (codex-only, -NoTui)'
        exit 0
    }

    # A UNC project cannot be hosted by cmd.exe in the split-pane layout (it would land in
    # C:\Windows and the TUI would write its status file to the wrong tree). Route the launch
    # through the PowerShell-hosted codex-only pane instead. Checked before the trust grant so
    # Start-CodexOnly performs it exactly once.
    if (Test-UncPath $ProjectDir) {
        Write-LaunchLog 'UNC project dir -> TUI split-pane unsupported (cmd.exe cannot hold a UNC cwd); launching Codex only'
        Start-CodexOnly $ProjectDir
        Write-LaunchLog 'launch OK (codex-only, UNC project dir)'
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

    $launcherRoot = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
    $launcherDir = Join-Path $launcherRoot 'dev-pomogator-launch'
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
