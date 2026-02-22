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

# Required files
$requiredFiles = @(
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
    
    # CONTEXT_SECTION: Check RESEARCH.md has Project Context section
    if ($file -eq "RESEARCH.md") {
        Write-Log "INFO" "Checking CONTEXT_SECTION rule..."
        $hasContextHeader = $content -match '## Project Context & Constraints'
        if (-not $hasContextHeader) {
            $warnings += @{
                file = $file
                rule = "CONTEXT_SECTION"
                message = "Missing '## Project Context & Constraints' section. Run Phase 1.5 or add '> Skipped: {reason}'"
            }
            $fileHasWarnings = $true
            Write-Log "WARN" "$file : Missing Project Context & Constraints section"
        } else {
            $hasSubsection = $content -match '### (Relevant Rules|Existing Patterns & Extensions|Architectural Constraints Summary)'
            $isSkipped = $content -match '>\s*Skipped:'
            if (-not $hasSubsection -and -not $isSkipped) {
                $warnings += @{
                    file = $file
                    rule = "CONTEXT_SECTION"
                    message = "Section 'Project Context & Constraints' exists but has no subsections and no skip reason"
                }
                $fileHasWarnings = $true
                Write-Log "WARN" "$file : Context section incomplete"
            }
        }
    }

    # TDD_TASK_ORDER: Check TASKS.md has Phase 0 (BDD Foundation) before implementation
    if ($file -eq "TASKS.md") {
        Write-Log "INFO" "Checking TDD_TASK_ORDER rule..."
        $hasPhase0 = $content -match '(?i)## Phase 0.*\b(Red|BDD|Foundation|Feature)\b'
        $hasFeatureTask = $content -match '(?i)\.feature'
        if (-not $hasPhase0 -and -not $hasFeatureTask) {
            $warnings += @{
                file = $file
                rule = "TDD_TASK_ORDER"
                message = "No 'Phase 0: BDD Foundation' or .feature task found. TDD requires test tasks BEFORE implementation."
            }
            $fileHasWarnings = $true
            Write-Log "WARN" "$file : No BDD/feature task found in early phases"
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

# =========================================================================
# CROSS_REF_LINKS: Validate markdown cross-reference links between spec files
# =========================================================================
Write-Log "INFO" "Checking CROSS_REF_LINKS rule..."

# Helper: convert markdown header to GitHub-style anchor slug
function ConvertTo-AnchorSlug {
    param([string]$Header)
    $slug = $Header.ToLower()
    # Remove markdown formatting: bold, italic, code, link brackets
    $slug = [regex]::Replace($slug, '[\*_`\[\]\(\)]', '')
    # Remove @featureN tags
    $slug = [regex]::Replace($slug, '@feature\d+', '')
    # Remove special chars except alphanumeric, spaces, hyphens, underscores
    $slug = [regex]::Replace($slug, '[^\w\s-]', '')
    $slug = $slug.Trim()
    # Replace spaces with hyphens
    $slug = [regex]::Replace($slug, '\s+', '-')
    # Collapse multiple hyphens
    $slug = [regex]::Replace($slug, '-+', '-')
    $slug = $slug.TrimEnd('-')
    return $slug
}

# Build anchor index: filename -> @(anchor1, anchor2, ...)
$anchorIndex = @{}
$mdFiles = $existingFiles | Where-Object { $_ -match '\.md$' }

foreach ($mdFile in $mdFiles) {
    $mdPath = Join-Path $TargetDir $mdFile
    $mdLines = Get-Content -Path $mdPath -ErrorAction SilentlyContinue
    if (-not $mdLines) { continue }

    $anchors = @()
    foreach ($mdLine in $mdLines) {
        if ($mdLine -match '^(#{1,6})\s+(.+)$') {
            $headerText = $Matches[2]
            $anchor = ConvertTo-AnchorSlug -Header $headerText
            if ($anchor) {
                $anchors += $anchor
            }
        }
    }
    $anchorIndex[$mdFile] = $anchors
}

# Scan all MD files for markdown links to other spec files
$linkPattern = '\[([^\]]+)\]\(([^)#\s]+\.md)(?:#([^)]+))?\)'

foreach ($mdFile in $mdFiles) {
    $mdPath = Join-Path $TargetDir $mdFile
    $mdLines = Get-Content -Path $mdPath -ErrorAction SilentlyContinue
    if (-not $mdLines) { continue }

    $lineNum = 0
    foreach ($mdLine in $mdLines) {
        $lineNum++
        $linkMatches = [regex]::Matches($mdLine, $linkPattern)
        foreach ($lm in $linkMatches) {
            $linkText = $lm.Groups[1].Value
            $targetFile = $lm.Groups[2].Value
            # Strip leading ./ from relative paths
            $targetFile = $targetFile -replace '^\.\/', ''
            $anchor = $lm.Groups[3].Value  # may be empty

            # Check if target file exists in spec folder
            if ($targetFile -notin $existingFiles) {
                $linkDisplay = "[$linkText]($targetFile$(if($anchor){"#$anchor"}))"
                $warnings += @{
                    file = $mdFile
                    line = $lineNum
                    rule = "CROSS_REF_LINKS"
                    message = "Broken link: $linkDisplay - target file '$targetFile' not found in spec folder"
                }
                Write-Log "WARN" "$mdFile line ${lineNum}: target file '$targetFile' not found"
                continue
            }

            # Check anchor if present
            if ($anchor -and $anchorIndex.ContainsKey($targetFile)) {
                if ($anchor -notin $anchorIndex[$targetFile]) {
                    $linkDisplay = "[$linkText]($targetFile#$anchor)"
                    $warnings += @{
                        file = $mdFile
                        line = $lineNum
                        rule = "CROSS_REF_LINKS"
                        message = "Broken link: $linkDisplay - anchor '#$anchor' not found in $targetFile"
                    }
                    Write-Log "WARN" "$mdFile line ${lineNum}: anchor '#$anchor' not found in $targetFile"
                }
            }
        }
    }
}

Write-Log "INFO" "CROSS_REF_LINKS check complete"

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

