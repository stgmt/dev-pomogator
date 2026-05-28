# Configure Docker Desktop to autostart on Windows login.
# This is the "always alive" enabler — Docker Desktop handles container
# restart-on-failure (via compose `restart: unless-stopped`); this script
# ensures Docker Desktop itself starts when you log in.
#
# Usage (one-time): .\scripts\install-autostart.ps1
$ErrorActionPreference = "Stop"

# 1. Verify Docker Desktop is installed.
$dockerExe = Get-Command "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerExe) {
  $defaultPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $defaultPath) {
    $dockerExe = $defaultPath
  } else {
    Write-Error "Docker Desktop not found. Install it from https://www.docker.com/products/docker-desktop/"
    exit 1
  }
} else {
  $dockerExe = $dockerExe.Source
}

# 2. Enable Docker Desktop "Start on login" via its settings file.
$settingsPath = "$env:APPDATA\Docker\settings-store.json"
if (Test-Path $settingsPath) {
  $s = Get-Content $settingsPath -Raw | ConvertFrom-Json
  if ($s.PSObject.Properties.Name -contains "AutoStart") {
    $s.AutoStart = $true
  } else {
    $s | Add-Member -MemberType NoteProperty -Name "AutoStart" -Value $true -Force
  }
  $s | ConvertTo-Json -Depth 20 | Set-Content $settingsPath -Encoding UTF8
  Write-Host "Set Docker Desktop AutoStart=true in $settingsPath"
} else {
  Write-Warning "Docker Desktop settings not found at $settingsPath — open Docker Desktop once first, then re-run this script."
}

# 3. Verify compose has restart policy.
$composePath = Join-Path (Split-Path -Parent $PSScriptRoot) "docker-compose.yml"
if ((Get-Content $composePath -Raw) -match "restart:\s*unless-stopped") {
  Write-Host "compose `restart: unless-stopped` policy verified."
} else {
  Write-Warning "compose missing `restart: unless-stopped` — container won't auto-restart."
}

# 4. Bring up the stack now so it's running.
& (Join-Path $PSScriptRoot "start.ps1")

Write-Host ""
Write-Host "Done. The proxy will now:"
Write-Host "  - Start automatically when you log into Windows (via Docker Desktop autostart)."
Write-Host "  - Restart automatically if the container crashes."
Write-Host "  - Refresh OAuth tokens automatically (until refresh token itself expires)."
Write-Host ""
Write-Host "Verify any time with: .\scripts\health.ps1"
