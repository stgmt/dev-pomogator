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
## Wave 2 — families FR-15..FR-28 (29 mapped, 3 no-candidate)

Dynamic Workflow run `dwe-f2da09f7-fc69-4dde-9067-f2b3c5d01f6d` (admission allow + ROOT_VERIFIED).

| AC | Scenario | Justification (quoted step) |
|---|---|---|
| AC-15.1 | specgen004_34 | Then a JSONL line is appended to .spec-check-log/<YYYY-MM-DD>.jsonl / And the line contains timestamp, finding_code, severity, location, message, spec_slug |
| AC-15.2 | specgen004_35 | Then the file is rotated to .spec-check-log/<YYYY-MM-DD>-1.jsonl / And previous files are not modified |
| AC-16.1 | specgen004_36 | Then the MCP server is launched automatically / And .mcp-lock.json is written with env: "codespaces:<machine-id>" |
| AC-16.2 | specgen004_37 | Then the MCP server auto-restarts via postStartCommand / And the SpecGraph is rebuilt from persistent /workspaces/ files in ≤2 seconds |
| AC-17.1 | specgen004_38 | Then .specs/spec-c/consistency-report.yaml is written within 5 seconds / And findings[] contains an entry with code "impl-drift/missing-file" |
| AC-17.2 | specgen004_40 | Then AskUserQuestion is invoked with header "⚠️ CRIT" / And the options list includes literally «Abort STOP» / And selecting «Abort STOP» causes the skill to exit with non-zero status |
| AC-17.3 | specgen004_41 | Then the YAML finding gets acknowledged_by: user, override_reason, override_timestamp / And a new line is appended to cross-spec-overrides.jsonl |
| AC-17.4 | specgen004_339 | When runFullMode is called with a spawn that returns DRIFT / Then the full-mode result shows subprocess_calls=1 and drift_detected=1 / And a cross-spec/semantic-drift finding appears ... severity CRITICAL |
| AC-17.5 | specgen004_38 | And the finding includes referenced_in, expected_path, and suggested_fix fields |
| AC-17.6 | specgen004_39 | Then findings[] contains an entry with code "cross-spec/runtime-identifier-drift", severity "CRITICAL" |
| AC-17.7 | specgen004_43 | Then .specs/{slug}/consistency-report.sarif exists alongside consistency-report.yaml / And the SARIF runs[0].tool.driver.rules[].id field matches finding codes |
| AC-17.8 | specgen004_42 | Then a summary block and the first 10 findings are printed to stdout / And neither consistency-report.yaml nor .sarif exists on disk afterward |
| AC-18.1 | specgen004_47 | Then the skill exits with non-zero status / And stdout includes literally the hint «Run /cross-spec-reconcile first» |
| AC-18.2 | specgen004_44 | Then the skill emits an explanation block containing code+severity, files+lines, plain-language change, WHY-from-finding rationale, and option list |
| AC-18.3 | specgen004_46 | Then AskUserQuestion is invoked with at least two Path options / And each option description contains pros, cons, and impacted_files prose |
| AC-18.4 | specgen004_48 | Then Skill("cross-spec-reconcile", mode: "full") is invoked exactly once / And each original finding resolution_status is updated to resolved/still_present/transformed |
| AC-18.5 | specgen004_45 | Then the explanation block includes a literal banner «⚠️ This edits foreign spec: ...» / And the skill requires a second AskUserQuestion confirm |
| AC-19.1 | specgen004_49 | Then the guard exits with status 1 / And stderr contains a non-empty actionable error message / And the PreToolUse decision is deny |
| AC-19.2 | specgen004_50 | Then the guard exits with status 0 / And the latest .spec-check-log JSONL gains a new JSON line / And the PreToolUse decision is allow |
| AC-20.1 | specgen004_109 | Then the prompt-time summary is a single unresolved-DENY line / When the spec-status ack stamps the state file / Then the prompt-time summary is silent until a newer deny arrives |
| AC-21.1 | specgen004_107 | Then the output byte-matches the committed task-table baseline / And a second run produces identical bytes without any MCP server |
| AC-22.1 | specgen004_51 | Then spec-conformance-guard exits with status 0 / And spec-check-log appends a JSONL entry {kind: "ALLOW_AFTER_MIGRATION", reason: "spec_version", observed_version: 2} |
| AC-23.1 | specgen004_122 | Then the soft event lands in the global form-guards log / And the hard finding lands in the repo spec-check-log JSONL created on first write |
| AC-24.1 | specgen004_108 | Then the meta-guard denies the write naming spec-conformance-guard / And removing the meta-guard own registration is denied too |
| AC-25.1 | specgen004_52 | Then .claude-plugin/hooks.json declares the v4 spec hooks spec-conformance-guard, spec-conformance-push and bash-post-test/ingest |
| AC-25.2 | specgen004_52 | And length(hooks.PreToolUse) >= 1 and length(hooks.PostToolUse) >= 1 / And it retains the pre-existing protective hook entries |
| AC-26.1 | specgen004_53 | Then no claude -p subprocess is spawned / And spec-check-log gains a JSON entry with finding_code SEMANTIC_CHECK_SKIPPED_DENY_LIST |
| AC-27.1 | specgen004_54 | Then install exits with non-zero status / And the error message contains both hash values literally |
| AC-28.1 | specgen004_13 | Then findings are batched in the 3-second throttle window / And only one aggregated <system-reminder> is pushed after the window closes / And the push latency is at most 3000 ms plus 100 ms |

### No candidate (new scenario / clarify)

- AC-19.3: no candidate scenario asserts the soft-tier form-guard exception path (PARSER_CRASH → form-guards.log)
- AC-20.2: no candidate scenario asserts the FR-20 summary renderer 50ms p95 latency
- AC-26.2: no candidate scenario asserts the spec_llm_judge_deny: true per-spec opt-out (only the deny-list match path is covered)

## Wave 3 — families FR-29..FR-40 (50 mapped, 1 no-candidate)

Dynamic Workflow run `dwe-9d7f1e0f-a02a-41a7-a060-660d6e297c56` (admission allow + ROOT_VERIFIED).

| AC | Scenario |
|---|---|
| AC-29.1 | specgen004_55 |
| AC-29.2 | specgen004_57 |
| AC-29.3 | specgen004_56 |
| AC-30.1 | specgen004_60 |
| AC-30.2 | specgen004_61 |
| AC-31.1 | specgen004_65 |
| AC-31.2 | specgen004_377 |
| AC-32.1 | specgen004_71 |
| AC-32.2 | specgen004_70 |
| AC-32.3 | specgen004_72 |
| AC-33.1 | specgen004_75 |
| AC-33.2 | specgen004_76 |
| AC-33.3 | specgen004_77 |
| AC-33.4 | specgen004_78 |
| AC-33.5 | specgen004_79 |
| AC-34.1 | specgen004_80 |
| AC-34.2 | specgen004_81 |
| AC-34.3 | specgen004_563 |
| AC-34.4 | specgen004_83 |
| AC-34.5 | specgen004_84 |
| AC-35.1 | specgen004_85 |
| AC-35.2 | specgen004_86 |
| AC-35.3 | specgen004_87 |
| AC-35.4 | specgen004_88 |
| AC-35.5 | specgen004_89 |
| AC-36.1 | specgen004_90 |
| AC-36.2 | specgen004_91 |
| AC-36.3 | specgen004_92 |
| AC-36.4 | specgen004_93 |
| AC-36.5 | specgen004_95 |
| AC-36.7 | specgen004_94 |
| AC-36.8 | specgen004_578 |
| AC-36.9 | specgen004_579 |
| AC-36.10 | specgen004_362 |
| AC-37.1 | specgen004_96 |
| AC-37.2 | specgen004_97 |
| AC-37.3 | specgen004_99 |
| AC-37.4 | specgen004_101 |
| AC-37.5 | specgen004_365 |
| AC-37.6 | specgen004_361 |
| AC-38.1 | specgen004_102 |
| AC-38.2 | specgen004_103 |
| AC-38.3 | specgen004_104 |
| AC-38.4 | specgen004_105 |
| AC-38.5 | specgen004_106 |
| AC-39.1 | specgen004_111 |
| AC-39.2 | specgen004_113 |
| AC-39.3 | specgen004_564 |
| AC-40.1 | specgen004_114 |
| AC-40.2 | specgen004_115 |

### No candidate (new scenario / clarify)

- AC-36.6: no candidate scenario asserts the full clean-HEAD Docker suite stays green after a migration phase (a process/verification AC)

