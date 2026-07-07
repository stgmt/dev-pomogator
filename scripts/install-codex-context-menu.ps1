#requires -Version 5.1
<#
.SYNOPSIS
Installs the dev-pomogator Codex-only Windows context menu plugin surface.

.DESCRIPTION
Runs the Codex plugin CLI from this checkout and then applies the Windows
context-menu postinstall in --codex-only mode. This script intentionally does
not install or rewrite Claude context-menu artifacts.
#>

[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$PostinstallOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$OriginalLocation = (Get-Location).Path

function Format-Arg {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value -match '[\s"`]') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }

    return $Value
}

function Format-CommandLine {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    return ((@($FilePath) + @($Arguments)) | ForEach-Object { Format-Arg $_ }) -join ' '
}

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($DryRun) { return }
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host "[codex-context-menu] $Label"
    Write-Host ("  " + (Format-CommandLine -FilePath $FilePath -Arguments $Arguments))

    if ($DryRun) { return }

    & $FilePath @Arguments
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    if ($exitCode -ne 0) {
        throw "'$FilePath' failed with exit code $exitCode."
    }
}

try {
    Set-Location $RepoRoot

    Require-Command 'node'
    if (-not $PostinstallOnly) {
        Require-Command 'codex'
    }

    if (-not $PostinstallOnly) {
        Invoke-Step `
            -Label 'Register local Codex marketplace' `
            -FilePath 'codex' `
            -Arguments @('plugin', 'marketplace', 'add', '.', '--json')

        Invoke-Step `
            -Label 'Install context-menu Codex plugin' `
            -FilePath 'codex' `
            -Arguments @('plugin', 'add', 'context-menu@dev-pomogator-codex', '--json')
    }

    $bootstrapExpression = "require(require('path').join(process.cwd(),'tools','_shared','bootstrap.cjs'))"
    Invoke-Step `
        -Label 'Install Codex-only Windows context menu artifacts' `
        -FilePath 'node' `
        -Arguments @('-e', $bootstrapExpression, '--', 'tools/context-menu/postinstall.ts', '--codex-only')

    Write-Host '[codex-context-menu] Done.'
} finally {
    Set-Location $OriginalLocation
}
