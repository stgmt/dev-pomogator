[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [string]$SecretVault,
    [string]$SecretName
)

. "$PSScriptRoot\Common.ps1"
$config = Import-HyperVVmConfig -ConfigPath $ConfigPath
if ($config.Guest -ne 'windows-ltsc') { throw 'Finalize-WindowsGuest.ps1 only supports windows-ltsc' }
if (-not $PSCmdlet.ShouldProcess($config.Name, 'Finalize Windows guest, WSL2, Docker CE, and BuildKit policy')) { return }

$credential = Get-HyperVVmCredential -Config $config -SecretVault $SecretVault -SecretName $SecretName
$result = Invoke-Command -VMName $config.Name -Credential $credential -ArgumentList $config -ScriptBlock {
    param($cfg)
    $ErrorActionPreference = 'Stop'
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name DefaultPassword -ErrorAction SilentlyContinue
    New-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoAdminLogon -Value '0' -PropertyType String -Force | Out-Null
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name AutoLogonCount -ErrorAction SilentlyContinue
    if ($cfg.Access.EnableRdp) {
        Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
        Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue
    }
    $wslResult = $null
    if ($cfg.Features.InstallWslDocker) {
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart | Out-Null
        Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart | Out-Null
        $wslConfig = "[wsl2]`nmemory=$($cfg.Features.WslMemoryMB)MB`nswap=$($cfg.Features.WslSwapMB)MB`n`n[experimental]`nsparseVhd=$([string]$cfg.Features.SparseVhd).ToLowerInvariant()`nautoMemoryReclaim=$($cfg.Features.AutoMemoryReclaim)`n"
        Set-Content -LiteralPath "$env:USERPROFILE\.wslconfig" -Value $wslConfig -Encoding ASCII
        $setup = Join-Path $env:ProgramData 'HyperVVm\setup-wsl-docker.ps1'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $setup) | Out-Null
        @"
`$ErrorActionPreference='Stop'
`$wsl=`"`$env:ProgramFiles\WSL\wsl.exe`"
if(-not(Test-Path `$wsl)){ `$wsl='wsl.exe' }
& `$wsl --install -d '$($cfg.Features.WslDistribution)' --no-launch
& `$wsl -d '$($cfg.Features.WslDistribution)' -u root -e sh -lc 'set -eu; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl; install -m 0755 -d /etc/apt/keyrings; curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc; chmod a+r /etc/apt/keyrings/docker.asc; echo `"deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu `$(. /etc/os-release && echo `$VERSION_CODENAME) stable`" > /etc/apt/sources.list.d/docker.list; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; mkdir -p /etc/docker; printf `%s `"{\`"features\`":{\`"buildkit\`":true},\`"builder\`":{\`"gc\`":{\`"enabled\`":true,\`"defaultKeepStorage\`":\`"$($cfg.Features.BuildCacheLimitGB)GB\`"}}}`" > /etc/docker/daemon.json; systemctl enable --now docker; docker run --rm hello-world >/dev/null'
"@ | Set-Content -LiteralPath $setup -Encoding UTF8
        $wslResult = [pscustomobject]@{ SetupScript=$setup; RebootRequired=$true; Command="Run after reboot: powershell -ExecutionPolicy Bypass -File `"$setup`"" }
    }
    [pscustomobject]@{ User=$env:USERNAME; OS=(Get-CimInstance Win32_OperatingSystem).Caption; WslDocker=$wslResult }
}

$paths = Get-StatePaths -Config $config
if (Test-Path -LiteralPath $paths.StateFile) {
    $state = Get-Content -LiteralPath $paths.StateFile -Raw | ConvertFrom-Json
    $state.Stage = if ($result.WslDocker -and $result.WslDocker.RebootRequired) { 'access-ready-reboot-required' } else { 'access-ready' }
    $state.FinalizedAt = (Get-Date).ToUniversalTime().ToString('o')
    Write-AtomicJson -InputObject $state -Path $paths.StateFile
}
$result
