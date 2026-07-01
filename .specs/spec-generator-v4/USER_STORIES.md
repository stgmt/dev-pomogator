# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

---

### User Story 1: Phase 0 — Real BDD with NDJSON output (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1)

As a Developer working in dev-pomogator (TypeScript), I want real cucumber-js BDD with NDJSON output, so that v4 graph builder has machine-readable test trace data instead of vitest pseudo-BDD (.feature as documentation only).

**Why:** Without canonical Cucumber Messages NDJSON, v4 cannot trace FR → Scenario → TestCase → PASS/FAIL automatically; agent has to grep stdout, error-prone and slow.

**Independent Test:** Run `npm run test:bdd` in dev-pomogator after migration → produces `.dev-pomogator/.last-test-run.ndjson` parseable via `@cucumber/messages` package; per-spec split lands `.specs/{slug}/.test-results.ndjson` files.

**Acceptance Scenarios:**

Given dev-pomogator has migrated from vitest pseudo-BDD to cucumber-js
When the developer runs the BDD test suite
Then a Cucumber Messages NDJSON file is generated at `.dev-pomogator/.last-test-run.ndjson`

Given the master NDJSON file exists after a test run
When v4 post-processing splits it by spec slug
Then each `.specs/{slug}/.test-results.ndjson` contains only pickle/testCase events relevant to that spec

Given a TS target project installing dev-pomogator v4
When the project has existing vitest unit tests
Then cucumber-js BDD is mandatory additive (not replace) — both test suites run in CI

---

### User Story 2: Phase 1 — Full SpecGraph in one call (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2)

As an AI agent (Claude Code) working on a feature spec, I want to get the full SpecGraph slice (FR ↔ AC ↔ Scenario ↔ TestResult ↔ code refs) via a single MCP call, so that I don't waste context on N sequential Read operations and don't hallucinate connections.

**Why:** Current pain (validated externally via OpenSpec issue #901): agent reads N MD files sequentially, misses cross-refs, fails conformance checks silently. One graph call eliminates this.

**Independent Test:** Invoke MCP tool `get_trace("FR-001")` against a fixture spec → response contains structured tree (acceptance_criteria, scenarios with lastResult, tasks, code_impl, related_nodes) + natural-language `explanation_for_agent` field; agent does not need follow-up Read calls.

**Acceptance Scenarios:**

Given the SpecGraph is populated from `.specs/auth/*.md` + `tests/Auth.feature` + `.dev-pomogator/.last-test-run.ndjson`
When the agent calls MCP tool `get_trace("FR-001")`
Then the response contains FR-001 metadata, linked ACs, scenarios with last test status, related FRs, and a natural-language summary

Given FR-001 has no related scenarios
When `get_trace("FR-001")` is called
Then response indicates `scenarios: []` and `explanation_for_agent` mentions "no test coverage detected"

Given FR-001 references FR-005 via wiki-link
When `get_trace("FR-001")` is called
Then `related_nodes` includes FR-005 with `reason` field explaining the link type

---

### User Story 3: Phase 1 — Dual-anchor custom MD parser with backward compat (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3)

As a Developer migrating from v3 specs, I want both `[[fr-001-login]]` (Marksman-native) and `[[FR-001]]` (compact alias) wiki-links to resolve to the same heading, so that I can use whichever form is appropriate for context and existing v3 `### Requirement: FR-N` headings keep working.

**Why:** Pure Marksman generates long slugs like `requirement-fr-001-login`; agents prefer short `[[FR-001]]`; humans sometimes want descriptive long form. Dual-anchor satisfies both without breaking v3 backward compat.

**Independent Test:** Custom MD parser on fixture `.specs/auth/FR.md` with heading `### FR-001: Login` → resolves both `[[FR-001]]` and `[[fr-001-login]]` to same anchor (file:line); on legacy heading `### Requirement: FR-001 Login` — additionally resolves `[[requirement-fr-001-login]]`.

**Acceptance Scenarios:**

Given a spec file contains heading `### FR-001: Login`
When the custom MD parser indexes the file
Then both anchors `FR-001` and `fr-001-login` point to the same heading

Given a legacy v3 spec contains `### Requirement: FR-001 Login`
When the parser indexes the file
Then the triple-anchor registration (`FR-001`, `fr-001-login`, `requirement-fr-001-login`) all resolve to same heading

Given a wiki-link `[[FR-001]]` in `DESIGN.md`
When the link is resolved
Then it correctly navigates to `### FR-001: Login` heading in `FR.md`

---

### User Story 4: Phase 2 — MCP server `get_trace` with natural-language explanation (Priority: P1)

**Требование:** [FR-4](FR.md#fr-4)

As an AI agent, I want MCP `get_trace(node_id)` to return both structured data AND a natural-language `explanation_for_agent` field, so that I can immediately understand context without reasoning over raw JSON.

**Why:** Structured data alone forces agent to interpret — that's where hallucinations creep in. Pre-written explanation grounds the agent in fact.

**Independent Test:** Call `get_trace("FR-001")` against fixture spec where SCEN-login-locked is FAILED; response `explanation_for_agent` contains: FR title, count of ACs/scenarios/tasks, latest test status, failing step name + error location.

**Acceptance Scenarios:**

Given SCEN-login-locked has lastResult FAILED with NullReferenceException at AuthService.cs:88
When `get_trace("FR-001")` is called
Then `explanation_for_agent` field mentions "SCEN-login-locked FAILED — NullReferenceException at AuthService.cs:88"

Given FR-001 has 2 ACs, 3 scenarios, 2 tasks
When `get_trace("FR-001")` is called
Then `explanation_for_agent` summary opens with concrete counts (e.g., "2 AC, 3 scenarios, 2 tasks")

---

### User Story 5: Phase 2 — PreToolUse HARD hooks for syntax invariants (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5)

As a Developer, I want PreToolUse hooks to BLOCK Write/Edit on spec files when the change introduces syntax errors, duplicate FR-N IDs, or malformed YAML frontmatter, so that I never commit broken graph integrity.

**Why:** Soft warnings get ignored (agent and human). Hard invariants must be enforced sync-time, not async — same proven pattern as v3 form-guards.

**Independent Test:** Attempt Write to `.specs/auth/FR.md` containing duplicate `### FR-001: Login` headings (one already exists) → hook DENIES with finding `DUPLICATE_DEFINITION` + actionable hint suggesting rename.

**Acceptance Scenarios:**

Given `.specs/auth/FR.md` already contains heading `### FR-001: Login`
When the agent attempts Write that adds a second `### FR-001: ...` heading
Then PreToolUse hook DENIES with finding code `DUPLICATE_DEFINITION` and lists both locations

Given the agent attempts Write with malformed YAML frontmatter (missing `---` close)
When the hook runs
Then PreToolUse DENIES with finding code `MALFORMED_FRONTMATTER` + line number

Given the agent attempts Write that creates a wiki-link `[[FR-999]]` to non-existent FR
When the hook runs (this is HARD invariant only if FR-999 was previously valid and was renamed)
Then hook decision depends on configured policy (default: soft warn, not block)

---

### User Story 6: Phase 2 — PostToolUse always-push conformance feedback (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6)

As a Developer, I want PostToolUse hook to automatically inject conformance check findings into agent context after each Edit on `.specs/**/*.md` or `**/*.feature`, throttled to max 1 push per 3 seconds with aggregation, so that the agent sees drift immediately without forgetting to call `conformance_check` manually.

**Why:** Pull-only (agent must call MCP) means agent forgets. Push with 3s throttle balances real-time feedback against bulk-edit spam.

**Independent Test:** Edit `.specs/auth/FR.md` → after 3s window, agent context receives `<system-reminder>` with conformance findings for affected scope (e.g., FR-001 modified, 3 scenarios with @FR-001 tag may need review).

**Acceptance Scenarios:**

Given the agent makes 5 sequential Edits to `.specs/auth/*.md` within 2 seconds
When PostToolUse hook fires for each
Then findings are batched in a 3-second window, deduplicated, and pushed as one aggregated `<system-reminder>` after the window closes

Given conformance_check finds 0 issues after the Edit
When PostToolUse hook completes
Then NO push is generated (silent success — avoid noise)

Given the user has set `_no_push_check: true` in spec frontmatter
When PostToolUse fires on that spec
Then the push is silenced for that file (escape hatch for red phase / bulk migration)

---

### User Story 7: Phase 2 — Marksman bundle install for IDE-rich features (Priority: P2)

**Требование:** [FR-7](FR.md#fr-7)

As a Developer using VS Code / Neovim / Obsidian / any LSP-compatible editor, I want Marksman LSP installed silently by default as part of dev-pomogator install, so that I get hover, goto-definition, find-references, and broken-link diagnostics for `[[FR-001]]`-style wiki-links out of the box.

**Why:** Without Marksman, wiki-link navigation requires opening MCP tools — slow. With Marksman, IDE Ctrl+Click jumps directly. +15MB binary is acceptable trade-off.

**Independent Test:** After `npx dev-pomogator install`, check `.dev-pomogator/bin/marksman` (or platform-equivalent) exists and responds to LSP `initialize` request; opening a spec file in VS Code with Marksman LSP plugin shows wiki-link diagnostics.

**Acceptance Scenarios:**

Given a fresh install of dev-pomogator v4
When the installer completes
Then `.dev-pomogator/bin/marksman` binary is present and executable for the current platform

Given Marksman binary download fails during install (no network, offline)
When the installer completes
Then install does not fail; Marksman is marked as unavailable in `.dev-pomogator/install-log.json`; there is NO fake JS MD-LSP — markdown navigation is simply absent with an actionable message, while spec-domain graph queries (`get_trace` / `find_refs`) still work

Given a Developer opens `.specs/auth/FR.md` in VS Code with Marksman LSP plugin enabled
When they Ctrl+Click on `[[FR-005]]` wiki-link in DESIGN.md
Then VS Code navigates to `### FR-005: ...` heading

---

### User Story 8: Phase 3 — LLM-as-judge semantic drift check (opt-in) (Priority: P3)

**Требование:** [FR-8](FR.md#fr-8)

As a Developer who wants stronger spec-test alignment, I want an opt-in semantic drift check via Haiku subagent that verifies whether Scenario Given/When/Then text semantically matches the FR description, so that I catch cases where tests technically pass but don't actually validate the requirement.

**Why:** Structural checks miss semantic gaps (test calls auth API but FR says "redirect to login page" — both pass syntactic check, semantically misaligned). Opt-in because subagent calls cost tokens.

**Independent Test:** Run `conformance_check(scope: "FR-001", semantic: true)` → MCP spawns `claude` CLI subprocess with FR text + scenario text → result includes `SEMANTIC_DRIFT` finding with explanation when mismatch detected.

**Acceptance Scenarios:**

Given FR-001 text mentions "redirect to /login page on expired session"
And SCEN-login-ok tests "Given expired session, When click profile, Then API returns 401"
When `conformance_check(scope: "FR-001", semantic: true)` is called
Then result includes finding `SEMANTIC_DRIFT` with explanation "Scenario tests API contract but FR specifies UI redirect behavior"

Given semantic check is disabled (default config)
When PostToolUse fires after spec Edit
Then only structural checks run; no subagent invocation; no LLM token spend

---

### User Story 9: Phase 3 — Multi-language BDD support (C#/Python/Java) (Priority: P3)

**Требование:** [FR-9](FR.md#fr-9)

As a Developer working in a non-TypeScript project (C#, Python, or Java), I want the same v4 graph + MCP + conformance flow to work with Reqnroll (C#), behave (Python), or Cucumber-JVM (Java), so that v4 isn't locked to TS only.

**Why:** Cucumber Messages NDJSON is a language-agnostic standard; all major BDD runners emit it. v4 should leverage that, not duplicate logic per language.

**Independent Test:** Configure dev-pomogator v4 on a C# project using Reqnroll → run `dotnet test` → `.dev-pomogator/.last-test-run.ndjson` is generated; `get_trace("FR-001")` works identically to TS project.

**Acceptance Scenarios:**

Given a C# project with Reqnroll v3+ and dev-pomogator v4 installed
When `dotnet test` completes
Then `.dev-pomogator/.last-test-run.ndjson` is in canonical Cucumber Messages format

Given a Python project with `behave` configured to emit Cucumber Messages
When BDD tests run
Then v4 NDJSON ingester parses the file successfully and populates SpecGraph

---

### User Story 10: Phase 4 — SQLite cross-session shared spec graph (Priority: P3)

**Требование:** [FR-10](FR.md#fr-10)

As a Developer running multiple Claude Code sessions on the same project (e.g., one for feature work, one for debugging), I want a persistent SQLite spec index shared across sessions, so that I don't pay 1-2s rebuild cost per session start and findings are consistent.

**Why:** In-memory only (Phase 2) means each session rebuilds. Persistent SQLite eliminates cold-start cost; consistent state across sessions avoids "session A says X, session B says Y" confusion.

**Independent Test:** Start two Claude Code sessions on same project → both connect to same MCP server (via lock file) → `get_trace("FR-001")` returns identical result in both sessions instantly (no rebuild).

**Acceptance Scenarios:**

Given session A starts MCP server with SQLite persistence enabled
When session B starts on the same project
Then session B detects existing MCP via lock file and reuses it (no second MCP process)

Given session A makes spec edits
When session B calls `get_trace("FR-001")` immediately after
Then session B sees the latest state (SQLite single-writer ensures consistency)

Given SQLite file becomes corrupt (rare)
When MCP server detects corruption
Then automatic fallback to in-memory rebuild + warning logged

---

### User Story 11: Phase 5 — Migration helper v3→v4 (Priority: P2)

**Требование:** [FR-11](FR.md#fr-11)

As an existing dev-pomogator v3 user with 20+ feature specs, I want a `dev-pomogator migrate-v3-to-v4` command with interactive diff approval and "suggestion mode" (preview without applying), so that I can upgrade without manually editing every spec.

**Why:** Forcing manual migration across 20+ specs is a non-starter. Auto-migration with consent is acceptable; silent auto-rewrite is risky.

**Independent Test:** Run `dev-pomogator migrate-v3-to-v4 --suggest-only` on a v3 project → output lists per-file diffs (heading conversions, frontmatter additions, anchor changes) without modifying files; running without `--suggest-only` prompts approval per file.

**Acceptance Scenarios:**

Given an existing v3 project with `.specs/auth/FR.md` containing `### Requirement: FR-001 Login`
When the user runs `dev-pomogator migrate-v3-to-v4 --suggest-only`
Then a diff is printed showing conversion to `### FR-001: Login` with explanation, but no file is modified

Given the user runs migration without `--suggest-only`
When the migration encounters a spec file with ambiguous structure
Then it interactively prompts: approve/skip/edit; default `skip` if no input within 30s

Given migration detects untagged `.feature` scenarios
When suggestion mode is active
Then it predicts FR tags via naming heuristic (e.g., `Scenario: User logs in` → suggest `@FR-001` if FR-001 mentions "login")

---

### User Story 12: Phase 6 — `architecture-research-workflow` skill (Priority: P2)

**Требование:** [FR-12](FR.md#fr-12)

As a Maintainer of dev-pomogator, I want a 7-stage `architecture-research-workflow` skill that encapsulates pain validation → broad research → focused pushback → variant generation → decision locking → phased rollout → hand-off to create-spec, so that future major features take 5-8 turns instead of 30+.

**Why:** This spec (v4) took 30+ turns of manual pushback. Encoding the meta-pattern as a skill prevents that bottleneck for future v5/v6/etc.

**Independent Test:** Invoke `Skill("architecture-research-workflow")` with a synthetic feature description → skill produces all 7 stage outputs in `.specs/{slug}/.architecture-research/` and consolidated `RESEARCH.md`; calls `Skill("research-workflow")` as underlying primitive.

**Acceptance Scenarios:**

Given a synthetic feature description "build distributed cache layer"
When the maintainer invokes `Skill("architecture-research-workflow")`
Then 7 stage outputs are written to `.specs/{slug}/.architecture-research/` in committed (not gitignored) form

Given Stage 4 generates 4 architecture variants
When the user reveals a new constraint in Stage 5
Then the skill suggests `restart-from-stage 4` with explicit audit trail in decisions-locked.md

Given a small feature (single file change, no architecture decisions)
When create-spec runs heuristic detection
Then it invokes regular `research-workflow` (not `architecture-research-workflow`) to avoid 7-stage overhead

---

### User Story 13: Orphan resolution policy (warn-default, not block) (Priority: P2)

**Требование:** [FR-13](FR.md#fr-13)

As a Developer in red-phase TDD, I want orphan scenarios (Scenario with `@FR-N` tag where FR-N doesn't exist) and untagged scenarios to surface as warnings (default), not blocking errors, so that I can write failing tests first without the tooling getting in my way.

**Why:** Forcing every test to have a matching FR upfront breaks the TDD red-green-refactor cycle. Default-warn allows red phase; teams can escalate to block via config.

**Independent Test:** Add Scenario tagged `@FR-999` (non-existent FR) → `conformance_check` returns finding `SCENARIO_TAG_ORPHAN` with severity `warning`; no Write is blocked.

**Acceptance Scenarios:**

Given a `.feature` file contains `@FR-999\nScenario: ...` and FR-999 does not exist in any MD spec
When `conformance_check` runs
Then result includes finding code `SCENARIO_TAG_ORPHAN` with severity `warning` (not error), message lists existing similar IDs

Given the user has configured `orphan_policy.scenario_tag_orphan: block` in `.spec-config.json`
When the same conformance check runs
Then severity is `error` and the user is prompted to resolve before commit

Given a Scenario has no `@FR-`/`@NFR-`/`@AC-` tags at all
When `conformance_check` runs
Then result includes finding code `UNTAGGED_SCENARIO` with severity `warning`

---

### User Story 17: Phase 7 — Cross-spec conflict detection during spec authoring (Priority: P1)

**Требование:** [FR-17](FR.md#fr-17)

As a spec author drafting a new `.specs/{slug}/`, I want create-spec workflow to automatically detect conflicts between my draft and existing specs in `.specs/*/` — runtime identifier drift (e.g. my spec writes `sessionToken` while another spec uses `session_token` for the same concept), module ownership conflicts (two specs claim `src/auth/jwt.ts`), contradictory FRs, NFR budget mismatches — so that I learn about cross-spec collisions during Phase 2/3 STOP gates rather than discovering them weeks later during implementation merge.

**Why:** Cases like post-render-eval ↔ closed-loop-hardening (2026-05) showed two parallel agents authoring overlapping specs unknowingly: duplicate memory layer storage, feedback key mismatch breaking self-improve scope filter (`mp4_content_grounded` vs `content-grounding`). Cost of detecting at implementation = code rework + spec rewrite + retracing AC/CHK chains. Detection at authoring = 5-second mechanical check.

**Independent Test:** Create `.specs/scratch-test-a/FR.md` declaring `feedback_key = "session_token"` referencing `src/auth/jwt.ts`. Then create `.specs/scratch-test-b/FR.md` declaring `feedback_key = "sessionToken"` referencing same file. At Phase 2 step 4d of create-spec on scratch-test-b, expect: lightweight reconcile invoked, `cross-spec/runtime-identifier-drift` finding severity=CRITICAL emitted, AskUserQuestion with `header: "⚠️ CRIT"` blocks STOP, options include «Abort STOP».

**Acceptance Scenarios:**

Given two specs `.specs/spec-a/` and `.specs/spec-b/` declare the same concept under different runtime identifiers
When `create-spec` Phase 2 step 4d invokes `Skill("cross-spec-reconcile", mode: "light")` on spec-b
Then the YAML report `.specs/spec-b/consistency-report.yaml` contains a finding with `code: cross-spec/runtime-identifier-drift`, `severity: CRITICAL`, `spec_a: spec-a`, `spec_b: spec-b`, `suggested_fix` referencing the canonical identifier

Given a lightweight reconcile run finds ≥1 CRITICAL hard-conflict finding
When the skill reaches step 5 of its execution
Then it emits AskUserQuestion with `header: "⚠️ CRIT"` (≤12 chars) and options «Fix now via /cross-spec-resolve» / «Acknowledge & override» / «Abort STOP»

Given user selects «Acknowledge & override» with a non-empty reason
When the override is committed
Then `findings[0].acknowledged_by` is `user`, `override_reason` is the supplied text, `override_timestamp` is ISO 8601 in YAML, and an entry is appended to `.claude/logs/cross-spec-overrides.jsonl`

---

### User Story 18: Phase 7 — Spec-vs-implementation drift surfaces before implementation starts (Priority: P1)

**Требование:** [FR-17](FR.md#fr-17)

As a spec author finalizing `.specs/{slug}/DESIGN.md`, I want the reconcile skill to verify that claims in my DESIGN.md (file paths, exported symbols, MCP tool names, hook registrations declared in extension.json) actually exist in the codebase, so that I do not specify implementation against ghost code (file renamed, symbol removed, hook not registered).

**Why:** Spec drift compounds — DESIGN.md ages 6 months while code refactor renames files; specs reference functions that no longer export. Implementor follows spec, hits ERR_MODULE_NOT_FOUND, has to re-trace which spec is wrong. Cost is multiplied across N implementations referencing the stale claim.

**Independent Test:** Author `.specs/scratch-test/DESIGN.md` referencing path `extensions/missing/tools/ghost.ts` and symbol `validateToken()`. Invoke `Skill("cross-spec-reconcile", mode: "full")` directly. Verify two findings: `impl-drift/missing-file` (severity=WARNING, `expected_path: "extensions/missing/tools/ghost.ts"`) and `impl-drift/missing-symbol` (severity=WARNING, `referenced_in: "DESIGN.md:<line>"`, `expected_symbol: "validateToken"`).

**Acceptance Scenarios:**

Given `DESIGN.md` references file path `extensions/missing/tools/ghost.ts` that does not exist on disk
When reconcile checks impl-drift
Then findings include `code: impl-drift/missing-file`, `severity: WARNING`, `class: uncovered`, `referenced_in: "DESIGN.md:<line>"`, `expected_path: "extensions/missing/tools/ghost.ts"`, `suggested_fix: "Either create file or remove reference from DESIGN.md"`

Given DESIGN.md references MCP tool name `validate_user` that is not exported from any `*-mcp-server/index.ts` file
When reconcile checks impl-drift
Then findings include `code: impl-drift/mcp-tool-drift`, `severity: WARNING` with `expected_tool: "validate_user"` and locations enumerating all MCP server entry-points checked

Given reconcile runs in `full` mode with SpecGraph + MCP server unavailable (Phase 1 not yet shipped)
When skill operates in degraded mode
Then YAML report includes `partial: true` flag and uses fs+remark+glob to parse `.specs/*/*.md` directly without erroring

---

### User Story 19: Phase 7 — Resolver explains and confirms each fix before applying (Priority: P1)

**Требование:** [FR-18](FR.md#fr-18)

As a spec author with `.specs/{slug}/consistency-report.yaml` produced by reconcile, I want `/cross-spec-resolve` skill to walk me through each finding — explain the finding code, target files with line ranges, what will change in plain language, WHY this fix follows from the finding, and offer Apply/Skip/Defer options — so that I never silently apply a fix I do not understand, especially when the fix touches another team's spec or the implementation code.

**Why:** Auto-fix tools (eslint --fix, prettier --write, mex sync) often break semantics or apply heuristic fixes that look right but introduce regressions. Per prior art (eslint `no-implicit-coercion` semantic break, Dependabot fatigue), the explain-then-confirm middle ground prevents both silent damage and review fatigue.

**Independent Test:** Run `/cross-spec-resolve` against a YAML containing one `impl-drift/missing-file` finding. Verify skill emits a 5-field explanation block (code+severity, files+line ranges, what-will-change, why-from-finding, options) BEFORE any Edit/Write tool call. Mock AskUserQuestion response = «Skip» and verify NO Edit tool call occurred. Mock «Apply» and verify exactly one Edit tool call with the predicted diff.

**Acceptance Scenarios:**

Given `consistency-report.yaml` contains a finding requiring an Edit
When the resolve skill reaches step 3 of execution
Then it emits a fenced code block containing 5 fields (code + severity + class, files + line ranges, plain-language change, WHY-from-finding rationale, suggested options) BEFORE invoking any Edit or Write tool

Given the resolve skill is about to apply a fix to a file path beginning with `.specs/{other-slug}/` where `other-slug` differs from the current invocation's slug
When the explanation block is rendered
Then it includes a banner line literally containing «⚠️ This edits foreign spec: .specs/{other-slug}/{file}» and an additional confirm AskUserQuestion appears beyond the per-finding confirm

Given user chooses «Defer» on a finding with a reason
When the resolve skill records the deferral
Then YAML is updated with `findings[i].resolution_status: deferred`, `defer_reason: <text>` AND no Edit tool is invoked for that finding

---

### User Story 20: Phase 7 — Architect resolves Path A/B/C forks for architectural conflicts (Priority: P2)

**Требование:** [FR-18](FR.md#fr-18)

As an architect reviewing a reconcile report that contains an `impl-drift/architectural-decision-vs-reality` finding (e.g., spec says «separate agent on port 8005», code says «inline TS service in pipeline/agent.ts»), I want the resolve skill to present 2-3 Path alternatives with trade-offs (pros, cons, impacted files) and let me explicitly choose the direction, so that architectural divergences are routed through human judgment rather than auto-fixed or dumped as a passive finding.

**Why:** Per arXiv 2602.07609 + prior art survey (spec-kit, mex, OpenFastTrace, Spectral), the largest gap is that existing tools either dump findings and walk away or apply one auto-fix path. Architectural decisions inherently require human routing — LLMs perform well on code-inferable decisions but poorly on implicit/deployment decisions. Path A/B/C surfacing of the choice IS the novel UX contribution.

**Independent Test:** Author `.specs/scratch-test/DESIGN.md` claiming «separate agent on port 8005 with its own memory» while the actual `pipeline/agent.ts` shows inline service. Run reconcile full mode, then `/cross-spec-resolve`. Verify AskUserQuestion appears with ≥2 path options (e.g. Path A «evaluator in existing agents/eval» Recommended, Path B «keep separate agent») with each option's `description` containing pros/cons/impacted-files prose.

**Acceptance Scenarios:**

Given resolve processes an `impl-drift/architectural-decision-vs-reality` finding
When the skill reaches the per-finding handler
Then it emits AskUserQuestion containing ≥2 Path options where each option's `description` field includes explicit pros, cons, and an impacted-files list

Given the architect selects Path A (Recommended) via AskUserQuestion
When the resolve skill records the choice and generates the patch plan
Then each impacted file is presented as a separate confirm prompt (one Apply per file) and any foreign-spec edit additionally fires the «⚠️ This edits foreign spec» banner

Given all findings in the batch are processed (Applied, Skipped, or Deferred)
When the resolve skill reaches step 7
Then `Skill("cross-spec-reconcile", mode: "full")` is invoked once and each original finding's `resolution_status` is updated to `resolved` / `still_present` / `transformed` based on presence in the new report

---

### User Story 14: Devcontainer / multi-env support (Priority: P2)

**Требование:** [FR-14](FR.md#fr-14)

As a Developer working in a VS Code devcontainer (or WSL, Codespaces, Hyper-V VM), I want dev-pomogator v4 MCP server to work out of the box with correct path handling and file watching, so that I don't have to manually configure paths or worry about bind-mount FS events.

**Why:** Devcontainer / WSL / Codespaces are increasingly common; failing to support them silently breaks user experience without obvious cause.

**Independent Test:** Install dev-pomogator v4 inside a devcontainer (bind-mounted workspace) → MCP server starts, paths in tool responses are relative to repo root (not container-absolute), file watcher uses polling fallback when bind-mount FS events are unreliable.

**Acceptance Scenarios:**

Given dev-pomogator v4 runs inside a VS Code devcontainer with bind-mounted workspace
When `get_trace("FR-001")` is called
Then all file paths in response are relative (e.g., `.specs/auth/FR.md`), never absolute (`/workspace/...` or `D:\...`)

Given chokidar file watcher fails to detect file events within 500ms touch test
When the MCP server starts
Then watcher auto-falls-back to polling mode with 1s interval and logs the decision

Given the user opens the same worktree in two different environments (host + container) accidentally
When the second MCP server tries to start
Then it detects existing lock file with different `env` tag and DENIES with clear message "MCP already running in env X, restart Claude Code in same env"

---

### User Story 15: Phase 4 — Side-channel conformance log (Priority: P3)

**Требование:** [FR-15](FR.md#fr-15)

As a Developer / team lead, I want all conformance findings to be appended to a persistent log `.dev-pomogator/.spec-check-log/<timestamp>.jsonl`, so that I can grep history, run analytics (e.g., "which FRs failed conformance most often"), and audit spec drift over time without flooding agent context.

**Why:** PostToolUse push gives real-time feedback but disappears. Persistent log enables retrospective analysis + team audit + ML training data для future LLM-based checks (Phase 3+).

**Independent Test:** Trigger 5 distinct conformance failures over time → check `.dev-pomogator/.spec-check-log/` contains 5 JSONL entries with timestamps, finding codes, locations, severity; `grep ORPHAN_TASK .dev-pomogator/.spec-check-log/*.jsonl` returns relevant entries chronologically.

**Acceptance Scenarios:**

Given conformance_check produces a finding `SCENARIO_TAG_ORPHAN` for SCEN-x
When PostToolUse hook completes
Then a JSONL line is appended to `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` containing timestamp + finding_code + severity + location + message

Given the log file exceeds 10MB
When the next append happens
Then the file is rotated to `.spec-check-log/<YYYY-MM-DD>-<N>.jsonl` and a new file starts (size-based rotation)

Given the user runs `dev-pomogator spec-check-log --since 7d --grep ORPHAN_TASK`
When the CLI processes the request
Then it returns aggregated counts per FR + per file with last occurrence timestamp

---

### User Story 16: Phase 4 — GitHub Codespaces support (Priority: P3)

**Требование:** [FR-16](FR.md#fr-16)

As a Developer using GitHub Codespaces (cloud devcontainer with persistent volume), I want dev-pomogator v4 MCP server to start automatically in Codespaces lifecycle, handle persistent volume FS semantics correctly, and survive container hibernation/restart, so that Codespaces user gets same workflow as local devcontainer.

**Why:** Codespaces has unique constraints: ephemeral CPU (hibernation), persistent `/workspaces/` volume (not bind-mount), built-in port forwarding, postCreate/postStart lifecycle hooks. Generic devcontainer support (US-14) covers most but Codespaces specifics need explicit verification.

**Independent Test:** Spin up GitHub Codespaces from a repo with dev-pomogator v4 installed → verify MCP server auto-starts via `postStartCommand` в `.devcontainer/devcontainer.json` → run `get_trace("FR-001")` → hibernate codespace → resume → verify MCP server resumes with intact spec graph (rebuild ≤2s).

**Acceptance Scenarios:**

Given a Codespaces environment with dev-pomogator v4 в `.devcontainer/devcontainer.json`
When the codespace starts (cold or warm)
Then `postStartCommand` launches MCP server and writes lock file `.dev-pomogator/.mcp-lock.json` with env `codespaces:<machine-id>`

Given Codespace hibernates after 30 minutes of inactivity
When user resumes the codespace
Then MCP server auto-restarts via postStart hook + reuses in-memory rebuild from persistent `/workspaces/` files within 2s

Given Codespaces persistent volume (`/workspaces/`) is used (not bind-mount)
When chokidar runs touch test
Then native FS events work (no polling fallback needed); test passes within 500ms

---

### User Story 21: Unified spec-graph via spec-qualified node ids (Priority: P1)

**Требование:** [FR-36](FR.md#fr-36)

As an AI agent (and the MCP tools it drives), I want all specs to form ONE graph where every node id is unique across specs, so that `get_trace`/`get_node`/coverage resolve the RIGHT node instead of a collision-dropped guess, and "specs as one graph" is true rather than a file-path workaround.

**Why:** The graph keys nodes by the bare local id (`FR-2`), so across 47 specs they collide — the node Map keeps the last writer and silently drops ≈90% (46 specs define `FR-2`, only 47 FR nodes survive instead of ≈470). Every edge bug (`get_trace` empty for all 47 FRs, `covers` ×52 on one id) is a symptom. It only "works" because coverage scopes by file path, never trusting a bare id. This is the architectural root cause surfaced by the dogfood dataset; until fixed, cross-spec queries are impossible and the graph is silently lossy.

**Independent Test:** Run the dogfood harness (`tools/spec-mcp-server/dogfood-dataset.ts`) before and after the migration → FR-node count jumps 47→≈470, a raw pre-map node dump shows 0 id collisions, and `get_trace` returns scenarios via real edges for every FR that has BDD scenarios. Resolve `slug:FR-2` → exact node; resolve bare `FR-2` → candidate list, not an arbitrary node.

**Acceptance Scenarios:**

Given two specs that each define `FR-2`
When the builder assembles the graph with composite keys
Then it holds two distinct nodes `slug-A:FR-2` and `slug-B:FR-2`, neither collision-dropped

Given an intra-file markdown link `FR.md#fr-2`
When the anchor index resolves it
Then the anchor alias stays the bare file-local `fr-2` (Marksman/anchor-fix unaffected)

Given a colliding bare id `FR-2`
When a tool is called with it
Then it returns the candidate list of `slug:id` entries rather than one arbitrary node

### User Story 22: Smart verdict is authoritative + the corpus traces cell→atom (Priority: P1)

**Требование:** [FR-37](FR.md#fr-37)

As a developer (and an AI agent reporting spec health), I want a GREEN spec verdict to MEAN the smart analysis passed and the corpus traces from FR down to the atom — not that one file's formatting is fine — so that I can trust "valid" instead of being handed a false green off a dumb structural check.

**Why:** This session a structural `validate-spec: 0 errors` was reported as "spec valid" while `audit-spec` had 10 P0, `conformance_check` had 1256 findings, and the corpus had 32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP. v4 already owns the smart machinery (FR-8 semantic, conformance, coverage/honesty, audit) but it is opt-in / not authoritative, so a dumb pass masquerades as health. A verdict you can't trust is worse than none — it manufactures false confidence.

**Independent Test:** On a spec with 0 structural errors but open smart findings, run the health entrypoint → the verdict is RED with a per-item gap list (stale FILE_CHANGES path, UNCOVERED_FR, TASK_UNTESTED, UNTAGGED_SCENARIO), and NO tool/skill prints "valid/clean/done". Reconcile the gaps → verdict turns GREEN, and GREEN now provably means cell→atom traceability.

**Acceptance Scenarios:**

Given validate-spec returns 0 structural errors but the smart analysis has open findings
When spec health is reported
Then the verdict is the smart analysis and a bare structural pass is not reportable as clean

Given a stale FILE_CHANGES path, an UNCOVERED_FR, a TASK_UNTESTED, or an UNTAGGED_SCENARIO
When the authoritative verdict runs
Then it fails with a per-item gap list

Given no claude binary is available
When the authoritative verdict runs
Then it carries a SEMANTIC_SKIPPED note and never reports no-drift for unchecked content

### User Story 24: MCP-only рельсы для агента (Priority: P1)

**Требование:** [FR-39](FR.md#fr-39)

Как владелец репозитория, я хочу чтобы агент читал и писал спеки ТОЛЬКО через
централизованную MCP-дверь с аудит-логом и валидацией на записи, чтобы я
контролировал и видел в логах всё, что агент делает со спеками, а генератор
перестал писать вслепую.

**Why:** Сегодня доступ врассыпную (Read/Grep/Edit по файлам), следа нет,
ошибки авторинга всплывают только на финальном вердикте.

**Independent Test:** В enforce-режиме агентский Grep по `.specs/` получает deny
с указателем на MCP; запись с битым анкером отклонена сервером с findings list;
каждый доступ виден в `spec-access.jsonl`.

**Acceptance Scenarios:**

Given enforce-режим включён после доказанной read/write-достаточности
When агент вызывает Read или Grep по `.specs/**`
Then вызов отклонён с указателем на MCP-тулзы и записью в аудит-лог

Given фазовый headless-агент с allowed-tools без файловых тулзов по спекам
When оркестратор-проверятор гоняет фазу
Then переход к следующей фазе происходит только при GREEN-гейте вердикта

### User Story 25: Нельзя начать задачу без собранной спеки (Priority: P1)

**Требование:** [FR-48](FR.md#fr-48)

Как владелец репозитория, я хочу чтобы агент не мог взять задачу «в работу»,
пока для её требования не собрана и проверена вся цепочка (критерии, дизайн,
история, ресерч, сценарий), чтобы код не писали вперёд спеки — это передняя
скобка к правилу «не закрывай задачу без зелёного теста».

**Why:** Статус сейчас ставится свободной правкой текста; «в работе» можно
написать на требовании-пустышке. Перекличка ловит это постфактум (0/47 полных),
а гейт на входе ловит ДО начала кода.

**Independent Test:** Перевод impl-задачи с неполной цепочкой в `in-progress`
через дверь/команду отклонён с перечнем недостающих ног; задача фазы-спеки с тем
же требованием — разрешена (анти-deadlock).

**Acceptance Scenarios:**

Given impl-задача, у требования которой нет дизайна, истории и сценария
When агент переводит её в `in-progress` через дверь
Then запись отклонена с находкой, перечнем недостающих ног и навыком task-status

Given задача фазы-спеки, создающая ноги требования, и требование существует
When агент переводит её в `in-progress`
Then переход разрешён, гейт не клинит создание самих ног

### User Story 26: Честный статус спеки сам всплывает, false-close блокируется (Priority: P1)

**Требование:** [FR-49](FR.md#fr-49)

Как владелец репозитория, я хочу чтобы остаток работы по спеке САМ всплывал в каждом
ходе и агент не мог объявить «готово» при незакрытых требованиях, чтобы не приходилось
каждый раз переспрашивать «что дальше» и ловить false-close вручную.

**Why:** Агент повторно объявлял спеку готовой при 11 требованиях в работе; пассивный
баннер переписи игнорировался; стоп-гейт ловил передачу хода по фразам, не по данным.
Нужна автоматическая петля: показать следующий шаг + заблокировать враньё реальными числами.

**Independent Test:** claim «спека готова» при незакрытой переписи блокируется стоп-гейтом
с реальными числами; не-спек claim не блокируется (анти-H1); баннер называет следующую задачу.

**Acceptance Scenarios:**

Given незакрытая перепись и claim о завершении СПЕКИ с прогоном тулов в этом ходе
When стоп-гейт оценивает ход
Then ход заблокирован с реальными числами и следующим шагом

Given баннер переписи при наличии незавершённого
When баннер рендерится
Then он называет одну конкретную следующую открытую задачу

### User Story 27: Расхождения между спеками всплывают до того, как уедут в код (Priority: P2)

**Требование:** [FR-17](FR.md#fr-17)

Как мейнтейнер с 50+ спеками, я хочу одной командой увидеть, где две спеки противоречат друг другу или спека разошлась с кодом, чтобы ловить противоречия до того, как их прочитает или реализует человек, а не разгребать потом по всему корпусу.

**Why:** При росте числа спек одни и те же сущности (FR-id, URL, enum, имя модуля) дрейфуют между спеками, а заявленные в спеке файлы/символы пропадают из кода — вручную это незаметно, пока кто-то не наткнётся на противоречие в проде.

**Independent Test:** Прогнать сверку на корпусе → `consistency-report.yaml` со списком находок (механические классы в light-режиме, семантический дрейф в full); пара заведомо расходящихся спек даёт CRITICAL-находку, чистая пара — пусто.

**Acceptance Scenarios:**

Given две спеки с одинаковым FR-id, но противоречащим поведением
When запускается сверка спек
Then эмитится находка cross-spec/contradictory-fr (или semantic-drift в full-режиме) с обеими спеками

Given спека, объявляющая файл, которого нет на диске
When запускается сверка
Then эмитится находка impl-drift/missing-file с ожидаемым путём

### User Story 28: Разбираю находки с трейд-оффом перед глазами, а не вслепую (Priority: P2)

**Требование:** [FR-18](FR.md#fr-18)

Как мейнтейнер, разбирающий находки сверки спек, я хочу чтобы каждая находка была объяснена (что/где/почему + варианты) ДО любой правки, чтобы я принимал решение с видимой ценой, а не инструмент молча выбирал сторону.

**Why:** У починки находки обычно есть трейд-офф (править спеку или код или отложить; трогать чужую спеку или нет). Авто-починка молча выбрала бы сторону и рискнула бы загрязнить соседнюю спеку.

**Independent Test:** На непустом отчёте резолвер по каждой находке печатает 5-польный блок (код/severity/класс, файлы+строки, простыми словами, ПОЧЕМУ, варианты) и спрашивает через AskUserQuestion перед правкой; CRITICAL блокирует с аудит-логом override.

**Acceptance Scenarios:**

Given непустой отчёт сверки спек
When резолвер обрабатывает находку
Then перед любой правкой показан 5-польный блок-объяснение и спрошен выбор

Given правка затрагивает файл другой спеки
When резолвер собирается применить фикс
Then показан дополнительный баннер подтверждения про чужую спеку перед записью

### User Story 29: Дверь не даёт случайно закрыть намеренно-отложенную задачу (Priority: P2)

**Требование:** [FR-50](FR.md#fr-50)

Как мейнтейнер, разбирающий backlog, я хочу чтобы дверь сама отказывала закрыть задачу с маркером `_waived:` (намеренно открытую), чтобы случайный fake-close ловила автоматика, а не моя внимательность.

**Why:** Агент чуть не закрыл `verify-phase0-red` (advisor-вейвер: red-precondition непроверяема пост-фактум); поймала РУЧНАЯ сверка с кодом. Защита на внимательности ненадёжна — нужен пол в самой двери.

**Independent Test:** `set_entity_status(waived-задача → done)` отказан с `error: WAIVED` + причиной; `apply_spec_change`, флипающий waived-задачу в DONE, отклонён находкой TASK_WAIVED_CLOSED; `done`-задача без `_waived:` и открытая waived-задача — НЕ триггерят (точный сигнал).

**Acceptance Scenarios:**

Given задача с маркером `_waived:` и попытка закрыть её через set_entity_status
When команда оценивает переход в done
Then переход отклонён с error WAIVED и причиной вейвера

Given правка через дверь, флипающая waived-задачу в DONE
When дверь валидирует запись
Then запись отклонена находкой TASK_WAIVED_CLOSED уровня ERROR

=== USER_STORIES.md (append a NEW story; FR.md `**User Story:** US-21` is stale — US-21 belongs to FR-36) ===

### User Story 33: One thin command runs the spec workflow end to end (Priority: P2)

**Требование:** [FR-33](FR.md#fr-33)

As a maintainer, I want a single orchestrator skill that sequences scaffold → conformance → coverage → reconcile → resolve → honesty-gate by delegating to the EXISTING worker skills/tools (never re-implementing them) and keeps a human-gated self-improve ledger, so that I run the whole pipeline without wiring it by hand each time and friction is captured for review rather than lost.

**Why:** The workflow is a fixed sequence over tools that already exist; without an orchestrator it is re-assembled ad hoc each session, and ideas/friction surfaced mid-run evaporate.

**Independent Test:** The orchestrator delegates a step to a worker (no duplicated worker logic); on detecting friction it appends a DATED `pending` ledger entry without touching spec or code; a pending entry is never auto-applied; the drift guard fails when a live MCP tool / worker skill / FR is unreferenced by the feature-map.

**Acceptance Scenarios:**

Given the orchestrator reaches a workflow step
When it runs the step
Then it delegates to the existing worker rather than re-implementing it

Given friction is detected during a run
When the orchestrator records it
Then a dated pending ledger entry is appended and neither spec nor code is touched

Given a capability not referenced by the feature-map
When the drift guard runs
Then it fails naming the stray capability

=== USER_STORIES.md (US-23 is genuinely absent — author it) ===

### User Story 23: One call tells me the whole lifecycle state of a spec (Priority: P1)

**Требование:** [FR-38](FR.md#fr-38)

As an AI agent, I want a single get_spec_status({spec}) call that classifies a spec into exactly one lifecycle state and links the last test-run summary, so that I understand 'tests not written / not run / RED / PARTIAL / GREEN' without stitching it from 3-4 calls or guessing whether a run happened.

**Why:** The full picture (are tests written? did they run? how did the last run end? how many trace gaps?) took get_coverage_summary + find_by_tags + get_test_result and still couldn't answer 'was there a run at all'. The truth lives in the one graph (FR-36) + ingested NDJSON (FR-1), so it should be one mechanical read.

**Independent Test:** A docs-only spec reads SPEC_ONLY; scenarios written but no lastResult read TESTS_NOT_RUN; ≥1 FAILED/AMBIGUOUS reads RED with the linked summary; all touched PASSED reads GREEN with the summary; undefined/pending reads PARTIAL never GREEN; when no run data exists last_run is null, never fabricated.

**Acceptance Scenarios:**

Given a spec with docs and zero Scenario nodes
When get_spec_status runs
Then the state is SPEC_ONLY

Given a spec whose last run has an undefined step and zero failed
When get_spec_status runs
Then the state is PARTIAL and last_run carries the per-class summary

Given a spec with no ingested run data
When get_spec_status runs
Then last_run is null and no summary is fabricated

### User Story 31: Workflow frictions I hit in use get fixed, not re-hit (Priority: P2)

**Требование:** [FR-52](FR.md#fr-52)

As a maintainer dogfooding the spec-graph / MCP-door / BDD workflow, I want the frictions surfaced during live use — a filtered cucumber run silently clobbering the canonical coverage ndjson, the anchor-fixer being unusable under enforce, v1→v2 FILE_CHANGES path drift on migrated specs, validate_anchor answering about the wrong kind of anchor, coverage marking a task unverified though its own scenario passed, and a door behaviour change leaving its BDD scenario stale — captured as concrete hardening requirements with tests, so that the next session does not re-hit the same papercuts and the door/workflow gets steadily more honest.

**Why:** These were not theoretical — each cost real time this session (hand-reconciling 14 dead FILE_CHANGES rows, re-running a 2.5-minute canonical suite to undo an ndjson clobber, hand-computing a Cyrillic GLFM slug because fix.mjs is enforce-blocked). Left uncaptured, the same frictions re-cost the next operator. The analysis lives in `audit-reports/session-dogfood-findings-2026-06-18.md`.

**Independent Test:** Each FR-52 sub-requirement (a..f) has a deterministic check: a filtered run leaves the canonical ndjson untouched; the anchor gate offers a door-routed remediation under enforce; the audit names a v1-layout FILE_CHANGES path; validate_anchor's description distinguishes the two anchor kinds; a task with a passing own-scenario reads verified; a door-behaviour change is gated until its BDD scenario matches.

**Acceptance Scenarios:**

Given a cucumber run filtered with --name
When it executes through the default config
Then the canonical .last-test-run.ndjson is not overwritten with the partial result

Given a migrated spec whose FILE_CHANGES has an edit row under a removed v1 prefix
When the audit runs
Then it emits a specific v1-layout-drift finding with remap guidance, not only a generic missing-file error

### User Story 34: Phase 7 — a scannable summary roll-up in the consistency-report (Priority: P2)
**Требование:** [FR-17](FR.md#fr-17)

As a maintainer reading a `consistency-report.yaml`, I want a top-level `summary` block (counts by severity / class / namespace, run totals, and the top-3 recommendations) so that I can triage a spec's drift at a glance without scanning every finding.

**Why:** a long `findings[]` list is hard to scan; the roll-up gives severity/namespace shape and the worst few items first.
**Independent Test:** emit a consistency-report for a spec with a missing impl path and assert the `summary` block carries `by_severity`, `by_namespace`, `totals.specs_compared`, `totals.impl_paths_checked` and `top_3_recommendations`.
**Acceptance Scenarios:**

Given a reconcile corpus with one spec that has a missing impl path
When the consistency-report YAML is emitted for that spec
Then the YAML carries a summary block with by_severity, by_namespace, totals and top_3_recommendations

### User Story 35: Phase 7 — interactive, confirm-gated cross-spec resolution (Priority: P2)
**Требование:** [FR-18](FR.md#fr-18)

As a maintainer resolving a consistency-report, I want each finding explained and gated behind an explicit confirm before any file edit, so that I never apply a wrong fix blindly.

**Why:** auto-applied fixes to specs/code are high-risk; a confirm gate keeps every mutation reviewed.
**Independent Test:** run resolve over a report with a missing-file finding and assert no Edit happens until an Apply confirm.
**Acceptance Scenarios:**

Given a consistency-report with a missing-file finding
When cross-spec-resolve processes it
Then a 5-field explanation is emitted and no edit occurs until the user confirms Apply

---

### User Story 36: A "done" spec cannot hide an unfilled scaffold (Priority: P2)
**Требование:** [FR-57](FR.md#fr-57)

As a maintainer trusting the spec health verdict, I want a spec that still contains unfilled template placeholders to be flagged (RED once it claims done), so that a scaffold cannot masquerade as a finished spec just because its traceability links happen to resolve.

**Why:** traceability can be complete while the prose is still `{Краткое описание фичи}` — the verdict then reads GREEN and the incomplete work is invisible (real case: forbid-root-artifacts).
**Independent Test:** finalize a spec whose README is left as the template scaffold and run spec-verdict → verdict is RED with a SCAFFOLD_INCOMPLETE finding naming the file, line and sentinel; fill the prose and it goes GREEN.
**Acceptance Scenarios:**

Given a claims-done spec whose README is still the unfilled template scaffold
When spec-verdict runs on it
Then the verdict is RED with a SCAFFOLD_INCOMPLETE finding, and filling the prose clears it
