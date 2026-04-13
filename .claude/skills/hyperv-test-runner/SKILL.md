---
name: hyperv-test-runner
description: >
  Run dev-pomogator scenarios in a clean Hyper-V Windows VM with snapshot
  revert, visual screenshot verification, and structured artifact logging.
  Three trigger types:

  (1) RUN SCENARIO: "запусти HV001", "протестируй в VM", "запусти hyperv test",
  "test in clean windows", "проверь на чистой винде", "run scenario HV...",
  "regression в VM";

  (2) SAVE BASELINE: "сохрани state машины как baseline", "сохрани state как
  бейс", "checkpoint baseline-clean", "save VM state as baseline", "snapshot baseline";

  (3) EXTEND CATALOG: "добавь сценарий для <feature> в hyperv catalog",
  "add hyperv test for <feature>", "сгенерируй сценарий по spec".

  Skill orchestrates host PowerShell scripts in tools/hyperv-test-runner/
  via Bash, parses YAML test scenarios from tests/hyperv-scenarios/, and uses
  the existing extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1
  for visual capture (multimodal Read of PNG → CONFIRMED/DENIED).
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion
---

# hyperv-test-runner — clean-Windows VM testing skill

This skill orchestrates **disposable Hyper-V VM testing** of dev-pomogator install,
uninstall, update, and regression scenarios. The VM (`claude-test`) has Win 11
Enterprise + Node.js + Git + Claude Code preinstalled in a snapshot
(`baseline-clean`); each test reverts to the snapshot, runs commands inside the VM
via `Invoke-Command -VMName`, captures screenshots, and reverts again.

The skill never modifies the host system without explicit `Bash` tool calls.
PowerShell scripts in `tools/hyperv-test-runner/` and helper
`.claude/skills/hyperv-test-runner/scripts/run-scenario.ps1` do all the work.

## When to use

| Trigger group | Example phrases | Action |
|---|---|---|
| **Run scenario** | "запусти HV001", "протестируй install в VM", "test in clean windows", "проверь dev-pomogator на чистой винде" | Trigger 1 — pick scenario YAML, run, report |
| **Save baseline** | "сохрани state машины как baseline", "save VM state as baseline", "checkpoint baseline-clean" | Trigger 2 — call 03-checkpoint.ps1 |
| **Extend catalog** | "добавь сценарий для personal-pomogator в hyperv catalog", "add hyperv test for foo-bar" | Trigger 3 — read .specs/<feature>/FR.md, generate draft yaml |

## Pre-flight checks (run before every trigger)

Always start with these checks via Bash. If any fails — report to user and stop.

```bash
powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal]([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole('Administrators')"
powershell -NoProfile -Command "Get-VM -Name claude-test -ErrorAction SilentlyContinue | Select-Object Name, State"
powershell -NoProfile -Command "(Get-VMHost).EnableEnhancedSessionMode"
```

If admin check returns `False` → tell user: "This skill requires admin elevation.
Re-launch Claude Code from an elevated PowerShell."

If VM `claude-test` not found → tell user: "VM `claude-test` does not exist. Run
`tools/hyperv-test-runner/01-create-vm.ps1` first to create it (one-time setup)."

If `EnableEnhancedSessionMode` is `False` → suggest:
`Set-VMHost -EnableEnhancedSessionMode $true` (admin required).

## Trigger 1: Run Scenario

### Step 1.1 — Resolve scenario

If user named a specific scenario id (e.g. "HV001") → load
`tests/hyperv-scenarios/HV001_*.yaml` via `Glob` then `Read`.

If user said "запусти" without an id → use `Glob tests/hyperv-scenarios/HV*.yaml`
to list available scenarios, then `AskUserQuestion` with each as an option.

### Step 1.2 — Prepare run directory

Generate timestamped run dir on host. Use Bash:

```bash
TS=$(date -u +%Y-%m-%d_%H%M%S)
RUN_DIR=".dev-pomogator/hyperv-runs/${TS}_${SCENARIO_ID}"
mkdir -p "$RUN_DIR/screenshots"
cp tests/hyperv-scenarios/${SCENARIO_ID}_*.yaml "$RUN_DIR/scenario.yaml"
echo "$RUN_DIR"
```

### Step 1.3 — Invoke run-scenario.ps1

```bash
powershell -NoProfile -ExecutionPolicy Bypass \
  -File .claude/skills/hyperv-test-runner/scripts/run-scenario.ps1 \
  -ScenarioPath "tests/hyperv-scenarios/HV001_install-clean.yaml" \
  -RunDir ".dev-pomogator/hyperv-runs/${TS}_HV001" \
  -VMName claude-test
```

The helper script:
1. Sources `tools/hyperv-test-runner/lib/common.ps1` for `Assert-Admin` etc.
2. Validates scenario YAML against `tests/hyperv-scenarios/schema.json`
3. Reverts VM to scenario.preconditions.checkpoint via `04-revert-and-launch.ps1 -NoVMConnect`
4. Copies the fixture into VM via `Copy-VMFile -VMName claude-test`
5. For each step: `Invoke-Command -VMName claude-test -ScriptBlock { ... }` with timeout
6. For steps with `screenshot: true`: invokes `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`
7. Emits one JSON line per step / assertion to stdout (prefix `STEP_RESULT:`, `ASSERTION_RESULT:`)
8. In `finally`: reverts VM to `scenario.post_test.revert`
9. Writes `report.md` and emits `RUN_REPORT: <abs path>` as last line

### Step 1.4 — Parse stdout JSON-lines

After Bash completes, parse the captured stdout:
- `INFO: ...` lines → progress messages
- `STEP_RESULT: {...}` → step result objects (name, exit_code, duration_ms, screenshot path)
- `ASSERTION_RESULT: {...}` → assertion result objects (type, passed, reason)
- `RUN_REPORT: <path>` → final report path

### Step 1.5 — Visual verification (only for screenshot_match assertions)

For each assertion of type `screenshot_match` in the scenario yaml:
1. The screenshot was captured during step execution and saved to
   `<run_dir>/screenshots/step-<N>-<slug>.png`
2. Use `Read` tool with the absolute PNG path — multimodal model sees the image
3. Compare visual content with the assertion's `expect` prose description
4. Form a result: `Result: CONFIRMED — <what you see matches>` or
   `Result: DENIED — <what you see vs expected>`
5. Append the assertion verdict to the run dir's `report.md` via `Edit` or `Write`

### Step 1.6 — Report to user

Print a summary to chat:

```
## HV001 install-clean — <CONFIRMED|DENIED>

- Steps:        N executed (N pass / 0 fail / 0 timeout)
- Assertions:   M total — M-K passed, K denied
- Run dir:      .dev-pomogator/hyperv-runs/<ts>_HV001/
- Report:       <run dir>/report.md
- Screenshots:  <list of PNG paths>

<If any DENIED — show the prose explanation here.>
```

## Trigger 2: Save Baseline

### Step 2.1 — Pre-flight already done above.

### Step 2.2 — Check existing snapshot

```bash
powershell -NoProfile -Command "Get-VMSnapshot -VMName claude-test -Name baseline-clean -ErrorAction SilentlyContinue | Select-Object Name, CreationTime"
```

If a snapshot named `baseline-clean` already exists, use `AskUserQuestion`:
"Snapshot `baseline-clean` already exists. Overwrite?" with options
[Overwrite] / [Cancel].

### Step 2.3 — Create checkpoint

```bash
powershell -NoProfile -ExecutionPolicy Bypass \
  -File tools/hyperv-test-runner/03-checkpoint.ps1 \
  -Snapshot baseline-clean
# add -Force if user confirmed overwrite
```

### Step 2.4 — Verify and report

```bash
powershell -NoProfile -Command "Get-VMSnapshot -VMName claude-test -Name baseline-clean | Select-Object Name, CreationTime, ParentSnapshotName"
```

Report to user: "Checkpoint `baseline-clean` created at <timestamp>. You can now
run scenarios via 'запусти HVxxx'."

## Trigger 3: Extend Catalog

### Step 3.1 — Resolve target spec

User mentions a feature name (e.g. "personal-pomogator"). Verify the spec exists:

```bash
ls .specs/<feature>/FR.md .specs/<feature>/FILE_CHANGES.md .specs/<feature>/<feature>.feature 2>/dev/null
```

If any file missing → tell user the spec is incomplete.

### Step 3.2 — Read spec context

Use `Read` tool on:
- `.specs/<feature>/FR.md` — extract functional requirements
- `.specs/<feature>/FILE_CHANGES.md` — extract paths that should appear / disappear after the feature
- `.specs/<feature>/<feature>.feature` — extract BDD scenarios for hint structure

### Step 3.3 — Pick next HV id

```bash
ls tests/hyperv-scenarios/HV*.yaml | sort | tail -1
```

Increment the highest existing `HV<NNN>` by 1, e.g. `HV001` → `HV002`.

### Step 3.4 — Generate draft yaml

Create `tests/hyperv-scenarios/HV<NNN>_<feature-slug>.yaml` following
`tests/hyperv-scenarios/HV001_install-clean.yaml` as a template.

The draft must:
- Use `preconditions.checkpoint: baseline-clean` unless the spec needs a special baseline
- Include a `copy fixture` step targeting `tests/fixtures/typical-claude-user/`
- Include 1+ steps that exercise the feature's main flow (derived from FR.md)
- Include `assertions[]` for each FILE_CHANGES.md path (file_exists / text_contains)
- Include at least one `screenshot_match` assertion for visual verification
- Use `post_test.revert: baseline-clean`

### Step 3.5 — Validate draft

```bash
powershell -NoProfile -ExecutionPolicy Bypass \
  -File .claude/skills/hyperv-test-runner/scripts/run-scenario.ps1 \
  -ScenarioPath tests/hyperv-scenarios/HV<NNN>_<feature>.yaml \
  -RunDir .tmp \
  -Validate
```

### Step 3.6 — Optionally run draft against VM

`AskUserQuestion`: "Run the draft against the VM now?" [Yes / No / Edit first]

If Yes — proceed to Trigger 1 flow with the new yaml.

### Step 3.7 — Report and ask about commit

Show the generated yaml + run results. Do NOT auto-commit.
`AskUserQuestion`: "Commit the new scenario to the catalog?" [Commit / Edit / Discard]

## Visual verification workflow (used by Trigger 1 step 1.5)

This skill **reuses** the existing screenshot helper at
`extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`
(also installed at `.claude/skills/debug-screenshot/scripts/screenshot.ps1` in
target projects). DO NOT define a custom `Add-Type System.Drawing` helper here.

The flow per `screenshot_match` assertion:

1. **Hypothesis**: The assertion's `expect` field is the hypothesis. Record it before reading the PNG.
2. **Capture**: Already done by `run-scenario.ps1` during step execution.
3. **Read**: Use `Read` tool with absolute path to the PNG. Multimodal model sees the image.
4. **Analyze**: Compare what you see with the expect prose.
5. **Report**: Format as
   ```
   Вижу: <what is visible in the PNG>
   Ожидал: <expect prose>
   Result: CONFIRMED | DENIED — <reason>
   ```

## Failure modes

| Failure | Action |
|---|---|
| `Restore-VMSnapshot` fails | Report to user, do NOT continue. Suggest manual `Get-VMSnapshot` + recreating from `01-create-vm.ps1` |
| VM does not reach heartbeat in 90s | Report timeout, dump `Get-VM | fl *` output, suggest checking integration services inside VM |
| `Invoke-Command` step throws | Capture stderr, mark step as failed, continue to next step (do not abort scenario) |
| Step exceeds `timeout_seconds` | Kill the job, mark as failed/timeout, continue |
| `screenshot.ps1` fails | Mark `screenshot_match` assertion as DENIED with reason "Screenshot capture failed: <error>" |
| Final revert in `finally` fails | Report critical error, suggest manual `Restore-VMSnapshot baseline-clean` |
| `powershell-yaml` module missing | Tell user: `Install-Module powershell-yaml -Scope CurrentUser -Force` |

## What this skill does NOT do

- **Does not automate Claude Code login** inside the VM. Initial OAuth is one-time
  manual after `01-create-vm.ps1` finishes.
- **Does not auto-trigger** on every Stop hook or test run. Only invoked by explicit
  user request matching one of the trigger phrases.
- **Does not delete files outside `.dev-pomogator/hyperv-runs/`** without user confirmation.
- **Does not run on non-Windows hosts.** Hyper-V is Windows Pro/Enterprise/Education only.
- **Does not auto-commit generated catalog yaml** in Trigger 3 — always asks user via AskUserQuestion.
- **Does not modify the VM baseline snapshot.** Only Trigger 2 creates / overwrites snapshots, and only with explicit user confirmation.

## See also

- Spec: `.specs/hyperv-test-runner/`
- PowerShell scripts: `tools/hyperv-test-runner/`
- Test catalog: `tests/hyperv-scenarios/`
- Visual capture helper: `extensions/debug-screenshot/skills/debug-screenshot/scripts/screenshot.ps1`
- Target fixture: `tests/fixtures/typical-claude-user/`
