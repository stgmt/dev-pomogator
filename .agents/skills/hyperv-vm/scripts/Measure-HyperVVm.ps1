[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [Parameter(Mandatory)][ValidateSet('before','after')][string]$Phase,
    [int]$StabilizationSeconds = 120
)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$paths = Get-StatePaths -Config $config
New-Item -ItemType Directory -Force -Path $paths.ReportDirectory | Out-Null
Start-Sleep -Seconds $StabilizationSeconds
$vm = Get-VM -Name $config.Name -ErrorAction Stop
$hostOs = Get-CimInstance Win32_OperatingSystem
$limits = [ordered]@{
    ProcessorCount=$vm.ProcessorCount; DynamicMemory=$vm.DynamicMemoryEnabled
    StartupMB=[math]::Round($vm.MemoryStartup/1MB,1); MinimumMB=[math]::Round($vm.MemoryMinimum/1MB,1); MaximumMB=[math]::Round($vm.MemoryMaximum/1MB,1)
    WslMemoryMB=$config.Features.WslMemoryMB; WslSwapMB=$config.Features.WslSwapMB
}

if ($config.Guest -eq 'windows-ltsc') {
    $credential = Get-HyperVVmCredential -Config $config
    $guest = Invoke-Command -VMName $config.Name -Credential $credential -ScriptBlock {
        $os=Get-CimInstance Win32_OperatingSystem; $svchost=0; $svchostBytes=0L; $docker=@(); $processCount=0
        foreach($process in Get-Process){$processCount++;if($process.Name -eq 'svchost'){$svchost++;$svchostBytes+=$process.WorkingSet64};if($process.Name -in 'dockerd','docker','wslservice','vmmemWSL'){$docker += [pscustomobject]@{Name=$process.Name;WorkingSetMB=[math]::Round($process.WorkingSet64/1MB,1)}}}
        [pscustomobject]@{OS=$os.Caption;Build=$os.BuildNumber;UsedMB=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/1KB,1);AvailableMB=[math]::Round($os.FreePhysicalMemorySize/1KB,1);ProcessCount=$processCount;SvchostCount=$svchost;SvchostWorkingSetMB=[math]::Round($svchostBytes/1MB,1);DockerProcesses=$docker}
    }
} else {
    $lines = @(Invoke-UbuntuSsh -Config $config -Command "awk '/MemTotal|MemAvailable/{print \$1\$2}' /proc/meminfo; printf 'KERNEL='; uname -r; printf 'DOCKER='; docker version --format '{{.Server.Version}}' 2>/dev/null || true; printf 'CONTAINERS='; docker ps --format '{{.Image}}' 2>/dev/null | sort | paste -sd, -")
    $values=@{}; foreach($line in $lines){if($line -match '^([^=]+)=(.*)$'){$values[$matches[1].TrimEnd(':')]=$matches[2]}}
    $totalKB=[double]($values.MemTotal -replace ' kB',''); $availableKB=[double]($values.MemAvailable -replace ' kB','')
    $guest=[pscustomobject]@{OS='Ubuntu';Kernel=$values.KERNEL;DockerVersion=$values.DOCKER;Containers=@(($values.CONTAINERS -split ',')|Where-Object{$_});UsedMB=[math]::Round(($totalKB-$availableKB)/1KB,1);AvailableMB=[math]::Round($availableKB/1KB,1)}
}
$workload = Get-HyperVVmWorkloadIdentity -Config $config
$report = [ordered]@{
    SchemaVersion=2; Phase=$Phase; CapturedAt=(Get-Date).ToUniversalTime().ToString('o'); VMName=$config.Name; VMId=$vm.VMId.Guid
    ConfigFingerprint=Get-ConfigFingerprint -Config $config; Limits=$limits; LimitsFingerprint=Get-ConfigFingerprint -Config $limits
    StabilizationSeconds=$StabilizationSeconds; HostFreeMB=[math]::Round($hostOs.FreePhysicalMemory/1KB,1); VMAssignedMB=[math]::Round($vm.MemoryAssigned/1MB,1); VMDemandMB=[math]::Round($vm.MemoryDemand/1MB,1)
    Guest=$guest; Workload=$workload; WorkloadFingerprint=Get-ConfigFingerprint -Config $workload
}
Write-AtomicJson -InputObject $report -Path (Join-Path $paths.ReportDirectory "$Phase.json")
[pscustomobject]$report
