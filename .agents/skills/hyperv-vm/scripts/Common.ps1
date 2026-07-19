Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Import-HyperVVmConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ConfigPath)

    $resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
    $config = Import-PowerShellDataFile -LiteralPath $resolved
    if ($config.SchemaVersion -ne 1) { throw "Unsupported SchemaVersion: $($config.SchemaVersion)" }
    if ($config.Guest -notin 'windows-ltsc','ubuntu-server') { throw "Unsupported Guest: $($config.Guest)" }
    if ($config.Generation -ne 2) { throw 'Only Hyper-V Generation 2 is supported' }
    if (-not $config.Name -or $config.Name -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'Invalid VM name' }
    if ([int]$config.ProcessorCount -lt 1) { throw 'ProcessorCount must be positive' }
    if ([int]$config.Memory.StartupMB -lt 1024) { throw 'Startup memory must be at least 1024 MB' }
    if ([int]$config.Disk.SizeGB -lt 20) { throw 'Disk size must be at least 20 GB' }
    if ($config.Access.ContainsKey('AdminPassword')) { throw 'Plaintext AdminPassword is forbidden' }
    if ($config.Access.ContainsKey('SshPrivateKeyPassphrase')) { throw 'Plaintext SSH passphrases are forbidden' }

    [pscustomobject]@{ Path = $resolved; Directory = Split-Path $resolved; Value = $config }
}

function Get-FileSha256 {
    param([Parameter(Mandatory)][string]$Path)
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Get-ConfigFingerprint {
    param([Parameter(Mandatory)][hashtable]$Config)
    $json = $Config | ConvertTo-Json -Depth 20 -Compress
    $sha = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json)))).Replace('-','') }
    finally { $sha.Dispose() }
}

function Resolve-ConfigPath {
    param([string]$Base, [string]$Path)
    if ($Path.StartsWith('~')) {
        $Path = Join-Path ([Environment]::GetFolderPath('UserProfile')) $Path.Substring(1).TrimStart('\','/')
    }
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    [IO.Path]::GetFullPath((Join-Path $Base $Path))
}

function Write-AtomicJson {
    param([Parameter(Mandatory)]$InputObject, [Parameter(Mandatory)][string]$Path)
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $temp = "$Path.$PID.tmp"
    $InputObject | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Get-StatePaths {
    param([Parameter(Mandatory)]$Imported)
    $config = $Imported.Value
    $state = Resolve-ConfigPath $Imported.Directory $config.StateDirectory
    $reports = Resolve-ConfigPath $Imported.Directory $config.ReportDirectory
    [pscustomobject]@{ State = $state; Reports = $reports; StateFile = Join-Path $state 'state.json' }
}
