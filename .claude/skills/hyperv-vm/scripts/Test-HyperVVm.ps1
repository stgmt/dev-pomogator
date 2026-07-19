[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$results=[Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Passed,[string]$Detail){$results.Add([pscustomobject]@{Name=$Name;Passed=$Passed;Detail=$Detail})}
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
        $result=[ordered]@{OS=(Get-CimInstance Win32_OperatingSystem).Caption;Wsl=$null;Docker=$null;BuildCacheLimit=$null}
        if($features.InstallWslDocker){
            $wsl="$env:ProgramFiles\WSL\wsl.exe";if(-not(Test-Path $wsl)){$wsl='wsl.exe'}
            $result.Wsl=@(& $wsl -l -v 2>$null)
            $result.Docker=@(& $wsl -d $features.WslDistribution -u root -e sh -lc 'systemctl is-active docker && docker run --rm hello-world >/dev/null && echo DOCKER_OK' 2>$null)
            $result.BuildCacheLimit=@(& $wsl -d $features.WslDistribution -u root -e sh -lc "python3 -c 'import json;print(json.load(open(\"/etc/docker/daemon.json\"))[\"builder\"][\"gc\"][\"defaultKeepStorage\"])'" 2>$null)
        }
        [pscustomobject]$result
    }
    Add-Check 'PowerShell Direct' ($null -ne $guest.OS) $guest.OS
    if($config.Features.InstallWslDocker){
        Add-Check 'WSL2 distribution' (($guest.Wsl -join "`n") -match [regex]::Escape($config.Features.WslDistribution) -and ($guest.Wsl -join "`n") -match '2') ($guest.Wsl -join '; ')
        Add-Check 'Docker hello-world' (($guest.Docker -join "`n") -match 'DOCKER_OK') ($guest.Docker -join '; ')
        Add-Check 'Build cache limit' (($guest.BuildCacheLimit -join '').Trim() -eq "$($config.Features.BuildCacheLimitGB)GB") ($guest.BuildCacheLimit -join '')
    }
}else{
    $raw=@(Invoke-UbuntuSsh -Config $config -Command "printf 'LOGIN_OK '; systemctl is-active docker 2>/dev/null; docker run --rm hello-world >/dev/null 2>&1 && printf ' DOCKER_OK'")
    Add-Check 'SSH login' (($raw -join ' ') -match 'LOGIN_OK') ($raw -join '; ')
    if($config.Features.InstallDocker){Add-Check 'Docker hello-world' (($raw -join ' ') -match 'DOCKER_OK') ($raw -join '; ')}
}
$failed=@($results|Where-Object{-not $_.Passed})
[pscustomobject]@{Passed=$failed.Count -eq 0;Checks=@($results);Failed=$failed.Count}
if($failed.Count){exit 1}
