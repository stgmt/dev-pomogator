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

## Wave 4 — families FR-41..FR-52 (18 mapped, 1 no-candidate)

Dynamic Workflow run `dwe-c3bed036-bce4-4ecc-a208-673d664eaa9f` (admission allow + ROOT_VERIFIED).

| AC | Scenario |
|---|---|
| AC-41.1 | specgen004_117 |
| AC-41.2 | specgen004_119 |
| AC-42.1 | specgen004_120 |
| AC-42.2 | specgen004_121 |
| AC-43.1 | specgen004_156 |
| AC-44.1 | specgen004_141 |
| AC-45.1 | specgen004_157 |
| AC-46.1 | specgen004_450 |
| AC-47.1 | specgen004_163 |
| AC-48.1 | specgen004_172 |
| AC-48.2 | specgen004_452 |
| AC-49.1 | specgen004_160 |
| AC-49.2 | specgen004_179 |
| AC-49.3 | specgen004_526 |
| AC-49.4 | specgen004_186 |
| AC-50.1 | specgen004_184 |
| AC-50.2 | specgen004_183 |
| AC-51.1 | specgen004_518 |

### No candidate (new scenario / clarify)

- AC-52.1: no candidate scenario asserts the filtered cucumber run leaves the canonical .last-test-run.ndjson untouched (clobber-safety)

## Spot-check — waves 1–4 (13 of 130 mappings, seeded sample 20260805)

Deterministic sample (mulberry32, seed 20260805) of 13 AC→scenario pairs; each pair re-opened by hand: AC EARS text vs scenario steps.

| AC | Scenario | Verdict |
|---|---|---|
| AC-1.2 | specgen004_02 | PASS — steps assert per-spec NDJSON split exactly |
| AC-3.2 | specgen004_06 | PASS — triple-anchor registration asserted verbatim |
| AC-10.1 | specgen004_21 | PASS — lock detection + session reuse asserted |
| AC-14.3 | specgen004_33 | FIXED — env-mismatch clause only; sibling specgen004_149 (write serialization, no lifetime lock) added as second own scenario |
| AC-18.3 | specgen004_46 | PASS — Path options with trade-offs in description asserted |
| AC-18.4 | specgen004_48 | PASS — reconcile invocation + all three resolution_status values asserted |
| AC-24.1 | specgen004_108 | PARTIAL — deny + naming asserted; tamper-log-append clause (dev-pomogator meta-guard.log) unverified by any scenario → wave-6 new-scenario list |
| AC-29.2 | specgen004_57 | PASS — implements edge with source_section=DESIGN asserted literally |
| AC-29.3 | specgen004_56 | PASS — glob skip + single warn-once + no crash asserted |
| AC-34.4 | specgen004_83 | PASS — deterministic no-LLM fix + idempotency asserted |
| AC-42.1 | specgen004_120 | PASS — drift guard names consumer-less tool asserted |
| AC-44.1 | specgen004_141 | FIXED — orphan-project-test clause only; sibling specgen004_144 (FR_NO_RESEARCH) added as second own scenario |
| AC-47.1 | specgen004_163 | FIXED — edge-building clauses only; siblings specgen004_164 (FR_NO_DESIGN) and specgen004_165 (get_trace decisions) added |

Result: 9/13 clean; 3 repaired with sibling scenario tags (all 4 siblings PASSED in canonical run); 1 uncovered clause (AC-24.1 tamper-log-append) carried into the wave-6 new-scenario list. No mapping rolled back — every retained tag verifies at least one real clause, and multi-scenario ACs now carry all covering scenarios.

## Wave 5 — families FR-53..FR-62 (25 mapped across 46 scenario tags, 3 no-candidate)

Dynamic Workflow run `dwe-babba718-7bf5-4da4-8ef1-d7f078505aad` (admission allow + ROOT_VERIFIED; gates dwe-preflight + ac-satisfaction-control pending finalization).

| AC | Scenario | Justification (quoted step) |
|---|---|---|
| AC-53.1 | specgen004_384 | Then the verifyKill verdict is "KILLED" / killed flag is true / restored flag is true / source file still contains "original_value" |
| AC-53.1 | specgen004_378 | Then the verifyKill verdict is "SURVIVED" / killed flag is false / source file still contains "original_value" |
| AC-53.1 | specgen004_379 | When verifyKill is called with a runner that throws on the second invocation / Then the call threw "boom" / source file still contains "original_value" |
| AC-53.2 | specgen004_380 | Then the verifyKill call threw an exception matching "original string not found" |
| AC-53.2 | specgen004_381 | Then the verifyKill call threw an exception matching "baseline not green" |
| AC-53.2 | specgen004_383 | Then the verifyBatch error count is 1 / first verifyBatch result verdict is "ERROR" (batch continues) |
| AC-53.3 | specgen004_382 | Then verifyBatch total is 2 / killed count is 1 / survived count is 1 / error count is 0 |
| AC-55.1 | specgen003_16 | Then the discovery-forms SKILL.md exists without auto-trigger phrases in the first 600 characters |
| AC-55.1 | specgen003_17 | Then the task-board-forms SKILL.md exists without auto-trigger phrases in the first 600 characters |
| AC-55.1 | specgen003_21 | Then the requirements-chk-matrix SKILL.md exists and mentions Jira preservation |
| AC-55.1 | specgen003_24 | Then all 3 child phase-assistant skills lack auto-trigger phrases in the first 800 characters |
| AC-56.1 | specgen004_529 | Then the scenario overlay contains one row with result, run identity, source, and trace id / appending another run preserves the existing overlay row |
| AC-56.1 | specgen004_576 | Then one latest row per scenario remains and distinct-scenario cardinality is conserved / the canonical full-run artifact remains byte-identical |
| AC-56.2 | specgen004_575 | Then the matching commit pass is fresh and the legacy or mismatched pass is stale / the trace response exposes commit provenance and the persisted failing step |
| AC-56.3 | specgen004_534 | Then the scenario trace response contains the failing step, error text, and run identity / an expired scenario trace returns a rerun hint instead of throwing |
| AC-57.1 | specgen004_568 | Then the audit findings contain check "SCAFFOLD_INCOMPLETE" with severity "ERROR" / finding names README.md with a line and a sentinel |
| AC-57.1 | specgen004_474 | Then the spec-verdict verdict is "RED" with SCAFFOLD_INCOMPLETE in the gap list |
| AC-57.2 | specgen004_473 | Then every SCAFFOLD_INCOMPLETE finding has severity "INFO" / spec-verdict does not turn RED because of SCAFFOLD_INCOMPLETE |
| AC-57.2 | specgen004_474 | Given the same fixture with prose filled in / Then the SCAFFOLD_INCOMPLETE category is absent from the gap list |
| AC-57.3 | specgen004_567 | Given lowercase single-token braces, a fenced code block, an inline code span, and an empty JSON brace / Then the scaffold classifier reports zero findings |
| AC-57.3 | specgen004_477 | Then the templates file and the __fixtures__ document yield no findings / the backlog spec document yields at most an INFO finding never an ERROR |
| AC-57.3 | specgen004_475 | Then the scaffold-sentinel set contains every current template placeholder / validate-spec PLACEHOLDER and audit SCAFFOLD_INCOMPLETE agree that a real template sentinel is a stub |
| AC-58.2 | specgen003_01 | When the user-story-form-guard is invoked via Write on USER_STORIES.md missing Priority / Then the guard exits with code 2 and stderr mentions "Priority" (real hook entrypoint) |
| AC-58.2 | specgen004_295 | When form-guards-dispatch receives a Write for a violating TASKS.md / Then the dispatcher exits 2 and the stdout JSON carries permissionDecision deny mentioning task-form-guard (process execution) |
| AC-58.2 | specgen004_385 | When the user-story-form-guard receives an Edit of the user story heading only leaving body intact / Then the guard exits 0 and allows the write (real Edit reconstruction) |
| AC-58.2 | specgen004_478 | Then the eval aggregate is fully green and every case exercised the real form contracts (discovery-forms real eval runner) |
| AC-58.2 | specgen004_479 | Then the eval aggregate is fully green and every case exercised the real form contracts / pins the P16-1 negative regression cases (requirements-chk-matrix) |
| AC-58.2 | specgen004_570 | Then the eval aggregate is fully green and every case exercised the real form contracts / pins the P16-1 negative regression cases (task-board-forms) |
| AC-59.1 | specgen004_513 | Then the emitted reminder is at most 6000 bytes / summarizes the finding count, severity counts, omitted count, and full-log pointer / shows no more than 20 sample findings |
| AC-59.2 | specgen004_513 | Then the durable spec-check-log writer still records every synthetic finding (while the reminder is capped) |
| AC-60.1 | specgen004_520 | Then the proposal resolves the stable heading anchor without requiring an exact old_string / preview preserves the document EOL style / same form, anchor, and conformance checks run before any write |
| AC-60.1 | specgen004_521 | Then it includes eol_style, heading_anchor, section_sha, start_line, end_line, and append or insert tokens / a follow-up insert using those tokens targets the same section |
| AC-60.2 | specgen004_522 | Then the response classifies the miss as EOL-only, whitespace-only, multi-match, changed body under the same anchor, or missing anchor / with normalize_eol true a CRLF/LF-only mismatch is accepted while the persisted file keeps its original EOL style |
| AC-60.3 | specgen004_523 | Then the preview includes anchors found, a diff, affected graph nodes, conformance findings, resulting shas, and a proposal_id / applying writes all documents atomically or leaves every document unchanged |
| AC-60.3 | specgen004_524 | Then the mutation auto-rebases and applies against the fresh document / But when the target anchor body or preconditions changed the server refuses with fresh anchor context |
| AC-60.4 | specgen004_525 | Then the generated markdown follows the canonical form contracts and keeps FR to AC to TASK traceability links / ids are unique / executable feature scenarios are refused unless matching step-definition work is included |
| AC-61.1 | specgen004_539 | Then the output shows STRUCTURE, TRACEABILITY, EXECUTION, TASK_TRUTH, BDD_SYNC, SEMANTIC, and FILTERED_PROOF lanes / final readiness label is OVERALL NOT_READY |
| AC-61.2 | specgen004_540 | Then execution absence is reported as SCENARIO_NOT_RUN or FR_NOT_EXECUTION_VERIFIED / the same condition is not reported as UNCOVERED_FR |
| AC-61.2 | specgen004_566 | Then both surfaces report the stale scenario as effective execution debt / both surfaces report EXECUTION RED and OVERALL NOT_READY |
| AC-61.3 | specgen004_541 | Then the DONE status is denied or downgraded to evidence-derived IN_PROGRESS / the missing scenario or checklist evidence is named to the agent |
| AC-61.4 | specgen004_542 | Then executable-only scenarios require EXEC_ONLY or OUT_OF_SCOPE markers / source-only scenarios require an explicit pending marker or executable counterpart |
| AC-61.5 | specgen004_543 | Then canonical coverage remains unchanged until a full run or accepted attachment lands / a FILTERED_PROOF lane shows the artifact path, selected ids, pass/fail summary, timestamp, source, and next action |
| AC-62.1 | specgen004_573 | Then neither command waits indefinitely for stdin or reads the root from stdin |
| AC-62.2 | specgen004_573 | When spec-status and MCP resolve the root in order through validated SPECS_GENERATOR_ROOT, caller or project cwd, and findRepoRoot(SCRIPT_DIR) / Then valid SPECS_GENERATOR_ROOT selects the same tracked artifact set as the caller project fallback |
| AC-62.2 | specgen004_554 | Then it reports NOT_READY with the observed root, unsafe artifact, and corrective action without substituting a plugin-cache, C Windows cwd, or UNC-relative root |
| AC-62.3 | specgen004_554 | When the root precheck runs through CLI and MCP / Then each surface accepts only a validated caller or project WSL root |

Multi-scenario ACs: AC-53.1/53.2 (kill-path clauses split across per-behavior scenarios), AC-55.1 (AC text itself names the four migrated scenarios), AC-56.1 (overlay rows + canonical-untouched), AC-57.1/57.2 (ERROR+RED / INFO+disappear), AC-57.3 (code-strip + exclusions + single-classifier), AC-58.2 (one representative per real-code-path category: guard entrypoint, dispatcher process, Edit reconstruction, three eval runners), AC-60.1/60.3, AC-61.2, AC-62.2/62.3.

Gap check: OWN-no-scenario 57 → 32 (exactly the 25 mapped ACs).

### No candidate (new scenario / clarify)

- AC-58.1: no scenario asserts the retagging invariant itself (migrated form-contract scenarios carry @feature58 not @feature19, and FR-19 coverage excludes them) — the 31 migrated scenarios are the subject, not the verifier; needs a graph-query scenario
- AC-58.3: no scenario asserts the post-cleanup coverage state (@feature58 has FR owner/AC coverage/TASKS reference and FR-19 tested_by no longer lists inherited form checks) — needs a graph-query scenario
- AC-59.3: no scenario asserts the prompt-time banner bounds (buildConformanceSummary single line, buildTaskCensusLine ≤1500 chars, rebuilt bundle probe bounded stdout) — specgen004_513 covers only the PostToolUse flush

Residual clauses noted (covered ACs, minor unasserted tails): AC-53.3 runScenario `ran === 0 → passed=false` parse rule has no dedicated assertion; AC-59.2 `_no_push_check: true` suppression branch unasserted. Both ride with the wave-6 new-scenario batch if not resolved by an existing scenario there.

## Wave 6 — remaining true gaps (24 mapped, 1 new scenario for 2 ACs, 6 documented clarify)

Dynamic Workflow run `dwe-cb45c0aa-93b2-409f-8085-4a04873ffed3` (admission allow, 15 work packages = the 15 families still carrying true-gap ACs).

### Mapped to existing scenarios

| AC | Scenario | Justification (quoted step) |
|---|---|---|
| AC-63.1 | specgen004_555 | Then each surface reports the same deduplicated FR, AC, and scenario inventory with mandatory readiness lanes |
| AC-63.2 | specgen004_556 | Then each state remains explicit and no source, time, or recency field is discarded / filtered proof cannot replace canonical full-run execution evidence |
| AC-63.3 | specgen004_557 | Then the result exposes the AC ids, test_paths=[], and explicit never-run classification while AND-gating every mandatory lane / reports the next action |
| AC-64.1 | specgen004_558 | When graph conformance and release inventory run with baseline evidence sha 0b291bac / Then unclassified or silent inventory evidence is surfaced and cleaned rather than accepted as implementation proof |
| AC-64.2 | specgen004_559 | Then every tracked in-scope unit must be PASSED, every outcome remains distinct, and every in-scope unit satisfies the AND gate / unclassified untracked paths violate cardinality or conservation |
| AC-64.3 | specgen004_574 | Then a missing runtime import, bundle, or asset is reported with installed-runtime provenance and does not become a source-tree pass |
| AC-64.4 | specgen004_561 | Then the PR identity, release candidate, or tag, run identity, owner, monitoring signal, rollback action, and follow-up verification are recorded / not_recorded or never-run evidence prevents a release-ready claim |
| AC-65.1 | specgen004_565 | Then shallow coverage names every missing public contract paid flow and semantic deploy lane |
| AC-65.2 | specgen004_565 | Then shallow coverage names every missing public contract paid flow and semantic deploy lane / the complete AC-linked plan passes (paid-flow lane mapping) |
| AC-65.3 | specgen004_565 | Then a blocking investigation remains red while the complete AC-linked plan passes / empty task plans ... fail closed |
| AC-65.4 | specgen004_565 | When the real acceptance delivery analyzer and audit inspect every plan / shallow coverage names every missing lane; analyzer outages fail closed |
| AC-66.1 | specgen004_583 | Then typed metadata and the unknown extension round-trip exactly |
| AC-66.2 | specgen004_584 | Then both surfaces return the same metadata validation findings |
| AC-66.3 | specgen004_585 | Then task verdict stays IMPLEMENTED and delivery is INCOMPLETE |
| AC-66.4 | specgen004_586 | Then delivery is DELIVERED and optional missing artifacts do not block |
| AC-66.5 | specgen004_587 | Then demands deduplicate and contradictions emit FR_DEMAND_CONFLICT |
| AC-66.6 | specgen004_588 | Then every surface returns the same typed metadata and delivery state |
| AC-80.11 | specgen004_663 | Then planning is rejected with stable named findings for every violation (placeholder/missing-ownership/incomplete-surface synthesis never finalizes) |
| AC-80.11 | specgen004_664 | Then only evidence-backed DONE completes a task while DONE_WITH_CONCERNS, NEEDS_CONTEXT, and BLOCKED retain diagnostics and create follow-up proposals |
| AC-81.6 | specgen004_665 | Then it names the dev-pomogator-specs server / the launch path includes the same door bundle (no second package) |
| AC-81.6 | specgen004_666 | Then it exits 0 reporting the door entries match (no duplicated door) |
| AC-7.1 | specgen004_15 | Then the native launcher responds to LSP initialize through the real Marksman binary |
| AC-7.2 | specgen004_16 | Then the launcher exits non-zero with an actionable missing-binary message / no custom JS markdown-LSP fallback / spec-domain find_refs still works |
| AC-19.3 | specgen003_22 | Then the guard exits with code 0 (fail-open on malformed stdin) |
| AC-52.1 | specgen004_514 | Then the tool description separates the alias registry from Marksman heading slugs / the compact id and Marksman heading slug resolve |
| AC-59.3 | specgen004_109 | Then the prompt-time summary is a single unresolved-DENY line (buildConformanceSummary single-line clause) |

### New scenario (no honest candidate existed)

| AC | Scenario |
|---|---|
| AC-58.1 | specgen004_693 (NEW) |
| AC-58.3 | specgen004_693 (NEW) |

SPECGEN004_693 (@feature58 @AC-58.1 @AC-58.3) drives the real buildGraph over the repository and pins: FR-19 tested-by is exactly {SPECGEN004_49, SPECGEN004_50}; no scenario carries both @feature58 and @feature19; FR-58 owns ≥15 migrated SPECGEN003 form-contract scenarios. Step-defs: tests/step_definitions/feature58_retag_invariant.ts. Invariant verified holding before authoring (FR-19 tested-by = specgen004_49, specgen004_50).

### Documented clarify (no scenario possible without separate implementation/AC-amendment work)

- AC-1.3: v1-era installer AC (npm install into a vitest project keeps both suites in CI). The npm-install distribution is deprecated since v2 (canonical marketplace plugin) — the AC predates current distribution. Follow-up: amend/retire the AC via amend_requirement, do not scenario-test a dead install path.
- AC-7.4: dead-integration-guard is review discipline (.claude/rules/testing/dead-integration-guard.md), NOT an automated check — there is no implementation a scenario could drive. Follow-up: implement an automated guard first, then scenario it.
- AC-7.5: design-decision AC: records the 2026-06-04 empirical Marksman measurement of which reference forms resolve. The measurable residue (marksmanSlug golden fixture) is pinned by specgen004_81; the measurement protocol itself is a one-time research act, not repeatable behavior. Follow-up: treat as documented decision.
- AC-20.2: perf-budget AC (50ms p95) + atomic temp-file-rename clause. Functional ack behavior is covered by specgen004_109 under AC-20.1; the budget/atomicity clauses need a dedicated perf/atomicity scenario. Follow-up: new scenario asserting atomic ack writes + measured budget.
- AC-26.2: AC drift: spec_llm_judge_deny frontmatter handling exists in tools/spec-llm-judge, but the promised finding code SEMANTIC_CHECK_SKIPPED_OPT_OUT is implemented NOWHERE (corpus-wide grep). Follow-up: implement the finding code, then scenario it.
- AC-36.6: process invariant (after any migration phase the full clean-HEAD Docker suite is green + bare-id pins updated in the same phase). Enforced by workflow discipline and the final full run; not expressible as one scenario. Follow-up: keep as phase-gate discipline.

### Residual clauses on mapped ACs (tracked follow-ups, never silent)

- AC-7.2: install-time resilience + install-log.json unavailable-marking clauses have no scenario (launcher-side clauses covered by specgen004_16)
- AC-19.3: PARSER_CRASH log-line format clause has no scenario (fail-open exit covered by specgen003_22)
- AC-24.1: tamper-log-append clause (.dev-pomogator/logs/meta-guard.log) has no scenario (deny+name covered by specgen004_108) — from the waves 1-4 spot-check
- AC-52.1: filtered-run canonical clobber-safety, enforce-compatible anchor remediation, v1-layout-drift finding, and FR-32 own-scenario clauses have no scenario (validate_anchor clause covered by specgen004_514)
- AC-53.3: runScenario ran === 0 -> passed=false parse-rule clause has no dedicated scenario (tally covered by specgen004_382) — from wave 5
- AC-59.2: _no_push_check: true suppression branch unasserted (persistence-under-cap covered by specgen004_513) — from wave 5
- AC-59.3: buildTaskCensusLine ≤1500-char clause and bundle-probe clause have no scenario (single-line summary covered by specgen004_109)
- AC-80.11: independent-verifier identity + digest-bound attestation clauses have no scenario (blocking-findings + evidence-backed-DONE covered by specgen004_663/664)

Gap check: OWN-no-scenario 32 → 24 mapped + 2 new-scenario → 6 documented clarify remain as the honest residue. Lane mechanics (readiness-inventory.ts acOwnProofPasses) carry no waiver path: the AC_SATISFACTION lane can only go fully GREEN when the 6 clarify ACs get implementation/amendment work, or when every mapped AC proves PASSED in the final full run.

