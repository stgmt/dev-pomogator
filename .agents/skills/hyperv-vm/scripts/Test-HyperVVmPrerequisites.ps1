[CmdletBinding()]
param([Parameter(Mandatory)][string]$ConfigPath)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
$issues = [Collections.Generic.List[string]]::new()

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { $issues.Add('PowerShell must be elevated') }

$getVm = Get-Command Get-VM -ErrorAction SilentlyContinue
if (-not $getVm) {
    $issues.Add('Hyper-V PowerShell module is unavailable')
} else {
    if (-not (Get-VMSwitch -Name $config.Network.SwitchName -ErrorAction SilentlyContinue)) { $issues.Add("VMSwitch not found: $($config.Network.SwitchName)") }
    $existing = Get-VM -Name $config.Name -ErrorAction SilentlyContinue
    if ($existing) { $issues.Add("VM already exists: $($config.Name). Replacement is intentionally not automated") }
}

$source = Resolve-ConfigPath -Config $config -Path $config.Install.Source
$actual = $null
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    $issues.Add("Install source not found: $source")
} elseif ($config.Install.ExpectedSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    $issues.Add('Install.ExpectedSha256 must be a 64-character vendor-published SHA-256')
} else {
    $actual = Get-FileSha256 -Path $source
    if ($actual -ne $config.Install.ExpectedSha256.ToUpperInvariant()) { $issues.Add('Install source SHA-256 mismatch') }
}

if ($config.Guest -eq 'ubuntu-server') {
    $publicKey = Resolve-ConfigPath -Config $config -Path $config.Access.SshPublicKeyPath
    if (-not (Test-Path -LiteralPath $publicKey -PathType Leaf)) { $issues.Add("SSH public key not found: $publicKey") }
}
if ($config.Features.InstallWslDocker -and -not $config.Features.NestedVirtualization) { $issues.Add('InstallWslDocker requires NestedVirtualization') }
if (($config.Optimization.DisableFirewall -or $config.Optimization.DisableSecurity -or $config.Optimization.DisableUpdates) -and $config.Network.AllowUntrustedNetwork) {
    $issues.Add('Security/update disabling is forbidden on an untrusted network')
}
if (-not $config.Disk.Dynamic) { $issues.Add('Fixed VHD creation is not supported by this skill; set Disk.Dynamic=true') }

[pscustomobject]@{
    Valid = $issues.Count -eq 0
    Issues = @($issues)
    InstallSource = $source
    SourceSha256 = $actual
    SwitchName = $config.Network.SwitchName
    ConfigFingerprint = Get-ConfigFingerprint -Config $config
}
if ($issues.Count) { exit 1 }
