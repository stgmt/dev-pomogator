[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateSet('Plan','Apply','Rollback')][string]$Action,
    [Parameter(Mandatory)][string]$ConfigPath
)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$paths = Get-StatePaths -Config $config
$vhdRoot = Resolve-ConfigPath -Config $config -Path $config.Disk.RootDirectory
$vhdPath = Join-Path $vhdRoot "$($config.Name).vhdx"
$configFingerprint = Get-ConfigFingerprint -Config $config

$plan = [ordered]@{
    Guest = $config.Guest
    Generation = 2
    CPU = $config.ProcessorCount
    Memory = $config.Memory
    VhdPath = $vhdPath
    VhdSizeGB = $config.Disk.SizeGB
    VhdType = 'Dynamic'
    SwitchName = $config.Network.SwitchName
    InstallSource = Resolve-ConfigPath -Config $config -Path $config.Install.Source
    ExpectedSha256 = $config.Install.ExpectedSha256
    NestedVirtualization = $config.Features.NestedVirtualization
    Docker = [bool]($config.Features.InstallDocker -or $config.Features.InstallWslDocker)
    Access = if ($config.Guest -eq 'windows-ltsc') { 'PowerShell Direct and optional RDP' } else { 'SSH with pinned host key' }
    HighRisk = [ordered]@{
        DisableSecurity = $config.Optimization.DisableSecurity
        DisableFirewall = $config.Optimization.DisableFirewall
        DisableUpdates = $config.Optimization.DisableUpdates
        AllowDelete = $config.Safety.AllowDelete
    }
    ConfigFingerprint = $configFingerprint
}
if ($Action -eq 'Plan') { [pscustomobject]$plan; return }

if ($Action -eq 'Rollback') {
    $rollback = Join-Path $PSScriptRoot 'Restore-HyperVVm.ps1'
    if (-not (Test-Path -LiteralPath $rollback)) { throw 'Checked-in rollback implementation is missing' }
    if ($PSCmdlet.ShouldProcess($config.Name, 'Restore captured guest and VM settings')) {
        & $rollback -ConfigPath $ConfigPath -Confirm:$false
    }
    return
}

$preflight = & "$PSScriptRoot\Test-HyperVVmPrerequisites.ps1" -ConfigPath $ConfigPath
if (-not $preflight.Valid) { throw "Prerequisites failed: $($preflight.Issues -join '; ')" }
if (-not $PSCmdlet.ShouldProcess($config.Name, 'Create, provision, and start Hyper-V VM')) { return }

New-Item -ItemType Directory -Force -Path $vhdRoot, $paths.StateDirectory, $paths.ReportDirectory | Out-Null
$existingState = if (Test-Path -LiteralPath $paths.StateFile) { Get-Content -LiteralPath $paths.StateFile -Raw | ConvertFrom-Json } else { $null }
$existingVm = Get-VM -Name $config.Name -ErrorAction SilentlyContinue
if ($existingVm) {
    if (-not $existingState -or $existingState.VMId -ne $existingVm.VMId.Guid -or $existingState.ConfigFingerprint -ne $configFingerprint) {
        throw 'An existing VM is not owned by the matching state bundle; replacement is intentionally not automated'
    }
    if ($existingVm.State -eq 'Off') { Start-VM -Name $config.Name | Out-Null }
    [pscustomobject]$existingState
    return
}

$journal = [ordered]@{
    SchemaVersion = 1
    Stage = 'preparing'
    VMName = $config.Name
    VhdPath = $vhdPath
    InstallSource = $preflight.InstallSource
    InstallSha256 = $preflight.SourceSha256
    ConfigFingerprint = $configFingerprint
    CreatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
Write-AtomicJson -InputObject $journal -Path $paths.StateFile

$created = $false
try {
    $media = & "$PSScriptRoot\New-HyperVVmProvisioningMedia.ps1" -ConfigPath $ConfigPath -Confirm:$false
    $memoryStartup = [int64]$config.Memory.StartupMB * 1MB
    $vm = New-VM -Name $config.Name -Generation 2 -MemoryStartupBytes $memoryStartup -NewVHDPath $vhdPath -NewVHDSizeBytes ([int64]$config.Disk.SizeGB * 1GB) -SwitchName $config.Network.SwitchName
    $created = $true
    Set-VM -Name $config.Name -ProcessorCount $config.ProcessorCount -CheckpointType Production
    if ($config.Memory.Dynamic) {
        Set-VMMemory -VMName $config.Name -DynamicMemoryEnabled $true -StartupBytes $memoryStartup -MinimumBytes ([int64]$config.Memory.MinimumMB * 1MB) -MaximumBytes ([int64]$config.Memory.MaximumMB * 1MB) -Buffer $config.Memory.BufferPercent
    } else {
        Set-VMMemory -VMName $config.Name -DynamicMemoryEnabled $false -StartupBytes $memoryStartup
    }
    Set-VMProcessor -VMName $config.Name -ExposeVirtualizationExtensions ([bool]$config.Features.NestedVirtualization)
    Set-VMNetworkAdapter -VMName $config.Name -MacAddressSpoofing $(if ($config.Features.NestedVirtualization) { 'On' } else { 'Off' })
    $secureBootTemplate = if ($config.Guest -eq 'windows-ltsc') { 'MicrosoftWindows' } else { 'MicrosoftUEFICertificateAuthority' }
    Set-VMFirmware -VMName $config.Name -EnableSecureBoot On -SecureBootTemplate $secureBootTemplate
    $installDvd = Add-VMDvdDrive -VMName $config.Name -Path $preflight.InstallSource -Passthru
    Add-VMDvdDrive -VMName $config.Name -Path $media.IsoPath | Out-Null
    Set-VMFirmware -VMName $config.Name -FirstBootDevice $installDvd
    Start-VM -Name $config.Name | Out-Null

    $journal.Stage = 'media-ready'
    $journal.VMId = $vm.VMId.Guid
    $journal.ProvisioningMedia = $media.IsoPath
    $journal.SshHostKeyFingerprint = $media.SshHostKeyFingerprint
    $journal.StartedAt = (Get-Date).ToUniversalTime().ToString('o')
    $journal.Next = if ($config.Guest -eq 'windows-ltsc') { 'Wait for unattended setup, then run Finalize-WindowsGuest.ps1' } else { 'Wait for cloud-init, then run Connect-HyperVVm.ps1; strict host-key trust is pinned from provisioning media' }
    Write-AtomicJson -InputObject $journal -Path $paths.StateFile
    [pscustomobject]$journal
} catch {
    if ($created) {
        Stop-VM -Name $config.Name -TurnOff -Force -ErrorAction SilentlyContinue
        Remove-VM -Name $config.Name -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $vhdPath) { Remove-Item -LiteralPath $vhdPath -Force -ErrorAction SilentlyContinue }
    $journal.Stage = 'failed-cleaned'
    $journal.Error = $_.Exception.Message
    Write-AtomicJson -InputObject $journal -Path $paths.StateFile
    throw
}
