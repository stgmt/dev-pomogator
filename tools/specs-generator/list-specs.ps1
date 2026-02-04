<#
.SYNOPSIS
    Lists all specs in the repository with their status.

.DESCRIPTION
    Scans .specs/ directory and shows status of each spec folder:
    - Name
    - Path
    - Status (complete, partial, empty)
    - File count
    - Progress percentage
    - Last modified date

.PARAMETER Incomplete
    Optional. Show only incomplete specs.

.PARAMETER Filter
    Optional. Filter specs by name pattern.

.PARAMETER Verbose
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\list-specs.ps1

.EXAMPLE
    .\list-specs.ps1 -Incomplete -Format text

.EXAMPLE
    .\list-specs.ps1 -Filter "zoho"
#>

param(
    [Parameter(Mandatory = $false)]
    [switch]$Incomplete,

    [Parameter(Mandatory = $false)]
    [string]$Filter = "",

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutput,

    [Parameter(Mandatory = $false)]
    [string]$LogFile = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("json", "text")]
    [string]$Format = "json"
)

$ErrorActionPreference = "Stop"

# Determine script paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Go up 4 levels: specs-generator -> tools -> specs-workflow -> extensions -> repo root
$RepoRoot = (Get-Item $ScriptDir).Parent.Parent.Parent.Parent.FullName
$LogsDir = Join-Path $ScriptDir "logs"
$SpecsDir = Join-Path $RepoRoot ".specs"

# Setup logging
if (-not $LogFile) {
    $LogFile = Join-Path $LogsDir "specs-generator-$(Get-Date -Format 'yyyy-MM-dd').log"
}

function Write-Log {
    param([string]$Level, [string]$Message)
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }
    
    Add-Content -Path $LogFile -Value $logLine -ErrorAction SilentlyContinue
    
    if ($VerboseOutput) {
        switch ($Level) {
            "ERROR" { Write-Host $logLine -ForegroundColor Red }
            "WARN"  { Write-Host $logLine -ForegroundColor Yellow }
            "INFO"  { Write-Host $logLine -ForegroundColor Green }
            default { Write-Host $logLine }
        }
    }
}

Write-Log "INFO" "Scanning .specs/ directory"

# Check if .specs exists
if (-not (Test-Path $SpecsDir)) {
    $result = @{
        specs = @()
        summary = @{
            total = 0
            complete = 0
            partial = 0
            empty = 0
        }
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "No .specs/ directory found" -ForegroundColor Yellow
    }
    exit 0
}

# Get all spec folders
$specFolders = Get-ChildItem -Path $SpecsDir -Directory | Where-Object {
    $_.Name -notmatch "^(disabled|archive|\.)"
}

if ($Filter) {
    $specFolders = $specFolders | Where-Object { $_.Name -match $Filter }
}

Write-Log "INFO" "Found $($specFolders.Count) spec folders"

# Expected files for progress calculation
$expectedFiles = @(
    "USER_STORIES.md",
    "USE_CASES.md",
    "RESEARCH.md",
    "REQUIREMENTS.md",
    "FR.md",
    "NFR.md",
    "ACCEPTANCE_CRITERIA.md",
    "DESIGN.md",
    "TASKS.md",
    "FILE_CHANGES.md",
    "README.md"
)

function Get-SpecStatus {
    param([string]$SpecPath)
    
    $files = Get-ChildItem -Path $SpecPath -File -ErrorAction SilentlyContinue
    $filesCount = $files.Count
    
    $completeCount = 0
    $hasContent = $false
    
    foreach ($expectedFile in $expectedFiles) {
        $filePath = Join-Path $SpecPath $expectedFile
        if (Test-Path $filePath) {
            $content = Get-Content -Path $filePath -Raw -ErrorAction SilentlyContinue
            if ($content -and $content.Trim().Length -gt 50) {
                $hasContent = $true
                # Check for placeholders
                $placeholders = [regex]::Matches($content, '\{[^}]+\}')
                $hasPlaceholders = $false
                foreach ($match in $placeholders) {
                    if ($match.Value -notmatch '^\{[\s\S]*:[\s\S]*\}$' -and $match.Value -notin @('{', '}', '{}')) {
                        $hasPlaceholders = $true
                        break
                    }
                }
                if (-not $hasPlaceholders) {
                    $completeCount++
                } else {
                    $completeCount += 0.5
                }
            }
        }
    }
    
    $progress = [math]::Round(($completeCount / $expectedFiles.Count) * 100)
    
    if ($progress -ge 90) {
        $status = "complete"
    } elseif ($hasContent) {
        $status = "partial"
    } else {
        $status = "empty"
    }
    
    $lastModified = ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
    
    return @{
        files_count = $filesCount
        progress_percent = $progress
        status = $status
        last_modified = if ($lastModified) { $lastModified.ToString("o") } else { $null }
    }
}

$specs = @()
$completeCount = 0
$partialCount = 0
$emptyCount = 0

foreach ($folder in $specFolders) {
    $status = Get-SpecStatus -SpecPath $folder.FullName
    
    Write-Log "INFO" "$($folder.Name): $($status.status) ($($status.progress_percent)%)"
    
    $spec = @{
        name = $folder.Name
        path = ".specs/$($folder.Name)"
        status = $status.status
        files_count = $status.files_count
        progress_percent = $status.progress_percent
        last_modified = $status.last_modified
    }
    
    switch ($status.status) {
        "complete" { $completeCount++ }
        "partial" { $partialCount++ }
        "empty" { $emptyCount++ }
    }
    
    if ($Incomplete -and $status.status -eq "complete") {
        continue
    }
    
    $specs += $spec
}

Write-Log "INFO" "Summary: $completeCount complete, $partialCount partial, $emptyCount empty"

$result = @{
    specs = $specs
    summary = @{
        total = $specFolders.Count
        complete = $completeCount
        partial = $partialCount
        empty = $emptyCount
    }
}

if ($Format -eq "json") {
    $result | ConvertTo-Json -Depth 10
} else {
    Write-Host "Specs in .specs/:" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($spec in $specs) {
        $color = switch ($spec.status) {
            "complete" { "Green" }
            "partial" { "Yellow" }
            "empty" { "Red" }
            default { "White" }
        }
        Write-Host "  $($spec.name)" -ForegroundColor $color -NoNewline
        Write-Host " - $($spec.status) ($($spec.progress_percent)%)" -ForegroundColor DarkGray
    }
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  Total: $($result.summary.total)"
    Write-Host "  Complete: $($result.summary.complete)" -ForegroundColor Green
    Write-Host "  Partial: $($result.summary.partial)" -ForegroundColor Yellow
    Write-Host "  Empty: $($result.summary.empty)" -ForegroundColor Red
}

exit 0

