[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateSet('Plan','Apply','Rollback')][string]$Action,
    [Parameter(Mandatory)][string]$ConfigPath
)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$paths = Get-StatePaths $imported
$source = Resolve-ConfigPath $imported.Directory $config.Install.Source
$vhdDirectory = Join-Path $config.Disk.RootDirectory $config.Name
$vhdPath = Join-Path $vhdDirectory "$($config.Name).vhdx"
$fingerprint = Get-ConfigFingerprint $config

$plan = [pscustomobject]@{
    Action = $Action
    Name = $config.Name
    Guest = $config.Guest
    Generation = 2
    CPU = $config.ProcessorCount
    Memory = $config.Memory
    VhdPath = $vhdPath
    VhdSizeGB = $config.Disk.SizeGB
    Switch = $config.Network.SwitchName
    InstallSource = $source
    ExpectedSha256 = $config.Install.ExpectedSha256
    NestedVirtualization = $config.Features.NestedVirtualization
    Docker = $config.Features.InstallDocker -or $config.Features.InstallWslDocker
    Access = if ($config.Guest -eq 'windows-ltsc') { 'PowerShell Direct' } else { 'SSH key' }
    HighRisk = [pscustomobject]@{
        DisableSecurity = $config.Optimization.DisableSecurity
        DisableFirewall = $config.Optimization.DisableFirewall
        DisableUpdates = $config.Optimization.DisableUpdates
        ReplaceExistingVm = $config.Safety.AllowReplaceExistingVm
        AllowDelete = $config.Safety.AllowDelete
    }
    ConfigFingerprint = $fingerprint
}
if ($Action -eq 'Plan') { $plan; exit 0 }

if ($Action -eq 'Rollback') {
    $rollback = Join-Path $paths.State 'rollback.ps1'
    if (-not (Test-Path $rollback)) { throw "Rollback script not found: $rollback" }
    if ($PSCmdlet.ShouldProcess($config.Name, 'restore recorded VM and guest settings')) { & $rollback -ConfigPath $imported.Path }
    exit
}

& "$PSScriptRoot\Test-HyperVVmPrerequisites.ps1" -ConfigPath $imported.Path | Out-Host
if (-not $PSCmdlet.ShouldProcess($config.Name, "create $($config.Guest) Hyper-V VM")) { exit }

if (Get-VM -Name $config.Name -ErrorAction SilentlyContinue) {
    throw 'Replacement is intentionally not automated. Export/remove the existing VM after explicit review, then rerun.'
}
New-Item -ItemType Directory -Force -Path $vhdDirectory,$paths.State,$paths.Reports | Out-Null

$memoryBytes = [int64]$config.Memory.StartupMB * 1MB
New-VM -Name $config.Name -Generation 2 -MemoryStartupBytes $memoryBytes -NewVHDPath $vhdPath -NewVHDSizeBytes ([int64]$config.Disk.SizeGB * 1GB) -SwitchName $config.Network.SwitchName | Out-Null
Set-VM -Name $config.Name -ProcessorCount $config.ProcessorCount -CheckpointType Production
if ($config.Memory.Dynamic) {
    Set-VMMemory -VMName $config.Name -DynamicMemoryEnabled $true -StartupBytes $memoryBytes -MinimumBytes ([int64]$config.Memory.MinimumMB * 1MB) -MaximumBytes ([int64]$config.Memory.MaximumMB * 1MB) -Buffer $config.Memory.BufferPercent
} else { Set-VMMemory -VMName $config.Name -DynamicMemoryEnabled $false -StartupBytes $memoryBytes }
Set-VMProcessor -VMName $config.Name -ExposeVirtualizationExtensions ([bool]$config.Features.NestedVirtualization)
Set-VMNetworkAdapter -VMName $config.Name -MacAddressSpoofing $(if ($config.Features.NestedVirtualization) { 'On' } else { 'Off' })
$template = if ($config.Guest -eq 'windows-ltsc') { 'MicrosoftWindows' } else { 'MicrosoftUEFICertificateAuthority' }
Set-VMFirmware -VMName $config.Name -EnableSecureBoot On -SecureBootTemplate $template

$dvd = Add-VMDvdDrive -VMName $config.Name -Path $source -Passthru
Set-VMFirmware -VMName $config.Name -FirstBootDevice $dvd
$state = [pscustomobject]@{
    SchemaVersion = 1
    Stage = 'created'
    VMName = $config.Name
    VMId = (Get-VM $config.Name).VMId.Guid
    VhdPath = $vhdPath
    InstallSource = $source
    InstallSha256 = Get-FileSha256 $source
    ConfigFingerprint = $fingerprint
    CreatedAt = Get-Date -Format o
    Next = if ($config.Guest -eq 'windows-ltsc') { 'Generate unattended media and run Finalize-WindowsGuest.ps1 after setup' } else { 'Generate NoCloud seed media and verify SSH' }
}
Write-AtomicJson $state $paths.StateFile
$state
