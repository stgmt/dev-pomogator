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

## FR-7: Phase 2 — Marksman as a NATIVE Claude Code LSP plugin (auto-installed, no fallback)

> **Architecture decision (2026-06-04, supersedes the original "custom bridge" design).** Evidence this session: (a) the spec-graph already serves the AGENT (traceability + `[[…]]` resolution via registered anchors); (b) a custom Marksman BRIDGE in the MCP (`marksman-lsp/bridge.ts` + `md_references`) is the WRONG layer — Claude Code now has **native LSP support**; (c) Marksman resolves wiki-links by **full heading-text slug** (`[[note]]`→`# Note` ✓; `[[FR-1]]`→`## FR-1: Title` ✗ — `FR-1` is OUR alias). Verified live on Windows + Linux. The custom bridge / `md_references` / `skip-policy` / managed-hashes / js-fallback are **RETIRED** by this requirement.

**FR-7 (native LSP registration):** dev-pomogator SHALL register Marksman as a Claude Code LSP via the plugin's `.lsp.json` → generated `.claude-plugin/marketplace.json` `lspServers` block: `command` = the resolved Marksman binary, `args` = `["server"]`, `extensions` = `[".md"]`, `startupTimeout` (Claude Code ≥2.1.50). Claude Code (`ENABLE_LSP_TOOL=1`) SHALL spawn the server and expose its native tools (definition / references / **rename** / completion / hover / code-actions / file-ops) to the agent directly — NOT through a custom JSON-RPC bridge.

**FR-7a (AUTO-install the binary — no reliance on the user, no fallback):** dev-pomogator SHALL auto-install the Marksman binary itself (a `SessionStart` hook resolves it: PATH first, else managed download to `.dev-pomogator/bin/` with sha256 COMPUTED by `cli-update-hashes.ts`), then point the LSP `command` at the resolved path. The user SHALL NOT be required to install it. There is NO js-fallback navigation surface: when Marksman is genuinely unavailable (offline + unsupported platform), navigation features are simply absent with an actionable message — the system SHALL NOT fake a degraded MD-LSP.

**FR-7b (division of labour — LSP owns navigation/edit, graph owns spec-domain):** ALL markdown navigation/edit primitives over wiki-links SHALL be served by Marksman's native LSP tools, never reimplemented in custom code. The custom graph SHALL retain ONLY what an LSP has no concept of: spec-domain traceability (FR→AC→Scenario→Task→test coverage via `get_trace`/`get_coverage`), the honesty-gate (FR-32), conformance, and **broken-link detection** (the `wikilinks.ts` resolver stays as a CONFORMANCE check that flags unresolved `[[…]]`, NOT as a navigation fallback).

**FR-7c (wiki-link form — adopt the form Marksman resolves):** Specs currently use markdown links (`[AC-1.1](#ac-1-1)`), not live `[[wiki-links]]`. Marksman matches by full heading slug (proven). Specs SHALL adopt the form Marksman actually resolves — either short ID-only headings (`## FR-1` → slug `fr-1` → `[[FR-1]]` works) OR Marksman explicit-anchor syntax if supported. The chosen form SHALL be empirically confirmed (Marksman `completion` + `definition` at the LINK position) BEFORE migrating specs — migrating to a non-resolving form repeats «installed ≠ integrated» ([[dead-integration-guard]]).

**FR-7d (skill — how & why to use the markdown LSP):** dev-pomogator SHALL ship a skill (in the spec-generator plugin) teaching how and why to use the markdown LSP for spec navigation + refactor (Ctrl-click `[[…]]`, rename a requirement and propagate, jump to definition/references), installed to users as part of the plugin.

**Связанные AC:** [AC-7.1](ACCEPTANCE_CRITERIA.md#ac-7-1), [AC-7.2](ACCEPTANCE_CRITERIA.md#ac-7-2), [AC-7.3](ACCEPTANCE_CRITERIA.md#ac-7-3), [AC-7.4](ACCEPTANCE_CRITERIA.md#ac-7-4)
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

System SHALL provide CLI command `dev-pomogator migrate-v3-to-v4` with these modes:
- `--suggest-only`: print per-file diffs (heading conversions, frontmatter additions, anchor changes) WITHOUT modifying files
- Default (interactive): prompt approve/skip/edit per file; default `skip` if no input within 30s
- `--yes`: non-interactive auto-apply (CI/unattended escape hatch) — applies every conversion WITHOUT prompting. This is the only non-dry-run path that writes without per-file confirmation; the no-flag default MUST remain interactive.

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

## FR-19: Two-tier hook failure-mode policy (preserve v3 fail-open + harden hard-tier)

System SHALL apply a **two-tier failure policy** to PreToolUse hooks instead of a single «fail-open everywhere». A single-tier «all hooks fail-open» creates a bypass vector — an attacker crafts a `.md` whose content reliably crashes the hard guard's parser and thereafter enjoys an unprotected Write path on every file. Two-tier closes that hole while preserving v3 robustness:

- **Soft tier** — the 5 v3 form-guards (`user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`) and the meta-guard (`extension-json-meta-guard`): on ANY exception (parse error, missing file, runtime error), the hook MUST log `{ts, hook_id, file_path, error_message, error_stack}` to `~/.dev-pomogator/logs/form-guards.log` and exit 0 (allow operation through). Pattern preserved verbatim from v3 FR-10.
- **Hard tier** — the new `spec-conformance-guard` (FR-5): on STARTUP/config-load crash → exit 1 + write actionable error to stderr (broken install surfaces to user; user's Write tool blocked until the guard is repaired). On per-file CONTENT parse exception → append entry to spec-check-log JSONL (FR-15) AND exit 0 (user's Write proceeds — a single confused file does not DoS authoring).

Cross-phase note: hard-tier file-parse logging needs FR-15 JSONL writer. If FR-15 ships in Phase 4 but `spec-conformance-guard` ships in Phase 2, the writer SHALL be lifted to Phase 2 OR the hard tier SHALL fall back to `~/.dev-pomogator/logs/form-guards.log` (same schema as soft tier) until Phase 4. DESIGN.md «Hook failure-mode tiers» paragraph documents the chosen path.

**Связанные AC:** [AC-19.1](ACCEPTANCE_CRITERIA.md#ac-19-1), [AC-19.2](ACCEPTANCE_CRITERIA.md#ac-19-2), [AC-19.3](ACCEPTANCE_CRITERIA.md#ac-19-3)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-20: Author-facing conformance summary at prompt time (threshold-only + on-demand)

System SHALL surface conformance status to the spec author at prompt time **without** the noise of v3's «every prompt aggregate». Recommended combo (B3 + B4):

- **Threshold-only summary at `UserPromptSubmit`** — render a one-line summary ONLY when `unresolved_deny_events ≥ 1` since the author's last acknowledgment. State file `~/.dev-pomogator/state/last-summary-ack.json` tracks `{ack_timestamp, ack_event_count}`. Zero-noise default: if no unresolved events exist, the hook is silent.
- **On-demand pull via `/spec-status` skill** — author can always invoke `/spec-status` to see the full 24h aggregate regardless of threshold state. This is the explicit «show me everything» surface that replaces v3's blanket per-prompt aggregate.

NFR-Performance-6: prompt-time summary render SHALL complete ≤50ms p95. Reads from both `~/.dev-pomogator/logs/form-guards.log` (soft tier events) AND latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (hard tier events) — capped at last 1000 entries per file to bound scan cost.

DESIGN.md «Conformance summary surfacing» paragraph documents rejected alternatives B1 (every-prompt aggregate — latency cost) and B2 (deprecate-only — regression for users who rely on the v3 summary).

**Связанные AC:** [AC-20.1](ACCEPTANCE_CRITERIA.md#ac-20-1), [AC-20.2](ACCEPTANCE_CRITERIA.md#ac-20-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-21: `spec-status.ts -Format task-table` backward-compat contract

System SHALL preserve the v3 `spec-status.ts -Format task-table` CLI output as a STABLE PUBLIC CONTRACT. The output is a markdown table bounded by HTML comment markers (`<!-- auto-generated by spec-status.ts -Format task-table; do not edit manually -->` / `<!-- end auto-generated -->`); the `task-board-forms` skill, v3 spec workflow tooling, and third-party consumers depend on this exact shape.

Implementation MAY swap the underlying source (direct MD parse via `remark` vs MCP-routed `get_trace` from SpecGraph) at any minor version WITHOUT breaking the contract. The contract is enforced via a vitest fixture-based test:

- Fixture: `tools/specs-generator/__fixtures__/task-table.baseline.md`
- Test: `tools/specs-generator/__tests__/task-table-contract.test.ts` — generates output for a known input spec, diffs against the fixture, fails if shape changes.

Standalone CLI MUST work without the MCP server running (degraded mode: direct MD parse fallback, mirroring NFR-Reliability-7's pattern for `cross-spec-reconcile`).

**Связанные AC:** [AC-21.1](ACCEPTANCE_CRITERIA.md#ac-21-1)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-22: Version gate for `spec-conformance-guard` (mirror of v3 FR-9)

System SHALL gate `spec-conformance-guard` (FR-5) on the target spec's `.progress.json::version` field. If `version < 4` OR `version` is null/absent → guard exit 0 + log entry `{kind: "ALLOW_AFTER_MIGRATION", reason: "spec_version", target: <path>}` to spec-check-log JSONL.

Rationale: dev-pomogator users have 30+ legacy specs at versions 1, 2, 3. v4's new hard invariants (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN) were NOT enforced when those specs were authored. Without a version gate, the FR-5 hard guard would false-positive on legacy specs and DoS authoring until each one is migrated. The version gate is the same compatibility pattern v3 FR-9 used for v2→v3 transition.

The gate is bypassed (guard fires normally) ONLY when `.progress.json::version >= 4` — i.e., the spec was authored or migrated under v4 conventions.

**Связанные AC:** [AC-22.1](ACCEPTANCE_CRITERIA.md#ac-22-1)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11, US-13

## FR-23: Log-file inventory contract (two log files, intentionally not unified)

System SHALL preserve v3's `~/.dev-pomogator/logs/form-guards.log` AND introduce v4's `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (FR-15) as TWO DISTINCT log files with distinct schemas, retention, and consumers. DESIGN.md «Log file inventory» paragraph SHALL render this as a definitive table:

- `~/.dev-pomogator/logs/form-guards.log` — v3, kept; written by soft-tier hooks (FR-19); schema: text-line `{ts} {hook_id} {decision} {target} {message}`; retention: 30 days, 10MB cap, rotation via `validate-specs.ts` (v3 pattern preserved); consumer: `renderFormGuardsSummary()` (FR-20 threshold check + on-demand `/spec-status` skill).
- `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` — v4, new; written by hard-tier (FR-19) and conformance-check findings (FR-6); schema: JSON-per-line `{timestamp, finding_code, severity, location, message, spec_slug}`; retention: rotate at 10MB (FR-15); consumer: `dev-pomogator spec-check-log` CLI + analytics tooling.

The two log files are INTENTIONALLY NOT unified: different event taxonomies (form-validation decisions vs invariant findings), different consumers (legacy v3 summary vs new CLI analytics), different lifetimes. Schema migration tooling is out of scope.

**Связанные AC:** [AC-23.1](ACCEPTANCE_CRITERIA.md#ac-23-1)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6, US-15

## FR-24: Meta-guard preservation and extension for v4 manifest

System SHALL preserve v3's `extension-json-meta-guard.ts` (the PreToolUse hook that denies removal of form-guard registrations from `extension.json`) AND extend its protection scope to cover v4's `plugin.json` MCP-tool registrations.

Specifically, the meta-guard SHALL DENY any Write/Edit on `extension.json` OR `plugin.json` that removes:
- Any of the 5 v3 form-guard hook entries (`*-form-guard.ts` / `*-guard.ts` patterns)
- The new `spec-conformance-guard` (FR-5) registration
- The new MCP server `dev-pomogator-specs` tool registrations (FR-4 — `get_trace`, `find_by_tags`, `conformance_check`, etc.)
- The meta-guard's own registration (self-protection invariant)

Tampering attempts SHALL be logged to `.dev-pomogator/logs/meta-guard.log`. NFR-Security-2 references this FR as its concrete instantiation.

**Связанные AC:** [AC-24.1](ACCEPTANCE_CRITERIA.md#ac-24-1)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-25: canonical plugin SHALL ship a complete static hooks.json (additive union, nothing dropped)

In the v2.0 canonical distribution dev-pomogator ships its own static `.claude-plugin/hooks.json` (aggregated hook declarations loaded by Claude Code directly) — there is NO install-time edit/merge of the user's `plugin.json` (that was the deprecated v1/npm model). The additive invariant therefore applies to the **shipped manifest**: it SHALL be the complete union of protective + v4 hooks, never a replacement that silently drops protection.

- The shipped `.claude-plugin/hooks.json` SHALL declare the protective hook entries (the plan-gate / phase-gate / build-guard / test-guard family) ALONGSIDE the v4 spec hooks (FR-5 `spec-conformance-guard`, FR-6 `spec-conformance-push`, `bash-post-test/ingest`).
- A v4 hook added to the manifest SHALL NOT remove or overwrite a pre-existing protective hook entry in the same event array — additions are additive within each event.
- `length(hooks.PreToolUse) ≥ 1` AND `length(hooks.PostToolUse) ≥ 1` — the spec hooks ship alongside the existing ones. Verified against the real `.claude-plugin/hooks.json` (SPECGEN004_52).

Rationale: a naive «overwrite hooks array» (or a manifest regenerated from scratch) silently drops protection and creates a window of unprotected authoring until users notice. FR-25 keeps the additive-union invariant explicit and enforceable on the static manifest the canonical plugin actually ships.

**Связанные AC:** [AC-25.1](ACCEPTANCE_CRITERIA.md#ac-25-1), [AC-25.2](ACCEPTANCE_CRITERIA.md#ac-25-2)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-26: LLM-as-judge content boundary (deny-list + per-spec opt-out)

System SHALL apply a content boundary to `claude -p` subprocess invocations triggered by FR-8 (semantic drift check). The subprocess prompt SHALL NOT include text from any file or FR/scenario body that matches the deny-list:

- File-name deny-list: `.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `*secret*`
- Body-content deny-list (regex, case-insensitive): `\bAPI[_-]?KEY\b`, `\bBEARER\s+[A-Za-z0-9._-]+`, `\bSECRET[_-]?KEY\b`, `\b(PRIVATE|RSA)\s+KEY\b`, `\bPASSWORD\s*[:=]`, `\bTOKEN\s*[:=]\s*[A-Za-z0-9._-]{16,}`

WHEN any input to FR-8 matches a deny pattern THEN subprocess invocation SHALL be SKIPPED + a warning logged to spec-check-log JSONL with code `SEMANTIC_CHECK_SKIPPED_DENY_LIST`. The finding is NEVER reported as a missing drift signal (no false claim of «no drift detected» when content was skipped).

Per-spec opt-out: a spec MAY set frontmatter `spec_llm_judge_deny: true` to FORCE skip regardless of content (paranoid mode for specs known to contain mixed sensitive material). Opt-IN is impossible — there is no «allow-list override» for deny-list matches.

NFR-Security-7 captures this as a security NFR; this FR captures the behavioral contract.

**Связанные AC:** [AC-26.1](ACCEPTANCE_CRITERIA.md#ac-26-1), [AC-26.2](ACCEPTANCE_CRITERIA.md#ac-26-2)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-8

## FR-27: Marksman LSP supply-chain verification (sha256 against pinned hash)

System SHALL verify the integrity of every Marksman LSP binary downloaded during `postInstall` (FR-7). The verification flow:

1. `package.json` ships a `marksmanHashes` object mapping `{platform, arch, version}` → `sha256` hex string (or alternatively a sibling `marksman-hashes.json` for verbosity).
2. After download, `postInstall` computes the downloaded file's sha256 and compares to the pinned hash for the current platform/arch/version.
3. Mismatch → install ABORTS with explicit error `Marksman binary sha256 mismatch — expected <pinned>, got <actual>. Refusing to install untrusted binary.` AND the downloaded file is deleted.
4. The hash list MAY be updated only via an explicit `dev-pomogator update-marksman-hashes` CLI that requires the maintainer to provide the new Marksman release version + sha256 from the upstream GitHub release.

Mitigation context: `npm install` running arbitrary binaries from third-party GitHub releases is a known supply-chain hole. FR-27 closes it for our specific dependency. NFR-Security-8 references this FR.

**Связанные AC:** [AC-27.1](ACCEPTANCE_CRITERIA.md#ac-27-1)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-7

## FR-28: PostToolUse throttle semantics — fixed-window, not sliding/debounce

System SHALL implement the FR-6 PostToolUse 3-second throttle as a **fixed window** (NOT sliding, NOT debounce). Semantics:

- WHEN the first qualifying Write/Edit fires at time `t0` THEN a window opens `[t0, t0 + throttle_ms]`.
- Subsequent qualifying events at `t0 + δ` where `δ < throttle_ms` are batched into the current window.
- At `t0 + throttle_ms`, the window closes; aggregated findings push to agent context once; the throttle resets.
- A new event at `t0 + throttle_ms + ε` opens a NEW window starting at that timestamp.

Rationale: predictable latency upper-bound for the author (worst case: change visible after `throttle_ms` from the first edit in a burst, never longer). Sliding-window or debounce semantics could indefinitely defer push during continuous edits — the author waits forever for feedback during a long edit session.

NFR-Performance-7 documents the latency invariant.

**Связанные AC:** [AC-28.1](ACCEPTANCE_CRITERIA.md#ac-28-1)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-29: Builder SHALL wire `implements` edges + `File` nodes from FILE_CHANGES.md and DESIGN.md

System SHALL parse `FILE_CHANGES.md` tables (columns: `Path | Action | Reason`) in each spec dir AND `DESIGN.md` "Где код" / "App-код" sections to emit into SpecGraph:

- 1 `File` node per unique referenced path (deduplicated across both sources)
- 1 `implements` edge from each FR to its corresponding File node, where the FR↔file linkage is established via:
  - `Reason` column citing `FR-N` (regex `\bFR-\d+\b`), OR
  - Task `refs[]` containing FR-N whose `files[]` includes that path, OR
  - DESIGN.md section citing FR-N adjacent to a file path
- Edge metadata: `{ file_path: <repo-relative>, source_section: 'FILE_CHANGES' | 'DESIGN', action?: 'create' | 'edit' | 'delete' }`

Existing `types.ts` declarations for `EdgeType='implements'` and `NodeType='File'` remain authoritative — this FR only wires `builder.ts` to emit them. Glob patterns in `Path` (e.g. `tools/spec-graph/*.ts`) SHALL be skipped with a single warn-once log entry per build; no implements edge is created for unresolved patterns.

**Связанные AC:** [AC-29.1](ACCEPTANCE_CRITERIA.md#ac-291-fr-29), [AC-29.2](ACCEPTANCE_CRITERIA.md#ac-292-fr-29), [AC-29.3](ACCEPTANCE_CRITERIA.md#ac-293-fr-29)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-17

## FR-30: MCP `get_trace` response SHALL surface `code_impl[]` per node

System SHALL extend the `get_trace` tool response shape to include `code_impl[]` per returned node — an array of `{ file_path, action?, source_section }` entries derived from FR-29 `implements` edges:

- **FR node** → `code_impl` = all File nodes connected by `implements` edge (direct).
- **AC node** → `code_impl` inherits parent FR's `code_impl` transitively (same entries).
- **Scenario node** → `code_impl` = StepBinding file paths ∪ parent FR's `code_impl` (deduplicated by `file_path`).
- **Task node** → `code_impl` = task `files[]` ∪ parent FR's `code_impl` (deduplicated).

If no `implements` edges exist for a node, `code_impl` SHALL be present as an empty array `[]` (not omitted) — preserves stable shape for clients.

**Зависит от:** FR-29 (no `implements` edges → `code_impl = []` for all FR/AC nodes; Scenario/Task still surface bindings/refs).
**Связанные AC:** [AC-30.1](ACCEPTANCE_CRITERIA.md#ac-301-fr-30), [AC-30.2](ACCEPTANCE_CRITERIA.md#ac-302-fr-30)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-18

## FR-31: Test corpus SHALL include real multi-language NDJSON fixtures + e2e roundtrip

System SHALL ship 3 fixture directories under `tests/fixtures/` with REAL Cucumber Messages NDJSON output produced by actual test runners (NOT synthetic inline strings):

- `tests/fixtures/reqnroll-sample/output.ndjson` — from a minimal Reqnroll project (.NET) with 1 scenario `PASSED` + 1 `FAILED`
- `tests/fixtures/behave-sample/output.ndjson` — from a minimal `behave` project (Python) with same coverage
- `tests/fixtures/jvm-sample/output.ndjson` — from a minimal Cucumber-JVM project (Java/Maven) with same coverage

Each fixture directory SHALL include a `README.md` documenting the exact runner command + version used to regenerate the fixture (reproducibility).

System SHALL also ship `tests/e2e/multilang-ingest-roundtrip.test.ts` that for each fixture:

1. Calls `detectRunner(fixture)` → asserts expected runner string (`reqnroll` / `behave` / `cucumber-jvm`).
2. Calls `parseNdjson(fixture)` → asserts ≥2 scenarios with at least one `PASSED` + one `FAILED`.
3. Ingests into SpecGraph via builder on a synthetic fixture spec, then invokes MCP `get_trace` for a known FR.
4. Asserts response `scenarios[].lastResult` matches per-language expectations AND `get_test_result` tool returns the same statuses.

Does NOT depend on FR-29 / FR-30 — purely test infrastructure; can ship independently.

**Связанные AC:** [AC-31.1](ACCEPTANCE_CRITERIA.md#ac-311-fr-31), [AC-31.2](ACCEPTANCE_CRITERIA.md#ac-312-fr-31)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-19

## FR-32: Task status SHALL be evidence-derived from the latest test run, with a honesty gate

System SHALL derive each task's effective status from the latest BDD/test run (`.dev-pomogator/.last-test-run.ndjson`) instead of trusting the hand-authored `Status:` field, by mapping each task to its scenarios via the task's `@featureN` / `SPECGEN004_NN` references and FR `refs[]`:

- A task's `verified_status` SHALL be `DONE` only when EVERY mapped scenario is `PASSED` in the latest run.
- If any mapped scenario is `pending` / `undefined` / `ambiguous` / `failed`, `verified_status` SHALL be capped at `IN_PROGRESS` (never `DONE`).
- A task with no mapped scenarios SHALL fall back to its hand-set status flagged `verified_status = "unverified"`.

System SHALL emit conformance finding `TASK_STATUS_UNVERIFIED` (severity WARNING) WHEN a task's hand-set `Status: DONE` conflicts with a `verified_status < DONE` — the honesty gate. The finding `suggestions[]` SHALL name the offending scenario(s) and their bucket. `spec-status.ts -Format task-table` SHALL render `verified_status` (not the raw field) so the summary table cannot claim DONE without green scenarios.

This codifies the manual discipline applied during the 2026-06-02 coverage audit (no task DONE while its BDD scenario is pending/undefined/ambiguous) into the spec-generator itself, removing the human as the enforcement point.

**Зависит от:** FR-2 (SpecGraph task↔scenario edges), FR-13 (conformance findings), FR-30 (MCP node surface). Surfaced via MCP `get_coverage` (per-scenario buckets + per-task derived status) and `get_trace` (`verified_status` per node).
**Связанные AC:** [AC-32.1](ACCEPTANCE_CRITERIA.md#ac-321-fr-32), [AC-32.2](ACCEPTANCE_CRITERIA.md#ac-322-fr-32), [AC-32.3](ACCEPTANCE_CRITERIA.md#ac-323-fr-32)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-20

## FR-33: System SHALL provide a thin workflow-orchestrator skill over the feature map, with a self-improving merge ledger

System SHALL ship a skill `spec-generator-orchestrator` (architecture: **thin orchestrator + existing workers**) that owns ONLY the feature-map and the routing/sequencing of the end-to-end workflow (scaffold → conformance → coverage → reconcile → resolve → honesty-gate). It SHALL delegate every unit of work to existing workers and SHALL NOT re-implement worker logic (reuse per repo rules):

- Worker skills: `create-spec` (authoring phases), `cross-spec-reconcile` / `cross-spec-resolve`, `spec-backlog` resolvers, `architecture-research-workflow`.
- Worker MCP tools: `get_trace`, `get_coverage`, `get_test_result`, `find_orphans`, conformance guard/push hooks.
- Workers MAY run as isolated sub-agents for parallelism (mirrors the spec-backlog dispatch pattern).

System SHALL maintain a self-improving ledger `.specs/<slug>/SELF_IMPROVE.md` under a human-merge gate:

- During any run, on detecting friction/gap/idea, the orchestrator SHALL append a DATED entry `{date, trigger, observation, proposed_change, affected_files[], confidence, status: "pending"}`.
- A `pending` entry SHALL NEVER be auto-applied to spec or code.
- At session start (and on demand) WHEN ≥1 `pending` entries exist, the orchestrator SHALL surface a reminder (count + top entries) so they are not forgotten.
- WHEN the human marks an entry `approved`, the orchestrator MAY auto-apply it (convert to FR/task or apply the change) and SHALL set `status: "applied"` with an applied-at date.
- The ledger SHALL reuse `suggest-rules` / `self-improving` / `/reflect` mechanics (cross-link), not duplicate them.

A drift guard SHALL fail WHEN a new MCP tool / worker skill / FR exists that the orchestrator feature-map does not reference — applying the FR-32 honesty discipline to the orchestrator itself.

**Зависит от:** FR-4 (MCP tools), FR-32 (coverage/honesty surface consumed by the orchestrator), FR-17/FR-18 (cross-spec workers), FR-11 (migrate worker). Workers are existing skills/tools — no logic duplication.
**Связанные AC:** [AC-33.1](ACCEPTANCE_CRITERIA.md#ac-331-fr-33), [AC-33.2](ACCEPTANCE_CRITERIA.md#ac-332-fr-33), [AC-33.3](ACCEPTANCE_CRITERIA.md#ac-333-fr-33), [AC-33.4](ACCEPTANCE_CRITERIA.md#ac-334-fr-33), [AC-33.5](ACCEPTANCE_CRITERIA.md#ac-335-fr-33)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-21

---

## Out of Scope

### FR-OUT-1: Real-time spec collaborative editing (CRDT/OT) — OUT OF SCOPE

> OUT OF SCOPE — Phase 7+ consideration. v4 не покрывает многопользовательское одновременное редактирование одного spec файла (CRDT/OT). MCP per-worktree-per-env + git workflow считается достаточным для single-developer / async team scenarios. Real-time collab — отдельная фича, требует full server architecture (WebSocket / sync engine), несовместимая с stdio MCP.

### FR-OUT-2: GUI / web dashboard для просмотра графа — OUT OF SCOPE

> OUT OF SCOPE — v4 фокусируется на agent-facing MCP API + LSP integration в IDE. Standalone GUI/web viewer для browse SpecGraph — отдельная фича (можно сделать как opt-in CLI `dev-pomogator graph-server` запускающий read-only HTTP viewer, но не в core v4 scope).

### FR-OUT-3: Spec auto-generation from code (reverse engineering) — OUT OF SCOPE

> OUT OF SCOPE — v4 это spec-first инструмент (spec → code), не reverse-engineering (code → spec). Tools типа OpenLore (reverse-eng codebase to OpenSpec) — отдельная категория, может быть исследована в Phase 8+.

## FR-001: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:31** — `WHEN a spec file contains heading `### FR-001: Login` THEN the custom MD parser `
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:31** — `WHEN a spec file contains heading `### FR-001: Login` THEN the custom MD parser `
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:36** — `WHEN a legacy v3 spec contains heading `### Requirement: FR-001 Login` THEN the `
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:36** — `WHEN a legacy v3 spec contains heading `### Requirement: FR-001 Login` THEN the `
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:41** — `WHEN a wiki-link `[[FR-001]]` is encountered in any spec file AND FR-001 is defi`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:41** — `WHEN a wiki-link `[[FR-001]]` is encountered in any spec file AND FR-001 is defi`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:41** — `WHEN a wiki-link `[[FR-001]]` is encountered in any spec file AND FR-001 is defi`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:46** — `WHEN `get_trace("FR-001")` is called AND FR-001 exists THEN the response SHALL c`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:46** — `WHEN `get_trace("FR-001")` is called AND FR-001 exists THEN the response SHALL c`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:51** — `WHEN `get_trace("FR-001")` is called AND linked Scenario SCEN-login-locked has l`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:56** — `IF the agent attempts Write that introduces a second `### FR-001: ...` heading (`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:56** — `IF the agent attempts Write that introduces a second `### FR-001: ...` heading (`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:96** — `WHEN `conformance_check(scope: "FR-001", semantic: true)` is called AND FR text `
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:121** — `WHEN session A makes spec edits AND session B calls `get_trace("FR-001")` immedi`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:166** — `WHEN dev-pomogator v4 runs inside a VS Code devcontainer (bind-mounted workspace`


## FR-999: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:156** — `WHEN a `.feature` file contains Scenario tagged `@FR-999` AND FR-999 does not ex`
- **.specs\spec-generator-v4\ACCEPTANCE_CRITERIA.md:31:156** — `WHEN a `.feature` file contains Scenario tagged `@FR-999` AND FR-999 does not ex`

## FR-05: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\CHANGELOG.md:278:278** — `- **`impl-drift/missing-test` HIGH FN** — `@feature05` produced `FR-05``

## FR-01: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\RESEARCH.md:538:538** — `| FR не существует (typo: FR-01 вместо FR-001) | Fuzzy match по Levenshtein-dist`


## FR-005: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\RESEARCH.md:538:750** — `"explanation_for_agent": "FR-001 — login requirement. 2 AC (AC-3, AC-7), 3 Gherk`
- **.specs\spec-generator-v4\RESEARCH.md:538:756** — `"related_nodes": [{ "id": "FR-005", "reason": "shares tag" }]`


## FR-99: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\RESEARCH.md:538:542** — `| FR с broken refs внутри (refs FR-99 несуществующий) | Include + `internal_brok`
- **.specs\spec-generator-v4\RESEARCH.md:538:552** — `| Scenario с `@FR-99` тэгом на несуществующий FR | `ORPHAN_SCENARIO_TAG` |`
- **.specs\spec-generator-v4\RESEARCH.md:538:667** — `"issue": "Task references FR-99 which doesn't exist in any spec",`
- **.specs\spec-generator-v4\RESEARCH.md:538:668** — `"evidence": { "refs_field": "FR-99", "available_frs": ["FR-1","FR-2","FR-9"] },`
- **.specs\spec-generator-v4\RESEARCH.md:538:670** — `{ "action": "rename_ref", "from": "FR-99", "to": "FR-9", "confidence": 0.7,`

## FR-003: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\USE_CASES.md:93:155** — `- Agent (working on FR-003) calls `get_trace("FR-003")` → response includes fres`
- **.specs\spec-generator-v4\USE_CASES.md:93:155** — `- Agent (working on FR-003) calls `get_trace("FR-003")` → response includes fres`


## FR-007: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\USE_CASES.md:93:93** — `- Later: defines FR-007 in `FR.md`, adds `@FR-007` tag to scenario`
- **.specs\spec-generator-v4\USE_CASES.md:93:93** — `- Later: defines FR-007 in `FR.md`, adds `@FR-007` tag to scenario`


## FR-008: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\spec-generator-v4\USE_CASES.md:93:139** — `- Hook DENIES with response: `permissionDecision: "deny"`, `permissionDecisionRe`
- **.specs\spec-generator-v4\USE_CASES.md:93:140** — `- Agent sees DENY in tool result, regenerates with FR-008`
