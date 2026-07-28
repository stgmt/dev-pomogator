[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$results=[Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Passed,[string]$Detail){$results.Add([pscustomobject]@{Name=$Name;Passed=$Passed;Detail=$Detail})}
$hostTopology=Get-WindowsVirtualizationTopology
$vm=Get-VM -Name $config.Name -ErrorAction Stop
$processor=Get-VMProcessor -VMName $config.Name
$heartbeat=Get-VMIntegrationService -VMName $config.Name -Name Heartbeat
Add-Check 'VM running' ($vm.State -eq 'Running') $vm.State.ToString()
Add-Check 'CPU count' ($vm.ProcessorCount -eq $config.ProcessorCount) "$($vm.ProcessorCount)"
Add-Check 'Startup memory' ([math]::Round($vm.MemoryStartup/1MB) -eq $config.Memory.StartupMB) "$([math]::Round($vm.MemoryStartup/1MB)) MB"
Add-Check 'Nested virtualization' ($processor.ExposeVirtualizationExtensions -eq [bool]$config.Features.NestedVirtualization) "$($processor.ExposeVirtualizationExtensions)"
Add-Check 'Heartbeat' ($heartbeat.PrimaryStatusDescription -eq 'OK') $heartbeat.PrimaryStatusDescription

if($config.Guest -eq 'windows-ltsc'){
    $credential=Get-HyperVVmCredential -Config $config
    $guest=Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config.Features -ScriptBlock{
        param($features)
        $system=Get-CimInstance Win32_ComputerSystem
        $cpu=Get-CimInstance Win32_Processor|Select-Object -First 1
        $isHyperVGuest=$system.Manufacturer -eq 'Microsoft Corporation' -and $system.Model -eq 'Virtual Machine'
        $result=[ordered]@{
            OS=(Get-CimInstance Win32_OperatingSystem).Caption
            Topology=[pscustomobject]@{
                Role=if($isHyperVGuest){'HyperVGuest'}elseif($system.HypervisorPresent){'HyperVRootHost'}else{'PhysicalHost'}
                Manufacturer=$system.Manufacturer
                Model=$system.Model
                HypervisorPresent=[bool]$system.HypervisorPresent
                VMMonitorModeExtensions=[bool]$cpu.VMMonitorModeExtensions
                SecondLevelAddressTranslationExtensions=[bool]$cpu.SecondLevelAddressTranslationExtensions
            }
            WslStatus=$null
            Wsl=$null
            WslKernel=$null
            WslProcesses=$null
            WslError=$null
            WslDiagnostics=@()
            Docker=$null
            DockerInfo=$null
            BuildCacheLimit=$null
        }
        if($features.InstallWslDocker){
            $wsl="$env:ProgramFiles\WSL\wsl.exe";if(-not(Test-Path $wsl)){$wsl='wsl.exe'}
            $result.WslStatus=@(& $wsl --status 2>&1)
            $result.Wsl=@(& $wsl -l -v 2>&1)
            $result.WslKernel=@(& $wsl -d $features.WslDistribution -u root -e uname -r 2>&1)
            $result.WslProcesses=@(Get-Process -Name vmmemWSL,wslservice -ErrorAction SilentlyContinue|Select-Object -ExpandProperty ProcessName)
            $result.DockerInfo=@(& $wsl -d $features.WslDistribution -u root -e docker info --format 'server={{.ServerVersion}} containers={{.Containers}} running={{.ContainersRunning}}' 2>&1)
            $result.Docker=@(& $wsl -d $features.WslDistribution -u root -e sh -lc 'systemctl is-active docker && docker run --rm hello-world >/dev/null && echo DOCKER_OK' 2>&1)
            $result.BuildCacheLimit=@(& $wsl -d $features.WslDistribution -u root -e sh -lc "python3 -c 'import json;print(json.load(open(\"/etc/docker/daemon.json\"))[\"builder\"][\"gc\"][\"defaultKeepStorage\"])'" 2>&1)
            $wslOutput=@($result.WslStatus+$result.Wsl+$result.WslKernel+$result.DockerInfo+$result.Docker)-join "`n"
            if($wslOutput -match 'E_UNEXPECTED'){$result.WslError='E_UNEXPECTED'}
            if($result.WslError -or -not (($result.WslKernel-join '') -match 'microsoft-standard-WSL2')){
                foreach($logName in @('Microsoft-Windows-Lxss/Operational','Microsoft-Windows-Hyper-V-Compute-Admin','Microsoft-Windows-Hyper-V-Worker-Admin','Microsoft-Windows-Host-Network-Service-Admin')){
                    try{
                        $events=Get-WinEvent -FilterHashtable @{LogName=$logName;StartTime=(Get-Date).AddDays(-1);Level=1,2,3} -MaxEvents 10 -ErrorAction Stop
                        $result.WslDiagnostics+=@($events|ForEach-Object{
                            $message=$_.Message-replace '\s+',' '
                            if($message.Length -gt 500){$message=$message.Substring(0,500)}
                            [pscustomobject]@{TimeCreated=$_.TimeCreated;LogName=$logName;Id=$_.Id;Message=$message}
                        })
                    }catch{}
                }
            }
        }
        [pscustomobject]$result
    }
    Add-Check 'PowerShell Direct' ($null -ne $guest.OS) $guest.OS
    Add-Check 'Windows Hyper-V guest topology' ($guest.Topology.Role -eq 'HyperVGuest') "$($guest.Topology.Role): $($guest.Topology.Manufacturer) / $($guest.Topology.Model)"
    if($config.Features.InstallWslDocker){
        $distributionLine=@($guest.Wsl|Where-Object{$_ -match ('^\s*\*?\s*'+[regex]::Escape($config.Features.WslDistribution)+'\s+')}|Select-Object -First 1)
        Add-Check 'WSL2 distribution' (($distributionLine-join '') -match '\s+2\s*$') ($distributionLine -join '; ')
        Add-Check 'WSL2 kernel' (($guest.WslKernel -join '') -match 'microsoft-standard-WSL2') ($guest.WslKernel -join '; ')
        Add-Check 'WSL runtime processes' (($guest.WslProcesses -contains 'vmmemWSL') -and ($guest.WslProcesses -contains 'wslservice')) ($guest.WslProcesses -join '; ')
        Add-Check 'WSL diagnostic status' (-not $guest.WslError) $(if($guest.WslError){"$($guest.WslError); events=$(@($guest.WslDiagnostics).Count)"}else{'No classified WSL startup error'})
        Add-Check 'Docker daemon' (($guest.DockerInfo -join '') -match 'server=\S+') ($guest.DockerInfo -join '; ')
        Add-Check 'Docker hello-world' (($guest.Docker -join "`n") -match 'DOCKER_OK') ($guest.Docker -join '; ')
        Add-Check 'Build cache limit' (($guest.BuildCacheLimit -join '').Trim() -eq "$($config.Features.BuildCacheLimitGB)GB") ($guest.BuildCacheLimit -join '')
    }
}else{
    $raw=@(Invoke-UbuntuSsh -Config $config -Command "printf 'LOGIN_OK '; systemctl is-active docker 2>/dev/null; docker run --rm hello-world >/dev/null 2>&1 && printf ' DOCKER_OK'")
    Add-Check 'SSH login' (($raw -join ' ') -match 'LOGIN_OK') ($raw -join '; ')
    if($config.Features.InstallDocker){Add-Check 'Docker hello-world' (($raw -join ' ') -match 'DOCKER_OK') ($raw -join '; ')}
}
$failed=@($results|Where-Object{-not $_.Passed})
[pscustomobject]@{Passed=$failed.Count -eq 0;HostTopology=$hostTopology;Checks=@($results);Failed=$failed.Count;GuestDiagnostics=if($config.Guest -eq 'windows-ltsc'){$guest.WslDiagnostics}else{@()}}
if($failed.Count){exit 1}
