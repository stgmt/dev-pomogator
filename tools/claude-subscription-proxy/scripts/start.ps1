# Bring up the proxy (build on first run, then cached).
# Usage: .\scripts\start.ps1
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Stop any host-running meridian (npm-installed) on the same port to avoid
# "port already in use" — happens if you previously ran `meridian` directly.
$pid = (Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) {
  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -ne "com.docker.backend") {
    Write-Host "Stopping host process on :3456 ($($proc.ProcessName), pid $pid)"
    Stop-Process -Id $pid -Force
    Start-Sleep -Seconds 1
  }
}

docker compose up -d --build
Write-Host ""
Write-Host "Waiting for /health..."
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3456/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { }
}
if ($ok) {
  Write-Host "OK — proxy is up at http://127.0.0.1:3456"
  Invoke-WebRequest -Uri "http://127.0.0.1:3456/health" -UseBasicParsing | Select-Object -ExpandProperty Content
} else {
  Write-Error "Proxy did not become healthy within 30s. Check: docker compose logs meridian"
  exit 1
}
