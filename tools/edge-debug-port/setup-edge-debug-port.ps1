# Permanently make Microsoft Edge launch with --remote-debugging-port=9222.
# Modifies:
#   1. All .lnk shortcuts (Start Menu, Taskbar pinned, Desktop, Quick Launch).
#   2. ProgID registry handlers (MSEdgeHTM, MSEdgeHTML, MSEdgePDF, microsoft-edge:) so URL clicks also pass the flag.
# Saves a JSON backup so revert is one-line: pass -Revert.
#
# Usage:
#   pwsh scripts/setup-edge-debug-port.ps1            # apply, port 9222 (default)
#   pwsh scripts/setup-edge-debug-port.ps1 -Port 9333 # custom port
#   pwsh scripts/setup-edge-debug-port.ps1 -Revert    # roll back from backup

[CmdletBinding()]
param(
    [int]$Port = 9222,
    [switch]$Revert,
    [string]$BackupPath = "$env:USERPROFILE\.edge-debug-port-backup.json"
)

$ErrorActionPreference = 'Stop'

$flag = "--remote-debugging-port=$Port"

function Get-AllEdgeShortcuts {
    $paths = @(
        "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Microsoft Edge.lnk", #MLHIDE
        "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\Microsoft Edge.lnk",
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk",
        "$env:USERPROFILE\Desktop\Microsoft Edge.lnk",
        "$env:Public\Desktop\Microsoft Edge.lnk"
    )
    $existing = $paths | Where-Object { Test-Path $_ }
    # Also scan Quick Launch / Taskbar pinned that may have variant names.
    $extra = @()
    $extra += Get-ChildItem -Path "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar" -Filter "*Edge*.lnk" -ErrorAction SilentlyContinue | Select-Object -Expand FullName
    $extra += Get-ChildItem -Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Filter "*Edge*.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -Expand FullName
    return ($existing + $extra) | Select-Object -Unique
}

function Read-Shortcut($path) {
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($path)
    return [pscustomobject]@{ Path = $path; TargetPath = $sc.TargetPath; Arguments = $sc.Arguments; WorkingDirectory = $sc.WorkingDirectory; IconLocation = $sc.IconLocation }
}

function Set-Shortcut($path, $arguments) {
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($path)
    $sc.Arguments = $arguments
    $sc.Save()
}

$progIdRegPaths = @(
    'HKCU:\Software\Classes\MSEdgeHTM\shell\open\command',
    'HKCU:\Software\Classes\MSEdgeMHT\shell\open\command',
    'HKCU:\Software\Classes\MSEdgePDF\shell\open\command',
    'HKLM:\SOFTWARE\Classes\MSEdgeHTM\shell\open\command',
    'HKLM:\SOFTWARE\Classes\MSEdgeMHT\shell\open\command',
    'HKLM:\SOFTWARE\Classes\MSEdgePDF\shell\open\command',
    'HKCU:\Software\Classes\microsoft-edge\shell\open\command',
    'HKLM:\SOFTWARE\Classes\microsoft-edge\shell\open\command'
)

if ($Revert) {
    if (-not (Test-Path $BackupPath)) {
        Write-Error "No backup at $BackupPath"
        exit 1
    }
    $backup = Get-Content $BackupPath -Raw | ConvertFrom-Json
    Write-Host "Reverting from $BackupPath ..."
    foreach ($s in $backup.Shortcuts) {
        Set-Shortcut -path $s.Path -arguments $s.Arguments
        Write-Host "  shortcut reverted: $($s.Path)"
    }
    foreach ($r in $backup.Registry) {
        if ($null -eq $r.Original) { continue }
        # Set value back. (default) value is "(default)" or "" depending on PowerShell version.
        Set-ItemProperty -Path $r.Path -Name '(Default)' -Value $r.Original -ErrorAction SilentlyContinue
        Write-Host "  registry reverted: $($r.Path)"
    }
    Write-Host "Done. Restart Edge for changes to take effect."
    exit 0
}

# === Apply mode ===

$report = [pscustomobject]@{
    Timestamp = (Get-Date).ToString('o')
    Port = $Port
    Flag = $flag
    Shortcuts = @()
    Registry = @()
}

# 1. Shortcuts
Write-Host "[1/2] Modifying Edge shortcuts ..."
$shortcuts = Get-AllEdgeShortcuts
foreach ($p in $shortcuts) {
    $sc = Read-Shortcut $p
    $oldArgs = $sc.Arguments
    if ($oldArgs -match [regex]::Escape($flag)) {
        Write-Host "  already has flag: $p"
    } else {
        $newArgs = if ([string]::IsNullOrWhiteSpace($oldArgs)) { $flag } else { "$oldArgs $flag" }
        Set-Shortcut -path $p -arguments $newArgs
        Write-Host "  patched: $p"
        Write-Host "    old args: $oldArgs"
        Write-Host "    new args: $newArgs"
    }
    $report.Shortcuts += [pscustomobject]@{ Path = $p; Arguments = $oldArgs }
}

# 2. Registry handlers for URL/HTML clicks
Write-Host "[2/2] Modifying ProgID registry handlers ..."
foreach ($regPath in $progIdRegPaths) {
    if (-not (Test-Path $regPath)) { continue }
    try {
        $current = (Get-ItemProperty -Path $regPath -Name '(Default)' -ErrorAction Stop).'(default)'
    } catch {
        try { $current = (Get-Item -Path $regPath).GetValue('') } catch { $current = $null }
    }
    if ($null -eq $current -or [string]::IsNullOrWhiteSpace($current)) { continue }
    $report.Registry += [pscustomobject]@{ Path = $regPath; Original = $current }
    if ($current -match [regex]::Escape($flag)) {
        Write-Host "  already has flag: $regPath"
        continue
    }
    # Inject `--remote-debugging-port=N` right after the .exe quoted path.
    # Patterns: `"...msedge.exe" --single-argument %1` or `"...msedge.exe" -- "%1"` etc.
    $patched = $current -replace '("(?:[^"]*\\)?msedge\.exe")(\s|")', "`$1 $flag`$2"
    if ($patched -eq $current) {
        # Fallback: append after the closing quote of the executable path.
        $patched = $current -replace '("(?:[^"]*\\)?msedge\.exe")', "`$1 $flag"
    }
    if ($patched -eq $current) {
        Write-Host "  could not patch (unrecognized format): $regPath  =  $current"
        continue
    }
    try {
        Set-ItemProperty -Path $regPath -Name '(Default)' -Value $patched -ErrorAction Stop
        Write-Host "  patched: $regPath"
        Write-Host "    old: $current"
        Write-Host "    new: $patched"
    } catch {
        Write-Host "  skipped (no permission, run as admin to patch HKLM): $regPath" -ForegroundColor Yellow
    }
}

# 3. Save backup
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $BackupPath -Encoding UTF8
Write-Host ""
Write-Host "Backup saved: $BackupPath"
Write-Host "Revert with:  pwsh scripts/setup-edge-debug-port.ps1 -Revert"
Write-Host ""
Write-Host "DONE. Close all Edge windows and reopen. After that, http://localhost:$Port/json/version should respond." -ForegroundColor Green
