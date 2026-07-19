[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$vm = Get-VM $config.Name -ErrorAction Stop
$checks = [Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[bool]$Passed,[string]$Detail) { $checks.Add([pscustomobject]@{Name=$Name;Passed=$Passed;Detail=$Detail}) }

Add-Check 'VM running' ($vm.State -eq 'Running') $vm.State.ToString()
Add-Check 'CPU count' ($vm.ProcessorCount -eq $config.ProcessorCount) "$($vm.ProcessorCount)"
Add-Check 'Startup memory' (($vm.MemoryStartup/1MB) -eq $config.Memory.StartupMB) "$($vm.MemoryStartup/1MB) MB"
Add-Check 'Nested virtualization' ((Get-VMProcessor $vm).ExposeVirtualizationExtensions -eq [bool]$config.Features.NestedVirtualization) "$((Get-VMProcessor $vm).ExposeVirtualizationExtensions)"
Add-Check 'Heartbeat' ((Get-VMIntegrationService -VMName $config.Name -Name Heartbeat).PrimaryStatusDescription -eq 'OK') ((Get-VMIntegrationService -VMName $config.Name -Name Heartbeat).PrimaryStatusDescription)

if ($config.Guest -eq 'windows-ltsc') {
    $credential = Get-Credential -UserName $config.Access.AdminUser -Message "Credential for PowerShell Direct to $($config.Name)"
    $guest = Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config -ScriptBlock {
        param($config)
        $result = [ordered]@{ Login=$true; OS=(Get-CimInstance Win32_OperatingSystem).Caption }
        if ($config.Features.InstallWslDocker) {
            $wsl = "$env:ProgramFiles\WSL\wsl.exe"
            $result.Wsl = (& $wsl -l -v 2>$null | Out-String)
            $result.Docker = (& $wsl -d $config.Features.WslDistribution -u root -- bash -lc "systemctl is-active docker; docker run --rm hello-world >/dev/null; echo OK" 2>$null | Out-String)
            $result.WslConfig = Get-Content "$env:USERPROFILE\.wslconfig" -Raw -ErrorAction SilentlyContinue
        }
        [pscustomobject]$result
    }
    Add-Check 'PowerShell Direct login' $guest.Login $guest.OS
    if ($config.Features.InstallWslDocker) {
        Add-Check 'WSL2 distro' ($guest.Wsl -match [regex]::Escape($config.Features.WslDistribution) -and $guest.Wsl -match '\s2\s') $guest.Wsl.Trim()
        Add-Check 'Docker hello-world' ($guest.Docker -match 'active' -and $guest.Docker -match 'OK') $guest.Docker.Trim()
        Add-Check 'Sparse config' ((-not $config.Features.SparseVhd) -or $guest.WslConfig -match 'sparseVhd=true') 'wslconfig'
        Add-Check 'Build cache limit' ($guest.Docker -match 'OK') "$($config.Features.BuildCacheLimitGB) GB configured by provisioning"
    }
} else {
    $connection = & "$PSScriptRoot\Connect-HyperVVm.ps1" -ConfigPath $imported.Path
    $key = Resolve-ConfigPath $imported.Directory $config.Access.SshPrivateKeyPath
    $output = & ssh -i $key -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($connection.KnownHosts)" "$($connection.User)@$($connection.Address)" 'printf LOGIN_OK; systemctl is-active docker 2>/dev/null || true; docker run --rm hello-world >/dev/null 2>&1 && printf DOCKER_OK || true'
    Add-Check 'SSH key login' ($output -match 'LOGIN_OK') ($output -join ' ')
    if ($config.Features.InstallDocker) { Add-Check 'Docker hello-world' ($output -match 'active' -and $output -match 'DOCKER_OK') ($output -join ' ') }
}

$result = [pscustomobject]@{ Passed = @($checks | Where-Object {-not $_.Passed}).Count -eq 0; Checks = @($checks) }
$result
if (-not $result.Passed) { exit 1 }
