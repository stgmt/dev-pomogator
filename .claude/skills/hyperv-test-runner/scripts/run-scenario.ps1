# run-scenario.ps1 — Helper for the hyperv-test-runner AI skill.
#
# Parses a YAML scenario from tests/hyperv-scenarios/, validates against the
# JSON schema, reverts the claude-test VM to scenario.preconditions.checkpoint,
# executes each step inside the VM via Invoke-Command, evaluates assertions,
# and emits structured JSON-line results to stdout for the AI agent to parse.
#
# Stdout protocol (line-prefixed for easy regex parse):
#   INFO: <human message>
#   STEP_RESULT:      <JSON one-liner: {name, exit_code, duration_ms, screenshot}>
#   ASSERTION_RESULT: <JSON one-liner: {type, passed, reason, ...}>
#   RUN_REPORT:       <absolute path to report.md>
#
# Exit codes:
#   0 = all assertions passed (or -Validate succeeded)
#   1 = at least one assertion DENIED
#   2 = infrastructure error (revert failed, VM unreachable, schema invalid)
#
# Usage from skill (Bash):
#   powershell -NoProfile -ExecutionPolicy Bypass \
#     -File .claude/skills/hyperv-test-runner/scripts/run-scenario.ps1 \
#     -ScenarioPath tests/hyperv-scenarios/HV001_install-clean.yaml \
#     -RunDir .dev-pomogator/hyperv-runs/2026-04-08_153022_HV001 \
#     -VMName claude-test
#
# Usage for schema validation only:
#   powershell -NoProfile -ExecutionPolicy Bypass \
#     -File ...\run-scenario.ps1 \
#     -ScenarioPath tests/hyperv-scenarios/HV001_install-clean.yaml \
#     -RunDir .tmp \
#     -Validate

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ScenarioPath,
    [Parameter(Mandatory)][string]$RunDir,
    [string]$VMName  = 'claude-test',
    [switch]$Validate
)

$ErrorActionPreference = 'Stop'

function Emit-Info {
    param([string]$Message)
    Write-Output ("INFO: {0}" -f $Message)
}

function Emit-Json {
    param([string]$Prefix, [hashtable]$Data)
    $json = $Data | ConvertTo-Json -Compress -Depth 6
    Write-Output ("{0}: {1}" -f $Prefix, $json)
}

function Fail-Infra {
    param([string]$Message)
    Emit-Info ("INFRA ERROR: {0}" -f $Message)
    exit 2
}

# --- 1. Source common helpers from tools/hyperv-test-runner/lib/common.ps1 ---
$repoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$commonPs1  = Join-Path $repoRoot 'tools\hyperv-test-runner\lib\common.ps1'
if (-not (Test-Path -LiteralPath $commonPs1)) {
    Fail-Infra ("common.ps1 not found at {0}" -f $commonPs1)
}
. $commonPs1

# Skip Assert-Admin in -Validate mode (validation is read-only and safe to run unprivileged)
if (-not $Validate) {
    Assert-Admin
    Assert-HyperVAvailable
}

# --- 2. Check powershell-yaml module ---
if (-not (Get-Module -ListAvailable -Name powershell-yaml)) {
    Emit-Info 'ERROR: powershell-yaml module not installed.'
    Emit-Info 'Install with: Install-Module powershell-yaml -Scope CurrentUser -Force'
    exit 2
}
Import-Module powershell-yaml -ErrorAction Stop

# --- 3. Load and parse scenario ---
if (-not (Test-Path -LiteralPath $ScenarioPath)) {
    Fail-Infra ("Scenario YAML not found: {0}" -f $ScenarioPath)
}
Emit-Info ("Loading scenario: {0}" -f $ScenarioPath)
$scenarioText = Get-Content -LiteralPath $ScenarioPath -Raw
try {
    $scenario = ConvertFrom-Yaml $scenarioText
} catch {
    Fail-Infra ("YAML parse error: {0}" -f $_.Exception.Message)
}

# --- 4. Mini-validator (covers fields that schema.json oneOf can't cross-check) ---
function Validate-Scenario {
    param($s)
    $errors = @()
    foreach ($field in @('id','name','description','preconditions','steps','assertions','post_test')) {
        if (-not $s.ContainsKey($field)) { $errors += "Missing required field: $field" }
    }
    if ($s.id -and $s.id -notmatch '^HV\d{3}$') { $errors += "id must match ^HV\d{3}$" }
    if ($s.name -and $s.name -notmatch '^[a-z][a-z0-9-]*$') { $errors += "name must be kebab-case" }
    if ($s.preconditions -and -not $s.preconditions.checkpoint) { $errors += "preconditions.checkpoint required" }
    if ($s.post_test -and -not $s.post_test.revert) { $errors += "post_test.revert required" }

    # Cross-field: assertion.step must reference an existing step name
    $stepNames = @()
    if ($s.steps) { foreach ($st in $s.steps) { $stepNames += $st.name } }
    if ($s.assertions) {
        foreach ($a in $s.assertions) {
            if ($a.type -in @('exit_code','screenshot_match') -and $a.step) {
                if ($stepNames -notcontains $a.step) {
                    $errors += "assertion type=$($a.type) references unknown step '$($a.step)'"
                }
            }
            # screenshot_match requires step.screenshot=true
            if ($a.type -eq 'screenshot_match' -and $a.step) {
                $matchedStep = $s.steps | Where-Object { $_.name -eq $a.step } | Select-Object -First 1
                if ($matchedStep -and -not $matchedStep.screenshot) {
                    $errors += "assertion screenshot_match references step '$($a.step)' without screenshot=true"
                }
            }
        }
    }
    return $errors
}

$validationErrors = Validate-Scenario $scenario
if ($validationErrors.Count -gt 0) {
    foreach ($e in $validationErrors) { Emit-Info ("VALIDATION: {0}" -f $e) }
    if ($Validate) { exit 1 }
    Fail-Infra ("Scenario invalid: {0} error(s)" -f $validationErrors.Count)
}

if ($Validate) {
    Emit-Info ("Scenario {0} validated successfully." -f $scenario.id)
    exit 0
}

# --- 5. Prepare run dir ---
if (-not (Test-Path -LiteralPath $RunDir)) {
    New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
}
$screenshotsDir = Join-Path $RunDir 'screenshots'
if (-not (Test-Path -LiteralPath $screenshotsDir)) {
    New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
}
$commandsLog = Join-Path $RunDir 'commands.log'
'' | Set-Content -LiteralPath $commandsLog -Encoding UTF8
$reportMd = Join-Path $RunDir 'report.md'

# Track results for final report
$stepResults      = @()
$assertionResults = @()
$infraError       = $null

# --- 6. Revert + start VM ---
$checkpoint = $scenario.preconditions.checkpoint
$revertScript = Join-Path $repoRoot 'tools\hyperv-test-runner\04-revert-and-launch.ps1'

try {
    Emit-Info ("Reverting VM '{0}' to snapshot '{1}'" -f $VMName, $checkpoint)
    & $revertScript -VMName $VMName -Snapshot $checkpoint -NoVMConnect | ForEach-Object {
        Emit-Info ("[revert] {0}" -f $_)
    }
} catch {
    $infraError = "Revert failed: $($_.Exception.Message)"
    Fail-Infra $infraError
}

# --- 7. Copy fixture into VM (if specified) ---
if ($scenario.preconditions.fixture) {
    $fixtureName = $scenario.preconditions.fixture
    $fixtureSrc  = Join-Path $repoRoot ("tests\fixtures\{0}" -f $fixtureName)
    if (-not (Test-Path -LiteralPath $fixtureSrc)) {
        Fail-Infra ("Fixture not found on host: {0}" -f $fixtureSrc)
    }
    Emit-Info ("Copying fixture '{0}' into VM at C:\fixture-source" -f $fixtureName)
    try {
        # Recursive Copy-VMFile not supported directly — use a tar fallback or Copy-Item per file.
        # Hyper-V Direct PowerShell sessions work for small fixtures:
        $session = New-PSSession -VMName $VMName -Credential (Get-Credential -Message 'VM admin (claude / ClaudeTest!2026)' -UserName 'claude') -ErrorAction Stop
        Invoke-Command -Session $session -ScriptBlock {
            if (Test-Path C:\fixture-source) { Remove-Item C:\fixture-source -Recurse -Force }
            New-Item -ItemType Directory -Path C:\fixture-source -Force | Out-Null
        }
        Copy-Item -Path (Join-Path $fixtureSrc '*') -Destination 'C:\fixture-source' -ToSession $session -Recurse -Force
        Remove-PSSession $session
    } catch {
        $infraError = "Fixture copy failed: $($_.Exception.Message)"
        Fail-Infra $infraError
    }
}

# --- 8. Execute steps ---
$stepIndex = 0
foreach ($step in $scenario.steps) {
    $stepIndex++
    $stepName = $step.name
    $stepCmd  = $step.cmd
    $timeout  = if ($step.timeout_seconds) { [int]$step.timeout_seconds } else { 60 }
    $needsScreenshot = [bool]$step.screenshot

    Emit-Info ("[step {0}/{1}] {2}" -f $stepIndex, $scenario.steps.Count, $stepName)
    Add-Content -LiteralPath $commandsLog -Value ("`n=== STEP {0}: {1} ===`n{2}`n" -f $stepIndex, $stepName, $stepCmd)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $stepExitCode = -1
    $stepStdout   = ''
    $stepStderr   = ''

    try {
        $job = Start-Job -ScriptBlock {
            param($vm, $cmd)
            $sb = [scriptblock]::Create($cmd)
            try {
                $result = Invoke-Command -VMName $vm -ScriptBlock $sb -ErrorAction Stop
                return @{ ExitCode = 0; Stdout = ($result | Out-String); Stderr = '' }
            } catch {
                return @{ ExitCode = 1; Stdout = ''; Stderr = $_.Exception.Message }
            }
        } -ArgumentList $VMName, $stepCmd

        $finished = Wait-Job -Job $job -Timeout $timeout
        if (-not $finished) {
            Stop-Job -Job $job
            Remove-Job -Job $job -Force
            $stepExitCode = -2
            $stepStderr   = "Step exceeded timeout of ${timeout}s"
        } else {
            $r = Receive-Job -Job $job
            Remove-Job -Job $job
            $stepExitCode = $r.ExitCode
            $stepStdout   = $r.Stdout
            $stepStderr   = $r.Stderr
        }
    } catch {
        $stepExitCode = -3
        $stepStderr   = $_.Exception.Message
    }

    $sw.Stop()
    Add-Content -LiteralPath $commandsLog -Value ("--- STDOUT ---`n{0}`n--- STDERR ---`n{1}`nexit={2} duration_ms={3}`n" -f $stepStdout, $stepStderr, $stepExitCode, $sw.ElapsedMilliseconds)

    $screenshotPath = $null
    if ($needsScreenshot) {
        $screenshotPath = Join-Path $screenshotsDir ("step-{0}-{1}.png" -f $stepIndex, ($stepName -replace '[^a-zA-Z0-9-]','_'))
        $screenshotHelper = Join-Path $repoRoot '.claude\skills\debug-screenshot\scripts\screenshot.ps1'
        if (-not (Test-Path -LiteralPath $screenshotHelper)) {
            $screenshotHelper = Join-Path $repoRoot 'extensions\debug-screenshot\skills\debug-screenshot\scripts\screenshot.ps1'
        }
        if (Test-Path -LiteralPath $screenshotHelper) {
            try {
                & $screenshotHelper -OutputPath $screenshotPath -Label ("{0}-step-{1}" -f $scenario.id, $stepIndex) | Out-Null
            } catch {
                Emit-Info ("Screenshot capture failed: {0}" -f $_.Exception.Message)
                $screenshotPath = $null
            }
        } else {
            Emit-Info "Screenshot helper not found in either canonical location."
            $screenshotPath = $null
        }
    }

    $stepResult = @{
        index       = $stepIndex
        name        = $stepName
        exit_code   = $stepExitCode
        duration_ms = $sw.ElapsedMilliseconds
        screenshot  = $screenshotPath
        stdout_tail = if ($stepStdout) { ($stepStdout -split "`n" | Select-Object -Last 5) -join "`n" } else { '' }
        stderr_tail = if ($stepStderr) { ($stepStderr -split "`n" | Select-Object -Last 5) -join "`n" } else { '' }
    }
    $stepResults += $stepResult
    Emit-Json 'STEP_RESULT' $stepResult
}

# --- 9. Evaluate assertions (after all steps) ---
foreach ($assertion in $scenario.assertions) {
    $type   = $assertion.type
    $passed = $false
    $reason = ''

    switch ($type) {
        'exit_code' {
            $matchedStep = $stepResults | Where-Object { $_.name -eq $assertion.step } | Select-Object -First 1
            if (-not $matchedStep) {
                $reason = "step '$($assertion.step)' not found in results"
            } else {
                $passed = ($matchedStep.exit_code -eq [int]$assertion.equals)
                $reason = "step '$($assertion.step)' exit_code=$($matchedStep.exit_code), expected=$($assertion.equals)"
            }
        }
        'file_exists' {
            try {
                $exists = Invoke-Command -VMName $VMName -ScriptBlock { param($p) Test-Path -LiteralPath $p } -ArgumentList $assertion.path
                $passed = [bool]$exists
                $reason = "$($assertion.path) exists=$exists"
            } catch {
                $reason = "Invoke-Command failed: $($_.Exception.Message)"
            }
        }
        'file_absent' {
            try {
                $exists = Invoke-Command -VMName $VMName -ScriptBlock { param($p) Test-Path -LiteralPath $p } -ArgumentList $assertion.path
                $passed = -not [bool]$exists
                $reason = "$($assertion.path) exists=$exists (expected absent)"
            } catch {
                $reason = "Invoke-Command failed: $($_.Exception.Message)"
            }
        }
        'text_contains' {
            try {
                $content = Invoke-Command -VMName $VMName -ScriptBlock { param($p) Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue } -ArgumentList $assertion.path
                $passed = ($content -and $content.Contains($assertion.value))
                $reason = "$($assertion.path) contains '$($assertion.value)' = $passed"
            } catch {
                $reason = "Invoke-Command failed: $($_.Exception.Message)"
            }
        }
        'screenshot_match' {
            # NO-OP here — AI agent compares the PNG with assertion.expect after this script returns.
            # We emit the assertion record so the agent has all info.
            $passed = $true  # tentative — AI can downgrade after visual analysis
            $reason = "deferred to AI multimodal verification (see screenshot of step '$($assertion.step)')"
        }
        default {
            $reason = "Unknown assertion type: $type"
        }
    }

    $assertionResult = @{
        type   = $type
        step   = $assertion.step
        path   = $assertion.path
        passed = $passed
        reason = $reason
    }
    $assertionResults += $assertionResult
    Emit-Json 'ASSERTION_RESULT' $assertionResult
}

# --- 10. Final revert (always, in finally-equivalent block) ---
try {
    $revertSnap = $scenario.post_test.revert
    Emit-Info ("Final revert to snapshot '{0}'" -f $revertSnap)
    Restore-VMSnapshot -VMName $VMName -Name $revertSnap -Confirm:$false
} catch {
    Emit-Info ("WARNING: Final revert failed: {0}" -f $_.Exception.Message)
}

# --- 11. Write report.md ---
$reportLines = @()
$reportLines += "# $($scenario.id) — $($scenario.name)"
$reportLines += ''
$reportLines += "**Description**: $($scenario.description)"
$reportLines += ''
$reportLines += "## Steps"
$reportLines += ''
foreach ($r in $stepResults) {
    $status = if ($r.exit_code -eq 0) { 'OK' } else { 'FAIL' }
    $reportLines += ("- **{0}** — exit={1} duration={2}ms — {3}" -f $r.name, $r.exit_code, $r.duration_ms, $status)
    if ($r.screenshot) { $reportLines += ("  - screenshot: ``{0}``" -f $r.screenshot) }
}
$reportLines += ''
$reportLines += "## Assertions"
$reportLines += ''
$failedAssertions = 0
foreach ($a in $assertionResults) {
    $mark = if ($a.passed) { '[x]' } else { '[ ]'; $failedAssertions++ }
    $reportLines += ("- {0} **{1}** — {2}" -f $mark, $a.type, $a.reason)
}
$reportLines += ''
$reportLines += "## Summary"
$reportLines += ''
$reportLines += ("- Steps:      {0}" -f $stepResults.Count)
$reportLines += ("- Assertions: {0} ({1} passed, {2} denied)" -f $assertionResults.Count, ($assertionResults.Count - $failedAssertions), $failedAssertions)
$reportLines += ("- Run dir:    {0}" -f $RunDir)
$reportLines += ''
$reportLines += "_Note: screenshot_match assertions are tentatively passed here — AI agent does the actual visual verification by reading the PNG._"

Set-Content -LiteralPath $reportMd -Value ($reportLines -join "`n") -Encoding UTF8

Emit-Info ("Report written: {0}" -f $reportMd)
Write-Output ("RUN_REPORT: {0}" -f (Resolve-Path -LiteralPath $reportMd).Path)

# --- 12. Final exit code ---
if ($infraError) { exit 2 }
if ($failedAssertions -gt 0) { exit 1 }
exit 0
