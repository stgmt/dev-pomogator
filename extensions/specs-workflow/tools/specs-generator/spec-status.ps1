<#
.SYNOPSIS
    Shows progress report for a spec folder.

.DESCRIPTION
    Analyzes a .specs/{feature-slug}/ folder and reports:
    - Current phase (Discovery, Requirements, Design, Finalization)
    - Progress percentage
    - Status of each file (complete, partial, empty, not_created)
    - Next recommended action
    - Blockers if any

.PARAMETER Path
    Required. Path to the spec folder (e.g., ".specs/hook-worklog-checker").

.PARAMETER Brief
    Optional. Show brief output only.

.PARAMETER Verbose
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\spec-status.ps1 -Path ".specs/hook-worklog-checker"

.EXAMPLE
    .\spec-status.ps1 -Path ".specs/hook-worklog-checker" -Brief -Format text
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $false)]
    [switch]$Brief,

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

# Resolve path
if (-not [System.IO.Path]::IsPathRooted($Path)) {
    $TargetDir = Join-Path $RepoRoot $Path
} else {
    $TargetDir = $Path
}

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

# Phase definitions
$phases = @{
    "Discovery" = @("USER_STORIES.md", "USE_CASES.md", "RESEARCH.md")
    "Requirements" = @("REQUIREMENTS.md", "FR.md", "NFR.md", "ACCEPTANCE_CRITERIA.md", "DESIGN.md", "FILE_CHANGES.md")
    "Finalization" = @("TASKS.md", "README.md")
}

# All expected files
$allFiles = @(
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

Write-Log "INFO" "Analyzing: $Path"

# Check if folder exists
if (-not (Test-Path $TargetDir)) {
    $result = @{
        error = "Spec folder not found: $Path"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: Spec folder not found: $Path" -ForegroundColor Red
    }
    exit 1
}

function Get-FileStatus {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        return @{
            status = "not_created"
            placeholders = 0
            items = 0
        }
    }
    
    $content = Get-Content -Path $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content -or $content.Trim().Length -lt 50) {
        return @{
            status = "empty"
            placeholders = 0
            items = 0
        }
    }
    
    # Count placeholders
    $placeholderMatches = [regex]::Matches($content, '\{[^}]+\}')
    $placeholderCount = 0
    foreach ($match in $placeholderMatches) {
        if ($match.Value -notmatch '^\{[\s\S]*:[\s\S]*\}$' -and $match.Value -notin @('{', '}', '{}')) {
            $placeholderCount++
        }
    }
    
    # Count items (FR-N, UC-N, AC-N, etc.)
    $itemCount = ([regex]::Matches($content, '## (FR|UC|AC|NFR)-?\d*:')).Count
    if ($itemCount -eq 0) {
        $itemCount = ([regex]::Matches($content, '^## .+$', [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
    }
    
    if ($placeholderCount -eq 0) {
        return @{
            status = "complete"
            placeholders = 0
            items = $itemCount
        }
    } else {
        return @{
            status = "partial"
            placeholders = $placeholderCount
            items = $itemCount
        }
    }
}

$files = @{}
$completeCount = 0
$totalWeight = 0

foreach ($file in $allFiles) {
    $filePath = Join-Path $TargetDir $file
    $status = Get-FileStatus $filePath
    $files[$file] = $status
    
    Write-Log "INFO" "$file : $($status.status) ($($status.placeholders) placeholders)"
    
    $totalWeight++
    if ($status.status -eq "complete") {
        $completeCount++
    } elseif ($status.status -eq "partial") {
        $completeCount += 0.5
    }
}

# Check for .feature file
$featureFiles = Get-ChildItem -Path $TargetDir -Filter "*.feature" -ErrorAction SilentlyContinue
if ($featureFiles) {
    $featurePath = $featureFiles[0].FullName
    $featureStatus = Get-FileStatus $featurePath
    $files[$featureFiles[0].Name] = $featureStatus
    $totalWeight++
    if ($featureStatus.status -eq "complete") {
        $completeCount++
    } elseif ($featureStatus.status -eq "partial") {
        $completeCount += 0.5
    }
}

# Calculate progress
$progressPercent = [math]::Round(($completeCount / $totalWeight) * 100)

# Determine current phase
$currentPhase = "Discovery"
$discoveryComplete = $true
$requirementsComplete = $true

foreach ($file in $phases["Discovery"]) {
    if ($files.ContainsKey($file) -and $files[$file].status -notin @("complete")) {
        $discoveryComplete = $false
        break
    }
}

if ($discoveryComplete) {
    $currentPhase = "Requirements"
    foreach ($file in $phases["Requirements"]) {
        if ($files.ContainsKey($file) -and $files[$file].status -notin @("complete")) {
            $requirementsComplete = $false
            break
        }
    }
    
    if ($requirementsComplete) {
        $currentPhase = "Finalization"
    }
}

Write-Log "INFO" "Phase: $currentPhase, Progress: $progressPercent%"

# Determine next action
$nextAction = ""
$blockers = @()

foreach ($file in $allFiles) {
    if ($files.ContainsKey($file)) {
        $status = $files[$file]
        if ($status.status -eq "not_created") {
            $nextAction = "Create $file"
            break
        } elseif ($status.status -eq "empty") {
            $nextAction = "Fill $file"
            break
        } elseif ($status.status -eq "partial") {
            $nextAction = "Complete $file - $($status.placeholders) placeholders remaining"
            break
        }
    }
}

if (-not $nextAction) {
    $nextAction = "All files complete! Run validation."
}

$result = @{
    path = $Path
    phase = $currentPhase
    progress_percent = $progressPercent
    files = $files
    next_action = $nextAction
    blockers = $blockers
}

if ($Format -eq "json") {
    if ($Brief) {
        @{
            path = $Path
            phase = $currentPhase
            progress_percent = $progressPercent
            next_action = $nextAction
        } | ConvertTo-Json -Depth 10
    } else {
        $result | ConvertTo-Json -Depth 10
    }
} else {
    Write-Host "Spec Status: $Path" -ForegroundColor Cyan
    Write-Host "Phase: $currentPhase" -ForegroundColor Yellow
    Write-Host "Progress: $progressPercent%" -ForegroundColor $(if ($progressPercent -ge 80) { "Green" } elseif ($progressPercent -ge 50) { "Yellow" } else { "Red" })
    
    if (-not $Brief) {
        Write-Host "`nFiles:" -ForegroundColor Cyan
        foreach ($file in $files.Keys | Sort-Object) {
            $status = $files[$file]
            $color = switch ($status.status) {
                "complete" { "Green" }
                "partial" { "Yellow" }
                "empty" { "Red" }
                "not_created" { "DarkGray" }
                default { "White" }
            }
            $statusText = "$($status.status)"
            if ($status.placeholders -gt 0) {
                $statusText += " ($($status.placeholders) placeholders)"
            }
            Write-Host "  $file : $statusText" -ForegroundColor $color
        }
    }
    
    Write-Host "`nNext action: $nextAction" -ForegroundColor Magenta
}

exit 0

