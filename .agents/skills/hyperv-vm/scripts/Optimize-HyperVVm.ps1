[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [ValidateSet('Conservative')][string]$Profile = 'Conservative'
)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$paths = Get-StatePaths $imported
if (-not $config.Optimization.Enabled) { throw 'Optimization.Enabled is false' }
if (($config.Optimization.DisableSecurity -or $config.Optimization.DisableFirewall -or $config.Optimization.DisableUpdates) -and $config.Network.AllowUntrustedNetwork) { throw 'High-risk optimization is forbidden on an untrusted network' }
if (-not $PSCmdlet.ShouldProcess($config.Name, "apply $Profile guest optimization")) { exit }

if ($config.Guest -eq 'ubuntu-server') {
    [pscustomobject]@{ Guest='ubuntu-server'; Status='planned'; Message='Apply only config-listed service disables over SSH; automatic package removal is intentionally unsupported.' }
    exit
}

$credential = Get-Credential -UserName $config.Access.AdminUser -Message "Credential for PowerShell Direct to $($config.Name)"
$optimization = $config.Optimization
$snapshot = Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $optimization -ScriptBlock {
    param($optimization)
    $services = foreach ($name in @($optimization.DisableServices)) {
        $service = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
        if ($service) { [pscustomobject]@{ Name=$name; State=$service.State; StartMode=$service.StartMode } }
    }
    $before = [pscustomobject]@{
        Timestamp = Get-Date -Format o
        Services = @($services)
        SvcHostSplitThresholdInKB = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control').SvcHostSplitThresholdInKB
        Firewall = @(Get-NetFirewallProfile | Select-Object Name,Enabled)
        UpdatePolicy = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -ErrorAction SilentlyContinue | Select-Object NoAutoUpdate,AUOptions
    }
    foreach ($name in @($optimization.DisableServices)) {
        Stop-Service $name -Force -ErrorAction SilentlyContinue
        Set-Service $name -StartupType Disabled -ErrorAction SilentlyContinue
    }
    if ($optimization.ConsolidateServiceHosts) {
        $memoryKB = [long]((Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum / 1KB)
        Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control' SvcHostSplitThresholdInKB $memoryKB -Type DWord
    }
    New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' AutoAdminLogon '0' -PropertyType String -Force | Out-Null
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' AutoLogonCount -ErrorAction SilentlyContinue
    if ($optimization.DisableFirewall) { Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled False }
    if ($optimization.DisableUpdates) {
        New-Item 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -Force | Out-Null
        New-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' NoAutoUpdate 1 -PropertyType DWord -Force | Out-Null
        foreach($name in 'wuauserv','BITS'){Stop-Service $name -Force -ErrorAction SilentlyContinue;Set-Service $name -StartupType Disabled}
    }
    if ($optimization.DisableSecurity) {
        New-Item 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' -Force | Out-Null
        New-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' DisableAntiVirus 1 -PropertyType DWord -Force | Out-Null
        Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction SilentlyContinue
    }
    $before
}
$stateFile = Join-Path $paths.State 'optimization-before.json'
Write-AtomicJson $snapshot $stateFile
[pscustomobject]@{ Guest='windows-ltsc'; Profile=$Profile; RebootRequired=$true; StatePath=$stateFile }
