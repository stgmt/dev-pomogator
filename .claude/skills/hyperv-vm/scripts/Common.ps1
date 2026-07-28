Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Import-HyperVVmConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ConfigPath)

    $resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
    $config = Import-PowerShellDataFile -LiteralPath $resolved
    if ($config.SchemaVersion -ne 1) { throw "Unsupported SchemaVersion: $($config.SchemaVersion)" }
    if ($config.Guest -notin @('windows-ltsc', 'ubuntu-server')) { throw "Unsupported Guest: $($config.Guest)" }
    if ($config.Generation -ne 2) { throw 'Only Generation 2 VMs are supported' }
    if (-not $config.Name -or $config.Name -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'VM name contains unsupported characters' }
    if ([int]$config.ProcessorCount -lt 1) { throw 'ProcessorCount must be positive' }
    if ([int]$config.Memory.StartupMB -lt 1024) { throw 'Startup memory must be at least 1024 MB' }
    if ([int]$config.Disk.SizeGB -lt 20) { throw 'Disk size must be at least 20 GB' }
    if ($config.Access.ContainsKey('AdminPassword')) { throw 'Plaintext AdminPassword is forbidden; use SecretManagement, an environment variable, or a secure prompt' }
    if ($config.Access.ContainsKey('SshPrivateKeyPassphrase')) { throw 'Plaintext SSH passphrases are forbidden' }

    $config['__ConfigPath'] = $resolved
    $config['__ConfigDirectory'] = Split-Path -Parent $resolved
    return $config
}

function Get-FileSha256 {
    param([Parameter(Mandatory)][string]$Path)
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Get-ConfigFingerprint {
    param([Parameter(Mandatory)]$Config)
    $json = $Config | ConvertTo-Json -Depth 20 -Compress
    $sha = [Security.Cryptography.SHA256]::Create()
    try { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json)))).Replace('-', '') }
    finally { $sha.Dispose() }
}

function Resolve-ConfigPath {
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][string]$Path)
    if ($Path.StartsWith('~')) {
        $Path = Join-Path ([Environment]::GetFolderPath('UserProfile')) $Path.Substring(1).TrimStart('\', '/')
    }
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    [IO.Path]::GetFullPath((Join-Path $Config.__ConfigDirectory $Path))
}

function Write-AtomicJson {
    param([Parameter(Mandatory)]$InputObject, [Parameter(Mandatory)][string]$Path)
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $temp = Join-Path $directory ('.{0}.{1}.{2}.tmp' -f ([IO.Path]::GetFileName($Path)), $PID, [guid]::NewGuid().ToString('N'))
    try {
        $InputObject | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temp -Encoding UTF8
        Move-Item -LiteralPath $temp -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    }
}

function Get-WindowsVirtualizationTopology {
    [CmdletBinding()]
    param(
        $ComputerSystem,
        $Processor
    )

    if ($null -eq $ComputerSystem) { $ComputerSystem = Get-CimInstance Win32_ComputerSystem }
    if ($null -eq $Processor) { $Processor = Get-CimInstance Win32_Processor | Select-Object -First 1 }

    $manufacturer = [string]$ComputerSystem.Manufacturer
    $model = [string]$ComputerSystem.Model
    $hypervisorPresent = [bool]$ComputerSystem.HypervisorPresent
    $isHyperVGuest = $manufacturer -eq 'Microsoft Corporation' -and $model -eq 'Virtual Machine'
    $role = if ($isHyperVGuest) {
        'HyperVGuest'
    } elseif ($hypervisorPresent) {
        'HyperVRootHost'
    } else {
        'PhysicalHost'
    }

    [pscustomobject]@{
        Role = $role
        Manufacturer = $manufacturer
        Model = $model
        HypervisorPresent = $hypervisorPresent
        VirtualizationFirmwareEnabled = [bool]$Processor.VirtualizationFirmwareEnabled
        VMMonitorModeExtensions = [bool]$Processor.VMMonitorModeExtensions
        SecondLevelAddressTranslationExtensions = [bool]$Processor.SecondLevelAddressTranslationExtensions
        CpuFlagsConclusive = -not $hypervisorPresent
        Note = if ($hypervisorPresent) { 'CPU virtualization flags alone are not a valid failure verdict after a hypervisor is active' } else { 'CPU virtualization flags describe the non-virtualized host directly' }
    }
}

function Stop-HyperVVmGracefully {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$VMName,
        [ValidateRange(10, 3600)][int]$TimeoutSeconds = 300
    )

    $vm = Get-VM -Name $VMName -ErrorAction Stop
    if ($vm.State -eq 'Off') { return $vm }
    if ($vm.State -ne 'Running') { throw "VM_STATE_UNSAFE: $VMName is $($vm.State); only Running or Off is supported" }

    Stop-VM -Name $VMName -Confirm:$false -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Seconds 1
        $vm = Get-VM -Name $VMName -ErrorAction Stop
    } while ($vm.State -ne 'Off' -and (Get-Date) -lt $deadline)

    if ($vm.State -ne 'Off') {
        throw "GRACEFUL_SHUTDOWN_TIMEOUT: $VMName did not reach Off within $TimeoutSeconds seconds; hard power-off was not attempted"
    }
    $vm
}

function Get-StatePaths {
    param([Parameter(Mandatory)]$Config)
    $state = Resolve-ConfigPath -Config $Config -Path $Config.StateDirectory
    $reports = Resolve-ConfigPath -Config $Config -Path $Config.ReportDirectory
    [pscustomobject]@{
        StateDirectory = $state
        ReportDirectory = $reports
        StateFile = Join-Path $state 'state.json'
        OptimizationStateFile = Join-Path $state 'optimization-before.json'
        KnownHostsFile = Join-Path $state 'known_hosts'
    }
}

function Get-HyperVVmCredential {
    param(
        [Parameter(Mandatory)]$Config,
        [string]$SecretVault,
        [string]$SecretName
    )
    if (-not $SecretVault) { $SecretVault = $Config.Access.SecretVault }
    if (-not $SecretName) { $SecretName = $Config.Access.SecretName }
    $secure = $null
    if ($SecretVault -and $SecretName -and (Get-Command Get-Secret -ErrorAction SilentlyContinue)) {
        $secure = Get-Secret -Vault $SecretVault -Name $SecretName -AsPlainText:$false
    } elseif ($Config.Access.AdminPasswordEnv -and [Environment]::GetEnvironmentVariable($Config.Access.AdminPasswordEnv)) {
        $secure = ConvertTo-SecureString ([Environment]::GetEnvironmentVariable($Config.Access.AdminPasswordEnv)) -AsPlainText -Force
    } else {
        $secure = Read-Host "Password for $($Config.Access.AdminUser)" -AsSecureString
    }
    [pscredential]::new($Config.Access.AdminUser, $secure)
}

function Get-UbuntuAddress {
    param([Parameter(Mandatory)]$Config)
    $addresses = @(Get-VMNetworkAdapter -VMName $Config.Name).IPAddresses |
        Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -notmatch '^169\.254\.' }
    if ($addresses.Count -ne 1) { throw "Expected exactly one usable IPv4 address, found: $($addresses -join ', ')" }
    $addresses[0]
}

function Get-UbuntuSshConnection {
    param([Parameter(Mandatory)]$Config)
    $paths = Get-StatePaths -Config $Config
    [pscustomobject]@{
        Address = Get-UbuntuAddress -Config $Config
        User = $Config.Access.AdminUser
        PrivateKey = Resolve-ConfigPath -Config $Config -Path $Config.Access.SshPrivateKeyPath
        KnownHosts = $paths.KnownHostsFile
    }
}

function Initialize-UbuntuKnownHost {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)]$Config)
    $connection = Get-UbuntuSshConnection -Config $Config
    $expected = [string]$Config.Access.SshHostKeyFingerprint
    if (-not $expected) {
        $stateFile = (Get-StatePaths -Config $Config).StateFile
        if (Test-Path -LiteralPath $stateFile) { $expected = [string](Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).SshHostKeyFingerprint }
    }
    if (-not $expected) { throw 'No pinned SSH host-key fingerprint is available in config or state.json' }
    if (-not (Get-Command ssh-keyscan -ErrorAction SilentlyContinue)) { throw 'ssh-keyscan is required to enroll the Ubuntu host key' }
    if (-not (Get-Command ssh-keygen -ErrorAction SilentlyContinue)) { throw 'ssh-keygen is required to verify the Ubuntu host-key fingerprint' }
    $lines = @(& ssh-keyscan -T 10 -H $connection.Address 2>$null)
    if (-not $lines) { throw "No SSH host key received from $($connection.Address)" }
    $directory = Split-Path -Parent $connection.KnownHosts
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $candidate = Join-Path $directory ('.known-hosts.{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    try {
        $lines | Set-Content -LiteralPath $candidate -Encoding ASCII
        $fingerprints = @(& ssh-keygen -lf $candidate -E sha256 2>$null)
        if (-not ($fingerprints | Where-Object { $_ -match [regex]::Escape($expected) })) {
            throw "SSH host-key fingerprint mismatch for $($connection.Address); expected $expected"
        }
        if ($PSCmdlet.ShouldProcess($connection.Address, 'Pin verified SSH host key')) {
            Move-Item -LiteralPath $candidate -Destination $connection.KnownHosts -Force
        }
    } finally {
        if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue }
    }
    $connection
}

function Invoke-UbuntuSsh {
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][string]$Command)
    $connection = Get-UbuntuSshConnection -Config $Config
    if (-not (Test-Path -LiteralPath $connection.KnownHosts)) {
        Initialize-UbuntuKnownHost -Config $Config -Confirm:$false | Out-Null
    }
    & ssh -i $connection.PrivateKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($connection.KnownHosts)" "$($connection.User)@$($connection.Address)" $Command
    if ($LASTEXITCODE -ne 0) { throw "SSH command failed with exit code $LASTEXITCODE" }
}

function Get-HyperVVmWorkloadIdentity {
    param([Parameter(Mandatory)]$Config)
    if ($Config.Guest -eq 'windows-ltsc') {
        $credential = Get-HyperVVmCredential -Config $Config
        $distribution = [string]$Config.Features.WslDistribution
        Invoke-Command -VMName $Config.Name -Credential $credential -ArgumentList $distribution -ScriptBlock {
            param($Distribution)
            $wsl = "$env:ProgramFiles\WSL\wsl.exe"
            if (-not (Test-Path -LiteralPath $wsl)) { return [pscustomobject]@{ OSBuild=(Get-CimInstance Win32_OperatingSystem).BuildNumber; WslKernel=$null; DockerVersion=$null; Containers=@() } }
            $wslKernel = & $wsl -d $Distribution -u root -e uname -r 2>$null
            $dockerVersion = & $wsl -d $Distribution -u root -e sh -lc 'docker version --format {{.Server.Version}} 2>/dev/null || true'
            $containers = @(& $wsl -d $Distribution -u root -e sh -lc 'docker ps --format {{.Image}} 2>/dev/null | sort')
            [pscustomobject]@{ OSBuild=(Get-CimInstance Win32_OperatingSystem).BuildNumber; WslKernel=($wslKernel -join '').Trim(); DockerVersion=($dockerVersion -join '').Trim(); Containers=$containers }
        }
    } else {
        $raw = @(Invoke-UbuntuSsh -Config $Config -Command "printf 'KERNEL='; uname -r; printf 'DOCKER='; docker version --format '{{.Server.Version}}' 2>/dev/null || true; docker ps --format '{{.Image}}' 2>/dev/null | sort")
        [pscustomobject]@{ Raw = $raw }
    }
}
