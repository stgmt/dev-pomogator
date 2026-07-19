[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [string]$SecretVault,
    [string]$SecretName
)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
if ($config.Guest -ne 'windows-ltsc') { throw 'This script is only for windows-ltsc guests' }

$securePassword = $null
if ($SecretVault -and $SecretName -and (Get-Command Get-Secret -ErrorAction SilentlyContinue)) {
    $securePassword = Get-Secret -Vault $SecretVault -Name $SecretName
} elseif ($config.Access.AdminPasswordEnv -and [Environment]::GetEnvironmentVariable($config.Access.AdminPasswordEnv)) {
    $securePassword = ConvertTo-SecureString ([Environment]::GetEnvironmentVariable($config.Access.AdminPasswordEnv)) -AsPlainText -Force
} else { $securePassword = Read-Host "Password for $($config.Access.AdminUser)" -AsSecureString }
$credential = [pscredential]::new($config.Access.AdminUser,$securePassword)

Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config -ScriptBlock {
    param($config)
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' DefaultPassword -ErrorAction SilentlyContinue
    New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' AutoAdminLogon '0' -PropertyType String -Force | Out-Null
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' AutoLogonCount -ErrorAction SilentlyContinue
    if ($config.Access.EnableRdp) {
        Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' fDenyTSConnections 0
        Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue
    }
    if ($config.Features.InstallWslDocker) {
        $wslConfig = "[wsl2]`nmemory=$($config.Features.WslMemoryMB)MB`nswap=$($config.Features.WslSwapMB)MB`n`n[experimental]`nsparseVhd=$([string]$config.Features.SparseVhd).ToLowerInvariant()`nautoMemoryReclaim=$($config.Features.AutoMemoryReclaim)`n"
        Set-Content "$env:USERPROFILE\.wslconfig" $wslConfig -Encoding ASCII
    }
    [pscustomobject]@{ User=$env:USERNAME; OS=(Get-CimInstance Win32_OperatingSystem).Caption; Finalized=$true }
}
