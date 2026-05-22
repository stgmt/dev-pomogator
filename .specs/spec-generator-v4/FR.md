# Functional Requirements (FR)

## FR-1: Phase 0 — Cucumber-JS BDD migration with canonical NDJSON output

System SHALL migrate dev-pomogator's own BDD tests from vitest pseudo-BDD (`.feature` as documentation only) to real `@cucumber/cucumber` runner that emits Cucumber Messages NDJSON to `.dev-pomogator/.last-test-run.ndjson` by default.

Target TS projects installing dev-pomogator v4 MUST also adopt cucumber-js BDD additively (existing vitest unit tests untouched, both test suites run in CI). Non-TS target projects (.NET/Python/Java) continue with their native NDJSON-emitting runners (Reqnroll/behave/Cucumber-JVM) — covered in Phase 3.

**Связанные AC:** [AC-1.1](ACCEPTANCE_CRITERIA.md#ac-1-1), [AC-1.2](ACCEPTANCE_CRITERIA.md#ac-1-2), [AC-1.3](ACCEPTANCE_CRITERIA.md#ac-1-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-1

## FR-2: Phase 1 — In-memory SpecGraph builder

System SHALL build an in-memory `SpecGraph` from `.specs/**/*.md` + `**/*.feature` + `.dev-pomogator/.last-test-run.ndjson` on MCP server startup and incrementally update on file changes (via `chokidar` with polling fallback). Graph nodes: FR/NFR/AC/SCEN/TASK/USECASE/RISK/File. Edges: `refs`, `covers`, `tested-by`, `tagged-by`, `implements`, `last-result`.

Cold-start rebuild time MUST be ≤2s for 30 specs (NFR-Performance). Incremental update on single-file change MUST be ≤100ms p95.

**Связанные AC:** [AC-2.1](ACCEPTANCE_CRITERIA.md#ac-2-1), [AC-2.2](ACCEPTANCE_CRITERIA.md#ac-2-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-2

## FR-3: Phase 1 — Custom MD parser with dual-anchor + backward compat

System SHALL parse spec headings via configurable regex `anchor_patterns` and register each FR/NFR/AC/SCEN/TASK/UC heading under **multiple anchor aliases** (Marksman-native slug + compact ID):
- `### FR-001: Login` → anchors `fr-001-login` AND `FR-001`
- Legacy `### Requirement: FR-001 Login` → anchors `requirement-fr-001-login`, `fr-001-login`, `FR-001`

All aliases resolve to the same heading. Wiki-link `[[FR-001]]` and `[[fr-001-login]]` MUST navigate identically. Legacy v3 anchors MUST continue working (no breaking change).

**Связанные AC:** [AC-3.1](ACCEPTANCE_CRITERIA.md#ac-3-1), [AC-3.2](ACCEPTANCE_CRITERIA.md#ac-3-2), [AC-3.3](ACCEPTANCE_CRITERIA.md#ac-3-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-3

## FR-4: Phase 2 — MCP server with `get_trace(node_id)` primary tool

System SHALL expose MCP server `dev-pomogator-specs` with 11 tools (see `SCHEMA.md`). Primary tool `get_trace(node_id)` returns BOTH:
- Structured tree (`acceptance_criteria[], scenarios[], tasks[], code_impl[], related_nodes[]`)
- Natural-language `explanation_for_agent` field summarizing context in ≤500 chars (FR title, counts, latest test status, failing step + error location if applicable)

Agent MUST be able to use response without follow-up file Read operations for the queried node.

**Связанные AC:** [AC-4.1](ACCEPTANCE_CRITERIA.md#ac-4-1), [AC-4.2](ACCEPTANCE_CRITERIA.md#ac-4-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-2, US-4

## FR-5: Phase 2 — PreToolUse HARD hooks for syntax invariants

System SHALL install PreToolUse hook `spec-conformance-guard` that DENIES Write/Edit on `.specs/**/*.md` or `**/*.feature` when content violates HARD invariants:
- `DUPLICATE_DEFINITION`: two `### FR-N:` headings with same ID
- `MALFORMED_FRONTMATTER`: YAML frontmatter syntax error
- `MALFORMED_GHERKIN`: `.feature` file gherkin parse error
- `INVALID_ANCHOR_PATTERN`: heading matches `anchor_patterns` regex but produces empty anchor

DENY response MUST include `permissionDecisionReason` with location + actionable hint.

**Связанные AC:** [AC-5.1](ACCEPTANCE_CRITERIA.md#ac-5-1), [AC-5.2](ACCEPTANCE_CRITERIA.md#ac-5-2), [AC-5.3](ACCEPTANCE_CRITERIA.md#ac-5-3)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-6: Phase 2 — PostToolUse always-push conformance with 3s throttle

System SHALL install PostToolUse hook that fires on Write/Edit matching `.specs/**/*.md` or `**/*.feature`. Hook:
1. Triggers incremental reindex of affected file (target ≤100ms p95)
2. Runs `conformance_check(scope: affected_node_ids)`
3. Aggregates findings within a 3-second throttle window (configurable via `post_tool_use.throttle_ms`)
4. After window closes, injects deduplicated findings as `<system-reminder>` into agent context

If 0 findings — silent (no noise). If `_no_push_check: true` in spec frontmatter — skip push for that file (red phase escape hatch).

**Связанные AC:** [AC-6.1](ACCEPTANCE_CRITERIA.md#ac-6-1), [AC-6.2](ACCEPTANCE_CRITERIA.md#ac-6-2), [AC-6.3](ACCEPTANCE_CRITERIA.md#ac-6-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-7: Phase 2 — Marksman LSP bundle install (silent, always)

System SHALL bundle Marksman LSP binary (per-platform, ~15MB) in dev-pomogator npm package and install silently to `.dev-pomogator/bin/marksman` during `npx dev-pomogator install`. If bundled binary missing for current platform — `postInstall` downloads from GitHub releases.

If install fails (no network, offline, unsupported platform) — install MUST NOT fail; Marksman marked unavailable in `.dev-pomogator/install-log.json`; MCP server falls back to custom JS-based MD LSP (subset features).

**Связанные AC:** [AC-7.1](ACCEPTANCE_CRITERIA.md#ac-7-1), [AC-7.2](ACCEPTANCE_CRITERIA.md#ac-7-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-7

## FR-8: Phase 3 — LLM-as-judge semantic drift check (opt-in)

System SHALL support opt-in semantic drift check via `claude` CLI subprocess (Haiku model). When `conformance_check(scope, semantic: true)` is called, MCP server spawns `claude -p "<prompt>"` with FR text + scenario Given/When/Then text. Subprocess output (JSON) parsed into `SEMANTIC_DRIFT` finding with severity + explanation when mismatch detected.

Default: semantic check DISABLED. User opt-in via `.spec-config.json::conformance_checks.semantic_drift.enabled = true` OR per-call `semantic: true` flag.

Results cached by `hash(fr_text + scenario_text)` — repeat calls return cached result without re-spawning subagent.

**Связанные AC:** [AC-8.1](ACCEPTANCE_CRITERIA.md#ac-8-1), [AC-8.2](ACCEPTANCE_CRITERIA.md#ac-8-2)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-8

## FR-9: Phase 3 — Multi-language BDD support (.NET/Python/Java)

System SHALL accept Cucumber Messages NDJSON from any language runner emitting canonical schema:
- C# / .NET: Reqnroll v3+ (`reqnroll_report.ndjson`)
- Python: `behave` with message formatter
- Java: Cucumber-JVM with `--plugin message:...`

NDJSON ingester is language-agnostic — relies on `@cucumber/messages` package which is canonical schema parser. Code reference extraction (`step_bindings`) uses runner-specific binding registry format (Reqnroll: in NDJSON `stepDefinition` envelopes; cucumber-js: same; behave: bridge layer reading `behave --tags-help` output).

**Связанные AC:** [AC-9.1](ACCEPTANCE_CRITERIA.md#ac-9-1), [AC-9.2](ACCEPTANCE_CRITERIA.md#ac-9-2)
**Use Case:** [UC-10](USE_CASES.md#uc-10)
**User Story:** US-9

## FR-10: Phase 4 — SQLite FTS5 cross-session persistent index

System SHALL OPTIONALLY (config-gated) persist SpecGraph index to `.dev-pomogator/.spec-index.sqlite` (SQLite WAL mode). When enabled:
- Multiple Claude Code sessions on same project share one MCP server (per `.mcp-lock.json`)
- Cold start: read pre-built index from SQLite (faster than rebuild from MDs)
- Single-writer enforced via `BEGIN IMMEDIATE` transaction wrapping
- SQLite corruption auto-fallback to in-memory rebuild + warning logged
- Schema migrations via `meta.schema_version` table

Default Phase 2: DISABLED (in-memory only). Phase 4: opt-in via `.spec-config.json::storage.sqlite_enabled = true`.

**Связанные AC:** [AC-10.1](ACCEPTANCE_CRITERIA.md#ac-10-1), [AC-10.2](ACCEPTANCE_CRITERIA.md#ac-10-2), [AC-10.3](ACCEPTANCE_CRITERIA.md#ac-10-3)
**Use Case:** [UC-7](USE_CASES.md#uc-7)
**User Story:** US-10

## FR-11: Phase 5 — Migration helper v3→v4

System SHALL provide CLI command `dev-pomogator migrate-v3-to-v4` with two modes:
- `--suggest-only`: print per-file diffs (heading conversions, frontmatter additions, anchor changes) WITHOUT modifying files
- Default (interactive): prompt approve/skip/edit per file; default `skip` if no input within 30s

Migration MUST:
- Convert legacy `### Requirement: FR-N <title>` → `### FR-N: <title>` (preserving content body)
- Create `.spec-config.json` with defaults if absent
- Predict tags for untagged `.feature` scenarios via naming heuristic (e.g., `Scenario: User logs in` → suggest `@FR-001` if FR-001 contains "login")
- Bump `.progress.json::version` from 3 to 4 ONLY when spec migration confirmed
- Backward compat preserved: legacy headings continue to work via triple-anchor registration

**Связанные AC:** [AC-11.1](ACCEPTANCE_CRITERIA.md#ac-11-1), [AC-11.2](ACCEPTANCE_CRITERIA.md#ac-11-2)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-12: Phase 6 — `architecture-research-workflow` skill (meta-deliverable)

System SHALL provide new skill `architecture-research-workflow` analogous to existing `research-workflow`. 7-stage flow: problem framing → external pain validation → broad research (calls `research-workflow` as primitive) → focused research + self-pushback → variant generation (≥3 architectures) → iterative decision locking → phased rollout → hand-off to `create-spec`.

Stage outputs written to `.specs/{slug}/.architecture-research/<N>-<stage>.md` (committable to git for audit trail). Stage 7 merges all outputs into final `RESEARCH.md` with one Appendix per stage.

`create-spec` skill MUST auto-invoke `architecture-research-workflow` instead of `research-workflow` when complexity heuristic triggers (user prompt contains "архитектур"/"v\d+"/"rebuild" OR ≥3 components detected). Heuristic OVERRIDABLE via explicit flag.

Recursion guard: arch-research Stage 7 sets `--research-done` flag in context; create-spec checks flag — if set, skips own research invocation (avoid infinite loop).

**Связанные AC:** [AC-12.1](ACCEPTANCE_CRITERIA.md#ac-12-1), [AC-12.2](ACCEPTANCE_CRITERIA.md#ac-12-2), [AC-12.3](ACCEPTANCE_CRITERIA.md#ac-12-3)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-12

## FR-13: Orphan resolution policy — warn-default, configurable

System SHALL detect two orphan classes during conformance_check:
- `SCENARIO_TAG_ORPHAN`: Scenario has `@FR-N`/`@NFR-N`/`@AC-N` tag but corresponding node doesn't exist in MD specs
- `UNTAGGED_SCENARIO`: Scenario has no `@FR-`/`@NFR-`/`@AC-` tags at all

Default severity for both: `warning` (NOT `error`, NOT block). Configurable per-orphan-class via `.spec-config.json::orphan_policy.{class_name}`: `warn|block|exempt`. Exemption list: `orphan_policy.exempt_scenarios: ["@no-fr-required", ...]`, `orphan_policy.exempt_paths: ["tests/infrastructure/**"]`.

**Связанные AC:** [AC-13.1](ACCEPTANCE_CRITERIA.md#ac-13-1), [AC-13.2](ACCEPTANCE_CRITERIA.md#ac-13-2)
**Use Case:** [UC-6](USE_CASES.md#uc-6)
**User Story:** US-13

## FR-14: Devcontainer / multi-env support (path conventions + watcher fallback)

System SHALL function correctly across environments: host (Win/Mac/Linux), VS Code devcontainer, WSL2, Hyper-V VM. Specifically:
- All file paths in MCP API responses ARE relative to `git rev-parse --show-toplevel` (never absolute, never container-internal-only)
- `chokidar` watcher auto-detects slow FS via touch test at startup (create temp file, await event ≤500ms); if event missed → enable polling mode (1s interval) + log decision
- `.mcp-lock.json` tags `env` field (e.g., `host`, `container:devcontainer-abc123`, `wsl:ubuntu`); second MCP server start on same worktree with different `env` → DENY with clear message
- `claude` CLI must be installed in each env where Claude Code runs (documented in onboard-repo flow)

**Связанные AC:** [AC-14.1](ACCEPTANCE_CRITERIA.md#ac-14-1), [AC-14.2](ACCEPTANCE_CRITERIA.md#ac-14-2), [AC-14.3](ACCEPTANCE_CRITERIA.md#ac-14-3)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-14

## FR-15: Phase 4 — Side-channel conformance log (persistent JSONL)

System SHALL append every conformance finding to persistent log `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`. Each line: `{ timestamp, finding_code, severity, location, message, spec_slug }`. Log files rotate when size >10MB (suffix `-<N>.jsonl`).

CLI `dev-pomogator spec-check-log [--since DURATION] [--grep PATTERN]` provides aggregated views (counts per FR, last occurrence timestamp, severity histogram).

Log is APPEND-ONLY (no in-place edits). Compatible with external analytics tools (`jq`, `grep`, ML pipelines).

**Связанные AC:** [AC-15.1](ACCEPTANCE_CRITERIA.md#ac-15-1), [AC-15.2](ACCEPTANCE_CRITERIA.md#ac-15-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-15

## FR-16: Phase 4 — GitHub Codespaces lifecycle support

System SHALL auto-start MCP server in Codespaces lifecycle via `postStartCommand` in `.devcontainer/devcontainer.json` (added by dev-pomogator install). Lock file `env` field MUST tag `codespaces:<machine-id>`.

Codespaces persistent `/workspaces/` volume MUST work without polling fallback (native FS events functional). MCP server resumes within 2s after Codespace hibernation/resume (in-memory rebuild from persistent files).

**Связанные AC:** [AC-16.1](ACCEPTANCE_CRITERIA.md#ac-16-1), [AC-16.2](ACCEPTANCE_CRITERIA.md#ac-16-2)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-16

## FR-17: Phase 7 — Cross-spec + impl reconciliation skill (`cross-spec-reconcile`)

System SHALL provide skill `cross-spec-reconcile` that scans ALL specs in `.specs/*/` plus actual implementation tree (`src/`, `extensions/`, `package.json`, `extensions/*/extension.json`) and emits structured findings to `.specs/{current_slug}/consistency-report.yaml`. Skill SHALL support two modes:

- `light` — mechanical-only checks (file existence, regex terminology drift, RUNTIME_IDENTIFIER_DRIFT via grep), budget ≤5s for 30-spec corpus.
- `full` — light + LLM-semantic pairwise FR/AC compare via Agent tool subagent (prompt template from skill `references/semantic-judge-prompt.md`). No time budget; caches per-pair sha256 content hash to avoid re-evaluation.

Skill SHALL be invoked from `create-spec` at three points: Phase 2 step 4d (mode=light), Phase 3 step 1c (mode=light), Phase 3+ Audit category CROSS_SPEC_CONSISTENCY (mode=full).

When CRITICAL findings exist — in `light` mode only for hard-conflict subset (`cross-spec/runtime-identifier-drift`, `cross-spec/module-ownership-conflict`, `cross-spec/contradictory-fr`), in `full` mode for all 28 finding codes that map to severity CRITICAL — skill SHALL emit a blocking AskUserQuestion with `header: "⚠️ CRIT"` (≤12 chars per AskUserQuestion schema) AND options listing each CRITICAL finding's spec_a/spec_b + message + suggested_fix. User MUST explicitly choose: «Fix now via /cross-spec-resolve» / «Acknowledge & override (logged)» / «Abort STOP». Override choice writes `acknowledged_by: user`, `override_reason: <text>`, `override_timestamp: <iso>` to YAML AND appends entry to `.claude/logs/cross-spec-overrides.jsonl` (mirror of existing `scope-gate/escape-hatch-audit.md` pattern).

WARNING/INFO findings SHALL be pushed to agent context as `<system-reminder>` aggregate (no blocking).

Skill SHALL produce secondary SARIF 2.1.0 output (`.specs/{slug}/consistency-report.sarif`) when `--sarif` flag passed or project config `.spec-config.json` `output_formats` includes `"sarif"` — for GitHub Code Scanning + IDE integration. Skill SHALL support `--dry-run` flag printing summary + first 10 findings to stdout WITHOUT writing YAML/SARIF.

Skill SHALL operate in degraded mode when SpecGraph + MCP server (Phase 1) unavailable: read `.specs/*/*.md` directly via `fs` + `remark` + `glob`.

**Связанные AC:** [AC-17.1](ACCEPTANCE_CRITERIA.md#ac-17-1), [AC-17.2](ACCEPTANCE_CRITERIA.md#ac-17-2), [AC-17.3](ACCEPTANCE_CRITERIA.md#ac-17-3), [AC-17.4](ACCEPTANCE_CRITERIA.md#ac-17-4), [AC-17.5](ACCEPTANCE_CRITERIA.md#ac-17-5), [AC-17.6](ACCEPTANCE_CRITERIA.md#ac-17-6), [AC-17.7](ACCEPTANCE_CRITERIA.md#ac-17-7), [AC-17.8](ACCEPTANCE_CRITERIA.md#ac-17-8)
**Use Case:** [UC-17](USE_CASES.md#uc-17), [UC-18](USE_CASES.md#uc-18)
**User Story:** US-17, US-18

## FR-18: Phase 7 — Cross-spec resolve skill (`cross-spec-resolve`)

System SHALL provide skill `cross-spec-resolve` invoked explicitly via `/cross-spec-resolve` (no auto-invocation from create-spec — explicit user action only). Skill SHALL execute the following 7-step flow:

1. Read `.specs/{slug}/consistency-report.yaml`; exit with hint «Run /cross-spec-reconcile first» if file absent.
2. Group findings by severity (CRITICAL → WARNING → INFO) and by category (cross-spec/* vs impl-drift/*); deduplicate by `code + spec_a + spec_b + location`.
3. For each finding requiring edit — BEFORE any Edit/Write — emit an explanation block containing 5 fields: (a) finding code + severity + class, (b) files to be modified with line ranges, (c) what will change in plain language, (d) WHY this fix follows from the finding message, (e) suggested options via AskUserQuestion: «Apply» / «Skip» / «Defer (logged with reason)».
4. For findings with mechanical fix (`impl-drift/missing-file`, `impl-drift/stale-reference`, `impl-drift/mcp-tool-drift`, `impl-drift/hook-registration-drift`) — apply via Edit/Write after AskUserQuestion confirm.
5. For `impl-drift/architectural-decision-vs-reality` and `impl-drift/duplicate-infrastructure` — present Path A/B/C alternatives via AskUserQuestion with trade-offs in `description` field of each option (Recommended / Current-spec / Custom).
6. For `cross-spec/stale-spec-outstanding-but-done` — propose patch to OTHER spec's README/CHANGELOG with explicit «⚠️ This edits foreign spec: .specs/{other-slug}/{file}» warning banner AND additional explicit confirm before applying.
7. After all findings processed (batch), invoke `Skill("cross-spec-reconcile", mode: "full")` to verify no new conflicts introduced; update each YAML finding's `resolution_status` field (`resolved` if code disappears from new report, `still_present` otherwise, `transformed` if code persists but spec_b changed).

Skill MUST NOT edit any file without explicit user confirm for that specific edit. Each foreign-spec edit (target path starts with `.specs/{other-slug}/`) requires a separate confirm distinct from the per-finding confirm.

**Связанные AC:** [AC-18.1](ACCEPTANCE_CRITERIA.md#ac-18-1), [AC-18.2](ACCEPTANCE_CRITERIA.md#ac-18-2), [AC-18.3](ACCEPTANCE_CRITERIA.md#ac-18-3), [AC-18.4](ACCEPTANCE_CRITERIA.md#ac-18-4), [AC-18.5](ACCEPTANCE_CRITERIA.md#ac-18-5)
**Use Case:** [UC-19](USE_CASES.md#uc-19), [UC-20](USE_CASES.md#uc-20), [UC-21](USE_CASES.md#uc-21)
**User Story:** US-19, US-20

---

## Out of Scope

### FR-OUT-1: Real-time spec collaborative editing (CRDT/OT) — OUT OF SCOPE

> OUT OF SCOPE — Phase 7+ consideration. v4 не покрывает многопользовательское одновременное редактирование одного spec файла (CRDT/OT). MCP per-worktree-per-env + git workflow считается достаточным для single-developer / async team scenarios. Real-time collab — отдельная фича, требует full server architecture (WebSocket / sync engine), несовместимая с stdio MCP.

### FR-OUT-2: GUI / web dashboard для просмотра графа — OUT OF SCOPE

> OUT OF SCOPE — v4 фокусируется на agent-facing MCP API + LSP integration в IDE. Standalone GUI/web viewer для browse SpecGraph — отдельная фича (можно сделать как opt-in CLI `dev-pomogator graph-server` запускающий read-only HTTP viewer, но не в core v4 scope).

### FR-OUT-3: Spec auto-generation from code (reverse engineering) — OUT OF SCOPE

> OUT OF SCOPE — v4 это spec-first инструмент (spec → code), не reverse-engineering (code → spec). Tools типа OpenLore (reverse-eng codebase to OpenSpec) — отдельная категория, может быть исследована в Phase 8+.
