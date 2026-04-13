# 03-checkpoint.ps1 — Create a named Hyper-V snapshot of the claude-test VM.
# Used after one-time post-install + Claude Code auth to lock down the
# baseline-clean state, and later for additional regression baselines.
#
# Usage (admin PowerShell):
#   .\03-checkpoint.ps1 -Snapshot baseline-clean

[CmdletBinding()]
param(
    [string]$VMName    = 'claude-test',
    [string]$Snapshot  = 'baseline-clean',
    [switch]$Force
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

Assert-Admin
Assert-HyperVAvailable

if (-not (Get-VM -Name $VMName -ErrorAction SilentlyContinue)) {
    Write-Host ('ERROR: VM "{0}" not found. Run 01-create-vm.ps1 first.' -f $VMName) -ForegroundColor Red
    throw 'VM not found'
}

$existing = Get-VMSnapshot -VMName $VMName -Name $Snapshot -ErrorAction SilentlyContinue
if ($existing -and -not $Force) {
    Write-Host ('ERROR: Snapshot "{0}" already exists on VM "{1}". Use -Force to overwrite.' -f $Snapshot, $VMName) -ForegroundColor Red
    throw 'Snapshot exists'
}

if ($existing -and $Force) {
    Write-Host ('Removing existing snapshot "{0}" (--Force)' -f $Snapshot) -ForegroundColor Yellow
    Remove-VMSnapshot -VMName $VMName -Name $Snapshot -Confirm:$false
}

Write-Host ('Creating checkpoint "{0}" on VM "{1}"...' -f $Snapshot, $VMName) -ForegroundColor Cyan
Checkpoint-VM -Name $VMName -SnapshotName $Snapshot

# Verify
$created = Get-VMSnapshot -VMName $VMName -Name $Snapshot -ErrorAction SilentlyContinue
if (-not $created) {
    throw ('Snapshot creation appeared to succeed but verification failed for "{0}"' -f $Snapshot)
}

Write-Host ('Checkpoint "{0}" created successfully.' -f $Snapshot) -ForegroundColor Green
Write-Host ''
Write-Host ('NEXT: Use .\04-revert-and-launch.ps1 -Snapshot {0} to spin up VM for tests.' -f $Snapshot) -ForegroundColor Yellow
