# common.ps1 — shared helpers for hyperv-test-runner lifecycle scripts
#
# Source from any 0X-*.ps1 via:
#     . (Join-Path $PSScriptRoot 'lib\common.ps1')
#
# Provides:
#   - Test-IsAdmin               → bool
#   - Assert-Admin               → throws if not elevated
#   - Assert-HyperVAvailable     → throws if Hyper-V Module missing
#   - Wait-VMReady               → blocks until VM has heartbeat + IPv4 (or timeout)
#   - Get-VMIPAddress            → returns first IPv4 of a VM, or $null

function Test-IsAdmin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Assert-Admin {
    if (-not (Test-IsAdmin)) {
        Write-Host ''
        Write-Host 'ERROR: This script requires Administrator privileges.' -ForegroundColor Red
        Write-Host 'Suggested: Right-click PowerShell, choose "Run as Administrator", then re-run.' -ForegroundColor Yellow
        Write-Host ''
        throw 'Not elevated'
    }
}

function Assert-HyperVAvailable {
    if (-not (Get-Module -ListAvailable -Name Hyper-V)) {
        Write-Host ''
        Write-Host 'ERROR: Hyper-V Module is not installed on this host.' -ForegroundColor Red
        Write-Host 'Suggested (admin):' -ForegroundColor Yellow
        Write-Host '  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All' -ForegroundColor Yellow
        Write-Host 'Reboot afterwards.' -ForegroundColor Yellow
        Write-Host ''
        throw 'Hyper-V Module missing'
    }
}

function Get-VMIPAddress {
    param(
        [Parameter(Mandatory)][string]$VMName
    )
    $adapter = Get-VMNetworkAdapter -VMName $VMName -ErrorAction SilentlyContinue
    if (-not $adapter) { return $null }
    $ipv4 = $adapter.IPAddresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
    return $ipv4
}

function Wait-VMReady {
    param(
        [Parameter(Mandatory)][string]$VMName,
        [int]$TimeoutSeconds = 90
    )

    Write-Host ("Waiting for VM '{0}' heartbeat (timeout {1}s)..." -f $VMName, $TimeoutSeconds) -ForegroundColor Cyan

    try {
        Wait-VM -Name $VMName -For Heartbeat -Timeout $TimeoutSeconds -ErrorAction Stop
    } catch {
        throw ("Timeout: VM '{0}' did not reach heartbeat within {1}s. {2}" -f $VMName, $TimeoutSeconds, $_.Exception.Message)
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $ip = Get-VMIPAddress -VMName $VMName
        if ($ip) {
            Write-Host ("VM ready at IP {0}" -f $ip) -ForegroundColor Green
            return $ip
        }
        Start-Sleep -Milliseconds 1500
    }

    throw ("Timeout: VM '{0}' has heartbeat but did not acquire an IPv4 within {1}s." -f $VMName, $TimeoutSeconds)
}
