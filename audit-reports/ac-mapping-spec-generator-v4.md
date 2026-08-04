# Wave 1 — acceptance-criterion → own scenario mapping (FR-68)

Wave 1 covers families FR-1..FR-14 (spec-generator-v4). Dynamic Workflow run `dwe-30b2f9e3-8639-49f9-b332-873a42ac7e15` (packet admission `allow` + `ROOT_VERIFIED`; the workflow.mjs agent-dispatch could not run through the Workflow tool in this environment — the bounded per-family mapping was executed by the coordinator and each tag applied via the spec door).

| AC | Scenario | Justification (quoted step) |
|---|---|---|
| AC-1.1 | specgen004_01 | Then `.dev-pomogator/.last-test-run.ndjson` is created / And the file contains gherkinDocument, pickle, testCase, testCaseStarted, testStepFinished, testCaseFinished envelopes |
| AC-1.2 | specgen004_02 | When the bash-post-test-ingest hook fires / Then `.specs/auth/.test-results.ndjson` is created containing only auth-related pickles ... And master NDJSON is preserved |
| AC-2.1 | specgen004_03 | When the MCP server starts cold (no SQLite cache) / Then the SpecGraph build completes in ≤2 seconds |
| AC-2.2 | specgen004_04 | When a single spec file .specs/auth/FR.md is modified / And chokidar change event fires / Then the affected subgraph is updated in ≤100ms p95 |
| AC-3.1 | specgen004_05 | Then anchor FR-001 is registered ... And anchor fr-001-login is registered pointing to same file:line |
| AC-3.2 | specgen004_06 | Then anchors FR-001, fr-001-login, requirement-fr-001-login all resolve to the same heading (legacy v3 heading) |
| AC-3.3 | specgen004_05 | And wiki-link [[FR-001]] resolves to the heading |
| AC-4.1 | specgen004_07 | Then the response contains node, tree.acceptance_criteria, tree.scenarios, tree.tasks, tree.related_nodes / And explanation_for_agent field ... ≤500 characters |
| AC-4.2 | specgen004_08 | Then explanation_for_agent mentions "SCEN-login-locked FAILED — NullReferenceException at AuthService.cs:88" |
| AC-5.1 | specgen004_09 | Then PreToolUse hook returns permissionDecision: deny / And permissionDecisionReason contains code DUPLICATE_DEFINITION |
| AC-5.2 | specgen004_10 | Then PreToolUse returns permissionDecision: deny / And permissionDecisionReason contains code MALFORMED_FRONTMATTER |
| AC-5.3 | specgen004_11 | Then PreToolUse returns permissionDecision: deny / And permissionDecisionReason contains code MALFORMED_GHERKIN |
| AC-6.1 | specgen004_12 | Then within 3 seconds the agent context receives a <system-reminder> message / And the message contains the finding code |
| AC-6.2 | specgen004_13 | Then findings are batched in the 3-second throttle window / And duplicate findings are deduplicated / And only one aggregated <system-reminder> is pushed |
| AC-6.3 | specgen004_14 | Then no <system-reminder> is pushed for that file (frontmatter _no_push_check: true) |
| AC-7.3 | specgen004_15 | Then plugin.json references .lsp.json through lspServers / And .lsp.json registers server marksman with the launcher shim |
| AC-8.1 | specgen004_17 | Then result includes finding code SEMANTIC_DRIFT / And the finding explanation mentions the mismatch |
| AC-8.2 | specgen004_18 | Then only structural checks run / And no claude subprocess is spawned / And no LLM tokens are consumed (disabled by default) |
| AC-9.1 | specgen004_19 | Then the NDJSON ingester parses the file successfully / And SpecGraph contains TestCase nodes with step_bindings pointing to .cs:line (Reqnroll C#) |
| AC-9.2 | specgen004_20 | Then v4 NDJSON ingester parses the file successfully / And SpecGraph contains TestCase results with status PASSED/FAILED (behave Python) |
| AC-10.1 | specgen004_21 | Then session B detects existing lock and pid is alive / And session B connects to session A MCP server (no second process started) |
| AC-10.2 | specgen004_22 | Then session B sees the latest state (post-edit) / And SQLite single-writer (BEGIN IMMEDIATE) ensures no race condition |
| AC-10.3 | specgen004_23 | Then corruption is detected at startup / And the corrupt file is moved to .spec-index.sqlite.corrupt-{timestamp} / And MCP server falls back to in-memory rebuild |
| AC-11.1 | specgen004_24 | Then per-file diffs are printed to stdout showing conversion to ### FR-001: Login / And the file is NOT modified |
| AC-11.2 | specgen004_25 | Then the default action skip is applied / And the file is left unchanged / And the migration proceeds to the next file (30s timeout) |
| AC-12.1 | specgen004_26 | Then 7 stage output files are written to .specs/{slug}/.architecture-research/ / And files are committable |
| AC-12.2 | specgen004_27 | Then the skill suggests restart-from-stage 4 / And an audit-trail entry is recorded in 5-decisions-locked.md as [REWIND] / And a 3-rewind hard limit |
| AC-12.3 | specgen004_28 | Then create-spec invokes regular Skill("research-workflow") instead of architecture-research-workflow / And 7-stage overhead is avoided |
| AC-13.1 | specgen004_29 | Then result includes finding code SCENARIO_TAG_ORPHAN / And severity is warning (default policy) |
| AC-13.2 | specgen004_30 | Then severity is error (escalated from default warn) / And ... blocks the operation |
| AC-14.1 | specgen004_31 | Then all file paths in response are relative to repo root / And no absolute paths appear in any field |
| AC-14.2 | specgen004_32 | Then the chokidar watcher auto-falls-back to polling mode (1s interval) / And the decision is logged to watcher.log |
| AC-14.3 | specgen004_33 | Then session B detects the existing lock has different env tag / And session B exits with clear message / And no second MCP process is spawned |

## No candidate (new scenario / clarify)

- AC-1.3: no candidate scenario asserts cucumber-js BDD is additive-not-replace with both suites in CI
- AC-7.1: no candidate scenario asserts the Marksman binary is present at .dev-pomogator/bin/marksman after install
- AC-7.2: no candidate scenario asserts install does NOT fail when the network download fails (only resolve-binary null is covered)
- AC-7.4: no candidate scenario covers the dead-integration-guard installer-without-runtime-consumer rule
- AC-7.5: no candidate scenario empirically confirms the reference form via Marksman textDocument/definition

Applied 2026-08-04. Wave completeness: 33 mapped, 5 no-candidate (new scenarios in wave 6 or clarify).
