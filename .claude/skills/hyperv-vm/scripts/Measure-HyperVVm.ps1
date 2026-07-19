[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [Parameter(Mandatory)][ValidateSet('before','after')][string]$Phase,
    [int]$StabilizationSeconds = 120
)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$paths = Get-StatePaths $imported
New-Item -ItemType Directory -Force -Path $paths.Reports | Out-Null
Start-Sleep -Seconds $StabilizationSeconds
$vm = Get-VM $config.Name -ErrorAction Stop
$hostOs = Get-CimInstance Win32_OperatingSystem
$memoryFingerprint = [ordered]@{
    ProcessorCount = $vm.ProcessorCount
    DynamicMemory = $vm.DynamicMemoryEnabled
    StartupMB = $vm.MemoryStartup / 1MB
    MinimumMB = $vm.MemoryMinimum / 1MB
    MaximumMB = $vm.MemoryMaximum / 1MB
    WslMemoryMB = $config.Features.WslMemoryMB
    WslSwapMB = $config.Features.WslSwapMB
}

if ($config.Guest -eq 'windows-ltsc') {
    $credential = Get-Credential -UserName $config.Access.AdminUser -Message "Credential for PowerShell Direct to $($config.Name)"
    $guest = Invoke-Command -VMName $config.Name -Credential $credential -ScriptBlock {
        $os = Get-CimInstance Win32_OperatingSystem
        $processes = @(Get-Process)
        $svchost = @($processes | Where-Object Name -eq 'svchost')
        [pscustomobject]@{
            OS = $os.Caption
            Version = $os.Version
            UsedMB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1KB, 1)
            AvailableMB = [math]::Round($os.FreePhysicalMemory / 1KB, 1)
            ProcessCount = $processes.Count
            SvchostCount = $svchost.Count
            SvchostWorkingSetMB = [math]::Round(($svchost | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
            DockerProcesses = @($processes | Where-Object Name -in 'wslservice','vmmemWSL' | Select-Object Name,@{n='WorkingSetMB';e={[math]::Round($_.WorkingSet64/1MB,1)}})
        }
    }
} else {
    $connection = & "$PSScriptRoot\Connect-HyperVVm.ps1" -ConfigPath $imported.Path
    $raw = & ssh -i (Resolve-ConfigPath $imported.Directory $config.Access.SshPrivateKeyPath) -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($connection.KnownHosts)" "$($connection.User)@$($connection.Address)" "awk '/MemTotal|MemAvailable/ {print `$1`$2}' /proc/meminfo; ps -e --no-headers | wc -l; docker version --format '{{.Server.Version}}' 2>/dev/null || true"
    $guest = [pscustomobject]@{ Raw = @($raw) }
}

$dockerManifest = if ($config.Guest -eq 'windows-ltsc') { 'verified separately through WSL' } else { 'queried over SSH' }
$result = [pscustomobject]@{
    SchemaVersion = 1
    Phase = $Phase
    Timestamp = Get-Date -Format o
    VMName = $config.Name
    VMId = $vm.VMId.Guid
    ConfigFingerprint = Get-ConfigFingerprint $config
    LimitsFingerprint = Get-ConfigFingerprint $memoryFingerprint
    StabilizationSeconds = $StabilizationSeconds
    HostFreeMB = [math]::Round($hostOs.FreePhysicalMemory / 1KB, 1)
    VMAssignedMB = [math]::Round($vm.MemoryAssigned / 1MB, 1)
    VMDemandMB = [math]::Round($vm.MemoryDemand / 1MB, 1)
    Guest = $guest
    Workload = $dockerManifest
}
Write-AtomicJson $result (Join-Path $paths.Reports "$Phase.json")
$result
