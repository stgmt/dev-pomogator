[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$vm = Get-VM -Name $config.Name -ErrorAction Stop
if ($vm.State -ne 'Running') { throw "VM is not running: $($vm.State)" }

if ($config.Guest -eq 'windows-ltsc') {
    [pscustomobject]@{
        Transport = 'PowerShellDirect'
        Command = "New-PSSession -VMName '$($config.Name)' -Credential (Get-Credential '$($config.Access.AdminUser)')"
        RdpEnabled = [bool]$config.Access.EnableRdp
        RdpCommand = if ($config.Access.EnableRdp) { "vmconnect.exe localhost '$($config.Name)'" } else { $null }
    }
    exit
}

$addresses = @(Get-VMNetworkAdapter -VMName $config.Name).IPAddresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.' }
if ($addresses.Count -ne 1) { throw "Expected one IPv4 address, found $($addresses.Count): $($addresses -join ', ')" }
$key = Resolve-ConfigPath $imported.Directory $config.Access.SshPrivateKeyPath
$knownHosts = Join-Path (Get-StatePaths $imported).State 'known_hosts'
[pscustomobject]@{
    Transport = 'SSH'
    Address = $addresses[0]
    User = $config.Access.AdminUser
    KnownHosts = $knownHosts
    Command = "ssh -i `"$key`" -o StrictHostKeyChecking=yes -o UserKnownHostsFile=`"$knownHosts`" $($config.Access.AdminUser)@$($addresses[0])"
}
