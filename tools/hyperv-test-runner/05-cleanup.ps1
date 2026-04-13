# 05-cleanup.ps1 — Permanently remove the claude-test Hyper-V VM, all of its
# snapshots, and (optionally) the backing VHDX file.
#
# DESTRUCTIVE — requires explicit -Confirm OR -Force.
#
# Usage (admin PowerShell):
#   .\05-cleanup.ps1 -Confirm                       # remove VM + snapshots, keep VHDX
#   .\05-cleanup.ps1 -Confirm -RemoveVHDX           # also delete VHDX file
#   .\05-cleanup.ps1 -Force                         # same as -Confirm, no prompt

[CmdletBinding()]
param(
    [string]$VMName     = 'claude-test',
    [string]$VHDPath    = 'D:\HyperV\claude-test.vhdx',
    [switch]$Confirm,
    [switch]$Force,
    [switch]$RemoveVHDX
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

Assert-Admin

# Safety gate — refuse to run without explicit Confirm/Force
if (-not ($Confirm -or $Force)) {
    Write-Host ''
    Write-Host 'ERROR: 05-cleanup.ps1 is destructive.' -ForegroundColor Red
    Write-Host 'Pass -Confirm or -Force to actually delete the VM and snapshots.' -ForegroundColor Yellow
    Write-Host ''
    throw 'Destructive operation requires -Confirm or -Force'
}

$vm = Get-VM -Name $VMName -ErrorAction SilentlyContinue
if (-not $vm) {
    Write-Host ('VM "{0}" not found — nothing to clean up.' -f $VMName) -ForegroundColor Yellow
    if ($RemoveVHDX -and (Test-Path -LiteralPath $VHDPath)) {
        Write-Host ('Removing orphan VHDX: {0}' -f $VHDPath) -ForegroundColor Yellow
        Remove-Item -LiteralPath $VHDPath -Force
    }
    return
}

Write-Host ('Stopping VM "{0}"...' -f $VMName) -ForegroundColor Cyan
Stop-VM -Name $VMName -Force -ErrorAction SilentlyContinue

$snapshots = Get-VMSnapshot -VMName $VMName -ErrorAction SilentlyContinue
if ($snapshots) {
    Write-Host ('Removing {0} snapshot(s)...' -f $snapshots.Count) -ForegroundColor Cyan
    $snapshots | Remove-VMSnapshot -Confirm:$false
}

# Wait for snapshot merging to settle before Remove-VM
Start-Sleep -Seconds 2

Write-Host ('Removing VM "{0}"...' -f $VMName) -ForegroundColor Cyan
Remove-VM -Name $VMName -Force

if ($RemoveVHDX) {
    if (Test-Path -LiteralPath $VHDPath) {
        Write-Host ('Removing VHDX: {0}' -f $VHDPath) -ForegroundColor Cyan
        Remove-Item -LiteralPath $VHDPath -Force
    } else {
        Write-Host ('VHDX not found at {0} — skipped.' -f $VHDPath) -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host ('VM "{0}" removed.' -f $VMName) -ForegroundColor Green
