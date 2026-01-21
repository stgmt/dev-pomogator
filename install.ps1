# dev-pomogator installer for Windows
# Usage: irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$repo = "https://github.com/stgmt/dev-pomogator.git"
$tmpDir = Join-Path $env:TEMP "dev-pomogator-$(Get-Random)"

Write-Host "🚀 Installing dev-pomogator..." -ForegroundColor Cyan

# Clone to temp
git clone --depth 1 $repo $tmpDir 2>$null | Out-Null

# Install and build
Push-Location $tmpDir
npm install --silent 2>$null | Out-Null
npm run build --silent 2>$null | Out-Null

# Run installer for Cursor
node dist/index.js --cursor

# Cleanup
Pop-Location
Remove-Item -Recurse -Force $tmpDir

Write-Host "✨ Done!" -ForegroundColor Green
