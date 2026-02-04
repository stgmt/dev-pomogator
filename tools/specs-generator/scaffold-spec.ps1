<#
.SYNOPSIS
    Creates a new spec folder structure with all template files.

.DESCRIPTION
    Scaffolds a new .specs/{feature-slug}/ folder with 13 template files.
    All templates contain placeholders in {placeholder} format.

.PARAMETER Name
    Required. The feature slug in kebab-case (e.g., "hook-worklog-checker").

.PARAMETER Domain
    Optional. Domain code for feature file naming (e.g., "INF", "PAY", "AUTH").

.PARAMETER Force
    Optional. Overwrite existing folder if it exists.

.PARAMETER Verbose
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\scaffold-spec.ps1 -Name "hook-worklog-checker"

.EXAMPLE
    .\scaffold-spec.ps1 -Name "hook-worklog-checker" -Domain "INF" -Force
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $false)]
    [string]$Domain = "",

    [Parameter(Mandatory = $false)]
    [switch]$Force,

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutput,

    [Parameter(Mandatory = $false)]
    [string]$LogFile = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("json", "text")]
    [string]$Format = "json"
)

$ErrorActionPreference = "Stop"

# Determine script and repo paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Go up 4 levels: specs-generator -> tools -> specs-workflow -> extensions -> repo root
$RepoRoot = (Get-Item $ScriptDir).Parent.Parent.Parent.Parent.FullName
$TemplatesDir = Join-Path $ScriptDir "templates"
$LogsDir = Join-Path $ScriptDir "logs"
$SpecsDir = Join-Path $RepoRoot ".specs"
$TargetDir = Join-Path $SpecsDir $Name

# Setup logging
if (-not $LogFile) {
    $LogFile = Join-Path $LogsDir "specs-generator-$(Get-Date -Format 'yyyy-MM-dd').log"
}

function Write-Log {
    param([string]$Level, [string]$Message)
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    # Ensure logs directory exists
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

function Output-Result {
    param([hashtable]$Result)
    
    if ($Format -eq "json") {
        $Result | ConvertTo-Json -Depth 10
    } else {
        if ($Result.success) {
            Write-Host "SUCCESS: Created spec folder at $($Result.path)" -ForegroundColor Green
            Write-Host "Files created:" -ForegroundColor Cyan
            $Result.created_files | ForEach-Object { Write-Host "  - $_" }
            Write-Host "`nNext step: $($Result.next_step)" -ForegroundColor Yellow
        } else {
            Write-Host "ERROR: $($Result.error)" -ForegroundColor Red
        }
    }
}

# Validate Name format (kebab-case)
if ($Name -notmatch "^[a-z0-9]+(-[a-z0-9]+)*$") {
    $result = @{
        success = $false
        error = "Invalid name format. Use kebab-case (e.g., 'hook-worklog-checker')"
    }
    Output-Result $result
    exit 2
}

Write-Log "INFO" "Creating spec folder: $TargetDir"

# Check if folder exists
if (Test-Path $TargetDir) {
    if ($Force) {
        Write-Log "WARN" "Folder exists, removing due to -Force flag"
        Remove-Item -Path $TargetDir -Recurse -Force
    } else {
        $result = @{
            success = $false
            error = "Folder already exists: $TargetDir. Use -Force to overwrite."
        }
        Output-Result $result
        exit 1
    }
}

# Create target directory
try {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Write-Log "INFO" "Created directory: $TargetDir"
} catch {
    $result = @{
        success = $false
        error = "Failed to create directory: $_"
    }
    Output-Result $result
    exit 1
}

# Template file mappings
$templateMappings = @{
    "USER_STORIES.md.template" = "USER_STORIES.md"
    "USE_CASES.md.template" = "USE_CASES.md"
    "RESEARCH.md.template" = "RESEARCH.md"
    "REQUIREMENTS.md.template" = "REQUIREMENTS.md"
    "FR.md.template" = "FR.md"
    "NFR.md.template" = "NFR.md"
    "ACCEPTANCE_CRITERIA.md.template" = "ACCEPTANCE_CRITERIA.md"
    "DESIGN.md.template" = "DESIGN.md"
    "TASKS.md.template" = "TASKS.md"
    "FILE_CHANGES.md.template" = "FILE_CHANGES.md"
    "README.md.template" = "README.md"
    "feature.template" = "$Name.feature"
    "SCHEMA.md.template" = "${Name}_SCHEMA.md"
}

$createdFiles = @()

foreach ($mapping in $templateMappings.GetEnumerator()) {
    $templatePath = Join-Path $TemplatesDir $mapping.Key
    $targetPath = Join-Path $TargetDir $mapping.Value
    
    if (Test-Path $templatePath) {
        $content = Get-Content -Path $templatePath -Raw
        
        # Replace feature name placeholder in README template
        if ($mapping.Key -eq "README.md.template") {
            $featureName = ($Name -split "-" | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join " "
            $content = $content -replace "\{Feature Name\}", $featureName
        }
        
        # Replace DOMAIN placeholder if provided
        if ($Domain -and ($mapping.Key -eq "feature.template")) {
            $content = $content -replace "\{DOMAIN\}", $Domain
        }
        
        Set-Content -Path $targetPath -Value $content -NoNewline
        Write-Log "INFO" "Copying template: $($mapping.Key) -> $($mapping.Value)"
        $createdFiles += $mapping.Value
    } else {
        Write-Log "WARN" "Template not found: $($mapping.Key)"
    }
}

Write-Log "INFO" "Created $($createdFiles.Count) files in $TargetDir"

$result = @{
    success = $true
    path = ".specs/$Name"
    created_files = $createdFiles
    next_step = "Fill USER_STORIES.md first"
}

Output-Result $result
exit 0

