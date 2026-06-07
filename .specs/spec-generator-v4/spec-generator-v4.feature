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

  @feature6
  Scenario: SPECGEN004_13 PostToolUse hook aggregates and deduplicates findings in bulk edit
    Given the agent makes 5 sequential Edits to `.specs/auth/*.md` within 2 seconds
    When PostToolUse hook fires for each
    Then findings are batched in the 3-second throttle window
    And duplicate findings (same code + location) are deduplicated
    And only one aggregated `<system-reminder>` is pushed after the window closes

  @feature6
  Scenario: SPECGEN004_14 PostToolUse push silenced when frontmatter flag set
    Given a spec file frontmatter contains `_no_push_check: true`
    When the agent edits that file
    And PostToolUse hook fires
    Then no `<system-reminder>` is pushed for that file
    And the findings are still logged to `.dev-pomogator/.spec-check-log/`

  @feature7
  Scenario: SPECGEN004_15 Marksman binary installed silently during npm install
    Given a fresh `npx dev-pomogator install` invocation
    When the postInstall script completes
    Then `.dev-pomogator/bin/marksman` (or platform equivalent) exists and is executable
    And the binary responds to LSP `initialize` request

  @feature7
  Scenario: SPECGEN004_16 No fake fallback when Marksman is unavailable
    Given the Marksman binary download fails during install (no network)
    When the MCP server starts
    Then it detects missing Marksman binary
    And `.dev-pomogator/install-log.json` is updated with marksman_available=false
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
    When the MCP server starts
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
  Scenario: SPECGEN004_72 get_coverage returns per-scenario buckets matching the run
    Given a `.last-test-run.ndjson` with a mix of passed, pending, undefined and ambiguous scenarios
    When the MCP client invokes `get_coverage()`
    Then the response groups every scenario into exactly one of `passed`, `pending`, `undefined`, `ambiguous` or `failed`
    And the per-bucket counts equal the cucumber summary for the same run

  @feature32
  Scenario: SPECGEN004_73 get_coverage returns per-task verified status
    Given a spec whose tasks map to scenarios of mixed result
    When the MCP client invokes `get_coverage()`
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
    Then it invokes the `get_coverage` MCP tool (or the coverage worker skill)
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
  Scenario: SPECGEN004_115 a successful MCP write refreshes the graph for the next read
    Given an accepted spec change written through MCP
    When the agent reads the affected node afterwards
    Then the response reflects the fresh state

  @FR-40
  Scenario: SPECGEN004_116 create_spec births a verdict-green spec through MCP
    Given the create_spec mutation tool
    When the agent creates a new spec through it
    Then the authoritative verdict for the newborn spec is GREEN

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
