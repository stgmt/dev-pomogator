# Use Cases

## UC-1: Agent traces requirement to test result end-to-end (happy path)

AI agent работает над feature, нужно понять состояние FR-001 — спека ↔ тесты ↔ результат.

- Agent invokes MCP tool `get_trace("FR-001")`
- MCP server returns full SpecGraph slice: FR-001 metadata + 2 ACs + 3 scenarios with `lastResult` (PASSED/FAILED) + 2 tasks + code refs from Cucumber step bindings + natural-language `explanation_for_agent` field
- Agent reasons over the response without any follow-up file reads
- Result: agent has complete context for the requirement in single tool call (~50ms latency)

**Linked stories:** US-2, US-4

---

## UC-2: Developer edits FR, gets immediate conformance feedback

Developer modifies `### FR-001: Login` heading to clarify wording.

- Developer (or agent) Edit-s `.specs/auth/FR.md`
- PostToolUse hook fires, incremental reindex affected file (<100ms)
- Conformance check runs on affected scope (FR-001 + linked scenarios)
- Within 3-second throttle window: findings batch + dedupe
- After window closes: aggregated `<system-reminder>` injected into agent context with findings (e.g., "FR-001 wording changed — 3 scenarios may need review: SCEN-login-ok, SCEN-login-locked, SCEN-login-retry")
- Agent decides whether to update scenarios or accept drift

**Linked stories:** US-6

---

## UC-3: Developer migrates dev-pomogator from vitest pseudo-BDD to cucumber-js (Phase 0)

dev-pomogator team migrates own BDD tests as Phase 0 prerequisite for v4.

- Run `npm install @cucumber/cucumber @cucumber/messages`
- Move existing `.feature` files from `.specs/{slug}/*.feature` references (already present)
- Create `tests/step_definitions/*.ts` with step impls (extracted from current vitest tests)
- Configure `cucumber.json`: `format: message:.dev-pomogator/.last-test-run.ndjson`
- CI updated to run both: `npm run test:unit` (vitest) + `npm run test:bdd` (cucumber-js)
- Verify NDJSON output parseable via `@cucumber/messages` package
- Result: real BDD trace pipeline, vitest unit tests untouched

**Linked stories:** US-1

---

## UC-4: Existing v3 user upgrades to v4 (Phase 5 migration)

Team has 25 specs in v3 format, wants to use v4 graph features.

- Run `dev-pomogator migrate-v3-to-v4 --suggest-only`
- Output: per-file diff preview (heading conversions `### Requirement: FR-N` → `### FR-N:`, frontmatter additions, anchor changes)
- Team reviews diffs in PR-like format, decides what to migrate
- Run `dev-pomogator migrate-v3-to-v4` (interactive mode)
- Tool prompts approve/skip/edit per file
- After migration: `.spec-config.json` created with defaults; `.progress.json` bumped to version 4
- Legacy `### Requirement:` headings still work via triple-anchor (backward compat)
- Result: smooth upgrade, no data loss, can roll back per file

**Linked stories:** US-11

---

## UC-5: Maintainer designs new major feature using architecture-research-workflow (Phase 6)

Maxim wants to design v5 spec-generator features. Invokes new skill standalone.

- Maxim: "архитектурный ресерч под v5 spec-generator: интеграция с GitHub Issues + Jira"
- Skill auto-triggers `Skill("architecture-research-workflow")`
- Stage 0: structured 3-Q intake (symptom / suspected cause / desired outcome)
- Stage 1: External pain validation (GitHub issues mining, competitive landscape)
- Stage 2: Broad research via `Skill("research-workflow")` (3 parallel angles)
- Stage 3: Self-pushback + focused research (1-2 cycles)
- Stage 4: 4 architecture variants with reuse vs custom matrix
- Stage 5: Iterative decision Q&A loop (AskUserQuestion per decision)
- Stage 6: Phased rollout planning
- Stage 7: Hand-off to `create-spec` (auto-populated RESEARCH.md)
- Result: full spec discovery done in 5-8 turns instead of 30+

**Linked stories:** US-12

---

## UC-6: Developer adds untagged Scenario during red-phase TDD

Developer writes failing test FIRST, before defining FR.

- Developer creates `.feature` file with `Scenario: New auth flow` (no `@FR-N` tag)
- Saves file → PostToolUse hook fires → conformance_check
- Finding: `UNTAGGED_SCENARIO` severity=warning (not error, not block)
- Push to agent context: "1 untagged scenario detected — typical for red-phase TDD; tag with @FR-N when FR is defined"
- Developer continues: writes step defs, runs test, sees RED
- Later: defines FR-007 in `FR.md`, adds `@FR-007` tag to scenario
- Conformance now clean

**Linked stories:** US-13, US-6

---

## UC-7: Two Claude Code sessions on same project (Phase 4)

Developer opens two terminals: one for feature work, one for debugging session.

- Session A starts in `D:\repos\my-project` → MCP server starts, writes `.dev-pomogator/.mcp-lock.json` (pid=A_PID, env=host)
- Session B starts in same directory → detects lock, validates `process.kill(A_PID, 0)` succeeds → same env
- Session B reuses Session A's MCP server (single process serves both clients)
- Session A modifies `.specs/auth/FR.md`
- Session B immediately sees fresh data via `get_trace("FR-001")` (SQLite single-writer ensures consistency)
- Session A crashes (kill -9)
- Session C starts → detects stale lock (process.kill fails ESRCH) → deletes lock, starts fresh MCP

**Linked stories:** US-10, US-14

---

## UC-8: Developer in devcontainer hits bind-mount file-watch issue

Developer uses VS Code Remote-Containers on Docker Desktop Windows.

- Inside container: `claude` CLI starts, dev-pomogator v4 MCP server spawns
- MCP server runs touch-test on workspace bind mount: creates temp file, waits for chokidar event
- Event not received within 500ms → auto-fallback to polling mode (1s interval)
- Logs: `[chokidar] bind-mount detected, polling mode enabled`
- Developer modifies `.specs/auth/FR.md` from host (VS Code Remote)
- Polling detects change within ~1s → graph incremental rebuild → PostToolUse fires
- Result: works correctly despite known Docker Desktop bind-mount FS event reliability issues

**Linked stories:** US-14

---

## UC-9: Agent attempts to write malformed spec (HARD-block edge case)

Agent generates new FR but introduces duplicate ID by accident.

- Agent attempts Write `.specs/auth/FR.md` with content `### FR-001: New Login` (FR-001 already exists)
- PreToolUse hook intercepts: parses incoming content, runs structural validation
- Finding: `DUPLICATE_DEFINITION` for FR-001 — two locations
- Hook DENIES with response: `permissionDecision: "deny"`, `permissionDecisionReason: "FR-001 already defined at .specs/auth/FR.md:12. Choose a new ID (suggested: FR-008) or modify existing FR."`
- Agent sees DENY in tool result, regenerates with FR-008
- Write succeeds on retry

**Linked stories:** US-5

---

## UC-10: User runs cucumber-js test, agent uses fresh NDJSON

Developer triggers test run, then agent investigates.

- Developer runs `npm run test:bdd` in terminal
- cucumber-js executes, generates `.dev-pomogator/.last-test-run.ndjson`
- Bash hook (separate from PostToolUse) detects `dotnet test` / `npm test` completion via Bash output pattern
- Post-test hook: invokes MCP `ingest-ndjson` tool, splits master NDJSON by spec slug, writes per-spec `.specs/{slug}/.test-results.ndjson`
- Agent (working on FR-003) calls `get_trace("FR-003")` → response includes fresh `lastResult: "FAILED"` for SCEN-x with stack trace

**Linked stories:** US-1, US-2, US-4

---

## UC-17: Lightweight cross-spec reconcile during Phase 2 / Phase 3 of create-spec

Spec author runs `create-spec` workflow on a new feature; create-spec invokes lightweight reconcile twice (at STOP #2 gate and STOP #3 gate).

- Author reaches Phase 2 step 4d after requirements-chk-matrix finishes
- create-spec invokes `Skill("cross-spec-reconcile", mode: "light")` automatically
- Skill globs `.specs/*/{FR,DESIGN,NFR,SCHEMA}.md` + `.specs/*/*.feature`, builds per-spec concept index
- Mechanical checks run: terminology drift (Jaccard on FR title nouns), file existence (`fs.exists` on declared paths), runtime-identifier drift (levenshtein on extracted identifiers), module ownership conflict (exact path overlap)
- All findings written to `.specs/{slug}/consistency-report.yaml` atomically (temp file + rename)
- If any CRITICAL finding from hard-conflict subset (`cross-spec/runtime-identifier-drift`, `cross-spec/module-ownership-conflict`, `cross-spec/contradictory-fr`) — emit blocking AskUserQuestion with `header: "⚠️ CRIT"` listing offending spec_a/spec_b + suggested_fix; user must choose Fix / Acknowledge / Abort
- Same step repeated at Phase 3 step 1c after task-board-forms finishes (catches drift introduced by new TASKS.md content)

**Linked stories:** US-17, US-18

---

## UC-18: Heavyweight reconcile during Phase 3+ Audit

After STOP #3 (Finalization confirmed), Phase 3+ Audit dispatches 9 categories including the new CROSS_SPEC_CONSISTENCY category.

- create-spec Audit dispatcher invokes `Skill("cross-spec-reconcile", mode: "full")`
- Skill runs all light-mode mechanical checks
- Additionally invokes Agent tool subagent for pairwise FR/AC semantic compare (pre-filtered to pairs sharing ≥3 concept nouns; cached by sha256 content hash to avoid re-evaluating unchanged pairs)
- Subagent returns structured JSON `{verdict: contradiction|overlap|complementary, confidence, snippets}` per pair; outer skill aggregates into YAML `findings[]`
- If subagent fails on some pairs, YAML gets `partial: true` flag + warning (not fail-loud)
- All 28 finding codes can fire in full mode; CRITICAL findings trigger same blocking AskUserQuestion flow as UC-17
- YAML is enriched with `recommendations[]` block (priority + action + impact) plus `summary` dashboard (by_severity, by_class per OpenFastTrace 4-class, by_namespace, totals)
- Optionally writes `.specs/{slug}/consistency-report.sarif` if `--sarif` flag or project config opts in

**Linked stories:** US-17, US-18

---

## UC-19: Resolve loop on user demand

Spec author has reconcile YAML; invokes `/cross-spec-resolve` to walk through findings interactively.

- Author runs `/cross-spec-resolve` (NOT auto-invoked from create-spec — explicit user command)
- Skill loads `.specs/{slug}/consistency-report.yaml`; exits with hint «Run /cross-spec-reconcile first» if missing
- Findings grouped by severity (CRITICAL → WARNING → INFO) and category; deduplicated by code+spec_a+spec_b+location
- For each finding: emit 5-field explanation block (code+severity+class, files+lines, plain-language change, WHY-from-finding, suggested options); wait for AskUserQuestion confirm (Apply / Skip / Defer)
- Mechanical fixes (`impl-drift/missing-file`, `impl-drift/stale-reference`, `impl-drift/mcp-tool-drift`, `impl-drift/hook-registration-drift`) applied via Edit/Write after confirm
- Deferred findings: `resolution_status: deferred`, `defer_reason: <text>` written to YAML, no Edit performed
- After all findings processed (batch), invoke `Skill("cross-spec-reconcile", mode: "full")` once; update each finding's `resolution_status` based on presence in new report (`resolved` / `still_present` / `transformed`)

**Linked stories:** US-19

---

## UC-20: Architectural fork resolution (Path A/B/C)

Resolve encounters an `impl-drift/architectural-decision-vs-reality` finding (spec claims architecture X, code shape shows Y).

- Skill identifies finding class as architectural; loads fix-templates entry for the code
- Pre-computed code shape (exports, module boundaries, declared ports, MCP tools, hooks) is passed to Agent subagent along with the FR/DESIGN prose claim
- Subagent returns 2-3 Path alternatives with pros / cons / impacted_files per path
- Outer skill emits AskUserQuestion with each Path as an option; `description` field of each option contains the pros/cons/impacted-files prose
- Architect selects one Path; skill generates patch plan listing every impacted file
- Each impacted file goes through its own per-finding confirm cycle (Apply / Skip / Defer)
- If any impacted file lives in another spec (`.specs/{other-slug}/`), additional foreign-spec confirm banner appears
- `cross-spec/duplicate-infrastructure` and `cross-spec/duty-delegation-ambiguity` findings also use this Path A/B/C flow

**Linked stories:** US-20

---

## UC-21: Cross-spec stale-state correction via foreign-spec edit

Reconcile detects `cross-spec/stale-spec-outstanding-but-done` (spec A's README/CHANGELOG claims a gap that is actually closed by code in another sprint).

- Resolve loads the finding; identifies target = `.specs/{other-slug}/README.md` (or CHANGELOG.md)
- Explanation block includes both the per-finding 5-field structure AND the additional «⚠️ This edits foreign spec: .specs/{other-slug}/{file}» banner
- Two confirms required: the per-finding confirm («Apply this fix?») and the foreign-spec confirm («Confirm editing foreign spec?»)
- On dual-confirm, skill applies Edit to mark the gap closed in the foreign spec (e.g., strikethrough on the «Outstanding gap» bullet plus changelog entry)
- Foreign spec slug owner is not notified automatically (out of scope); commit history preserves the edit attribution

**Linked stories:** US-19, US-20

---

## Edge Cases

### EC-1: Spec file deleted while MCP server running

Developer manually deletes `.specs/old-feature/`. Chokidar fires `unlink` events for all files in folder. Graph builder removes all nodes from deleted slug. References in OTHER specs to deleted IDs become `BROKEN_REF` findings on next conformance check.

### EC-2: Cucumber-js NDJSON partial output (test run crashed mid-execution)

`reqnroll_report.ndjson` exists but missing `testRunFinished` envelope (only `testRunStarted` + some `testStepFinished`). NDJSON ingester detects truncation, populates partial results, marks `incomplete_run: true` in graph metadata; `latest_test_results` flag scenarios with status `INCOMPLETE` instead of treating as PASSED.

### EC-3: Wiki-link with case mismatch (`[[fr-001]]` vs `[[FR-001]]`)

Custom MD parser normalizes anchor lookups case-insensitively for our ID schemes (FR, NFR, AC, SCEN). Marksman is case-sensitive by default. Solution: register all anchor variants explicitly (FR-001, fr-001) so both work.

### EC-4: Migration tool encounters non-standard heading (`### Story 1: X`)

User has historical convention not matching v3 default. Migration `--suggest-only` shows: "Unrecognized heading pattern at line 42 — skipping. To migrate, add custom pattern to `anchor_patterns.STORY` in `.spec-config.json`."

### EC-5: PostToolUse push happens during agent's middle of long reasoning

Hook fires during agent's mid-response generation. Anthropic API delivers `<system-reminder>` between turns, not mid-turn — agent sees push at next user/tool message boundary. Throttling 3s reduces probability of mid-thought interruption.

### EC-6: User runs `cucumber-js` for one .feature file at a time (per-spec invocation)

Edge case for `bdd_runner.per_spec_split: false` config. NDJSON output is per-run, one file per `.feature`. v4 supports this mode — splits by inspecting `gherkinDocument.uri` field in NDJSON.

### EC-7: Wiki-link points to FR in archived spec

`.specs/archive/old-feature/FR.md` contains FR-001. New spec `[[FR-001]]` resolves to archived one. Default behavior: resolve + warn (`ARCHIVED_REF` finding). Configurable via `anchor_patterns.allow_archive_refs: false` to error.

### EC-8: Marksman crashes during runtime

MCP server detects via process exit code. Logs warning, falls back to custom JS MD LSP. `get_trace` continues to work; IDE wiki-link navigation degrades. Auto-restart Marksman attempted every 30s; if 3 consecutive failures — disable for session.

### EC-9: Devcontainer + WSL2 simultaneously (e.g., WSL host + Docker container on top)

Path resolution: container sees `/workspace/...`; WSL host sees `/mnt/wsl/dev-pomogator/...`. MCP scope = per-env (container env tagged separately from WSL env). User opens Claude Code in WSL → separate MCP from any container Claude Code session.

### EC-10: User edits 50 spec files in bulk script

Bulk migration script touches 50 files via Edit tool. Without throttling: 50 PostToolUse pushes within 10 seconds. With 3s throttle + aggregation: 3-4 pushes total, each summarizing batch.

### EC-11: SQLite file becomes corrupt (Phase 4)

MCP server start: SQLite integrity check (`PRAGMA integrity_check`) fails. Auto-fallback to in-memory rebuild + warning logged. Corrupted file moved to `.dev-pomogator/.spec-index.sqlite.corrupt-{timestamp}` for postmortem.

### EC-12: User invokes `architecture-research-workflow` on tiny feature (Phase 6)

Auto-detection should prevent this, but user can force via `--use-arch-research`. Skill detects scope mismatch in Stage 0 problem-framing: if symptom is single-line bug, skill prompts: "This appears small (1-2 files affected). Continue with 7-stage workflow or downgrade to `research-workflow`? [downgrade/continue]"
