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
    - Progress state (.progress.json) with phase confirmations

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

.PARAMETER ConfirmStop
    Optional. Mark a STOP point as confirmed by the user.
    Valid values: Discovery, Context, Requirements, Finalization.

.EXAMPLE
    .\spec-status.ps1 -Path ".specs/hook-worklog-checker"

.EXAMPLE
    .\spec-status.ps1 -Path ".specs/hook-worklog-checker" -Brief -Format text

.EXAMPLE
    .\spec-status.ps1 -Path ".specs/hook-worklog-checker" -ConfirmStop Discovery
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
    [string]$Format = "json",

    [Parameter(Mandatory = $false)]
    [ValidateSet("Discovery", "Context", "Requirements", "Finalization", "")]
    [string]$ConfirmStop = ""
)

$ErrorActionPreference = "Stop"

# Find repo root by markers
function Find-RepoRoot {
    param([string]$StartDir)
    $current = $StartDir
    while ($current -and (Test-Path $current)) {
        if (
            (Test-Path (Join-Path $current ".git")) -or
            (Test-Path (Join-Path $current "package.json")) -or
            (Test-Path (Join-Path $current ".root-artifacts.yaml"))
        ) {
            return $current
        }
        $parent = Split-Path -Parent $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $null
}

# Determine script paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Find-RepoRoot -StartDir $ScriptDir
if (-not $RepoRoot) {
    Write-Error "Repository root not found from $ScriptDir"
    exit 1
}
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
    "Finalization" = @("TASKS.md", "README.md", "CHANGELOG.md")
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
    "CHANGELOG.md",
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
$subPhase = $null
$discoveryComplete = $true
$requirementsComplete = $true

foreach ($file in $phases["Discovery"]) {
    if ($files.ContainsKey($file) -and $files[$file].status -notin @("complete")) {
        $discoveryComplete = $false
        break
    }
}

if ($discoveryComplete) {
    # Phase 1.5: Check context analysis in RESEARCH.md
    $researchPath = Join-Path $TargetDir "RESEARCH.md"
    $contextDone = $false
    if (Test-Path $researchPath) {
        $rc = Get-Content -Path $researchPath -Raw -ErrorAction SilentlyContinue
        if ($rc -match '## Project Context & Constraints') {
            $hasSub = $rc -match '### (Relevant Rules|Existing Patterns|Architectural Constraints)'
            $isSkip = $rc -match '>\s*Skipped:'
            if ($hasSub -or $isSkip) { $contextDone = $true }
        }
    }

    if (-not $contextDone) {
        $subPhase = "Context Analysis pending"
    } else {
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
}

Write-Log "INFO" "Phase: $currentPhase, Progress: $progressPercent%"

# --- .progress.json state machine ---
$progressPath = Join-Path $TargetDir ".progress.json"
$progressState = $null

if (Test-Path $progressPath) {
    try {
        $progressState = Get-Content -Path $progressPath -Raw | ConvertFrom-Json
    } catch {
        Write-Log "WARN" "Failed to parse .progress.json: $_"
        $progressState = $null
    }
}

# Create default state if not exists (backward compat for pre-existing specs)
if (-not $progressState) {
    $progressState = [PSCustomObject]@{
        version      = 1
        featureSlug  = (Split-Path -Leaf $TargetDir)
        createdAt    = (Get-Date -Format "o")
        currentPhase = $currentPhase
        phases       = [PSCustomObject]@{
            Discovery    = [PSCustomObject]@{ completedAt = $null; stopConfirmed = $false; stopConfirmedAt = $null }
            Context      = [PSCustomObject]@{ completedAt = $null; stopConfirmed = $false; stopConfirmedAt = $null }
            Requirements = [PSCustomObject]@{ completedAt = $null; stopConfirmed = $false; stopConfirmedAt = $null }
            Finalization = [PSCustomObject]@{ completedAt = $null; stopConfirmed = $false; stopConfirmedAt = $null }
        }
    }
}

# Update currentPhase
$progressState.currentPhase = $currentPhase

# Mark completed phases
if ($discoveryComplete -and -not $progressState.phases.Discovery.completedAt) {
    $progressState.phases.Discovery.completedAt = (Get-Date -Format "o")
}
if ($contextDone -and -not $progressState.phases.Context.completedAt) {
    $progressState.phases.Context.completedAt = (Get-Date -Format "o")
}
if ($requirementsComplete -and ($currentPhase -eq "Finalization") -and -not $progressState.phases.Requirements.completedAt) {
    $progressState.phases.Requirements.completedAt = (Get-Date -Format "o")
}

# Handle -ConfirmStop
if ($ConfirmStop) {
    $phase = $progressState.phases.$ConfirmStop
    if ($phase) {
        $phase.stopConfirmed = $true
        $phase.stopConfirmedAt = (Get-Date -Format "o")
        Write-Log "INFO" "STOP confirmed for phase: $ConfirmStop"
    } else {
        Write-Log "WARN" "Unknown phase for ConfirmStop: $ConfirmStop"
    }
}

# Atomic write: temp + move
$tempProgressPath = "$progressPath.tmp"
try {
    $progressState | ConvertTo-Json -Depth 5 | Set-Content -Path $tempProgressPath -NoNewline -Encoding UTF8
    Move-Item -Path $tempProgressPath -Destination $progressPath -Force
    Write-Log "INFO" "Updated .progress.json"
} catch {
    Write-Log "WARN" "Failed to write .progress.json: $_"
    if (Test-Path $tempProgressPath) { Remove-Item $tempProgressPath -Force -ErrorAction SilentlyContinue }
}

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
    if ($subPhase -eq "Context Analysis pending") {
        $nextAction = "Run Phase 1.5: Add '## Project Context & Constraints' to RESEARCH.md"
    } else {
        $nextAction = "All files complete! Run validation."
    }
}

$result = @{
    path = $Path
    phase = $currentPhase
    sub_phase = $subPhase
    progress_percent = $progressPercent
    files = $files
    next_action = $nextAction
    blockers = $blockers
    progress_state = $progressState
}

if ($Format -eq "json") {
    if ($Brief) {
        @{
            path = $Path
            phase = $currentPhase
            sub_phase = $subPhase
            progress_percent = $progressPercent
            next_action = $nextAction
        } | ConvertTo-Json -Depth 10
    } else {
        $result | ConvertTo-Json -Depth 10
    }
} else {
    Write-Host "Spec Status: $Path" -ForegroundColor Cyan
    $phaseDisplay = $currentPhase
    if ($subPhase) { $phaseDisplay += " ($subPhase)" }
    Write-Host "Phase: $phaseDisplay" -ForegroundColor Yellow
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
    
    # Show STOP confirmations
    if ($progressState) {
        Write-Host "`nSTOP Confirmations:" -ForegroundColor Cyan
        foreach ($phaseName in @("Discovery", "Context", "Requirements", "Finalization")) {
            $ps = $progressState.phases.$phaseName
            if ($ps.stopConfirmed) {
                Write-Host "  $phaseName : CONFIRMED" -ForegroundColor Green
            } else {
                Write-Host "  $phaseName : pending" -ForegroundColor DarkGray
            }
        }
    }

    Write-Host "`nNext action: $nextAction" -ForegroundColor Magenta
}

exit 0

