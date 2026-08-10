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

### User Story 26: Текущий следующий шаг не загрязняется чужим backlog (Priority: P1)

**Требование:** [FR-49](FR.md#fr-49)

Как пользователь нескольких репозиториев, я хочу видеть следующий шаг только текущей сессии и проекта,
чтобы чужой backlog или stale transcript task не уводили агента в другую спеку, чтобы не приходилось
каждый раз переспрашивать «что дальше» и ловить false-close вручную.

**Why:** Shared census serves status, MCP, and Pinator, so its route must be scoped before any consumer uses it; historically an agent
баннер переписи игнорировался; стоп-гейт ловил передачу хода по фразам, не по данным.
Eligibility and Stop judgment remain a separate [pinator](../pinator/README.md) responsibility.

**Independent Test:** real router uses target workspace and real task IDs; generic routing alone never invokes Pinator,
uses deterministic todo → relevant async → current-spec priority and returns no global fallback for unknown scope.

**Acceptance Scenarios:**

- Target workspace census excludes plugin repository backlog.
- Failed updates and ambiguous duplicate subjects do not invent an open task.
- Generic routing alone never invokes a judge or writes Pinator state.

- Current-spec open work is used only when stronger current-session sources are absent.
- Unknown scope returns no global or busiest-spec fallback.
- Route diagnostics preserve the selected real task identity and reconciliation reason.

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

---

### User Story 37: Hook feedback stays useful without flooding Claude's context (Priority: P1)
**Требование:** [FR-59](FR.md#fr-59)

As a maintainer editing specs in a noisy corpus, I want the conformance push to show a compact summary instead of thousands of lines, so that I can see the problem count and where to inspect the full audit without losing the session to context bloat.

**Why:** The full list belongs in the durable audit journal; the Claude-facing reminder is only a steering signal. Printing every finding made real sessions carry ~700KB hook payloads.
**Independent Test:** Drive `decidePush` with thousands of findings and assert the reminder stays under 6000 bytes with counts, samples, omitted count and full-log pointer; drive `runPush` on a fixture corpus and assert the spec-check-log still has every finding.
**Acceptance Scenarios:**

Given thousands of conformance findings are waiting in the PostToolUse push window
When the window flushes
Then Claude receives a bounded reminder with counts and an omitted count, while the full journal remains complete

---

### User Story 38: Scenario overlay rows lead back to failure evidence (Priority: P1)
**Требование:** [FR-56](FR.md#fr-56)

As a maintainer reviewing BDD coverage after a filtered or parallel run, I want each updated scenario result to point back to the archived runtime chunk and scenario start id, so that I can inspect the failing step and error without replacing the canonical full-suite result or grepping raw logs.

**Why:** The overlay is the freshness trail for individual scenario runs; without a runtime pointer it can say "failed" but not "where". Keeping the details in the archived Cucumber messages makes the prompt-time overlay small while preserving the debugging trail.

**Independent Test:** Run the overlay writer against Cucumber message NDJSON with a failing scenario, then assert the overlay row carries `trace_id`/`trace_file`/`test_case_started_id` and `get_scenario_trace(scenario_id)` reconstructs the failing step; delete the chunk and assert the tool returns an expired-trace rerun hint instead of throwing.

**Acceptance Scenarios:**

Given a filtered BDD run writes one scenario overlay row with a trace pointer
When the maintainer asks for that scenario trace
Then the trace tool returns the run metadata and failing step from the archived runtime chunk

---

### User Story 24: One honest readiness surface for spec health (Priority: P1)
**Требование:** [FR-61](FR.md#fr-61)

As a maintainer dogfooding the spec-generator workflow, I want verdict, MCP status, coverage, task board truth, BDD sync, and filtered-run proof to collapse into one honest readiness answer, so that I do not have to reconcile `Status: DONE`, `VERDICT: GREEN`, `TESTS_NOT_RUN`, and filtered Docker evidence by hand.

**Why:** The CARL dogfood incident showed that all raw facts existed, but they were split across surfaces with inconsistent labels: tasks said DONE, canonical coverage said not_run, verdict said GREEN, status used `UNCOVERED_FR` for execution absence, and a filtered Docker run passed without becoming canonical coverage. One product-readable readiness contract prevents false confidence.

**Independent Test:** Build a fixture spec with structural traceability pass, unrun scenarios, DONE-but-unverified tasks, source/executable scenario drift, and a passing filtered Docker artifact; run `spec-verdict` plus `get_spec_status` and assert the result is multi-lane `OVERALL: NOT_READY`, names the exact debt, exposes `FILTERED_PROOF`, and returns a concrete next action.

**Acceptance Scenarios:**

Given a spec has traceability edges but no canonical passed run
When the maintainer asks for spec health
Then the readiness surface says execution is not verified and does not label the spec plain GREEN

Given a task is textually DONE but its mapped scenario is not canonical PASSED or its Done When list is incomplete
When the task is surfaced through status or verdict
Then the task is shown as evidence-IN_PROGRESS / DONE-but-unverified with the missing evidence named

Given a filtered Docker BDD artifact passes selected scenarios
When the readiness surface reports coverage
Then it shows the filtered proof separately from canonical coverage and gives the next action to attach proof or run the full suite

---

### User Story 39: Trust the readiness gate from a Windows host through WSL (Priority: P1)

**Требование:** FR-62

As a maintainer using an installed plugin cache from a Windows host while the target project is in WSL, I want `spec-status` and the MCP readiness answer to resolve the project root by environment override, then caller/project cwd, then `SCRIPT_DIR` fallback, so that an installed script never mistakes its plugin-cache directory for the target project.

**Why:** Issue #126 is a script-root resolution defect, not a generic Windows-to-WSL repository-identity or tracked-file-inventory problem. `SPECS_GENERATOR_ROOT` is an environment override; inherited noninteractive stdin must independently never block. A cached installed plugin can resolve its own `SCRIPT_DIR` successfully while reading no target-project files, so target-root precedence must remain explicit.

**Independent Test:** Run the installed `spec-status` precheck from a fixture with distinct plugin-cache `SCRIPT_DIR` and WSL project roots; assert `SPECS_GENERATOR_ROOT` wins when set, otherwise a valid caller/project cwd wins, and `SCRIPT_DIR` is used only as final fallback with the selected source reported. Invoke the same paths with inherited noninteractive stdin and assert they complete without waiting for input.

**Acceptance Scenarios:**

Given `SPECS_GENERATOR_ROOT` is set to a target project while an installed plugin runs from its cache
When `spec-status` or MCP readiness resolves the project root
Then it uses the environment override rather than the cache `SCRIPT_DIR`

Given `SPECS_GENERATOR_ROOT` is absent and the caller working directory is a valid target project
When readiness resolves the project root
Then it uses that caller/project cwd before considering `SCRIPT_DIR`

Given neither an environment override nor a valid caller project is available
When root resolution must use `SCRIPT_DIR`
Then it reports the fallback source and does not mistake the cache as target-project evidence

Given stdin is inherited but noninteractive
When `spec-status` or its MCP path runs root resolution
Then it completes without waiting for stdin and applies the same root precedence

---

### User Story 40: Ship a dependency-safe installed readiness command (Priority: P1)

**Требование:** FR-63

As a plugin user who installs a released dev-pomogator version without this repository's development dependencies, I want the installed `spec-status` and MCP readiness path to execute using only shipped runtime assets, so that a local-source green run does not become a missing-module failure after installation.

**Why:** Development `node_modules` can conceal an undeclared runtime import; release confidence requires the same command through the installed-plugin launcher with dependencies absent.

**Independent Test:** Package and install the release artifact in an isolated fixture, hide development dependencies, invoke the public readiness command and its MCP-backed path, and assert both return a structured readiness answer rather than a module-resolution error.

**Acceptance Scenarios:**

Given a user installs the released plugin without repository `node_modules`
When they invoke the documented readiness command
Then it starts through the installed launcher and returns the readiness result without requiring undeclared packages

Given an installed runtime import is not included in the release artifact
When the dependency-absent verification runs
Then it fails with the missing asset/import identified before release publication

---

### User Story 41: Keep graph identifiers parseable and traceable (Priority: P1)

**Требование:** FR-64

As a spec author, I want proposed FR, user-story, and use-case identifiers to remain graph-parseable and explicitly linked while the spec evolves, so that an added requirement cannot become an `FR_NO_STORY` orphan or a prose-only identifier.

**Why:** IDs that only resemble traceability syntax can look complete in Markdown while being invisible to the graph, status tools, and the readiness gate.

**Independent Test:** Add proposed linked FR/US/UC records to a fixture, build the graph, and assert each record is discoverable with its relationship; introduce an unlinked or malformed ID and assert conformance returns the specific orphan finding.

**Acceptance Scenarios:**

Given a proposed requirement has an explicitly linked user story and use case
When the graph is built
Then all three records are parseable nodes with their intended traceability edges

Given a requirement-like identifier has no linked user story or is not graph-parseable
When conformance runs
Then it reports the precise `FR_NO_STORY` or identifier finding rather than treating prose as coverage

---

### User Story 42: Receive one evidence-backed readiness answer from status, verdict, and MCP (Priority: P1)

**Требование:** FR-63

As a maintainer deciding whether a spec is ready, I want `spec-status`, the MCP surface, and `spec-verdict` to agree on the same graph and evidence, including AC/scenario discovery and recency, so that a green-looking partial result cannot overrule missing or stale readiness evidence.

**Why:** Separate status paths can each be locally plausible while disagreeing on discovered scenarios, AC mappings, recency, or which evidence is authoritative; readiness requires every mandatory lane, not any one passing lane.

**Independent Test:** Build a fixture with mapped ACs, newly discovered and stale scenarios, current and expired evidence, then invoke CLI status, MCP status, and verdict; assert identical mandatory-lane results, `NOT_READY` when any required discovery/recency lane is absent, and a shared next action.

**Acceptance Scenarios:**

Given spec-status, MCP status, and spec-verdict read one spec with the same graph snapshot
When the readiness answer is requested through each surface
Then each surface reports the same AC/scenario discovery, evidence-recency, and overall readiness result

Given an acceptance criterion or scenario is undiscovered, missing evidence, or only backed by stale evidence
When readiness is calculated
Then the overall answer is NOT_READY and names the missing or stale mandatory lane

---

### User Story 43: Release ownership proves, monitors, and can roll back readiness delivery (Priority: P1)

**Требование:** FR-64

As the release owner, I want a GitHub #45 test-isolation inventory and release proof spanning the checks before and after the linked PR, tag, and release, so that readiness functionality is not declared shipped merely because source tests passed.

**Why:** GitHub #45 identifies test-isolation work. Its production proof must establish the affected test inventory before release, bind the dependency-absent artifact evidence to the PR/tag/release, and retain post-release monitoring and rollback ownership.

**Independent Test:** Produce a release fixture linked to GitHub #45 with its test-isolation inventory and PR/tag/release metadata; assert finalization rejects publication without pre-release inventory evidence, dependency-absent proof, post-release monitoring owner/signal, and rollback target, and permits a complete record.

**Acceptance Scenarios:**

Given GitHub #45 has a recorded test-isolation inventory before its linked PR, tag, and release
When the release owner records production finalization
Then the record links the inventory, artifact evidence, PR/tag/release metadata, owner, monitoring signal, and rollback target

Given the #45 inventory, dependency-absent proof, post-release monitoring, or rollback information is missing
When publication readiness is evaluated
Then it is NOT_READY with the missing release-control item and next action

---

### User Story 44: Reject shallow delivery plans for externally observable paid APIs (Priority: P1)

**Требование:** FR-65

As a spec author and reviewer, I want every external, deployed, authenticated, or paid acceptance claim mapped to implementation, contract-test, and semantic live-evidence tasks, so that a route returning JSON or a single unauthenticated status cannot masquerade as a delivered product contract.

**Why:** The #140 incident passed route and unauthenticated checks while public fields, version compatibility, input UX, redaction, funded execution, settlement, and result readback remained unproved.

**Independent Test:** Run the real acceptance coverage analyzer and audit against a synthetic paid-SPA corpus containing a shallow task plan, a blocking unknown, and a complete plan; assert deterministic missing lanes, hard-gate failure for the first two, and no coverage finding only for the complete plan.

**Acceptance Scenarios:**

Given public contract and paid-flow acceptance has only route-exists and unauthenticated tasks
When generator finalization or review evaluates acceptance delivery coverage
Then the phase is blocked with the missing implementation, test, billing, and semantic deploy lanes

---

### User Story 45: Preserve every spec document when a transaction write fails (Priority: P1)

**Требование:** [FR-60](FR.md#fr-60)

As a spec author, I want a multi-document mutation to restore every earlier write when a later document cannot be persisted, so that an I/O fault cannot leave the graph half-authored or destroy a non-empty document through a batch-only bypass.

**Why:** Per-file atomic rename prevents torn files but does not make a sequence of document writes all-or-nothing; without compensation, a second-write failure leaves a valid-looking partial graph.

**Independent Test:** `SPECGEN004_523` writes the first document through the real atomic writer, injects a deterministic failure on the second write, and asserts every document is byte-identical to its pre-transaction snapshot; it also refuses an empty whole-document replacement.

**Acceptance Scenarios:**

Given a validated transaction spans two non-empty spec documents
When the second atomic document write fails after the first succeeds
Then the first document is restored byte-for-byte and the result reports `WRITE_FAILED`

Given a batch edit replaces a non-empty spec document with empty content
When the transaction validator evaluates the fully staged graph
Then it refuses the destructive replacement before any document is written

### User Story 45: Typed delivery truth (Priority: P1)

As a requirement owner, I want typed verification, safety, risk and delivery metadata, so that a green task/test status cannot hide a missing required artifact.

**Требование:** [FR-66](FR.md#fr-66)

**Why:** Free-form claims cannot deterministically prove that implementation, integration tests, documentation, migration and operational proof were all delivered.

**Independent Test:** Docker BDD `@feature66` builds the real graph, keeps task verdict separate from delivery overall, and proves missing required artifacts make smart overall red.

**Acceptance Scenarios:**

Given tasks are done and canonical scenarios pass but documentation is required and missing
When the requirement census and smart verdict evaluate the graph
Then task verdict remains implemented and delivery is incomplete

Given all required delivery artifacts are present or validly excepted
When the same evaluator runs
Then delivery is delivered by non-empty ALL


## User Story 46: Typed edge truth (Priority: P1)

**Требование:** [FR-67](FR.md#fr-67)

As a spec author and MCP consumer, I want coverage, evidence, and authorization edges to have distinct typed meanings and one endpoint contract, so an invalid graph is rejected before any staged write while cold and warm graph paths return the same actionable truth.

**Independent Test:** Run `SPECGEN004_589`–`SPECGEN004_594` in Docker and verify exhaustive edge rules, valid traversal, `ENDPOINT_VIOLATION`, atomic MCP refusal, SQLite parity, and backward-compatible producers.



### User Story 47: Acceptance criterion owns its proof (Priority: P1)

As a repository owner, I want every acceptance criterion to carry its own executable proof instead of borrowing the parent requirement's scenarios, so that one green scenario cannot make unverified sibling criteria look complete.

**Требование:** [FR-68](FR.md#fr-68)

**Why:** The current readiness inventory maps every AC to the parent FR's scenario set. `@feature68` must distinguish own proof from inherited context and block `UNCOVERED_AC` or `UNVERIFIED_AC` before task/feature completion.

**Independent Test:** Build a fixture with two sibling ACs under one FR, give only the first AC its own passing scenario, and verify that the second remains blocking despite the parent FR being green.

**Acceptance Scenarios:**

Given two sibling acceptance criteria under one functional requirement
When only the first criterion has its own passing scenario
Then the first criterion is satisfied and the inherited-only sibling remains blocking


### User Story 48: Non-functional requirements participate in readiness (Priority: P1)

As a repository owner, I want performance, reliability, security and usability requirements to participate in the same fail-closed readiness decision as functional requirements, so that a feature cannot be called complete while every NFR is unverified.

**Требование:** [FR-69](FR.md#fr-69)

**Why:** The current inventory and delivery evaluator filter NFR nodes out of mandatory readiness. `@feature69` must surface uncovered and unverified NFRs as blocking findings.

**Independent Test:** Build one functional requirement and one required NFR with the FR green and the NFR unverified, then verify that the smart verdict stays NOT_READY until the NFR receives current evidence.

**Acceptance Scenarios:**

Given a green functional requirement and an unverified required NFR
When the mandatory readiness lanes are evaluated
Then NFR_SATISFACTION is RED and the smart verdict is not GREEN


### User Story 49: Artifact evidence is graph-verifiable (Priority: P1)

As an evidence reviewer, I want demonstration artifacts to be content-addressed graph nodes with provenance and freshness, so that a hand-written `PRESENT` flag or a stale/missing MP4 cannot satisfy an operational-proof obligation.

**Требование:** [FR-70](FR.md#fr-70)

**Why:** Attachments are currently readable but disconnected from requirement truth. `@feature70` must bind an artifact manifest, file digest, producer, run identity and freshness to the requirement through a typed evidence edge.

**Independent Test:** Create a valid content-addressed video evidence fixture, mutate one byte and separately advance the source revision, then verify digest mismatch and stale provenance both become blocking MISSING evidence.

**Acceptance Scenarios:**

Given an operational-proof demand and a content-addressed artifact manifest
When the artifact is absent empty outside the attachment root digest-mismatched or stale
Then the evidence state is MISSING and the smart verdict is not GREEN


### User Story 50: Independent judge watches the demonstration (Priority: P1)

As a repository owner, I want a judge other than the artifact producer to watch the recorded demonstration and issue a criterion-by-criterion verdict, so that an agent's self-attestation cannot pass as independent acceptance evidence.

**Требование:** [FR-71](FR.md#fr-71)

**Why:** Integrity metadata proves which bytes were reviewed, not that those bytes demonstrate the claim. `@feature71` must require reviewer/producer separation, timestamped observations and a structured CONFIRMED/DENIED result.

**Independent Test:** Submit the same artifact once with producer and reviewer equal and once with distinct identities plus a CONFIRMED criterion verdict; verify only the independently reviewed exact digest can satisfy the demand.

**Acceptance Scenarios:**

Given a recorded demonstration and its exact digest
When its reviewer equals its producer or any criterion is DENIED
Then the review is self-attested or denied and operational proof remains incomplete



---

### User Story 51: Execution-aware task creation and planning (Priority: P1)

**Требование:** [FR-72](FR.md#fr-72) *(temporary trace anchor; the later Requirements phase will replace this linkage when it adds the task-planning requirement; no FR is created by this Discovery change)*

As a spec author or implementation agent, I want tasks represented as a typed dependency DAG with declared execution surfaces and evidence, so that the generator can create a safe, explainable execution plan instead of treating `TASKS.md` as prose only.

**Why:** A task title, phase, and free-form completion text do not reveal ordering, resource conflicts, or whether its proof remains valid after inputs change. Typed task planning makes independent work visible while preventing agents from running conflicting work in parallel.

**Independent Test:** Load a fixture containing typed tasks, explicit dependencies, read/write/exclusive surfaces, estimates, evidence digests, and a bounded discovery task. The planner rejects cycles, derives a conflict graph, emits dependency-respecting conflict-free batches with critical-path and slack values, invalidates affected evidence after an input digest changes, and returns discovery output only as a reviewable graph-patch proposal. A legacy prose task fixture remains readable and is reported as migration-needed rather than gaining invented dependency edges.

**Acceptance Scenarios:**

Given canonical tasks have typed dependency edges and declared read, write, or exclusive surfaces across files, symbols, contracts, configuration, data, tests, and runtime resources
When the planner builds an execution plan
Then it validates the dependency graph as a DAG and derives a separate conflict graph from overlapping surfaces

Given two dependency-ready tasks belong to the same antichain and do not conflict
When the planner creates parallel waves
Then it places them in the same conflict-free batch and explains why they may run together

Given two dependency-ready tasks overlap on a write or exclusive surface
When the planner creates parallel waves
Then it separates them into ordered or distinct conflict-free batches and records the colliding surfaces

Given estimated task durations and a valid dependency DAG
When the planner analyzes the execution plan
Then it reports a critical path and per-task slack without treating a conflict edge as an undeclared dependency edge

Given a task-owned evidence record contains digests of its declared inputs
When an input digest or a transitive prerequisite changes
Then the record becomes stale and the planner excludes it from fresh completion evidence until it is renewed

Given a bounded discovery task finds candidate dependencies or execution surfaces
When its discovery budget is exhausted or it produces candidates
Then it returns a graph-patch proposal for validation and review rather than mutating the canonical task graph directly

Given an existing `TASKS.md` task has only prose audit fields or a summary-only `_depends` hint
When it is imported into the canonical task model
Then the original prose is preserved, unknown relations are marked for migration, and no dependency edge is fabricated



### User Story 52: Canonical task model (Priority: P1)

**Требование:** [FR-72](FR.md#fr-72)

As an implementation agent, I want one lossless canonical task model so every task view preserves identity, revision, READY state, and human-authored migration context.

**Why:** Multiple task projections must not create contradictory truth.

**Independent Test:** Parse, render, and reparse a READY task, then compare Graph, MCP, lifecycle, census, and summary output.

**Acceptance Scenarios:**

Given a strict task has complete typed fields
When it passes through canonical parse-render-parse
Then every field and READY state remains equivalent

### User Story 53: Typed dependency DAG (Priority: P1)

**Требование:** [FR-73](FR.md#fr-73)

As an implementation agent, I want typed causal dependencies and reverse blockers so readiness is based on current predecessor success rather than prose.

**Why:** An executable plan cannot safely infer causal order.

**Independent Test:** Propose a cycle and query a blocked task's typed predecessor reason.

**Acceptance Scenarios:**

Given a task has an unfinished hard predecessor
When readiness is evaluated
Then reverse blockers explain why it is not READY

### User Story 54: Typed execution surfaces (Priority: P1)

**Требование:** [FR-74](FR.md#fr-74)

As an implementation agent, I want normalized resource claims and actual-work reconciliation so direct and transitive blast radius is known before and after work.

**Why:** File names alone cannot express contracts, schemas, or runtime resources.

**Independent Test:** Reject escaped/unbounded claims and query direct/transitive impact after actual output is recorded.

**Acceptance Scenarios:**

Given a task declares a normalized schema write claim
When the planner queries impact
Then direct and transitive affected work is explained

### User Story 55: Derived conflict graph (Priority: P1)

**Требование:** [FR-75](FR.md#fr-75)

As an implementation agent, I want resource conflicts separate from dependencies so unsafe parallel work is batched without inventing causal ordering.

**Why:** Concurrency risk is not prerequisite completion.

**Independent Test:** Derive semantic cross-file conflict, expire its override, and prove DAG edges were not rewritten.

**Acceptance Scenarios:**

Given two ready tasks share a semantic API contract
When conflicts are derived
Then they are split into batches without a new dependency

### User Story 56: Deterministic execution planner (Priority: P1)

**Требование:** [FR-76](FR.md#fr-76)

As an implementation agent, I want stable waves, batches, critical path, and slack so I can execute selected work predictably.

**Why:** Equal input must not reshuffle work or hide a blocked schedule impact.

**Independent Test:** Plan identical selected DAG input through cold/warm paths and compare metrics and ordering.

**Acceptance Scenarios:**

Given an unchanged selected DAG
When it is planned repeatedly
Then waves, batches, critical path, slack, and ordering match

### User Story 57: Task-owned evidence (Priority: P1)

**Требование:** [FR-77](FR.md#fr-77)

As an implementation agent, I want task-owned proof and stale closure so obsolete success cannot mark current work done.

**Why:** Evidence is valid only for the inputs and definitions it consumed.

**Independent Test:** Change a prerequisite fingerprint and verify historical evidence remains visible while downstream tasks become stale.

**Acceptance Scenarios:**

Given a task succeeded with a consumed fingerprint
When the fingerprint changes
Then history remains visible and current completion becomes stale

### User Story 58: Bounded discovery expansion (Priority: P1)

**Требование:** [FR-78](FR.md#fr-78)

As an implementation agent, I want bounded discovery proposals so newly found work is reviewable and cannot mutate graph truth without validation.

**Why:** Unknown work must be tracked without autonomous expansion.

**Independent Test:** Replay a discovery digest without duplicate children and require approval for high-impact proposals.

**Acceptance Scenarios:**

Given a discovery output exceeds its configured impact budget
When it is submitted
Then it awaits approval without mutating the graph

### User Story 59: Planning API and rollout (Priority: P1)

**Требование:** [FR-79](FR.md#fr-79)

As an implementation agent, I want a complete MCP planning surface and staged rollout so task truth can be queried, dry-run, applied, and migrated without loss.

**Why:** Planning must work identically in installed dependency-absent environments.

**Independent Test:** Prove CAS atomicity, cold/warm parity, dependency-absent query, and observe-to-enforce preserved counts.

**Acceptance Scenarios:**

Given an unresolved legacy task in observe, warn, and enforce modes
When rollout reports are queried
Then counts remain preserved and enforce rejects it explicitly

---

### User Story 60: Pre-scheduling task synthesis preserves acceptance proof (Priority: P1)

**Требование:** [FR-80](FR.md#fr-80)

**Related scheduling requirements:** [FR-72](FR.md#fr-72), [FR-73](FR.md#fr-73), [FR-74](FR.md#fr-74), [FR-77](FR.md#fr-77)

As a spec author, I want task synthesis to convert FR, AC, DESIGN, and BDD inputs into canonical, evidence-owning vertical acceptance slices before downstream blast-radius and DAG planning, so that scheduling never loses a mandatory acceptance lane or invents a domain model.

**Why:** A dependency graph can order work only after the work is explicit: every mandatory AC lane needs an owning slice, BDD proof, and a BDD-only TDD RED → GREEN → REFACTOR chain; an unknown implementation surface must stop synthesis as a BLOCKED investigation rather than becoming speculative work.

**Independent Test:** Synthesize tasks for a spec with `domainMode: ddd` and one with `domainMode: none`. The former performs DDD boundary analysis where aggregates, invariants, and contracts are evidenced; the latter uses module, adapter, and contract boundaries without fake domain objects. In both outputs, every mandatory AC lane maps to exactly one or more vertical slices, each slice declares its BDD scenario/evidence owner and ordered BDD-only RED → GREEN → REFACTOR records; an unresolved surface produces a BLOCKED investigation record and is excluded from ready scheduling.

**Acceptance Scenarios:**

Given FR, mandatory AC lanes, DESIGN decisions, and linked BDD scenarios are inputs to task synthesis
When `domainMode: ddd` is declared
Then the synthesis performs DDD boundary analysis and emits canonical task records for vertical acceptance slices before blast-radius or DAG planning

Given the same inputs declare `domainMode: none`
When task synthesis identifies implementation boundaries
Then it uses module, adapter, and contract boundaries and does not create fake aggregates, entities, or value objects

Given a mandatory AC lane is supplied to task synthesis
When vertical slices are created
Then the lane is conserved by an owning slice with its BDD proof plus ordered BDD-only TDD RED, GREEN, and REFACTOR records

Given the implementation surface for an AC lane cannot be determined from the inputs
When task synthesis completes
Then it creates a canonical BLOCKED investigation record with ownership, unknown surface, and required evidence, and downstream scheduling does not treat it as READY



### Story 60 execution-agent consumption amendment

As an AI implementation agent or spec-generator worker, I need one canonical, self-contained task brief with exact source locations, interfaces, dependencies, predecessor context, scenario/evidence command, blockers, safe-batch proof, and next action, so that I can execute a valuable AC/BDD vertical outcome without recreating a private plan or treating a 2–5-minute substep as an independent graph task. A non-`DONE` outcome remains diagnostic and proposes follow-up work; it never falsely completes the task.


### User Story 61: Cursor uses the same spec door (Priority: P1)

**Требование:** [FR-81](FR.md#fr-81)

As a developer using Cursor on a project that already has Claude Code / `.claude` dogfood, I want the same SpecGraph MCP door without porting skills or hooks, so that I can author and gate specs from either IDE.

**Why:** Dual-host rewrite would drift; Cursor already loads `.claude/skills` and project hooks — only the MCP path layout differs.

**Independent Test:** With Third-party skills/hooks enabled and `.cursor/mcp.json` present, Cursor lists `dev-pomogator-specs` tools; create-spec skill is discoverable from `.claude/skills`; raw Write under `.specs/` is denied when enforce is on and MCP apply succeeds.

**Acceptance Scenarios:**

Given the project has `.claude/skills/create-spec` and root `.mcp.json` door
When Cursor loads the workspace with Third-party skills enabled
Then create-spec (or equivalent) is available without a `.cursor/skills` copy

Given `.cursor/mcp.json` registers `dev-pomogator-specs`
When the Cursor MCP catalog is inspected after reload
Then the door tools are listed

Given SPEC_ACCESS enforce is on and project hooks loaded
When the agent attempts a raw Write to a `.specs/**` path
Then the PreToolUse guard denies and points to MCP mutation tools



### User Story 62: Bounded task inventory and truthful read contracts (Priority: P1)

**Требование:** [FR-82](FR.md#fr-82)

As an AI coding agent using the SpecGraph MCP door, I need one bounded, complete task inventory and predictable paginated reads, so that I can find unfinished work without retry storms, silent caps, or a per-task crawl.

**Why:** The live graph already contains task nodes, but the phase-query description/test claims they are not produced; the incident `wf_0315d03b-28` shows that ambiguous and oversized reads can consume 695 MCP calls and approximately 297–312k input tokens across attempts.

**Independent Test:** Against the real graph and a captured incident/corpus artifact, one `list_tasks` inventory plus bounded verification returns stable complete cardinality, distinguishes phase-not-found from empty, keeps each page within declared byte/latency limits, and exposes no silent cap; no synthetic producer shape is accepted.

**Acceptance Scenarios:**

Given a spec contains live task nodes and unfinished tasks
When the agent requests the bounded task inventory
Then every matching task is returned through deterministic cursor pages with total and next-cursor metadata

Given the agent asks for a known empty phase or an unknown phase
When the real phase-query handler runs
Then it returns EMPTY_PHASE or PHASE_NOT_FOUND respectively and offers canonical candidates for the unknown phase

Given a large document or a missing section is requested
When the bounded document-read handler runs
Then it returns a safe page or nearest canonical anchors and requires explicit opt-in for the whole document


### User Story 63: Installed hooks keep project state bounded and isolated (Priority: P1)

**Требование:** [FR-83]

As a developer using the globally installed plugin across several repositories, I want every conformance hook to use the current caller project for `.specs` and `.dev-pomogator` state while keeping its journal bounded, so that one cache install cannot inspect itself, leak state across projects, fill the system disk, or crash Claude Code.

**Why:** The verified incident filled C: with a 4.247 GiB cache-local journal and converted normal Stop processing into Node allocation and worker-liveness failures.

**Independent Test:** Run the installed-layout BDD fixture with different plugin/project roots, projects with and without `.specs`, aged and oversized shard sets, low-disk probes, and concurrent maintenance. Assert project-only I/O, 10 MiB rotation, 64 MiB total retention, 30-day expiry, 1 GiB reserve behavior, and no installed-cache state.

**Acceptance Scenarios:** SPECGEN004_693–SPECGEN004_699.

