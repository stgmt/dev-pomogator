[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [ValidateSet('Conservative')][string]$Profile = 'Conservative'
)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$paths = Get-StatePaths -Config $config
if (-not $PSCmdlet.ShouldProcess($config.Name, "Apply $Profile optimization with captured rollback state")) { return }
if (($config.Optimization.DisableSecurity -or $config.Optimization.DisableFirewall -or $config.Optimization.DisableUpdates) -and $config.Network.AllowUntrustedNetwork) {
    throw 'High-risk security/update changes are forbidden on an untrusted network'
}
if (Test-Path -LiteralPath $paths.OptimizationStateFile) {
    throw "Optimization state already exists at $($paths.OptimizationStateFile). Roll back before applying another optimization."
}

if ($config.Guest -eq 'ubuntu-server') {
    $serviceNames = @($config.Optimization.DisableServices | ForEach-Object { [string]$_ })
    foreach ($name in $serviceNames) { if ($name -notmatch '^[A-Za-z0-9_.@-]+$') { throw "Invalid systemd service name: $name" } }
    $serviceArg = $serviceNames -join ' '
    $snapshotJson = (Invoke-UbuntuSsh -Config $config -Command "python3 -c 'import json,subprocess,sys; names=sys.argv[1:]; print(json.dumps({\"Guest\":\"ubuntu-server\",\"Services\":{n:{\"enabled\":subprocess.run([\"systemctl\",\"is-enabled\",n],capture_output=True,text=True).stdout.strip(),\"active\":subprocess.run([\"systemctl\",\"is-active\",n],capture_output=True,text=True).stdout.strip()} for n in names}}))' $serviceArg") -join "`n"
    $snapshot = $snapshotJson | ConvertFrom-Json
    Write-AtomicJson -InputObject $snapshot -Path $paths.OptimizationStateFile
    foreach ($name in $serviceNames) {
        Invoke-UbuntuSsh -Config $config -Command "sudo systemctl disable --now '$name'"
    }
    [pscustomobject]@{ Guest='ubuntu-server'; ChangedServices=$serviceNames; StatePath=$paths.OptimizationStateFile; RebootRequired=$false }
    return
}

$credential = Get-HyperVVmCredential -Config $config
$snapshot = Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config.Optimization -ScriptBlock {
    param($optimization)
    $services = @{}
    foreach ($name in @($optimization.DisableServices)) {
        $service = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
        if ($service) { $services[$name] = [ordered]@{ StartMode=$service.StartMode; State=$service.State } }
    }
    $firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ Name=$_.Name; Enabled=$_.Enabled } })
    $auPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
    $defenderPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender'
    $wslConfigPath = "$env:USERPROFILE\.wslconfig"
    [ordered]@{
        Guest='windows-ltsc'
        Services=$services
        SvcHostSplitThresholdInKB=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control').SvcHostSplitThresholdInKB
        Firewall=$firewall
        UpdatePolicy=if(Test-Path $auPath){Get-ItemProperty $auPath | Select-Object NoAutoUpdate,AUOptions}else{$null}
        DefenderPolicy=if(Test-Path $defenderPath){Get-ItemProperty $defenderPath | Select-Object DisableAntiVirus}else{$null}
        DefenderRealtimeDisabled=if(Get-Command Get-MpPreference -ErrorAction SilentlyContinue){(Get-MpPreference).DisableRealtimeMonitoring}else{$null}
        WslConfigPath=$wslConfigPath
        WslConfig=if(Test-Path $wslConfigPath){Get-Content $wslConfigPath -Raw}else{$null}
        CapturedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
}
Write-AtomicJson -InputObject $snapshot -Path $paths.OptimizationStateFile

try {
    Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config.Optimization -ScriptBlock {
        param($optimization)
        foreach ($name in @($optimization.DisableServices)) {
            Stop-Service -Name $name -Force -ErrorAction Stop
            Set-Service -Name $name -StartupType Disabled -ErrorAction Stop
        }
        if ($optimization.ConsolidateServiceHosts) {
            $memoryKB = [long]((Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum / 1KB)
            Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control' -Name SvcHostSplitThresholdInKB -Value $memoryKB -Type DWord
        }
        New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoAdminLogon -Value '0' -PropertyType String -Force | Out-Null
        Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoLogonCount -ErrorAction SilentlyContinue
        if ($optimization.DisableFirewall) { Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False }
        if ($optimization.DisableUpdates) {
            $path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'; New-Item -ItemType Directory -Force -Path $path | Out-Null
            New-ItemProperty $path -Name NoAutoUpdate -Value 1 -PropertyType DWord -Force | Out-Null
            foreach($name in 'wuauserv','BITS'){Stop-Service $name -Force -ErrorAction Stop;Set-Service $name -StartupType Disabled}
        }
        if ($optimization.DisableSecurity) {
            $path='HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender'; New-Item -ItemType Directory -Force -Path $path | Out-Null
            New-ItemProperty $path -Name DisableAntiVirus -Value 1 -PropertyType DWord -Force | Out-Null
            Set-MpPreference -DisableRealtimeMonitoring $true -ErrorAction Stop
        }
    }
} catch {
    throw "Optimization partially failed after rollback state was captured at $($paths.OptimizationStateFile): $($_.Exception.Message)"
}
[pscustomobject]@{ Guest='windows-ltsc'; RebootRequired=$true; StatePath=$paths.OptimizationStateFile }
