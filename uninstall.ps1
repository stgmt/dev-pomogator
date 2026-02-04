#!/usr/bin/env pwsh
# uninstall.ps1 - Удаление dev-pomogator и claude-mem из системы
# Usage: irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/uninstall.ps1 | iex
#    or: .\uninstall.ps1 [-Force] [-WhatIf]

param(
    [switch]$Force,    # Также очистить локальный проект
    [switch]$WhatIf    # Показать что будет удалено, не удаляя
)

$ErrorActionPreference = "Stop"

function Remove-SafePath {
    param([string]$Path, [string]$Description)
    
    if (Test-Path $Path) {
        if ($WhatIf) {
            Write-Host "  [WhatIf] Would remove: $Path" -ForegroundColor Yellow
        } else {
            Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed: $Description" -ForegroundColor Green
        }
        return $true
    }
    return $false
}

Write-Host "`n=== dev-pomogator + claude-mem uninstaller ===" -ForegroundColor Cyan
Write-Host ""

$removed = 0

# 0. Stop claude-mem worker service if running
Write-Host "Stopping claude-mem worker..." -ForegroundColor Yellow
$workerPid = Join-Path $env:USERPROFILE ".claude-mem\worker.pid"
if (Test-Path $workerPid) {
    try {
        $pid = Get-Content $workerPid -Raw
        if ($pid -match '\d+') {
            $processId = [int]($pid -replace '\D', '')
            if ($WhatIf) {
                Write-Host "  [WhatIf] Would stop worker process: $processId" -ForegroundColor Yellow
            } else {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Write-Host "  Stopped worker process: $processId" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  Worker not running or already stopped" -ForegroundColor DarkGray
    }
}

# Also try to kill by port 37777
if (-not $WhatIf) {
    try {
        $netstat = netstat -ano | Select-String ":37777.*LISTENING"
        if ($netstat) {
            $workerPid = ($netstat -split '\s+')[-1]
            Stop-Process -Id $workerPid -Force -ErrorAction SilentlyContinue
            Write-Host "  Killed process on port 37777" -ForegroundColor Green
        }
    } catch {}
}

# 1. Global: ~/.dev-pomogator/
Write-Host "Cleaning global dev-pomogator files..." -ForegroundColor Yellow
$devPomogator = Join-Path $env:USERPROFILE ".dev-pomogator"
if (Remove-SafePath $devPomogator "~/.dev-pomogator/") { $removed++ }

# 2. Global: ~/.claude-mem/ (clean logs/temp, preserve *.db)
Write-Host "Cleaning claude-mem data (preserving database)..." -ForegroundColor Yellow
$claudeMem = Join-Path $env:USERPROFILE ".claude-mem"
if (Test-Path $claudeMem) {
    if ($WhatIf) {
        Write-Host "  [WhatIf] Would clean ~/.claude-mem/ (preserving *.db)" -ForegroundColor Yellow
    } else {
        Get-ChildItem $claudeMem -Exclude "*.db" -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleaned: ~/.claude-mem/ (preserved *.db)" -ForegroundColor Green
    }
    $removed++
}

# 3. Cursor hooks and state
Write-Host "Cleaning Cursor hooks..." -ForegroundColor Yellow
$cursorHooks = Join-Path $env:USERPROFILE ".cursor\hooks\hooks.json"
if (Remove-SafePath $cursorHooks "~/.cursor/hooks/hooks.json") { $removed++ }

$autoCommitState = Join-Path $env:USERPROFILE ".cursor\auto-commit-state.json"
if (Remove-SafePath $autoCommitState "~/.cursor/auto-commit-state.json") { $removed++ }

# 3b. Clean claude-mem from global ~/.cursor/mcp.json
Write-Host "Cleaning Cursor MCP config..." -ForegroundColor Yellow
$globalMcpJson = Join-Path $env:USERPROFILE ".cursor\mcp.json"
if (Test-Path $globalMcpJson) {
    if ($WhatIf) {
        Write-Host "  [WhatIf] Would remove claude-mem from: ~/.cursor/mcp.json" -ForegroundColor Yellow
    } else {
        try {
            $mcpConfig = Get-Content $globalMcpJson -Raw | ConvertFrom-Json
            if ($mcpConfig.mcpServers.'claude-mem') {
                $mcpConfig.mcpServers.PSObject.Properties.Remove('claude-mem')
                $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content $globalMcpJson -Encoding UTF8
                Write-Host "  Removed claude-mem from: ~/.cursor/mcp.json" -ForegroundColor Green
                $removed++
            }
        } catch {
            Write-Host "  Warning: Could not clean ~/.cursor/mcp.json: $_" -ForegroundColor Yellow
        }
    }
}

# 4. Uninstall claude-mem plugin via Claude CLI
Write-Host "Uninstalling claude-mem plugin..." -ForegroundColor Yellow
$claudeCli = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCli) {
    if ($WhatIf) {
        Write-Host "  [WhatIf] Would run: claude plugin uninstall claude-mem" -ForegroundColor Yellow
    } else {
        try {
            $result = & claude plugin uninstall claude-mem 2>&1
            Write-Host "  Uninstalled claude-mem plugin" -ForegroundColor Green
            $removed++
        } catch {
            Write-Host "  Plugin not installed or already removed" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "  Claude CLI not found, skipping plugin uninstall" -ForegroundColor DarkGray
}

# 5. Clean claude-mem from global Claude .mcp.json
$globalClaudeMcp = Join-Path $env:USERPROFILE ".mcp.json"
if (Test-Path $globalClaudeMcp) {
    if ($WhatIf) {
        Write-Host "  [WhatIf] Would remove claude-mem from: ~/.mcp.json" -ForegroundColor Yellow
    } else {
        try {
            $mcpConfig = Get-Content $globalClaudeMcp -Raw | ConvertFrom-Json
            if ($mcpConfig.mcpServers.'claude-mem') {
                $mcpConfig.mcpServers.PSObject.Properties.Remove('claude-mem')
                $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content $globalClaudeMcp -Encoding UTF8
                Write-Host "  Removed claude-mem from: ~/.mcp.json" -ForegroundColor Green
                $removed++
            }
        } catch {
            Write-Host "  Warning: Could not clean ~/.mcp.json: $_" -ForegroundColor Yellow
        }
    }
}

# 6. Claude plugins folders (dev-pomogator + claude-mem/thedotmack)
Write-Host "Cleaning Claude plugins..." -ForegroundColor Yellow
$claudePlugins = Join-Path $env:USERPROFILE ".claude\plugins"

if (Test-Path $claudePlugins) {
    # Remove ALL plugin caches and installations for dev-pomogator and claude-mem
    @(
        "cache\dev-pomogator",
        "cache\thedotmack", 
        "marketplaces\thedotmack",
        "marketplaces\dev-pomogator"
    ) | ForEach-Object {
        $path = Join-Path $claudePlugins $_
        if (Remove-SafePath $path "~/.claude/plugins/$_") { $removed++ }
    }
    
    # Clean installed_plugins.json - remove ALL entries for dev-pomogator and claude-mem
    $installedPlugins = Join-Path $claudePlugins "installed_plugins.json"
    if (Test-Path $installedPlugins) {
        if ($WhatIf) {
            Write-Host "  [WhatIf] Would clean: installed_plugins.json" -ForegroundColor Yellow
        } else {
            try {
                $json = Get-Content $installedPlugins -Raw | ConvertFrom-Json
                $toRemove = @()
                $json.plugins.PSObject.Properties | Where-Object { 
                    $_.Name -match "dev-pomogator|thedotmack|claude-mem" 
                } | ForEach-Object { 
                    $toRemove += $_.Name
                }
                $toRemove | ForEach-Object {
                    $json.plugins.PSObject.Properties.Remove($_)
                }
                $json | ConvertTo-Json -Depth 10 | Set-Content $installedPlugins -Encoding UTF8
                if ($toRemove.Count -gt 0) {
                    Write-Host "  Cleaned: installed_plugins.json ($($toRemove.Count) entries)" -ForegroundColor Green
                    $removed++
                }
            } catch {
                Write-Host "  Warning: Could not clean installed_plugins.json: $_" -ForegroundColor Yellow
            }
        }
    }
}

# 7. Remove claude-mem from ~/.claude/projects/ (session data)
Write-Host "Cleaning Claude project sessions..." -ForegroundColor Yellow
$claudeProjects = Join-Path $env:USERPROFILE ".claude\projects"
if (Test-Path $claudeProjects) {
    # Find and remove claude-mem session files
    Get-ChildItem $claudeProjects -Recurse -Filter "*claude-mem*" -Force 2>$null | ForEach-Object {
        if (Remove-SafePath $_.FullName $_.Name) { $removed++ }
    }
}

Write-Host ""
Write-Host "Global cleanup: $removed items removed" -ForegroundColor Cyan

# 8. Local project files (only with -Force)
if ($Force) {
    $gitRoot = $null
    try {
        $gitRoot = git rev-parse --show-toplevel 2>$null
    } catch {}
    
    if ($gitRoot) {
        Write-Host ""
        Write-Host "Cleaning local project: $gitRoot" -ForegroundColor Yellow
        
        $localRemoved = 0
        
        # Files to always remove (not in source control)
        @(
            ".cursor\commands",
            ".cursor\rules\plan-pomogator.mdc",
            ".cursor\rules\research-workflow.mdc",
            ".cursor\rules\specs-management.mdc",
            ".cursor\rules\specs-validation.mdc",
            ".pre-commit-config.yaml",
            ".root-artifacts.yaml",
            ".git\hooks\pre-commit"
        ) | ForEach-Object {
            $path = Join-Path $gitRoot $_
            if (Remove-SafePath $path $_) { $localRemoved++ }
        }
        
        # Tools - only remove if NOT tracked by git (installed by plugin, not source)
        @(
            "tools\auto-commit",
            "tools\forbid-root-artifacts",
            "tools\specs-generator",
            "tools\plan-pomogator",
            "tools\specs-validator",
            "tools\steps-validator"
        ) | ForEach-Object {
            $path = Join-Path $gitRoot $_
            if (Test-Path $path) {
                # Check if tracked by git
                $gitCheck = git -C $gitRoot ls-files $_ 2>$null
                if (-not $gitCheck) {
                    # Not in git - safe to remove (installed by plugin)
                    if (Remove-SafePath $path $_) { $localRemoved++ }
                } else {
                    if ($WhatIf) {
                        Write-Host "  [Skip] $_ is tracked by git (source file)" -ForegroundColor DarkGray
                    }
                }
            }
        }
        
        # Clean claude-mem from project .cursor/mcp.json
        $projectMcpJson = Join-Path $gitRoot ".cursor\mcp.json"
        if (Test-Path $projectMcpJson) {
            if ($WhatIf) {
                Write-Host "  [WhatIf] Would remove claude-mem from: .cursor/mcp.json" -ForegroundColor Yellow
            } else {
                try {
                    $mcpConfig = Get-Content $projectMcpJson -Raw | ConvertFrom-Json
                    if ($mcpConfig.mcpServers.'claude-mem') {
                        $mcpConfig.mcpServers.PSObject.Properties.Remove('claude-mem')
                        $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content $projectMcpJson -Encoding UTF8
                        Write-Host "  Removed claude-mem from: .cursor/mcp.json" -ForegroundColor Green
                        $localRemoved++
                    }
                } catch {
                    Write-Host "  Warning: Could not clean .cursor/mcp.json: $_" -ForegroundColor Yellow
                }
            }
        }
        
        # Clean claude-mem from project root .mcp.json (Claude Code format)
        $rootMcpJson = Join-Path $gitRoot ".mcp.json"
        if (Test-Path $rootMcpJson) {
            if ($WhatIf) {
                Write-Host "  [WhatIf] Would remove claude-mem from: .mcp.json" -ForegroundColor Yellow
            } else {
                try {
                    $mcpConfig = Get-Content $rootMcpJson -Raw | ConvertFrom-Json
                    if ($mcpConfig.mcpServers.'claude-mem') {
                        $mcpConfig.mcpServers.PSObject.Properties.Remove('claude-mem')
                        $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content $rootMcpJson -Encoding UTF8
                        Write-Host "  Removed claude-mem from: .mcp.json" -ForegroundColor Green
                        $localRemoved++
                    }
                } catch {
                    Write-Host "  Warning: Could not clean .mcp.json: $_" -ForegroundColor Yellow
                }
            }
        }
        
        Write-Host "Local cleanup: $localRemoved items removed" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "Not in a git repository, skipping local cleanup" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Tip: Use -Force to also clean local project files" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done! Run installer for clean install:" -ForegroundColor Green
Write-Host "  irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex" -ForegroundColor White
Write-Host ""
