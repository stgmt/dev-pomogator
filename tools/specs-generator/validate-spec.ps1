<#
.SYNOPSIS
    Validates spec folder structure, formats, and placeholders.

.DESCRIPTION
    Checks a .specs/{feature-slug}/ folder for:
    - Required files presence (STRUCTURE)
    - Unfilled placeholders (PLACEHOLDER)
    - FR format (FR_FORMAT)
    - UC format (UC_FORMAT)
    - EARS format in AC (EARS_FORMAT)
    - NFR sections (NFR_SECTIONS)
    - Cross-references (CROSS_REF)
    - Feature file naming (FEATURE_NAMING)

.PARAMETER Path
    Required. Path to the spec folder (e.g., ".specs/hook-worklog-checker").

.PARAMETER ErrorsOnly
    Optional. Show only errors, skip warnings.

.PARAMETER Verbose
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\validate-spec.ps1 -Path ".specs/hook-worklog-checker"

.EXAMPLE
    .\validate-spec.ps1 -Path ".specs/hook-worklog-checker" -ErrorsOnly -Format text
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $false)]
    [switch]$ErrorsOnly,

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

# Required files
$requiredFiles = @(
    "USER_STORIES.md",
    "USE_CASES.md",
    "REQUIREMENTS.md",
    "FR.md",
    "NFR.md",
    "ACCEPTANCE_CRITERIA.md",
    "DESIGN.md",
    "TASKS.md",
    "FILE_CHANGES.md",
    "README.md"
)

# NFR required sections
$nfrSections = @("Performance", "Security", "Reliability", "Usability")

$errors = @()
$warnings = @()

Write-Log "INFO" "Validating: $Path"

# Check if folder exists
if (-not (Test-Path $TargetDir)) {
    $result = @{
        valid = $false
        path = $Path
        error = "Spec folder not found: $Path"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: Spec folder not found: $Path" -ForegroundColor Red
    }
    exit 1
}

# STRUCTURE: Check required files
Write-Log "INFO" "Checking STRUCTURE rule..."
$existingFiles = Get-ChildItem -Path $TargetDir -File | Select-Object -ExpandProperty Name
$totalFiles = $existingFiles.Count

foreach ($file in $requiredFiles) {
    if ($file -notin $existingFiles) {
        $errors += @{
            file = $file
            line = 0
            rule = "STRUCTURE"
            message = "Required file missing: $file"
        }
        Write-Log "ERROR" "Missing required file: $file"
    }
}

# Check for .feature file
$featureFiles = $existingFiles | Where-Object { $_ -match "\.feature$" }
if ($featureFiles.Count -eq 0) {
    $warnings += @{
        file = "*.feature"
        rule = "STRUCTURE"
        message = "No .feature file found"
    }
    Write-Log "WARN" "No .feature file found"
}

# Validate each file
$validFiles = 0
$filesWithErrors = 0
$filesWithWarnings = 0
$totalPlaceholders = 0

foreach ($file in $existingFiles) {
    $filePath = Join-Path $TargetDir $file
    $content = Get-Content -Path $filePath -Raw -ErrorAction SilentlyContinue
    
    if (-not $content) { continue }
    
    $fileHasErrors = $false
    $fileHasWarnings = $false
    
    # PLACEHOLDER: Check for unfilled placeholders
    $placeholderMatches = [regex]::Matches($content, '\{[^}]+\}')
    foreach ($match in $placeholderMatches) {
        # Skip JSON-like content
        if ($match.Value -match '^\{[\s\S]*:[\s\S]*\}$') { continue }
        # Skip common non-placeholder patterns
        if ($match.Value -in @('{', '}', '{}')) { continue }
        
        $warnings += @{
            file = $file
            rule = "PLACEHOLDER"
            message = "Unfilled placeholder found: $($match.Value)"
        }
        $fileHasWarnings = $true
        $totalPlaceholders++
    }
    
    # FR_FORMAT: Check FR.md format
    if ($file -eq "FR.md") {
        Write-Log "INFO" "Checking FR_FORMAT rule..."
        $frMatches = [regex]::Matches($content, '## FR-(\d+):')
        if ($frMatches.Count -eq 0) {
            $errors += @{
                file = $file
                line = 0
                rule = "FR_FORMAT"
                message = "No FR-N headers found. Expected format: ## FR-N: {Название}"
            }
            $fileHasErrors = $true
            Write-Log "ERROR" "$file : No FR-N headers found"
        }
    }
    
    # UC_FORMAT: Check USE_CASES.md format
    if ($file -eq "USE_CASES.md") {
        Write-Log "INFO" "Checking UC_FORMAT rule..."
        $ucMatches = [regex]::Matches($content, '## UC-(\d+):')
        if ($ucMatches.Count -eq 0) {
            $errors += @{
                file = $file
                line = 0
                rule = "UC_FORMAT"
                message = "No UC-N headers found. Expected format: ## UC-N: {Название}"
            }
            $fileHasErrors = $true
            Write-Log "ERROR" "$file : No UC-N headers found"
        }
    }
    
    # EARS_FORMAT: Check ACCEPTANCE_CRITERIA.md format
    if ($file -eq "ACCEPTANCE_CRITERIA.md") {
        Write-Log "INFO" "Checking EARS_FORMAT rule..."
        $hasEars = $content -match '(WHEN|IF).+(THEN|AND).+SHALL'
        if (-not $hasEars) {
            $warnings += @{
                file = $file
                rule = "EARS_FORMAT"
                message = "No EARS format found. Expected: WHEN/IF...THEN...SHALL"
            }
            $fileHasWarnings = $true
            Write-Log "WARN" "$file : No EARS format found"
        }
    }
    
    # NFR_SECTIONS: Check NFR.md sections
    if ($file -eq "NFR.md") {
        Write-Log "INFO" "Checking NFR_SECTIONS rule..."
        foreach ($section in $nfrSections) {
            if ($content -notmatch "##\s+$section") {
                $warnings += @{
                    file = $file
                    rule = "NFR_SECTIONS"
                    message = "Missing NFR section: $section"
                }
                $fileHasWarnings = $true
                Write-Log "WARN" "$file : Missing section: $section"
            }
        }
    }
    
    # FEATURE_NAMING: Check .feature file naming
    if ($file -match "\.feature$") {
        Write-Log "INFO" "Checking FEATURE_NAMING rule..."
        $featureMatch = [regex]::Match($content, 'Feature:\s+([A-Z]+\d+_.+)')
        if (-not $featureMatch.Success) {
            $warnings += @{
                file = $file
                rule = "FEATURE_NAMING"
                message = "Feature name should follow format: {DOMAIN}{NNN}_{Название}"
            }
            $fileHasWarnings = $true
            Write-Log "WARN" "$file : Feature naming format not followed"
        }
    }
    
    if ($fileHasErrors) {
        $filesWithErrors++
    } elseif ($fileHasWarnings) {
        $filesWithWarnings++
    } else {
        $validFiles++
    }
}

Write-Log "INFO" "Validation complete: $($errors.Count) errors, $($warnings.Count) warnings"

# Build result
$isValid = $errors.Count -eq 0

$result = @{
    valid = $isValid
    path = $Path
    errors = $errors
    warnings = if ($ErrorsOnly) { @() } else { $warnings }
    summary = @{
        total_files = $totalFiles
        valid_files = $validFiles
        files_with_errors = $filesWithErrors
        files_with_warnings = $filesWithWarnings
        unfilled_placeholders = $totalPlaceholders
    }
}

if ($Format -eq "json") {
    $result | ConvertTo-Json -Depth 10
} else {
    if ($isValid) {
        Write-Host "VALID: $Path" -ForegroundColor Green
    } else {
        Write-Host "INVALID: $Path" -ForegroundColor Red
    }
    
    if ($errors.Count -gt 0) {
        Write-Host "`nErrors:" -ForegroundColor Red
        foreach ($err in $errors) {
            Write-Host "  [$($err.rule)] $($err.file): $($err.message)" -ForegroundColor Red
        }
    }
    
    if (-not $ErrorsOnly -and $warnings.Count -gt 0) {
        Write-Host "`nWarnings:" -ForegroundColor Yellow
        foreach ($warn in $warnings) {
            Write-Host "  [$($warn.rule)] $($warn.file): $($warn.message)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`nSummary:" -ForegroundColor Cyan
    Write-Host "  Total files: $totalFiles"
    Write-Host "  Valid files: $validFiles"
    Write-Host "  Files with errors: $filesWithErrors"
    Write-Host "  Files with warnings: $filesWithWarnings"
    Write-Host "  Unfilled placeholders: $totalPlaceholders"
}

if ($isValid) {
    exit 0
} else {
    exit 1
}

