Feature: SPECGEN004 Spec Generator v4 — graph + MCP + LSP + cucumber-js BDD
  As a dev-pomogator maintainer / developer
  I want an in-memory SpecGraph + MCP server exposing get_trace tool + Marksman LSP + cucumber-js BDD with NDJSON
  So that AI agents trace FR↔Scenario↔TestResult automatically without hallucinating spec connections

  Background:
    Given dev-pomogator v4 is installed
    And specs-workflow extension is enabled with MCP server registered
    And the project has at least one spec in `.specs/`

  @feature1
  Scenario: SPECGEN004_01 Phase 0 — cucumber-js generates canonical NDJSON output
    Given dev-pomogator package.json has `@cucumber/cucumber` and `@cucumber/messages` deps installed
    And `cucumber.json` config has `format: "message:.dev-pomogator/.last-test-run.ndjson"`
    And `tests/step_definitions/` contains step impls for `.feature` files
    When the developer runs `npm run test:bdd`
    Then `.dev-pomogator/.last-test-run.ndjson` is created
    And the file is parseable via `@cucumber/messages` package
    And the file contains `gherkinDocument`, `pickle`, `testCase`, `testCaseStarted`, `testStepFinished`, `testCaseFinished` envelopes

  @feature1
  Scenario: SPECGEN004_02 Phase 0 — per-spec NDJSON split after test run
    Given the master `.dev-pomogator/.last-test-run.ndjson` exists after a test run
    And the file contains pickles from `.specs/auth/*.feature` and `.specs/billing/*.feature`
    When the bash-post-test-ingest hook fires
    Then `.specs/auth/.test-results.ndjson` is created containing only auth-related pickles
    And `.specs/billing/.test-results.ndjson` is created containing only billing-related pickles
    And master NDJSON is preserved

  @feature2
  Scenario: SPECGEN004_03 SpecGraph cold start under 2 seconds for 30 specs
    Given the project contains 30 spec directories with average 10 MD files each + 3 .feature files
    When the MCP server starts cold (no SQLite cache)
    Then the SpecGraph build completes in ≤2 seconds
    And `get_trace("FR-001")` returns non-empty result immediately after

  @feature2
  Scenario: SPECGEN004_04 Incremental reindex under 100ms on single-file change
    Given the MCP server is running with SpecGraph populated for 30 specs
    When a single spec file `.specs/auth/FR.md` is modified
    And chokidar `change` event fires
    Then the affected subgraph is updated in ≤100ms p95
    And other specs' nodes are not re-parsed

  @feature3
  Scenario: SPECGEN004_05 Custom MD parser registers dual-anchor for new heading
    Given a spec file `.specs/auth/FR.md` contains heading `### FR-001: Login`
    When the MD parser indexes the file
    Then anchor `FR-001` is registered pointing to file:line
    And anchor `fr-001-login` is registered pointing to same file:line
    And wiki-link `[[FR-001]]` resolves to the heading
    And wiki-link `[[fr-001-login]]` resolves to the heading

  @feature3
  Scenario: SPECGEN004_06 Custom MD parser registers triple-anchor for legacy v3 heading
    Given a legacy v3 spec file `.specs/legacy/FR.md` contains `### Requirement: FR-001 Login`
    When the MD parser indexes the file with backward-compat mode
    Then anchors `FR-001`, `fr-001-login`, `requirement-fr-001-login` all resolve to the same heading
    And no migration is required for legacy spec to function

  @feature4
  Scenario: SPECGEN004_07 get_trace returns structured tree with natural-language explanation
    Given FR-001 exists in `.specs/auth/FR.md` with 2 ACs and 3 linked scenarios
    And SCEN-login-ok has lastResult PASSED, SCEN-login-locked has lastResult FAILED
    When agent calls MCP tool `get_trace("FR-001")`
    Then the response contains `node`, `tree.acceptance_criteria`, `tree.scenarios`, `tree.tasks`, `tree.related_nodes`
    And `explanation_for_agent` field contains FR title, counts, latest test status, failing step location
    And `explanation_for_agent` length is ≤500 characters

  @feature4
  Scenario: SPECGEN004_08 get_trace includes failing scenario error in explanation
    Given SCEN-login-locked has lastResult FAILED with NullReferenceException at AuthService.cs:88
    When agent calls `get_trace("FR-001")`
    Then `explanation_for_agent` mentions "SCEN-login-locked FAILED — NullReferenceException at AuthService.cs:88"

  @feature5
  Scenario: SPECGEN004_09 PreToolUse hook denies Write with duplicate FR-N
    Given `.specs/auth/FR.md` already contains heading `### FR-001: Login`
    When the agent attempts Write to add second `### FR-001: ...` heading
    Then PreToolUse hook returns `permissionDecision: "deny"`
    And `permissionDecisionReason` contains code `DUPLICATE_DEFINITION`
    And the reason lists both heading locations
    And the Write does not occur

  @feature5
  Scenario: SPECGEN004_10 PreToolUse hook denies Write with malformed YAML frontmatter
    Given the agent attempts Write to `.specs/auth/FR.md` with frontmatter missing closing `---`
    When the hook runs
    Then PreToolUse returns `permissionDecision: "deny"`
    And `permissionDecisionReason` contains code `MALFORMED_FRONTMATTER`
    And the reason includes the offending line number

  @feature5
  Scenario: SPECGEN004_11 PreToolUse hook denies Write with malformed Gherkin
    Given the agent attempts Write to `tests/Auth.feature` with invalid Gherkin syntax
    When the hook runs and @cucumber/gherkin parser throws
    Then PreToolUse returns `permissionDecision: "deny"`
    And `permissionDecisionReason` contains code `MALFORMED_GHERKIN`
    And the reason includes the parser error message

  @feature6
  Scenario: SPECGEN004_12 PostToolUse hook pushes conformance findings within 3s window
    Given the agent edits `.specs/auth/FR.md` and a conformance check produces 1 finding
    When PostToolUse hook fires
    Then within 3 seconds the agent context receives a `<system-reminder>` message
    And the message contains the finding code, location, and suggested actions

  @feature6 @feature28
  Scenario: SPECGEN004_13 PostToolUse hook aggregates and deduplicates findings in bulk edit
    Given the agent makes 5 sequential Edits to `.specs/auth/*.md` within 2 seconds
    When PostToolUse hook fires for each
    Then findings are batched in the 3-second throttle window
    And duplicate findings (same code + location) are deduplicated
    And only one aggregated `<system-reminder>` is pushed after the window closes
    And the push latency from the first edit is at most 3000 ms plus 100 ms tolerance

  @feature6
  Scenario: SPECGEN004_14 PostToolUse push silenced when frontmatter flag set
    Given a spec file frontmatter contains `_no_push_check: true`
    When the agent edits that file
    And PostToolUse hook fires
    Then no `<system-reminder>` is pushed for that file
    And the findings are still logged to `.dev-pomogator/.spec-check-log/`

  @feature7
  Scenario: SPECGEN004_15 Marksman native LSP registration is declared by the canonical plugin
    Given the canonical plugin manifest declares the Marksman native LSP server
    When the Marksman native LSP registration is inspected
    Then plugin.json references `.lsp.json` through `lspServers`
    And `.lsp.json` registers server `marksman` with the launcher shim and markdown extension mapping
    And the native launcher responds to LSP `initialize` through the real Marksman binary

  @feature7
  Scenario: SPECGEN004_16 Missing Marksman disables only native markdown LSP, not spec-domain MCP tools
    Given no Marksman binary is available to the launcher
    When the native Marksman LSP launcher starts
    Then the launcher exits non-zero with an actionable missing-binary message
    And there is no custom JS markdown-LSP fallback in the MCP tool registry
    And spec-domain graph queries still work through the MCP `find_refs` tool

  @feature8
  Scenario: SPECGEN004_17 LLM semantic drift check detects FR↔Scenario mismatch (opt-in Phase 3)
    Given `.spec-config.json::conformance_checks.semantic_drift.enabled = true`
    And FR-001 text says "redirect to /login page on expired session"
    And SCEN-login-ok tests only API contract (no UI redirect)
    When `conformance_check(scope: "FR-001", semantic: true)` is called
    Then result includes finding code `SEMANTIC_DRIFT`
    And the finding explanation mentions the mismatch (FR mentions UI redirect, scenario tests API)
    And a Haiku subagent was spawned via `claude -p` subprocess

  @feature8
  Scenario: SPECGEN004_18 LLM semantic check is disabled by default
    Given `.spec-config.json::conformance_checks.semantic_drift.enabled = false` (default)
    When PostToolUse fires after spec edit
    Then only structural checks run
    And no `claude` subprocess is spawned
    And no LLM tokens are consumed

  @feature9
  Scenario: SPECGEN004_19 Multi-language — Reqnroll C# NDJSON ingested correctly
    Given a C# project with Reqnroll v3+ installed and dev-pomogator v4
    When `dotnet test` completes and emits `reqnroll_report.ndjson`
    Then the NDJSON ingester parses the file successfully
    And SpecGraph contains TestCase nodes with `step_bindings` pointing to `.cs:line`
    And `get_trace("FR-001")` returns code_impl references from C# source files

  @feature9
  Scenario: SPECGEN004_20 Multi-language — behave Python NDJSON ingested correctly
    Given a Python project with `behave` configured to emit Cucumber Messages format
    When BDD tests run and emit NDJSON
    Then v4 NDJSON ingester parses the file successfully
    And SpecGraph contains TestCase results with status PASSED/FAILED per scenario

  @feature10
  Scenario: SPECGEN004_21 SQLite cross-session: session B reuses session A's MCP server (Phase 4)
    Given `.spec-config.json::storage.sqlite_enabled = true`
    And session A starts MCP server and writes `.mcp-lock.json` with pid=A, env=host
    When session B starts on the same project
    Then session B detects existing lock and pid is alive
    And session B connects to session A's MCP server (no second process started)
    And both sessions see consistent SpecGraph state

  @feature10
  Scenario: SPECGEN004_22 SQLite cross-session: edits from session A visible in session B immediately
    Given session A and session B share an MCP server with SQLite persistence
    When session A makes a spec edit at `.specs/auth/FR.md`
    And session B calls `get_trace("FR-001")` immediately after
    Then session B sees the latest state (post-edit)
    And SQLite single-writer (`BEGIN IMMEDIATE`) ensures no race condition

  @feature10
  Scenario: SPECGEN004_23 SQLite corruption: auto-fallback to in-memory rebuild
    Given `.dev-pomogator/.spec-index.sqlite` file is corrupt (PRAGMA integrity_check fails)
    When the MCP server starts and opens the SQLite index
    Then corruption is detected at startup
    And the corrupt file is moved to `.dev-pomogator/.spec-index.sqlite.corrupt-{timestamp}`
    And MCP server falls back to in-memory rebuild
    And a warning is logged to `.dev-pomogator/logs/sqlite.log`

  @feature11
  Scenario: SPECGEN004_24 Migration helper — suggest-only mode prints diff without modifying
    Given an existing v3 project with `.specs/auth/FR.md` containing `### Requirement: FR-001 Login`
    When the user runs `dev-pomogator migrate-v3-to-v4 --suggest-only`
    Then per-file diffs are printed to stdout showing conversion to `### FR-001: Login`
    And the file is NOT modified
    And `.progress.json::version` is NOT bumped

  @feature11
  Scenario: SPECGEN004_25 Migration helper — interactive mode with 30s default-skip timeout
    Given the user runs `dev-pomogator migrate-v3-to-v4` (no flag)
    And the migration encounters a spec file with ambiguous structure
    When the migration prompts approve/skip/edit
    And the user provides no input for 30 seconds
    Then the default action `skip` is applied
    And the file is left unchanged
    And the migration proceeds to the next file

  @feature11
  Scenario: SPECGEN004_176 Migration helper — predict @FR-N tags for untagged scenarios
    Given a v3 spec whose FR.md defines FR-001 "User login and authentication"
    And a `.feature` with an untagged scenario "User logs in" and an already-tagged scenario
    When the user runs `dev-pomogator migrate-v3-to-v4 --suggest-only`
    Then a tag suggestion `@FR-001` is printed for the untagged "User logs in" scenario
    And the already-tagged scenario gets no suggestion
    And no tag is written into the `.feature` (advisory only)

  @feature12
  Scenario: SPECGEN004_26 architecture-research-workflow skill produces 7 stage outputs (Phase 6)
    Given the maintainer invokes `Skill("architecture-research-workflow")` with a feature description
    When the skill completes all 7 stages
    Then 7 stage output files are written to `.specs/{slug}/.architecture-research/`
    And files are committable (NOT in .gitignore)
    And final RESEARCH.md contains one Appendix per stage

  @feature12
  Scenario: SPECGEN004_27 architecture-research-workflow skill suggests rewind on new constraint
    Given Stage 4 has generated 4 architecture variants
    When the user reveals a new constraint in Stage 5 decision Q&A loop
    Then the skill suggests `restart-from-stage 4`
    And an audit-trail entry is recorded in `5-decisions-locked.md` as `[REWIND] Stage 5 → Stage 4: <reason>`
    And a 3-rewind hard limit prevents infinite loops

  @feature12
  Scenario: SPECGEN004_28 create-spec uses regular research-workflow for small feature (complexity heuristic)
    Given a small feature description (single file change, no architecture decisions)
    When `create-spec` runs complexity heuristic detection
    Then the heuristic does NOT match (no "архитектур"/"v\d+"/"rebuild" keywords AND <3 components)
    And `create-spec` invokes regular `Skill("research-workflow")` instead of `architecture-research-workflow`
    And 7-stage overhead is avoided

  @feature12
  Scenario: SPECGEN004_531 shared research base is the single discipline source for both research skills
    Given the shipped shared research base is loaded
    When the research skills declare their shared research discipline
    Then the base contains hypothesis-first source taxonomy triangulation verification markers schema-exhaustiveness recency anti-patterns external-pain and misconception-flush rules
    And research-workflow links the shared base and references external-pain and misconception-flush sections
    And architecture-research-workflow links the shared base from its Stage 3 broad research note

  @feature12
  Scenario: SPECGEN004_532 create-spec routes architecture research and honors research-done recursion guard
    Given create-spec Phase 1 discovery documentation is loaded
    When create-spec evaluates architectural small-feature and research-done prompts
    Then architectural prompts route to architecture-research-workflow through the real heuristic
    And small prompts route to research-workflow through the real heuristic
    And the research-done recursion guard is documented before either research skill is invoked

  @feature13
  Scenario: SPECGEN004_29 Orphan scenario tag returns warn-severity finding by default
    Given a `.feature` file contains `@FR-999\nScenario: Some test` and FR-999 doesn't exist
    When `conformance_check` runs
    Then result includes finding code `SCENARIO_TAG_ORPHAN`
    And severity is `warning` (default policy)
    And `suggestions[]` lists existing similar IDs (top-3 by Levenshtein distance)
    And the Write of the .feature file is NOT blocked

  @feature13
  Scenario: SPECGEN004_30 Orphan policy escalation to block via config
    Given `.spec-config.json::orphan_policy.scenario_tag_orphan = "block"`
    And a `.feature` file contains `@FR-999` Scenario for non-existent FR
    When `conformance_check` runs
    Then severity is `error` (escalated from default warn)
    And PostToolUse push or PreToolUse hook (depending on context) blocks the operation
    And the user is prompted to resolve before commit

  @feature14
  Scenario: SPECGEN004_31 Devcontainer — MCP returns relative paths in tool responses
    Given dev-pomogator v4 runs inside a VS Code devcontainer with bind-mounted workspace
    When agent calls `get_trace("FR-001")` from inside the container
    Then all file paths in response are relative to repo root
    And no absolute paths (`/workspace/...` or `D:\...`) appear in any field

  @feature14
  Scenario: SPECGEN004_32 Devcontainer — chokidar auto-polling fallback when events unreliable
    Given the workspace is bind-mounted from Docker Desktop on Windows
    When the MCP server starts and runs touch test
    And the touch event is not received within 500ms
    Then the chokidar watcher auto-falls-back to polling mode (1s interval)
    And the decision is logged to `.dev-pomogator/logs/watcher.log`
    And subsequent file changes are detected via polling

  @feature14
  Scenario: SPECGEN004_33 Multi-env — second MCP start in different env is denied
    Given session A is running MCP server with `env: "host"` in `.mcp-lock.json`
    When session B tries to start MCP from inside a container on the same worktree
    Then session B detects the existing lock has different `env` tag
    And session B exits with clear message "MCP already running in env host (pid X), restart Claude Code in same env"
    And no second MCP process is spawned

  @feature15
  Scenario: SPECGEN004_34 Side-channel log appends JSONL entry on each finding (Phase 4)
    Given a conformance_check produces a finding `SCENARIO_TAG_ORPHAN` for SCEN-x
    When PostToolUse hook completes
    Then a JSONL line is appended to `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`
    And the line contains `timestamp`, `finding_code`, `severity`, `location`, `message`, `spec_slug`
    And the JSONL line is valid JSON parseable line-by-line

  @feature15
  Scenario: SPECGEN004_35 Side-channel log rotates when size exceeds 10MB
    Given the current `.spec-check-log/<YYYY-MM-DD>.jsonl` file size is 9.5MB
    When the next append would exceed 10MB
    Then the file is rotated to `.spec-check-log/<YYYY-MM-DD>-1.jsonl`
    And a new file `.spec-check-log/<YYYY-MM-DD>-2.jsonl` starts for subsequent appends
    And previous files are not modified

  @feature16
  Scenario: SPECGEN004_36 Codespaces — MCP server auto-starts via postStartCommand
    Given a Codespaces environment with dev-pomogator v4 installed
    And `.devcontainer/devcontainer.json` contains `postStartCommand` for MCP startup
    When the codespace starts (cold or warm)
    Then the MCP server is launched automatically
    And `.mcp-lock.json` is written with `env: "codespaces:<machine-id>"`

  @feature16
  Scenario: SPECGEN004_37 Codespaces — MCP server resumes after hibernation within 2s
    Given a Codespaces environment is hibernated after 30 minutes of inactivity
    When the user resumes the codespace
    Then the MCP server auto-restarts via postStartCommand
    And the SpecGraph is rebuilt from persistent `/workspaces/` files in ≤2 seconds
    And the lock file `env` tag remains `codespaces:<machine-id>`

  @feature17
  Scenario: SPECGEN004_38 Cross-spec reconcile light mode detects missing file
    Given a spec fixture `tests/fixtures/cross-spec-corpus/spec-c/` declares MCP tool `validate_user`
    And no file matching `src/mcp/validate_user*.ts` exists on disk
    When `Skill("cross-spec-reconcile", mode: "light")` is invoked with `spec_slug: spec-c`
    Then `.specs/spec-c/consistency-report.yaml` is written within 5 seconds
    And `findings[]` contains an entry with `code: "impl-drift/missing-file"`, `severity: "WARNING"`, `class: "uncovered"`
    And the finding includes `referenced_in`, `expected_path`, and `suggested_fix` fields

  @feature17
  Scenario: SPECGEN004_39 Cross-spec reconcile full mode detects runtime identifier drift
    Given fixture spec-a declares `feedback_key = "session_token"`
    And fixture spec-b declares the same concept as `sessionToken`
    When `Skill("cross-spec-reconcile", mode: "full")` is invoked
    Then `findings[]` contains an entry with `code: "cross-spec/runtime-identifier-drift"`, `severity: "CRITICAL"`
    And the finding's `spec_a` and `spec_b` fields name the two fixture specs

  @feature17
  Scenario: SPECGEN004_40 CRITICAL hard-conflict subset blocks STOP via CAPS prompt
    Given a lightweight reconcile run produced one CRITICAL finding from the hard-conflict subset
    When the skill reaches step 5 of execution
    Then AskUserQuestion is invoked with `header: "⚠️ CRIT"`
    And the options list includes literally «Abort STOP»
    And selecting «Abort STOP» causes the skill to exit with non-zero status

  @feature17
  Scenario: SPECGEN004_41 Acknowledge & override writes JSONL audit entry
    Given a CRITICAL prompt is awaiting user choice
    When the user selects «Acknowledge & override» with reason text "covered by parametrized test runner"
    Then the YAML finding gets `acknowledged_by: user`, `override_reason: "covered by parametrized test runner"`, `override_timestamp: <iso>`
    And a new line is appended to `.claude/logs/cross-spec-overrides.jsonl` with the same reason and a session_id

  @feature17
  Scenario: SPECGEN004_42 Dry-run mode skips file writes
    Given a reconcile invocation with `--dry-run` flag
    When the skill completes its checks
    Then a summary block and the first 10 findings are printed to stdout
    And neither `consistency-report.yaml` nor `consistency-report.sarif` exists on disk afterward

  @feature17
  Scenario: SPECGEN004_43 SARIF secondary output written when --sarif flag passed
    Given a reconcile invocation with `--sarif` flag against the fixture corpus
    When the skill completes
    Then `.specs/{slug}/consistency-report.sarif` exists alongside `consistency-report.yaml`
    And the SARIF `runs[0].tool.driver.rules[].id` field matches finding codes one-to-one

  @feature17
  Scenario: SPECGEN004_394 consistency-report carries a summary roll-up block
    Given a reconcile corpus with one spec that has a missing impl path
    When the consistency-report YAML is emitted for that spec
    Then the YAML carries a summary block with by_severity by_class by_namespace totals and top_3_recommendations
    And the summary totals include specs_compared and impl_paths_checked as integers
  # (SPECGEN004_43's SARIF assertion lives in its own scenario, restored below)

  @feature17
  Scenario: SPECGEN004_395 cross-spec corpus surfaces a module-ownership conflict on a shared path
    Given the cross-spec fixture corpus where spec-a and spec-b both claim src/auth/jwt.ts which exists on disk
    When cross-spec reconcile runs over the corpus
    Then findings contain a cross-spec module-ownership-conflict at CRITICAL severity

  @feature17
  Scenario: SPECGEN004_396 cross-spec corpus surfaces a contradictory NFR budget
    Given the cross-spec fixture corpus where spec-a budgets latency 100ms and spec-b budgets 50ms
    When cross-spec reconcile runs over the corpus with the NFR check enabled
    Then findings contain a cross-spec contradictory-nfr at CRITICAL severity

  @feature17 @feature18
  Scenario: SPECGEN004_397 cross-spec reconcile e2e roundtrip writes a consistency-report carrying the corpus findings
    Given the full cross-spec fixture corpus with planted drift and a shared on-disk path
    When cross-spec reconcile runs over the corpus and writes the consistency reports
    Then a consistency-report YAML is written carrying the planted finding codes from the corpus

  @feature18
  Scenario: SPECGEN004_44 Resolve emits 5-field explanation before any edit
    Given `.specs/{slug}/consistency-report.yaml` contains an `impl-drift/missing-file` finding
    When the user runs `/cross-spec-resolve`
    Then the skill emits an explanation block containing code+severity, files+lines, plain-language change, WHY-from-finding rationale, and option list
    And NO Edit or Write tool is invoked until the user confirms «Apply» via AskUserQuestion

  @feature18
  Scenario: SPECGEN004_45 Resolve foreign-spec edit fires additional confirm
    Given a finding's target file path begins with `.specs/spec-other/` while current resolve slug is `spec-current`
    When the resolve skill reaches the per-finding handler
    Then the explanation block includes a literal banner «⚠️ This edits foreign spec: .specs/spec-other/README.md»
    And the skill requires a second AskUserQuestion confirm distinct from the per-finding confirm

  @feature18
  Scenario: SPECGEN004_46 Resolve presents Path A/B/C for architectural decision
    Given a finding with `code: "impl-drift/architectural-decision-vs-reality"` and populated `path_alternatives[]`
    When resolve processes the finding
    Then AskUserQuestion is invoked with at least two Path options
    And each option's `description` field contains pros, cons, and impacted_files prose

  @feature18
  Scenario: SPECGEN004_47 Resolve missing report exits with hint
    Given `.specs/{slug}/consistency-report.yaml` does not exist
    When the user runs `/cross-spec-resolve`
    Then the skill exits with non-zero status
    And stdout includes literally the hint «Run /cross-spec-reconcile first»

  @feature18
  Scenario: SPECGEN004_48 Batch re-check updates resolution_status
    Given the resolve skill has processed all confirmed findings via Edit/Write
    When the skill reaches step 7 of execution
    Then `Skill("cross-spec-reconcile", mode: "full")` is invoked exactly once
    And each original finding's `resolution_status` is updated to `resolved`, `still_present`, or `transformed`
    And the YAML is written atomically via temp file + rename

  @feature18
  Scenario: SPECGEN004_284 recheckStatuses with empty fresh run marks all original findings resolved
    Given the resolve skill has original findings and the fresh reconcile run returns no findings
    When recheckStatuses is called with the original findings and an empty fresh list
    Then every original finding is classified as `resolved`
    And the result map size equals the original finding count

  @feature18
  Scenario: SPECGEN004_285 resolveCli exits 0 and emits a JSON plan when the consistency report exists
    Given a consistency-report.yaml exists for slug `demo` with one finding
    When resolveCli is called with slug `demo` and the temp repo root
    Then the exit code is 0
    And stdout parses as JSON with a `count` field and a `plan` array

  @feature18
  Scenario: SPECGEN004_286 resolveCli exits 2 when no slug is supplied
    Given the resolve CLI is invoked
    When resolveCli is called with an undefined slug
    Then the exit code is 2

  @feature19
  Scenario: SPECGEN004_49 Hard tier startup crash exits 1 and blocks Write
    Given `spec-conformance-guard` config file is malformed YAML
    When the agent invokes Write/Edit on any `.specs/**/*.md`
    Then the guard exits with status 1
    And stderr contains a non-empty actionable error message
    And the PreToolUse decision is deny

  @feature19
  Scenario: SPECGEN004_50 Hard tier file-parse crash logs to JSONL and allows Write
    Given `spec-conformance-guard` parses a `.feature` file that triggers a Gherkin parser exception
    When the agent invokes Write/Edit on that file
    Then the guard exits with status 0
    And the latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` gains a new JSON line with `{timestamp, hook_id, file_path, error_message, error_stack}`
    And the PreToolUse decision is allow

  @feature22
  Scenario: SPECGEN004_51 Version gate skips hard guard on legacy spec
    Given a spec at `.specs/legacy-feature/` whose `.progress.json::version` is `2`
    When the agent invokes Write on `.specs/legacy-feature/FR.md` that would otherwise violate DUPLICATE_DEFINITION
    Then `spec-conformance-guard` exits with status 0
    And spec-check-log appends a JSONL entry `{kind: "ALLOW_AFTER_MIGRATION", reason: "spec_version", target: ".specs/legacy-feature/FR.md", observed_version: 2}`
    And the agent's Write proceeds

  @feature25
  Scenario: SPECGEN004_52 canonical plugin ships a complete static hooks.json (additive, nothing dropped)
    Given dev-pomogator v4 is distributed as a canonical plugin that ships its own static `.claude-plugin/hooks.json`
    When the plugin hook manifest is loaded
    Then `.claude-plugin/hooks.json` declares the v4 spec hooks `spec-conformance-guard`, `spec-conformance-push` and `bash-post-test/ingest`
    And it retains the pre-existing protective hook entries (the static manifest is the union, never a replacement)
    And `length(hooks.PreToolUse) >= 1` and `length(hooks.PostToolUse) >= 1`

  @feature26
  Scenario: SPECGEN004_53 LLM-as-judge skips deny-list match with explicit finding
    Given a spec FR body containing the substring `API_KEY=sk_live_abcdef1234567890`
    When `conformance_check(scope, semantic: true)` is invoked for that FR
    Then no `claude -p` subprocess is spawned
    And spec-check-log gains a JSON entry with `finding_code: "SEMANTIC_CHECK_SKIPPED_DENY_LIST"` and severity `INFO`
    And the caller does NOT receive a `NO_DRIFT_DETECTED` result for that FR

  @feature27
  Scenario: SPECGEN004_54 Marksman download sha mismatch aborts install
    Given `package.json::marksmanHashes` pins sha256 `aaaa…aaaa` for the current platform/arch/version triple
    And the actual downloaded binary's sha256 is `bbbb…bbbb`
    When `postInstall` runs the verification step
    Then install exits with non-zero status
    And the error message contains both hash values literally (`expected aaaa…aaaa`, `got bbbb…bbbb`)
    And the downloaded binary file is deleted before exit

  @feature29
  Scenario: SPECGEN004_55 FILE_CHANGES.md with 5 unique paths emits 5 File nodes + implements edges
    Given a spec at `tests/fixtures/specs/deep-multi-fr-refs-spec/` whose `FILE_CHANGES.md` contains 5 unique `Path` cells each citing at least one `FR-N` in the `Reason` column
    When the SpecGraph builder runs on that spec
    Then the resulting graph contains exactly 5 nodes of type `File` (one per unique path)
    And one `implements` edge is emitted per `(FR, path)` pair derived from the `Reason` citations
    And every emitted `implements` edge has `source_section = 'FILE_CHANGES'`

  @feature29
  Scenario: SPECGEN004_56 Glob path in FILE_CHANGES.md is skipped with single warn-once log
    Given a spec whose `FILE_CHANGES.md` contains a `Path` cell with glob pattern `tools/spec-graph/*.ts`
    When the SpecGraph builder runs on that spec
    Then no `implements` edge is emitted for that row
    And the build emits exactly one warn-once log line literally containing «glob path skipped: tools/spec-graph/*.ts»
    And the builder exits without crash with non-empty graph

  @feature29
  Scenario: SPECGEN004_57 DESIGN.md App-код section produces implements edge with source_section=DESIGN
    Given `DESIGN.md` "App-код" section lists `src/foo.ts`
    And FR-3 body in `FR.md` cites `src/foo.ts`
    When the SpecGraph builder runs on that spec
    Then the graph contains an `implements` edge from `FR-3` to `File("src/foo.ts")`
    And the edge's `source_section` equals literally `'DESIGN'`

  @feature29
  Scenario: SPECGEN004_58 Empty FILE_CHANGES.md table emits zero edges and zero File nodes
    Given a spec at `tests/fixtures/specs/minimal-spec/` whose `FILE_CHANGES.md` contains only the table header with no data rows
    When the SpecGraph builder runs on that spec
    Then the resulting graph contains zero nodes of type `File`
    And the resulting graph contains zero edges of type `implements`
    And the build exits without crash

  @feature29
  Scenario: SPECGEN004_59 Duplicate path across FILE_CHANGES.md and DESIGN.md is deduplicated to one File node
    Given `FILE_CHANGES.md` cites `src/foo.ts` in FR-1's row
    And `DESIGN.md` "App-код" section also lists `src/foo.ts` for FR-1
    When the SpecGraph builder runs on that spec
    Then the graph contains exactly one `File` node with path `src/foo.ts`
    And the graph contains exactly one `implements` edge from `FR-1` to `File("src/foo.ts")`
    And the edge's `source_section` equals literally `'FILE_CHANGES'` (precedence over DESIGN)

  @feature30
  Scenario: SPECGEN004_60 get_trace on FR with 3 implements edges returns code_impl array of length 3
    Given a spec where `FR-5` has 3 `implements` edges to files `src/a.ts`, `src/b.ts`, `src/c.ts`
    When the MCP client invokes `get_trace({node_id: "FR-5"})`
    Then the response field `code_impl` is an array of length 3
    And each entry contains both `file_path` and `source_section` keys with non-empty string values

  @feature30
  Scenario: SPECGEN004_61 AC node inherits code_impl from parent FR
    Given a spec where `FR-5` has 2 `implements` edges to files `src/a.ts`, `src/b.ts`
    And `AC-5.1` has no direct `implements` edges
    When the MCP client invokes `get_trace({node_id: "AC-5.1"})`
    Then the response field `code_impl` is an array of length 2
    And the entries equal parent `FR-5`'s `code_impl` entries identically by `file_path`

  @feature30
  Scenario: SPECGEN004_62 Scenario node code_impl unions all tagged FRs' code_impl
    Given a `.feature` Scenario tagged with both `@FR-1` and `@FR-2`
    And `FR-1` has 1 `implements` edge to `src/x.ts`
    And `FR-2` has 1 `implements` edge to `src/y.ts`
    When the MCP client invokes `get_trace({node_id: "SCENARIO-id"})`
    Then the response field `code_impl` is an array of length 2 containing both `src/x.ts` and `src/y.ts` exactly once each

  @feature30
  Scenario: SPECGEN004_63 Node with no implements edges returns code_impl as empty array
    Given a spec where `FR-7` has zero `implements` edges
    When the MCP client invokes `get_trace({node_id: "FR-7"})`
    Then the response field `code_impl` is present and equals literally `[]`
    And the field is NOT omitted from the JSON response

  @feature30
  Scenario: SPECGEN004_64 Malformed implements edge in graph produces actionable error from get_trace
    Given the SpecGraph contains an `implements` edge with missing `file_path` field
    When the MCP client invokes `get_trace({node_id: "FR-5"})`
    Then the response includes a top-level `warnings[]` array
    And `warnings[]` contains an entry with `code = "MALFORMED_IMPLEMENTS_EDGE"` and the offending edge's source location

  @feature31
  Scenario: SPECGEN004_65 Reqnroll NDJSON fixture roundtrips through detectRunner + parseNdjson + builder
    Given the fixture `tests/fixtures/reqnroll-sample/output.ndjson` exists alongside its `README.md`
    When `detectRunner` is invoked on the fixture file
    Then `detectRunner` returns literally `'reqnroll'`
    And `parseNdjson` produces a `TestResultPatch` containing at least 2 scenarios
    And at least one scenario has `status = 'PASSED'` and at least one has `status = 'FAILED'`

  @feature31
  Scenario: SPECGEN004_66 behave NDJSON fixture roundtrips and get_test_result matches per-language statuses
    Given the fixture `tests/fixtures/behave-sample/output.ndjson` exists alongside its `README.md`
    When the test ingests the fixture into the SpecGraph builder
    And invokes MCP `get_trace({node_id: <fixture_fr>})`
    Then the returned `scenarios[].lastResult` matches the expected per-language statuses
    And invoking `get_test_result({scenario_id: <same>})` returns the same statuses

  @feature31
  Scenario: SPECGEN004_67 JVM (cucumber-jvm) NDJSON fixture roundtrip
    Given the fixture `tests/fixtures/jvm-sample/output.ndjson` exists alongside its `README.md`
    When `detectRunner` is invoked on the fixture file
    Then `detectRunner` returns literally `'jvm'`
    And `parseNdjson` produces a `TestResultPatch` with at least 1 scenario
    And the builder ingest does NOT throw

  @feature31
  Scenario: SPECGEN004_68 Unknown runner NDJSON falls back to cucumber-js parser with warn
    Given an NDJSON file with envelopes that match no known runner signature
    When `detectRunner` is invoked on that file
    Then `detectRunner` returns literally `'cucumber-js'` (default fallback)
    And stderr contains literally «runner detection fell back to cucumber-js»

  @feature31
  Scenario: SPECGEN004_69 Multi-language fixture missing README.md errors loudly with actionable hint
    Given `tests/fixtures/reqnroll-sample/output.ndjson` exists but `tests/fixtures/reqnroll-sample/README.md` is absent
    When the fixture-shapes test suite runs
    Then the test fails with non-zero exit status
    And the error message contains literally «fixture missing README.md: tests/fixtures/reqnroll-sample/»
    And the hint includes literally «document exact runner command + version»

  @feature31
  Scenario Outline: SPECGEN004_377 real-builder roundtrip -- buildGraph surfaces per-scenario lastResult and failingStep error for <runner> fixture
    Given the multilang roundtrip fixture directory `<fixture-dir>` with featureUri `<feature-uri>` frId `<fr-id>` frTitle `<fr-title>`
    When the multilang roundtrip materialises the fixture into a tmpdir and calls buildGraph with featureRoots override
    Then the SpecGraph contains a `<qualified-fr-id>` FR node and scenario nodes for `<expected-passed>` and `<expected-failed>`
    And MCP get_trace of `<qualified-fr-id>` returns lastResult PASSED for `<expected-passed>` and FAILED for `<expected-failed>`
    And MCP get_test_result of `<expected-failed>` returns lastResult FAILED
    And the multilang roundtrip FAILED scenario `<expected-failed>` carries a non-empty failingStep errorMessage

    Examples:
      | runner       | fixture-dir     | feature-uri                                 | fr-id | fr-title           | qualified-fr-id | expected-passed           | expected-failed                |
      | Reqnroll     | reqnroll-sample | features/Auth.feature                       | FR-1  | Authentication     | reqnroll:FR-1   | SCEN-login-ok             | SCEN-login-wrong-password      |
      | behave       | behave-sample   | features/checkout.feature                   | FR-2  | Checkout flow      | behave:FR-2     | SCEN-add-item-to-cart     | SCEN-apply-expired-coupon      |
      | Cucumber-JVM | jvm-sample      | src/test/resources/features/payment.feature | FR-3  | Payment processing | jvm:FR-3        | SCEN-charge-succeeds      | SCEN-insufficient-funds        |

  @feature32
  Scenario: SPECGEN004_70 spec-status derives DONE only when all mapped scenarios PASSED
    Given a task whose Done-When references scenarios that are all `PASSED` in the latest `.last-test-run.ndjson`
    When `spec-status -Format task-table` computes the task's status
    Then the rendered status is `DONE`
    And no `TASK_STATUS_UNVERIFIED` finding is emitted for that task

  @feature32
  Scenario: SPECGEN004_71 honesty gate flags hand-set DONE whose scenario is undefined
    Given a task hand-set to `Status: DONE` whose mapped scenario is `UNDEFINED` in the latest run
    When `spec-status` computes the verified status
    Then a finding `TASK_STATUS_UNVERIFIED` is emitted with the offending scenario id and bucket
    And the rendered status is capped at `IN_PROGRESS`, never `DONE`

  @feature32
  Scenario: SPECGEN004_72 get_spec_status (view coverage) returns per-scenario buckets matching the run
    Given a `.last-test-run.ndjson` with a mix of passed, pending, undefined and ambiguous scenarios
    When the MCP client invokes `get_spec_status(view: coverage)`
    Then the response groups every scenario into exactly one of `passed`, `pending`, `undefined`, `ambiguous` or `failed`
    And the per-bucket counts equal the cucumber summary for the same run

  @feature32
  Scenario: SPECGEN004_73 get_spec_status (view coverage) returns per-task verified status
    Given a spec whose tasks map to scenarios of mixed result
    When the MCP client invokes `get_spec_status(view: coverage)`
    Then each task carries a `verified_status` of `DONE` only if all its mapped scenarios are `passed`
    And tasks with any non-passed mapped scenario carry `verified_status` of `in_progress`

  @feature32
  Scenario: SPECGEN004_74 get_trace surfaces verified_status per node
    Given a SpecGraph built from a spec with a recorded test run
    When the MCP client invokes `get_trace({node_id: <task or FR>})`
    Then the node includes a `verified_status` field derived from coverage
    And it never reports `DONE` while a linked scenario is pending, undefined or ambiguous

  @feature33
  Scenario: SPECGEN004_75 orchestrator delegates to a worker instead of reimplementing it
    Given the orchestrator reaches the coverage step of the workflow
    When it computes per-scenario coverage
    Then it invokes the `get_spec_status` MCP tool (or the coverage worker skill)
    And the orchestrator skill body contains no re-implementation of the bucketing logic

  @feature33
  Scenario: SPECGEN004_76 friction during a run appends a pending ledger entry without touching spec or code
    Given the orchestrator detects a gap during a run
    When it records the observation
    Then a dated entry with `status = "pending"` is appended to `.specs/spec-generator-v4/SELF_IMPROVE.md`
    And no spec or code file is modified as a result of that entry

  @feature33
  Scenario: SPECGEN004_77 session start reminds the human of pending ledger entries
    Given `SELF_IMPROVE.md` contains at least one entry with `status = "pending"`
    When the orchestrator starts a session
    Then it surfaces a reminder containing the pending count
    And the reminder lists the top pending entries' observations

  @feature33
  Scenario: SPECGEN004_78 approved entry is auto-applied; pending is never auto-applied
    Given a ledger entry marked `status = "approved"` by the human
    When the orchestrator processes the ledger
    Then it may auto-apply the entry and sets its `status = "applied"` with an applied-at date
    And any entry still `status = "pending"` is left unapplied

  @feature33
  Scenario: SPECGEN004_79 drift guard fails when a capability is unreferenced by the feature-map
    Given a new MCP tool exists that the orchestrator feature-map does not reference
    When the drift guard runs
    Then it fails with a non-zero status
    And the message names the unreferenced capability

  @feature34
  Scenario: SPECGEN004_80 anchor-integrity reports same-file and cross-file broken anchors with the likely heading
    Given a heading slug changed, orphaning one same-file and one cross-file inbound anchor
    When the anchor-integrity check runs over the spec files
    Then both broken links are reported with their file, line and unresolved anchor
    And each one names the heading slug the link most likely meant

  @feature34
  Scenario: SPECGEN004_81 marksmanSlug matches the Marksman golden fixture and is the single shared source
    Given the captured Marksman golden slug fixture
    When marksmanSlug is computed for every id-shape in the fixture
    Then each result equals the slug the real Marksman binary produced
    And both the SpecGraph md parser and the specs-generator core import that one marksmanSlug function

  @feature34
  Scenario: SPECGEN004_82 a Write that orphans an anchor triggers a reminder and the Stop-gate escape is bounded
    Given a spec file edited so an inbound anchor no longer resolves
    When the PostToolUse anchor hook inspects the edited file
    Then it returns a system-reminder naming the broken link and its fix
    And the Stop-gate honours a skip-anchor-fix escape only when the reason is at least 8 characters

  @feature34
  Scenario: SPECGEN004_83 the deterministic fixer repairs an id-bearing link without an LLM and is idempotent
    Given a broken link whose text carries the heading id
    When the deterministic fixer runs over the spec
    Then it rewrites the anchor to the heading's current marksmanSlug without invoking any model
    And applying the fixer a second time changes nothing

  @feature34
  Scenario: SPECGEN004_84 an ambiguous link is dispatched to claude in the background, never guess-rewritten
    Given a broken link whose text identifies no heading id
    When the headless fallback runs with the claude binary available
    Then it dispatches a background claude process for that link without blocking
    And with the claude binary unavailable the link stays flagged and is never rewritten

  @feature35
  Scenario: SPECGEN004_85 a fake-positive green test cannot mark a task DONE
    Given a task whose linked scenario is GREEN but whose test body audits as FAKE-POSITIVE-RISK
    When the honesty derivation runs with the test-quality verdict
    Then verified_status is capped below DONE
    And a TASK_TEST_QUALITY finding names the task and the fake-positive verdict

  @feature35
  Scenario: SPECGEN004_86 a genuinely strong green test is not false-blocked
    Given a task whose linked scenario is GREEN and whose test body audits as STRONG
    When the honesty derivation runs with the test-quality verdict
    Then verified_status is DONE

  @feature35
  Scenario: SPECGEN004_87 the orchestrator feature-map carries an enforced test-quality stage
    Given the orchestrator feature-map
    When the drift guard evaluates it
    Then a test-quality stage exists between coverage and honesty-gate routing to strong-tests and spec-status
    And the drift guard fails when that stage is removed

  @feature35
  Scenario: SPECGEN004_88 the pre-DONE Stop-gate blocks a done claim on a weak test
    Given a session-touched task whose test audits as WEAK
    When the pre-DONE Stop-gate runs
    Then it blocks the done claim
    And it allows the claim only with an audited skip-test-quality escape logged to .claude/logs

  @feature35
  Scenario: SPECGEN004_89 a task marked DONE with zero linked scenarios is not silent
    Given a task marked DONE with no linked scenario at all
    When checkConformance runs
    Then it emits a finding naming the task
    And the returned finding set is not empty

  @feature35
  Scenario: SPECGEN004_142 the test-quality producer joins per-test verdicts to the backing task worst-wins
    Given a task backed by a scenario with two graded tests one WEAK one FAKE-POSITIVE-RISK
    When the test-quality producer joins the per-test verdicts
    Then the task verdict is the worst of the two and a task with no graded test is absent

  @feature35
  Scenario: SPECGEN004_137 the test-quality side-channel file caps a green DONE task on the read surfaces
    Given a side-channel test-quality file recording a WEAK verdict for a green DONE task
    When the honesty read surfaces load the side-channel file
    Then the verdict read from the file caps the task below DONE
    And with no side-channel file present the same green task reads DONE

  @FR-44
  Scenario: SPECGEN004_140 a task that references no requirement is flagged (reverse traceability)
    Given a task with empty refs whose Done-When names no requirement
    When checkConformance runs for reverse traceability
    Then a TASK_NO_REQUIREMENT info finding names the task

  @FR-44
  Scenario: SPECGEN004_141 a project test with no spec scenario is flagged as an orphan project test
    Given a project test file with one id that has a spec scenario and one that does not
    When the project-test reverse trace runs
    Then only the test id with no scenario is reported as an orphan project test

  @FR-44
  Scenario: SPECGEN004_144 an FR citing no research finding is flagged only when the spec has a research file
    Given two specs where only one has a research file and each has an FR without a research citation
    When the FR-to-research reverse trace runs
    Then only the uncited FR of the spec with the research file is flagged and a citing FR is not

  @FR-44
  Scenario: SPECGEN004_145 upstream stories use-cases and decisions wired to no requirement are flagged
    Given a spec whose story and use-case and decision variously cite or omit a requirement
    When the upstream reverse trace runs
    Then only the unlinked story use-case and research-less decision are flagged with their kinds

  @feature36
  Scenario: SPECGEN004_90 two specs defining the same bare id produce two distinct nodes
    Given two specs that each define the bare id FR-2
    When the builder assembles the graph with composite keys
    Then the graph holds a node keyed slug-A:FR-2 and a node keyed slug-B:FR-2
    And neither node is collision-dropped

  @feature36
  Scenario: SPECGEN004_91 an intra-file anchor stays bare and file-local
    Given a markdown link FR.md#fr-2 inside one spec
    When the anchor index resolves it
    Then the anchor alias is the bare form fr-2 not the composite key
    And Marksman and anchor-fix are unaffected

  @feature36
  Scenario: SPECGEN004_92 get_trace returns scenarios via real edges
    Given a covers and tested-by edge built with composite keys on both ends
    And a same-spec featureN to FR-N tested-by edge
    When get_trace runs on an FR that has BDD scenarios
    Then it returns those scenarios via real graph edges
    And it no longer relies on the tag-scan workaround

  @feature36
  Scenario: SPECGEN004_93 a colliding bare id returns the candidate list
    Given a bare id FR-2 that collides across specs
    When a tool is called with that bare id
    Then it returns the candidate list of slug:id entries
    And it does not return one arbitrary node

  @feature36
  Scenario: SPECGEN004_94 a qualified id resolves the exact node
    Given a graph keyed by composite ids
    When a tool is called with slug:FR-2 or with spec and node_id
    Then it resolves the exact node for that spec

  @feature36
  Scenario: SPECGEN004_95 the dogfood harness shows zero collisions after migration
    Given the migration phase has completed
    When the dogfood harness dumps the raw pre-map nodes
    Then there are zero id collisions
    And the FR-node count is about 470 not 47

  @feature37
  Scenario: SPECGEN004_96 a bare structural pass is not reportable as clean
    Given validate-spec returns zero structural errors but the smart analysis has open findings
    When spec health is reported
    Then the verdict is the smart analysis over the one graph
    And a bare validate-spec zero-errors is not reportable as valid or clean or done

  @feature37
  Scenario: SPECGEN004_97 a stale FILE_CHANGES path fails the verdict
    Given a FILE_CHANGES path that does not exist on disk
    When the authoritative verdict runs
    Then it fails with a hard error naming the stale path

  @feature37
  Scenario: SPECGEN004_98 an untraced atom fails the traceability gate
    Given an UNCOVERED_FR or a TASK_UNTESTED or an UNTAGGED_SCENARIO exists
    When the authoritative verdict runs
    Then it fails with a per-item gap list
    And within spec-generator-v4 these must be zero for a green verdict

  @feature37
  Scenario: SPECGEN004_99 the semantic check runs in the verdict path
    Given a claude binary is present
    When the authoritative verdict runs
    Then the FR-8 semantic drift check runs as part of it

  @feature37
  Scenario: SPECGEN004_100 a missing semantic binary fails loud not silent
    Given no claude binary is available
    When the authoritative verdict runs
    Then it carries a SEMANTIC_SKIPPED note
    And it never reports no drift detected for unchecked content

  @feature37
  Scenario: SPECGEN004_101 a skill may not launder a structural pass
    Given a skill or agent reports spec health
    When it produces its verdict
    Then it surfaces the smart verdict and gap list
    And it does not state valid or clean or done off validate-spec alone

  @feature38
  Scenario: SPECGEN004_102 a docs-only spec reads SPEC_ONLY
    Given a spec with FR and AC docs but zero scenarios
    When get_spec_status runs for that spec
    Then the lifecycle is SPEC_ONLY and last_run is null

  @feature38
  Scenario: SPECGEN004_103 written-but-never-run tests read TESTS_NOT_RUN
    Given a spec whose scenarios carry no last result
    When get_spec_status runs for that spec
    Then the lifecycle is TESTS_NOT_RUN and last_run is null

  @feature38
  Scenario: SPECGEN004_104 a failing run reads RED with the linked summary
    Given a spec whose last run holds a failed scenario
    When get_spec_status runs for that spec
    Then the lifecycle is RED
    And the last_run summary counts the failure and identifies the run

  @feature38
  Scenario: SPECGEN004_105 an all-passed run reads GREEN with the linked summary
    Given a spec whose last run passed every scenario
    When get_spec_status runs for that spec
    Then the lifecycle is GREEN
    And the last_run summary counts the passes and identifies the run

  @feature38
  Scenario: SPECGEN004_106 undefined steps read PARTIAL never GREEN
    Given a spec whose last run has undefined scenarios and zero failures
    When get_spec_status runs for that spec
    Then the lifecycle is PARTIAL
    And the response carries counts gaps and an agent hint

  @feature21
  Scenario: SPECGEN004_107 task-table CLI output byte-matches the frozen contract baseline
    Given the frozen task-table input spec fixture
    When spec-status runs with the task-table format on it
    Then the output byte-matches the committed task-table baseline
    And a second run produces identical bytes without any MCP server

  @feature24
  Scenario: SPECGEN004_108 meta-guard denies removing a protected registration from a v4 manifest
    Given a canonical hooks manifest carrying the spec-conformance-guard registration
    When an agent write removes that registration
    Then the meta-guard denies the write naming spec-conformance-guard
    And removing the meta-guard own registration is denied too

  @feature20
  Scenario: SPECGEN004_109 conformance summary is threshold-only and acknowledged via spec-status
    Given an isolated conformance state with zero unresolved events
    Then the prompt-time summary emits nothing
    When two deny findings land in the hard-tier log
    Then the prompt-time summary is a single unresolved-DENY line
    When the spec-status ack stamps the state file
    Then the prompt-time summary is silent until a newer deny arrives

  @feature20
  Scenario: SPECGEN004_152 the task census surfaces unfinished tasks in the prompt banner
    Given a spec corpus with one open task and one done task
    When the conformance-push producer runs over it
    Then the banner surfaces the open task count from the cached census

  @feature36
  Scenario: SPECGEN004_110 parser slices merge through one ingest path with first-writer-wins identity
    Given two markdown files in one spec defining the same FR id
    When the builder assembles the graph from both
    Then exactly one node carries that composite id and it is the first parsed
    And gherkin slices deduplicate through the same ingest semantics

  @FR-39
  Scenario: SPECGEN004_111 agent file access to specs is denied in enforce mode and logged
    Given spec access enforcement is enabled after read and write sufficiency are proven
    When the agent calls a file tool on a path under the specs tree
    Then the call is denied with a pointer to the MCP tools
    And the violation lands in the spec-access audit log

  @FR-39
  Scenario: SPECGEN004_112 shadow mode logs spec-access violations without blocking
    Given the spec-access guard runs in shadow mode
    When the agent reads a spec file directly
    Then the access is logged as a violation
    And the call is not blocked

  @FR-39
  Scenario: SPECGEN004_113 read_spec_doc serves whole documents with an audit trail
    Given a spec document whose prose lives outside graph nodes
    When the agent calls read_spec_doc for it
    Then the full document content is returned
    And the read lands in the spec-access audit log

  @FR-40
  Scenario: SPECGEN004_114 apply_spec_change rejects invalid writes before touching disk
    Given a spec change that breaks an anchor or a form contract
    When the agent applies it through the MCP mutation tool
    Then the server refuses without writing and returns the findings list
    And the corrected change is written atomically and logged

  @FR-40
  Scenario: SPECGEN004_553 mutation validation gates only debt introduced by the candidate edit
    Given an existing spec with staged FR-47 and task-truth debt
    When the agent applies an unrelated clean edit and then introduces a new unlinked FR
    Then pre-existing debt is ignored but the newly introduced conformance debt is refused

  @FR-40
  Scenario: SPECGEN004_560 form validation is monotonic and explains the complete recovery contract
    Given a legacy TASKS document with repeated pre-existing form debt
    When the agent shifts legacy lines, edits valid prose, and then adds one malformed task through apply_spec_change
    Then unchanged legacy form debt does not block either clean edit
    But the net-new malformed task is refused with the complete TASKS form contract and transaction recovery hint
    And USER_STORIES and DESIGN refusals expose their exact heading field and list contracts

  @FR-40
  Scenario: SPECGEN004_115 a successful MCP write refreshes the graph for the next read
    Given an accepted spec change written through MCP
    When the agent reads the affected node afterwards
    Then the response reflects the fresh state

  @FR-40
  Scenario: SPECGEN004_116 create_spec births a verdict-green spec through MCP
    Given the create_spec mutation tool
    When the agent creates a new spec through it
    Then the authoritative verdict for the newborn spec is NOT_READY

  @FR-40
  Scenario: SPECGEN004_139 the mutation door writes a subdir working doc but refuses a traversal write
    Given a spec that needs a research stage file written into a subdirectory
    When the agent applies a subdir write and a traversal write through the mutation tool
    Then the subdir doc is written without the graph gates and the traversal write is refused with nothing escaping the spec root

  @FR-40
  Scenario: SPECGEN004_147 the delete door removes a free doc but refuses a referenced doc and single-writer artifacts
    Given a spec with a free prose doc and a doc whose nodes are referenced from another file
    When the agent deletes each target through the delete door
    Then the free doc is deleted and the referenced doc and the progress artifact are refused with named blockers

  @FR-41
  Scenario: SPECGEN004_117 each creation phase runs in a dedicated headless agent
    Given the phase agent definitions with MCP-only allowed-tools
    When the orchestrator runs a creation phase
    Then the phase executes in its dedicated headless agent
    And the agent has no direct file tools over specs

  @FR-41
  Scenario: SPECGEN004_118 the orchestrator gates phase transitions on a green verdict
    Given a completed creation phase with open verdict gaps
    When the orchestrator checks the phase gate
    Then the phase returns to its agent with the gap list
    And the next phase starts only after the gate is GREEN

  @FR-41
  Scenario: SPECGEN004_119 agent spawns and gate decisions are observable in the log
    Given an orchestrated spec creation run
    When phases spawn retry and pass their gates
    Then every spawn retry and gate decision is logged with agent and phase identity

  @FR-42
  Scenario: SPECGEN004_120 every user-facing MCP tool has a skill consumer and the drift guard names strays
    Given the MCP tool to skill consumer table in the design
    When a new user-facing MCP tool ships without a skill consumer
    Then the extended drift guard fails naming that tool

  @FR-42
  Scenario: SPECGEN004_121 the user still enters through a skill and the skill drives MCP
    Given the create-spec skill as the user entry point
    When the user asks to create a spec
    Then the skill orchestrates the phases through MCP calls
    And the skill body re-implements none of the server logic

  @FR-42
  Scenario: SPECGEN004_146 every migrated authoring skill declares the MCP door in its allowed-tools
    Given the list of authoring skills migrated to MCP-rails
    When each migrated skill's frontmatter is inspected
    Then every one of them declares dev-pomogator-specs door tools in allowed-tools

  @FR-23
  Scenario: SPECGEN004_122 the two-tier log inventory writes each tier to its own sink
    Given a soft-tier event and a hard-tier finding
    When each is logged through its canonical writer
    Then the soft event lands in the global form-guards log
    And the hard finding lands in the repo spec-check-log JSONL created on first write

  @FR-28
  Scenario: SPECGEN004_123 the push throttle window is fixed and never slides
    Given findings accumulating in bursts within one throttle window
    When more findings arrive before the window elapses
    Then the window start stays the original one
    And the flush after the window carries the aggregated deduplicated set

  @FR-40
  Scenario: SPECGEN004_124 apply_spec_change refuses a traversal slug (no write outside .specs)
    Given a mutation targeting a spec slug that escapes the specs tree
    When the agent applies it
    Then the server refuses on the target guard
    And no file is written outside the specs tree

  @FR-40
  Scenario: SPECGEN004_125 a mixed-case doc extension is refused (no case-insensitive overwrite)
    Given an existing validated FR.md and a change targeting FR.MD
    When the agent applies it
    Then the server refuses on the target guard
    And the original FR.md content is intact

  @FR-40
  Scenario: SPECGEN004_126 .progress.json is not an agent-mutable document
    Given a change targeting .progress.json
    When the agent applies it
    Then the server refuses on the target guard
    And no progress file is written

  @FR-40
  Scenario: SPECGEN004_127 an empty full-replace of a non-empty doc is refused
    Given an existing non-empty document and an empty-content change
    When the agent applies it
    Then the server refuses on the change guard
    And the document keeps its content

  @FR-40
  Scenario: SPECGEN004_128 supplying both content and an edit pair is ambiguous and refused
    Given a change carrying both content and an old_string/new_string pair
    When the agent applies it
    Then the server refuses as ambiguous

  @FR-40
  Scenario: SPECGEN004_129 a change to a non-existent spec returns a clean not-found, not a crash
    Given a markdown change targeting a spec slug that does not exist
    When the agent applies it
    Then the server returns a clean validation failure without throwing

  @FR-40
  Scenario: SPECGEN004_130 create_spec refuses a Windows reserved device-name slug
    Given a create_spec call with a reserved device-name slug
    When the agent runs it
    Then the server refuses the reserved slug

  @FR-40
  Scenario: SPECGEN004_131 an edit is not blocked by pre-existing broken anchors in sibling docs
    Given a scaffolded spec with placeholder anchors in a sibling document
    When the agent applies a clean change to another document
    Then the change is accepted despite the sibling's pre-existing broken anchors
    But a broken anchor introduced by the change itself is still refused

  @FR-39
  Scenario: SPECGEN004_132 read tools refuse a traversal slug (no out-of-tree leak)
    Given a secret file outside the specs tree and a read targeting it via a traversal slug
    When the agent calls the read tool
    Then the read is refused as an unsafe spec and nothing outside the tree is returned

  @FR-39
  Scenario: SPECGEN004_148 the git VCS-plumbing carve-out lets door-written specs be committed but not content-leaked
    Given the spec-access-guard git carve-out under enforce
    When git plumbing and git content commands run over the specs tree
    Then VCS plumbing commands are allowed and content-reading git commands stay violations

  @feature14
  Scenario: SPECGEN004_149 every session's door stays writable — a second session's write serialises in (no lifetime read-only)
    Given a spec corpus whose presence-lock is already held by another session
    When a second session boots its door and exercises read + write tools
    Then every session can write — the second session's write serialises in, reads stay live, and no lifetime lock refuses it

  @feature49
  Scenario: SPECGEN004_160 a backlog-marked spec is excluded from the task-census the Stop-gate reads
    Given a spec corpus with two specs each carrying one open task
    When I mark spec demo-b backlog through the set_spec_status door tool
    Then the door reports backlog and the task-census drops demo-b while demo-a stays

  @feature49
  Scenario: SPECGEN004_161 marking a spec active again restores it to the task-census
    Given a spec corpus with two specs each carrying one open task
    When I mark spec demo-b backlog then back to active through the door
    Then the marker is removed and the task-census counts demo-b again

  @FR-39
  Scenario: SPECGEN004_150 read_spec_doc paginates a big doc by section, by line window, and whole
    Given a spec doc with several headings and many lines
    When the agent reads it by section, by line window, and whole
    Then each paging mode returns the right slice with total_lines metadata

  @FR-40
  Scenario: SPECGEN004_153 optimistic CAS refuses a stale write and the rebased write lands
    Given a spec doc read with its content sha
    When the agent applies with the fresh sha, then the stale sha, then the rebased sha
    Then only the up-to-date write lands and the stale one is refused CAS_MISMATCH

  @FR-39
  Scenario: SPECGEN004_151 the inline skip-spec-access marker lets one Bash spec read through under enforce
    Given the spec-access-guard inline escape under enforce
    When a Bash spec read runs with a valid marker, no marker, and a too-short marker
    Then only the valid marker is honoured and the escape is audit-logged

  @FR-39
  Scenario: SPECGEN004_133 the engine-CLI carve-out allows every skill-invoked spec CLI over .specs/ but not generic readers
    Given the spec-access-guard engine-CLI carve-out
    When each documented engine CLI and a generic reader run over the specs tree
    Then every engine CLI is allowed and the generic reader stays a violation

  @FR-39
  Scenario: SPECGEN004_505 the grep-pattern carve-out allows a stream or pattern-scoped search that merely mentions the specs path
    Given the spec-access-guard grep-pattern carve-out
    When a pattern-position grep, a piped stream grep, and a path-operand grep all run over the specs path text
    Then only the path-operand grep stays a violation and the pattern-position and piped forms are allowed

  @FR-32
  Scenario: SPECGEN004_143 get_spec_status (view coverage) scopes to one spec while a bare call stays corpus-wide
    Given a graph holding scenarios from two different specs
    When get_spec_status (view coverage) is called scoped to one spec and then bare
    Then the scoped buckets hold only that spec's scenarios and the bare buckets hold the whole corpus

  @FR-32
  Scenario: SPECGEN004_134 not_run (absent from the last NDJSON) is separated from undefined
    Given a coverage run where one scenario passed, one is UNDEFINED, and one was not in the last NDJSON
    When coverage buckets are computed
    Then the absent scenario is not_run and the UNDEFINED one stays undefined

  @FR-39
  Scenario: SPECGEN004_135 the MCP server resolves a real repo root despite an unresolved placeholder env
    Given a repo-root env that is an unresolved placeholder and a cwd that contains a specs tree
    When the server resolves its repo root
    Then it ignores the placeholder and uses the cwd

  @FR-39
  Scenario: SPECGEN004_136 enforce turns on from the plugin userConfig export and respects explicit disable
    Given the plugin userConfig enforce toggle exported to the guard environment
    When the guard computes whether enforce is on
    Then enforce is on from userConfig and an explicit false turns it off

  @FR-39
  Scenario: SPECGEN004_138 the read door reaches a subdirectory doc but refuses traversal
    Given a spec whose docs live in a subdirectory and a secret file outside the spec root
    When the door resolves an in-tree subpath and a traversal subpath
    Then the in-tree subpath resolves inside the spec root and the traversal subpath is refused

  @feature37
  Scenario: SPECGEN004_154 the deterministic FR census never false-greens an FR with open tasks
    Given a fixture corpus where one FR has a done task and an open task and another FR is marked done with no passing scenario
    When the deterministic fr-census runs over the built graph
    Then the FR with an open task reads IN_PROGRESS not IMPLEMENTED
    And the FR marked done with no test reads DONE_UNTESTED in the false-green list
    And every FR appears exactly once and the per-verdict counts conserve
    And the census classifies every FR of the live spec-generator-v4 corpus by graph evidence

  @FR-40
  Scenario: SPECGEN004_155 rename_spec_doc refuses to strand inbound links, then retargets them on opt-in
    Given a spec doc with inbound markdown links from another doc
    When the agent renames it through the door without rewrite_inbound
    Then the door refuses with a Decision block naming the inbound links and nothing is moved
    When the agent renames it again with rewrite_inbound
    Then the doc is moved, the old name is gone, and the inbound links are retargeted to the new name

  @FR-43
  Scenario: SPECGEN004_156 legacy-triage suspects a superseded feature without auto-retiring it
    Given a v4 spec holding an old-version feature file and a plain not-run feature
    When the legacy-triage classifier runs over the graph
    Then the old-version feature is suspected SUPERSEDED with its lineage evidence
    And the plain not-run feature is not flagged (not_run alone is not abandonment)
    And nothing is retired automatically

  @FR-45
  Scenario: SPECGEN004_157 get_archival_proof keeps a spec still referenced by a live spec
    Given a graph where one spec is referenced by an edge from a live spec
    When get_archival_proof runs for the referenced spec
    Then the verdict is KEEP_FALSE_POSITIVE with a live inbound count of at least one

  @FR-45
  Scenario: SPECGEN004_158 archive_spec refuses to move a spec a live spec still references
    Given a graph where one spec is referenced by an edge from a live spec
    When archive_spec is asked to archive the referenced spec
    Then it refuses with ARCHIVE_BLOCKED and nothing is moved

  @FR-45
  Scenario: SPECGEN004_159 the mutation door seals the archive tree against writes
    Given the archive tree holds a spec
    When the door validates a write targeting that archived spec
    Then the write is refused as ARCHIVE_SEALED

  @feature46
  Scenario: SPECGEN004_450 conformance flags a DONE task that cites no scenario of its own
    Given a graph with a DONE task whose Done-When cites only its requirement, not its own scenario
    When conformance runs over the graph
    Then a TASK_NO_OWN_SCENARIO warning is raised for that task

  @feature46
  Scenario: SPECGEN004_451 conformance does not flag a DONE task that cites its own scenario id
    Given a graph with a DONE task whose Done-When cites its own SPECGEN scenario id which passed
    When conformance runs over the graph
    Then no TASK_NO_OWN_SCENARIO finding is raised for that task

  @feature46
  Scenario: SPECGEN004_162 get_trace surfaces a task's own scenario and its passing result
    Given a graph with a DONE task whose Done-When cites its own SPECGEN scenario id which passed
    When get_trace runs for that task's requirement
    Then the task's own_scenario is surfaced with its passing result

  @feature47
  Scenario: SPECGEN004_163 a design Decision links to its FR only via an explicit requirement line
    Given a DESIGN doc with one Decision citing its requirement on a Требование line and one citing a requirement only in prose
    When the design markdown is parsed
    Then a Decision node and an FR-to-Decision covers edge exist for the explicit one
    And the prose-only Decision is a node with no edge

  @feature47
  Scenario: SPECGEN004_164 conformance flags an FR with no covering design Decision
    Given a graph with an FR that no Decision covers
    When conformance checks the design leg of the graph
    Then an FR_NO_DESIGN warning is raised for that FR

  @feature47
  Scenario: SPECGEN004_165 get_trace surfaces an FR's design decisions
    Given a graph where a Decision covers an FR via an explicit requirement line
    When get_trace runs for that FR
    Then the FR's design_decisions include that Decision

  @feature47
  Scenario: SPECGEN004_166 a user Story links to its FR only via an explicit requirement line
    Given a USER_STORIES doc with one Story citing its requirement on a Требование line and one citing a requirement only in prose
    When the user-stories markdown is parsed
    Then a Story node and an FR-to-Story covers edge exist for the explicit one
    And the prose-only Story is a node with no edge

  @feature47
  Scenario: SPECGEN004_167 conformance flags an FR with no covering user Story
    Given a graph with an FR that no Story covers
    When conformance checks the story leg of the graph
    Then an FR_NO_STORY warning is raised for that FR

  @feature47
  Scenario: SPECGEN004_168 get_trace surfaces an FR's user stories
    Given a graph where a Story covers an FR via an explicit requirement line
    When get_trace runs for that requirement
    Then the FR's user_stories include that Story

  @feature47
  Scenario: SPECGEN004_169 fr-census is web-complete only with ALL six legs (AND, not OR)
    Given a graph with a fully-legged FR and a sibling FR missing only its research leg
    When fr-census computes the completeness verdict
    Then the fully-legged FR is web-complete and the other FR misses only research

  @feature47
  Scenario: SPECGEN004_170 conformance flags a Decision or Story that declares no requirement line
    Given a graph with a Decision and a Story that declare no requirement line, plus one labelled Decision
    When conformance checks the toothless-block guard
    Then TOOTHLESS_DECISION and TOOTHLESS_STORY fire for the unlabelled blocks but not the labelled one

  @feature48
  Scenario: SPECGEN004_171 the lifecycle machine accepts legal transitions and rejects illegal ones
    Given the task-lifecycle transition table
    When a status transition is checked
    Then todo to ready to in-progress to done and the done to in-progress reopen are legal but todo straight to done is rejected

  @feature48
  Scenario: SPECGEN004_172 starting an impl task needs the assembled chain but a spec-authoring task does not
    Given an FR whose chain is missing its design and story legs
    When the start gate evaluates an impl task and a spec-authoring task for that FR
    Then the impl task is blocked with the missing legs listed and the spec-authoring task is allowed

  @feature48
  Scenario: SPECGEN004_173 conformance flags an impl task in-progress whose requirement chain is not assembled
    Given a graph with an impl task in-progress whose FR lacks design and story
    When conformance checks the start gate
    Then a TASK_STARTED_WITHOUT_CHAIN warning is raised naming the missing legs

  @feature48
  Scenario: SPECGEN004_174 set_entity_status refuses an unbacked or illegal transition and writes a valid one
    Given a graph and the set_entity_status tool
    When a status change is requested for a task
    Then an illegal transition or an unassembled chain is refused with the reason and a valid transition writes through the door

  @feature48
  Scenario: SPECGEN004_175 set_entity_status refuses a derived entity and returns its computed verdict
    Given a graph with an FR and the set_entity_status tool
    When a status change is requested for that FR
    Then the change is refused as STATUS_DERIVED and the reply carries the FR census verdict

  @feature48
  Scenario: SPECGEN004_452 a phase STOP is confirmed through the door only past the ordering gate
    Given a temp spec whose Discovery STOP is not yet confirmed
    When phase status changes are requested through set_entity_status
    Then confirming the Requirements STOP first is refused for the unconfirmed prior STOP, a task-vocab status on a phase is illegal-for-type, and confirming the Discovery STOP writes stopConfirmed through the canonical writer

  @feature48
  Scenario: SPECGEN004_177 get_spec_status publishes the settable phase ids
    Given a temp spec with a known phase STOP state
    When get_spec_status reports the phase list for that spec
    Then its phases list carries the slug-qualified phase id and the stop-confirmed flag matching the progress file

  @feature48
  Scenario: SPECGEN004_180 set_entity_status resolves a bare local task id (+ optional spec), not only the composite slug:id
    Given a graph and the set_entity_status tool
    When a status change is requested by bare local task id
    Then the bare id resolves to the composite task node and is not 404ed

  @feature49
  Scenario: SPECGEN004_178 the task-census banner routes the next step only within the current spec
    Given a cached task census with a foreign busiest spec and a current spec next task
    When the per-prompt task-census banner renders for the current spec
    Then the banner names only the current spec task as the next step

  @feature49
  Scenario: SPECGEN004_480 the shared next-step router prioritizes agent todo then async then current spec
    Given the shared next-step router has an agent todo an active async job and a current spec task
    When the next-step route is selected across priority cases
    Then the route chooses agent todo before async before current spec and never a foreign backlog

  @feature49
  Scenario: SPECGEN004_179 the reconciler flags a stale in-progress marker but never auto-closes it
    Given an in-progress task whose mapped scenarios all passed plus a sibling in-progress task still red
    When the stale-marker reconciler scans the graph
    Then only the all-green in-progress task is flagged and the report points at set_entity_status to close it

  @feature49
  Scenario: SPECGEN004_181 the door refuses a .feature write that adds a stub scenario but accepts a real one
    Given a spec and the spec-mutation door
    When a write adds a scenario whose steps are still unfilled placeholders and then a fully-written scenario
    Then the door refuses the stub write with a strength-layer finding and accepts the real one

  @feature50
  Scenario: SPECGEN004_182 the mutation door refuses flipping a waived task to DONE
    Given a spec whose TASKS.md carries a task with a _waived: marker
    When a spec-change flips that waived task to DONE through the mutation door
    Then the door refuses the write with a TASK_WAIVED_CLOSED error finding

  @feature50
  Scenario: SPECGEN004_183 set_entity_status refuses closing a waived task with the waiver reason
    Given the set_entity_status tool and a waived task that is invisible to the graph by a non-enum status
    When a close to done is requested for that task
    Then the change is refused as WAIVED carrying the waiver reason rather than a NOT_FOUND

  @feature50
  Scenario: SPECGEN004_184 the parser lifts the waiver and the close-floor stays precise
    Given a graph with a waived DONE task a waived open task and a plain DONE task
    When conformance checks the waived-close floor
    Then only the waived and DONE task raises TASK_WAIVED_CLOSED and the other two do not

  @feature2
  Scenario: SPECGEN004_185 the gherkin parser inherits a feature-level tag onto its scenario node
    Given a .feature source whose Feature carries a tag and whose scenario has none of its own
    When the gherkin parser parses that source
    Then the produced scenario node carries the inherited feature-level tag

  @feature49
  Scenario: SPECGEN004_186 repository backlog does not activate Pinator without session ownership
    Given a task census with open backlog but no current-session work source
    When the real hook evaluates completion prose without an authoritative source
    Then the hook approves silently and does not create Pinator fire state

  # HISTORICAL: Pinator policy scenarios — superseded by .specs/pinator/; not a second live executor (CEGATE001 owns execution).
  @historical @superseded-by-pinator
  Scenario: SPECGEN004_187 legacy judge-prompt policy moved to pinator (historical; executor = CEGATE001)
    Given a judge input reporting twenty open tasks
    When the помогатор judge prompt is built
    Then the prompt states the open-task count and instructs a single JSON verdict line and keeps the clarifying-question carve-out

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_188 legacy judge-provider policy moved to pinator (historical; executor = CEGATE001)
    Given the помогатор judge endpoint resolver
    When it resolves an OpenRouter key a claude-mem key an auto-commit key an explicit override and no token at all
    Then OpenRouter-family keys pick openrouter.ai the auto-commit key picks aipomogator the explicit override wins and no token resolves to null

  @feature49
  Scenario: SPECGEN004_189 only the successfully mutated scoped spec becomes active through the collector
    Given a census with a foreign busiest spec plus current-spec unfinished work and the real claim-evidence-gate stop hook
    When the scoped collector receives one successful current-spec mutation
    Then only the mutated spec appears and the foreign busiest backlog stays out of context

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_190 legacy non-spec claim policy moved to pinator (historical; executor = CEGATE001)
    Given a census with a foreign busiest spec plus current-spec unfinished work and the real claim-evidence-gate stop hook
    When the hook judges a task-level fixed-it claim made after a tool ran
    Then the hook does not block it

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_191 legacy works-done evidence policy moved to pinator (historical; executor = CEGATE001)
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a works-done claim first with only an edit and then after a real run
    Then the hook blocks the edit-only claim and approves the one backed by a real run

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_192 legacy not-found evidence policy moved to pinator (historical; executor = CEGATE001)
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a not-found claim first after one search and then after two searches
    Then the hook blocks the under-searched claim and approves the one backed by enough searches

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_193 legacy verdict-grid evidence policy moved to pinator (historical; executor = CEGATE001)
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a verdict grid first with no tool and then after a tool ran
    Then the hook blocks the unbacked grid and approves the one backed by a tool run

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_194 legacy verified-via evidence policy moved to pinator (historical; executor = CEGATE001)
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a verified-via-command claim first with no matching tool and then after that command ran
    Then the hook blocks the unmatched marker and approves the one whose command actually ran

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_195 legacy clean-census claim policy moved to pinator (historical; executor = CEGATE001)
    Given a clean zero-open task census and the real claim-evidence-gate stop hook
    When the scoped collector receives one successful current-spec mutation
    Then the hook does not block it

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_196 legacy claim-classifier policy moved to pinator (historical; executor = CEGATE001)
    Given the claim-evidence-gate pure classifier functions
    When fenced-code verdicts a negated claim a prior-turn tool and an inline-code-plus-quote string are classified
    Then fenced verdicts do not fire negation is not a works-claim evidence is scoped to the current turn and stripCode removes code and quotes

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_197 legacy gate-mode policy moved to pinator (historical; executor = CEGATE001)
    Given the claim-evidence-gate stop hook under varying modes
    When it runs in shadow mode in disabled mode and against a missing transcript
    Then shadow approves but still logs a fire disabled approves outright and a missing transcript approves

  @historical @superseded-by-pinator
  Scenario: SPECGEN004_198 legacy anti-loop policy moved to pinator (historical; executor = CEGATE001)
    Given the claim-evidence-gate stop hook and an unsupported works-done continuation stop
    When the same continuation stop fires twice with stop_hook_active set
    Then the first fire blocks and the identical re-fire is released by the anti-loop

  @feature49
  Scenario: SPECGEN004_526 transcript todo replay updates by real task id rather than positional array index
    Given a captured transcript where TaskCreate and TaskUpdate events have sparse visible ids after compaction
    When the Pinator task replay reconstructs agent todos
    Then a completed visible task id closes that same real id and no array-slot stale todo remains open

  @feature49
  Scenario: SPECGEN004_571 intent extraction ignores interruption sentinels before terse continuations
    Given a Pinator mandate followed by interruption sentinels and a terse continuation prompt
    When the Pinator intent extractor computes the effective user request
    Then interruption sentinels are ignored and the Pinator mandate remains effective

  @feature49
  Scenario: SPECGEN004_572 failed TaskUpdate results do not reopen phantom todos
    Given a transcript where TaskUpdate for a missing task returns Task not found
    When the Pinator task replay reconstructs agent todos
    Then the missing-task update leaves no phantom open todo

  @feature49
  Scenario: SPECGEN004_527 duplicate agent todos cannot leave stale CARL evidence work as the next step
    Given the captured CARL transcript includes repeated Capture real CARL runtime evidence todos and a later completed duplicate with real evidence files
    When the shared next-step router selects the agent todo route
    Then the stale CARL evidence duplicate is collapsed or demoted and the route does not name it as the next step

  @feature49
  Scenario: SPECGEN004_528 Pinator logs provenance only for an active task-owned Stop
    Given one inactive Stop and one active task-owned Stop
    When Pinator fire logging is inspected after both Stops
    Then only the active Stop logs task provenance and context revision

  @feature49
  Scenario: SPECGEN004_533 the Stop-gate does not force the WS-F umbrella backlog after a narrow spec-generator-v4 report
    Given a scoped spec-generator-v4 census whose next open task is the WS-F umbrella backlog
    When the hook evaluates a narrow-task done report after that spec was touched
    Then the hook approves the report and never suggests the WS-F umbrella backlog as next

  @feature51
  Scenario: SPECGEN004_199 the migrator inventory classifies cases by how they exercise code
    Given a non-BDD test source with a spawning helper a pure call an fs read and a skipped case
    When the migrator inventories that source
    Then the helper-calling case is runtime the direct call is pure the fs case is artifact and the skipped case is manual

  @feature51
  Scenario: SPECGEN004_518 wire-feature promotes comment feature tags before wiring
    Given a feature text with a comment feature tag and a same-spec FR list
    When the wire-feature promotion helper prepares that feature for wiring
    Then the comment feature tag becomes a real Gherkin tag line with its control tag
    And the promoted feature parses to a tested-by edge for that FR
    And an unknown feature number is rejected before wiring

  @feature3
  Scenario: SPECGEN004_200 the wiki-link resolver resolves ids and slug aliases strips fragments and flags broken targets
    Given the graph wiki-link resolver and a registry of node locations
    When it resolves a compact id a slug alias an unknown target an alias-plus-fragment a same-file fragment and multiple links on one line
    Then ids and slug aliases resolve identically unknown targets are broken the alias and fragment are stripped a same-file fragment is empty-but-not-broken and line numbers are recorded

  @feature32
  Scenario: SPECGEN004_201 the coverage scenarioKey normaliser canonicalises ids including non-v4 prefixes and ignores prose
    Given the coverage scenarioKey normaliser
    When it normalises a slug node id a raw Done-When mention a legacy-typo id a named non-v4 id and plain prose
    Then it yields canonical scenario ids tolerates the legacy SCENGEN typo and returns null for prose

  @feature32
  Scenario: SPECGEN004_202 bucketScenarios conserves every scenario and routes each result to one bucket
    Given a set of scenarios with mixed results including an absent and an unknown one
    When bucketScenarios partitions them
    Then every scenario lands in exactly one bucket the results route to the right buckets and an absent result is not_run while UNDEFINED-or-unknown stays undefined

  @feature32
  Scenario: SPECGEN004_203 mapTasksToScenarios links a task to its scenarios by id tag and FR-ref and de-dupes
    Given a coverage scenario set tagged with SPECGEN ids @featureN tags and FR refs
    When tasks are mapped by explicit id by tag by FR-ref and by multiple overlapping sources
    Then each task resolves to the right scenarios and a scenario reached by overlapping sources appears once

  @feature32
  Scenario: SPECGEN004_204 specOf derives the spec slug from a spec path on both separators and is undefined elsewhere
    Given the coverage specOf path helper
    When it reads a POSIX spec path a Windows spec path and a path outside the specs tree
    Then it derives the slug for both separators and returns undefined outside the specs tree

  @feature32
  Scenario: SPECGEN004_205 task-to-scenario mapping scopes to the task's own spec to survive a cross-spec featureN collision
    Given two specs sharing a featureN tag where only the first spec's scenario ran
    When a task in the first spec is mapped by FR-ref by tag by explicit id and as a legacy unscoped task
    Then FR-ref and tag matches scope to the first spec its task is DONE an explicit id is never scoped and a legacy unscoped task stays IN_PROGRESS

  @feature32
  Scenario: SPECGEN004_206 verifiedStatus is DONE only when every mapped scenario passed
    Given a bucket-by-id map with two passed scenarios and one undefined
    When verifiedStatus is asked for no scenarios for the two passed and for a passed-plus-undefined mix
    Then it is unverified with none DONE with all passed and IN_PROGRESS as soon as one is non-green

  @feature32
  Scenario: SPECGEN004_207 computeCoverage reconciles totals and never marks a task with an unrun scenario DONE
    Given a coverage run over one passed and one undefined scenario with a done a mixed and an orphan task
    When computeCoverage scores them end to end
    Then the bucket totals reconcile with the scenario count the done task is DONE the mixed task IN_PROGRESS the orphan task unverified and a TESTQUAL own-scenario task is DONE without same-feature siblings

  @feature46
  Scenario: SPECGEN004_208 get_trace surfaces each task's own cited scenario and its last result
    Given a graph where one task cites its own SPECGEN scenario in Done-When another cites its own TESTQUAL scenario and a third does not
    When get_trace is asked for the shared FR
    Then the citing tasks own_scenario resolves to each scenario with its last result and the other task own_scenario is null

  @feature3
  Scenario: SPECGEN004_209 parseMarkdown registers triple anchors for a legacy Requirement heading and the v4 pair without regression
    Given the markdown parser with legacy v3 and modern v4 spec headings
    When it parses a legacy Requirement heading a modern v4 heading a mixed file and a legacy title
    Then a legacy heading registers three aliases at one location the v4 heading keeps the two-anchor pair a mixed file registers each heading's own anchors and the legacy title slugifies into the legacy alias

  @feature40
  Scenario: SPECGEN004_210 the rename helpers find inbound links across the corpus and retarget them preserving fragments
    Given a spec corpus with same-spec cross-spec self and external links to a target doc
    When the rename helpers find the inbound links and rewrite them to a new doc name
    Then self-links and external URLs are excluded fragments are preserved and each referencing file is retargeted once to the new name

  @feature2
  Scenario: SPECGEN004_211 buildGraph cold-start merges MD and Gherkin into one graph with composite keys edges and dual anchors
    Given a synthetic spec corpus with FR and AC docs and a spec-owned feature
    When buildGraph runs cold-start over it
    Then MD nodes and the scenario share composite spec-keyed ids covers and tested-by edges link them dual anchors register in definitions and the FR body and bare anchors are preserved

  @feature2
  Scenario: SPECGEN004_212 buildGraph ingests an NDJSON run survives a malformed feature and stamps version and timestamp
    Given a corpus with a feature plus an NDJSON test-run and separately a corpus with a malformed feature
    When buildGraph runs with NDJSON ingest and again over the malformed corpus
    Then the matching scenario gets its lastResult duration and last-result edge the malformed feature does not abort the build and every graph carries version 1 and a builtAt timestamp

  @feature2
  Scenario: SPECGEN004_213 parseMarkdown extracts FR NFR and AC nodes with anchors and emits covers edges
    Given FR NFR and AC headings including a categorised NFR a plain NFR and a dotted AC
    When parseMarkdown extracts them
    Then each FR and NFR node carries compact and slug anchors the NFR category is read where present and each AC emits a covers edge to its parent FR

  @feature2
  Scenario: SPECGEN004_214 parseMarkdown preserves order and lines ignores non-spec headings slugifies predictably and emits nothing for a plain file
    Given a multi-heading spec a file with non-spec headings a cyrillic-titled FR and a plain readme
    When parseMarkdown processes each
    Then nodes keep source order with 1-indexed lines non-spec headings are ignored a cyrillic title slugifies to an ascii slug and a plain file yields no nodes edges or anchors

  @feature2
  Scenario: SPECGEN004_215 parseMarkdown handles migrated short headings with relocated bold titles and a dot-removed AC slug
    Given short-form FR NFR and AC headings with titles relocated to bold lines and the old long forms
    When parseMarkdown reads them
    Then a short FR or NFR takes its bold title with a short slug a short AC reads its parent FR from the requirement line plus a dot-removed slug and the old long forms still work unchanged

  @feature40
  Scenario: SPECGEN004_216 the optimistic-CAS primitives hash content deterministically and gate a write against a stale read
    Given the mutation door CAS primitives and a spec doc on disk
    When docSha hashes content and casCheck compares an expected sha to the current doc
    Then docSha is a deterministic sha256 sensitive to content casCheck is ok on a match returns the actual sha on a mismatch and yields a null sha for a missing doc

  @feature39
  Scenario: SPECGEN004_217 the MCP server resolves its repo root from the env only when it is a real specs dir else falls back to cwd
    Given a real repo dir and a cwd both holding a specs tree
    When resolveRepoRoot is given a valid env path the unresolved project-dir literal a no-specs path and an empty env
    Then it trusts a valid env path and falls back to cwd for the literal a no-specs path and an empty or missing env

  @feature9
  Scenario: SPECGEN004_218 detectRunner picks the runner from the meta envelope normalises SpecFlow and stays resilient
    Given NDJSON meta envelopes naming various runners plus an absent-meta and a malformed-leading-line input
    When detectRunner reads each
    Then it names cucumber-js reqnroll cucumber-jvm and behave normalises SpecFlow to reqnroll returns unknown for an unknown name or absent meta and recovers past a malformed leading line

  @feature9
  Scenario: SPECGEN004_219 ingestMultilang produces the canonical PASSED patch for each runner equivalent to parseNdjson
    Given multi-language NDJSON streams from Reqnroll behave and cucumber-jvm
    When ingestMultilang ingests each
    Then it reports the detected language and a patch keyed by the scenario location with PASSED matching parseNdjson directly

  @feature32
  Scenario: SPECGEN004_220 parseNdjson on a real captured cucumber run keys by POSIX path and never collapses non-passed scenarios
    Given the real captured cucumber NDJSON fixture
    When parseNdjsonFile parses it
    Then it yields exactly three scenarios keyed by POSIX paths with the passing one PASSED and the pending and undefined ones not collapsed to PASSED

  @feature52
  Scenario: SPECGEN004_221 the test-guard blocks every host cucumber and run-bdd run and routes to Docker
    Given the test-guard PreToolUse hook is the canonical Bash guard
    When a full host cucumber run hits the default config
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a host cucumber run is filtered by name
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a host cucumber run is filtered by tag as a batch
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a full host run-bdd invocation has no filter
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a host run-bdd invocation is filtered by name
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a dry-run host cucumber pass hits the default config
    Then the guard denies it with exit 2 and routes to docker-bdd
    When a docker-bdd.sh invocation runs the suite in Docker
    Then the guard allows it with exit 0
    When an npm test:bdd invocation reaches the guard
    Then the guard allows it with exit 0
    When a git commit message merely mentions a cucumber run
    Then the guard allows it with exit 0

    When the package BDD script is inspected
    Then test:bdd routes to docker-bdd
    When the docker-bdd runner is inspected
    Then docker-bdd invokes run-bdd inside Docker instead of raw cucumber
    When the BDD runner instructions are inspected
    Then they route filtered BDD diagnostics through docker-bdd and not host cucumber

  @feature49
  Scenario: SPECGEN004_222 task lifecycle rather than stop streak controls eligibility
    Given an open task lifecycle followed by successful completion
    When the task is collected before and after its successful completed update
    Then the task source activates only while the task remains open

  @feature49
  Scenario: SPECGEN004_223 blocker prose alone never arms Pinator
    Given blocker prose with no current-session work source
    When the real hook evaluates the blocker prose in ordinary dialogue
    Then blocker prose neither activates Pinator nor creates state

  @feature45
  Scenario: SPECGEN004_224 investigateDrifted recommends KEEP_DRIFTED when README marks shipped and impl exists on disk
    Given a drifted spec whose README marks it as shipped and whose claimed impl exists on disk
    When investigateDrifted runs on that spec
    Then the investigation recommends KEEP_DRIFTED with shipped=true and codePresent=true

  @feature45
  Scenario: SPECGEN004_225 investigateDrifted recommends KEEP_DRIFTED when impl moved to tools/ keeping its basename
    Given a drifted spec whose FILE_CHANGES points to an old v1 path but the file moved to tools/ keeping its basename
    When investigateDrifted runs on that spec
    Then the investigation recommends KEEP_DRIFTED with shipped=false and codePresent=true because the basename was found at the moved path

  @feature45
  Scenario: SPECGEN004_226 investigateDrifted recommends RETIRE_CANDIDATE when no shipped marker and impl absent
    Given a drifted spec with no shipped marker and its claimed impl absent from disk
    When investigateDrifted runs on that spec
    Then the investigation recommends RETIRE_CANDIDATE with codePresent=false

  @feature45
  Scenario: SPECGEN004_227 investigateDrifted recommends RETIRE_CANDIDATE without throwing when spec docs are missing
    Given a spec directory that exists but contains no README or FILE_CHANGES
    When investigateDrifted runs on that spec
    Then the investigation recommends RETIRE_CANDIDATE without throwing

  @feature25
  Scenario: SPECGEN004_228 hookIdentity strips bootstrap launcher noise and extension chains returning stable basename
    Given the hook identity utility is available
    When hookIdentity is called on a bootstrap-launched .ts command, a bundle spawn, a sh script, and a capture with --event
    Then it returns the script basename without extension chain and appends --event when present

  @feature25
  Scenario: SPECGEN004_229 settings.json and hooks.json declare the same Stop hooks
    Given the canonical hooks.json and the dogfood settings.json are both present
    When the registry parity check runs for the Stop event
    Then both registries declare identical hook identities for that event

  @feature25
  Scenario: SPECGEN004_230 settings.json and hooks.json declare the same SessionStart hooks
    Given the canonical hooks.json and the dogfood settings.json are both present
    When the registry parity check runs for the SessionStart event
    Then both registries declare identical hook identities for that event

  @feature25
  Scenario: SPECGEN004_231 settings.json and hooks.json declare the same PreToolUse hooks
    Given the canonical hooks.json and the dogfood settings.json are both present
    When the registry parity check runs for the PreToolUse event
    Then both registries declare identical hook identities for that event

  @feature25
  Scenario: SPECGEN004_232 settings.json and hooks.json declare the same PostToolUse hooks
    Given the canonical hooks.json and the dogfood settings.json are both present
    When the registry parity check runs for the PostToolUse event
    Then both registries declare identical hook identities for that event

  @feature25
  Scenario: SPECGEN004_233 settings.json and hooks.json declare the same UserPromptSubmit hooks
    Given the canonical hooks.json and the dogfood settings.json are both present
    When the registry parity check runs for the UserPromptSubmit event
    Then both registries declare identical hook identities for that event

  @feature12
  Scenario: SPECGEN004_234 detectComplexity routes to architecture-research-workflow on Russian "архитектура" keyword
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a prompt containing the Russian "архитектура" keyword
    Then the verdict is "use-architecture-research-workflow" and at least one keyword hit is recorded

  @feature12
  Scenario: SPECGEN004_235 detectComplexity routes to architecture-research-workflow on English "rebuild" keyword
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with an English "rebuild" keyword
    Then the verdict is "use-architecture-research-workflow"

  @feature12
  Scenario: SPECGEN004_236 detectComplexity routes to architecture-research-workflow on version-bump keyword like "v4"
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a version-bump keyword like "v4"
    Then the verdict is "use-architecture-research-workflow" for version prompts

  @feature12
  Scenario: SPECGEN004_237 detectComplexity routes to architecture-research-workflow when ≥3 PascalCase component nouns are present
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a prompt that lists ≥3 PascalCase component nouns
    Then the verdict is "use-architecture-research-workflow" and at least 3 components are detected

  @feature12
  Scenario: SPECGEN004_238 detectComplexity routes to regular research-workflow when no keyword and fewer than 3 component nouns
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a plain prompt with no keyword and fewer than 3 component nouns
    Then the verdict is "use-research-workflow"

  @feature12
  Scenario: SPECGEN004_239 detectComplexity keyword wins over component count (early exit)
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a prompt containing both a keyword and ≥3 component nouns
    Then the verdict is "use-architecture-research-workflow" with the reason citing keywords not components

  @feature12
  Scenario: SPECGEN004_240 detectComplexity explains the verdict in plain language
    Given the create-spec complexity heuristic is available
    When detectComplexity is called with a simple refactor prompt
    Then the verdict is "use-research-workflow" and the reason mentions no architecture keyword and the threshold

  @feature33
  Scenario: SPECGEN004_241 orchestrator WORKFLOW routes coverage and honesty-gate steps to get_spec_status MCP tool
    Given the orchestrator feature-map routing table is loaded
    When the coverage and honesty-gate workflow steps are inspected
    Then every coverage and honesty-gate step delegates to the get_spec_status MCP tool and never re-implements it

  @feature33
  Scenario: SPECGEN004_242 every WORKFLOW worker appears in the REFERENCED_CAPABILITIES set
    Given the orchestrator feature-map routing table is loaded
    When each WORKFLOW step's worker is cross-checked against REFERENCED_CAPABILITIES
    Then every WORKFLOW worker appears in the referenced-capability set

  @feature33
  Scenario: SPECGEN004_243 checkFeatureMapDrift is clean when actual capabilities are a subset of referenced
    Given the orchestrator feature-map routing table is loaded
    When checkFeatureMapDrift is called with the REFERENCED_CAPABILITIES set as the actual surface
    Then the drift check reports ok with no unreferenced capabilities

  @feature33
  Scenario: SPECGEN004_244 checkFeatureMapDrift fails and names an unknown capability
    Given the orchestrator feature-map routing table is loaded
    When checkFeatureMapDrift is called with a surface that includes an unknown capability "brand_new_tool"
    Then the drift check reports not-ok and names "brand_new_tool" as unreferenced

  @feature33
  Scenario: SPECGEN004_245 the live MCP registry and worker skills have no drift against the orchestrator feature-map
    Given the orchestrator feature-map routing table is loaded
    When checkFeatureMapDrift is called against the live MCP registry and worker skills
    Then the live capability surface has no drift against the orchestrator feature-map

  @feature42
  Scenario: SPECGEN004_246 checkToolConsumers flags a live MCP tool with no declared skill consumer
    Given the orchestrator feature-map routing table is loaded
    When checkToolConsumers is called with a surface that includes "naked_new_tool" with no declared consumer
    Then the consumer check reports not-ok and names "naked_new_tool" as unconsumed

  @feature42
  Scenario: SPECGEN004_247 every live MCP registry tool has a declared skill consumer
    Given the orchestrator feature-map routing table is loaded
    When checkToolConsumers is called against the live MCP tool registry
    Then every live MCP tool has at least one declared skill consumer

  @feature42
  Scenario: SPECGEN004_248 verifyConsumerTruthfulness flags a consumer skill that never references its declared tool
    Given the orchestrator feature-map routing table is loaded
    When verifyConsumerTruthfulness is called with an injected reader where "some-skill" never mentions "some_tool"
    Then the truth check reports not-ok and the message names "some-skill" and "some_tool"

  @feature42
  Scenario: SPECGEN004_249 the real TOOL_CONSUMERS table is truthful every consumer skill genuinely references its tool
    Given the orchestrator feature-map routing table is loaded
    When verifyConsumerTruthfulness is called against the real TOOL_CONSUMERS table and real SKILL.md files
    Then every consumer skill in TOOL_CONSUMERS genuinely references its declared tool in its SKILL.md

  # ── FR-41 phase-runner unit behaviours (folded from phase-runner.test.ts) ──

  @feature41
  Scenario: SPECGEN004_250 phase runner hard-fails when discovery retry budget exhausted
    Given a phase runner configured with maxRetries 2 for all phases
    When the discovery phase gate returns RED on every attempt
    Then runPhases returns ok=false with failedPhase "discovery"
    And discovery was spawned exactly 3 times before hard-failing

  @feature41
  Scenario: SPECGEN004_251 phase runner exception safety throwing gate consumes retry budget and ends with hard fail
    Given a phase runner where the discovery gate throws on every call
    When the orchestrator runs phases with budget 2
    Then runPhases returns ok=false and the events include a gate-red entry matching /threw/

  @feature41
  Scenario: SPECGEN004_252 productionSpawn and productionGate are exported callable functions
    Given the phase-runner module is imported
    Then productionSpawn is exported and is a function
    And productionGate is exported and is a function

  # ── FR-11 tag-predictor pure-function unit tests (folded from tag-predictor.test.ts) ──

  @feature11
  Scenario: SPECGEN004_253 predictTags suggests FR-001 for an untagged User logs in scenario (FR-11 worked example)
    Given a feature file with an untagged scenario "User logs in"
    When predictTags is called with the standard FR catalog
    Then the suggestion for "User logs in" is "@FR-001" with a positive score

  @feature11
  Scenario: SPECGEN004_254 predictTags skips an already-tagged scenario with alreadyTagged true and no suggestion
    Given a feature file with an already-tagged scenario "@FR-002" "Export the monthly report"
    When predictTags is called with the standard FR catalog
    Then the suggestion has alreadyTagged=true and suggestedTag=null

  @feature11
  Scenario: SPECGEN004_255 predictTags does not force a tag when no FR is relevant
    Given a feature file with an untagged scenario about an unrelated topic
    When predictTags is called with the standard FR catalog
    Then the suggestion has suggestedTag=null and frId=null

  @feature11
  Scenario: SPECGEN004_256 predictTags handles Scenario Outline and returns one suggestion per scenario
    Given a feature file with a regular Scenario and a Scenario Outline
    When predictTags is called with the standard FR catalog
    Then predictTags returns two suggestions
    And the first suggestion is "@FR-001" and the second is "@FR-002"

  @feature11
  Scenario: SPECGEN004_257 predictTags respects a high threshold suppressing weak matches
    Given a feature file with a weakly-matching untagged scenario "User logs in somewhere else entirely today"
    When predictTags is called with threshold 0.9
    Then the suggestion has suggestedTag=null because the score is below the threshold

  @feature11
  Scenario: SPECGEN004_258 tokenize lowercases splits on non-word and drops stopwords and short tokens
    When tokenize is called with "The User logs IN to a System"
    Then the result is ["logs"]

  @feature11
  Scenario: SPECGEN004_259 extractFrs handles both v3 and v4 FR heading formats
    Given an FR.md string with v3 heading "### Requirement: FR-7 Marksman LSP" and v4 heading "## FR-8: Semantic judge"
    When extractFrs is called on that markdown
    Then the result has frIds ["FR-7", "FR-8"] and the first title is "Marksman LSP"

  @feature11
  Scenario: SPECGEN004_260 renderTagSuggestions lists only untagged scenarios with their suggestion
    Given a feature file with one already-tagged and one untagged scenario
    When renderTagSuggestions is called with predictions from that feature file
    Then the rendered output contains "User logs in" and "@FR-001" but NOT "Export report"

  @feature11
  Scenario: SPECGEN004_261 renderTagSuggestions returns empty string when every scenario is already tagged
    Given a feature file where every scenario is already tagged
    When renderTagSuggestions is called on that file
    Then the rendered output is an empty string

  # ── converter pure-function tests (FR-11) ──────────────────────────────────

  @feature11
  Scenario: SPECGEN004_262 convertSource converts ## legacy heading to v4 format
    Given a v3 source with `## Requirement: FR-001 Login flow`
    When convertSource is called on that source
    Then the result has changed=true with before `## Requirement: FR-001 Login flow` and after `## FR-001: Login flow`
    And newSource contains `## FR-001: Login flow` and does NOT contain `Requirement: FR-001`

  @feature11
  Scenario: SPECGEN004_263 convertSource converts ### legacy heading to v4 format
    Given a v3 source with `### Requirement: FR-001 Login flow`
    When convertSource is called on that source
    Then the result has changed=true with before `### Requirement: FR-001 Login flow` and after `### FR-001: Login flow`
    And newSource contains `### FR-001: Login flow` and does NOT contain `Requirement: FR-001`

  @feature11
  Scenario: SPECGEN004_264 convertSource converts #### legacy heading to v4 format
    Given a v3 source with `#### Requirement: FR-001 Login flow`
    When convertSource is called on that source
    Then the result has changed=true with before `#### Requirement: FR-001 Login flow` and after `#### FR-001: Login flow`
    And newSource contains `#### FR-001: Login flow` and does NOT contain `Requirement: FR-001`

  @feature11
  Scenario: SPECGEN004_265 convertSource is idempotent on a modern v4 heading
    Given a source with modern v4 heading `### FR-001: Login`
    When convertSource is called on that source
    Then the result has changed=false and newSource equals the input byte-for-byte

  @feature11
  Scenario: SPECGEN004_266 convertSource preserves body content and Jira trace lines byte-for-byte
    Given a v3 source with a legacy heading and a Jira trace line `_Jira: PROJ-42_`
    When convertSource is called on that source
    Then newSource contains `_Jira: PROJ-42_` and `Body paragraph with` and `## FR-001: Login`

  @feature11
  Scenario: SPECGEN004_267 convertSource handles multiple legacy headings in one file
    Given a v3 source with two legacy headings FR-001 and FR-002
    When convertSource is called on that source
    Then the result has 2 changes with frIds ["FR-001", "FR-002"]

  @feature11
  Scenario: SPECGEN004_268 convertSource returns changed=false when no legacy headings present
    Given a source with no legacy headings (only `# Doc` and `## Section`)
    When convertSource is called on that source
    Then the result has changed=false and an empty changes array

  @feature11
  Scenario: SPECGEN004_269 convertSource does not match Requirement: in body prose
    Given a source where `Requirement: FR-001` appears only in body prose, not as a heading
    When convertSource is called on that source
    Then convertSource returns changed=false (heading-anchored regex does not match prose)

  @feature11
  Scenario: SPECGEN004_270 renderDiff returns empty string when nothing changed
    Given a conversion result with changed=false for `# Doc`
    When renderDiff is called with filename `test.md`
    Then the diff output is an empty string

  @feature11
  Scenario: SPECGEN004_271 renderDiff emits a unified-diff-ish block per change
    Given a conversion result from `## Requirement: FR-001 Login`
    When renderDiff is called with filename `.specs/auth/FR.md`
    Then the diff output contains `--- .specs/auth/FR.md (v3)` and `+++ .specs/auth/FR.md (v4)`
    And the diff output contains `- ## Requirement: FR-001 Login` and `+ ## FR-001: Login`

  # ── spec-backlog classifier pure-function tests (FR-17) ────────────────────

  @feature17
  Scenario: SPECGEN004_272 classify routes concept-overlap to NOISE
    Given a finding with code `cross-spec/concept-overlap` and severity INFO
    When classify is called on that finding for slug `foo`
    Then the classification verdict is NOISE

  @feature17
  Scenario: SPECGEN004_273 classify routes missing-cross-ref to BACKLOG/cross-ref-linker and strips .specs/ prefix
    Given a finding with code `cross-spec/missing-cross-ref`, spec_a `.specs/foo`, spec_b `.specs/bar`
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with category `missing-cross-ref` and resolver `cross-ref-linker`

  @feature17
  Scenario: SPECGEN004_274 classify routes dead-link sibling-spec target to BACKLOG missing-spec-file
    Given a finding with code `impl-drift/dead-link` and expected_path `ACCEPTANCE_CRITERIA.md`
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with category `missing-spec-file` and resolver `ac-author`

  @feature17
  Scenario: SPECGEN004_275 classify routes dead-link with case-typo extension to AUTO_FIX
    Given a finding with code `impl-drift/dead-link` and expected_path `guide.MD` (uppercase extension)
    When classify is called on that finding for slug `foo`
    Then the classification verdict is AUTO_FIX

  @feature17
  Scenario: SPECGEN004_276 classify routes dead-link multi-segment path to BACKLOG dead-link-typo
    Given a finding with code `impl-drift/dead-link` and expected_path `tools/spec-graph/missing.ts`
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with category `dead-link-typo` and resolver `link-fixer`

  @feature17
  Scenario: SPECGEN004_277 classify routes missing-test to BACKLOG scenario-writer
    Given a finding with code `impl-drift/missing-test` and severity INFO
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with resolver `scenario-writer`

  @feature17
  Scenario: SPECGEN004_278 classify routes module-ownership-conflict to BACKLOG owner-picker difficulty hard
    Given a finding with code `cross-spec/module-ownership-conflict` and severity CRITICAL
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with resolver `owner-picker` and difficulty `hard`

  @feature17
  Scenario: SPECGEN004_279 classify routes contradictory-nfr to BACKLOG decision-arbiter
    Given a finding with code `cross-spec/contradictory-nfr` and severity CRITICAL
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with resolver `decision-arbiter`

  @feature17
  Scenario: SPECGEN004_280 classify routes unrecognised codes to BACKLOG human with no silent loss
    Given a finding with an unrecognised code `made-up/code`
    When classify is called on that finding for slug `foo`
    Then the classification verdict is BACKLOG with category `unrecognised` and resolver `human`

  @feature17
  Scenario: SPECGEN004_281 classify with repo context routes dead-link no-match to NOISE
    Given a finding with code `impl-drift/dead-link` and expected_path `tools/no-such-dir/no-such-file-xyz-zzz-12345.ts`
    When classify is called with repo context for slug `foo`
    Then the classification verdict is NOISE because the file does not exist anywhere in the repo

  @feature17
  Scenario: SPECGEN004_282 classify with repo context routes dead-link one-match to BACKLOG dead-link-typo
    Given a finding with code `impl-drift/dead-link` and expected_path `tools/spec-backlog/classifier.ts`
    When classify is called with repo context for slug `foo`
    Then the classification verdict is BACKLOG with category `dead-link-typo` (exactly one basename match)

  @feature17
  Scenario: SPECGEN004_283 classify without repoRoot falls back to dead-link-typo for backward compat
    Given a finding with code `impl-drift/dead-link` and expected_path `tools/something/that-may-or-may-not-exist.ts`
    When classify is called WITHOUT repo context for slug `foo`
    Then the classification verdict is BACKLOG with category `dead-link-typo` (backward compat, no repoRoot)

  @feature51
  Scenario: SPECGEN004_287 parseScenarios conserves cardinality — N Scenario lines yield N entries with no duplicates
    Given a feature text with a real-tagged scenario a comment-tagged scenario and an untagged letter-suffix scenario
    When parseScenarios is called on that feature text
    Then it returns exactly 3 ScenarioInfo entries with no duplicates

  @feature51
  Scenario: SPECGEN004_288 parseScenarios detects tag-state real comment and none in order
    Given a feature text with a real-tagged scenario a comment-tagged scenario and an untagged letter-suffix scenario
    When parseScenarios is called on that feature text
    Then the tag states are "real" "comment" and "none" in order

  @feature51
  Scenario: SPECGEN004_289 parseScenarios keeps letter-suffix id distinct from its base — regression SRC001_05b vs SRC001_05
    Given a feature text with a real-tagged scenario a comment-tagged scenario and an untagged letter-suffix scenario
    When parseScenarios is called on that feature text
    Then the ids are "SRC001_02" "SRC001_05" and "SRC001_05b" keeping the letter suffix distinct

  @feature17
  Scenario: SPECGEN004_290 listResolvers returns all 8 canonical resolver names
    Given the spec-backlog resolver registry is loaded
    When listResolvers() is called
    Then it returns exactly 8 resolvers with names matching the canonical set

  @feature17
  Scenario: SPECGEN004_291 findResolver returns the matching instance for each canonical name
    Given the spec-backlog resolver registry is loaded
    When findResolver is called with each of the 8 canonical resolver names
    Then each call returns a Resolver whose name matches the lookup key

  @feature17
  Scenario: SPECGEN004_292 findResolver returns undefined for an unknown resolver name
    Given the spec-backlog resolver registry is loaded
    When findResolver is called with an unknown resolver name "does-not-exist"
    Then findResolver returns undefined

  @feature17
  Scenario: SPECGEN004_293 every resolver in the registry exposes the Resolver interface
    Given the spec-backlog resolver registry is loaded
    When listResolvers() is called
    Then every resolver exposes name description and resolve() with correct types

  @feature21
  Scenario: SPECGEN004_294 spec-status task-table exits 1 with error when TASKS.md is absent
    Given a spec directory with no TASKS.md file
    When spec-status runs with the task-table format on that empty spec
    Then the CLI exits with status 1 and stderr contains "TASKS.md not found"

  @feature58
  Scenario: SPECGEN004_295 form-guards-dispatch routes violating TASKS.md to task-form-guard and propagates deny
    Given a v3 spec directory with a progress.json marking version 3
    When form-guards-dispatch receives a Write for a violating TASKS.md in that spec
    Then the dispatcher exits 2 and the stdout JSON carries permissionDecision deny mentioning task-form-guard

  @feature58
  Scenario: SPECGEN004_296 form-guards-dispatch lets a guard-clean TASKS.md through with exit 0
    Given a v3 spec directory with a progress.json marking version 3
    When form-guards-dispatch receives a Write for a valid TASKS.md in that spec
    Then the dispatcher exits 0 with no deny output

  @feature58
  Scenario: SPECGEN004_297 form-guards-dispatch routes violating USER_STORIES.md to user-story-form-guard and propagates deny
    Given a v3 spec directory with a progress.json marking version 3
    When form-guards-dispatch receives a Write for a violating USER_STORIES.md in that spec
    Then the dispatcher exits 2 and the stdout JSON carries permissionDecision deny mentioning user-story-form-guard

  @feature58
  Scenario: SPECGEN004_298 form-guards-dispatch fast-exits 0 without spawning a guard for non-spec paths and non-target basenames
    Given a v3 spec directory with a progress.json marking version 3
    When form-guards-dispatch receives a Write for a path outside .specs or for a non-target basename NOTES.md
    Then the dispatcher exits 0 with empty stdout

  @feature33
  Scenario: SPECGEN004_299 readLedger preserves insertion order and pendingReminder returns most-recent-first across two entries
    Given two pending ledger entries appended in order with distinct observations affected-files and timestamps
    When readLedger and pendingReminder are called on that ledger
    Then readLedger returns entries in insertion order older-first
    And pendingReminder returns observations newer-first

  @feature25
  Scenario: SPECGEN004_300 additiveMergeHooks preserves every v3 hook entry after merge
    Given a v3 hooks manifest with five named hook commands across PreToolUse and PostToolUse matchers
    Then the merged manifest JSON still contains every v3 command string

  @feature25
  Scenario: SPECGEN004_301 additiveMergeHooks places v4 entries in the correct existing matcher group without creating a duplicate group
    Given a v3 hooks manifest with five named hook commands across PreToolUse and PostToolUse matchers
    When additiveMergeHooks merges the v4 additions into the v3 manifest
    Then the PreToolUse Write|Edit matcher group contains v3 entries followed by the v4 spec-conformance-guard entry

  @feature25
  Scenario: SPECGEN004_302 additiveMergeHooks is idempotent — merging the v4 additions twice equals merging once
    Given a v3 hooks manifest with five named hook commands across PreToolUse and PostToolUse matchers
    When additiveMergeHooks is called once on v3 and v4
    And additiveMergeHooks is called a second time on the already-merged result and v4
    Then the twice-merged manifest deep-equals the once-merged manifest

  @feature25
  Scenario: SPECGEN004_303 hook count after additiveMergeHooks grows by exactly the number of new v4 entries
    Given a v3 hooks manifest with five named hook commands across PreToolUse and PostToolUse matchers
    When countHookEntries is called before and after the merge
    Then the count after merge equals the count before plus the number of new v4 entries

  @feature25
  Scenario: SPECGEN004_304 additiveMergeHooks adds a new event type entirely absent from v3 as a new group
    Given a v3 hooks manifest that has no Stop event
    When additiveMergeHooks merges a new Stop event entry into the v3 manifest
    Then the merged manifest has a Stop event group containing the new entry

  @feature35
  Scenario: SPECGEN004_305 the real test-quality Stop hook process blocks on a DONE-untested task in ENFORCE mode
    Given a git repo containing a spec with a task marked DONE but with no linked scenario
    When the real test-quality Stop hook process runs against that repo in ENFORCE mode
    Then the hook exits 0 and the stdout JSON carries decision block with a reason matching TASK_UNTESTED

  @feature35
  Scenario: SPECGEN004_306 enforce is the default — the Stop hook blocks even with no TEST_QUALITY_GATE_ENABLED env set
    Given a git repo containing a spec with a task marked DONE but with no linked scenario
    When the real test-quality Stop hook process runs against that repo with no TEST_QUALITY_GATE_ENABLED env
    Then the hook exits 0 and the stdout JSON carries decision block even without the env var set

  @feature35
  Scenario: SPECGEN004_307 the Stop hook in SHADOW mode approves but emits a would-block warning to stderr
    Given a git repo containing a spec with a task marked DONE but with no linked scenario
    When the real test-quality Stop hook process runs against that repo in SHADOW mode
    Then the hook exits 0 with empty stdout and stderr contains "would block"

  @feature35
  Scenario: SPECGEN004_308 the Stop hook approves immediately when stop_hook_active is true in the input
    Given a git repo containing a spec with a task marked DONE but with no linked scenario
    When the real test-quality Stop hook process runs against that repo with stop_hook_active true in the input JSON
    Then the hook exits 0 with empty stdout and does not emit a block decision

  @feature35
  Scenario: SPECGEN004_309 the TEST_QUALITY_GATE_SKIP=1 env escape allows the Stop to proceed and logs the escape
    Given a git repo containing a spec with a task marked DONE but with no linked scenario
    When the real test-quality Stop hook process runs against that repo with env escape TEST_QUALITY_GATE_SKIP=1
    Then the hook exits 0 with empty stdout approving the Stop despite the untested task

  @feature35
  Scenario: SPECGEN004_310 parseModifiedSpecSlugs excludes untracked specs from the scope
    Given a git status porcelain output with an untracked spec, a modified tracked spec, and a new tracked spec
    Then parseModifiedSpecSlugs returns only the tracked-modified and newly-staged slugs, excluding the untracked one

  @feature35
  Scenario: SPECGEN004_311 parseModifiedSpecSlugs returns an empty array for porcelain with no .specs paths
    Given a git status porcelain output with no .specs/ paths
    Then parseModifiedSpecSlugs returns an empty array

  @feature24
  Scenario: SPECGEN004_312 meta-guard denies removing a v3 form-guard from settings.json
    Given a settings manifest with the task-form-guard registration present
    When an agent write removes the task-form-guard entry from settings.json
    Then the meta-guard denies the write with exit 2 naming task-form-guard

  @feature24
  Scenario: SPECGEN004_313 meta-guard denies removing the dev-pomogator-specs MCP entry from .mcp.json
    Given an .mcp.json manifest carrying the dev-pomogator-specs server entry
    When an agent write removes the dev-pomogator-specs entry from .mcp.json
    Then the meta-guard denies the write with exit 2 naming dev-pomogator-specs

  @feature24
  Scenario: SPECGEN004_314 meta-guard allows adding an unrelated hook without denying
    Given a settings manifest with the task-form-guard registration present
    When an agent write adds an unrelated hook entry to settings.json
    Then the meta-guard exits 0 permitting the additive write

  @feature24
  Scenario: SPECGEN004_315 meta-guard exits 0 for writes to non-guarded file paths
    When an agent write targets a non-guarded JSON file path
    Then the meta-guard exits 0 with no denial output

  @FR-43
  Scenario: SPECGEN004_316 findBasenameElsewhere returns the new path of a moved file
    Given a repo root with a file placed inside a tools subdirectory
    When findBasenameElsewhere searches for the original missing path by basename
    Then it returns the relative path where the file now lives

  @FR-43
  Scenario: SPECGEN004_317 findBasenameElsewhere returns an empty array for a truly missing file
    Given a repo root with no file matching the queried basename
    When findBasenameElsewhere searches for the missing basename
    Then it returns an empty array

  @FR-43
  Scenario: SPECGEN004_318 buildLegacyPrompt embeds missing paths and grep evidence in the prompt
    Given a slug and evidence list with one moved path and one truly missing path
    When buildLegacyPrompt constructs the classification prompt
    Then the prompt contains the slug and both missing paths with their found-at evidence

  @FR-43
  Scenario: SPECGEN004_319 judgeLegacyState parses a clean MOVED verdict from the injected spawn
    Given a repo root and a list of missing paths for a slug
    When judgeLegacyState runs with an injected spawn returning a clean MOVED JSON
    Then the verdict has state MOVED and ran true

  @FR-43
  Scenario: SPECGEN004_320 judgeLegacyState tolerates JSON wrapped in stray prose and fences
    Given a repo root and a list of missing paths for a slug
    When judgeLegacyState runs with an injected spawn returning JSON inside a markdown fence
    Then the verdict has state REMOVED and ran true

  @FR-43
  Scenario: SPECGEN004_321 judgeLegacyState degrades to UNKNOWN when the binary is unavailable
    Given a repo root and a list of missing paths for a slug
    When judgeLegacyState runs with an injected spawn that throws a binary-unavailable error
    Then the verdict has state UNKNOWN and ran false

  @FR-43
  Scenario: SPECGEN004_322 judgeLegacyState degrades to UNKNOWN on unparseable judge output
    Given a repo root and a list of missing paths for a slug
    When judgeLegacyState runs with an injected spawn returning unparseable output
    Then the verdict has state UNKNOWN and ran false

  @FR-43
  Scenario: SPECGEN004_323 judgeLegacyState rejects an invalid state value and degrades to UNKNOWN
    Given a repo root and a list of missing paths for a slug
    When judgeLegacyState runs with an injected spawn returning an invalid state value
    Then the verdict has state UNKNOWN and ran false

  @feature7
  Scenario: SPECGEN004_324 launch-marksman shim resolveMarksmanBinary honours DEV_POMOGATOR_MARKSMAN_BIN override first
    Given the launch-marksman shim is called with DEV_POMOGATOR_MARKSMAN_BIN set to `/custom/marksman`
    Then resolveMarksmanBinary returns source `env` and binaryPath `/custom/marksman`

  @feature7
  Scenario: SPECGEN004_325 launch-marksman shim resolveMarksmanBinary prefers PATH over managed binary
    Given the launch-marksman shim is called with no env override and marksman found on PATH at `/usr/bin/marksman`
    Then resolveMarksmanBinary returns source `path` and binaryPath `/usr/bin/marksman`

  @feature7
  Scenario: SPECGEN004_326 launch-marksman shim resolveMarksmanBinary falls back to managed download when absent from PATH
    Given the launch-marksman shim is called with no env override and marksman absent from PATH but present at the managed path
    Then resolveMarksmanBinary returns source `managed` and the managed binary path for linux

  @feature7
  Scenario: SPECGEN004_327 launch-marksman shim resolveMarksmanBinary returns null when no binary is available (FR-7a no-fallback exit)
    Given the launch-marksman shim is called with no env override, marksman absent from PATH, and no managed binary on disk
    Then resolveMarksmanBinary returns null

  @feature7
  Scenario: SPECGEN004_328 launch-marksman shim managedBinaryPath computes the Windows path with .exe
    When managedBinaryPath is called with repoRoot `D:\repo` and platform `win32`
    Then the result is the win32 path `D:\repo\.dev-pomogator\bin\marksman.exe`

  @feature7
  Scenario: SPECGEN004_329 launch-marksman shim managedBinaryPath computes the POSIX path without extension
    When managedBinaryPath is called with repoRoot `/repo` and platform `linux`
    Then the result is the POSIX path `/repo/.dev-pomogator/bin/marksman`

  @feature7
  Scenario: SPECGEN004_330 launch-marksman shim whichOnPath honours Windows executable extensions
    When whichOnPath is called for `marksman` on `win32` with PATH `C:\tools` where `marksman.exe` exists
    Then whichOnPath returns `C:\tools\marksman.exe`

  @feature7
  Scenario: SPECGEN004_331 launch-marksman shim repoRootFromEnv prefers CLAUDE_PROJECT_DIR over DEV_POMOGATOR_REPO_ROOT
    When repoRootFromEnv is called with both CLAUDE_PROJECT_DIR `/proj` and DEV_POMOGATOR_REPO_ROOT `/x`
    Then repoRootFromEnv returns `/proj`
    When repoRootFromEnv is called with only DEV_POMOGATOR_REPO_ROOT `/x`
    Then repoRootFromEnv returns `/x`

  @feature17
  Scenario: SPECGEN004_332 spec-backlog writer entryId is deterministic for same inputs
    When entryId is called twice with slug `foo`, code `impl-drift/dead-link`, and the same evidence
    Then both calls return the same 12-character hex id

  @feature17
  Scenario: SPECGEN004_333 spec-backlog writer entryId differs across slug or code
    When entryId is called with three different slug/code combinations but the same evidence
    Then all three ids are distinct

  @feature17
  Scenario: SPECGEN004_334 spec-backlog writer appendEntry creates the daily JSONL file
    When appendEntry is called for slug `foo` with code `impl-drift/dead-link` in the writer temp dir
    Then the returned entry has status `open` and an id of length 12
    And the daily JSONL file exists under .dev-pomogator/.specs-backlog/ in the writer temp dir

  @feature17
  Scenario: SPECGEN004_335 spec-backlog writer readAll deduplicates by id with latest line winning
    When appendEntry is called for a backlog entry and then updateStatus marks it resolved
    Then readAll returns the entry with status `resolved` (latest line wins)

  @feature17
  Scenario: SPECGEN004_336 spec-backlog writer readOpen filters to open entries only
    When two backlog entries exist and the second one is resolved
    Then readOpen returns exactly 1 entry and its id matches the first entry

  @feature17
  Scenario: SPECGEN004_337 spec-backlog writer readAll tolerates malformed JSONL lines
    When two valid backlog entries are appended with a malformed line injected between them
    Then readAll returns exactly 2 entries (the malformed line is skipped)

  @feature17
  Scenario: SPECGEN004_338 spec-backlog writer readEntry returns null for unknown id
    When readEntry is called with an id that does not exist in the writer temp dir
    Then readEntry returns null

  # FR-17 full-mode (LLM-judge wrapper) — runFullMode with injectable spawn

  @feature17
  Scenario: SPECGEN004_339 runFullMode fires cross-spec/semantic-drift when spawn returns DRIFT
    Given two specs each have a FR-1 with long matching prose in the full-mode temp repo
    When runFullMode is called with a spawn that returns DRIFT
    Then the full-mode result shows subprocess_calls=1 and drift_detected=1
    And a cross-spec/semantic-drift finding appears in both spec results with severity CRITICAL and suggested_fix containing "fake drift"

  @feature17
  Scenario: SPECGEN004_340 runFullMode does NOT fire semantic-drift when spawn returns NO_DRIFT_DETECTED
    Given two specs each have a FR-1 with long matching prose in the full-mode temp repo
    When runFullMode is called with a spawn that returns NO_DRIFT_DETECTED
    Then the full-mode result shows subprocess_calls=1 and drift_detected=0 with no semantic-drift finding

  @feature17
  Scenario: SPECGEN004_341 runFullMode still ships mechanical findings in shared namespace mode
    Given two specs each have a shared-namespace FR-1 with long prose in the full-mode temp repo
    When runFullMode is called with shared namespace and a NO_DRIFT spawn
    Then the full-mode result still contains a cross-spec/duplicate-fr-id mechanical finding

  @feature17
  Scenario: SPECGEN004_342 runFullMode honours maxCalls — second pair never triggers spawn
    Given three specs each have a FR-1 with long prose in the full-mode temp repo
    When runFullMode is called with maxCalls=1 against three specs
    Then only 1 spawn call was made despite having 3 FR pairs

  @feature17
  Scenario: SPECGEN004_343 runFullMode denyOverrides short-circuits spawn per spec
    Given two specs each have a FR-1 with long matching prose in the full-mode temp repo
    When runFullMode is called with denyOverrides spec-a=true
    Then 0 spawn calls were made and deny_list_skips=1 in the full-mode result

  @feature17
  Scenario: SPECGEN004_344 runFullMode skips FR pairs with bodies shorter than 60 chars
    Given two specs each have a FR-1 with short bodies in the full-mode temp repo
    When runFullMode is called with default options against two short-body specs
    Then 0 spawn calls were made because both FR bodies are shorter than 60 chars

  @feature17
  Scenario: SPECGEN004_535 runFullMode prefilters unrelated same-id FR pairs before semantic spawn
    Given two specs each have a same-id FR-1 with unrelated long prose in the full-mode temp repo
    When runFullMode is called against unrelated same-id FR prose
    Then 0 spawn calls were made because the concept-noun prefilter rejected the pair

  @feature17
  Scenario: SPECGEN004_536 runFullMode cache hit skips semantic spawn for unchanged pair content
    Given two specs each have a FR-1 with long matching prose in the full-mode temp repo
    When runFullMode is called twice with identical pair content and a NO_DRIFT spawn
    Then only the first full-mode run spawned because the second identical pair hit the sha256 cache

  @feature17
  Scenario: SPECGEN004_516 runFullMode marks partial when the semantic dispatcher fails
    Given two specs each have a FR-1 with long matching prose in the full-mode temp repo
    When runFullMode is called with a spawn that throws "semantic dispatcher timeout after 120000ms"
    Then the full-mode report is marked partial and contains a cross-spec/semantic-check-failed warning containing "semantic dispatcher timeout after 120000ms"

  # FR-18 cross-spec-resolve step-7 — updateStatus YAML stamping

  @feature18
  Scenario: SPECGEN004_345 updateStatus throws when the YAML file does not exist
    Given no consistency-report.yaml exists for slug "absent" in the update-status temp repo
    When updateStatus is called for slug "absent" with empty decisions
    Then updateStatus throws an error matching "does not exist"

  @feature18
  Scenario: SPECGEN004_346 updateStatus appends resolution_status and resolved_at inside the matching finding block
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called with a resolved decision for the impl-drift/missing-file finding
    Then the YAML file contains resolution_status: resolved and resolved_at inside the impl-drift block before the second finding

  @feature18
  Scenario: SPECGEN004_347 updateStatus writes override_reason when status is acknowledged
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called with an acknowledged decision with overrideReason "covered by shared runner"
    Then the YAML file contains resolution_status: acknowledged and override_reason: "covered by shared runner"

  @feature18
  Scenario: SPECGEN004_348 updateStatus escapes quotes and backslashes in override_reason
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called with an acknowledged decision with overrideReason containing quotes and backslashes
    Then the YAML file contains override_reason with escaped quotes and backslashes

  @feature18
  Scenario: SPECGEN004_349 updateStatus reports unmatched decisions in result counters
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called with one matching and one non-matching decision
    Then updateStatus returns matched=1 and unmatched=1

  @feature18
  Scenario: SPECGEN004_350 updateStatus is atomic — no-match leaves the original YAML intact
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called with a decision that has no matching finding
    Then the YAML file content is unchanged after the no-match updateStatus call

  @feature18
  Scenario: SPECGEN004_351 updateStatus is idempotent — re-running does not double-add status lines beyond limit
    Given a consistency-report.yaml exists for slug "demo" in the update-status temp repo
    When updateStatus is called twice with the same resolved decision for the impl-drift finding
    Then the YAML file contains at most 2 occurrences of resolution_status: resolved after two identical updateStatus calls

  # ── reconcile-cli: parseReconcileArgs ────────────────────────────────────────────

  @feature17
  Scenario: SPECGEN004_352 parseReconcileArgs defaults to light mode, no dry-run, no sarif, all specs
    When parseReconcileArgs is called with no arguments
    Then the parsed reconcile args have mode=light dryRun=false sarif=false and empty slugs

  @feature17
  Scenario: SPECGEN004_353 parseReconcileArgs parses --mode full --dry-run --sarif --slug (repeatable)
    When parseReconcileArgs is called with "--mode full --dry-run --sarif --slug foo --slug bar"
    Then the parsed reconcile args have mode=full dryRun=true sarif=true and slugs foo and bar

  @feature17
  Scenario: SPECGEN004_354 parseReconcileArgs rejects an unknown flag with an error message
    When parseReconcileArgs is called with "--bogus"
    Then the parsed reconcile args have an error matching "unknown argument: --bogus"

  @feature17
  Scenario: SPECGEN004_355 parseReconcileArgs rejects --mode with an invalid value
    When parseReconcileArgs is called with "--mode ultra"
    Then the parsed reconcile args have an error matching "light|full"

  @feature17
  Scenario: SPECGEN004_356 parseReconcileArgs rejects --slug with no value
    When parseReconcileArgs is called with "--slug"
    Then the parsed reconcile args have an error matching "--slug expects"

  # ── reconcile-cli: reconcileCli ──────────────────────────────────────────────────

  @feature17
  Scenario: SPECGEN004_357 reconcileCli --dry-run finds drift, prints table, writes nothing
    Given a reconcile-cli temp repo with one spec that has a missing impl path
    When reconcileCli is called with dry-run=true sarif=false
    Then the reconcileCli result has exitCode=0 totalFindings>=1 and bySeverity.WARNING>=1
    And the reconcileCli stdout contains "| spec | CRIT | WARN | INFO | total |"
    And the reconcileCli stdout contains "first" and "finding(s):" and "[WARNING]" and "impl-drift/missing-file"
    And the reconcileCli stdout contains "--dry-run"
    And the reconcileCli reportPaths is empty and no yaml was written

  @feature17
  Scenario: SPECGEN004_358 reconcileCli real run writes consistency-report.yaml to disk
    Given a reconcile-cli temp repo with one spec that has a missing impl path
    When reconcileCli is called with dry-run=false sarif=false
    Then the reconcileCli result has exitCode=0 and reportPaths.length=1
    And a consistency-report.yaml file exists at the reported path
    And the yaml body contains "impl-drift/missing-file"

  @feature17
  Scenario: SPECGEN004_359 reconcileCli --sarif also writes consistency-report.sarif
    Given a reconcile-cli temp repo with one spec that has a missing impl path
    When reconcileCli is called with dry-run=false sarif=true
    Then the reconcileCli sarifPaths.length=1 and the sarif file exists on disk

  @feature17
  Scenario: SPECGEN004_537 reconcileCli config output_formats also writes consistency-report.sarif
    Given a reconcile-cli temp repo with one spec that has a missing impl path
    And .spec-config.json requests the sarif output format
    When reconcileCli is called with dry-run=false sarif=false while config requests sarif
    Then the reconcileCli sarifPaths.length=1 and the sarif file exists on disk

  @feature17
  Scenario: SPECGEN004_360 reconcileCli parse error short-circuits with exit 2 and usage, no engine run
    When reconcileCli is called with a parse-error args object
    Then the reconcileCli result has exitCode=2 and stdout contains "usage: reconcile-cli"
    And the reconcileCli reportPaths is empty

  # ── corpus-health: corpusHealth (GREEN / collision / composite-key / untraced / stale) ──

  @feature37
  Scenario: SPECGEN004_361 corpusHealth returns GREEN on a fully-traced corpus with zero disease counts
    Given a corpus-health temp corpus root with no specs
    When corpusHealth is called on the temp corpus root
    Then the corpus-health report has verdict=GREEN and strictVerdict=GREEN
    And all corpus-health disease counts are zero

  @feature36
  Scenario: SPECGEN004_362 corpusHealth catches a planted duplicate bare id as a collision
    Given a corpus-health temp corpus root where two specs share the same bare FR id
    When corpusHealth is called on the temp corpus root
    Then the corpus-health report has a collision entry whose id contains "FR-1"
    And the corpus-health report has verdict=RED

  @feature36
  Scenario: SPECGEN004_363 corpusHealth does NOT collide two specs sharing a bare local id (composite keys, FR-36a)
    Given a corpus-health temp corpus root where two separate specs each have their own FR-1
    When corpusHealth is called on the temp corpus root
    Then the corpus-health report has collisions.collisions.length=0
    And the corpus-health report has verdict=GREEN

  @feature37
  Scenario: SPECGEN004_364 corpusHealth reports untraced atoms per class and gates only under --strict
    Given a corpus-health temp corpus root with one spec that has an untraced FR
    When corpusHealth is called on the temp corpus root
    Then the corpus-health report has untracedAtoms.byClass.UNCOVERED_FR=1
    And the corpus-health report has verdict=GREEN and strictVerdict=RED

  @feature37
  Scenario: SPECGEN004_365 corpusHealth reports a stale FILE_CHANGES edit path as a hard red
    Given a corpus-health temp corpus root with a stale implements edge pointing to a missing file
    When corpusHealth is called on the temp corpus root
    Then the corpus-health report has staleFileChanges.count=1
    And the corpus-health report has verdict=RED

  @feature37
  Scenario: SPECGEN004_366 renderCorpusHealth carries every section and the dual verdict line
    Given a corpus-health GREEN report
    When renderCorpusHealth is called on that report
    Then the render output contains "═══ corpus-health"
    And the render output contains "collisions (raw pre-map)"
    And the render output contains "dangling edges"
    And the render output contains "untraced atoms (FR-37b)"
    And the render output contains "stale FILE_CHANGES paths"
    And the render output contains "orphan project tests"
    And the render output contains "VERDICT: 🟢 GREEN"

  # ── corpus-health: renderCorpusHealth (pure, synthetic RED report) ────────────────

  @feature37
  Scenario: SPECGEN004_367 renderCorpusHealth shows RED verdict icon and dual verdict line
    Given a synthetic corpus-health RED report with collisions and stale paths
    When renderCorpusHealth is called on that synthetic report
    Then the render output contains "VERDICT: 🔴 RED (hard: collisions+stale)"
    And the render output contains "strict: 🔴 RED"

  @feature37
  Scenario: SPECGEN004_368 renderCorpusHealth renders collision and dangling and stale sample lines
    Given a synthetic corpus-health RED report with collisions and stale paths
    When renderCorpusHealth is called on that synthetic report
    Then the render output contains "COLLISION"
    And the render output contains "dangling edge" or renders a dangling-edge line
    And the render output contains the stale path sample

  @feature37
  Scenario: SPECGEN004_369 renderCorpusHealth renders the untraced-atom class breakdown
    Given a synthetic corpus-health RED report with untraced atoms
    When renderCorpusHealth is called on that synthetic report
    Then the render output matches "untraced atoms.*UNCOVERED_FR:1.*TASK_UNTESTED:1"

  @feature44
  Scenario: SPECGEN004_370 renderCorpusHealth renders the three reverse-traceability sections
    Given a synthetic corpus-health RED report with reverse-traceability debt
    When renderCorpusHealth is called on that synthetic report
    Then the render output contains "orphan project tests (FR-44/GT-1, reverse)"
    And the render output contains "FRs citing no RESEARCH.md (FR-44/GT-2, reverse)"
    And the render output contains "upstream unlinked (FR-44/GT-4, reverse)"

  # ── reconcile-cli: spec-only/missing-acceptance (XSPEC001_02 coverage) ──────

  @feature17
  Scenario: SPECGEN004_371 reconcileCli detects spec-only/missing-acceptance when AC file is absent
    Given a reconcile-cli temp repo with one spec that has an FR but no ACCEPTANCE_CRITERIA.md
    When reconcileCli is called with dry-run=false sarif=false
    Then the consistency-report.yaml for "spec-b" contains the code "spec-only/missing-acceptance"

  # ── registry-parity snapshot freshness guard ──────────────────────────────

  @feature25
  Scenario: SPECGEN004_372 the committed registry-parity snapshot stays in sync with the live settings.json
    Given the committed registry-parity snapshot and the live settings.json are both present
    When the snapshot freshness check compares them for every hook event
    Then the snapshot matches the live settings.json for every event or settings.json is absent

  # ── feature-strength unit tests: placeholder detection (FR-49 V2) ─────────

  @feature49
  Scenario Outline: SPECGEN004_373 placeholderScenarios detects or ignores placeholder steps
    Given the feature-strength fixture named "<fixture>"
    When placeholderScenarios is called on the feature-strength fixture
    Then the feature-strength placeholder count is <expected_count>

    Examples:
      | fixture          | expected_count | note                                                          |
      | skeleton         | 1              | whole-step prose <...> with whitespace → flagged              |
      | real             | 0              | fully-written scenario → INVARIANT: never flagged             |
      | outline          | 0              | Scenario Outline <amount> single-token param → NOT flagged    |
      | mid-text-param   | 0              | mid-text <amount> in step text → NOT flagged                  |
      | bare-token       | 0              | bare single-token <state> (no whitespace) → NOT flagged       |
      | curly-scaffold   | 1              | whole-step {curly} create_spec scaffold → flagged             |
      | mid-text-brace   | 0              | mid-text {"k":"v"} brace → NOT flagged                        |
      | empty            | 0              | empty string → returns []                                     |
      | empty-feature    | 0              | Feature with no scenarios → returns []                        |
      | not-gherkin      | 0              | unparseable input → returns []                                |

  # ── feature-strength unit tests: net-new scoping (FR-49 V2) ─────────────

  @feature49
  Scenario Outline: SPECGEN004_374 featureStrengthFindings only fires on net-new placeholders
    Given the feature-strength net-new check with current "<current>" and next "<next>"
    When featureStrengthFindings is called on the feature-strength current and next fixtures
    Then <assertion>

    Examples:
      | current  | next             | assertion                                                           | note                                                          |
      | null     | skeleton         | the feature-strength net-new finding count is at least 1            | new doc with skeleton → finding                               |
      | null     | real             | the feature-strength net-new finding count is 0                     | new doc with real scenarios → no finding                      |
      | skeleton | skeleton         | no feature-strength net-new findings contain "PLACEHOLDER"          | MUTATION GUARD: legacy kept (current==next, > not >=) → no finding |
      | skeleton | real             | the feature-strength net-new finding count is 0                     | filling a skeleton in (count drops) → no finding              |
      | real     | skeleton         | the feature-strength net-new finding count is at least 1            | adding skeleton to real doc (count rises) → finding           |

  @feature49
  Scenario: SPECGEN004_375 featureStrengthFindings fires on net-new TBD marker but not on pre-existing one
    Given the feature-strength net-new check with current "real" and next "real-with-tbd"
    When featureStrengthFindings is called on the feature-strength current and next fixtures
    Then some feature-strength net-new findings contain "TBD"
    Given the feature-strength net-new check with current "real-with-tbd" and next "real-with-tbd"
    When featureStrengthFindings is called on the feature-strength current and next fixtures
    Then no feature-strength net-new findings contain "TBD"

  # ── feature-strength MCP door: .md-only gate (FR-49 V2) ──────────────────

  @feature49
  Scenario: SPECGEN004_376 the feature-strength door gate is .feature-only — a .md write never gets a strength finding
    Given a temporary spec with a minimal FR.md for the feature-strength door gate
    When a feature-strength door write targets FR.md with prose containing angle-bracket text
    Then the feature-strength door gate emits no strength-layer findings for the .md write

  # ── verify-kill: deterministic inject+restore kill-gate (FR-53) ──────────

  @feature53
  Scenario: SPECGEN004_384 verifyKill reports KILLED when the covering scenario fails under the mutant and restores the file
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyKill is called with a sensing runner that detects "mutant_value"
    Then the verifyKill verdict is "KILLED"
    And the verifyKill killed flag is true
    And the verifyKill restored flag is true
    And the verifyKill source file still contains "original_value"
    And the verifyKill source file does not contain "mutant_value"

  @feature53
  Scenario: SPECGEN004_378 verifyKill reports SURVIVED when the run still passes under the mutant and restores
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyKill is called with an always-passing runner
    Then the verifyKill verdict is "SURVIVED"
    And the verifyKill killed flag is false
    And the verifyKill source file still contains "original_value"

  @feature53
  Scenario: SPECGEN004_379 verifyKill always restores the source file even if the runner throws during the mutant phase
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyKill is called with a runner that throws on the second invocation
    Then the verifyKill call threw an exception matching "boom"
    And the verifyKill source file still contains "original_value"
    And the verifyKill source file does not contain "mutant_value"

  @feature53
  Scenario: SPECGEN004_380 verifyKill throws when the original string is absent from the file
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyKill is called with original "NOT_PRESENT" and an always-passing runner
    Then the verifyKill call threw an exception matching "original string not found"

  @feature53
  Scenario: SPECGEN004_381 verifyKill refuses when the baseline scenario is not green
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyKill is called with an always-failing runner
    Then the verifyKill call threw an exception matching "baseline not green"

  @feature53
  Scenario: SPECGEN004_382 verifyBatch tallies killed and survived mutants across a list of specs
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyBatch is called with a killable spec "killable" and a surviving spec "survives" sensing "mutant_value"
    Then the verifyBatch total is 2
    And the verifyBatch killed count is 1
    And the verifyBatch survived count is 1
    And the verifyBatch error count is 0

  @feature53
  Scenario: SPECGEN004_383 verifyBatch records ERROR for a bad spec without crashing the batch
    Given a verifyKill temp source file with original "original_value" and mutant "mutant_value"
    When verifyBatch is called with a spec whose original is "NOT_PRESENT"
    Then the verifyBatch error count is 1
    And the first verifyBatch result verdict is "ERROR"

  @feature58
  Scenario: SPECGEN004_385 extractWriteContent user-story-form-guard Edit heading-only allows write
    Given an isolated spec directory with a fully-formed USER_STORIES.md for extractWriteContent testing
    When the user-story-form-guard receives an Edit of the user story heading only leaving body intact
    Then the user-story-form-guard exits 0 and allows the user story write

  @feature58
  Scenario: SPECGEN004_386 extractWriteContent user-story-form-guard Edit on incomplete file still denies
    Given an isolated spec directory with an incomplete USER_STORIES.md lacking required body fields
    When the user-story-form-guard receives an Edit of the heading on the incomplete user story file
    Then the user-story-form-guard exits non-zero and stderr mentions missing why

  @feature58
  Scenario Outline: SPECGEN004_387 extractWriteContent user-story-form-guard Write tool unchanged behavior
    Given an isolated spec directory with a fully-formed USER_STORIES.md for extractWriteContent testing
    When the user-story-form-guard receives a Write with <content_kind> user story content
    Then the user-story-form-guard Write exits <write_result>

    Examples:
      | content_kind  | write_result |
      | fully-formed  | allowed      |
      | incomplete    | denied       |

  @feature58
  Scenario: SPECGEN004_388 extractWriteContent task-form-guard Edit title-only allows write
    Given an isolated spec directory with a fully-formed TASKS.md for extractWriteContent testing
    When the task-form-guard receives an Edit of the task title only leaving body fields intact
    Then the task-form-guard exits 0 and allows the task write

  @feature58
  Scenario: SPECGEN004_389 extractWriteContent user-story-form-guard Edit with replace_all on multi-story file allows write
    Given an isolated spec directory with a multi-story USER_STORIES.md for extractWriteContent testing
    When the user-story-form-guard receives an Edit with replace_all true on the multi-story user story file
    Then the user-story-form-guard exits 0 and allows the user story write

  @feature58
  Scenario: SPECGEN004_390 extractWriteContent user-story-form-guard Edit fallback when old_string absent uses new_string allowing write
    Given an isolated spec directory with a fully-formed USER_STORIES.md for extractWriteContent testing
    When the user-story-form-guard receives an Edit with an old_string absent from the file
    Then the user-story-form-guard exits 0 and allows the user story write

  @feature4 @mcp-stdio
  Scenario: SPECGEN004_391 the spec-graph MCP server advertises read-only tools over real stdio
    Given a running spec-graph MCP server over real stdio against an isolated demo spec
    When the agent lists the MCP server tools over the wire
    Then the MCP server advertises the read-only tools get_trace and get_spec_status

  @feature4 @mcp-stdio
  Scenario: SPECGEN004_392 get_trace answers for a real qualified node over real stdio
    Given a running spec-graph MCP server over real stdio against an isolated demo spec
    When the agent calls get_trace for the demo node `demo:FR-1` over the wire
    Then get_trace returns ok for `demo:FR-1` carrying a verified_status surface

  @feature4 @mcp-stdio
  Scenario: SPECGEN004_393 get_spec_status (view coverage) answers over real stdio
    Given a running spec-graph MCP server over real stdio against an isolated demo spec
    When the agent calls get_spec_status (view coverage) over the wire
    Then get_spec_status returns ok with buckets and totals

  # --- FR-54: TASKS.md task-id rework helper (add-task-ids.ts) ---

  @feature54
  Scenario: SPECGEN004_460 addTaskIds inserts id before Status on a Tnn header
    Given a loose TASKS line — `a Tnn header missing its id`
    When the addTaskIds rework runs over it
    Then the rework adds 1 id
    And the reworked content contains `- [x] T01: MOVE files -- @feature1 — id: t01 — Status: DONE | Est: 60m`

  @feature54
  Scenario: SPECGEN004_461 addTaskIds leaves Done-When child checkboxes untouched
    Given a loose TASKS line — `a Tnn header with a Done-When child checkbox`
    When the addTaskIds rework runs over it
    Then the rework adds 1 id
    And the reworked content contains `  - [x] 9 files copied`
    And the reworked content does not match /9 files copied — id:/

  @feature54
  Scenario: SPECGEN004_462 addTaskIds preserves CRLF endings
    Given a loose TASKS line — `a CRLF document with two Tnn headers and a child`
    When the addTaskIds rework runs over it
    Then the reworked content preserves all 3 CRLF endings
    And the reworked content contains `T01: A — id: t01 — Status: DONE`
    And the reworked content contains `T02: B — id: t02 — Status: TODO`

  @feature54
  Scenario: SPECGEN004_463 addTaskIds is idempotent on a header that already has an id
    Given a loose TASKS line — `a Tnn header that already carries an id`
    When the addTaskIds rework runs over it
    Then the rework adds 0 ids
    And the rework skips 1 header
    And the reworked content is byte-identical to the input

  @feature54
  Scenario: SPECGEN004_464 addTaskIds dedupes colliding Tnn prefixes
    Given a loose TASKS line — `two headers with the same Tnn prefix`
    When the addTaskIds rework runs over it
    Then the rework adds 2 ids
    And the reworked content matches /A — id: t01 —/
    And the reworked content matches /B — id: t01-1 —/

  @feature54
  Scenario: SPECGEN004_465 addTaskIdsAnyHeader inserts a sequential id on a title-only header
    Given a loose TASKS line — `a title-only header with no Tnn prefix`
    When the addTaskIdsAnyHeader rework runs over it
    Then the rework adds 1 id
    And the reworked content matches /X -- @feature1 — id: t01 — Status: TODO/

  @feature54
  Scenario: SPECGEN004_466 addTaskIdsAnyHeader derives the id from a phase-dashed prefix
    Given a loose TASKS line — `a header with a phase-dashed prefix`
    When the addTaskIdsAnyHeader rework runs over it
    Then the rework adds 1 id
    And the reworked content matches /— id: t433 — Status: DONE/

  @feature54
  Scenario: SPECGEN004_467 addTaskIdsAnyHeader is child-safe on a no-status child line
    Given a loose TASKS line — `a title-only header with a no-status child`
    When the addTaskIdsAnyHeader rework runs over it
    Then the rework adds 1 id
    And the reworked content contains `a child observable (no status)`
    And the reworked content does not match /child observable.*id:/

  @feature54
  Scenario: SPECGEN004_468 addTaskIdsAnyHeader is idempotent across many doc shapes
    Then addTaskIdsAnyHeader is idempotent across 40 generated docs

  @feature54
  Scenario: SPECGEN004_469 addTaskIdsAnyHeader gives one unique id per header and none to children
    Then every header gets exactly one unique id and no child does across 40 generated docs

  @feature54
  Scenario: SPECGEN004_470 addTaskIdsAnyHeader preserves every Status token byte-for-byte
    Then every Status token is byte-unchanged across 40 generated docs

  @feature54
  Scenario: SPECGEN004_471 addTaskIds inserts an id before a READY status on a Tnn header
    Given a loose TASKS line — `a READY Tnn header missing its id`
    When the addTaskIds rework runs over it
    Then the rework adds 1 id
    And the reworked content contains `T03: ready for verification — id: t03 — Status: READY`

  @feature54
  Scenario: SPECGEN004_472 addTaskIdsAnyHeader inserts an id before a READY status on a title-only header
    Given a loose TASKS line — `a READY title-only header missing its id`
    When the addTaskIdsAnyHeader rework runs over it
    Then the rework adds 1 id
    And the reworked content contains `Prepare release notes — id: t01 — Status: READY`

  # --- hooks-stdin-e2e: real-stdin guard/push + MCP bundle ---

  @feature5
  Scenario: SPECGEN004_569 the conformance guard allows a clean Write over real stdin
    Given a v4 spec workspace where the conformance guard is active
    When the conformance guard receives a Write of clean FR content
    Then the conformance guard exits 0 and returns permissionDecision "allow"

  @feature5
  Scenario: SPECGEN004_481 the conformance guard denies a duplicate-definition Write over real stdin
    Given a v4 spec workspace where the conformance guard is active
    When the conformance guard receives a Write of duplicate FR content
    Then the conformance guard exits 0 and returns permissionDecision "deny"
    And the deny reason mentions DUPLICATE_DEFINITION

  @feature22
  Scenario: SPECGEN004_482 the conformance guard yields ALLOW_AFTER_MIGRATION when progress is pre-v4
    Given a v3 spec workspace where the conformance guard is gated out by migration
    When the conformance guard receives a Write of duplicate FR content
    Then the reason is ALLOW_AFTER_MIGRATION

  @feature28
  Scenario: SPECGEN004_483 the conformance push appends the JSONL finding even when the emit is throttled
    When the conformance push runs on a Write to a spec whose FR has no AC
    Then the push exits 0 with no agent-facing stdout
    And the spec-check-log records an UNCOVERED_FR finding from spec-conformance-push with the session id

  @feature4
  Scenario: SPECGEN004_484 the MCP server bundle serves three JSON-RPC requests over one stdio session
    Given an auth spec with two FRs in the MCP workspace
    When the MCP bundle serves initialize then tools/list then get_trace in one stdio session
    Then the bundle identifies as dev-pomogator-specs and advertises exactly the canonical tool set
    And get_trace over the bundle returns ok for `auth:FR-1`

  @feature48
  Scenario: SPECGEN004_485 set_entity_status over the bundle refuses a derived FR and confirms a phase STOP
    Given an auth spec with a v4 progress file and a Discovery user story in the MCP workspace
    When the MCP bundle handles set_entity_status on a derived FR then confirms the Discovery phase STOP
    Then the derived FR is refused with a computed verdict, the phase STOP is confirmed, and get_spec_status shows it

  # --- fixture-shapes: 5-shape SpecGraph fixture corpus (F-21..F-25) ---

  @feature2
  Scenario: SPECGEN004_490 builder produces a graph without crashing on a minimal spec
    Given a staged "minimal-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the graph has an FR node `minimal-spec:FR-1` and stamps version 1

  @feature2
  Scenario: SPECGEN004_491 builder yields zero File nodes for an empty FILE_CHANGES
    Given a staged "minimal-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the graph has zero File nodes and zero implements edges

  @feature2
  Scenario: SPECGEN004_492 builder parses five FRs and five ACs with no scenarios
    Given a staged "no-scenarios-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the graph has 5 FR, 5 AC and 0 Scenario nodes

  @feature32
  Scenario: SPECGEN004_493 coverage rollup reports scenarios=0 for an FR-only spec
    Given a staged "no-scenarios-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the per-spec coverage of `no-scenarios-spec` shows fr=5 ac=5 scenario=0

  @feature2
  Scenario: SPECGEN004_494 every FR in an FR-only spec lacks a tested-by edge
    Given a staged "no-scenarios-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then every FR in the graph lacks a tested-by edge, 5 in total

  @feature5
  Scenario: SPECGEN004_495 the hard guard denies a Write that defines a duplicate FR
    Given a staged "conflicting-fr-spec" spec fixture
    And the fixture is in v4 conformance mode
    When the hard guard receives a Write of the fixture's `.specs/conflicting-fr-spec/FR.md`
    Then the guard denies it citing DUPLICATE_DEFINITION with a line number

  @feature5
  Scenario: SPECGEN004_496 the hard guard denies an Edit that produces a duplicate FR
    Given a staged "conflicting-fr-spec" spec fixture
    And the fixture is in v4 conformance mode
    When the hard guard receives an Edit that duplicates an FR heading
    Then the guard denies it citing DUPLICATE_DEFINITION

  @feature3
  Scenario: SPECGEN004_497 the parser yields FR nodes for both legacy and modern headings
    Given a staged "v3-legacy-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the graph has FR nodes for both `v3-legacy-spec:FR-1` and `v3-legacy-spec:FR-2`

  @feature3
  Scenario: SPECGEN004_498 a legacy Requirement heading registers the triple anchor
    Given a staged "v3-legacy-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the parser registers the compact, slug and legacy-requirement anchors for FR-1

  @feature5
  Scenario: SPECGEN004_499 a modern heading with a custom id is allowed, not flagged MALFORMED
    Given a staged "v3-legacy-spec" spec fixture
    And the fixture is in v4 conformance mode
    When the hard guard receives a Write of the fixture's `.specs/v3-legacy-spec/FR.md`
    Then the guard allows it and does not flag MALFORMED

  @feature2
  Scenario: SPECGEN004_500 a dense spec yields the expected node-type cardinality
    Given a staged "deep-multi-fr-refs-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the node-type cardinality is FR=10 AC=15 Scenario=8 File=5

  @feature2
  Scenario: SPECGEN004_501 a dense spec meets the published edge-density floor
    Given a staged "deep-multi-fr-refs-spec" spec fixture
    When the SpecGraph builder builds the fixture
    Then the graph has at least 15 covers, 16 tested-by, 5 implements edges and 40 edges total

  @feature4
  Scenario: SPECGEN004_502 get_trace answers for every FR in a dense graph
    Given a staged "deep-multi-fr-refs-spec" spec fixture
    When the SpecGraph builder builds the fixture
    And get_trace runs over every FR in the built graph
    Then get_trace returns ok for all 10 of them

  @feature39
  Scenario: SPECGEN004_503 search coverage returns a node's tested-by scenarios in one call
    Given a cov-demo spec whose FR owns a @feature1-tagged scenario
    When the search tool runs with coverage for the cov-demo FR
    Then the cov-demo FR result carries tested-by scenarios and a covered flag in one call

  @feature39
  Scenario: SPECGEN004_504 the spec-access-guard maps a denied .specs grep to the concrete search call
    Given the spec-access-guard grep-to-search suggester
    When denied .specs greps and a non-grep reader are mapped to door calls
    Then each grep maps to its concrete spec-door search call and the non-grep maps to nothing

  @feature58
  Scenario: SPECGEN003_01 user-story-form-guard denies missing Priority field
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md missing Priority
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Priority"

  @feature58
  Scenario: SPECGEN003_02 user-story-form-guard denies missing Why field when Priority is present
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md with Priority but missing Why
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Why"

  @feature58
  Scenario: SPECGEN003_03 user-story-form-guard allows all 4 required fields
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md with all 4 required fields
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_04 form guards pass through when no .progress.json exists
    Given a SPECGEN003 spec directory with no progress.json is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md with minimal invalid content
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_05 task-form-guard denies TASKS.md missing Done When section
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 task-form-guard is invoked via Write on TASKS.md missing Done When
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Done When"

  @feature58
  Scenario: SPECGEN003_06 task-form-guard denies Done When section with no checkboxes
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 task-form-guard is invoked via Write on TASKS.md with Done When but no checkboxes
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "checkbox"

  @feature58
  Scenario: SPECGEN003_07 task-form-guard allows valid Done When with checkboxes
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 task-form-guard is invoked via Write on TASKS.md with valid Done When and checkboxes
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_08 design-decision-guard denies Decision block lacking Alternatives
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 design-decision-guard is invoked via Write on DESIGN.md with a Decision block but no Alternatives
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Alternatives"

  @feature58
  Scenario: SPECGEN003_09 design-decision-guard passes when no Decision blocks present
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 design-decision-guard is invoked via Write on DESIGN.md with no Decision blocks
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_10 requirements-chk-guard denies empty Verification Method cell
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS.md with an empty Verification Method cell
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Verification Method"

  @feature58
  Scenario: SPECGEN003_11 requirements-chk-guard denies invalid CHK ID format
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS.md with an invalid CHK ID format
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "CHK-FR"

  @feature58
  Scenario: SPECGEN003_12 requirements-chk-guard allows valid CHK-FR format
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 requirements-chk-guard is invoked via Write on REQUIREMENTS.md with a valid CHK-FR row
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_13 risk-assessment-guard denies only 1 risk row in table
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 risk-assessment-guard is invoked via Write on RESEARCH.md with only 1 risk data row
    Then the SPECGEN003 guard exits with code 2 and stderr mentions "Risk Assessment"

  @feature58
  Scenario: SPECGEN003_14 risk-assessment-guard passes when no Risk Assessment heading
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 risk-assessment-guard is invoked via Write on RESEARCH.md with no Risk Assessment heading
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_15 form guards ignore Read tool events
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Read on USER_STORIES.md
    Then the SPECGEN003 guard exits with code 0

  @feature55
  Scenario: SPECGEN003_16 discovery-forms SKILL.md has non-auto-trigger frontmatter
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 child phase-assistant skill SKILL.md files are read from the repository
    Then the SPECGEN003 discovery-forms SKILL.md exists without auto-trigger phrases in the first 600 characters

  @feature55
  Scenario: SPECGEN003_17 task-board-forms SKILL.md has non-auto-trigger frontmatter
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 child phase-assistant skill SKILL.md files are read from the repository
    Then the SPECGEN003 task-board-forms SKILL.md exists without auto-trigger phrases in the first 600 characters

  @feature58
  Scenario: SPECGEN003_18 form guards pass through for legacy .progress.json lacking version field
    Given a SPECGEN003 spec directory with a legacy progress.json lacking a version field is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md with minimal invalid content
    Then the SPECGEN003 guard exits with code 0

  @feature21
  Scenario: SPECGEN003_19 spec-status -Format task-table renders a markdown table header
    Given a SPECGEN003 v3 spec directory with a 5-task TASKS.md is prepared
    When spec-status.ts is invoked on the SPECGEN003 spec directory with -Format task-table
    Then the SPECGEN003 task-table output has a header row with ID Title Status Depends Phase Est columns
    And the SPECGEN003 task-table output has at least 6 markdown table rows including the header

  @feature21
  Scenario: SPECGEN003_20 spec-status -Format task-table is idempotent across two invocations
    Given a SPECGEN003 v3 spec directory with a 2-task TASKS.md for idempotency is prepared
    When spec-status.ts is invoked twice on the SPECGEN003 spec directory with -Format task-table
    Then both SPECGEN003 task-table outputs are identical

  @feature55
  Scenario: SPECGEN003_21 requirements-chk-matrix SKILL.md references Jira trace preservation
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 child phase-assistant skill SKILL.md files are read from the repository
    Then the SPECGEN003 requirements-chk-matrix SKILL.md exists and mentions Jira preservation

  @feature58
  Scenario: SPECGEN003_22 form guards fail-open on malformed JSON stdin
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked with malformed JSON on stdin
    Then the SPECGEN003 guard exits with code 0

  @feature58
  Scenario: SPECGEN003_23 form guards fail-open on pathological regex content
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 user-story-form-guard is invoked via Write on USER_STORIES.md with pathological regex content
    Then the SPECGEN003 guard exits with code 0 or 2

  @feature55
  Scenario: SPECGEN003_24 all 3 child phase-assistant skills lack auto-trigger phrases in first 800 characters
    Given a SPECGEN003 v3 spec directory is prepared
    When the SPECGEN003 child phase-assistant skill SKILL.md files are read from the repository
    Then all 3 SPECGEN003 child phase-assistant skills lack auto-trigger phrases in the first 800 characters

  @feature23
  Scenario: SPECGEN003_27 audit-logger appends a timestamped DENY line to the form-guards log
    Given the SPECGEN003 audit log is backed up before writing a new log event
    When the SPECGEN003 audit-logger logEvent is called with DENY for a test path
    Then the SPECGEN003 form-guards log last line matches the ISO timestamp DENY format

  @feature20
  Scenario: SPECGEN003_28 UserPromptSubmit hook emits conformance summary for unresolved DENYs
    Given the SPECGEN003 form-guards log is seeded with 3 DENY and 3 other events and the ack file is cleared
    When validate-specs.ts is invoked as a SPECGEN003 UserPromptSubmit hook event
    Then the SPECGEN003 conformance summary mentions at least 3 unresolved DENY

  # ── FR-57: scaffold-completeness audit (stub-detection gate) ──────────────

  @feature57
  Scenario: SPECGEN004_506 the scaffold classifier flags a verbatim template sentinel in prose
    Given a scaffold-sentinel fixture document with one unfilled template placeholder in prose outside code
    When the scaffold-sentinel classifier scans the fixture document
    Then the scaffold classifier reports exactly one finding naming that placeholder and its line

  @feature57
  Scenario: SPECGEN004_567 the scaffold classifier ignores lowercase single-token braces and code spans
    Given a scaffold-sentinel fixture document with lowercase single-token braces, a fenced code block, an inline code span, and an empty JSON brace
    When the scaffold-sentinel classifier scans the fixture document
    Then the scaffold classifier reports zero findings

  @feature57
  Scenario: SPECGEN004_507 ConfirmStop blocks phase-local placeholders and broken links
    Given a Requirements-stop fixture with a template placeholder and a broken phase link
    When spec-status confirms the Requirements STOP on that fixture
    Then ConfirmStop fails without recording the Requirements stop
    And the ConfirmStop error names the placeholder and broken link

  @feature57
  Scenario: SPECGEN004_568 audit emits SCAFFOLD_INCOMPLETE ERROR for a claims-done spec with a stub README
    Given an isolated claims-done spec fixture whose README.md is an unfilled scaffold
    When audit-spec runs on that spec fixture
    Then the audit findings contain check "SCAFFOLD_INCOMPLETE" with severity "ERROR"
    And the SCAFFOLD_INCOMPLETE finding names README.md with a line and a sentinel

  @feature57
  Scenario: SPECGEN004_473 a fresh scaffold spec keeps SCAFFOLD_INCOMPLETE at INFO not ERROR
    Given an isolated freshly-scaffolded spec fixture with default placeholders and no test run
    When audit-spec runs on that spec fixture
    Then every SCAFFOLD_INCOMPLETE finding has severity "INFO"
    And spec-verdict on that spec fixture does not turn RED because of SCAFFOLD_INCOMPLETE

  @feature57
  Scenario: SPECGEN004_474 spec-verdict flips RED then GREEN across the stub-vs-filled fixture
    Given a claims-done spec fixture with stub README, TASKS and FIXTURES prose
    When spec-verdict runs on the stub fixture
    Then the spec-verdict verdict is "RED" with SCAFFOLD_INCOMPLETE in the gap list
    Given the same fixture with its README, TASKS and FIXTURES prose filled in
    When spec-verdict runs on the filled fixture
    Then the SCAFFOLD_INCOMPLETE category is absent from the gap list

  @feature57
  Scenario: SPECGEN004_475 one classifier is shared by validate-spec and audit and covers every template placeholder
    Given the scaffold-sentinel set is derived from the specs-generator templates directory
    When the scaffold-sentinel set is compared against the current template placeholders
    Then the scaffold-sentinel set contains every current template placeholder
    And validate-spec PLACEHOLDER and audit SCAFFOLD_INCOMPLETE agree that a real template sentinel is a stub

  @feature57
  Scenario: SPECGEN004_476 a placeholder FIXTURES.md is reported once through the unified classifier
    Given a claims-done spec fixture with TEST_DATA_ACTIVE and a placeholder FIXTURES.md
    When audit-spec runs on that spec fixture
    Then the placeholder FIXTURES.md is reported exactly once and not by a separate FIXTURES_CONSISTENCY placeholder branch

  @feature57
  Scenario: SPECGEN004_477 templates fixtures and backlog specs are excluded from the scaffold gate
    Given a scaffold-sentinel scan over a templates file, a __fixtures__ document, and a backlog spec document
    When the scaffold-sentinel classifier evaluates those documents
    Then the templates file and the __fixtures__ document yield no findings
    And the backlog spec document yields at most an INFO finding never an ERROR

  @feature58
  Scenario: SPECGEN004_478 discovery-forms executable evals exercise real form contracts
    Given the discovery-forms executable eval runner
    When that form-skill eval runner executes
    Then the eval aggregate is fully green and every case exercised the real form contracts

  @feature58
  Scenario: SPECGEN004_479 requirements-chk-matrix executable evals pin invalid CHK IDs
    Given the requirements-chk-matrix executable eval runner
    When that form-skill eval runner executes
    Then the eval aggregate is fully green and every case exercised the real form contracts
    And the eval aggregate pins the P16-1 negative regression cases

  @feature58
  Scenario: SPECGEN004_570 task-board-forms executable evals pin lowercase task markers
    Given the task-board-forms executable eval runner
    When that form-skill eval runner executes
    Then the eval aggregate is fully green and every case exercised the real form contracts
    And the eval aggregate pins the P16-1 negative regression cases

  @feature57
  Scenario: SPECGEN004_508 scaffold template ownership keeps non-scaffold templates out of the base templates directory
    Given the real scaffold template mapping and owning skill reference template directories
    When the spec-generator template ownership check runs
    Then every template left in tools/specs-generator/templates is instantiated by scaffold-spec
    And the seven non-scaffold templates live only under their owning skill reference templates

  @feature34
  Scenario: SPECGEN004_509 feature template FR tags resolve against FR template headings
    Given the real feature and FR scaffold templates
    When the feature-template anchor integrity check runs
    Then every feature-template @FR tag resolves to an FR heading in FR.md.template

  @feature37
  Scenario: SPECGEN004_510 audit split-responsibility documentation separates mechanical and semantic work
    Given the Phase 3 audit overview and audit split-responsibility references
    When the audit split-responsibility documentation is checked
    Then mechanical audit categories are declared as script-owned inputs not AI rediscovery work
    And semantic-only audit categories are declared as agent-owned review work
    And the spec health rule points "is it healthy?" to the composed verdict only

  @feature40
  Scenario: SPECGEN004_511 progress state has an engine-only two-writer contract
    Given a temp spec corpus for the progress writer contract
    When scaffold-spec creates a fresh spec and spec-status repairs a pre-existing spec
    Then scaffold-spec is the bootstrap writer for initial .progress.json state
    And spec-status is the state-transition writer for existing specs
    And create-spec documentation forbids manual or MCP mutation of .progress.json while naming both engine writers

  @feature35
  Scenario: SPECGEN004_512 active spec unconfirmed STOP is loud without corpus-wide nagging
    Given a temp spec corpus with active and legacy specs that both have unconfirmed STOPs
    When the specs-validator prompt hook receives a prompt about the active spec
    Then the hook output surfaces the active spec unconfirmed STOP with the exact confirm command
    And the hook output does not emit a corpus-wide unconfirmed STOP count
    And the unrelated legacy spec stays quiet unless verbose mode is enabled

  @feature59
  Scenario: SPECGEN004_513 PostToolUse conformance push keeps Claude reminder bounded while retaining the full log
    Given a PostToolUse push window with 3000 conformance findings
    When the spec-conformance push window flushes
    Then the emitted reminder is at most 6000 bytes
    And the emitted reminder summarizes the finding count, severity counts, omitted count, and full-log pointer
    And the emitted reminder shows no more than 20 sample findings
    And the durable spec-check-log writer still records every synthetic finding

  @feature52
  Scenario: SPECGEN004_514 validate_anchor distinguishes compact aliases from Marksman heading slugs
    Given a validate_anchor tool over a spec containing a punctuation-heavy Marksman heading
    When validate_anchor checks both a compact id and DOC.md#heading-slug
    Then the tool description separates the alias registry from Marksman heading slugs
    And the compact id and Marksman heading slug resolve while a non-Marksman slug does not

  @feature52
  Scenario: SPECGEN004_515 anchor-fix repairs enforce sessions through the spec door
    Given a spec with a broken id-bearing anchor while spec-access enforce is on
    When anchor-fix runs in door mode
    Then the anchor is fixed through the spec door and enforce hints never prescribe a raw write

  @feature52
  Scenario: SPECGEN004_517 FILE_CHANGES v1 layout drift is specific to canonical plugin repos
    Given a canonical plugin repo fixture with FILE_CHANGES edit rows under removed v1 prefixes
    When the spec-reality checker runs on the v1 layout drift fixture
    Then it emits FC_V1_LAYOUT_DRIFT instead of generic FC_EDIT_MISSING
    And the same missing src edit path stays generic when the src directory exists

  @feature52
  Scenario: SPECGEN004_519 TASK_NO_OWN_SCENARIO accepts migrated many-to-few consolidation with a green covering scenario
    Given a graph with a DONE migrated task mapped to one passing consolidated scenario and one not-run sibling
    When conformance runs over the graph
    Then no TASK_NO_OWN_SCENARIO finding is raised for that task
    And a TASK_STATUS_UNVERIFIED warning still surfaces the not-run sibling

  # ── FR-56: scenario-result overlay freshness (P29) ───────────────────────────

  @feature56
  Scenario: SPECGEN004_529 every BDD run path writes append-only scenario overlay rows
    Given a Cucumber message run for a focused FR-56 scenario
    When the scenario-result overlay writer records that run
    Then the scenario overlay contains one row with result, run identity, source, and trace id
    And appending another run preserves the existing overlay row

  @feature56
  Scenario: SPECGEN004_534 scenario trace lookup returns the archived failing step
    Given a Cucumber message run for a failed FR-56 scenario
    When the scenario trace tool reads that archived run through the graph
    Then the scenario trace response contains the failing step, error text, and run identity
    And an expired scenario trace returns a rerun hint instead of throwing

  @feature49
  Scenario: SPECGEN004_530 inherited prose stays non-authoritative while an owned task may arm Pinator
    Given a Pinator-fix mandate with terse prose both without and with an owned task
    When the real Stop hook sends that turn to the judge
    Then prose alone is inactive while the owned task supplies the only work authority

  # ── FR-60: high-level MCP authoring API (pending implementation) ─────────────

  @feature60
  Scenario: SPECGEN004_520 section-targeted append preserves validation and EOL style
    Given a spec document has an existing Phase heading and a known EOL style
    When an agent proposes an MCP append_to_section operation targeting that Phase heading
    Then the proposal resolves the stable heading anchor without requiring an exact old_string
    And the preview preserves the document EOL style
    And the same form, anchor, and conformance checks run before any write is applied

  @feature60
  Scenario: SPECGEN004_521 read_for_edit returns section metadata and safe insertion tokens
    Given an agent reads a spec section for edit through the MCP door
    When the read_for_edit response is returned
    Then it includes eol_style, heading_anchor, section_sha, start_line, end_line, and append or insert tokens
    And a follow-up insert using those tokens targets the same section even when unrelated document text changes elsewhere

  @feature60
  Scenario: SPECGEN004_522 replacement diagnostics distinguish EOL whitespace multi-match and missing-anchor misses
    Given an MCP literal replacement fails to find old_string in a spec document
    When the server analyzes the failed replacement
    Then the response classifies the miss as EOL-only, whitespace-only, multi-match, changed body under the same anchor, or missing anchor
    And with normalize_eol true a CRLF/LF-only mismatch is accepted while the persisted file keeps its original EOL style

  @feature60
  Scenario: SPECGEN004_523 multi-document proposal previews graph impact and applies atomically
    Given a proposed spec change spans FR.md, ACCEPTANCE_CRITERIA.md, TASKS.md, the feature file, and FILE_CHANGES.md
    When the agent calls propose_patch and then apply_spec_transaction
    Then the preview includes anchors found, a diff, affected graph nodes, conformance findings, resulting shas, and a proposal_id
    And applying the proposal writes all documents atomically or leaves every document unchanged
    And the audit log records the transaction as one conceptual spec mutation
    And the active create-spec workflow exposes and routes cross-document bootstrap through all transaction tools

  @feature60
  Scenario: SPECGEN004_524 anchor-targeted CAS mismatch auto-rebases only non-conflicting changes
    Given an anchor-targeted MCP mutation was prepared from an older document sha
    When another session has changed unrelated text outside the target anchor
    Then the mutation auto-rebases and applies against the fresh document
    But when the target anchor body or preconditions changed the server refuses with fresh anchor context for the caller

  @feature60
  Scenario: SPECGEN004_525 domain helpers render canonical traceable markdown and enforce feature safety
    Given an agent registers incident-driven backlog or amends a requirement through a domain helper
    When the helper renders FR, AC, TASK, and optional feature changes
    Then the generated markdown follows the canonical form contracts and keeps FR to AC to TASK traceability links
    And ids are unique within the affected spec documents
    And executable feature scenarios are refused unless matching step-definition work is included or the caller explicitly selects a TASKS-only acceptance pin

  # ── FR-61: unified readiness UX (pending implementation) ────────────────────

  @feature61
  Scenario: SPECGEN004_539 spec verdict separates structural health from readiness
    Given a spec is structurally valid and traceable but has unrun scenarios and DONE-but-unverified tasks
    When spec-verdict summarizes that spec
    Then the output shows STRUCTURE, TRACEABILITY, EXECUTION, TASK_TRUTH, BDD_SYNC, SEMANTIC, and FILTERED_PROOF lanes
    And the final readiness label is OVERALL NOT_READY and the canonical verdict is NOT_READY

  @feature61
  Scenario: SPECGEN004_540 MCP status and verdict use aligned gap semantics
    Given an FR has traceability edges but no canonical passed execution evidence
    When get_spec_status and spec-verdict report the spec
    Then execution absence is reported as SCENARIO_NOT_RUN or FR_NOT_EXECUTION_VERIFIED
    And the same condition is not reported as UNCOVERED_FR

  @feature61
  Scenario: SPECGEN004_541 task DONE truth guard downgrades evidence-missing work
    Given a task is textually marked DONE with an unchecked Done When item or a mapped scenario that is not canonical PASSED
    When the status mutation door and verdict evaluate that task
    Then the DONE status is denied or downgraded to evidence-derived IN_PROGRESS
    And the missing scenario or checklist evidence is named to the agent

  @feature61
  Scenario: SPECGEN004_542 source and executable BDD scenarios stay synchronized
    Given a source spec feature and an executable tests/features feature disagree on scenario ids, FR tags, or scenario count prose
    When the BDD sync checker runs
    Then executable-only scenarios require EXEC_ONLY or OUT_OF_SCOPE markers
    And source-only scenarios require an explicit pending marker or executable counterpart

  @feature61
  Scenario: SPECGEN004_543 filtered Docker BDD proof is visible without poisoning canonical coverage
    Given a filtered Docker BDD run passes selected scenario ids for a spec
    When MCP status or spec-verdict reports coverage evidence
    Then canonical coverage remains unchanged until a full run or accepted attachment lands
    And a FILTERED_PROOF lane shows the artifact path, selected ids, pass/fail summary, timestamp, source, and next action

  @feature62 @FR-62
  Scenario: SPECGEN004_573 inherited, closed, and noninteractive stdin root handoff is deterministic
    Given a real fixture checkout has equivalent Windows and WSL roots and tracked readiness inputs
    And SPECS_GENERATOR_ROOT is supplied as an environment override while stdin is independently inherited, closed, or noninteractive
    When spec-status and MCP resolve the root in order through validated SPECS_GENERATOR_ROOT, caller or project cwd, and findRepoRoot(SCRIPT_DIR)
    Then neither command waits indefinitely for stdin or reads the root from stdin
    And valid SPECS_GENERATOR_ROOT selects the same tracked artifact set as the caller project fallback

  @feature62 @FR-62
  Scenario: SPECGEN004_554 WSL-only root precheck accepts only caller or project WSL roots
    Given a WSL-only command resolves its candidate root from the caller or project WSL worktree
    When the root precheck runs through CLI and MCP
    Then each surface accepts only a validated caller or project WSL root
    And it reports NOT_READY with the observed root, unsafe artifact, and corrective action without substituting a plugin-cache, C Windows cwd, or UNC-relative root

  @feature63 @FR-63
  Scenario: SPECGEN004_555 precheck MCP and verdict derive one FR AC scenario inventory
    Given a real fixture has graph-mapped FRs, ACs, scenarios, baseline and run identities, and duplicate inventory candidates
    When precheck, MCP status, and spec-verdict evaluate the fixture
    Then each surface reports the same deduplicated FR, AC, and scenario inventory with mandatory readiness lanes
    And a structural-only result remains NOT_READY

  @feature63 @FR-63
  Scenario: SPECGEN004_556 full-run evidence preserves source time recency and outcome taxonomy
    Given a BDD run has source, timestamp, recency, baseline, run identity, and PASSED, UNKNOWN, not_recorded, stale, or filtered evidence states
    When the readiness evaluator serializes graph evidence
    Then each state remains explicit and no source, time, or recency field is discarded
    And filtered proof cannot replace canonical full-run execution evidence

  @feature63 @FR-63
  Scenario: SPECGEN004_557 AC readiness exposes empty test paths and never-run FR taxonomy requires every mandatory lane
    Given mapped AC ids include an AC with test_paths=[] and a never-run FR and readiness lanes have mixed pass and missing evidence
    When the FR-61 readiness taxonomy evaluates the candidate
    Then the result exposes the AC ids, test_paths=[], and explicit never-run classification while AND-gating every mandatory lane
    And it reports the next action without treating dependency-absent evidence as source-tree success or dependency-absent FR-64 evidence as FR-63 success

  @feature64 @FR-64
  Scenario: SPECGEN004_558 graph conformance classifies source spec test generated temp smoke and silent evidence
    Given a real spec fixture contains source, spec-test, generated, temporary, smoke, unclassified, and silent evidence records
    When graph conformance and release inventory run with baseline evidence sha `0b291bac`
    Then canonical records retain explicit provenance, intentional classification, traceability edges, and baseline evidence sha `0b291bac`
    And unclassified or silent inventory evidence is surfaced and cleaned rather than accepted as implementation proof

  @feature64 @FR-64
  Scenario: SPECGEN004_559 Docker-only verification records current pre and post release inventory
    Given a real Docker BDD fixture has classified and cleaned tracked before and after inventories, including temporary and untracked paths, and PASSED, FAILED, PENDING, UNDEFINED, AMBIGUOUS, and NOT_RUN units
    When /run-tests runs the Docker-only release inventory gate
    Then every tracked in-scope unit must be PASSED, every outcome remains distinct, and every in-scope unit satisfies the AND gate
    And additions, removals, duplicates, and untracked paths are explicitly classified; unclassified untracked paths violate cardinality or conservation rather than becoming release-ready

  @feature64 @FR-64
  Scenario: SPECGEN004_574 dependency-absent launcher status and MCP remain provenance-safe
    Given an installed plugin fixture has repository development dependencies absent
    When the installed launcher, status surface, and MCP execute the fixture
    Then a missing runtime import, bundle, or asset is reported with installed-runtime provenance and does not become a source-tree pass
    And a complete installed fixture records its baseline, run identity, and evidence source

  @feature64 @FR-64
  Scenario: SPECGEN004_561 release evidence controls one candidate through integration-first verification
    Given a single PR, GitHub release candidate, or tag is prepared with README, TASKS, CHANGELOG, and release notes
    When integration-first verification or post-release monitoring detects a tracked-file or dependency-absent failure after release
    Then the PR identity, GitHub release candidate, or tag, run identity, owner, monitoring signal, rollback action, and follow-up verification are recorded
    And not_recorded or never-run evidence prevents a release-ready claim

  @feature39 @FR-39
  Scenario: SPECGEN004_562 the installed spec guard preserves structured denies and catches whole-tree Git mutations
    Given the canonical hook-service dispatches the real spec-access guard through the bootstrap runner
    When direct spec access, Git message data, and whole-tree Git mutations run with spec-access enforce on
    Then direct access and whole-tree mutations are structured denies without a runner failure reason while Git message data is allowed

  @feature34 @FR-34
  Scenario: SPECGEN004_563 parallel sessions attribute only their own staged and unstaged spec changes
    Given two sessions share a Git worktree with pre-existing dirty spec debt and independent anchor provenance baselines
    When each session touches a different dirty spec and one file has both staged and unstaged changes
    Then each anchor Stop-gate classifies only its own touched spec without mutating the Git index
    And a session without reliable baseline evidence reports provenance unknown and fails open

  @feature39 @FR-39
  Scenario: SPECGEN004_564 spec access enforcement defaults on and hook launchers resolve without plugin root
    Given the spec guard environment precedence and canonical command-hook launchers
    When enforcement signals and a launcher without CLAUDE_PLUGIN_ROOT are exercised
    Then the first parseable signal wins, unset signals default to enforce, explicit false disables, and every launcher resolves absolutely

  @feature65 @FR-65
  Scenario: SPECGEN004_565 paid deployed API acceptance maps to implementation test and semantic evidence
    Given a synthetic paid SPA corpus with shallow, blocked-investigation, and complete acceptance task plans
    When the real acceptance delivery analyzer and audit inspect every plan
    Then shallow coverage names every missing public contract paid flow and semantic deploy lane
    And a blocking investigation remains red while the complete AC-linked plan passes
    And empty task plans exact AC identifiers alternate claim wording and analyzer outages fail closed

  @feature61 @feature63
  Scenario: SPECGEN004_566 MCP status derives EXECUTION and OVERALL from the shared effective inventory
    Given a spec whose canonical full-run pass became stale after a source change
    When MCP status and spec-verdict evaluate the same graph snapshot
    Then both surfaces report the stale scenario as effective execution debt
    And both surfaces report EXECUTION RED and OVERALL NOT_READY
    And canonical coverage remains visible without overriding effective readiness
    And dotted acceptance criterion ids remain exact in the spec-status parser

  @feature56 @FR-56
  Scenario: SPECGEN004_575 overlay evidence is commit-bound and backward-compatible
    Given legacy and commit-bound scenario overlay rows for the same scenarios
    When the real overlay reader evaluates them against the current commit
    Then the matching commit pass is fresh and the legacy or mismatched pass is stale
    And the trace response exposes commit provenance and the persisted failing step

  @feature56 @FR-56
  Scenario: SPECGEN004_576 overlay compaction preserves each latest scenario result
    Given an overlay file with repeated rows for multiple scenarios
    When the real overlay compactor rewrites the file
    Then one latest row per scenario remains and distinct-scenario cardinality is conserved
    And the canonical full-run artifact remains byte-identical

  @feature56 @FR-56
  Scenario: SPECGEN004_577 the overlay writer compacts each archived run so the trail stays bounded
    Given a cucumber-messages archive that reports the same scenarios on every run
    When the real overlay writer archives three runs with compaction enabled
    Then the overlay holds exactly one row per scenario regardless of run count

  @feature32
  Scenario: SPECGEN004_544 get_spec_status keeps a mixed-result FR execution-unverified
    Given a requirement whose linked scenarios are passed, failed and not run
    When the MCP client invokes get_spec_status view coverage for the mixed requirement
    Then FR_NOT_EXECUTION_VERIFIED includes the requirement until every linked scenario has passed

  @feature16
  Scenario: SPECGEN004_538 form-authoring steer inspects full-document edits inside MCP transactions
    Given a multi-document spec transaction with a full TASKS form and a targeted FR edit
    When the transaction is evaluated by spec-authoring-steer
    Then the full TASKS edit is routed to task-board-forms while targeted edits remain allowed

  @feature32 @FR-32
  Scenario: SPECGEN004_544 FR execution verification requires every linked scenario to pass
    Given a requirement whose linked scenarios are passed, failed and not run
    When the MCP client invokes get_spec_status view coverage for the mixed requirement
    Then FR_NOT_EXECUTION_VERIFIED includes the requirement until every linked scenario has passed

  @feature39 @FR-39
  Scenario: SPECGEN004_538 full-content transaction edits cannot bypass form-skill steering
    Given a multi-document spec transaction with a full TASKS form and a targeted FR edit
    When the transaction is evaluated by spec-authoring-steer
    Then the full TASKS edit is routed to task-board-forms while targeted edits remain allowed

  @FR-10
  Scenario: SPECGEN004_545 SQLite schema mismatch quarantines the stale cache before warm-start
    Given an opt-in SQLite graph cache stamped with an obsolete schema version
    When the MCP lifecycle opens the SQLite cache with recovery
    Then the stale cache is quarantined with reason schema_mismatch
    And a fresh cache uses the current schema and contains no stale nodes

  @FR-10
  Scenario: SPECGEN004_546 SQLite lifecycle warm-start restores the persisted graph
    Given an opt-in SQLite lifecycle builds and persists a spec graph
    When a second MCP lifecycle starts over the unchanged repository
    Then the second lifecycle reports a warm cache and serves the persisted nodes


  @FR-36 @feature36
  Scenario: SPECGEN004_577 canonical namespace and localId round-trip preserves exact identity
    Given a hierarchical namespace identity with an exact local ID
    When the canonical identity is formatted and parsed
    Then the exact namespace local ID and canonical ID are preserved

  @FR-36 @feature36
  Scenario: SPECGEN004_578 ambiguous local ID returns every canonical namespace candidate
    Given two namespaces that each define local ID FR-3
    When get_node receives the bare local ID FR-3
    Then the ambiguity response includes local ID and sorted canonical candidates

  @FR-36 @feature36
  Scenario: SPECGEN004_579 case-only identity variants collide inside one namespace
    Given two canonical IDs in one namespace that differ only by case
    Then the identity contract reports a CASE_NORMALIZED collision

  @FR-36 @feature36
  Scenario: SPECGEN004_580 Unicode NFKC identity variants collide inside one namespace
    Given two canonical IDs in one namespace that are Unicode NFKC equivalents
    Then the identity contract reports a UNICODE_NORMALIZED collision

  @FR-36 @feature36
  Scenario: SPECGEN004_581 case-equivalent local IDs remain legal across namespaces
    Given case-equivalent local IDs in different canonical namespaces
    Then the identity contract reports no cross-namespace collision

  @FR-36 @feature36
  Scenario: SPECGEN004_582 the real corpus has no normalization identity collisions
    Given the migration phase has completed
    When the dogfood harness dumps the raw pre-map nodes
    Then the collision probe reports zero normalization collisions


  @FR-66 @feature66
  Scenario: SPECGEN004_583 typed metadata preserves known and unknown fields
    Given an FR with valid typed requirement metadata and an extension field
    When the real graph parses and serves the requirement
    Then typed metadata and the unknown extension round-trip exactly

  @FR-66 @feature66
  Scenario: SPECGEN004_584 invalid metadata fails consistently across parser and MCP
    Given an FR with invalid safety and demand metadata
    When parser and MCP authoring validate the metadata
    Then both surfaces return the same metadata validation findings

  @FR-66 @feature66
  Scenario: SPECGEN004_585 missing required delivery blocks smart overall only
    Given an implemented FR with one required delivery artifact missing
    When the real FR census evaluates task and delivery truth
    Then task verdict stays IMPLEMENTED and delivery is INCOMPLETE

  @FR-66 @feature66
  Scenario: SPECGEN004_586 all required delivery artifacts satisfy non-empty ALL
    Given an implemented FR with every required artifact present
    When the real FR census evaluates task and delivery truth
    Then delivery is DELIVERED and optional missing artifacts do not block

  @FR-66 @feature66
  Scenario: SPECGEN004_587 forwarded delivery demands resolve precedence and conflicts
    Given linked requirements with inherited duplicate and contradictory demands
    When the delivery resolver forwards needs through the graph
    Then demands deduplicate and contradictions emit FR_DEMAND_CONFLICT

  @FR-66 @feature66
  Scenario: SPECGEN004_588 metadata migration query and SQLite restore agree
    Given legacy requirement metadata with an unknown extension
    When migration MCP query and SQLite warm restore process it
    Then every surface returns the same typed metadata and delivery state


  @feature67 @FR-67 @AC-67.1
  Scenario: SPECGEN004_589 edge vocabulary has exhaustive endpoint rules
    Given a graph fixture with every supported edge type
    When I inspect the typed edge endpoint schema
    Then verifies and entitles are distinct edge types with endpoint rules
    And every edge type has exactly one endpoint rule

  @feature67 @FR-67 @AC-67.2
  Scenario: SPECGEN004_590 valid semantic edge directions pass validation
    Given a graph fixture with valid covers tested-by verifies and entitles edges
    When I validate all graph edge endpoints
    Then no endpoint violations are reported
    And all valid semantic edges remain traversable

  @feature67 @FR-67 @AC-67.3
  Scenario: SPECGEN004_591 invalid edge endpoints fail with actionable detail
    Given a graph fixture with an AC to FR covers edge
    When I validate all graph edge endpoints
    Then an ENDPOINT_VIOLATION error identifies actual and allowed endpoint types
    And the invalid edge is retained for diagnosis

  @feature67 @FR-67 @AC-67.4
  Scenario: SPECGEN004_592 MCP staged transaction refuses invalid endpoints atomically
    Given a staged MCP spec graph and a candidate graph with an injected invalid typed edge
    When I run the MCP transaction endpoint gate on before and after graphs
    Then the gate reports a new ENDPOINT_VIOLATION and refuses the write
    And every transaction document remains byte-identical

  @feature67 @FR-67 @AC-67.5
  Scenario: SPECGEN004_593 SQLite restore preserves typed edges and verdict
    Given a graph with verifies entitles and endpoint metadata
    When I persist and restore the graph through SQLite
    Then the restored typed edges and metadata equal the cold graph
    And cold and warm endpoint verdicts are identical

  @feature67 @FR-67 @AC-67.6
  Scenario: SPECGEN004_594 existing edge producers remain compatible
    Given markdown gherkin implementation result and trace edge fixtures
    When I build and validate the composite graph
    Then existing covers tested-by implementation result and trace edges are valid
    And MCP trace traversal still returns existing and new semantic edges


  @feature67 @FR-67 @AC-67.7
  Scenario: SPECGEN004_595 real producers auto-emit verifies and entitles edges
    Given a spec fixture with a decision requirement line and a passing tagged scenario
    When I build the graph and derive verifies from the passing result
    Then the markdown producer emits an entitles edge from the decision to its requirement
    And the builder emits a verifies edge from the passing scenario carrying producer and version



  @feature68 @FR-68 @AC-68.1
  Scenario: SPECGEN004_596 uncovered acceptance criterion is a blocking error
    Given a graph fixture with an AC that has no own tested-by scenario
    When I evaluate completion evidence conformance
    Then UNCOVERED_AC is reported as an error for that exact criterion

  @feature68 @FR-68 @AC-68.2
  Scenario: SPECGEN004_597 unverified acceptance criterion is a blocking error
    Given an AC with own scenarios but no current passing verifies edge
    When I evaluate completion evidence conformance
    Then UNVERIFIED_AC is reported as an error for that exact criterion

  @feature68 @FR-68 @AC-68.3
  Scenario: SPECGEN004_598 parent requirement evidence does not complete sibling criteria
    Given two sibling ACs whose parent FR has a passing scenario
    And only the first AC has its own passing scenario
    When I build the readiness inventory
    Then the first AC is satisfied and the second has inherited non-completing context

  @feature68 @FR-68 @AC-68.4
  Scenario: SPECGEN004_599 AC satisfaction is non-empty ALL
    Given multiple ACs with one satisfied criterion and one open criterion
    When I evaluate mandatory readiness lanes
    Then AC_SATISFACTION is RED until every criterion has own passing evidence

  @feature68 @FR-68 @AC-68.5
  Scenario: SPECGEN004_600 bulk criterion tag laundering is rejected
    Given sibling AC tags copied across scenarios without distinct behavioral assertions
    When I evaluate tag bulk suspicion
    Then blocking TAG_BULK_SUSPECT is emitted and copied tags are not counted as proof

  @feature69 @FR-69 @AC-69.1
  Scenario: SPECGEN004_601 NFR nodes and evidence survive readiness inventory
    Given a required NFR with its own tagged and passing scenario
    When I build the spec-scoped readiness inventory
    Then the NFR and its tested-by and verifies edges remain in the inventory

  @feature69 @FR-69 @AC-69.2
  Scenario: SPECGEN004_602 uncovered and unverified NFRs are blocking
    Given one required NFR with no scenario and another with no passing scenario
    When I evaluate completion evidence conformance
    Then UNCOVERED_NFR and UNVERIFIED_NFR are reported as errors

  @feature69 @FR-69 @AC-69.3
  Scenario: SPECGEN004_603 NFR satisfaction is required non-empty ALL
    Given required optional and justified not-applicable NFRs
    When I evaluate mandatory readiness lanes
    Then NFR_SATISFACTION depends on every required NFR and keeps the others visible

  @feature69 @FR-69 @AC-69.4
  Scenario: SPECGEN004_604 NFR verification methods persist across all surfaces
    Given NFR fixtures using test analysis review inspection and demonstration methods
    When I round-trip them through parser MCP query and SQLite restore
    Then every surface returns the same method and evaluated evidence state

  @feature70 @FR-70 @AC-70.1
  Scenario: SPECGEN004_605 evidence node has a typed endpoint contract
    Given a requirement and a valid content-addressed evidence manifest
    When I build and validate the graph
    Then an Evidence node and evidenced-by edge are present with valid endpoints

  @feature70 @FR-70 @AC-70.2
  Scenario: SPECGEN004_606 evidence manifest preserves provenance and integrity fields
    Given a complete artifact manifest with identity timing digest and subject fields
    When I parse persist restore and query its Evidence node
    Then all manifest fields remain byte-equivalent across surfaces

  @feature70 @FR-70 @AC-70.3
  Scenario Outline: SPECGEN004_607 invalid artifact evidence never becomes present
    Given required operational proof with an artifact that is <invalidity>
    When I derive its evidence state
    Then the evidence is MISSING and the smart verdict is not GREEN

    Examples:
      | invalidity |
      | missing |
      | non-regular |
      | empty |
      | outside the attachment root |
      | digest-mismatched |
      | not finalized |
      | stale for the subject revision |

  @feature70 @FR-70 @AC-70.4
  Scenario: SPECGEN004_608 demonstration and inspection imply operational proof
    Given requirements whose verification methods are demonstration inspection and test
    When I normalize their delivery demands
    Then demonstration and inspection require operational proof and test does not gain it implicitly

  @feature70 @FR-70 @AC-70.5
  Scenario: SPECGEN004_609 manual present and dead evidence targets are rejected
    Given operational proof with hand-authored PRESENT or a non-present evidence target
    When I validate and evaluate the demand
    Then manual PRESENT is invalid and target existence alone cannot satisfy the demand

  @feature70 @FR-70 @AC-70.6
  Scenario: SPECGEN004_610 evidence survives graph MCP transaction and SQLite restore
    Given a valid Evidence node edge manifest and review fixture
    When I use full and incremental builds staged MCP transactions and SQLite cold-warm restore
    Then identity endpoint validation fields and verdict are equivalent on every path

  @feature71 @FR-71 @AC-71.1
  Scenario: SPECGEN004_611 demonstration recording is finalized before review
    Given a live target exercise with a video recorder
    When the producer closes the recording and registers its manifest
    Then hashing and judge review begin only after the artifact is finalized

  @feature71 @FR-71 @AC-71.2
  Scenario: SPECGEN004_612 independent reviewer binds the exact artifact digest
    Given a finalized demonstration with distinct producer and reviewer identities
    When the reviewer evaluates the artifact
    Then the review records both identities and the exact reviewed digest

  @feature71 @FR-71 @AC-71.3
  Scenario: SPECGEN004_613 judge verdict is complete and timestamped
    Given a demonstration with multiple required criteria
    When the independent judge emits its structured verdict
    Then every criterion has a timestamped observation and CONFIRMED or DENIED outcome

  @feature71 @FR-71 @AC-71.4
  Scenario Outline: SPECGEN004_614 invalid independent review never completes proof
    Given required demonstration proof whose review is <invalidity>
    When I evaluate independent judgment
    Then operational proof remains incomplete and the smart verdict is not GREEN

    Examples:
      | invalidity |
      | reviewer equals producer |
      | producer identity absent |
      | reviewer identity absent |
      | bound to a different digest |
      | missing a required criterion |
      | contains a required DENIED outcome |
      | unavailable |

  @feature71 @FR-71 @AC-71.5
  Scenario: SPECGEN004_615 protocol dogfoods its own independently reviewed MP4
    Given the FR-71 live producer-to-judge walkthrough has been recorded
    When an independent judge reviews that exact MP4 against every AC-71 criterion
    Then the evidence manifest and CONFIRMED verdict satisfy FR-71 demonstration proof



@feature72 @FR-72 @AC-72.1
Scenario: SPECGEN004_616 Canonical parsing retains task contract
  Given a strict task declares identity, revision, typed links, criteria, surfaces, artifacts, and evidence policy
  When the execution planner parses it
  Then the query returns every declared canonical field

@feature72 @FR-72 @AC-72.2
Scenario: SPECGEN004_617 Canonical READY task round-trips losslessly
  Given a canonical READY task with ordered dependencies and criteria
  When it is parsed rendered and parsed again
  Then canonical stable-key JSON is byte-equivalent after Unicode/case normalization and READY, unknown fields, comments, and source spans remain equal

@feature72 @FR-72 @AC-72.3
Scenario: SPECGEN004_618 Legacy task text remains visible
  Given strict TASKS.md contains a loose legacy item
  When census loads it
  Then the item remains visible with actionable migration finding

@feature72 @FR-72 @AC-72.4
Scenario: SPECGEN004_619 Task views share canonical identity
  Given a canonical task revision and READY status
  When Graph MCP lifecycle census and summary query it
  Then each view reports equal ID revision and status

@feature72 @FR-72 @AC-72.5
Scenario: SPECGEN004_620 Invalid task apply is atomic
  Given a persisted canonical task snapshot
  When apply proposes duplicate ID and unresolved AC link
  Then field findings return and snapshot is unchanged

@feature73 @FR-73 @AC-73.1
Scenario: SPECGEN004_621 Typed dependency retains reason
  Given task A depends-on task B because schema generation must finish
  When graph builds dependencies
  Then A has typed edge to B with that reason

@feature73 @FR-73 @AC-73.2
Scenario: SPECGEN004_622 Cycle proposal is refused
  Given A depends-on B and B depends-on C
  When dry-run proposes C depends-on A
  Then response names cycle and DAG remains unchanged

@feature73 @FR-73 @AC-73.3
Scenario: SPECGEN004_623 Blocker explanation names predecessor
  Given task A depends-on incomplete B for contract publication
  When task A is planned
  Then A shows B relation reason and state as blocker

@feature73 @FR-73 @AC-73.4
Scenario: SPECGEN004_624 Prose ordering cannot make task ready
  Given task A says after B in prose and task C has unfinished typed predecessor
  When readiness is evaluated
  Then A gets migration warning and C is not READY

@feature73 @FR-73 @AC-73.5
Scenario: SPECGEN004_625 Dependency graph restores deterministically
  Given a valid typed DAG from TASKS.md
  When source incremental and SQLite paths load it
  Then ordered edges and reverse blockers match

@feature74 @FR-74 @AC-74.1
Scenario: SPECGEN004_626 Surface claim is structured
  Given a task declares file write locator scope and rationale
  When validation runs
  Then permitted kind access normalized locator scope and rationale persist

@feature74 @FR-74 @AC-74.2
Scenario: SPECGEN004_627 Unsafe locators are flagged
  Given task claims ../outside.ts and an unbounded glob
  When planner validates surfaces
  Then named redacted finding for traversal, absolute/UNC, normalization, realpath symlink/junction, or bounded-glob breach prevents safe scheduling without command execution

@feature74 @FR-74 @AC-74.3
Scenario: SPECGEN004_628 Actual artifacts reconcile with plan
  Given task declares only src/planner.ts
  When execution records src/planner.ts and config/runtime.json
  Then report identifies undeclared actual artifact

@feature74 @FR-74 @AC-74.4
Scenario: SPECGEN004_629 Impact query shows paths
  Given a task writes schema consumed by two dependent tasks
  When MCP queries blast radius
  Then direct claim and transitive tasks include explanations

@feature74 @FR-74 @AC-74.5
Scenario: SPECGEN004_630 Nonlocal locator is never executed
  Given a task declares shell-like external-contract locator
  When planner validates it
  Then boundary remains typed data without command execution

@feature75 @FR-75 @AC-75.1
Scenario: SPECGEN004_631 Access overlap derives conflicts
  Given ready tasks with write/write read/write and exclusive overlap
  When conflicts are derived
  Then each unsafe pair has applicable class

@feature75 @FR-75 @AC-75.2
Scenario: SPECGEN004_632 Semantic resource conflicts across files
  Given two tasks edit different files but write API contract billing.v2
  When conflicts are derived
  Then semantic API conflict is returned

@feature75 @FR-75 @AC-75.3
Scenario: SPECGEN004_633 Conflict explanation is inspectable
  Given two tasks conflict on normalized schema
  When MCP queries conflict
  Then tasks claims overlap and derivation rule are shown

@feature75 @FR-75 @AC-75.4
Scenario: SPECGEN004_634 Override expires
  Given scoped audited conflict override with expiry
  When time advances past expiry
  Then it no longer suppresses conflict and audit remains visible

@feature75 @FR-75 @AC-75.5
Scenario: SPECGEN004_635 Batches never forge dependency
  Given two ready tasks conflict in a wave
  When batches are planned
  Then they separate without adding DAG edge

@feature76 @FR-76 @AC-76.1
Scenario: SPECGEN004_636 Selected DAG yields parallel waves
  Given A precedes B and C is independent
  When selected subgraph is planned
  Then A and C occur before B in labelled waves

@feature76 @FR-76 @AC-76.2
Scenario: SPECGEN004_637 Wave batches are conflict free
  Given a wave has two conflicting tasks and one independent task
  When planner partitions it
  Then each batch is conflict free and union equals wave

@feature76 @FR-76 @AC-76.3
Scenario: SPECGEN004_638 Critical path uses estimates
  Given acyclic graph with estimates and one documented default
  When metrics calculate
  Then weighted critical path slack and default marker return

@feature76 @FR-76 @AC-76.4
Scenario: SPECGEN004_639 Blocked task reveals schedule impact
  Given blocked task lies on critical path
  When plan reports schedule
  Then blocker reason and affected downstream path are shown

@feature76 @FR-76 @AC-76.5
Scenario: SPECGEN004_640 Identical input gives identical plan
  Given unchanged selected graph with equal candidates
  When cold and warm planning run
  Then stable-key JSON for waves, batches, critical path, slack, normalized-ID tie order, and half-up estimate rounding is byte-equivalent and warm p95 meets the 300-task/450-edge/1500-claim harness budget

@feature77 @FR-77 @AC-77.1
Scenario: SPECGEN004_641 Evidence is task owned
  Given a validation run owns scenario and artifact evidence
  When evidence stores
  Then owner validated IDs run environment result and fingerprints persist

@feature77 @FR-77 @AC-77.2
Scenario: SPECGEN004_642 Input change closes stale descendants
  Given B consumes artifact from A and C depends on B
  When A fingerprint changes
  Then B and C become stale with paths and reasons

@feature77 @FR-77 @AC-77.3
Scenario: SPECGEN004_643 Historical proof cannot complete stale task
  Given successful evidence becomes stale
  When lifecycle recovers task
  Then history stays visible and task is not DONE before READY or in-progress

@feature77 @FR-77 @AC-77.4
Scenario: SPECGEN004_644 Filtered success is not full proof
  Given evidence policy requires full suite
  When only filtered passing run attaches
  Then run remains visible and task is not DONE

@feature77 @FR-77 @AC-77.5
Scenario: SPECGEN004_645 Evidence survives restoration
  Given current historical evidence and stale reasons
  When graph persists restores and MCP queries
  Then ownership result fingerprints and reasons agree

@feature78 @FR-78 @AC-78.1
Scenario: SPECGEN004_646 Discovery proposes instead of mutating
  Given discovery finds candidate child task
  When it finishes
  Then schema-valid proposal returns and graph waits for apply

@feature78 @FR-78 @AC-78.2
Scenario: SPECGEN004_647 Discovery identities and budgets are bounded
  Given stable semantic key and child scope write limits
  When proposal exceeds limit
  Then child ID derives from parent key and excess is rejected

@feature78 @FR-78 @AC-78.3
Scenario: SPECGEN004_648 Discovery replay is idempotent
  Given accepted discovery output digest
  When same output replays
  Then no-op returns without duplicate task or edge

@feature78 @FR-78 @AC-78.4
Scenario: SPECGEN004_649 Discovery patch is atomic
  Given patch has valid child and cyclic dependency
  When dry-run and apply run
  Then both report cycle and persist no patch part

@feature78 @FR-78 @AC-78.5
Scenario: SPECGEN004_650 Empty and high impact discovery are controlled
  Given one discovery is empty and another is high impact
  When proposals evaluate
  Then first records no_children and second awaits approval

@feature79 @FR-79 @AC-79.1
Scenario: SPECGEN004_651 MCP query explains plan
  Given selected graph has dependencies surfaces conflicts and stale evidence
  When agent queries execution plan
  Then typed graph impact conflicts waves batches path slack stale reasons and explanations return

@feature79 @FR-79 @AC-79.2
Scenario: SPECGEN004_652 Mutation honors dry-run CAS atomicity
  Given graph revision and patch with invalid change
  When dry-run and CAS apply request
  Then dry-run writes nothing and apply leaves all records unchanged

@feature79 @FR-79 @AC-79.3
Scenario: SPECGEN004_653 SQLite preserves planning truth
  Given canonical tasks claims evidence and plan persist
  When cold and warm restore occur
  Then model edges plan stale state and reports are equivalent

@feature79 @FR-79 @AC-79.4
Scenario: SPECGEN004_654 Installed bundle survives dependency absence
  Given installed bundle launches without project node_modules
  When plan query and validation run against real data
  Then expected results return without silent dependency skip

@feature79 @FR-79 @AC-79.5
Scenario: SPECGEN004_655 Reports explain planning risk
  Given plan has migration debt conflicts broad impact critical work and stale evidence
  When reports query
  Then source task IDs and actionable redacted explanations return without exposing secret locator or environment values

@feature79 @FR-79 @AC-79.6
Scenario: SPECGEN004_656 Rollout never loses legacy task
  Given legacy task source in observe warn and enforce modes
  When reports generate
  Then count is preserved and enforce explicitly rejects unresolved record



@feature80 @FR-80 @AC-80.1 @AC-80.2 @AC-80.4 @AC-80.6 @AC-80.8
Scenario: SPECGEN004_657 synthesizes a DDD vertical acceptance slice before scheduling
  Given repository reality identifies the "task-synthesis" domain boundary, "TaskSynthesis" aggregate, "one lane per acceptance criterion" invariant, and "task/v1" contract
  And FR-80 has one applicable acceptance criterion and tagged BDD evidence
  When deterministic pre-scheduling synthesis runs
  Then it stores one `domainMode: ddd` canonical task/v1 vertical slice with its requirement, acceptance criterion, scenario, evidence, estimate, doneWhen, dependencies, and declared surfaces
  And no FR-72..FR-79 scheduling operation creates another planning graph

@feature80 @FR-80 @AC-80.1 @AC-80.3 @AC-80.8
Scenario: SPECGEN004_658 synthesizes an infrastructure slice without invented domain entities
  Given repository reality identifies a CLI module, filesystem adapter, and stable JSON contract but no domain boundary
  When deterministic pre-scheduling synthesis runs
  Then it stores `domainMode: none` with the module, adapter, and contract boundaries
  And the generated task has measurable doneWhen, an estimate, requirement and acceptance references, typed dependencies, and read, write, and exclusive surfaces
  And it does not create an entity, aggregate, or invariant

@feature80 @FR-80 @AC-80.5
Scenario: SPECGEN004_659 blocks finalization for an unknown implementation surface
  Given an applicable acceptance lane has no repository-supported implementation surface
  When deterministic pre-scheduling synthesis runs
  Then it creates a named BLOCKED investigation record that owns the acceptance lane
  And task finalization is rejected until that investigation is resolved

@feature80 @FR-80 @AC-80.1 @AC-80.4 @AC-80.9 @AC-80.10
Scenario: SPECGEN004_660 conserves every acceptance lane without loss or duplication
  Given ordered FR, acceptance-criterion, DESIGN, BDD, and repository-reality inputs contain three applicable acceptance lanes
  When deterministic pre-scheduling synthesis runs twice
  Then each result contains exactly three uniquely owned lanes and stable-key byte-equivalent canonical task/v1 records
  And a missing or duplicate source claim produces a named deterministic finding instead of silent loss or duplication
  And the stored SpecGraph is the direct input to FR-72..FR-79 planning

@feature80 @FR-80 @AC-80.6 @AC-80.7
Scenario: SPECGEN004_661 preserves BDD-only RED GREEN REFACTOR causal ordering
  Given an acceptance lane has a vertical BDD slice with RED, GREEN, and REFACTOR work
  When deterministic pre-scheduling synthesis validates the slice
  Then the slice owns its requirement, acceptance criterion, scenario, and verification evidence
  And it persists typed causal edges in RED then GREEN then REFACTOR order
  And a reordered, missing, or cross-slice causal edge is rejected



@feature80 @FR-80 @AC-80.10
Scenario: SPECGEN004_662 synthesizes canonical agent work from approved design ownership without micro-task explosion
  Given an approved design revision and digest plus a repository-verified component/interface responsibility map
  When deterministic task synthesis creates an AC/BDD vertical outcome
  Then the stored SpecGraph contains one canonical task with exact source locations and interfaces
  And its ordered 2–5-minute BDD-only RED, GREEN, and REFACTOR steps are embedded in its brief rather than separately schedulable graph nodes
  And conditional `domainMode: ddd` retains only verified boundaries while `domainMode: none` invents no domain entities

@feature80 @FR-80 @AC-80.10
Scenario: SPECGEN004_663 rejects an incomplete synthesis before planning
  Given a synthesized task set with a placeholder, an unconserved lane, missing ownership, no exact interface location, infeasible work, an untyped causal edge, and incomplete surfaces
  When the deterministic pre-planner synthesis review runs
  Then planning is rejected with stable named findings for every violation
  And a cyclic or reordered BDD-only RED to GREEN to REFACTOR edge is rejected before batching

@feature80 @FR-80 @AC-80.10
Scenario: SPECGEN004_664 projects an evidence-safe agent brief and machine-proven parallel batch
  Given canonical tasks with exact source context, interfaces, typed dependencies, predecessor summaries, scenarios, evidence commands, blockers, and declared surfaces
  When `TaskPlanResult` is projected for an AI agent
  Then each task brief is self-contained from the stored SpecGraph without a second plan authority or executor
  And a safe batch includes pairwise proof of no causal path in either direction and no conflict pair rather than an assertion in prose
  And only evidence-backed `DONE` completes a task while `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, and `BLOCKED` retain diagnostics and create follow-up proposals


@feature81 @FR-81 @AC-81.2
Scenario: SPECGEN004_665 Cursor mcp twin file ships the door bundle
  Given the repository root contains ".cursor/mcp.json"
  When the Cursor MCP config is loaded
  Then it names the "dev-pomogator-specs" server
  And the launch path includes "tools/spec-mcp-server/server.bundle.mjs"

@feature81 @FR-81 @AC-81.5
Scenario: SPECGEN004_666 root and Cursor door entries stay equivalent
  Given root ".mcp.json" and ".cursor/mcp.json" both declare "dev-pomogator-specs"
  When ensure-cursor-mcp runs with "--check"
  Then it exits 0 reporting the door entries match

@feature81 @FR-81 @AC-81.2
Scenario: SPECGEN004_667 resolveRepoRoot tolerates Cursor-like placeholder env
  Given DEV_POMOGATOR_REPO_ROOT is the literal "${CLAUDE_PROJECT_DIR}"
  And process.cwd() is a directory that contains ".specs"
  When resolveRepoRoot runs
  Then it returns the cwd that contains ".specs"

@live-evidence @cursor-live @feature81 @FR-81 @AC-81.1 @AC-81.4
Scenario: SPECGEN004_668 Cursor session lists the MCP door
  Given Cursor Third-party skills are enabled and ".cursor/mcp.json" is loaded
  When the agent inspects the MCP tool catalog
  Then "dev-pomogator-specs" tools are listed

@live-evidence @cursor-live @feature81 @FR-81 @AC-81.3 @AC-81.4
Scenario: SPECGEN004_669 Cursor enforce denies raw specs write and MCP apply succeeds
  Given SPEC_ACCESS enforce is on and project ".claude/settings.json" hooks are loaded in Cursor
  When the agent attempts a raw Write under ".specs/"
  Then the PreToolUse guard denies the write
  And a valid MCP apply_spec_change succeeds



@feature82 @FR-82 @AC-82.1
Scenario: SPECGEN004_670 lists every unfinished task with evidence-backed fields
  Given the live SpecGraph contains task nodes and the harness loads the captured corpus artifact for wf_0315d03b-28
  When the real list_tasks MCP handler is called for one spec without a status filter
  Then it returns every non-terminal task with id title status phase rationale links source location and evidence-backed blockers only
  And the response includes total returned truncated and next cursor metadata

@feature82 @FR-82 @AC-82.2
Scenario: SPECGEN004_671 paginates task inventory without silent caps or cardinality loss
  Given the real captured task corpus has more matching tasks than the requested page limit
  When the real list_tasks MCP handler is called repeatedly with its returned cursor
  Then the concatenated pages contain exactly total unique canonical task ids in stable order
  And every page reports returned cardinality consistently and no task is silently omitted
  And the reference corpus completes at most two pages when the limit is 200

@feature82 @FR-82 @AC-82.3
Scenario: SPECGEN004_672 distinguishes an unknown phase from an empty phase
  Given the real graph exposes canonical phases and the captured corpus has a known phase with no matching tasks
  When the real list_phase_tasks MCP handler is called with the spec and each phase query
  Then the known empty phase returns EMPTY_PHASE
  And the unknown phase returns PHASE_NOT_FOUND with nearest canonical phase candidates
  And a populated phase uses bounded deterministic pagination

@feature82 @FR-82 @AC-82.4
Scenario: SPECGEN004_673 searches one spec with complete cursor pagination
  Given the real graph contains matching and non-matching nodes across more than one page
  When the real search MCP handler is called with a spec scope and fixed query filters
  Then cursor pages concatenate to the complete matching set in stable order
  And total returned truncated and next cursor values conserve the matching cardinality

@feature82 @FR-82 @AC-82.5
Scenario: SPECGEN004_674 returns compact summary without unchanged census recomputation
  Given the real graph revision is unchanged between two summary requests
  When the real get_spec_status MCP handler is called with view summary twice
  Then each response contains status counts and gap summary but no full task inventory payload
  And the second call does not recompute an unchanged read-side global census

@feature82 @FR-82 @AC-82.6
Scenario: SPECGEN004_675 bounds document reads and suggests canonical missing-section anchors
  Given the real spec corpus contains a document larger than the safe page bound
  When the real read_spec_doc MCP handler is called without pagination and then with a missing section
  Then the first response is bounded and a whole-document read requires explicit opt-in
  And the missing section response identifies nearest canonical headings or anchors

@feature82 @FR-82 @AC-82.7
Scenario: SPECGEN004_676 keeps list phase documentation and tests truthful
  Given the live graph contains task nodes and the existing phase-query description and test are loaded
  When the list_phase_tasks contract regression runs through the real MCP handler
  Then neither the tool description nor the assertion claims that task nodes are not produced
  And a genuinely empty phase is not reported as evidence that the task inventory is absent

@feature82 @FR-82 @AC-82.8 @AC-82.9
Scenario: SPECGEN004_677 meets bounded incident verification without an N by M crawl
  Given the real captured wf_0315d03b-28 incident and corpus artifact are loaded rather than a hand-invented producer shape
  When one bounded task-inventory request and bounded verification are run through real MCP handlers
  Then the run stays within the declared maximum of three MCP calls, 512 KiB aggregate response bytes, and the declared page latency budget
  And the six retries, 695 calls, approximately 5.46 MB, and approximately 297 to 312k input tokens remain recorded as incident evidence rather than an eternal performance claim

@feature77 @FR-77 @AC-77.6
Scenario: SPECGEN004_678 Restored evidence is revalidated before completion
  Given persisted task evidence claims completion without canonical ownership bindings
  When task evidence restores and completion evaluates
  Then forged completion flags are ignored and the evidence remains non-completing history

@feature78 @FR-78 @AC-78.6
Scenario: SPECGEN004_679 Discovery approval state cannot be tampered
  Given a high impact discovery proposal requires approval
  When its caller changes approval state without changing the digest
  Then proposal integrity fails and no graph mutation commits

@feature79 @FR-79 @AC-79.7
Scenario: SPECGEN004_680 Stale evidence blocks plan completion
  Given a selected ready task has stale evidence
  When execution plan readiness evaluates
  Then the task is not ready and the plan is incomplete with a stale-evidence finding

@feature79 @FR-79 @AC-79.7
Scenario: SPECGEN004_681 Unrelated plan patch preserves explicit conflicts
  Given a plan has an explicit externally audited conflict
  When an unrelated valid patch commits
  Then the explicit conflict remains in the next plan state


@feature81 @FR-81 @AC-81.7
Scenario: SPECGEN004_682 Live evidence binds expected records to current producer artifacts
  Given a producer-derived live evidence manifest with current checkout and workspace bindings
  When the real live evidence validator checks missing and modified producer bindings
  Then missing expected records and changed trace or workspace evidence are rejected by named findings

@feature79 @FR-79 @AC-79.8
Scenario: SPECGEN004_683 Invalid canonical tasks keep plans incomplete
  Given a malformed canonical task reaches plan state construction
  When the canonical task plan is queried and restored
  Then the plan remains incomplete with a retained invalid-task finding

@feature79 @FR-79 @AC-79.8
Scenario: SPECGEN004_684 Storage compare-and-swap rejects the second writer
  Given two task plan writers read the same persisted revision
  When both writers apply different valid patches
  Then only the first storage compare-and-swap commits and the second reports stale revision

@feature80 @FR-80 @AC-80.12
Scenario: SPECGEN004_685 Synthesis rejects unresolved sources dependencies and blank causal work
  Given strict synthesis receives unresolved registries dependency targets and blank causal step text
  When deterministic pre-scheduling synthesis reviews the lanes
  Then named blocking findings reject every invalid reference and blank causal step

@feature63 @FR-63 @AC-63.4
Scenario: SPECGEN004_686 proven retired scenario keeps historical evidence but releases active execution debt
  Given a readiness fixture with a historical scenario superseded by an existing spec and a stale overlay pass
  When the readiness inventory classifies its scenario scopes
  Then the scenario is classified historical-retired with its overlay record preserved
  And the EXECUTION lane carries no debt for it while LIVE_EVIDENCE reports NONE without live scenarios

@feature63 @FR-63 @AC-63.4
Scenario: SPECGEN004_687 unproven historical and live scenarios remain honest readiness debt
  Given a readiness fixture with a bare historical scenario a dangling superseded scenario and a pending live scenario
  When the readiness inventory classifies its scenario scopes and evaluates readiness
  Then both unproven scenarios stay active EXECUTION debt under HISTORICAL_UNPROVEN
  And the live scenario blocks the LIVE_EVIDENCE lane until real producer proof arrives

@feature81 @FR-81 @AC-81.10
Scenario: SPECGEN004_688 Captured live evidence fixture validates against independent ground-truth digests
  Given a captured live evidence fixture with independent ground-truth digests
  When the real validator verifies the captured fixture and tampered variants
  Then the captured fixture passes against independent digests and one-byte tamper fails closed

@feature81 @FR-81 @AC-81.8
Scenario: SPECGEN004_689 Symlinked workspace and trace files cannot escape the repository
  Given a live evidence manifest whose workspace and trace files escape through symlinks
  When the real live evidence validator checks canonical path containment
  Then escaping workspace and trace evidence are rejected fail-closed by named findings

@feature81 @FR-81 @AC-81.9
Scenario: SPECGEN004_690 Unexpected evidence records fail closed under an expectation set
  Given a producer-derived manifest containing an unexpected extra evidence record
  When the real validator checks the manifest with and without an expectation set
  Then unexpected records fail closed while empty expectations stay permissive

@feature79 @FR-79 @AC-79.8
Scenario: SPECGEN004_691 Invalid canonical tasks never schedule and never complete
  Given a malformed canonical task is selected for planning
  When the plan schedules and a completion patch is applied
  Then the invalid task is unscheduled, blocked, and cannot complete

@feature80 @FR-80 @AC-80.12
Scenario: SPECGEN004_692 Synthesis rejects mismatched and inapplicable acceptance lanes
  Given strict synthesis receives a mismatched requirement lane and an inapplicable acceptance lane
  When deterministic synthesis finalizes and projects the mismatched plan
  Then mismatched and inapplicable lanes are rejected without an accepted projection
