# 02-post-install.ps1 — Runs INSIDE the Hyper-V VM after Win 11 install completes.
# Triggered automatically by SetupComplete.cmd (placed in C:\Windows\Setup\Scripts\
# by autounattend.xml's specialize pass).
#
# Enables RDP, installs Node.js LTS + Git via winget, installs Claude Code globally.
# Creates a sentinel flag at C:\post-install-complete.flag for host scripts to poll.
#
# Manual usage (inside VM, admin PowerShell):
#   C:\hyperv-test-runner\02-post-install.ps1

[CmdletBinding()]
param(
    [switch]$SkipClaudeCode
)

# Inline Test-IsAdmin / Assert-Admin (this script runs INSIDE VM, no common.ps1 sourcing)
function Test-IsAdmin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}
function Assert-Admin {
    if (-not (Test-IsAdmin)) {
        Write-Host 'ERROR: Run as Administrator.' -ForegroundColor Red
        throw 'Not elevated'
    }
}

Assert-Admin

Write-Host '=== hyperv-test-runner post-install (in VM) ===' -ForegroundColor Cyan

# 1. Enable Remote Desktop
Write-Host '[1/4] Enabling Remote Desktop...' -ForegroundColor Yellow
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' `
                 -Name 'fDenyTSConnections' `
                 -Value 0
Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'
Write-Host 'Remote Desktop enabled (firewall + registry).' -ForegroundColor Green

# 2. Install Node.js LTS + Git via winget
Write-Host '[2/4] Installing Node.js LTS via winget...' -ForegroundColor Yellow
winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements

Write-Host '[3/4] Installing Git via winget...' -ForegroundColor Yellow
winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements

# Refresh PATH so the next npm command sees node
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path','User')

# 3. Install Claude Code globally
if (-not $SkipClaudeCode) {
    Write-Host '[4/4] Installing @anthropic-ai/claude-code globally...' -ForegroundColor Yellow
    & npm install -g '@anthropic-ai/claude-code'
} else {
    Write-Host '[4/4] Skipping Claude Code (--SkipClaudeCode)' -ForegroundColor Yellow
}

# 4. Create sentinel flag for host scripts to detect completion
$sentinel = 'C:\post-install-complete.flag'
Set-Content -Path $sentinel -Value ([DateTime]::UtcNow.ToString('o')) -Encoding ASCII

Write-Host ''
Write-Host '=== Post-install complete ===' -ForegroundColor Green
Write-Host ('Sentinel: {0}' -f $sentinel)
Write-Host ''
Write-Host 'NEXT: On the HOST machine, login to Claude Code interactively in this VM,' -ForegroundColor Yellow
Write-Host '      then run .\03-checkpoint.ps1 -Snapshot baseline-clean from host PowerShell (admin).' -ForegroundColor Yellow
Write-Host ''
