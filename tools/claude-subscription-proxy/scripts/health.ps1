# Health probe. Exits 0 if healthy, 1 otherwise. Suitable for CI / cron / monitors.
# Usage: .\scripts\health.ps1
$ErrorActionPreference = "Stop"
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:3456/health" -TimeoutSec 5 -UseBasicParsing
  if ($r.StatusCode -eq 200) {
    $r.Content
    exit 0
  }
} catch {
  Write-Error "Proxy unhealthy: $_"
  exit 1
}
