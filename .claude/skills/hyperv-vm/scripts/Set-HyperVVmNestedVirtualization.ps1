[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$VMName,
    [ValidateSet('Plan', 'Apply', 'Rollback')][string]$Action = 'Plan',
    [switch]$AllowGuestShutdown,
    [switch]$EnableMacAddressSpoofing,
    [ValidateRange(10, 3600)][int]$ShutdownTimeoutSeconds = 300,
    [string]$StatePath
)

. "$PSScriptRoot\Common.ps1"

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'ADMIN_REQUIRED: run this script in an elevated PowerShell session on the parent Hyper-V host'
}
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw 'HYPERV_MODULE_REQUIRED: the Hyper-V PowerShell module is unavailable on this machine'
}

$vm = Get-VM -Name $VMName -ErrorAction Stop
$processor = Get-VMProcessor -VMName $VMName -ErrorAction Stop
$adapters = @(Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop)
$hostTopology = Get-WindowsVirtualizationTopology

if (-not $StatePath) {
    $stateRoot = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'dev-pomogator\hyperv-vm'
    $StatePath = Join-Path $stateRoot "$VMName-nested-virtualization.json"
} elseif (-not [IO.Path]::IsPathRooted($StatePath)) {
    $StatePath = [IO.Path]::GetFullPath((Join-Path (Get-Location) $StatePath))
}

$snapshot = $null
$desiredExpose = $true
$restoreNetworkAdapters = $false
if ($Action -eq 'Rollback') {
    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
        throw "ROLLBACK_STATE_REQUIRED: no nested-virtualization state exists at $StatePath"
    }
    $snapshot = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ([string]$snapshot.VMId -ne [string]$vm.VMId.Guid) {
        throw 'ROLLBACK_IDENTITY_MISMATCH: state belongs to a different Hyper-V VM'
    }
    $desiredExpose = [bool]$snapshot.PreviousExposeVirtualizationExtensions
    $restoreNetworkAdapters = [bool]$snapshot.MacAddressSpoofingChanged
}

$currentAdapters = @($adapters | ForEach-Object {
    [pscustomobject]@{
        Name = $_.Name
        MacAddressSpoofing = [string]$_.MacAddressSpoofing
    }
})
$needsProcessorChange = [bool]$processor.ExposeVirtualizationExtensions -ne $desiredExpose
$needsMacChange = $false
if ($Action -eq 'Apply' -and $EnableMacAddressSpoofing) {
    $needsMacChange = @($currentAdapters | Where-Object { $_.MacAddressSpoofing -ne 'On' }).Count -gt 0
} elseif ($Action -eq 'Rollback' -and $restoreNetworkAdapters) {
    foreach ($previous in @($snapshot.PreviousNetworkAdapters)) {
        $current = $currentAdapters | Where-Object Name -eq $previous.Name | Select-Object -First 1
        if ($null -eq $current -or $current.MacAddressSpoofing -ne [string]$previous.MacAddressSpoofing) {
            $needsMacChange = $true
            break
        }
    }
}

$plan = [ordered]@{
    Action = $Action
    VMName = $vm.Name
    VMId = $vm.VMId.Guid
    State = [string]$vm.State
    Generation = $vm.Generation
    ConfigurationVersion = $vm.Version
    ProcessorCount = $vm.ProcessorCount
    HostTopology = $hostTopology.Role
    CurrentExposeVirtualizationExtensions = [bool]$processor.ExposeVirtualizationExtensions
    DesiredExposeVirtualizationExtensions = $desiredExpose
    CurrentNetworkAdapters = $currentAdapters
    MacAddressSpoofingChangeRequested = [bool]($EnableMacAddressSpoofing -or $restoreNetworkAdapters)
    RequiresShutdown = ($needsProcessorChange -or $needsMacChange) -and $vm.State -ne 'Off'
    StatePath = $StatePath
}
if ($Action -eq 'Plan') { [pscustomobject]$plan; return }

$changeRequired = $needsProcessorChange -or $needsMacChange
if (-not $changeRequired) {
    $archivedState = $null
    if ($Action -eq 'Rollback') {
        if (-not $PSCmdlet.ShouldProcess($VMName, 'archive already-restored nested virtualization state')) { return }
        $archivedState = '{0}.restored.{1}.json' -f ([IO.Path]::ChangeExtension($StatePath, $null)), (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
        Move-Item -LiteralPath $StatePath -Destination $archivedState -Force
    }
    [pscustomobject]@{
        Changed = $false
        Restarted = $false
        Restored = $Action -eq 'Rollback'
        StatePath = if ($archivedState) { $archivedState } else { $StatePath }
        Plan = [pscustomobject]$plan
    }
    return
}

if ($vm.State -ne 'Off' -and -not $AllowGuestShutdown) {
    throw "ALLOW_GUEST_SHUTDOWN_REQUIRED: $VMName is $($vm.State); rerun with -AllowGuestShutdown after saving guest work"
}
if (-not $PSCmdlet.ShouldProcess($VMName, "$Action nested virtualization on the parent Hyper-V host")) { return }

$wasRunning = $vm.State -eq 'Running'
if ($vm.State -ne 'Off') {
    Stop-HyperVVmGracefully -VMName $VMName -TimeoutSeconds $ShutdownTimeoutSeconds | Out-Null
}
$vm = Get-VM -Name $VMName -ErrorAction Stop
if ($vm.State -ne 'Off') { throw "VM_MUST_BE_OFF: $VMName is $($vm.State)" }

if ($Action -eq 'Apply') {
    if (Test-Path -LiteralPath $StatePath) {
        throw "UNRESOLVED_STATE_EXISTS: rollback or archive $StatePath before applying another mutation"
    }
    $snapshot = [ordered]@{
        SchemaVersion = 1
        VMName = $vm.Name
        VMId = $vm.VMId.Guid
        CapturedAt = (Get-Date).ToUniversalTime().ToString('o')
        PreviousExposeVirtualizationExtensions = [bool]$processor.ExposeVirtualizationExtensions
        PreviousNetworkAdapters = $currentAdapters
        MacAddressSpoofingChanged = [bool]$EnableMacAddressSpoofing
    }
    Write-AtomicJson -InputObject $snapshot -Path $StatePath
}

Set-VMProcessor -VMName $VMName -ExposeVirtualizationExtensions $desiredExpose -ErrorAction Stop
if ($Action -eq 'Apply' -and $EnableMacAddressSpoofing) {
    Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop | Set-VMNetworkAdapter -MacAddressSpoofing On -ErrorAction Stop
} elseif ($Action -eq 'Rollback' -and $restoreNetworkAdapters) {
    foreach ($previous in @($snapshot.PreviousNetworkAdapters)) {
        Get-VMNetworkAdapter -VMName $VMName -Name $previous.Name -ErrorAction Stop |
            Set-VMNetworkAdapter -MacAddressSpoofing ([string]$previous.MacAddressSpoofing) -ErrorAction Stop
    }
}

$verifiedProcessor = Get-VMProcessor -VMName $VMName -ErrorAction Stop
if ([bool]$verifiedProcessor.ExposeVirtualizationExtensions -ne $desiredExpose) {
    throw 'PROCESSOR_VERIFY_FAILED: ExposeVirtualizationExtensions does not match the requested state'
}

if ($wasRunning) {
    Start-VM -Name $VMName -ErrorAction Stop | Out-Null
    $deadline = (Get-Date).AddSeconds($ShutdownTimeoutSeconds)
    do {
        Start-Sleep -Seconds 2
        $heartbeat = Get-VMIntegrationService -VMName $VMName -Name Heartbeat -ErrorAction SilentlyContinue
    } while ($heartbeat.PrimaryStatusDescription -ne 'OK' -and (Get-Date) -lt $deadline)
    if ($heartbeat.PrimaryStatusDescription -ne 'OK') {
        throw "GUEST_HEARTBEAT_TIMEOUT: $VMName started but did not report an OK heartbeat"
    }
}

$archivedState = $null
if ($Action -eq 'Rollback') {
    $archivedState = '{0}.restored.{1}.json' -f ([IO.Path]::ChangeExtension($StatePath, $null)), (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    Move-Item -LiteralPath $StatePath -Destination $archivedState -Force
}

[pscustomobject]@{
    Changed = $true
    Restarted = $wasRunning
    Restored = $Action -eq 'Rollback'
    VMName = $VMName
    ExposeVirtualizationExtensions = [bool](Get-VMProcessor -VMName $VMName).ExposeVirtualizationExtensions
    State = [string](Get-VM -Name $VMName).State
    StatePath = if ($archivedState) { $archivedState } else { $StatePath }
}
