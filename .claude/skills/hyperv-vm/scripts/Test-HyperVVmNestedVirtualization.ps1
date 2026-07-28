[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$VMName,
    [string]$WslDistribution = 'Ubuntu-24.04',
    [pscredential]$GuestCredential,
    [switch]$SkipDocker
)

. "$PSScriptRoot\Common.ps1"

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'ADMIN_REQUIRED: run verification in elevated PowerShell on the parent Hyper-V host'
}
if (-not $GuestCredential) { $GuestCredential = Get-Credential -Message "Windows credential for Hyper-V guest $VMName" }

$checks = [Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
    $checks.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Detail = $Detail })
}

$hostTopology = Get-WindowsVirtualizationTopology
$vm = Get-VM -Name $VMName -ErrorAction Stop
$processor = Get-VMProcessor -VMName $VMName -ErrorAction Stop
$heartbeat = Get-VMIntegrationService -VMName $VMName -Name Heartbeat -ErrorAction Stop
Add-Check 'VM running' ($vm.State -eq 'Running') ([string]$vm.State)
Add-Check 'Nested virtualization exposed' ([bool]$processor.ExposeVirtualizationExtensions) ([string]$processor.ExposeVirtualizationExtensions)
Add-Check 'Heartbeat' ($heartbeat.PrimaryStatusDescription -eq 'OK') $heartbeat.PrimaryStatusDescription

$guest = Invoke-Command -VMName $VMName -Credential $GuestCredential -ArgumentList $WslDistribution,([bool]$SkipDocker) -ScriptBlock {
    param($Distribution, $SkipDockerProbe)
    $system = Get-CimInstance Win32_ComputerSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $wsl = "$env:ProgramFiles\WSL\wsl.exe"
    if (-not (Test-Path -LiteralPath $wsl)) { $wsl = 'wsl.exe' }

    $status = @(& $wsl --status 2>&1)
    $distributions = @(& $wsl -l -v 2>&1)
    $kernel = @(& $wsl -d $Distribution -u root -e uname -r 2>&1)
    $processes = @(Get-Process -Name vmmemWSL,wslservice -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName)
    $docker = if ($SkipDockerProbe) { @() } else { @(& $wsl -d $Distribution -u root -e sh -lc 'docker info --format "server={{.ServerVersion}} containers={{.Containers}} running={{.ContainersRunning}}" && docker run --rm hello-world >/dev/null && echo DOCKER_OK' 2>&1) }
    $combined = @($status + $distributions + $kernel + $docker) -join "`n"
    $classifiedError = if ($combined -match 'E_UNEXPECTED') { 'E_UNEXPECTED' } else { $null }
    $diagnostics = @()
    if ($classifiedError -or -not (($kernel -join '') -match 'microsoft-standard-WSL2')) {
        foreach ($logName in @('Microsoft-Windows-Lxss/Operational','Microsoft-Windows-Hyper-V-Compute-Admin','Microsoft-Windows-Hyper-V-Worker-Admin','Microsoft-Windows-Host-Network-Service-Admin')) {
            try {
                $events = Get-WinEvent -FilterHashtable @{ LogName=$logName; StartTime=(Get-Date).AddDays(-1); Level=1,2,3 } -MaxEvents 10 -ErrorAction Stop
                $diagnostics += @($events | ForEach-Object {
                    $message = $_.Message -replace '\s+',' '
                    if ($message.Length -gt 500) { $message = $message.Substring(0, 500) }
                    [pscustomobject]@{ TimeCreated=$_.TimeCreated; LogName=$logName; Id=$_.Id; Message=$message }
                })
            } catch {}
        }
    }

    [pscustomobject]@{
        OS = (Get-CimInstance Win32_OperatingSystem).Caption
        Topology = [pscustomobject]@{
            Role = if ($system.Manufacturer -eq 'Microsoft Corporation' -and $system.Model -eq 'Virtual Machine') { 'HyperVGuest' } elseif ($system.HypervisorPresent) { 'HyperVRootHost' } else { 'PhysicalHost' }
            Manufacturer = $system.Manufacturer
            Model = $system.Model
            HypervisorPresent = [bool]$system.HypervisorPresent
            VirtualizationFirmwareEnabled = [bool]$cpu.VirtualizationFirmwareEnabled
            VMMonitorModeExtensions = [bool]$cpu.VMMonitorModeExtensions
            SecondLevelAddressTranslationExtensions = [bool]$cpu.SecondLevelAddressTranslationExtensions
        }
        WslStatus = $status
        WslDistributions = $distributions
        WslKernel = $kernel
        WslProcesses = $processes
        Docker = $docker
        ClassifiedError = $classifiedError
        Diagnostics = $diagnostics
    }
}

Add-Check 'PowerShell Direct' ($null -ne $guest.OS) $guest.OS
Add-Check 'Windows Hyper-V guest topology' ($guest.Topology.Role -eq 'HyperVGuest') "$($guest.Topology.Role): $($guest.Topology.Manufacturer) / $($guest.Topology.Model)"
$distributionLine = @($guest.WslDistributions | Where-Object { $_ -match ('^\s*\*?\s*' + [regex]::Escape($WslDistribution) + '\s+') } | Select-Object -First 1)
Add-Check 'WSL2 distribution' (($distributionLine -join '') -match '\s+2\s*$') ($distributionLine -join '; ')
Add-Check 'WSL2 kernel' (($guest.WslKernel -join '') -match 'microsoft-standard-WSL2') ($guest.WslKernel -join '; ')
Add-Check 'WSL runtime processes' (($guest.WslProcesses -contains 'vmmemWSL') -and ($guest.WslProcesses -contains 'wslservice')) ($guest.WslProcesses -join '; ')
Add-Check 'WSL diagnostic status' (-not $guest.ClassifiedError) $(if ($guest.ClassifiedError) { "$($guest.ClassifiedError); events=$(@($guest.Diagnostics).Count)" } else { 'No classified WSL startup error' })
if (-not $SkipDocker) { Add-Check 'Docker daemon and hello-world' (($guest.Docker -join '') -match 'server=\S+' -and ($guest.Docker -join '') -match 'DOCKER_OK') ($guest.Docker -join '; ') }

$failed = @($checks | Where-Object { -not $_.Passed })
[pscustomobject]@{
    Passed = $failed.Count -eq 0
    HostTopology = $hostTopology
    VM = [pscustomobject]@{ Name=$vm.Name; Generation=$vm.Generation; ConfigurationVersion=$vm.Version; ProcessorCount=$vm.ProcessorCount }
    Guest = $guest
    Checks = @($checks)
    Failed = $failed.Count
}
if ($failed.Count) { exit 1 }
