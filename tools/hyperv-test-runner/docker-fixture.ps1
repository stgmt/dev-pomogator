# docker-fixture.ps1 — Save/restore/list dockur/windows fixtures.
#
# Fixtures are copies of data.img (~10 GB) stored at D:\fixtures\.
# Docker volume (ext4, fast I/O) is used for runtime; fixtures on NTFS for safety.
#
# Usage:
#   .\docker-fixture.ps1 -Action save    -Name baseline-clean
#   .\docker-fixture.ps1 -Action restore -Name baseline-clean
#   .\docker-fixture.ps1 -Action list

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('save', 'restore', 'list')]
    [string]$Action,

    [string]$Name,

    [string]$FixtureDir = 'D:\fixtures',

    [string]$VolumeName = 'dev-pomogator_win-test-storage',

    [string]$ComposeFile = 'docker-compose.win-test.yml',

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $FixtureDir)) {
    New-Item -ItemType Directory -Path $FixtureDir -Force | Out-Null
}

function Save-Fixture {
    param([string]$Name)
    if (-not $Name) { throw 'Provide -Name for save' }

    $dest = Join-Path $FixtureDir "$Name.img"
    if ((Test-Path $dest) -and -not $Force) {
        Write-Host "Fixture '$Name' already exists ($dest). Use -Force to overwrite." -ForegroundColor Red
        return
    }

    Write-Host "Stopping container..." -ForegroundColor Cyan
    docker compose -f $ComposeFile stop 2>&1 | Out-Null

    Write-Host "Saving data.img to $dest (~10 GB, may take 1-2 min)..." -ForegroundColor Cyan
    $fixtureDirUnix = $FixtureDir -replace '\\', '/' -replace '^([A-Z]):', { '/' + $_.Groups[1].Value.ToLower() }
    docker run --rm `
        -v "${VolumeName}:/source:ro" `
        -v "${fixtureDirUnix}:/backup" `
        alpine cp /source/data.img "/backup/$Name.img"

    if (Test-Path $dest) {
        $size = [math]::Round((Get-Item $dest).Length / 1GB, 2)
        Write-Host "Saved: $dest ($size GB)" -ForegroundColor Green
    } else {
        Write-Host "Save failed - file not created" -ForegroundColor Red
    }

    Write-Host "Starting container..." -ForegroundColor Cyan
    docker compose -f $ComposeFile start 2>&1 | Out-Null
}

function Restore-Fixture {
    param([string]$Name)
    if (-not $Name) { throw 'Provide -Name for restore' }

    $src = Join-Path $FixtureDir "$Name.img"
    if (-not (Test-Path $src)) {
        Write-Host "Fixture '$Name' not found at $src" -ForegroundColor Red
        Write-Host "Available fixtures:" -ForegroundColor Yellow
        List-Fixtures
        return
    }

    Write-Host "Stopping container..." -ForegroundColor Cyan
    docker compose -f $ComposeFile stop 2>&1 | Out-Null

    Write-Host "Restoring $src to volume (~10 GB, may take 1-2 min)..." -ForegroundColor Cyan
    $fixtureDirUnix = $FixtureDir -replace '\\', '/' -replace '^([A-Z]):', { '/' + $_.Groups[1].Value.ToLower() }
    docker run --rm `
        -v "${VolumeName}:/target" `
        -v "${fixtureDirUnix}:/backup:ro" `
        alpine cp "/backup/$Name.img" /target/data.img

    Write-Host "Starting container..." -ForegroundColor Cyan
    docker compose -f $ComposeFile start 2>&1 | Out-Null

    Write-Host "Restored fixture '$Name'. VM booting..." -ForegroundColor Green
}

function List-Fixtures {
    $files = Get-ChildItem $FixtureDir -Filter '*.img' -ErrorAction SilentlyContinue
    if (-not $files) {
        Write-Host "No fixtures in $FixtureDir" -ForegroundColor Yellow
        return
    }

    Write-Host "`nAvailable fixtures ($FixtureDir):" -ForegroundColor Cyan
    Write-Host ("{0,-30} {1,10} {2}" -f 'Name', 'Size (GB)', 'Created')
    Write-Host ("{0,-30} {1,10} {2}" -f '----', '---------', '-------')
    foreach ($f in $files | Sort-Object LastWriteTime -Descending) {
        $name = [IO.Path]::GetFileNameWithoutExtension($f.Name)
        $sizeGB = [math]::Round($f.Length / 1GB, 2)
        $date = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
        Write-Host ("{0,-30} {1,10} {2}" -f $name, $sizeGB, $date)
    }
    Write-Host ""
}

switch ($Action) {
    'save'    { Save-Fixture -Name $Name }
    'restore' { Restore-Fixture -Name $Name }
    'list'    { List-Fixtures }
}
