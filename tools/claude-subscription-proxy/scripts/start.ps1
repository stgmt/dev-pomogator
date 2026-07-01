# Bring up the proxy (build on first run, then cached).
# Usage: .\scripts\start.ps1
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Reuse the existing Windows Claude login: mount the host's .claude into the container.
# Host-native path (C:\Users\<you>\.claude) so Docker Desktop resolves it reliably.
$credsDir = Join-Path $env:USERPROFILE ".claude"
$env:CLAUDE_CREDS_DIR = $credsDir
if (-not (Test-Path (Join-Path $credsDir ".credentials.json"))) {
  Write-Host "WARN: $credsDir\.credentials.json not found — the proxy needs a Claude login."
  Write-Host "      Run 'claude login' once on Windows (you likely already have), then re-run this script."
}

# Stop any host-running meridian (npm-installed) on the same port to avoid
# "port already in use" — happens if you previously ran `meridian` directly.
# NOTE: do NOT use $pid — it is a read-only automatic PowerShell variable (this script's
# own PID); assigning to it throws "Cannot overwrite variable PID" and aborts the script.
$portPid = (Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue).OwningProcess
if ($portPid) {
  $proc = Get-Process -Id $portPid -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -ne "com.docker.backend") {
    Write-Host "Stopping host process on :3456 ($($proc.ProcessName), pid $portPid)"
    Stop-Process -Id $portPid -Force
    Start-Sleep -Seconds 1
  }
}

# A pinned container_name means `up` errors with a name conflict if a stopped container
# already exists (created under a different compose project / CWD). Reuse it via `docker
# start` (fast, no rebuild/downtime — stateless, creds are mounted); build+create only when
# none exists. Handles fresh / stopped / running uniformly, no conflict.
docker start claude-proxy-meridian 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Reusing existing container (docker start)."
} else {
  docker compose up -d --build
}
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
