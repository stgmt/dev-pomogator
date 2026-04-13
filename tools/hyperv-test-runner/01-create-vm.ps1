# 01-create-vm.ps1 — Create the claude-test Hyper-V VM with vTPM, Secure Boot,
# Win 11 ISO mounted, and an autounattend.xml virtual floppy/ISO injected for
# silent install. Runs ONCE per VM lifetime (or with -Force to recreate).
#
# Usage (admin PowerShell):
#   .\01-create-vm.ps1 -IsoPath D:\iso\Win11_Enterprise_Eval.iso

[CmdletBinding()]
param(
    [string]$VMName    = 'claude-test',
    [string]$VHDPath   = 'D:\HyperV\claude-test.vhdx',
    [Parameter(Mandatory)][string]$IsoPath,
    [int]$MemoryGB     = 6,
    [int]$CPUCount     = 4,
    [int]$DiskGB       = 60,
    [string]$SwitchName = 'Default Switch',
    [switch]$Force
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

Assert-Admin
Assert-HyperVAvailable

if (-not (Test-Path -LiteralPath $IsoPath)) {
    Write-Host ('ERROR: ISO not found at: {0}' -f $IsoPath) -ForegroundColor Red
    Write-Host 'Download Win 11 Enterprise Eval from:' -ForegroundColor Yellow
    Write-Host '  https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise' -ForegroundColor Yellow
    throw 'ISO file missing'
}

# Idempotency — refuse to recreate without -Force
$existingVm = Get-VM -Name $VMName -ErrorAction SilentlyContinue
if ($existingVm -and -not $Force) {
    Write-Host ('ERROR: VM "{0}" already exists. Use -Force to recreate.' -f $VMName) -ForegroundColor Red
    throw 'VM exists'
}

if ($existingVm -and $Force) {
    Write-Host ('Removing existing VM "{0}" (--Force)' -f $VMName) -ForegroundColor Yellow
    Stop-VM -Name $VMName -Force -ErrorAction SilentlyContinue
    Get-VMSnapshot -VMName $VMName -ErrorAction SilentlyContinue | Remove-VMSnapshot -Confirm:$false
    Remove-VM -Name $VMName -Force
    if (Test-Path -LiteralPath $VHDPath) { Remove-Item -LiteralPath $VHDPath -Force }
}

$vhdDir = Split-Path -Parent $VHDPath
if (-not (Test-Path -LiteralPath $vhdDir)) {
    New-Item -ItemType Directory -Path $vhdDir -Force | Out-Null
}

Write-Host ('Creating VHDX {0} ({1} GB, dynamic)' -f $VHDPath, $DiskGB) -ForegroundColor Cyan
New-VHD -Path $VHDPath -SizeBytes ($DiskGB * 1GB) -Dynamic | Out-Null

Write-Host ('Creating Generation 2 VM "{0}"' -f $VMName) -ForegroundColor Cyan
New-VM -Name $VMName `
       -Generation 2 `
       -MemoryStartupBytes ($MemoryGB * 1GB) `
       -VHDPath $VHDPath `
       -SwitchName $SwitchName | Out-Null

Set-VM -Name $VMName -DynamicMemory `
       -MemoryMinimumBytes 2GB `
       -MemoryMaximumBytes ($MemoryGB * 1GB) `
       -ProcessorCount $CPUCount `
       -AutomaticCheckpointsEnabled $false

# vTPM — required for Win 11 boot
Write-Host 'Configuring vTPM (required for Win 11)' -ForegroundColor Cyan
$owner = Get-HgsGuardian -Name 'UntrustedGuardian' -ErrorAction SilentlyContinue
if (-not $owner) {
    $owner = New-HgsGuardian -Name 'UntrustedGuardian' -GenerateCertificates
}
$keyProtector = New-HgsKeyProtector -Owner $owner -AllowUntrustedRoot
Set-VMKeyProtector -VMName $VMName -KeyProtector $keyProtector.RawData
Enable-VMTPM -VMName $VMName

# Secure Boot
Set-VMFirmware -VMName $VMName -EnableSecureBoot On -SecureBootTemplate 'MicrosoftWindows'

# Mount Win 11 ISO as primary DVD
Write-Host ('Mounting Win 11 ISO: {0}' -f $IsoPath) -ForegroundColor Cyan
Add-VMDvdDrive -VMName $VMName -Path $IsoPath

# Build autounattend ISO from template (so Windows Setup picks it up at boot)
$unattendDir   = Join-Path $PSScriptRoot 'unattend'
$unattendXml   = Join-Path $unattendDir 'autounattend.xml'
$setupComplete = Join-Path $unattendDir 'SetupComplete.cmd'
$postInstall   = Join-Path $PSScriptRoot '02-post-install.ps1'

if ((Test-Path $unattendXml) -and (Test-Path $setupComplete) -and (Test-Path $postInstall)) {
    $unattendIso = Join-Path $env:TEMP ('hyperv-test-runner-unattend-{0}.iso' -f ([guid]::NewGuid().ToString('N')))
    $stageDir    = Join-Path $env:TEMP ('hyperv-unattend-stage-{0}' -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
    Copy-Item $unattendXml   (Join-Path $stageDir 'autounattend.xml')
    Copy-Item $setupComplete (Join-Path $stageDir 'SetupComplete.cmd')
    Copy-Item $postInstall   (Join-Path $stageDir '02-post-install.ps1')

    # Use oscdimg if available (Windows ADK), fallback: skip ISO build with warning
    $oscdimg = Get-Command oscdimg.exe -ErrorAction SilentlyContinue
    if ($oscdimg) {
        Write-Host ('Building unattend ISO at {0}' -f $unattendIso) -ForegroundColor Cyan
        & oscdimg.exe -n -m "$stageDir" "$unattendIso" | Out-Null
        Add-VMDvdDrive -VMName $VMName -Path $unattendIso
        Write-Host 'Unattend ISO mounted as secondary DVD.' -ForegroundColor Green
    } else {
        Write-Host 'WARNING: oscdimg.exe not found (install Windows ADK for full automation).' -ForegroundColor Yellow
        Write-Host 'You will need to run 02-post-install.ps1 manually inside the VM after Win install.' -ForegroundColor Yellow
        Remove-Item -Recurse -Force $stageDir
    }
} else {
    Write-Host 'WARNING: unattend templates missing — VM will require manual Windows install.' -ForegroundColor Yellow
}

# Set DVD as first boot device
$dvds = Get-VMDvdDrive -VMName $VMName
Set-VMFirmware -VMName $VMName -FirstBootDevice $dvds[0]

Write-Host ''
Write-Host ('VM "{0}" created.' -f $VMName) -ForegroundColor Green
Write-Host ''
Write-Host 'Starting VM and opening VMConnect...' -ForegroundColor Cyan
Start-VM -Name $VMName
Start-Process vmconnect.exe -ArgumentList 'localhost', $VMName

Write-Host ''
Write-Host '=== NEXT STEPS ===' -ForegroundColor Yellow
Write-Host '1. Wait for silent Win 11 install (~25 min via unattend.xml).'
Write-Host '2. SetupComplete.cmd will auto-run 02-post-install.ps1 (~5 min more).'
Write-Host '3. Open VMConnect, login to Claude Code interactively (browser OAuth).'
Write-Host '4. On host (admin): .\03-checkpoint.ps1 -Snapshot baseline-clean'
Write-Host ''
