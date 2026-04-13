# 04-revert-and-launch.ps1 — Daily test driver: revert claude-test VM to a
# named snapshot, start it, wait for heartbeat + IPv4, print the IP for mstsc,
# and (optionally) open VMConnect.
#
# Usage (admin PowerShell):
#   .\04-revert-and-launch.ps1                                # default snapshot baseline-clean
#   .\04-revert-and-launch.ps1 -Snapshot bug-X-repro
#   .\04-revert-and-launch.ps1 -NoVMConnect                   # for AI-driven runs

[CmdletBinding()]
param(
    [string]$VMName     = 'claude-test',
    [string]$Snapshot   = 'baseline-clean',
    [switch]$NoVMConnect,
    [int]$Timeout       = 90
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

Assert-Admin
Assert-HyperVAvailable

if (-not (Get-VM -Name $VMName -ErrorAction SilentlyContinue)) {
    Write-Host ('ERROR: VM "{0}" not found. Run 01-create-vm.ps1 first.' -f $VMName) -ForegroundColor Red
    throw 'VM not found'
}

$snap = Get-VMSnapshot -VMName $VMName -Name $Snapshot -ErrorAction SilentlyContinue
if (-not $snap) {
    $available = (Get-VMSnapshot -VMName $VMName | Select-Object -ExpandProperty Name) -join ', '
    Write-Host ('ERROR: Snapshot "{0}" not found on VM "{1}".' -f $Snapshot, $VMName) -ForegroundColor Red
    Write-Host ('Available snapshots: {0}' -f $available) -ForegroundColor Yellow
    throw 'Snapshot not found'
}

# Verify Enhanced Session Mode (auto-fix if disabled)
$host_ = Get-VMHost
if (-not $host_.EnableEnhancedSessionMode) {
    Write-Host 'WARNING: Enhanced Session Mode is disabled on host. Auto-enabling...' -ForegroundColor Yellow
    Set-VMHost -EnableEnhancedSessionMode $true
}

Write-Host ('Reverting VM "{0}" to snapshot "{1}"...' -f $VMName, $Snapshot) -ForegroundColor Cyan
Restore-VMSnapshot -VMSnapshot $snap -Confirm:$false

Write-Host ('Starting VM "{0}"...' -f $VMName) -ForegroundColor Cyan
Start-VM -Name $VMName

$ip = Wait-VMReady -VMName $VMName -TimeoutSeconds $Timeout

Write-Host ''
Write-Host '=== VM ready ===' -ForegroundColor Green
Write-Host ('VM:       {0}' -f $VMName)
Write-Host ('Snapshot: {0}' -f $Snapshot)
Write-Host ('IPv4:     {0}' -f $ip)
Write-Host ''
Write-Host ('RDP:      mstsc /v:{0}' -f $ip) -ForegroundColor Yellow
Write-Host ''

if (-not $NoVMConnect) {
    Write-Host 'Opening VMConnect (Enhanced Session)...' -ForegroundColor Cyan
    Start-Process vmconnect.exe -ArgumentList 'localhost', $VMName
}
