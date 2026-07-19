[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$imported = Import-HyperVVmConfig $ConfigPath
$config = $imported.Value
$issues = [Collections.Generic.List[string]]::new()

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { $issues.Add('PowerShell is not elevated') }
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) { $issues.Add('Hyper-V PowerShell module is unavailable') }
if (-not (Get-VMSwitch -Name $config.Network.SwitchName -ErrorAction SilentlyContinue)) { $issues.Add("VMSwitch not found: $($config.Network.SwitchName)") }

$source = Resolve-ConfigPath $imported.Directory $config.Install.Source
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $issues.Add("Install source not found: $source") }
elseif ($config.Install.ExpectedSha256 -match '^[A-Fa-f0-9]{64}$') {
    $actual = Get-FileSha256 $source
    if ($actual -ne $config.Install.ExpectedSha256.ToUpperInvariant()) { $issues.Add("Install source SHA-256 mismatch: $actual") }
} else { $issues.Add('Install.ExpectedSha256 must be a 64-character vendor-published SHA-256') }

$existing = Get-VM -Name $config.Name -ErrorAction SilentlyContinue
if ($existing -and -not $config.Safety.AllowReplaceExistingVm) { $issues.Add("VM already exists: $($config.Name)") }
if ($config.Guest -eq 'ubuntu-server' -and -not (Test-Path -LiteralPath $config.Access.SshPublicKeyPath)) { $issues.Add('SSH public key not found') }
if ($config.Features.InstallWslDocker -and -not $config.Features.NestedVirtualization) { $issues.Add('InstallWslDocker requires NestedVirtualization') }
if (($config.Optimization.DisableFirewall -or $config.Optimization.DisableSecurity -or $config.Optimization.DisableUpdates) -and $config.Network.AllowUntrustedNetwork) { $issues.Add('Security/update disabling is forbidden on an untrusted network') }

$result = [pscustomobject]@{
    Valid = $issues.Count -eq 0
    Issues = @($issues)
    Name = $config.Name
    Guest = $config.Guest
    Source = $source
    SourceSha256 = if (Test-Path $source) { Get-FileSha256 $source } else { $null }
    Switch = $config.Network.SwitchName
    ConfigFingerprint = Get-ConfigFingerprint $config
}
$result
if (-not $result.Valid) { exit 1 }
