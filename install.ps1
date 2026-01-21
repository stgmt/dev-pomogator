# dev-pomogator installer for Windows
# Usage: irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex

$repo = "https://github.com/stgmt/dev-pomogator.git"
$tmpDir = Join-Path $env:TEMP "dev-pomogator-$(Get-Random)"
$originalDir = Get-Location

Write-Host "Installing dev-pomogator..." -ForegroundColor Cyan

# Clone to temp (redirect stderr to stdout to avoid PowerShell error)
Write-Host "  Cloning repository..." -ForegroundColor Gray
$null = git clone --depth 1 $repo $tmpDir 2>&1
if (-not (Test-Path $tmpDir)) {
    Write-Host "Failed to clone repository" -ForegroundColor Red
    exit 1
}

# Install and build
Set-Location $tmpDir
Write-Host "  Installing dependencies..." -ForegroundColor Gray
$null = npm install 2>&1
Write-Host "  Building..." -ForegroundColor Gray
$null = npm run build 2>&1

# Run installer for Cursor (from original directory)
Set-Location $originalDir
Write-Host "  Running installer..." -ForegroundColor Gray
node "$tmpDir\dist\index.js" --cursor

# Cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

Write-Host "Done!" -ForegroundColor Green
