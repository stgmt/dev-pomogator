<#
.SYNOPSIS
    Analyzes existing .feature files across the project to extract patterns for reuse.

.DESCRIPTION
    Scans tests/features/** and .specs/** for .feature files and produces a structured report:
    - Step Dictionary: all unique Given/When/Then steps with frequency
    - Background Patterns: reused Background step combinations
    - Naming Patterns: domain codes, distribution, next available number
    - Data Table Patterns: which columns are used with which steps
    - Setup vs Table Patterns: what goes in Given setup vs data table
    - Assertion Patterns: Then step formulations grouped by type
    - Candidate Matching: find similar features by slug/domain/query

    This is a report-only tool (exit code always 0).

.PARAMETER FeatureSlug
    Optional. Filter candidates by feature slug match.

.PARAMETER DomainCode
    Optional. Filter candidates by domain code (e.g., CORE, PLUGIN).

.PARAMETER Query
    Optional. Free-text search in Feature: lines.

.PARAMETER VerboseOutput
    Optional. Show detailed log output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\analyze-features.ps1 -Format text

.EXAMPLE
    .\analyze-features.ps1 -FeatureSlug "blind-receiving" -Format text

.EXAMPLE
    .\analyze-features.ps1 -DomainCode "PLUGIN" -Format json
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$FeatureSlug = "",

    [Parameter(Mandatory = $false)]
    [string]$DomainCode = "",

    [Parameter(Mandatory = $false)]
    [string]$Query = "",

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutput,

    [Parameter(Mandatory = $false)]
    [string]$LogFile = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("json", "text")]
    [string]$Format = "json"
)

$ErrorActionPreference = "Stop"

# ===== Boilerplate =====

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

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Find-RepoRoot -StartDir $ScriptDir
if (-not $RepoRoot) {
    Write-Error "Repository root not found from $ScriptDir"
    exit 1
}
$LogsDir = Join-Path $ScriptDir "logs"

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

Write-Log "INFO" "Analyzing feature files..."

# ===== Phase 1: Discovery =====

$searchPaths = @(
    (Join-Path (Join-Path $RepoRoot "tests") "features"),
    (Join-Path $RepoRoot ".specs")
)

$featureFiles = @()
foreach ($searchPath in $searchPaths) {
    if (Test-Path $searchPath) {
        $found = Get-ChildItem -Path $searchPath -Filter "*.feature" -Recurse -ErrorAction SilentlyContinue
        foreach ($f in $found) {
            $relativePath = $f.FullName.Substring($RepoRoot.Length + 1) -replace '\\', '/'
            $type = "production"
            if ($relativePath -match '^\.specs/') { $type = "spec" }
            if ($relativePath -match 'fixtures/') { $type = "fixture" }
            $featureFiles += @{
                fullPath = $f.FullName
                relativePath = $relativePath
                fileName = $f.Name
                type = $type
            }
        }
    }
}

Write-Log "INFO" "Found $($featureFiles.Count) .feature files"

# ===== Phase 2: Per-file Analysis =====

function Analyze-FeatureFile {
    param([hashtable]$FileInfo)

    $lines = Get-Content -Path $FileInfo.fullPath -ErrorAction SilentlyContinue
    if (-not $lines) { return $null }

    $result = @{
        path = $FileInfo.relativePath
        fileName = $FileInfo.fileName
        type = $FileInfo.type
        domainCode = ""
        domainPrefix = ""
        domainNumber = 0
        featureSlug = ""
        featureLine = ""
        description = ""
        hasBackground = $false
        background = @()
        scenarioCount = 0
        scenarioOutlineCount = 0
        scenarios = @()
        steps = @{ given = @(); when = @(); then = @() }
        allSteps = @()
        tags = @()
        featureTags = @()
        implementedAnnotations = @()
        hasSectionDividers = $false
        tables = @()
    }

    # Extract domain code and slug from filename
    if ($FileInfo.fileName -match '^([A-Z]+)(\d+)_(.+)\.feature$') {
        $result.domainPrefix = $Matches[1]
        $result.domainNumber = [int]$Matches[2]
        $result.domainCode = "$($Matches[1])$($Matches[2].PadLeft(3, '0'))"
        $result.featureSlug = $Matches[3]
    } elseif ($FileInfo.fileName -match '^(.+)\.feature$') {
        $result.featureSlug = $Matches[1]
    }

    $inBackground = $false
    $currentStepType = ""
    $lastStep = ""
    $lineIndex = 0
    $scenarioNames = @()

    foreach ($line in $lines) {
        $lineIndex++

        # Feature line
        if ($line -match '^\s*Feature:\s*(.+)$') {
            $result.featureLine = $Matches[1].Trim()
        }

        # Description (As a / I want / So that)
        if ($line -match '^\s+(As a|I want|So that)\s') {
            $result.description += $line.Trim() + "`n"
        }

        # Background
        if ($line -match '^\s*Background:') {
            $inBackground = $true
            $result.hasBackground = $true
            continue
        }

        # Scenario / Scenario Outline
        if ($line -match '^\s*(Scenario Outline|Scenario):\s*(.+)$') {
            $inBackground = $false
            $scenarioType = $Matches[1]
            $scenarioName = $Matches[2].Trim()
            $scenarioNames += $scenarioName
            if ($scenarioType -eq "Scenario Outline") {
                $result.scenarioOutlineCount++
            } else {
                $result.scenarioCount++
            }
            continue
        }

        # Steps
        if ($line -match '^\s+(Given|When|Then|And|But)\s+(.+)$') {
            $keyword = $Matches[1]
            $stepText = $Matches[2].Trim()

            if ($keyword -eq "And" -or $keyword -eq "But") {
                # Inherit type from previous step
            } else {
                $currentStepType = $keyword.ToLower()
            }

            $fullStep = "$keyword $stepText"
            $lastStep = $fullStep

            if ($inBackground) {
                $result.background += $fullStep
            }

            if ($currentStepType -and $result.steps.ContainsKey($currentStepType)) {
                $result.steps[$currentStepType] += $fullStep
            }
            $result.allSteps += @{
                keyword = $keyword
                type = $currentStepType
                text = $stepText
                full = $fullStep
                line = $lineIndex
                inBackground = $inBackground
            }
            continue
        }

        # Data table header (first | row after a step)
        if ($line -match '^\s*\|(.+)\|$' -and $lastStep) {
            $cells = ($Matches[1] -split '\|') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
            # Check if this is a header row (first table row after step)
            $isHeader = $true
            foreach ($cell in $cells) {
                if ($cell -match '^\d+$' -or $cell -match '^"') {
                    $isHeader = $false
                    break
                }
            }
            if ($isHeader -and $cells.Count -gt 0) {
                $result.tables += @{
                    step = $lastStep
                    columns = $cells
                    line = $lineIndex
                }
                $lastStep = ""  # Reset to avoid capturing data rows as new tables
            }
            continue
        }

        # Tags
        if ($line -match '#\s*(@feature\d+)') {
            $tagMatches = [regex]::Matches($line, '@feature\d+')
            foreach ($m in $tagMatches) {
                $result.featureTags += $m.Value
            }
        }
        if ($line -match '#\s*@implemented:\s*(.+)$') {
            $result.implementedAnnotations += $Matches[1].Trim()
        }
        if ($line -match '^\s*@([a-z][-a-z]*)') {
            $result.tags += "@$($Matches[1])"
        }

        # Section dividers
        if ($line -match '^\s*#\s*={5,}') {
            $result.hasSectionDividers = $true
        }

        # Reset lastStep on non-table, non-step lines
        if ($line -notmatch '^\s*\|' -and $line -notmatch '^\s+(Given|When|Then|And|But)\s') {
            $lastStep = ""
        }
    }

    $result.scenarios = $scenarioNames
    $result.description = $result.description.Trim()

    return $result
}

$analyzedFeatures = @()
foreach ($ff in $featureFiles) {
    $analysis = Analyze-FeatureFile -FileInfo $ff
    if ($analysis) {
        $analyzedFeatures += $analysis
    }
}

Write-Log "INFO" "Analyzed $($analyzedFeatures.Count) feature files"

# ===== Phase 3: Aggregation =====

# 3.1 Step Dictionary
$stepDict = @{ given = @{}; when = @{}; then = @{} }

foreach ($feat in $analyzedFeatures) {
    foreach ($stepType in @("given", "when", "then")) {
        foreach ($step in $feat.steps[$stepType]) {
            if ($stepDict[$stepType].ContainsKey($step)) {
                $stepDict[$stepType][$step].count++
                if ($feat.relativePath -notin $stepDict[$stepType][$step].files) {
                    $stepDict[$stepType][$step].files += $feat.relativePath
                }
            } else {
                $stepDict[$stepType][$step] = @{
                    step = $step
                    count = 1
                    files = @($feat.relativePath)
                }
            }
        }
    }
}

# Sort by frequency
$stepDictSorted = @{}
foreach ($stepType in @("given", "when", "then")) {
    $stepDictSorted[$stepType] = @($stepDict[$stepType].Values | Sort-Object { $_.count } -Descending)
}

# 3.2 Background Patterns
$bgPatterns = @{}
foreach ($feat in $analyzedFeatures) {
    if ($feat.hasBackground -and $feat.background.Count -gt 0) {
        $bgKey = ($feat.background -join " | ")
        if ($bgPatterns.ContainsKey($bgKey)) {
            $bgPatterns[$bgKey].count++
            $bgPatterns[$bgKey].files += $feat.relativePath
        } else {
            $bgPatterns[$bgKey] = @{
                steps = $feat.background
                count = 1
                files = @($feat.relativePath)
            }
        }
    }
}
$bgPatternsSorted = @($bgPatterns.Values | Sort-Object { $_.count } -Descending)

# 3.3 Naming Patterns
$domainStats = @{}
$noDomainCount = 0
foreach ($feat in $analyzedFeatures) {
    if ($feat.domainPrefix) {
        if (-not $domainStats.ContainsKey($feat.domainPrefix)) {
            $domainStats[$feat.domainPrefix] = @{
                count = 0
                maxNumber = 0
                files = @()
                numbers = @()
            }
        }
        $domainStats[$feat.domainPrefix].count++
        $domainStats[$feat.domainPrefix].files += $feat.relativePath
        $domainStats[$feat.domainPrefix].numbers += $feat.domainNumber
        if ($feat.domainNumber -gt $domainStats[$feat.domainPrefix].maxNumber) {
            $domainStats[$feat.domainPrefix].maxNumber = $feat.domainNumber
        }
    } else {
        $noDomainCount++
    }
}

$nextDomainNumbers = @{}
foreach ($prefix in $domainStats.Keys) {
    $nextNum = $domainStats[$prefix].maxNumber + 1
    $nextDomainNumbers[$prefix] = "$prefix$($nextNum.ToString().PadLeft(3, '0'))"
}

# Check for duplicate domain numbers
$duplicateDomains = @()
foreach ($prefix in $domainStats.Keys) {
    $nums = $domainStats[$prefix].numbers | Sort-Object
    $grouped = $nums | Group-Object
    foreach ($g in $grouped) {
        if ($g.Count -gt 1) {
            $dupFiles = @($analyzedFeatures | Where-Object { $_.domainPrefix -eq $prefix -and $_.domainNumber -eq [int]$g.Name } | ForEach-Object { $_.relativePath })
            $duplicateDomains += @{
                code = "$prefix$([int]$g.Name)"
                count = $g.Count
                files = $dupFiles
            }
        }
    }
}

# 3.4 Data Table Patterns
$tablePatterns = @{}
foreach ($feat in $analyzedFeatures) {
    foreach ($tbl in $feat.tables) {
        $colKey = ($tbl.columns -join " | ")
        $patternKey = "$($tbl.step) >> $colKey"
        if ($tablePatterns.ContainsKey($patternKey)) {
            $tablePatterns[$patternKey].count++
            if ($feat.relativePath -notin $tablePatterns[$patternKey].files) {
                $tablePatterns[$patternKey].files += $feat.relativePath
            }
        } else {
            $tablePatterns[$patternKey] = @{
                step = $tbl.step
                columns = $tbl.columns
                count = 1
                files = @($feat.relativePath)
            }
        }
    }
}
$tablePatternsSorted = @($tablePatterns.Values | Sort-Object { $_.count } -Descending)

# 3.5 Setup vs Table Patterns
# Identify Given steps that setup entities (rather than passing data in tables)
$setupSteps = @()
$givenEntityPattern = '(Given|And)\s+(Zoho\s+\w+|a\s+\w+\s+\w+|the\s+\w+)\s+(exists|is\s+\w+|has\s+\w+)'

foreach ($feat in $analyzedFeatures) {
    foreach ($step in $feat.allSteps) {
        if ($step.type -eq "given" -and $step.full -match $givenEntityPattern) {
            $setupSteps += @{
                step = $step.full
                file = $feat.relativePath
            }
        }
    }
}

# Group setup steps
$setupStepGroups = @{}
foreach ($ss in $setupSteps) {
    if ($setupStepGroups.ContainsKey($ss.step)) {
        $setupStepGroups[$ss.step].count++
        if ($ss.file -notin $setupStepGroups[$ss.step].files) {
            $setupStepGroups[$ss.step].files += $ss.file
        }
    } else {
        $setupStepGroups[$ss.step] = @{
            step = $ss.step
            count = 1
            files = @($ss.file)
        }
    }
}
$setupStepsSorted = @($setupStepGroups.Values | Sort-Object { $_.count } -Descending)

# Identify When steps that do NOT have tables (tableless actions)
$tablelessWhenSteps = @{}
foreach ($feat in $analyzedFeatures) {
    $tableSteps = @($feat.tables | ForEach-Object { $_.step })
    foreach ($step in $feat.allSteps) {
        if ($step.type -eq "when" -and $step.keyword -eq "When") {
            $hasTable = $step.full -in $tableSteps
            if (-not $hasTable) {
                $key = $step.full
                if ($tablelessWhenSteps.ContainsKey($key)) {
                    $tablelessWhenSteps[$key].count++
                    if ($feat.relativePath -notin $tablelessWhenSteps[$key].files) {
                        $tablelessWhenSteps[$key].files += $feat.relativePath
                    }
                } else {
                    $tablelessWhenSteps[$key] = @{
                        step = $key
                        count = 1
                        files = @($feat.relativePath)
                    }
                }
            }
        }
    }
}
$tablelessWhenSorted = @($tablelessWhenSteps.Values | Sort-Object { $_.count } -Descending)

# 3.6 Assertion Patterns
$assertionGroups = @{
    status = @{}
    error = @{}
    data = @{}
    contains = @{}
    other = @{}
}

foreach ($feat in $analyzedFeatures) {
    foreach ($step in $feat.steps["then"]) {
        $group = "other"
        if ($step -match 'response\s+status\s+is|status\s+(is|should be)\s+\d') {
            $group = "status"
        } elseif ($step -match 'contains?\s+error|error\s+(message|response)') {
            $group = "error"
        } elseif ($step -match 'contains?\s+(serial|batch|auto-created|data|numbers)') {
            $group = "contains"
        } elseif ($step -match 'should\s+(exist|contain|be|have|not)') {
            $group = "data"
        }

        if ($assertionGroups[$group].ContainsKey($step)) {
            $assertionGroups[$group][$step].count++
            if ($feat.relativePath -notin $assertionGroups[$group][$step].files) {
                $assertionGroups[$group][$step].files += $feat.relativePath
            }
        } else {
            $assertionGroups[$group][$step] = @{
                step = $step
                count = 1
                files = @($feat.relativePath)
            }
        }
    }
}

$assertionPatterns = @{}
foreach ($group in $assertionGroups.Keys) {
    $assertionPatterns[$group] = @($assertionGroups[$group].Values | Sort-Object { $_.count } -Descending)
}

# 3.7 Tag Patterns
$featureTagCount = 0
$featureTagFiles = 0
$implementedCount = 0
$implementedFiles = 0
$dividerFiles = 0

foreach ($feat in $analyzedFeatures) {
    if ($feat.featureTags.Count -gt 0) {
        $featureTagCount += $feat.featureTags.Count
        $featureTagFiles++
    }
    if ($feat.implementedAnnotations.Count -gt 0) {
        $implementedCount += $feat.implementedAnnotations.Count
        $implementedFiles++
    }
    if ($feat.hasSectionDividers) {
        $dividerFiles++
    }
}

# ===== Phase 4: Candidate Matching =====

$candidates = @()
if ($FeatureSlug -or $DomainCode -or $Query) {
    foreach ($feat in $analyzedFeatures) {
        $score = 0
        $reasons = @()

        # Domain code match
        if ($DomainCode -and $feat.domainPrefix -eq $DomainCode.ToUpper()) {
            $score += 3
            $reasons += "Domain code match: $($feat.domainCode)"
        }

        # Slug match
        if ($FeatureSlug) {
            $slugLower = $FeatureSlug.ToLower()
            if ($feat.featureSlug -and $feat.featureSlug.ToLower() -like "*$slugLower*") {
                $score += 2
                $reasons += "Slug match: $($feat.featureSlug)"
            }
        }

        # Query match in Feature: line
        if ($Query) {
            $queryLower = $Query.ToLower()
            if ($feat.featureLine -and $feat.featureLine.ToLower() -like "*$queryLower*") {
                $score += 1
                $reasons += "Feature line match: $($feat.featureLine)"
            }
        }

        if ($score -gt 0) {
            $candidates += @{
                path = $feat.relativePath
                score = $score
                reasons = $reasons
                background = $feat.background
                scenarioCount = $feat.scenarioCount + $feat.scenarioOutlineCount
                tables = $feat.tables
                featureLine = $feat.featureLine
            }
        }
    }

    $candidates = @($candidates | Sort-Object { $_.score } -Descending)
    Write-Log "INFO" "Found $($candidates.Count) candidates"
}

# ===== Phase 5: Build Result =====

$result = @{
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    totalFeatures = $analyzedFeatures.Count
    searchPaths = @($searchPaths | ForEach-Object { $_.Substring($RepoRoot.Length + 1) -replace '\\', '/' })
    distribution = @{
        production = @($analyzedFeatures | Where-Object { $_.type -eq "production" }).Count
        spec = @($analyzedFeatures | Where-Object { $_.type -eq "spec" }).Count
        fixture = @($analyzedFeatures | Where-Object { $_.type -eq "fixture" }).Count
    }
    features = @($analyzedFeatures | ForEach-Object {
        @{
            path = $_.relativePath
            type = $_.type
            domainCode = $_.domainCode
            featureSlug = $_.featureSlug
            featureLine = $_.featureLine
            hasBackground = $_.hasBackground
            background = $_.background
            scenarioCount = $_.scenarioCount
            scenarioOutlineCount = $_.scenarioOutlineCount
            tableCount = $_.tables.Count
        }
    })
    stepDictionary = @{
        given = @($stepDictSorted["given"] | Select-Object -First 20)
        when = @($stepDictSorted["when"] | Select-Object -First 20)
        then = @($stepDictSorted["then"] | Select-Object -First 20)
    }
    backgroundPatterns = $bgPatternsSorted
    namingPatterns = @{
        domains = $domainStats.Keys | ForEach-Object {
            @{
                prefix = $_
                count = $domainStats[$_].count
                maxNumber = $domainStats[$_].maxNumber
                nextAvailable = $nextDomainNumbers[$_]
            }
        }
        noDomainCode = $noDomainCount
        duplicates = $duplicateDomains
    }
    tablePatterns = @($tablePatternsSorted | Select-Object -First 20)
    setupPatterns = @{
        entitySetupSteps = @($setupStepsSorted | Select-Object -First 15)
        tablelessWhenSteps = @($tablelessWhenSorted | Select-Object -First 15)
    }
    assertionPatterns = @{
        status = @($assertionPatterns["status"] | Select-Object -First 10)
        error = @($assertionPatterns["error"] | Select-Object -First 10)
        contains = @($assertionPatterns["contains"] | Select-Object -First 10)
        data = @($assertionPatterns["data"] | Select-Object -First 10)
        other = @($assertionPatterns["other"] | Select-Object -First 10)
    }
    tagPatterns = @{
        featureTags = @{ total = $featureTagCount; filesUsing = $featureTagFiles }
        implementedAnnotations = @{ total = $implementedCount; filesUsing = $implementedFiles }
        sectionDividers = @{ filesUsing = $dividerFiles }
    }
    candidates = $candidates
    recommendations = @{
        suggestedBackground = if ($bgPatternsSorted.Count -gt 0) { $bgPatternsSorted[0].steps } else { @() }
        nextDomainNumbers = $nextDomainNumbers
        duplicateDomainWarnings = $duplicateDomains
    }
}

# ===== Output =====

if ($Format -eq "json") {
    $result | ConvertTo-Json -Depth 10
} else {
    Write-Host ""
    Write-Host "Feature Analysis Report" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    Write-Host ""
    Write-Host "Discovered $($analyzedFeatures.Count) .feature files" -ForegroundColor Green
    Write-Host "  Production: $($result.distribution.production)  |  Spec: $($result.distribution.spec)  |  Fixture: $($result.distribution.fixture)"
    Write-Host ""

    # Naming Patterns
    Write-Host "Naming Patterns:" -ForegroundColor Cyan
    foreach ($prefix in ($domainStats.Keys | Sort-Object)) {
        $ds = $domainStats[$prefix]
        Write-Host "  $($prefix): $($ds.count) files ($($prefix)001..$($prefix)$($ds.maxNumber.ToString().PadLeft(3, '0')))  -> next: $($nextDomainNumbers[$prefix])" -ForegroundColor White
    }
    if ($noDomainCount -gt 0) {
        Write-Host "  No domain code: $noDomainCount files" -ForegroundColor DarkGray
    }
    if ($duplicateDomains.Count -gt 0) {
        Write-Host ""
        Write-Host "  DUPLICATE domain numbers:" -ForegroundColor Yellow
        foreach ($dup in $duplicateDomains) {
            Write-Host "    $($dup.code): $($dup.files -join ', ')" -ForegroundColor Yellow
        }
    }
    Write-Host ""

    # Background Patterns
    Write-Host "Background Patterns:" -ForegroundColor Cyan
    $bgIndex = 0
    foreach ($bg in $bgPatternsSorted) {
        if ($bgIndex -ge 5) { break }
        Write-Host "  [$($bg.count) files] $($bg.steps -join ' + ')" -ForegroundColor White
        $bgIndex++
    }
    if ($bgPatternsSorted.Count -eq 0) {
        Write-Host "  (none found)" -ForegroundColor DarkGray
    }
    Write-Host ""

    # Step Dictionary
    foreach ($stepType in @("given", "when", "then")) {
        $steps = $stepDictSorted[$stepType]
        Write-Host "Step Dictionary - $($stepType.ToUpper()) (top 10):" -ForegroundColor Cyan
        $idx = 0
        foreach ($s in $steps) {
            if ($idx -ge 10) { break }
            Write-Host "  [$($s.count)] $($s.step)" -ForegroundColor White
            $idx++
        }
        if ($steps.Count -eq 0) {
            Write-Host "  (none)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    # Data Table Patterns
    Write-Host "Data Table Patterns (step -> columns):" -ForegroundColor Cyan
    $tblIdx = 0
    foreach ($tp in $tablePatternsSorted) {
        if ($tblIdx -ge 10) { break }
        Write-Host "  [$($tp.count)] $($tp.step)" -ForegroundColor White
        Write-Host "        columns: $($tp.columns -join ' | ')" -ForegroundColor DarkGray
        $tblIdx++
    }
    if ($tablePatternsSorted.Count -eq 0) {
        Write-Host "  (no data tables found)" -ForegroundColor DarkGray
    }
    Write-Host ""

    # Setup vs Table
    Write-Host "Entity Setup Steps (Given, NOT in table):" -ForegroundColor Cyan
    $ssIdx = 0
    foreach ($ss in $setupStepsSorted) {
        if ($ssIdx -ge 10) { break }
        Write-Host "  [$($ss.count)] $($ss.step)" -ForegroundColor White
        $ssIdx++
    }
    Write-Host ""

    Write-Host "Tableless When Steps (action WITHOUT data table):" -ForegroundColor Cyan
    $twIdx = 0
    foreach ($tw in $tablelessWhenSorted) {
        if ($twIdx -ge 10) { break }
        Write-Host "  [$($tw.count)] $($tw.step)" -ForegroundColor White
        $twIdx++
    }
    Write-Host ""

    # Assertion Patterns
    Write-Host "Assertion Patterns:" -ForegroundColor Cyan
    foreach ($group in @("status", "error", "contains", "data")) {
        $items = $assertionPatterns[$group]
        if ($items.Count -gt 0) {
            Write-Host "  $($group.ToUpper()):" -ForegroundColor Yellow
            $aIdx = 0
            foreach ($a in $items) {
                if ($aIdx -ge 5) { break }
                Write-Host "    [$($a.count)] $($a.step)" -ForegroundColor White
                $aIdx++
            }
        }
    }
    Write-Host ""

    # Tag Patterns
    Write-Host "Tag Patterns:" -ForegroundColor Cyan
    Write-Host "  # @featureN: $featureTagFiles files, $featureTagCount tags" -ForegroundColor White
    Write-Host "  @implemented: $implementedFiles files, $implementedCount annotations" -ForegroundColor White
    Write-Host "  Section dividers: $dividerFiles files" -ForegroundColor White
    Write-Host ""

    # Candidates
    if ($candidates.Count -gt 0) {
        $filterDesc = @()
        if ($FeatureSlug) { $filterDesc += "slug='$FeatureSlug'" }
        if ($DomainCode) { $filterDesc += "domain='$DomainCode'" }
        if ($Query) { $filterDesc += "query='$Query'" }
        Write-Host "Candidates matching $($filterDesc -join ', '):" -ForegroundColor Cyan
        foreach ($c in $candidates) {
            Write-Host "  [Score: $($c.score)] $($c.path)" -ForegroundColor Green
            Write-Host "    Feature: $($c.featureLine)" -ForegroundColor White
            Write-Host "    Scenarios: $($c.scenarioCount)  |  Tables: $($c.tables.Count)  |  Background: $(if ($c.background.Count -gt 0) { 'yes' } else { 'no' })" -ForegroundColor DarkGray
            if ($c.background.Count -gt 0) {
                Write-Host "    Background steps:" -ForegroundColor DarkGray
                foreach ($bs in $c.background) {
                    Write-Host "      $bs" -ForegroundColor DarkGray
                }
            }
            if ($c.tables.Count -gt 0) {
                Write-Host "    Table patterns:" -ForegroundColor DarkGray
                foreach ($t in $c.tables) {
                    Write-Host "      $($t.step) -> [$($t.columns -join ' | ')]" -ForegroundColor DarkGray
                }
            }
        }
        Write-Host ""
    }

    # Recommendations
    Write-Host "Recommendations:" -ForegroundColor Magenta
    if ($bgPatternsSorted.Count -gt 0) {
        Write-Host "  Suggested Background:" -ForegroundColor White
        foreach ($bs in $bgPatternsSorted[0].steps) {
            Write-Host "    $bs" -ForegroundColor Green
        }
    }
    foreach ($prefix in ($nextDomainNumbers.Keys | Sort-Object)) {
        Write-Host "  Next $($prefix) number: $($nextDomainNumbers[$prefix])" -ForegroundColor White
    }
    if ($duplicateDomains.Count -gt 0) {
        Write-Host "  WARNING: Duplicate domain numbers exist (see above)" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Log "INFO" "Analysis complete: $($analyzedFeatures.Count) features"

exit 0
