<#
.SYNOPSIS
    Audits spec folder for cross-reference issues, coverage gaps, and terminology inconsistencies.

.DESCRIPTION
    Analyzes a .specs/{feature-slug}/ folder and checks:
    - FR to AC coverage (FR_AC_COVERAGE)
    - FR/AC to BDD scenario coverage via @featureN tags (FR_BDD_COVERAGE)
    - REQUIREMENTS.md traceability completeness (REQUIREMENTS_TRACEABILITY)
    - TASKS.md references to FR/NFR (TASKS_FR_REFS)
    - Unclosed open questions in RESEARCH.md (OPEN_QUESTIONS)
    - Terminology consistency across files (TERM_CONSISTENCY)

    This is a report-only tool (exit code always 0). It does not block the workflow.

.PARAMETER Path
    Required. Path to the spec folder (e.g., ".specs/my-feature").

.PARAMETER VerboseOutput
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\audit-spec.ps1 -Path ".specs/my-feature"

.EXAMPLE
    .\audit-spec.ps1 -Path ".specs/my-feature" -Format text -VerboseOutput
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

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

Write-Log "INFO" "Auditing: $Path"

# Check if folder exists
if (-not (Test-Path $TargetDir)) {
    $result = @{
        path = $Path
        error = "Spec folder not found: $Path"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: Spec folder not found: $Path" -ForegroundColor Red
    }
    exit 0
}

# ===== Helper functions =====

function Get-FileContent {
    param([string]$FileName)
    $filePath = Join-Path $TargetDir $FileName
    if (Test-Path $filePath) {
        return Get-Content -Path $filePath -Raw -ErrorAction SilentlyContinue
    }
    return $null
}

function Get-FileLines {
    param([string]$FileName)
    $filePath = Join-Path $TargetDir $FileName
    if (Test-Path $filePath) {
        return Get-Content -Path $filePath -ErrorAction SilentlyContinue
    }
    return @()
}

# ===== Check functions =====

$findings = @()

# --- CHECK 1: FR_AC_COVERAGE ---
# Every FR-N in FR.md should have at least one AC-N(FR-N) in ACCEPTANCE_CRITERIA.md
Write-Log "INFO" "Running FR_AC_COVERAGE check..."

$frContent = Get-FileContent "FR.md"
$acContent = Get-FileContent "ACCEPTANCE_CRITERIA.md"

if ($frContent -and $acContent) {
    $frIds = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { "FR-$($_.Groups[1].Value)" }
    $acFrRefs = [regex]::Matches($acContent, '## AC-\d+\s*\(FR-(\d+)\)') | ForEach-Object { "FR-$($_.Groups[1].Value)" }
    # Also match AC-N (FR-N): format with colon
    $acFrRefs2 = [regex]::Matches($acContent, '## AC-\d+\s*\(FR-(\d+)\):') | ForEach-Object { "FR-$($_.Groups[1].Value)" }
    $allAcRefs = @($acFrRefs) + @($acFrRefs2) | Select-Object -Unique

    foreach ($frId in $frIds) {
        if ($frId -notin $allAcRefs) {
            $findings += @{
                check = "FR_AC_COVERAGE"
                category = "LOGIC_GAPS"
                severity = "WARNING"
                message = "$frId has no matching Acceptance Criteria"
                details = "Add AC-N ($frId) section to ACCEPTANCE_CRITERIA.md"
            }
            Write-Log "WARN" "FR_AC_COVERAGE: $frId has no matching AC"
        }
    }

    Write-Log "INFO" "FR_AC_COVERAGE: $($frIds.Count) FRs, $($allAcRefs.Count) AC refs"
} else {
    if (-not $frContent) {
        Write-Log "WARN" "FR_AC_COVERAGE: FR.md is empty or missing"
    }
    if (-not $acContent) {
        Write-Log "WARN" "FR_AC_COVERAGE: ACCEPTANCE_CRITERIA.md is empty or missing"
    }
}

# --- CHECK 2: FR_BDD_COVERAGE ---
# Every @featureN tag in FR.md/AC.md should have a matching @featureN in .feature file
Write-Log "INFO" "Running FR_BDD_COVERAGE check..."

$featureFiles = Get-ChildItem -Path $TargetDir -Filter "*.feature" -ErrorAction SilentlyContinue
$featureContent = ""
if ($featureFiles) {
    $featureContent = Get-Content -Path $featureFiles[0].FullName -Raw -ErrorAction SilentlyContinue
}

if ($frContent -or $acContent) {
    # Collect @featureN tags from MD files
    $mdFeatureTags = @()

    if ($frContent) {
        $frTags = [regex]::Matches($frContent, '@feature(\d+)') | ForEach-Object { $_.Value }
        $mdFeatureTags += $frTags
    }
    if ($acContent) {
        $acTags = [regex]::Matches($acContent, '@feature(\d+)') | ForEach-Object { $_.Value }
        $mdFeatureTags += $acTags
    }

    $mdFeatureTags = $mdFeatureTags | Select-Object -Unique

    if ($mdFeatureTags.Count -gt 0) {
        if (-not $featureContent) {
            $findings += @{
                check = "FR_BDD_COVERAGE"
                category = "LOGIC_GAPS"
                severity = "WARNING"
                message = "No .feature file found, but $($mdFeatureTags.Count) @featureN tags exist in MD files"
                details = "Create .feature file with BDD scenarios tagged with: $($mdFeatureTags -join ', ')"
            }
        } else {
            $bddTags = [regex]::Matches($featureContent, '@feature(\d+)') | ForEach-Object { $_.Value } | Select-Object -Unique

            foreach ($tag in $mdFeatureTags) {
                if ($tag -notin $bddTags) {
                    $findings += @{
                        check = "FR_BDD_COVERAGE"
                        category = "LOGIC_GAPS"
                        severity = "WARNING"
                        message = "$tag in FR/AC has no matching BDD scenario"
                        details = "Add # $tag comment before a Scenario in .feature file"
                    }
                    Write-Log "WARN" "FR_BDD_COVERAGE: $tag not found in .feature"
                }
            }

            # Check orphan BDD tags (in .feature but not in MD)
            foreach ($tag in $bddTags) {
                if ($tag -notin $mdFeatureTags) {
                    $findings += @{
                        check = "FR_BDD_COVERAGE"
                        category = "INCONSISTENCY"
                        severity = "INFO"
                        message = "$tag in .feature has no matching FR/AC requirement"
                        details = "Add $tag to FR.md or ACCEPTANCE_CRITERIA.md header"
                    }
                    Write-Log "WARN" "FR_BDD_COVERAGE: orphan $tag in .feature"
                }
            }
        }
    }

    Write-Log "INFO" "FR_BDD_COVERAGE: $($mdFeatureTags.Count) MD tags checked"
}

# --- CHECK 3: REQUIREMENTS_TRACEABILITY ---
# REQUIREMENTS.md should reference all FR-N identifiers
Write-Log "INFO" "Running REQUIREMENTS_TRACEABILITY check..."

$reqContent = Get-FileContent "REQUIREMENTS.md"

if ($reqContent -and $frContent) {
    $frIds = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { "FR-$($_.Groups[1].Value)" }

    foreach ($frId in $frIds) {
        if ($reqContent -notmatch [regex]::Escape($frId)) {
            $findings += @{
                check = "REQUIREMENTS_TRACEABILITY"
                category = "LOGIC_GAPS"
                severity = "INFO"
                message = "$frId not referenced in REQUIREMENTS.md"
                details = "Add $frId to the traceability index in REQUIREMENTS.md"
            }
            Write-Log "WARN" "REQUIREMENTS_TRACEABILITY: $frId not in REQUIREMENTS.md"
        }
    }

    Write-Log "INFO" "REQUIREMENTS_TRACEABILITY: $($frIds.Count) FRs checked"
} else {
    if (-not $reqContent) {
        Write-Log "WARN" "REQUIREMENTS_TRACEABILITY: REQUIREMENTS.md is empty or missing"
    }
}

# --- CHECK 4: TASKS_FR_REFS ---
# TASKS.md should contain references to FR or NFR identifiers
Write-Log "INFO" "Running TASKS_FR_REFS check..."

$tasksContent = Get-FileContent "TASKS.md"

if ($tasksContent -and $frContent) {
    $frIds = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { "FR-$($_.Groups[1].Value)" }

    # Check if TASKS.md mentions any FR at all
    $tasksFrRefs = [regex]::Matches($tasksContent, 'FR-\d+') | ForEach-Object { $_.Value } | Select-Object -Unique

    $unreferencedFrs = @()
    foreach ($frId in $frIds) {
        if ($frId -notin $tasksFrRefs) {
            $unreferencedFrs += $frId
        }
    }

    if ($unreferencedFrs.Count -gt 0) {
        $findings += @{
            check = "TASKS_FR_REFS"
            category = "LOGIC_GAPS"
            severity = "INFO"
            message = "$($unreferencedFrs.Count) FR(s) not referenced in TASKS.md: $($unreferencedFrs -join ', ')"
            details = "Add _Requirements: $($unreferencedFrs -join ', ')_ to relevant tasks"
        }
        Write-Log "WARN" "TASKS_FR_REFS: $($unreferencedFrs.Count) FRs not referenced in TASKS.md"
    }

    Write-Log "INFO" "TASKS_FR_REFS: $($frIds.Count) FRs, $($tasksFrRefs.Count) refs in TASKS"
} else {
    if (-not $tasksContent) {
        Write-Log "WARN" "TASKS_FR_REFS: TASKS.md is empty or missing"
    }
}

# --- CHECK 5: OPEN_QUESTIONS ---
# Count unclosed checkboxes in RESEARCH.md
Write-Log "INFO" "Running OPEN_QUESTIONS check..."

$researchContent = Get-FileContent "RESEARCH.md"

if ($researchContent) {
    $researchLines = Get-FileLines "RESEARCH.md"
    $unclosed = @()
    $closed = 0

    foreach ($line in $researchLines) {
        if ($line -match '^\s*-\s*\[ \]\s*(.+)$') {
            $unclosed += $Matches[1].Trim()
        }
        if ($line -match '^\s*-\s*\[x\]\s*.+$') {
            $closed++
        }
    }

    if ($unclosed.Count -gt 0) {
        $findings += @{
            check = "OPEN_QUESTIONS"
            category = "RUDIMENTS"
            severity = "INFO"
            message = "$($unclosed.Count) unclosed open question(s) in RESEARCH.md"
            details = ($unclosed | ForEach-Object { "- [ ] $_" }) -join "`n"
        }
        Write-Log "WARN" "OPEN_QUESTIONS: $($unclosed.Count) unclosed, $closed closed"
    }

    Write-Log "INFO" "OPEN_QUESTIONS: $($unclosed.Count) unclosed, $closed closed"
} else {
    Write-Log "WARN" "OPEN_QUESTIONS: RESEARCH.md is empty or missing"
}

# --- CHECK 6: TERM_CONSISTENCY ---
# Extract PascalCase/camelCase identifiers across key files, find inconsistent variants
Write-Log "INFO" "Running TERM_CONSISTENCY check..."

$filesToCheck = @("FR.md", "DESIGN.md", "TASKS.md", "ACCEPTANCE_CRITERIA.md", "USE_CASES.md")
$termMap = @{}  # normalized -> @{ variants = @(); files = @{} }

foreach ($fileName in $filesToCheck) {
    $content = Get-FileContent $fileName
    if (-not $content) { continue }

    # Extract camelCase and PascalCase identifiers (2+ parts, min 4 chars)
    $identifiers = [regex]::Matches($content, '\b([a-z][a-zA-Z]{3,}[A-Z][a-zA-Z]*|[A-Z][a-z]+[A-Z][a-zA-Z]*)\b') | ForEach-Object { $_.Value }

    foreach ($id in $identifiers) {
        $normalized = $id.ToLower()

        if (-not $termMap.ContainsKey($normalized)) {
            $termMap[$normalized] = @{
                variants = @()
                files = @{}
            }
        }

        if ($id -notin $termMap[$normalized].variants) {
            $termMap[$normalized].variants += $id
        }

        if (-not $termMap[$normalized].files.ContainsKey($fileName)) {
            $termMap[$normalized].files[$fileName] = @()
        }
        if ($id -notin $termMap[$normalized].files[$fileName]) {
            $termMap[$normalized].files[$fileName] += $id
        }
    }
}

# Report terms with multiple casing variants across files
$inconsistentTerms = @()
foreach ($key in $termMap.Keys) {
    $entry = $termMap[$key]
    if ($entry.variants.Count -gt 1) {
        $inconsistentTerms += @{
            normalized = $key
            variants = $entry.variants
            files = $entry.files
        }
    }
}

if ($inconsistentTerms.Count -gt 0) {
    # Limit to top 10 most impactful
    $topTerms = $inconsistentTerms | Sort-Object { $_.files.Count } -Descending | Select-Object -First 10

    foreach ($term in $topTerms) {
        $variantsList = $term.variants -join ", "
        $filesList = ($term.files.Keys | Sort-Object) -join ", "
        $findings += @{
            check = "TERM_CONSISTENCY"
            category = "INCONSISTENCY"
            severity = "WARNING"
            message = "Term variants: $variantsList"
            details = "Found in: $filesList. Standardize to one form."
        }
        Write-Log "WARN" "TERM_CONSISTENCY: variants [$variantsList] in [$filesList]"
    }
}

Write-Log "INFO" "TERM_CONSISTENCY: $($inconsistentTerms.Count) inconsistent term(s)"

# --- CHECK 7: LINK_VALIDITY ---
# Check that FR/AC/NFR references are clickable markdown links, not plain text
Write-Log "INFO" "Running LINK_VALIDITY check..."

# Sub-check 7a: REQUIREMENTS.md should have clickable links for all FRs
$reqContent = Get-FileContent "REQUIREMENTS.md"
if ($reqContent -and $frContent) {
    $frIds = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { $_.Groups[1].Value }

    foreach ($frNum in $frIds) {
        $frId = "FR-$frNum"
        # Check if FR-N appears as a markdown link [FR-N...](FR.md#...)
        $linkPattern = "\[$frId[^\]]*\]\(FR\.md#[^)]+\)"
        if ($reqContent -notmatch $linkPattern) {
            # Check if it appears as plain text at all
            if ($reqContent -match "(?<!\[)$frId(?!\])") {
                $findings += @{
                    check = "LINK_VALIDITY"
                    category = "INCONSISTENCY"
                    severity = "WARNING"
                    message = "$frId in REQUIREMENTS.md is plain text, not a clickable link"
                    details = "Replace '$frId' with '[$frId](FR.md#fr-$frNum-...)' for cross-reference navigation"
                }
                Write-Log "WARN" "LINK_VALIDITY: $frId plain text in REQUIREMENTS.md"
            }
        }
    }

    Write-Log "INFO" "LINK_VALIDITY (REQUIREMENTS.md): $($frIds.Count) FRs checked"
}

# Sub-check 7b: TASKS.md should have clickable links for FR references
if ($tasksContent -and $frContent) {
    $frIds = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { $_.Groups[1].Value }

    foreach ($frNum in $frIds) {
        $frId = "FR-$frNum"
        # Find plain-text FR-N not inside a markdown link
        # Positive: FR-1 as standalone text
        # Negative: [FR-1](FR.md#...) or [FR-1: name](FR.md#...)
        $linkPattern = "\[$frId[^\]]*\]\([^)]+\)"
        $plainPattern = "(?<!\[)$frId(?![^\[]*\])"

        if ($tasksContent -match $plainPattern -and $tasksContent -notmatch $linkPattern) {
            $findings += @{
                check = "LINK_VALIDITY"
                category = "INCONSISTENCY"
                severity = "INFO"
                message = "$frId in TASKS.md is plain text, not a clickable link"
                details = "Use '[$frId](FR.md#fr-$frNum-...)' format for requirement references"
            }
            Write-Log "WARN" "LINK_VALIDITY: $frId plain text in TASKS.md"
        }
    }

    Write-Log "INFO" "LINK_VALIDITY (TASKS.md): FR refs checked"
}

# Sub-check 7c: FR.md should link to related ACs
if ($frContent -and $acContent) {
    $frNums = [regex]::Matches($frContent, '## FR-(\d+):') | ForEach-Object { $_.Groups[1].Value }

    foreach ($frNum in $frNums) {
        # Extract FR-N section content (up to next ## FR- or end)
        $sectionPattern = "## FR-${frNum}:.*?(?=## FR-\d+:|$)"
        $frSection = [regex]::Match($frContent, $sectionPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($frSection.Success) {
            $acLinkPattern = "\[AC-\d+[^\]]*\]\(ACCEPTANCE_CRITERIA\.md#[^)]+\)"
            if ($frSection.Value -notmatch $acLinkPattern) {
                $findings += @{
                    check = "LINK_VALIDITY"
                    category = "INCONSISTENCY"
                    severity = "INFO"
                    message = "FR-$frNum in FR.md has no clickable link to ACCEPTANCE_CRITERIA.md"
                    details = "Add '**AC:** [AC-N](ACCEPTANCE_CRITERIA.md#ac-N-fr-$frNum-...)' to FR-$frNum section"
                }
                Write-Log "WARN" "LINK_VALIDITY: FR-$frNum has no AC back-link"
            }
        }
    }

    Write-Log "INFO" "LINK_VALIDITY (FR.md): AC back-links checked"
}

# Sub-check 7d: ACCEPTANCE_CRITERIA.md should link back to FR
if ($acContent -and $frContent) {
    $acHeaders = [regex]::Matches($acContent, '## AC-(\d+)\s*\(FR-(\d+)\)')

    foreach ($acMatch in $acHeaders) {
        $acNum = $acMatch.Groups[1].Value
        $frNum = $acMatch.Groups[2].Value

        # Extract AC section content
        $sectionPattern = "## AC-${acNum}\s*\(FR-${frNum}\).*?(?=## AC-\d+|$)"
        $acSection = [regex]::Match($acContent, $sectionPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($acSection.Success) {
            $frLinkPattern = "\[FR-$frNum[^\]]*\]\(FR\.md#[^)]+\)"
            if ($acSection.Value -notmatch $frLinkPattern) {
                $findings += @{
                    check = "LINK_VALIDITY"
                    category = "INCONSISTENCY"
                    severity = "INFO"
                    message = "AC-$acNum (FR-$frNum) has no clickable link back to FR.md"
                    details = "Add '**FR:** [FR-$frNum](FR.md#fr-$frNum-...)' to AC-$acNum section"
                }
                Write-Log "WARN" "LINK_VALIDITY: AC-$acNum has no FR back-link"
            }
        }
    }

    Write-Log "INFO" "LINK_VALIDITY (ACCEPTANCE_CRITERIA.md): FR back-links checked"
}

Write-Log "INFO" "LINK_VALIDITY check complete"

# ===== Build result =====

# Count by category
$categoryCount = @{
    "ERRORS" = 0
    "LOGIC_GAPS" = 0
    "INCONSISTENCY" = 0
    "RUDIMENTS" = 0
    "FANTASIES" = 0
}

foreach ($f in $findings) {
    $cat = $f.category
    if ($categoryCount.ContainsKey($cat)) {
        $categoryCount[$cat]++
    }
}

$aiChecksPending = @(
    "ERRORS: Verify DESIGN.md component/method/file references exist in codebase"
    "ERRORS: Check items marked 'Need to add' or 'TODO' that may already exist"
    "ERRORS: Verify FILE_CHANGES.md - edit targets exist, create targets do not exist"
    "INCONSISTENCY: Compare domain-specific naming across all spec files"
    "FANTASIES: Verify API assumptions in RESEARCH.md have sources/proof"
    "FANTASIES: Check for untested claims presented as confirmed facts"
    "RUDIMENTS: Identify scope creep (client-side concerns in server spec, or vice versa)"
    "RUDIMENTS: Check for open questions in RESEARCH.md that are answered elsewhere in spec"
    "LOGIC_GAPS: If feature creates/modifies test data, check DESIGN.md has 'BDD Test Infrastructure' section with hooks/cleanup strategy"
)

$result = @{
    path = $Path
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    findings = $findings
    summary = @{
        total = $findings.Count
        by_category = $categoryCount
    }
    ai_checks_pending = $aiChecksPending
}

# ===== Output =====

if ($Format -eq "json") {
    $result | ConvertTo-Json -Depth 10
} else {
    $slug = Split-Path -Leaf $TargetDir
    Write-Host ""
    Write-Host "Spec Audit (Automated): $slug" -ForegroundColor Cyan
    Write-Host ("=" * 50)
    Write-Host ""

    $categories = @("ERRORS", "LOGIC_GAPS", "INCONSISTENCY", "RUDIMENTS", "FANTASIES")
    $categoryLabels = @{
        "ERRORS" = "ERRORS (Errors)"
        "LOGIC_GAPS" = "LOGIC GAPS (Logic Gaps)"
        "INCONSISTENCY" = "INCONSISTENCY (Inconsistency)"
        "RUDIMENTS" = "RUDIMENTS (Rudiments)"
        "FANTASIES" = "FANTASIES (Fantasies)"
    }

    foreach ($cat in $categories) {
        $catFindings = @($findings | Where-Object { $_.category -eq $cat })
        $count = $catFindings.Count

        if ($count -gt 0) {
            Write-Host "$($categoryLabels[$cat]) ($count):" -ForegroundColor Yellow
            foreach ($f in $catFindings) {
                $severityColor = switch ($f.severity) {
                    "WARNING" { "Yellow" }
                    "INFO" { "Cyan" }
                    "ERROR" { "Red" }
                    default { "White" }
                }
                Write-Host "  [$($f.severity)] $($f.check): $($f.message)" -ForegroundColor $severityColor
            }
            Write-Host ""
        }
    }

    if ($findings.Count -eq 0) {
        Write-Host "No automated findings." -ForegroundColor Green
        Write-Host ""
    }

    Write-Host "Summary: $($findings.Count) automated finding(s)" -ForegroundColor Cyan
    Write-Host "AI semantic checks pending: $($aiChecksPending.Count)" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Run the full audit via AI agent to complete ERRORS and FANTASIES categories." -ForegroundColor DarkGray
}

Write-Log "INFO" "Audit complete: $($findings.Count) findings"

exit 0
