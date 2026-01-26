# dev-pomogator installer for Windows
# Usage (Cursor):      irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex
# Usage (Claude Code): $env:TARGET="claude"; irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex

$repo = "https://github.com/stgmt/dev-pomogator.git"
$tmpDir = Join-Path $env:TEMP "dev-pomogator-$(Get-Random)"
$originalDir = Get-Location

# Determine target: claude or cursor (default)
$target = if ($env:TARGET -eq "claude") { "--claude" } else { "--cursor" }
$targetName = if ($env:TARGET -eq "claude") { "Claude Code" } else { "Cursor" }

Write-Host "Installing dev-pomogator for $targetName..." -ForegroundColor Cyan

# Clone to temp (use cmd to avoid PowerShell stderr issues)
Write-Host "  Cloning repository..." -ForegroundColor Gray
cmd /c "git clone --depth 1 $repo $tmpDir 2>nul"
if (-not (Test-Path $tmpDir)) {
    Write-Host "Failed to clone repository" -ForegroundColor Red
    exit 1
}

# Install and build
Set-Location $tmpDir
Write-Host "  Installing dependencies..." -ForegroundColor Gray
cmd /c "npm install 2>nul >nul"
Write-Host "  Building..." -ForegroundColor Gray
cmd /c "npm run build 2>nul >nul"

# Run installer (from original directory)
Set-Location $originalDir
Write-Host "  Running installer..." -ForegroundColor Gray
node "$tmpDir\dist\index.js" $target

# Cleanup
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
$env:TARGET = $null

Write-Host "Done!" -ForegroundColor Green
