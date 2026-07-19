[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [switch]$EnrollHostKey
)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$vm = Get-VM -Name $config.Name -ErrorAction Stop
if ($vm.State -ne 'Running') { throw "VM is not running: $($vm.State)" }

if ($config.Guest -eq 'windows-ltsc') {
    [pscustomobject]@{
        Method = 'PowerShellDirect'
        Command = "New-PSSession -VMName '$($config.Name)' -Credential (Get-Credential '$($config.Access.AdminUser)')"
        RdpEnabled = [bool]$config.Access.EnableRdp
        RdpCommand = if ($config.Access.EnableRdp) { "vmconnect.exe localhost '$($config.Name)'" } else { $null }
    }
    return
}

$connection = if ($EnrollHostKey) {
    Initialize-UbuntuKnownHost -Config $config -Confirm:$false
} else {
    Get-UbuntuSshConnection -Config $config
}
if (-not (Test-Path -LiteralPath $connection.KnownHosts)) {
    throw "Pinned host key is not enrolled. Run Connect-HyperVVm.ps1 -ConfigPath '$ConfigPath' -EnrollHostKey after checking Access.SshHostKeyFingerprint."
}
[pscustomobject]@{
    Method = 'SSH'
    Address = $connection.Address
    User = $connection.User
    KnownHosts = $connection.KnownHosts
    Command = "ssh -i `"$($connection.PrivateKey)`" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=`"$($connection.KnownHosts)`" $($connection.User)@$($connection.Address)"
}
