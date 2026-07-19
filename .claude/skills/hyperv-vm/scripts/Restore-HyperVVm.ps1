[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$paths = Get-StatePaths -Config $config
if (-not (Test-Path -LiteralPath $paths.OptimizationStateFile)) { throw "Optimization rollback state not found: $($paths.OptimizationStateFile)" }
if (-not $PSCmdlet.ShouldProcess($config.Name, 'Restore captured optimization state')) { return }
$snapshot = Get-Content -LiteralPath $paths.OptimizationStateFile -Raw | ConvertFrom-Json

if ($snapshot.Guest -eq 'ubuntu-server') {
    foreach ($property in $snapshot.Services.PSObject.Properties) {
        $name = [string]$property.Name
        if ($name -notmatch '^[A-Za-z0-9_.@-]+$') { throw "Invalid captured systemd service name: $name" }
        if ($property.Value.enabled -match '^enabled') { Invoke-UbuntuSsh -Config $config -Command "sudo systemctl enable '$name'" }
        else { Invoke-UbuntuSsh -Config $config -Command "sudo systemctl disable '$name'" }
        if ($property.Value.active -eq 'active') { Invoke-UbuntuSsh -Config $config -Command "sudo systemctl start '$name'" }
        else { Invoke-UbuntuSsh -Config $config -Command "sudo systemctl stop '$name'" }
    }
} else {
    $credential = Get-HyperVVmCredential -Config $config
    Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $snapshot -ScriptBlock {
        param($state)
        foreach ($property in $state.Services.PSObject.Properties) {
            $name = $property.Name; $previous = $property.Value
            $startup = switch ($previous.StartMode) { 'Auto' {'Automatic'} 'Manual' {'Manual'} default {'Disabled'} }
            Set-Service -Name $name -StartupType $startup -ErrorAction Stop
            if ($previous.State -eq 'Running') { Start-Service -Name $name -ErrorAction Stop } else { Stop-Service -Name $name -Force -ErrorAction SilentlyContinue }
        }
        Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control' -Name SvcHostSplitThresholdInKB -Value ([long]$state.SvcHostSplitThresholdInKB) -Type DWord
        foreach ($profile in $state.Firewall) { Set-NetFirewallProfile -Profile $profile.Name -Enabled ([bool]$profile.Enabled) }
        $auPath='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
        if ($null -eq $state.UpdatePolicy) { Remove-Item $auPath -Recurse -Force -ErrorAction SilentlyContinue }
        else { New-Item -ItemType Directory -Force -Path $auPath | Out-Null; foreach($name in 'NoAutoUpdate','AUOptions'){if($null -ne $state.UpdatePolicy.$name){New-ItemProperty $auPath -Name $name -Value $state.UpdatePolicy.$name -PropertyType DWord -Force|Out-Null}} }
        $defenderPath='HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender'
        if ($null -eq $state.DefenderPolicy) { Remove-ItemProperty $defenderPath -Name DisableAntiVirus -ErrorAction SilentlyContinue }
        else { New-Item -ItemType Directory -Force -Path $defenderPath | Out-Null; New-ItemProperty $defenderPath -Name DisableAntiVirus -Value $state.DefenderPolicy.DisableAntiVirus -PropertyType DWord -Force|Out-Null }
        if ($null -ne $state.DefenderRealtimeDisabled -and (Get-Command Set-MpPreference -ErrorAction SilentlyContinue)) { Set-MpPreference -DisableRealtimeMonitoring ([bool]$state.DefenderRealtimeDisabled) }
        if ($null -ne $state.WslConfig) { Set-Content -LiteralPath $state.WslConfigPath -Value $state.WslConfig -Encoding ASCII }
        elseif ($state.WslConfigPath) { Remove-Item -LiteralPath $state.WslConfigPath -Force -ErrorAction SilentlyContinue }
    }
}
$archive = "$($paths.OptimizationStateFile).restored-$(Get-Date -Format yyyyMMddHHmmss).json"
Move-Item -LiteralPath $paths.OptimizationStateFile -Destination $archive
[pscustomobject]@{ Restored=$true; VMName=$config.Name; ArchivedState=$archive }
