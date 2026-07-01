<#
.SYNOPSIS
    Launch Windows Terminal with Claude Code + TUI test runner side-by-side.

.DESCRIPTION
    Opens Windows Terminal with two horizontal panes:
    - Top (96%): Claude Code in the project directory
    - Bottom (12%, ~3 rows): Python TUI test runner in compact mode (Alt+Shift+Up to expand)

    The TUI automatically picks up test progress when /run-tests is used.

    Every invocation is logged (append) to ~/.dev-pomogator/logs/context-menu-launch.log
    so a failed right-click launch (the window flashes and closes) leaves a trace that can
    be inspected afterwards. The whole body runs inside try/catch — on failure the error is
    logged AND the window is kept open (interactive sessions only) instead of dying silently.

.PARAMETER ProjectDir
    Project directory. Defaults to git root or current directory.

.PARAMETER Yolo
    Launch Claude Code with --dangerously-skip-permissions.

.EXAMPLE
    .\scripts\launch-claude-tui.ps1
    .\scripts\launch-claude-tui.ps1 -ProjectDir D:\repos\my-project
#>
param(
    [string]$ProjectDir,
    [switch]$Yolo,
    [switch]$NoTui
)

# --- Logging (must be the first executable code; keeps right-click launch diagnosable) ---
# Resolve home the same way Node os.homedir() does on Windows (USERPROFILE), falling back to the
# cross-platform $HOME so the log path also works under Linux/pwsh in the Docker test suite.
# Best-effort: logging must never itself throw and abort the launch.
$homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$logDir = Join-Path $homeDir '.dev-pomogator/logs'
try { if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null } } catch {}
$script:LaunchLogFile = Join-Path $logDir 'context-menu-launch.log'

function Write-LaunchLog {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    try { Add-Content -Path $script:LaunchLogFile -Value "[$ts] $Message" -Encoding UTF8 } catch {}
}

# FR-6: shared batch snippet that logs claude's own exit code after it closes. Used by BOTH the
# claude-only pane and the TUI-split claude pane so the two launchers don't duplicate the same
# ERRORLEVEL-check block.
function Get-ClaudeExitLogBatch {
    param([string]$Dir)
    @"
set CM_EXIT=%ERRORLEVEL%
if not "%CM_EXIT%"=="0" (
  echo [%date% %time%] ERROR: claude exited with code %CM_EXIT% (dir=$Dir) >> "$script:LaunchLogFile"
) else (
  echo [%date% %time%] claude exited 0 (dir=$Dir) >> "$script:LaunchLogFile"
)
"@
}

# FR-7: atomically grant workspace trust for $Dir before a --dangerously-skip-permissions launch.
# Claude Code hard-fails (exit 1, "Ignoring N permissions.allow entries ... this workspace has
# not been trusted") when --dangerously-skip-permissions targets a directory whose trust dialog
# was never interactively accepted — it cannot show that dialog in bypass mode. The user already
# chose the "YOLO" entry (already opting out of permission friction), so granting trust for that
# exact directory is consistent with, not an expansion of, that choice. Only called when -Yolo.
# Never called for the plain "Claude Code" entry — that one keeps Claude Code's normal trust flow.
function Ensure-WorkspaceTrust {
    param([string]$Dir)
    $claudeJsonPath = Join-Path $homeDir '.claude.json'
    if (-not (Test-Path $claudeJsonPath)) {
        Write-LaunchLog "trust: ${claudeJsonPath} not found, skipping auto-grant"
        return
    }

    # Claude Code keys ~/.claude.json "projects" by a FORWARD-slash path even on Windows
    # (confirmed against a real file: 8/8 existing keys use "E:/repos/..." style, 0 use "\").
    # Resolve-Path returns backslash paths on Windows — normalize before using as the dict key,
    # otherwise the write lands under a key Claude Code never looks up (silent no-op: the grant
    # "succeeds" but the directory is still reported untrusted on the next launch).
    $dirKey = $Dir -replace '\\', '/'

    # ~/.claude.json can contain a property with an EMPTY string name (seen in the wild nested
    # under clientDataCacheSlots.*.data.cedar_lagoon). ConvertFrom-Json hard-throws on that
    # ("...only supported using the -AsHashTable switch"), and -AsHashtable does not exist on
    # Windows PowerShell 5.1 — which is what 'powershell.exe' actually is (confirmed: 5.1.26100),
    # the exact interpreter the NSS menu launches via cmd='powershell.exe'. Without this, every
    # real-world call silently failed at the catch block below and never granted trust at all.
    # JavaScriptSerializer (System.Web.Extensions, ships with .NET Framework / Windows) parses
    # into a plain Dictionary<string,object> and tolerates arbitrary key names including "".
    # PowerShell 6+ (pwsh, used by the Docker BDD tests) gets the native -AsHashtable path instead
    # — cleaner, no JSON unicode-escaping side effect, and avoids loading System.Web.Extensions.
    $isCore = $PSVersionTable.PSVersion.Major -ge 6
    $obj = $null
    try {
        $raw = Get-Content -Path $claudeJsonPath -Raw -Encoding UTF8
        if ($isCore) {
            $obj = $raw | ConvertFrom-Json -AsHashtable
        } else {
            Add-Type -AssemblyName System.Web.Extensions
            $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
            $jss.MaxJsonLength = 104857600  # 100MB — ~/.claude.json can grow large with history/cache
            $obj = $jss.DeserializeObject($raw)
        }
    } catch {
        Write-LaunchLog "trust: ERROR could not parse ${claudeJsonPath}, skipping auto-grant: $($_.Exception.Message)"
        return
    }
    if (-not ($obj -is [System.Collections.IDictionary])) {
        Write-LaunchLog "trust: ${claudeJsonPath} did not parse to an object, skipping auto-grant"
        return
    }

    if (-not $obj.ContainsKey('projects') -or -not ($obj['projects'] -is [System.Collections.IDictionary])) {
        $obj['projects'] = if ($isCore) { @{} } else { $jss.DeserializeObject('{}') }
    }
    $projects = $obj['projects']

    $existing = $null
    if ($projects.ContainsKey($dirKey)) { $existing = $projects[$dirKey] }
    if ($existing -is [System.Collections.IDictionary] -and $existing.ContainsKey('hasTrustDialogAccepted') -and $existing['hasTrustDialogAccepted'] -eq $true) {
        Write-LaunchLog "trust: already granted for $dirKey"
        return
    }

    if (-not ($existing -is [System.Collections.IDictionary])) {
        # Build via the same Deserialize path that produced $obj, not New-Object — a New-Object'd
        # Dictionary[string,object] picks up a PowerShell PSParameterizedProperty adapter member
        # that trips JavaScriptSerializer.Serialize() into a false "circular reference detected"
        # (confirmed live: New-Object path throws, DeserializeObject/@{} path does not).
        $existing = if ($isCore) { @{} } else { $jss.DeserializeObject('{}') }
        $projects[$dirKey] = $existing
    }
    $existing['hasTrustDialogAccepted'] = $true

    # Atomic write: temp file + rename (atomic-config-save rule) — never a direct in-place write,
    # so a concurrent right-click on a different directory can't race-corrupt the shared file.
    # WriteAllText with an explicit no-BOM UTF8Encoding, NOT Set-Content -Encoding UTF8 — Windows
    # PowerShell 5.1's "UTF8" always prepends a BOM (confirmed live: PS7's UTF8 does not, but 5.1's
    # does), and the real ~/.claude.json has no BOM. A BOM-prefixed rewrite would make Claude
    # Code's own `JSON.parse(readFileSync(path,'utf8'))` throw on its NEXT startup — confirmed via
    # Node that a leading BOM breaks plain JSON.parse — turning this fix into a worse outage than
    # the bug it patches.
    $tempFile = "$claudeJsonPath.tmp.$PID"
    try {
        $serialized = if ($isCore) { $obj | ConvertTo-Json -Depth 50 } else { $jss.Serialize($obj) }
        $noBomUtf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($tempFile, $serialized, $noBomUtf8)
        Move-Item -Path $tempFile -Destination $claudeJsonPath -Force
        Write-LaunchLog "trust granted for $dirKey"
    } catch {
        Write-LaunchLog "trust: ERROR writing ${claudeJsonPath}: $($_.Exception.Message)"
        try { Remove-Item -Path $tempFile -ErrorAction SilentlyContinue } catch {}
    }
}

# Launch Claude Code alone (no TUI pane). Used when Python or the TUI module is unavailable —
# e.g. any project that is not dev-pomogator itself — or when -NoTui is passed directly (the raw
# "Claude Code (YOLO)" / "Claude Code" NSS entries route here, FR-6). Honors -Yolo (FR-7 trust
# auto-grant + --dangerously-skip-permissions). Routes claude through a tiny generated .cmd so the
# pane can log claude's own exit code after the user closes/exits it (FR-6) — wt.exe itself is
# fire-and-forget and cannot report the exit code of what it spawned.
function Start-ClaudeOnly {
    param([string]$Dir)
    if ($Yolo) {
        Ensure-WorkspaceTrust -Dir $Dir
    }
    Write-LaunchLog "launching claude-only (Yolo=$Yolo) dir=$Dir"

    $launcherDir = Join-Path $env:TEMP 'dev-pomogator-launch'
    if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }
    $claudeOnlyLauncher = Join-Path $launcherDir 'claude-only-pane.cmd'
    $claudeCmd = if ($Yolo) { 'claude --dangerously-skip-permissions' } else { 'claude' }
    @"
@echo off
$claudeCmd
$(Get-ClaudeExitLogBatch -Dir $Dir)
"@ | Set-Content -Path $claudeOnlyLauncher -Encoding ASCII

    wt.exe -d $Dir cmd /k $claudeOnlyLauncher
}

Write-LaunchLog '=== launch-claude-tui.ps1 invoked ==='
Write-LaunchLog "args: ProjectDir='$ProjectDir' Yolo=$Yolo raw=[$($args -join ' ')] pid=$PID"
Write-LaunchLog "host: PSVersion=$($PSVersionTable.PSVersion) user=$env:USERNAME cwd=$($PWD.Path)"

$ErrorActionPreference = 'Stop'

try {
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
    Write-LaunchLog "resolved ProjectDir: $ProjectDir"

    # -NoTui (FR-6): the raw "Claude Code (YOLO)" / "Claude Code" NSS entries route here instead
    # of calling wt.exe + claude directly, so they get the same logging + trust auto-grant as the
    # "YOLO + TUI" entry, without ever attempting the TUI split-pane.
    if ($NoTui) {
        Write-LaunchLog "NoTui requested -> launching Claude Code only"
        Start-ClaudeOnly $ProjectDir
        Write-LaunchLog 'launch OK (claude-only, -NoTui)'
        exit 0
    }

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
        Write-LaunchLog 'python3 not found -> launching Claude Code only (no TUI pane)'
        Write-Warning "Python 3 not found. TUI pane will not start."
        Write-Host "Launching Claude Code only..."
        Start-ClaudeOnly $ProjectDir
        Write-LaunchLog 'launch OK (claude-only, no python)'
        exit 0
    }
    Write-LaunchLog "python: $python"

    # --- Resolve TUI module ---
    # Primary: dev-pomogator vendored under the project. Fallback: legacy extensions/ layout.
    # If neither exists (any non-dev-pomogator project), the TUI pane can't run — launch Claude
    # alone rather than spawning a split-pane whose bottom half immediately errors out.
    # Canonical v2 layout: <project>/tools/tui-test-runner/tui
    $tuiModule = Join-Path (Join-Path (Join-Path $ProjectDir 'tools') 'tui-test-runner') 'tui'
    if (-not (Test-Path $tuiModule)) {
        # Legacy runtime-vendored layout
        $tuiModule = Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir '.dev-pomogator') 'tools') 'tui-test-runner') 'tui'
    }
    if (-not (Test-Path $tuiModule)) {
        # Legacy v1 extensions/ layout
        $tuiModule = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $ProjectDir 'extensions') 'tui-test-runner') 'tools') 'tui-test-runner') 'tui'
    }
    if (-not (Test-Path $tuiModule)) {
        Write-LaunchLog "TUI module not found under $ProjectDir -> launching Claude Code only"
        Write-Host "TUI test-runner module not found in this project. Launching Claude Code only..."
        Start-ClaudeOnly $ProjectDir
        Write-LaunchLog 'launch OK (claude-only, no TUI module)'
        exit 0
    }
    Write-LaunchLog "tuiModule: $tuiModule"

    # PYTHONPATH must point to parent of tui/ so "python -m tui" resolves
    $tuiParent = Split-Path $tuiModule -Parent

    # --- Build wt.exe command ---
    # Layout: Claude Code (75%) | TUI (25%)
    # wt.exe parses each pane's command as separate arguments after the subcommand.
    # Use cmd /c with a batch-style command string for env vars.

    # Create a temporary launcher .cmd for Claude pane (avoids quoting hell with wt.exe)
    $launcherDir = Join-Path $env:TEMP 'dev-pomogator-launch'
    if (-not (Test-Path $launcherDir)) { New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null }

    if ($Yolo) {
        Ensure-WorkspaceTrust -Dir $ProjectDir
    }

    $claudeLauncher = Join-Path $launcherDir 'claude-pane.cmd'
    @"
@echo off
set TEST_STATUSLINE_SESSION=$sessionPrefix
set TEST_STATUSLINE_PROJECT=$ProjectDir
$(if ($Yolo) { 'claude --dangerously-skip-permissions' } else { 'claude' })
$(Get-ClaudeExitLogBatch -Dir $ProjectDir)
"@ | Set-Content -Path $claudeLauncher -Encoding ASCII

    $tuiLauncher = Join-Path $launcherDir 'tui-pane.cmd'
    @"
@echo off
set PYTHONPATH=$tuiParent
$python -m tui --status-file "$statusFile" --log-file "$logFile" --framework auto
pause
"@ | Set-Content -Path $tuiLauncher -Encoding ASCII

    # wt.exe with split-pane
    Write-LaunchLog "launching wt.exe (Yolo=$Yolo) session=$sessionPrefix"
    wt.exe -d $ProjectDir cmd /k $claudeLauncher `; split-pane -H -s 0.07 -d $ProjectDir cmd /k $tuiLauncher

    Write-LaunchLog "launch OK (claude+tui) status=$statusFile"
    Write-Host "Launched Windows Terminal with Claude Code + TUI"
    Write-Host "  Session: $sessionPrefix"
    Write-Host "  Status:  $statusFile"
}
catch {
    Write-LaunchLog "ERROR: $($_.Exception.Message)"
    Write-LaunchLog "STACK: $($_.ScriptStackTrace)"
    Write-Host ""
    Write-Host "[context-menu] Launch failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $script:LaunchLogFile"
    # Right-click launches a transient window that closes on exit — keep it open so the
    # error is readable. Skip in non-interactive contexts (tests, CI) to avoid hanging.
    if ([Environment]::UserInteractive -and -not $env:CONTEXT_MENU_NONINTERACTIVE) {
        Read-Host 'Press Enter to close'
    }
    exit 1
}
