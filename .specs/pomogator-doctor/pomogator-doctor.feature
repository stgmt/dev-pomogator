# Feature file для pomogator-doctor
# Domain code: POMOGATORDOCTOR001
# Covers UC-1..UC-12 from USE_CASES.md

Feature: POMOGATORDOCTOR001_pomogator-doctor_diagnostic_command

  As a developer cloning a project with dev-pomogator installed
  I want a doctor command that diagnoses what's broken in my environment
  So that I can fix or reinstall without hunting through README and issues

  Background:
    Given dev-pomogator is available as a local npm package
    And I have a clean temp HOME directory created by temp-home-builder
    And process.env.HOME and USERPROFILE point to that temp dir
    And child-registry hook is active for SIGKILL cleanup

  @feature1
  Scenario: POMOGATORDOCTOR001_01 Happy path — environment fully configured
    Given temp home fixture "valid" is loaded with packageVersion "1.5.0" and configVersion "1.5.0"
    And AUTO_COMMIT_API_KEY is set via envInSettingsLocal
    When I run `dev-pomogator --doctor` in interactive mode
    Then the report contains all known check IDs including C1, C2, C3, C6, C7, C13, C14

  @feature3
  Scenario: POMOGATORDOCTOR001_02 Missing tools — C5 critical+reinstallable
    Given temp home fixture "missing-tools" is loaded (F-2)
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C5 is severity "critical" and reinstallable and appears in reinstallableIssues

  @feature5
  Scenario: POMOGATORDOCTOR001_03 Missing API key — hint only, no reinstall offered
    Given temp home fixture "valid" is loaded (F-1)
    And AUTO_COMMIT_API_KEY is explicitly unset from process.env
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C7 for AUTO_COMMIT_API_KEY is severity "critical" and reinstallable=false and in manualIssues

  @feature17
  Scenario: POMOGATORDOCTOR001_04 SessionStart silent when all OK
    Given temp home fixture "valid" is loaded (F-1)
    And AUTO_COMMIT_API_KEY is set via envInSettingsLocal
    When SessionStart hook invokes doctor-hook.ts with --quiet
    Then the hook stdout is valid JSON with continue=true
    And the hook stdout has suppressOutput=true

  @feature17
  Scenario: POMOGATORDOCTOR001_05 SessionStart emits suppressOutput=true on bare home with no config
    When I invoke doctor-hook.ts via SessionStart spawn with empty input on a bare home
    Then the hook stdout is valid JSON with continue=true
    And the hook stdout has suppressOutput=true

  @feature10
  Scenario: POMOGATORDOCTOR001_06 MCP probe timeout triggers SIGKILL
    Given temp home fixture "valid" is loaded (F-1)
    And a hanging fake MCP server is spawned and wired via .mcp.json
    When I run `dev-pomogator --doctor --json`
    Then check C12 for fake-hanging server is severity "critical" and message contains "timeout"

  @feature11
  Scenario: POMOGATORDOCTOR001_07 Version mismatch — C13 critical reinstallable
    Given temp home fixture "version-mismatch" is loaded with configVersion "1.3.0" and packageVersion "2.0.0"
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C13 is severity "critical" and reinstallable and message contains "major"

  @feature24
  Scenario: POMOGATORDOCTOR001_08 CI mode --json outputs redacted JSON and exit 2
    Given temp home fixture "valid" is loaded (F-1)
    And AUTO_COMMIT_API_KEY is explicitly unset from process.env
    When I run `dev-pomogator --doctor --json`
    Then the JSON output is valid, contains no ANSI codes, C7 envStatus.status="unset", no "value" field, and exitCodeFor returns 2

  @feature13
  Scenario: POMOGATORDOCTOR001_09 Plugin-loader broken-missing — reinstallable
    Given temp home fixture "valid" with pluginJson declaring broken-missing command "create-spec"
    When I run `dev-pomogator --doctor` in interactive mode
    Then check C15 summary is severity "critical" and reinstallable and state="BROKEN-missing" and message matches the broken command

  @feature20
  Scenario: POMOGATORDOCTOR001_10 Traffic-light grouped output
    Given temp home fixture with installedExtensions=["plan-pomogator","auto-commit"] and AUTO_COMMIT_API_KEY in settingsLocal
    When I run `dev-pomogator --doctor` in interactive mode
    Then formatChalk output contains all three traffic-light group emojis and Summary line

  @feature21
  Scenario: POMOGATORDOCTOR001_11 Per-extension gating skips irrelevant checks
    Given temp home fixture with installedExtensions=["plan-pomogator","auto-commit"] and AUTO_COMMIT_API_KEY in settingsLocal
    When I run `dev-pomogator --doctor --json`
    Then gatedOut includes C9, C10, C16 and results does NOT include those IDs

  @feature5
  Scenario: POMOGATORDOCTOR001_12 API key set in settings.local.json env block is accepted
    Given temp home fixture "valid" is loaded with envInSettingsLocal={AUTO_COMMIT_API_KEY:"sk-from-settings"}
    And AUTO_COMMIT_API_KEY is explicitly unset from process.env
    When I run `dev-pomogator --doctor --json`
    Then check C7 for AUTO_COMMIT_API_KEY is severity "ok", message mentions "settings.local.json", and envStatus.status="set"

  # Reliability edge cases (referenced by NFR)

  @feature3
  Scenario: POMOGATORDOCTOR001_13 Corrupt config.json treated as critical reinstallable
    Given temp home fixture "corrupt-config" is loaded (F-4)
    When I run `dev-pomogator --doctor`
    Then check C3 is severity "critical" and reinstallable and message contains "invalid" or "parse"

  @feature8
  Scenario: POMOGATORDOCTOR001_14 Concurrent doctor run is blocked by lock
    Given temp home fixture "valid" is loaded (F-1)
    And the lock is already held on the doctor.lock file
    When I run runDoctor in-process and expect a LockHeldError
    Then runDoctor threw a LockHeldError

  @feature17
  Scenario: POMOGATORDOCTOR001_15 Hook error never blocks SessionStart
    Given temp home fixture "corrupt-config" is loaded (F-4)
    When SessionStart hook invokes doctor-hook.ts with --quiet
    Then the hook stdout is valid JSON with continue=true even on corrupt config

  # ============================================================
  # Post-Launch Hardening scenarios (2026-04-20, @feature12)
  # ============================================================

  @wip
  @feature26
  Scenario: POMOGATORDOCTOR001_16 Hook command references missing script file
    # NOTE: C20 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And projectRoot has .claude/settings.local.json with hook command 'node -e "require(...)" -- ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts"' under Stop event
    And .dev-pomogator/tools/auto-commit/auto_commit_stop.ts does NOT exist on disk
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C20" with severity "critical" and reinstallable=true
    And that check message contains "Stop:" and ".dev-pomogator/tools/auto-commit/auto_commit_stop.ts"
    And that check hint mentions "reinstall"

  @wip
  @feature26
  Scenario: POMOGATORDOCTOR001_17 Hook storm — 22 missing commands across 5 events aggregated
    # NOTE: C20 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "webapp-like" (F-14) with settings.local.json containing 22 hook commands across events Stop(8), SessionStart(4), PreToolUse(4), UserPromptSubmit(4), PostToolUse(2)
    And projectRoot has empty .dev-pomogator/tools/ directory
    When I run `dev-pomogator --doctor --json`
    Then results contains per-event critical entries grouped by event
    And Stop-event missing count equals 8
    And SessionStart-event missing count equals 4
    And summary.critical is at least 5

  @wip
  @feature26
  Scenario: POMOGATORDOCTOR001_18 Shell hook (bash .sh) also parsed
    # NOTE: C20 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And projectRoot has hook command 'bash .dev-pomogator/tools/bg-task-guard/stop-guard.sh' registered under Stop event
    And .dev-pomogator/tools/bg-task-guard/stop-guard.sh does NOT exist
    When I run `dev-pomogator --doctor --json`
    Then results contains critical check mentioning "stop-guard.sh"

  @wip
  @feature27
  Scenario: POMOGATORDOCTOR001_19 Managed file hash mismatch emits warning
    # NOTE: C21 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions[auto-commit].managed[projectRoot].tools[].path=".dev-pomogator/tools/auto-commit/auto_commit_core.ts" with hash "abc123"
    And the file exists on disk with different content hashing to "def456"
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C21" with severity "warning" and reinstallable=false
    And that check hint contains "user edit or version drift"

  @wip
  @feature27
  Scenario: POMOGATORDOCTOR001_20 Managed file missing emits critical reinstallable
    # NOTE: C21 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions[auto-commit].managed[projectRoot].tools[].path=".dev-pomogator/tools/auto-commit/auto_commit_llm.ts" with hash "zzz"
    And that file does NOT exist on disk
    When I run `dev-pomogator --doctor --json`
    Then results contains check id starting with "C21" with severity "critical" and reinstallable=true
    And reinstallableIssues includes the C21 entry

  @wip
  @feature27
  Scenario: POMOGATORDOCTOR001_21 Managed hash skipped for files over 1MB
    # NOTE: C21 not in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And config tracks a managed file with size > 1MB
    When I run `dev-pomogator --doctor --json`
    Then the corresponding C21 check is severity "ok"
    And message or details note "skipped hash (file > 1MB)"

  @feature28
  Scenario: POMOGATORDOCTOR001_22 Plugin.json absent when no manifest declared emits ok
    Given temp home fixture "valid" is loaded (F-1)
    When I run `dev-pomogator --doctor --json`
    Then check C15 is severity "ok" with message about no plugin.json manifest

  @wip
  @feature29
  Scenario: POMOGATORDOCTOR001_23 pomogator-doctor self-install hook missing emits warning
    # NOTE: no corresponding check in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" is loaded (F-1)
    And config.installedExtensions does NOT contain any extension named "pomogator-doctor"
    When I run `dev-pomogator --doctor --json`
    Then results contains a warning check about "proactive broken-install detection disabled"
    And that check is reinstallable=true

  @wip
  @feature30
  Scenario: POMOGATORDOCTOR001_24 --all-projects iterates installed projectPaths
    # NOTE: allProjects not in DoctorOptions type — unimplemented in v2.
    Given temp home fixture "valid" (F-1) with installedExtensions[*].projectPaths union = ["D:/repos/projA", "D:/repos/projB"]
    And projA is healthy
    And projB has 3 missing hook command files
    When I run `dev-pomogator --doctor --all-projects --json`
    Then stdout is a JSON object with top-level key "projects"
    And projects contains exactly keys "D:/repos/projA" and "D:/repos/projB"
    And projects["D:/repos/projB"] contains critical entries
    And aggregate.critical is at least 3
    And process exits with code 2

  @feature31
  Scenario: POMOGATORDOCTOR001_25 Hooks registry check reads correct JSON path (regression)
    Given temp home fixture with bun-oom-guard auto-commit and plan-pomogator extensions, AUTO_COMMIT_API_KEY set
    When I run `dev-pomogator --doctor --json`
    Then check C6 is severity "ok" and message does NOT contain "unexpected keys"

  @wip
  @feature31
  Scenario: POMOGATORDOCTOR001_26 Hooks registry detects duplicate registrations
    # NOTE: C6 checks missing/stale keys but not duplicates across extensions — partial implementation.
    Given temp home fixture "valid" (F-1)
    And config.installedExtensions[extA].managed[projectRoot].hooks.Stop contains command "X"
    And config.installedExtensions[extB].managed[projectRoot].hooks.Stop contains identical command "X"
    When I run `dev-pomogator --doctor --json`
    Then check C6 severity is "warning"
    And check C6 message contains "duplicate hook registration"

  @wip
  @feature32
  Scenario: POMOGATORDOCTOR001_27 config.version missing emits warning
    # NOTE: C13 emits "cannot compare versions" warning but hint text says "Reinstall to record current version", not "lacks top-level version" — prose diverges from implementation.
    Given temp home fixture "valid" (F-1)
    And ~/.dev-pomogator/config.json has no top-level "version" field
    When I run `dev-pomogator --doctor --json`
    Then check C13 severity is "warning" and reinstallable=true
    And check C13 hint contains "lacks top-level version"

  @wip
  @feature33
  Scenario: POMOGATORDOCTOR001_28 MCP probe timeout is warning not critical at 10s
    # NOTE: mcp-probe.ts produces severity "critical" for timeout, not "warning". Prose diverges from code.
    Given temp home fixture "valid" (F-1)
    And fake MCP server "hanging" is spawned (F-7) that never responds to initialize
    And .mcp.json references the hanging server
    When I run `dev-pomogator --doctor --json`
    Then check C12 severity is "warning" (not "critical")
    And check C12 hint contains "probe did not complete in 10s"
    And check C12 durationMs is between 9500 and 11000

  @wip
  @feature33
  Scenario: POMOGATORDOCTOR001_29 MCP spawn ENOENT emits critical with PATH hint
    # NOTE: Not covered by existing vitest tests — needs a dedicated step-def that spawns a bad command.
    Given temp home fixture "valid" (F-1)
    And .mcp.json references a server with command="does-not-exist-xyz"
    When I run `dev-pomogator --doctor --json`
    Then check C12 severity is "critical"
    And check C12 hint contains "PATH"

  @wip
  @feature34
  Scenario: POMOGATORDOCTOR001_30 Stale managed entries orphan warning
    # NOTE: No orphan/stale check in engine/checks/ — unimplemented in v2.
    Given temp home fixture "valid" (F-1)
    And config.installedExtensions[*].managed[projectRoot].tools[].path="/dev-pomogator/tools/legacy-tool/old.ts" while no extension named "legacy-tool" is installed and legacy-tool is NOT declared as sub-tool of any installed extension.json
    When I run `dev-pomogator --doctor --json`
    Then results contains a warning mentioning "legacy-tool" and "orphaned"

  @wip
  @feature34
  Scenario: POMOGATORDOCTOR001_31 Sub-tool directories not flagged as stale (specs-validator case)
    # NOTE: No stale sub-tool detection check — unimplemented in v2 (companion to _30).
    Given temp home fixture "valid" (F-1) with specs-workflow extension installed
    And config.installedExtensions[specs-workflow].managed[projectRoot].tools[].path contains "/dev-pomogator/tools/specs-validator/validate-specs.ts"
    And extensions/specs-workflow/extension.json declares tools.specs-validator=tools/specs-validator
    When I run `dev-pomogator --doctor --json`
    Then no warning check mentions "specs-validator" as orphaned

  @feature17
  Scenario: POMOGATORDOCTOR001_10b Hook output is silent when environment is healthy
    Given temp home fixture "valid" is loaded (F-1)
    And AUTO_COMMIT_API_KEY is set via envInSettingsLocal
    When I call buildHookOutput on the DoctorReport in-process
    Then buildHookOutput returns continue=true and either silent or bounded additionalContext

  @feature7
  Scenario: POMOGATORDOCTOR001_11b Bun gate activates when extension declares bun dependency
    Given temp home fixture with installedExtensions containing bun-oom-guard with binaries dependency bun
    When I run runDoctor in-process
    Then gatedOut does NOT include C9
    And results includes C9

  @feature35
  Scenario: POMOGATORDOCTOR001_32 C30 check is relevant on Windows, gated on other platforms
    Given temp home fixture "valid" is loaded (F-1)
    When I run `dev-pomogator --doctor --json`
    Then on win32 results contains C30 severity "warning" about Legacy npm; on other platforms C30 is gated out

  # ============================================================
  # Meridian proxy health scenarios (FR-49 C17)
  # ============================================================

  @feature36
  Scenario: POMOGATORDOCTOR001_40 C17 gated out when judge explicitly disabled and no proxy wired
    Given CLAIM_GATE_JUDGE env is set to "false"
    And MERIDIAN_URL is not set
    And temp home fixture "valid" is loaded (F-1)
    When I run runDoctor in-process
    Then gatedOut includes C17
    And results does NOT include C17

  @feature36
  Scenario: POMOGATORDOCTOR001_41 C17 opted-in but proxy down yields warning not critical
    Given CLAIM_GATE_JUDGE env is set to "true"
    And MERIDIAN_URL points to a port with nothing listening
    And temp home fixture "valid" is loaded (F-1)
    When I run runDoctor in-process
    Then results includes C17 with severity "warning"
    And C17 message matches not running or no response or timeout
    And C17 hint matches proxy-up or claude-subscription-proxy

  @feature36
  Scenario: POMOGATORDOCTOR001_42 C17 opted-in and proxy responding yields ok
    Given CLAIM_GATE_JUDGE env is set to "true"
    And a local HTTP server responds with mode passthrough and auth loggedIn true on a random port
    And MERIDIAN_URL points to that server
    And temp home fixture "valid" is loaded (F-1)
    When I run runDoctor in-process
    Then results includes C17 with severity "ok"
    And C17 message matches up on.*passthrough

  @feature36
  Scenario: POMOGATORDOCTOR001_43 C17 relevant by default when judge on and proxy down yields warning
    Given CLAIM_GATE_JUDGE env is not set
    And MERIDIAN_URL points to a port with nothing listening
    And temp home fixture "valid" is loaded (F-1)
    When I run runDoctor in-process
    Then gatedOut does NOT include C17
    And results includes C17 with severity "warning"

  @wip
  @feature36
  Scenario: POMOGATORDOCTOR001_33 Installed extension whose manifest hook is not wired emits warning (C31)
    # NOTE: C31 removed in v2 — this was a v1 installer concept (extension.json hooks vs settings.local.json).
    # v2 covers hooks via C6 hooksRegistryCheck. Kept as @wip placeholder.
    Given extension "answer-simple" is installed in the project
    And its manifest declares a Stop hook "answer_simple_stop.ts"
    And settings.local.json does NOT contain that hook command
    When I run `dev-pomogator --doctor --json`
    Then results contains check C31 severity warning listing "answer-simple/answer_simple_stop.ts"
    And C31 is reinstallable=yes with hint to run `npx dev-pomogator`

  @wip
  @feature36
  Scenario: POMOGATORDOCTOR001_34 Wired manifest hook command passes (C31 ok)
    # NOTE: C31 removed in v2 — same as _33. Kept as @wip placeholder.
    Given extension "answer-simple" is installed in the project
    And settings.local.json contains the hook command for "answer_simple_stop.ts"
    When I run `dev-pomogator --doctor --json`
    Then results contains check C31 severity ok
    And when no extensions are installed check C31 is gated out with relevant=false

  @feature1
  Scenario: POMOGATORDOCTOR001_44 Hook-runner smoke — C18 ok when hooks can execute
    Given temp home fixture "valid" is loaded (F-1)
    When I run runDoctor in-process
    Then check C18 is severity "ok"

  @feature1
  Scenario: POMOGATORDOCTOR001_45 Hook-runner smoke — C18 critical when the runner is broken
    Given temp home fixture "valid" is loaded (F-1)
    And the doctor hook-runner probe is pointed at a missing bootstrap
    When I run runDoctor in-process
    Then check C18 is severity "critical"
    And check C18 is reinstallable

  # ---------------------------------------------------------------------------
  # POMOGATORDOCTOR002 — Canonical v2 plugin manifest (regression issue #71)
  # The v2 plugin.json uses string arrays for skills/commands paths (not {name} objects).
  # C15 crashed with "path argument must be of type string. Received undefined".
  # C3/C13/C14 reported false criticals because they only knew v1 installer artefacts.
  # ---------------------------------------------------------------------------

  @feature10
  Scenario: POMOGATORDOCTOR002_01 C15 does not crash and reports OK on canonical string-array manifest
    Given a canonical v2 project with skills "create-spec,run-tests" and commands "reflect"
    When I run runDoctor in-process with canonical project root
    Then check C15 is severity "ok"
    And check C15 message does not match "internal error"
    And check C15 message matches "3 declared"

  @feature10
  Scenario: POMOGATORDOCTOR002_02 Support folder under skills without SKILL.md is not flagged broken
    Given a canonical v2 project with skills "create-spec" and support folder "answer-simple-workspace"
    When I run runDoctor in-process with canonical project root
    Then check C15 is severity "ok"
    And check C15 message does not mention "answer-simple-workspace"

  @feature10
  Scenario: POMOGATORDOCTOR002_03 Manifest pointing at a missing skills dir reports C15 critical
    Given a canonical v2 project with skills "create-spec" and skills path "./.claude/does-not-exist"
    When I run runDoctor in-process with canonical project root
    Then check C15 is severity "critical"
    And check C15 state is "BROKEN-missing"

  @feature2
  Scenario: POMOGATORDOCTOR002_04 Canonical install does not false-critical C3 C13 C14
    Given a canonical v2 project with skills "create-spec" and version "2.0.1"
    When I run runDoctor in-process with canonical project root
    Then check C3 is severity "ok"
    And check C14 is severity "ok"
    And check C13 severity is "ok" or "warning"
