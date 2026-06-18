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
  Scenario: SPECGEN004_115 a successful MCP write refreshes the graph for the next read
    Given an accepted spec change written through MCP
    When the agent reads the affected node afterwards
    Then the response reflects the fresh state

  @FR-40
  Scenario: SPECGEN004_116 create_spec births a verdict-green spec through MCP
    Given the create_spec mutation tool
    When the agent creates a new spec through it
    Then the authoritative verdict for the newborn spec is GREEN

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
  Scenario: SPECGEN004_149 the read-only door keeps every session live for reads while writes serialise to the lock owner
    Given a spec corpus whose write-lock is already held by another session
    When a second session boots its door and exercises read + write tools
    Then writes refuse with the holder named while reads and dry-runs stay live and the file is untouched

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

  @FR-32
  Scenario: SPECGEN004_143 get_coverage scopes to one spec while a bare call stays corpus-wide
    Given a graph holding scenarios from two different specs
    When get_coverage is called scoped to one spec and then bare
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
  Scenario: SPECGEN004_136 enforce turns on from the plugin userConfig export, not only the manual env
    Given the plugin userConfig enforce toggle exported to the guard environment
    When the guard computes whether enforce is on
    Then enforce is on, and it is off when no enforce signal is present

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
  Scenario: SPECGEN004_160 conformance flags a DONE task that cites no scenario of its own
    Given a graph with a DONE task whose Done-When cites only its requirement, not its own scenario
    When conformance runs over the graph
    Then a TASK_NO_OWN_SCENARIO warning is raised for that task

  @feature46
  Scenario: SPECGEN004_161 conformance does not flag a DONE task that cites its own scenario id
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
  Scenario: SPECGEN004_176 a phase STOP is confirmed through the door only past the ordering gate
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
  Scenario: SPECGEN004_178 the task-census banner names one concrete next open task
    Given a cached task census whose busiest spec has an open task with a title
    When the per-prompt task-census banner renders
    Then the banner names that task title as the next step

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
  Scenario: SPECGEN004_186 the stop-gate requires a «Дальше» next-step section while work remains
    Given a task census with open work and the real claim-evidence-gate stop hook
    When the hook judges a progress claim without a «Дальше» section and then one with it
    Then the hook blocks the one lacking the section and approves the one carrying it

  @feature49
  Scenario: SPECGEN004_187 the judge prompt carries the open-task count and demands one JSON verdict line
    Given a judge input reporting twenty open tasks
    When the помогатор judge prompt is built
    Then the prompt states the open-task count and instructs a single JSON verdict line and keeps the clarifying-question carve-out

  @feature49
  Scenario: SPECGEN004_188 the judge resolves its endpoint and key by priority and returns null with no token
    Given the помогатор judge endpoint resolver
    When it resolves an OpenRouter key a claude-mem key an auto-commit key an explicit override and no token at all
    Then OpenRouter-family keys pick openrouter.ai the auto-commit key picks aipomogator the explicit override wins and no token resolves to null

  @feature49
  Scenario: SPECGEN004_189 the stop-gate blocks a whole-spec done claim while the census shows unfinished work
    Given a census with unfinished work naming a next open task and the real claim-evidence-gate stop hook
    When the hook judges a whole-spec done claim made after a tool ran
    Then the hook blocks it and the block names the unfinished count and the next task

  @feature49
  Scenario: SPECGEN004_190 the census-false-close gate does not fire on a non-spec works-done claim
    Given a census with unfinished work naming a next open task and the real claim-evidence-gate stop hook
    When the hook judges a task-level fixed-it claim made after a tool ran
    Then the hook does not block it

  @feature49
  Scenario: SPECGEN004_191 the gate blocks a works-done claim with no real executor and approves it once one runs
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a works-done claim first with only an edit and then after a real run
    Then the hook blocks the edit-only claim and approves the one backed by a real run

  @feature49
  Scenario: SPECGEN004_192 the gate blocks a not-found claim with too few searches and approves it after enough
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a not-found claim first after one search and then after two searches
    Then the hook blocks the under-searched claim and approves the one backed by enough searches

  @feature49
  Scenario: SPECGEN004_193 the gate blocks a verdict grid with no tool run and approves it once one runs
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a verdict grid first with no tool and then after a tool ran
    Then the hook blocks the unbacked grid and approves the one backed by a tool run

  @feature49
  Scenario: SPECGEN004_194 the gate blocks a verified-via marker with no matching tool and approves it once that command ran
    Given a fresh repo with no census and the real claim-evidence-gate stop hook
    When the hook judges a verified-via-command claim first with no matching tool and then after that command ran
    Then the hook blocks the unmatched marker and approves the one whose command actually ran

  @feature49
  Scenario: SPECGEN004_195 the census-false-close gate does not fire on a whole-spec done claim when the census is clean
    Given a clean zero-open task census and the real claim-evidence-gate stop hook
    When the hook judges a whole-spec done claim made after a tool ran
    Then the hook does not block it

  @feature49
  Scenario: SPECGEN004_196 the gate pure classifier units hold (fenced code ignored, negation, turn-scoped evidence, stripCode)
    Given the claim-evidence-gate pure classifier functions
    When fenced-code verdicts a negated claim a prior-turn tool and an inline-code-plus-quote string are classified
    Then fenced verdicts do not fire negation is not a works-claim evidence is scoped to the current turn and stripCode removes code and quotes

  @feature49
  Scenario: SPECGEN004_197 the gate shadow and disabled modes and fail-open hold
    Given the claim-evidence-gate stop hook under varying modes
    When it runs in shadow mode in disabled mode and against a missing transcript
    Then shadow approves but still logs a fire disabled approves outright and a missing transcript approves

  @feature49
  Scenario: SPECGEN004_198 a continuation stop is judged not exempted and the anti-loop still terminates
    Given the claim-evidence-gate stop hook and an unsupported works-done continuation stop
    When the same continuation stop fires twice with stop_hook_active set
    Then the first fire blocks and the identical re-fire is released by the anti-loop

  @feature51
  Scenario: SPECGEN004_199 the migrator inventory classifies cases by how they exercise code
    Given a non-BDD test source with a spawning helper a pure call an fs read and a skipped case
    When the migrator inventories that source
    Then the helper-calling case is runtime the direct call is pure the fs case is artifact and the skipped case is manual

  @feature3
  Scenario: SPECGEN004_200 the wiki-link resolver resolves ids and slug aliases strips fragments and flags broken targets
    Given the graph wiki-link resolver and a registry of node locations
    When it resolves a compact id a slug alias an unknown target an alias-plus-fragment a same-file fragment and multiple links on one line
    Then ids and slug aliases resolve identically unknown targets are broken the alias and fragment are stripped a same-file fragment is empty-but-not-broken and line numbers are recorded

  @feature32
  Scenario: SPECGEN004_201 the coverage scenarioKey normaliser canonicalises ids and ignores prose
    Given the coverage scenarioKey normaliser
    When it normalises a slug node id a raw Done-When mention a legacy-typo id and plain prose
    Then it yields the canonical specgen004 id tolerates the legacy SCENGEN typo and returns null for prose

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
    Then the bucket totals reconcile with the scenario count and the done task is DONE the mixed task IN_PROGRESS and the orphan task unverified

  @feature46
  Scenario: SPECGEN004_208 get_trace surfaces each task's own cited scenario and its last result
    Given a graph where one task cites its own SPECGEN scenario in Done-When and another does not
    When get_trace is asked for the shared FR
    Then the citing task own_scenario resolves to that scenario with its last result and the other task own_scenario is null

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
