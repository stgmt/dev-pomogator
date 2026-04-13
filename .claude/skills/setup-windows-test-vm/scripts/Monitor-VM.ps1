# Monitor-VM.ps1 -- long polling loop for claude-test VM during unattend install.
# Logs progress to C:\Temp\monitor.log every 60 seconds for up to 35 minutes.

$ErrorActionPreference = 'Continue'
$logFile = 'C:\Temp\monitor.log'
"=== monitor started: $(Get-Date) ===" | Out-File -FilePath $logFile -Encoding UTF8

$vmName = 'claude-test'
$maxIterations = 35   # 35 * 60s = 35 minutes
$sentinelFound = $false

# VM admin credentials (set by autounattend.xml LocalAccount)
$securePass = ConvertTo-SecureString 'ClaudeTest!2026' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('claude', $securePass)

for ($i = 1; $i -le $maxIterations; $i++) {
    $ts = Get-Date -Format 'HH:mm:ss'

    # 1. VM state
    $vm = Get-VM -Name $vmName -ErrorAction SilentlyContinue
    if (-not $vm) {
        "[$ts] iter=$i ERROR: VM not found" | Add-Content $logFile
        break
    }
    $line = "[$ts] iter=$i State=$($vm.State) Uptime=$($vm.Uptime)"

    # 2. Heartbeat (only available when integration services running)
    $hb = Get-VMIntegrationService -VMName $vmName -Name 'Heartbeat' -ErrorAction SilentlyContinue
    if ($hb) { $line += " HB=$($hb.PrimaryStatusDescription)" }

    # 3. IP address (only after Win boots and gets DHCP)
    $adapter = Get-VMNetworkAdapter -VMName $vmName -ErrorAction SilentlyContinue
    if ($adapter -and $adapter.IPAddresses) {
        $ipv4 = $adapter.IPAddresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
        if ($ipv4) { $line += " IP=$ipv4" }
    }

    # 4. PSDirect probe -- test if VM accepts Invoke-Command (only after Win install + login)
    $sentinelExists = $false
    try {
        $sentinelExists = Invoke-Command -VMName $vmName -Credential $cred -ScriptBlock {
            Test-Path C:\post-install-complete.flag
        } -ErrorAction Stop
        $line += " PSDirect=OK Sentinel=$sentinelExists"
    } catch {
        $line += " PSDirect=NO"
    }

    $line | Add-Content $logFile
    Write-Host $line

    if ($sentinelExists) {
        "[$ts] SENTINEL FOUND -- post-install complete" | Add-Content $logFile
        Write-Host "SENTINEL FOUND" -ForegroundColor Green
        $sentinelFound = $true
        break
    }

    Start-Sleep -Seconds 60
}

"=== monitor finished: $(Get-Date) sentinel=$sentinelFound ===" | Add-Content $logFile
