<#
.SYNOPSIS
    Fills placeholders in a spec file.

.DESCRIPTION
    Replaces {placeholder} patterns in a spec file with provided values.
    Can also list all placeholders in a file.

.PARAMETER File
    Required. Path to the spec file (e.g., ".specs/hook-worklog-checker/USER_STORIES.md").

.PARAMETER Values
    Optional. JSON string with placeholder values (e.g., '{"роль": "разработчик"}').

.PARAMETER ListPlaceholders
    Optional. List all placeholders in the file without replacing.

.PARAMETER Verbose
    Optional. Show detailed output.

.PARAMETER LogFile
    Optional. Custom path to log file.

.PARAMETER Format
    Optional. Output format: "json" or "text". Default: "json".

.EXAMPLE
    .\fill-template.ps1 -File ".specs/hook-worklog-checker/USER_STORIES.md" -ListPlaceholders

.EXAMPLE
    .\fill-template.ps1 -File ".specs/hook-worklog-checker/USER_STORIES.md" -Values '{"роль": "разработчик"}'
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$File,

    [Parameter(Mandatory = $false)]
    [string]$Values = "",

    [Parameter(Mandatory = $false)]
    [switch]$ListPlaceholders,

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
# Go up 2 levels: specs-generator -> tools -> repo root
$RepoRoot = (Get-Item $ScriptDir).Parent.Parent.FullName
$LogsDir = Join-Path $ScriptDir "logs"

# Resolve path
if (-not [System.IO.Path]::IsPathRooted($File)) {
    $FilePath = Join-Path $RepoRoot $File
} else {
    $FilePath = $File
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

# Check if file exists
if (-not (Test-Path $FilePath)) {
    $result = @{
        error = "File not found: $File"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: File not found: $File" -ForegroundColor Red
    }
    exit 1
}

$content = Get-Content -Path $FilePath -Raw
$lines = Get-Content -Path $FilePath

# Find all placeholders
function Get-Placeholders {
    param([string]$Content, [string[]]$Lines)
    
    $placeholders = @()
    $lineNum = 0
    
    foreach ($line in $Lines) {
        $lineNum++
        $matches = [regex]::Matches($line, '\{([^}]+)\}')
        foreach ($match in $matches) {
            $name = $match.Value
            # Skip JSON-like patterns
            if ($name -match '^\{[\s\S]*:[\s\S]*\}$') { continue }
            if ($name -in @('{', '}', '{}')) { continue }
            
            $existing = $placeholders | Where-Object { $_.name -eq $name }
            if ($existing) {
                $existing.count++
            } else {
                $placeholders += @{
                    name = $name
                    line = $lineNum
                    count = 1
                }
            }
        }
    }
    
    return $placeholders
}

Write-Log "INFO" "Processing: $File"

if ($ListPlaceholders) {
    $placeholders = Get-Placeholders -Content $content -Lines $lines
    
    $result = @{
        file = $File
        placeholders = $placeholders
        total = ($placeholders | Measure-Object -Property count -Sum).Sum
    }
    
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "Placeholders in $File :" -ForegroundColor Cyan
        foreach ($p in $placeholders) {
            Write-Host "  Line $($p.line): $($p.name) (x$($p.count))" -ForegroundColor Yellow
        }
        Write-Host "`nTotal: $($result.total)" -ForegroundColor Green
    }
    exit 0
}

if (-not $Values) {
    $result = @{
        error = "Either -Values or -ListPlaceholders is required"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: Either -Values or -ListPlaceholders is required" -ForegroundColor Red
    }
    exit 2
}

# Parse values JSON
try {
    $valuesObj = $Values | ConvertFrom-Json -AsHashtable
} catch {
    $result = @{
        error = "Invalid JSON in -Values: $_"
    }
    if ($Format -eq "json") {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "ERROR: Invalid JSON in -Values" -ForegroundColor Red
    }
    exit 2
}

Write-Log "INFO" "Filling: $File"

# Count placeholders before
$placeholdersBefore = Get-Placeholders -Content $content -Lines $lines
$totalBefore = ($placeholdersBefore | Measure-Object -Property count -Sum).Sum

# Replace placeholders
$newContent = $content
$filled = @()

foreach ($key in $valuesObj.Keys) {
    $placeholder = "{$key}"
    $value = $valuesObj[$key]
    
    $matchCount = ([regex]::Matches($newContent, [regex]::Escape($placeholder))).Count
    if ($matchCount -gt 0) {
        $newContent = $newContent -replace [regex]::Escape($placeholder), $value
        $filled += $placeholder
        Write-Log "INFO" "Replacing $placeholder -> $value ($matchCount occurrences)"
    }
}

# Save file
Set-Content -Path $FilePath -Value $newContent -NoNewline

# Count placeholders after
$linesAfter = Get-Content -Path $FilePath
$contentAfter = Get-Content -Path $FilePath -Raw
$placeholdersAfter = Get-Placeholders -Content $contentAfter -Lines $linesAfter
$totalAfter = ($placeholdersAfter | Measure-Object -Property count -Sum).Sum

$remaining = $placeholdersAfter | ForEach-Object { $_.name }

Write-Log "INFO" "Filled $($filled.Count) placeholders, $totalAfter remaining"

$result = @{
    file = $File
    placeholders_before = $totalBefore
    placeholders_after = $totalAfter
    filled = $filled
    remaining = $remaining
}

if ($Format -eq "json") {
    $result | ConvertTo-Json -Depth 10
} else {
    Write-Host "Filled placeholders in $File" -ForegroundColor Green
    Write-Host "Before: $totalBefore, After: $totalAfter" -ForegroundColor Cyan
    if ($filled.Count -gt 0) {
        Write-Host "Filled: $($filled -join ', ')" -ForegroundColor Green
    }
    if ($remaining.Count -gt 0) {
        Write-Host "Remaining: $($remaining -join ', ')" -ForegroundColor Yellow
    }
}

exit 0

