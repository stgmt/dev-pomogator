# Sandbox Test Runner — bootstrap
# Runs once at sandbox login. Verifies fixture mount and prepares a clean
# terminal session for manual / scripted dev-pomogator install testing.

$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'sandbox-test-runner'

Write-Host ''
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host '  dev-pomogator Sandbox Test Runner' -ForegroundColor Cyan
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host ''

$fixture   = 'C:\Users\WDAGUtilityAccount\Desktop\fixture'
$bootstrap = 'C:\Users\WDAGUtilityAccount\Desktop\bootstrap'

Write-Host '[1/3] Verifying mounted folders...' -ForegroundColor Yellow
foreach ($p in @($fixture, $bootstrap)) {
    if (Test-Path $p) {
        Write-Host ("  OK    {0}" -f $p) -ForegroundColor Green
    } else {
        Write-Host ("  FAIL  {0}" -f $p) -ForegroundColor Red
    }
}
Write-Host ''

Write-Host '[2/3] Fixture top-level contents:' -ForegroundColor Yellow
Get-ChildItem $fixture -Force -ErrorAction SilentlyContinue |
    Select-Object Mode, Length, Name |
    Format-Table -AutoSize | Out-String | Write-Host
Write-Host ''

Write-Host '[3/3] .claude/ subtree (should show settings.json + commands + rules):' -ForegroundColor Yellow
Get-ChildItem (Join-Path $fixture '.claude') -Recurse -Force -ErrorAction SilentlyContinue |
    Select-Object FullName |
    Format-Table -AutoSize | Out-String | Write-Host
Write-Host ''

Write-Host '======================================================' -ForegroundColor Cyan
Write-Host '  Bootstrap complete. Sandbox is ready.' -ForegroundColor Green
Write-Host '  Fixture is READ-ONLY at:'
Write-Host ('    {0}' -f $fixture) -ForegroundColor White
Write-Host ''
Write-Host '  Next steps for full test:' -ForegroundColor Yellow
Write-Host '    winget install OpenJS.NodeJS.LTS --silent'
Write-Host '    npm install -g @anthropic-ai/claude-code'
Write-Host '    robocopy C:\Users\WDAGUtilityAccount\Desktop\fixture C:\test-project /E'
Write-Host '    cd C:\test-project'
Write-Host '    npx dev-pomogator --claude --all'
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host ''

Set-Location $fixture
