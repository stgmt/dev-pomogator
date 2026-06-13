# Acceptance Criteria (EARS)

## AC-1.1
**Требование:** [FR-1](FR.md#fr-1)

WHEN the developer runs `npm run test:bdd` after Phase 0 migration THEN the system SHALL generate `.dev-pomogator/.last-test-run.ndjson` containing canonical Cucumber Messages envelopes.

## AC-1.2
**Требование:** [FR-1](FR.md#fr-1)

WHEN the master NDJSON is generated AND post-processing splits by spec slug THEN the system SHALL write per-spec files `.specs/{slug}/.test-results.ndjson` containing only pickle/testCase envelopes relevant to that spec's `.feature` files.

## AC-1.3
**Требование:** [FR-1](FR.md#fr-1)

IF a target TypeScript project installs dev-pomogator v4 AND existing vitest unit tests are present THEN cucumber-js BDD integration SHALL be mandatory additive (not replace), running both test suites in CI.

## AC-2.1
**Требование:** [FR-2](FR.md#fr-2)

WHEN the MCP server starts cold AND the project contains ≤30 specs THEN the SpecGraph rebuild SHALL complete in ≤2 seconds (NFR-Performance-1).

## AC-2.2
**Требование:** [FR-2](FR.md#fr-2)

WHEN a single spec file is modified (chokidar `change` event fires) THEN the system SHALL update only the affected subgraph in ≤100ms p95 (NFR-Performance-2).

## AC-3.1
**Требование:** [FR-3](FR.md#fr-3)

WHEN a spec file contains heading `### FR-001: Login` THEN the custom MD parser SHALL register both anchors `FR-001` AND `fr-001-login` pointing to the same heading location.

## AC-3.2
**Требование:** [FR-3](FR.md#fr-3)

WHEN a legacy v3 spec contains heading `### Requirement: FR-001 Login` THEN the system SHALL register triple-anchor (`FR-001`, `fr-001-login`, `requirement-fr-001-login`) all resolving to the same heading.

## AC-3.3
**Требование:** [FR-3](FR.md#fr-3)

WHEN a wiki-link `[[FR-001]]` is encountered in any spec file AND FR-001 is defined in another file THEN the resolver SHALL navigate to `### FR-001: ...` heading correctly.

## AC-4.1
**Требование:** [FR-4](FR.md#fr-4)

WHEN `get_trace("FR-001")` is called AND FR-001 exists THEN the response SHALL contain `node`, `tree` (acceptance_criteria/scenarios/tasks/code_impl/related_nodes), AND `explanation_for_agent` field with ≤500 char natural-language summary.

## AC-4.2
**Требование:** [FR-4](FR.md#fr-4)

WHEN `get_trace("FR-001")` is called AND linked Scenario SCEN-login-locked has lastResult FAILED THEN `explanation_for_agent` SHALL mention the failing scenario, error message, and code location (file:line).

## AC-5.1
**Требование:** [FR-5](FR.md#fr-5)

IF the agent attempts Write that introduces a second `### FR-001: ...` heading (FR-001 already defined elsewhere) THEN the PreToolUse hook SHALL DENY with finding code `DUPLICATE_DEFINITION` listing both locations in `permissionDecisionReason`.

## AC-5.2
**Требование:** [FR-5](FR.md#fr-5)

IF the agent attempts Write with malformed YAML frontmatter (missing closing `---`) THEN the PreToolUse hook SHALL DENY with finding code `MALFORMED_FRONTMATTER` + offending line number.

## AC-5.3
**Требование:** [FR-5](FR.md#fr-5)

IF the agent attempts Write to `.feature` file that fails `@cucumber/gherkin` parser THEN the PreToolUse hook SHALL DENY with finding code `MALFORMED_GHERKIN` + parser error message.

## AC-6.1
**Требование:** [FR-6](FR.md#fr-6)

WHEN PostToolUse hook fires after Edit on `.specs/auth/FR.md` AND `conformance_check` produces ≥1 finding THEN within 3 seconds the system SHALL inject `<system-reminder>` into agent context containing aggregated deduplicated findings.

## AC-6.2
**Требование:** [FR-6](FR.md#fr-6)

WHEN PostToolUse hook fires 5 times within 3 seconds (bulk edit) THEN findings SHALL be batched/deduplicated into ONE push at the end of the throttle window.

## AC-6.3
**Требование:** [FR-6](FR.md#fr-6)

IF the spec frontmatter contains `_no_push_check: true` THEN PostToolUse push SHALL be silenced for that file (red-phase escape hatch).

## AC-7.1
**Требование:** [FR-7](FR.md#fr-7)

WHEN `npx dev-pomogator install` completes (or the `ensure-marksman` SessionStart hook runs) THEN the Marksman binary SHALL be present at `.dev-pomogator/bin/marksman` (per-platform executable) AND respond to an LSP `initialize` request when launched via `tools/marksman-installer/launch-marksman.cjs server`.

## AC-7.2
**Требование:** [FR-7a](FR.md#fr-7)

IF the Marksman binary is unavailable for the current platform AND the network download fails THEN the install SHALL NOT fail; Marksman MUST be marked unavailable in `.dev-pomogator/install-log.json`; AND there SHALL be NO custom JS markdown-LSP fallback — markdown navigation is simply absent (the launcher exits non-zero with an actionable message). The MCP server SHALL expose ONLY spec-domain tools — `md_references` is retired and SHALL NOT appear in the tool registry — while spec-domain `find_refs` (semantic graph edges) stays available regardless of the binary.

## AC-7.3
**Требование:** [FR-7](FR.md#fr-7)

WHEN the plugin is installed THEN Claude Code SHALL register Marksman as an LSP server: `claude plugin validate` SHALL pass the `.lsp.json`/`plugin.json` manifest AND `claude plugin details` SHALL report `LSP servers (1) marksman`. The launcher → real `marksman server` SHALL answer `initialize` with definition/references/rename/documentSymbol capabilities, AND the agent-facing `LSP` tool SHALL return markdown `documentSymbol`/`references` for a `.md` file (proven end-to-end via a real `claude -p` session: headings + `[[wiki-link]]` reference locations matched ground-truth exactly).

## AC-7.4
**Требование:** [FR-7](FR.md#fr-7)

IF a diff adds an installer / downloaded binary / external dependency WITHOUT a runtime consumer AND without an e2e against the real artifact THEN `dead-integration-guard` SHALL flag it — "installed ≠ integrated" (the exact gap FR-7 itself fell into). The runtime consumer of the Marksman binary is the native LSP plugin registration (`.lsp.json` → launcher → `marksman server`), exercised by Claude Code's `LSP` tool.

## AC-7.5
**Требование:** [FR-7c](FR.md#fr-7)

WHEN deciding the reference form to adopt in specs THEN the system SHALL FIRST empirically confirm — via Marksman `textDocument/definition` at the LINK position — which form resolves. MEASURED (2026-06-04, against the real binary): an H2 heading is reached by `#<full-slug>` references — `[text](#fr-7-phase-2-title-here)` → `## FR-7: Phase 2 — Title Here` ✓, `[[#FR-1]]`/`[[doc#FR-1]]` → `## FR-1` ✓; **bare `[[FR-1]]` does NOT hit an H2** (it targets a DOCUMENT named FR-1); custom anchors `{#fr-7}` do NOT resolve (parsed as a Marksman "Tag"). Specs SHALL adopt only a form proven to resolve; a non-resolving form is forbidden (repeats installed ≠ integrated). The benefit is editor-only — the graph already resolves `[[FR-1]]`/`AC-N` for the agent via its dual-anchor `definitions`. Navigation/edit primitives SHALL be served by Marksman's native LSP; the graph retains ONLY spec-domain traceability + the `wikilinks.ts` broken-link conformance check (no js-fallback).

## AC-8.1
**Требование:** [FR-8](FR.md#fr-8)

WHEN `conformance_check(scope: "FR-001", semantic: true)` is called AND FR text mentions "redirect to /login page" AND linked Scenario tests only API contract (no UI redirect) THEN result SHALL include finding `SEMANTIC_DRIFT` with explanation of mismatch.

## AC-8.2
**Требование:** [FR-8](FR.md#fr-8)

IF `.spec-config.json::conformance_checks.semantic_drift.enabled = false` (default) THEN PostToolUse hook SHALL run ONLY structural checks; no subagent invocation; no LLM token spend.

## AC-9.1
**Требование:** [FR-9](FR.md#fr-9)

WHEN a C# project with Reqnroll v3+ and dev-pomogator v4 installed runs `dotnet test` THEN `.dev-pomogator/.last-test-run.ndjson` SHALL be in canonical Cucumber Messages format parseable via `@cucumber/messages` package.

## AC-9.2
**Требование:** [FR-9](FR.md#fr-9)

WHEN a Python project with `behave` configured to emit Cucumber Messages format runs BDD tests THEN v4 NDJSON ingester SHALL parse the file successfully and populate SpecGraph with TestCase results.

## AC-10.1
**Требование:** [FR-10](FR.md#fr-10)

WHEN `.spec-config.json::storage.sqlite_enabled = true` AND session A starts MCP server THEN session B attempting to start on same project SHALL detect existing lock via `.mcp-lock.json` AND reuse session A's MCP (no second process).

## AC-10.2
**Требование:** [FR-10](FR.md#fr-10)

WHEN session A makes spec edits AND session B calls `get_trace("FR-001")` immediately after THEN session B SHALL see the latest state (SQLite single-writer ensures consistency via `BEGIN IMMEDIATE` transactions).

## AC-10.3
**Требование:** [FR-10](FR.md#fr-10)

IF SQLite file becomes corrupt (PRAGMA integrity_check fails at startup) THEN the system SHALL auto-fallback to in-memory rebuild + move corrupted file to `.dev-pomogator/.spec-index.sqlite.corrupt-{timestamp}` + log warning.

## AC-11.1
**Требование:** [FR-11](FR.md#fr-11)

WHEN `dev-pomogator migrate-v3-to-v4 --suggest-only` is run on a project with legacy v3 specs THEN the system SHALL print per-file diffs (heading conversions, frontmatter additions) WITHOUT modifying any file.

## AC-11.2
**Требование:** [FR-11](FR.md#fr-11)

WHEN `dev-pomogator migrate-v3-to-v4` (interactive mode) is run AND a spec file has ambiguous structure THEN the system SHALL prompt approve/skip/edit; default `skip` if no input within 30 seconds.

## AC-12.1
**Требование:** [FR-12](FR.md#fr-12)

WHEN a Maintainer invokes `Skill("architecture-research-workflow")` with a feature description THEN the skill SHALL write 7 stage outputs to `.specs/{slug}/.architecture-research/<N>-<stage>.md` (committable, not gitignored).

## AC-12.2
**Требование:** [FR-12](FR.md#fr-12)

WHEN Stage 4 has generated 4 architecture variants AND user reveals a new constraint in Stage 5 THEN the skill SHALL suggest `restart-from-stage 4` AND record audit-trail entry in `5-decisions-locked.md` (`[REWIND] Stage 5 → Stage 4: <reason>`).

## AC-12.3
**Требование:** [FR-12](FR.md#fr-12)

WHEN `create-spec` is invoked AND complexity heuristic detects small feature (single file, no architecture decisions) THEN `create-spec` SHALL invoke regular `research-workflow` (not `architecture-research-workflow`) to avoid 7-stage overhead.

## AC-13.1
**Требование:** [FR-13](FR.md#fr-13)

WHEN a `.feature` file contains Scenario tagged `@FR-999` AND FR-999 does not exist in any MD spec THEN `conformance_check` SHALL return finding `SCENARIO_TAG_ORPHAN` with severity `warning` (default policy); existing similar IDs listed in `suggestions[]`.

## AC-13.2
**Требование:** [FR-13](FR.md#fr-13)

IF `.spec-config.json::orphan_policy.scenario_tag_orphan = "block"` THEN the same conformance check SHALL escalate severity to `error` AND prompt user to resolve before commit.

## AC-14.1
**Требование:** [FR-14](FR.md#fr-14)

WHEN dev-pomogator v4 runs inside a VS Code devcontainer (bind-mounted workspace) AND `get_trace("FR-001")` is called THEN ALL file paths in response SHALL be relative to repo root (never absolute, never container-internal-only).

## AC-14.2
**Требование:** [FR-14](FR.md#fr-14)

WHEN chokidar fails to detect FS events within 500ms touch test at startup THEN the watcher SHALL auto-fall-back to polling mode (1s interval) AND log decision to `.dev-pomogator/logs/watcher.log`.

## AC-14.3
**Требование:** [FR-14](FR.md#fr-14)

WHEN the user opens the same worktree in two different environments (host + container) AND second MCP server tries to start THEN it SHALL detect existing `.mcp-lock.json` with different `env` tag AND DENY with clear message `"MCP already running in env X (pid Y), restart Claude Code in same env"`.

## AC-15.1
**Требование:** [FR-15](FR.md#fr-15)

WHEN `conformance_check` produces a finding THEN a JSONL line SHALL be appended to `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` containing `{ timestamp, finding_code, severity, location, message, spec_slug }`.

## AC-15.2
**Требование:** [FR-15](FR.md#fr-15)

WHEN the log file size exceeds 10MB THEN the next append SHALL rotate to `.spec-check-log/<YYYY-MM-DD>-<N>.jsonl` with N incremented; previous file untouched.

## AC-16.1
**Требование:** [FR-16](FR.md#fr-16)

WHEN a GitHub Codespaces environment with dev-pomogator v4 in `.devcontainer/devcontainer.json` starts (cold or warm) THEN `postStartCommand` SHALL launch MCP server AND write `.mcp-lock.json` with `env: "codespaces:<machine-id>"`.

## AC-16.2
**Требование:** [FR-16](FR.md#fr-16)

WHEN a Codespace hibernates after 30 minutes of inactivity AND user resumes the codespace THEN the MCP server SHALL auto-restart via `postStartCommand` hook AND rebuild SpecGraph from persistent `/workspaces/` files within 2 seconds.

## AC-17.1
**Требование:** [FR-17](FR.md#fr-17)

WHEN `Skill("cross-spec-reconcile", mode: "light")` is invoked AND `.specs/` contains ≥2 specs THEN system SHALL produce `.specs/{slug}/consistency-report.yaml` conforming to schema defined in `spec-generator-v4_SCHEMA.md` section «Consistency Report YAML» within 5 seconds.

## AC-17.2
**Требование:** [FR-17](FR.md#fr-17)

WHEN reconcile detects a finding with `severity=CRITICAL` AND it runs in Phase 2 step 4d OR Phase 3 step 1c context THEN system SHALL block STOP confirmation by emitting AskUserQuestion with `header: "⚠️ CRIT"` (≤12 chars) AND options that include literally «Abort STOP».

## AC-17.3
**Требование:** [FR-17](FR.md#fr-17)

IF user chooses «Acknowledge & override» on the CRITICAL prompt THEN system SHALL update YAML with `findings[i].acknowledged_by: user`, `override_reason: <text>`, `override_timestamp: <iso>` AND append an entry to `.claude/logs/cross-spec-overrides.jsonl` with `{ts, spec_slug, finding_codes[], override_reason, session_id, cwd}` JSONL fields.

## AC-17.4
**Требование:** [FR-17](FR.md#fr-17)

WHEN reconcile runs in `full` mode AND ≥2 FR pairs share ≥3 concept-noun overlap THEN system SHALL invoke Agent tool subagent per pair using prompt template `references/semantic-judge-prompt.md` AND aggregate subagent JSON responses into `findings[]` of the YAML report (subagent NEVER calls AskUserQuestion; only the outer skill orchestrates AskUserQuestion).

## AC-17.5
**Требование:** [FR-17](FR.md#fr-17)

WHEN reconcile detects `impl-drift/missing-file` (path declared in `DESIGN.md` but absent on disk) THEN finding SHALL include fields `referenced_in: "DESIGN.md:<line>"`, `expected_path: "<path>"`, AND `suggested_fix: "Either create file or remove reference from DESIGN.md"`.

## AC-17.6
**Требование:** [FR-17](FR.md#fr-17)

WHEN reconcile detects `cross-spec/runtime-identifier-drift` (feedback key OR event name OR state field name mismatch between two specs OR between spec and code grep) THEN finding `severity` SHALL be `CRITICAL` AND finding `class` SHALL be `uncovered` per OpenFastTrace 4-class mapping.

## AC-17.7
**Требование:** [FR-17](FR.md#fr-17)

WHEN `--sarif` flag is passed OR project config `.spec-config.json` `output_formats` includes `"sarif"` THEN system SHALL write `.specs/{slug}/consistency-report.sarif` alongside YAML with SARIF 2.1.0 structure AND `rules[].id` field matching finding codes 1:1 (e.g. `cross-spec/fr-overlap`).

## AC-17.8
**Требование:** [FR-17](FR.md#fr-17)

WHEN `--dry-run` flag is passed THEN system SHALL print summary block (per spec-kit Coverage Summary Table format) + first 10 findings to stdout AND SHALL NOT write either `consistency-report.yaml` or `consistency-report.sarif` files to disk.

## AC-18.1
**Требование:** [FR-18](FR.md#fr-18)

WHEN `/cross-spec-resolve` is invoked AND `.specs/{slug}/consistency-report.yaml` does not exist THEN skill SHALL exit with non-zero status AND emit hint message containing literally «Run /cross-spec-reconcile first».

## AC-18.2
**Требование:** [FR-18](FR.md#fr-18)

WHEN resolve processes any finding requiring Edit/Write THEN system SHALL emit a 5-field explanation block (finding code+severity, target files+line ranges, plain-language change description, WHY-from-finding rationale, suggested options) AND wait for explicit AskUserQuestion confirm response BEFORE invoking any Edit/Write tool call.

## AC-18.3
**Требование:** [FR-18](FR.md#fr-18)

WHEN resolve processes `impl-drift/architectural-decision-vs-reality` finding THEN skill SHALL present ≥2 Path alternative options via AskUserQuestion (Recommended / Current-spec / optionally Custom) with trade-offs (pros, cons, impacted files) populated in the `description` field of each option.

## AC-18.4
**Требование:** [FR-18](FR.md#fr-18)

WHEN resolve completes the batch of applied fixes (all confirmed findings processed) THEN skill SHALL invoke `Skill("cross-spec-reconcile", mode: "full")` AND update each original finding's `resolution_status` to one of `resolved` (code no longer present in new report), `still_present` (code persists unchanged), OR `transformed` (code persists but `spec_b` changed).

## AC-18.5
**Требование:** [FR-18](FR.md#fr-18)

WHEN resolve proposes an edit whose target path begins with `.specs/{other-slug}/` where `other-slug` differs from the current resolve invocation slug THEN the explanation block SHALL include a banner line containing literally «⚠️ This edits foreign spec: .specs/{other-slug}/{file}» AND skill SHALL request an additional confirm distinct from the per-finding confirm before invoking Edit.

## AC-19.1
**Требование:** [FR-19](FR.md#fr-19)

WHEN `spec-conformance-guard` (FR-5) is invoked AND a startup or config-load exception is thrown (malformed config, missing dependency, IO error reading guard config) THEN the guard SHALL exit with status 1 AND write a non-empty actionable error message to stderr AND the calling Write/Edit tool SHALL be blocked (PreToolUse decision: deny).

## AC-19.2
**Требование:** [FR-19](FR.md#fr-19)

WHEN `spec-conformance-guard` (FR-5) is invoked AND a per-file content-parse exception is thrown (Gherkin parser exception on .feature, remark parser exception on .md) THEN the guard SHALL append a JSON entry `{timestamp, hook_id, file_path, error_message, error_stack}` to the latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (OR to `~/.dev-pomogator/logs/form-guards.log` with `kind: "hard_tier_file_parse"` discriminator if the FR-15 writer is not yet available) AND exit with status 0 (allow operation).

## AC-19.3
**Требование:** [FR-19](FR.md#fr-19)

WHEN any soft-tier hook (`user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`, `extension-json-meta-guard`) catches an exception of any kind during its check THEN the hook SHALL append a line to `~/.dev-pomogator/logs/form-guards.log` containing `{ISO timestamp} {hook_id} PARSER_CRASH {target_path} {error_message}` AND exit with status 0 (allow operation through).

## AC-20.1
**Требование:** [FR-20](FR.md#fr-20)

WHEN `UserPromptSubmit` hook fires AND the count of DENY-class events in `~/.dev-pomogator/logs/form-guards.log` plus latest `.dev-pomogator/.spec-check-log/*.jsonl` since `last_summary_ack.json::ack_timestamp` is ≥1 THEN the hook SHALL emit a single-line summary to agent context formatted as «📊 Spec conformance: {n} unresolved DENY since {ack timestamp human-readable}». WHEN the count is 0 THEN the line SHALL be omitted entirely.

## AC-20.2
**Требование:** [FR-20](FR.md#fr-20)

WHEN the FR-20 summary renderer runs THEN it SHALL complete within 50 milliseconds p95 (wall-clock from hook fire to line emission) for a corpus of ≤1000 entries per source file. Threshold-tracker reads and writes to `~/.dev-pomogator/state/last-summary-ack.json` MUST be atomic via temp-file-rename (NFR-Reliability-2).

## AC-21.1
**Требование:** [FR-21](FR.md#fr-21)

WHEN `npx tsx tools/specs-generator/spec-status.ts -Path .specs/<slug> -Format task-table` is invoked for any spec slug regardless of the underlying implementation (direct MD parse OR MCP-routed `get_trace`) THEN the stdout output SHALL byte-equal the fixture at `tools/specs-generator/__fixtures__/task-table.baseline.md` after substituting `{slug}` and dynamic timestamps, AND the vitest contract test `tools/specs-generator/__tests__/task-table-contract.test.ts` SHALL pass.

## AC-22.1
**Требование:** [FR-22](FR.md#fr-22)

WHEN `spec-conformance-guard` (FR-5) receives a target file inside a spec whose `.progress.json::version` field is `< 4` OR is null OR the `.progress.json` file is absent THEN the guard SHALL exit with status 0 AND append a JSONL entry `{kind: "ALLOW_AFTER_MIGRATION", reason: "spec_version", target: <path>, observed_version: <value_or_null>}` to the latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`. The guard SHALL fire normally ONLY when `.progress.json::version >= 4`.

## AC-24.1
**Требование:** [FR-24](FR.md#fr-24)

WHEN any Write/Edit tool call targets `extension.json` OR `plugin.json` OR `.claude/settings.local.json` AND the proposed change removes any registration in the protected set (5 v3 form-guards + `extension-json-meta-guard` + `spec-conformance-guard` + the MCP server `dev-pomogator-specs` tool registrations) THEN `extension-json-meta-guard` SHALL deny the tool call with PreToolUse decision deny AND a `permissionDecisionReason` naming the registration being removed AND append a tamper-attempt entry to `.dev-pomogator/logs/meta-guard.log`.

## AC-25.1
**Требование:** [FR-25](FR.md#fr-25)

WHEN the canonical dev-pomogator v4 plugin's hook manifest `.claude-plugin/hooks.json` is loaded THEN it SHALL declare the v4 spec hooks (FR-5 `spec-conformance-guard`, FR-6 `spec-conformance-push`, `bash-post-test/ingest`) AND retain the pre-existing protective hook entries (the static manifest is the complete union, never a replacement).

## AC-25.2
**Требование:** [FR-25](FR.md#fr-25)

WHEN the shipped `.claude-plugin/hooks.json` is inspected THEN `length(hooks.PreToolUse) ≥ 1` AND `length(hooks.PostToolUse) ≥ 1`, AND the v4 spec hooks appear ALONGSIDE the protective hooks in their event arrays (additive — the spec hooks did not replace a pre-existing entry). Verified against the real manifest by SPECGEN004_52.

## AC-26.1
**Требование:** [FR-26](FR.md#fr-26)

WHEN FR-8 `claude -p` subprocess is about to be invoked for a semantic-drift check AND the assembled prompt would contain text matching any deny-list pattern (file-name glob OR body-content regex from FR-26) THEN the subprocess invocation SHALL be skipped AND a JSONL entry `{finding_code: "SEMANTIC_CHECK_SKIPPED_DENY_LIST", severity: "INFO", location, message: "matched pattern: <pattern>", spec_slug}` SHALL be appended to spec-check-log AND the call site SHALL NOT report a `NO_DRIFT_DETECTED` result.

## AC-26.2
**Требование:** [FR-26](FR.md#fr-26)

WHEN a spec frontmatter contains `spec_llm_judge_deny: true` THEN ALL FR-8 semantic-drift subprocess invocations targeting any FR/scenario in that spec SHALL be skipped unconditionally regardless of content matching, with JSONL finding code `SEMANTIC_CHECK_SKIPPED_OPT_OUT`. No allow-list override SHALL be honored.

## AC-27.1
**Требование:** [FR-27](FR.md#fr-27)

WHEN `postInstall` downloads the Marksman LSP binary for the current platform/arch/version AND the sha256 of the downloaded file does NOT equal the pinned hash in `package.json::marksmanHashes[platform][arch][version]` (or sibling `marksman-hashes.json`) THEN install SHALL abort with non-zero exit AND the error message SHALL contain literally both hash values (expected and actual) AND the downloaded file SHALL be deleted before exit.

## AC-23.1
**Требование:** [FR-23](FR.md#fr-23)

WHEN v4 install completes on a clean machine THEN both log file paths SHALL be either present or createable on first write: `~/.dev-pomogator/logs/form-guards.log` (soft-tier consumer) AND `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (hard-tier consumer). DESIGN.md «(m) Log file inventory» table SHALL match the observed file paths/schemas/retention; no orphan or third log path SHALL be introduced.

## AC-28.1
**Требование:** [FR-28](FR.md#fr-28)

WHEN the PostToolUse hook (FR-6) fires for a sequence of qualifying edits at times t=0, t=1.0s, t=2.0s, t=2.9s (all within the throttle window opened at t=0) THEN a single batched push SHALL occur at t=throttle_ms (default 3000ms ± 100ms tolerance). WHEN a subsequent edit fires at t=throttle_ms+ε (ε>0) THEN a NEW window SHALL open at that timestamp AND the next push SHALL occur at t=2·throttle_ms+ε (NOT at t=throttle_ms extended). The throttle SHALL NOT exhibit sliding-window or debounce behavior.

## AC-29.1

**Требование:** [FR-29](FR.md#fr-29)

WHEN builder runs on a spec whose `FILE_CHANGES.md` table contains 5 unique paths AND each row's `Reason` cites at least one `FR-N` THEN SpecGraph SHALL contain exactly 5 `File` nodes (one per unique path) AND one `implements` edge per (FR, path) pair derived from those citations.

## AC-29.2

**Требование:** [FR-29](FR.md#fr-29)

WHEN `DESIGN.md` "App-код" section lists `src/foo.ts` AND FR-3 body cites `src/foo.ts` THEN SpecGraph SHALL contain an `implements` edge from `FR-3` to `File("src/foo.ts")` with `source_section='DESIGN'`.

## AC-29.3

**Требование:** [FR-29](FR.md#fr-29)

WHEN a `Path` cell contains a glob pattern (e.g. `tools/spec-graph/*.ts`) THEN builder SHALL emit no `implements` edge for that row AND SHALL log a single warn-once entry per build run; the build SHALL NOT crash.

## AC-30.1

**Требование:** [FR-30](FR.md#fr-30)

WHEN `get_trace("FR-5")` is invoked on a spec where FR-5 has 3 `implements` edges THEN the response `code_impl` field SHALL be an array of length 3, each entry containing `file_path` and `source_section`.

## AC-30.2

**Требование:** [FR-30](FR.md#fr-30)

WHEN `get_trace("AC-5.1")` is invoked AND parent FR-5 has 2 `implements` edges THEN `AC-5.1.code_impl` SHALL equal parent FR-5's `code_impl` (length 2, identical entries by `file_path`).

## AC-31.1

**Требование:** [FR-31](FR.md#fr-31)

WHEN `multilang-ingest-roundtrip.test.ts` runs against `tests/fixtures/reqnroll-sample/output.ndjson` THEN `detectRunner` SHALL return `'reqnroll'` AND `parseNdjson` SHALL produce a `TestResultPatch` with at least 2 scenarios (≥1 `PASSED` and ≥1 `FAILED`).

## AC-31.2

**Требование:** [FR-31](FR.md#fr-31)

WHEN the same test ingests the fixture NDJSON into the builder AND queries MCP `get_trace` for the fixture FR THEN returned `scenarios[].lastResult` SHALL match the expected per-language statuses AND `get_test_result` SHALL return the same statuses.

## AC-32.1

**Требование:** [FR-32](FR.md#fr-32)

WHEN a task whose Done-When maps to scenario `SPECGEN004_NN` that is `UNDEFINED` in the latest `.last-test-run.ndjson` is hand-set to `Status: DONE` THEN `spec-status` SHALL emit finding `TASK_STATUS_UNVERIFIED` AND render the task's status as `IN_PROGRESS` (capped), not `DONE`.

## AC-32.2

**Требование:** [FR-32](FR.md#fr-32)

WHEN every scenario mapped to a task is `PASSED` in the latest run THEN the task's `verified_status` SHALL be `DONE` AND no `TASK_STATUS_UNVERIFIED` finding SHALL be emitted for it.

## AC-32.3

**Требование:** [FR-32](FR.md#fr-32)

WHEN MCP `get_coverage()` is invoked THEN it SHALL return, from `.last-test-run.ndjson`, per-scenario buckets `{passed|pending|undefined|ambiguous|failed}` AND a per-task `verified_status` rollup matching `spec-status`'s derivation.

## AC-33.1

**Требование:** [FR-33](FR.md#fr-33)

WHEN the orchestrator runs a workflow step that an existing worker covers (e.g. coverage rollup) THEN it SHALL invoke that worker (`get_coverage` / skill) AND SHALL NOT contain a re-implementation of the worker's logic.

## AC-33.2

**Требование:** [FR-33](FR.md#fr-33)

WHEN the orchestrator detects a friction/gap during a run THEN it SHALL append a dated entry with `status: "pending"` to `.specs/<slug>/SELF_IMPROVE.md` AND SHALL NOT modify any spec or code file as a result of that entry.

## AC-33.3

**Требование:** [FR-33](FR.md#fr-33)

WHEN ≥1 `pending` entries exist in `SELF_IMPROVE.md` at session start THEN the orchestrator SHALL surface a reminder containing the pending count AND the top entries' observations.

## AC-33.4

**Требование:** [FR-33](FR.md#fr-33)

WHEN the human marks a ledger entry `approved` THEN the orchestrator MAY auto-apply it AND SHALL set the entry `status: "applied"` with an applied-at date; a `pending` entry SHALL NEVER be auto-applied.

## AC-33.5

**Требование:** [FR-33](FR.md#fr-33)

WHEN a new MCP tool, worker skill, or FR exists that the orchestrator feature-map does not reference THEN the drift guard SHALL fail with a message naming the unreferenced capability.

## AC-34.1

**Требование:** [FR-34a](FR.md#fr-34)

WHEN a heading's text changes so its GLFM slug changes THEN the anchor-integrity check SHALL report every inbound link whose `#anchor` no longer matches any heading slug — for BOTH same-file `[t](#a)` and cross-file `[t](f.md#a)` links — naming the link file:line, its broken anchor, and the heading it most likely meant.

## AC-34.2

**Требование:** [FR-34a](FR.md#fr-34)

WHEN `marksmanSlug(text)` is computed for any id-shape (`FR-7`, `## FR-7: Title`, `NFR-Performance-1`, `AC-1.1`, `AC-27.1`, `UC-3`) THEN it SHALL equal the slug the real Marksman binary produces (captured in a golden fixture); AND both `md.ts` and `specs-generator-core.mjs` SHALL import that single function (no second slug implementation); AND a divergence from the golden fixture SHALL fail the golden test.

## AC-34.3

**Требование:** [FR-34b](FR.md#fr-34)

WHEN a Write/Edit to `.specs/**/*.md` orphans ≥1 inbound anchor THEN the PostToolUse hook SHALL inject a `<system-reminder>` within the throttle window naming the broken links; AND the Stop-gate SHALL block declaring the work "done" until the anchors resolve OR `[skip-anchor-fix: <reason ≥8 chars>]` is present (logged to `.claude/logs/`).

## AC-34.4

**Требование:** [FR-34c](FR.md#fr-34)

IF a broken link's text contains the target heading id (e.g. text `FR-7` with a stale anchor `#fr-7-old`) THEN the fixer SHALL rewrite the anchor to that heading's current `marksmanSlug` deterministically WITHOUT invoking an LLM, AND the operation SHALL be idempotent (`fix(fix(x)) == fix(x)`).

## AC-34.5

**Требование:** [FR-34c](FR.md#fr-34)

IF a broken link's text does NOT identify a heading id THEN the fixer SHALL dispatch `claude -p` (or background) with the broken link + candidate headings to choose the target; the dispatch SHALL run in the background and SHALL NOT block the triggering edit; AND when the headless path is unavailable the link SHALL remain flagged (the fixer SHALL NOT guess-rewrite).

## AC-35.1

**Требование:** [FR-35a](FR.md#fr-35)

WHEN a task's linked scenario is GREEN AND its test-body audit returns `WEAK` or `FAKE-POSITIVE-RISK` THEN the honesty derivation SHALL cap `verified_status` below `DONE` (`IN_PROGRESS`) AND emit a `TASK_TEST_QUALITY` finding naming the task + the verdict.

## AC-35.2

**Требование:** [FR-35a](FR.md#fr-35)

WHEN a task's linked scenario is GREEN AND its test-body audit returns `STRONG` THEN `verified_status` SHALL be `DONE` (the gate SHALL NOT false-block a genuinely strong test).

## AC-35.3

**Требование:** [FR-35b](FR.md#fr-35)

WHEN the orchestrator feature-map is evaluated THEN it SHALL contain a `test-quality` stage between `coverage` and `honesty-gate` routing to `strong-tests` + `spec-status`, AND `checkFeatureMapDrift` SHALL FAIL when that stage is absent.

## AC-35.4

**Требование:** [FR-35b](FR.md#fr-35)

WHEN a Stop / pre-DONE hook runs AND a session-touched task's test is `WEAK` / `FAKE-POSITIVE-RISK` / absent THEN it SHALL block the "done" claim UNLESS an audited `[skip-test-quality: <reason>]` escape (logged to `.claude/logs/`) is present.

## AC-35.5

**Требование:** [FR-35c](FR.md#fr-35)

WHEN `checkConformance` runs on a task marked `DONE` with zero linked scenarios THEN it SHALL emit a finding (NOT return `[]`), so a no-test `DONE` is visible.

## AC-36.1

**Требование:** [FR-36a](FR.md#fr-36)

WHEN the builder assembles the graph AND two specs each define the bare id `FR-2` THEN it SHALL produce two distinct nodes keyed `<slug-A>:FR-2` and `<slug-B>:FR-2` (each carrying its `spec` field), so no node is collision-dropped (FR-node count ≈470, not 47).

## AC-36.2

**Требование:** [FR-36b](FR.md#fr-36)

WHEN an intra-file markdown link `[x](FR.md#fr-2)` is resolved THEN the anchor alias SHALL remain the bare file-local form `fr-2` (NOT the composite key), so Marksman, `anchor-fix`, and existing links remain unaffected.

## AC-36.3

**Требование:** [FR-36c](FR.md#fr-36)

WHEN a `covers` or `tested-by` edge is constructed THEN both endpoints SHALL use composite keys, AND a same-spec `@featureN`↔`FR-N` `tested-by` edge SHALL be built; WHEN `get_trace(FR)` runs on an FR that has BDD scenarios THEN it SHALL return those scenarios via real graph edges (not the tag-scan workaround).

## AC-36.4

**Требование:** [FR-36d](FR.md#fr-36)

WHEN a tool is called with a bare id that collides across specs THEN it SHALL return the candidate list (each `slug:id`) rather than one arbitrary node; WHEN called with `slug:id` or `{spec, node_id}` THEN it SHALL resolve the exact node.

## AC-36.5

**Требование:** [FR-36e](FR.md#fr-36)

WHEN the dogfood harness runs after a migration phase THEN the raw pre-map node dump SHALL show 0 id collisions, the FR-node count SHALL be ≈470, AND `get_trace` SHALL be non-empty for every FR that has BDD scenarios.

## AC-36.6

**Требование:** [FR-36e](FR.md#fr-36)

WHEN any migration phase completes THEN the full clean-HEAD Docker suite SHALL be green (clean-vs-clean), AND every test pinning a bare id (e.g. `get_node("FR-2")`) SHALL be updated to the qualified form in that same phase.

## AC-37.1

**Требование:** [FR-37a](FR.md#fr-37)

WHEN spec health is reported THEN the verdict SHALL be the smart analysis (`conformance_check` + `get_coverage` + `audit-spec` + the traceability-completeness check) over the one graph; a bare `validate-spec: 0 errors` SHALL NOT be reportable as "valid / clean / done."

## AC-37.2

**Требование:** [FR-37b](FR.md#fr-37)

WHEN any of {a stale FILE_CHANGES path, an `UNCOVERED_FR`, a `TASK_UNTESTED`, an `UNTAGGED_SCENARIO`} exists THEN the authoritative verdict SHALL be FAIL with a per-item gap list; within spec-generator-v4 these SHALL be 0 for a GREEN verdict.

## AC-37.3

**Требование:** [FR-37c](FR.md#fr-37)

WHEN a `claude` binary is present THEN the FR-8 semantic drift check SHALL run inside the authoritative verdict (not opt-in); WHEN it is absent THEN the verdict SHALL carry a `SEMANTIC_SKIPPED` note and SHALL NEVER report "no drift detected" for unchecked content.

## AC-37.4

**Требование:** [FR-37d](FR.md#fr-37)

WHEN a skill or agent reports spec health THEN it SHALL surface the smart verdict + gap list and SHALL NOT state "valid / clean / done" off `validate-spec` alone.

## AC-37.5

**Требование:** [FR-37e](FR.md#fr-37)

WHEN the verdict runs AND `FILE_CHANGES.md` references a path that does not exist on disk THEN it SHALL emit a hard ERROR (via `audit-spec` wired into the verdict); the 58 stale `extensions/`/`dist/installer` paths in spec-generator-v4 SHALL be reconciled to 0.

## AC-37.6

**Требование:** [FR-37a](FR.md#fr-37)

WHEN the authoritative verdict is GREEN THEN it SHALL mean the organism traces cell→atom (every Scenario tagged → FR, every FR has AC+Scenario+Task, every Task has a test, every FILE_CHANGES path exists) across the graph — NOT merely that one spec's formatting is well-formed.

## AC-38.1

**Требование:** [FR-38a](FR.md#fr-38)

WHEN `get_spec_status({spec})` is called for a spec with FR/AC docs but ZERO Scenario nodes THEN the response SHALL carry `lifecycle: "SPEC_ONLY"` AND `last_run: null`.

## AC-38.2

**Требование:** [FR-38a](FR.md#fr-38)

WHEN the spec has Scenario nodes AND none of them carries a `lastResult` THEN the response SHALL carry `lifecycle: "TESTS_NOT_RUN"` AND `last_run: null` — the tool SHALL NOT fabricate a summary for a run that never happened.

## AC-38.3

**Требование:** [FR-38a](FR.md#fr-38), [FR-38b](FR.md#fr-38)

WHEN the ingested NDJSON holds ≥1 FAILED scenario of the spec THEN `lifecycle: "RED"` AND `last_run.summary.failed` SHALL equal the failed count AND `last_run.at`/`last_run.source` SHALL identify the run.

## AC-38.4

**Требование:** [FR-38a](FR.md#fr-38), [FR-38b](FR.md#fr-38)

WHEN every touched scenario of the spec is PASSED THEN `lifecycle: "GREEN"`; WHEN zero failed but ≥1 scenario is UNDEFINED/PENDING/SKIPPED THEN `lifecycle: "PARTIAL"` — written-but-unimplemented steps SHALL NOT read as GREEN (FR-35 honesty idiom).

## AC-38.5

**Требование:** [FR-38c](FR.md#fr-38), [FR-38d](FR.md#fr-38)

WHEN any lifecycle state is returned THEN the response SHALL include `counts` (FR/AC/Scenario/Task), `gaps` (FR-37b per-class) and a human `hint`; AND each of the five states SHALL be covered by its own BDD scenario driving the real handler.

## AC-39.1

**Требование:** [FR-39](FR.md#fr-39)

WHEN агент вызывает Read/Grep/Glob/Edit/Write по пути `.specs/**` при `SPEC_ACCESS_ENFORCE=true` THEN хук `spec-access-guard` SHALL отклонить вызов с указателем на MCP-тулзы И записать событие в `spec-access.jsonl`; в shadow-режиме тот же матч SHALL только логироваться. Движковые in-process чтения (builder/CLI/хуки) SHALL остаться незатронутыми.

## AC-39.2

**Требование:** [FR-39a](FR.md#fr-39)

WHEN агенту нужен цельный документ спеки (проза вне узлов) THEN `read_spec_doc({spec, doc})` SHALL вернуть его содержимое И записать read-событие в аудит-лог; IF документа нет THEN SHALL вернуться явный DOC_NOT_FOUND (не пустая строка).

## AC-39.3

**Требование:** [FR-39d](FR.md#fr-39)

WHEN `spec-access-guard` отгружается THEN он SHALL присутствовать в обоих живых манифестах, проходить deps-absent прогон, быть перечисленным в пине SPECGEN004_52 и в PROTECTED_HOOKS meta-guard-а (иначе отгрузка = повтор инцидента пяти мёртвых стражей).

## AC-40.1

**Требование:** [FR-40b](FR.md#fr-40)

WHEN `apply_spec_change` получает изменение, дающее error-severity результат (битый анкер / нарушение form-контракта / conformance error) THEN сервер SHALL отказать БЕЗ записи на диск, вернув findings list; WHEN то же изменение исправлено THEN запись SHALL пройти атомарно и попасть в аудит-лог.

## AC-40.2

**Требование:** [FR-40c](FR.md#fr-40)

WHEN запись через MCP успешна THEN следующий read-вызов агента SHALL видеть свежее состояние графа (инкрементальный ребилд или полный fallback); `create_spec` SHALL рождать спеку с verdict GREEN из коробки.

## AC-41.1

**Требование:** [FR-41b](FR.md#fr-41)

WHEN оркестратор-проверятор запускает фазу THEN фаза SHALL исполняться выделенным headless-агентом, чьи allowed-tools НЕ содержат файловых тулзов по спекам; WHEN фаза завершена THEN переход дальше SHALL происходить только при GREEN-гейте (spec-verdict + get_spec_status), иначе фаза возвращается агенту с gap list (bounded retries).

## AC-41.2

**Требование:** [FR-41c](FR.md#fr-41)

WHEN любой фазовый агент спавнится/ретраится/гейтится THEN событие SHALL попасть в лог наблюдаемости с идентификацией агента и фазы — юзер может восстановить, кто что делал.

## AC-42.1

**Требование:** [FR-42a](FR.md#fr-42)

WHEN инвентаризуется поверхность MCP THEN каждый user-facing тул SHALL иметь skill-потребителя в таблице «MCP-тул → скилл» в DESIGN; WHEN добавляется новый user-facing тул без потребителя THEN расширенный drift-guard (FR-33) SHALL упасть, назвав тул.

## AC-42.2

**Требование:** [FR-42b](FR.md#fr-42), [FR-42c](FR.md#fr-42)

WHEN юзер вызывает «создай спеку» THEN точкой входа SHALL быть скилл (как сегодня), а шаги SHALL исполняться MCP-вызовами; WHEN spec-скилл инструктирует пере-реализацию серверной логики в своём теле THEN это SHALL детектиться как violation (тонкий скилл — толстый сервер).

## AC-43.1

**Требование:** [FR-43a](FR.md#fr-43), [FR-43b](FR.md#fr-43), [FR-43c](FR.md#fr-43)

WHEN триаж легаси-подозрения прогоняется по спеке THEN он SHALL классифицировать её в одно из SUPERSEDED/REMOVED/DRIFTED/ABSORBED, опираясь на существование реализации (spec-reality-check категория-15) + version-lineage + not_run-by-feature, с near-zero весом git-staleness; IF реализация существует и работает но описание разошлось THEN состояние SHALL быть DRIFTED (re-sync), НЕ retire; WHEN состояние вычислено THEN оно SHALL быть лишь ПОДОЗРЕНИЕМ-кандидатом, а финал SHALL подтверждаться человеком и фиксироваться явным маркером (`status:` / `.specs/archive/`) — авто-ретайр ЗАПРЕЩЁН.

## AC-44.1

**Требование:** [FR-44](FR.md#fr-44)

WHEN проектный cucumber step-def или vitest `it()` не имеет парного сценария-узла ни в одной `.feature` THEN движок трассируемости SHALL пометить его как orphan-project-test (обратная дыра), А НЕ молчать; WHEN FR не цитирует ни одной находки RESEARCH.md THEN SHALL эмитить FR_NO_RESEARCH; обе находки SHALL иметь зубы (gap-class ИЛИ осознанно advisory).

## AC-45.1

**Требование:** [FR-45a](FR.md#fr-45), [FR-45b](FR.md#fr-45), [FR-45c](FR.md#fr-45)

WHEN спека-кандидат проверяется на архивацию THEN система SHALL вызвать `get_archival_proof(slug)` и SHALL получить ARCHIVE только при НУЛЕ живых входящих ссылок (граф-рёбра + prose) и KEEP_FALSE_POSITIVE при наличии хотя бы одной; IF живые ссылки есть THEN `archive_spec` SHALL вернуть ARCHIVE_BLOCKED и НЕ двигать спеку; WHEN нет живых ссылок И сигнал FR-43 принадлежит {SUPERSEDED, REMOVED, ABSORBED} THEN `archive_spec` SHALL перенести спеку в `.specs/archive/<slug>/` и SHALL записать аудит-строку в `.dev-pomogator/logs/spec-archive.jsonl`; WHEN агент пытается писать через дверь под `.specs/archive/**` THEN дверь SHALL отвергнуть запись (ARCHIVE_SEALED); WHEN супрессия неоднозначна THEN система SHALL эскалировать NEEDS_HUMAN без авто-удаления.

## AC-46.1

**Требование:** [FR-46a](FR.md#fr-46), [FR-46b](FR.md#fr-46), [FR-46c](FR.md#fr-46), [FR-46d](FR.md#fr-46)

WHEN задача `Status: DONE` записывается без явного `specgen004_NN` в Done-When THEN conformance SHALL дать находку `TASK_NO_OWN_SCENARIO`; IF задача todo/in-progress без своего сценария THEN находки SHALL НЕ быть (связь нужна к DONE, не к созданию — тесты пишутся после задачи); WHEN задача DONE цитирует свой сценарий, но он не PASSED THEN conformance SHALL дать `TASK_STATUS_UNVERIFIED`; WHEN правило промоутнуто до ERROR THEN дверь `apply_spec_change` SHALL отказать запись с этой находкой, А предсуществующие нарушители SHALL НЕ блокировать несвязанную запись (поэтапный порядок детект→ретрофит→гейт ИЛИ delta-скоуп old→new); WHEN агент зовёт `get_trace` по задаче THEN ответ SHALL включать её свой `specgen004_NN` и его результат.

## AC-47.1

**Требование:** [FR-47a](FR.md#fr-47), [FR-47b](FR.md#fr-47), [FR-47c](FR.md#fr-47), [FR-47d](FR.md#fr-47)

WHEN билдер парсит DESIGN.md THEN блок `### Decision:` с явной строкой `**Требование:** [FR-N]` SHALL дать узел `Decision` + ребро `covers` FR→Decision; IF строки `**Требование:**` нет (FR упомянут лишь в прозе Rationale) THEN ребро SHALL НЕ строиться (не костыль); WHEN conformance прогоняется THEN FR без покрывающего `Decision` SHALL давать `FR_NO_DESIGN` (зеркально `FR_NO_RESEARCH`), severity поэтапно WARNING→ERROR (delta-скоуп, не клинить дверь); WHEN агент зовёт `get_trace` по требованию THEN ответ SHALL включать его `decisions[]` (id + parentFr); WHEN записывается блок `### Decision:` без строки `**Требование:**` THEN `design-decision-guard` SHALL это пометить.

## AC-48.1

**Требование:** [FR-48a](FR.md#fr-48), [FR-48b](FR.md#fr-48), [FR-48c](FR.md#fr-48), [FR-48d](FR.md#fr-48)

WHEN команда/дверь переводит impl-задачу в `in-progress`, а цепочка её требования не собрана (нет хоть одной из ног: AC / дизайн / история / ресерч / сценарий) THEN система SHALL дать находку `TASK_STARTED_WITHOUT_CHAIN` с перечнем недостающих ног; IF задача фазы-спеки (создаёт ноги) И её требование существует THEN перевод SHALL быть разрешён даже без ног (анти-deadlock); WHEN запрошен нелегальный переход (напр. `todo → done` минуя `in-progress`) THEN система SHALL отказать; WHEN правило промоутнуто до ERROR THEN дверь `apply_spec_change` SHALL отказать запись с находкой, А предсуществующие нарушители SHALL НЕ блокировать несвязанную запись (detect→retrofit→gate, delta-скоуп); WHEN команда `set_entity_status` ставит статус THEN запись SHALL идти через mutation-путь (`expected_sha` CAS) И conformance-гейт SHALL оставаться полом (сырая правка markdown не обходит); WHEN дверь отказывает THEN текст SHALL называть недостающие ноги и навык `/task-status`.

## AC-48.2

**Требование:** [FR-48e](FR.md#fr-48)

WHEN `set_entity_status` переводит ФАЗУ в `done` (подтвердить STOP), а STOP хотя бы одной предыдущей фазы не подтверждён ИЛИ входные файлы фазы отсутствуют ИЛИ не выполнено предусловие фазы THEN система SHALL отказать с указанием чего именно не хватает; WHEN для ФАЗЫ запрошен статус из словаря задач (`ready` / `in-progress` / `blocked`) THEN система SHALL отвергнуть как нелегальный-для-типа (у фазы переход бинарный); WHEN статус фазы подтверждён THEN запись SHALL обновить `stopConfirmed` И `completedAt` И `currentPhase` через ТОТ ЖЕ `.progress.json` writer, что и `-ConfirmStop` (без второго писателя — иначе дуальная правда); WHEN `set_entity_status` вызвана для ВЫЧИСЛЯЕМОЙ сущности (FR / история / решение / критерий / сценарий / спека-целиком) THEN система SHALL отказать с типом `STATUS_DERIVED`, неся текущий ВЫЧИСЛЕННЫЙ вердикт (`fr-census` для FR, `get_spec_status` для спеки) и как его менять (собрать ноги / прогнать тест); WHEN агенту нужен id фазы THEN он SHALL быть обнаружим через `get_spec_status` (фазы не узлы графа, `get_node`/`get_trace` их не возвращают).
