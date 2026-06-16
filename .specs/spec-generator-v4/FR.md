# Functional Requirements (FR)

## FR-1

**Phase 0 — Cucumber-JS BDD migration with canonical NDJSON output**

System SHALL migrate dev-pomogator's own BDD tests from vitest pseudo-BDD (`.feature` as documentation only) to real `@cucumber/cucumber` runner that emits Cucumber Messages NDJSON to `.dev-pomogator/.last-test-run.ndjson` by default.

Target TS projects installing dev-pomogator v4 MUST also adopt cucumber-js BDD additively (existing vitest unit tests untouched, both test suites run in CI). Non-TS target projects (.NET/Python/Java) continue with their native NDJSON-emitting runners (Reqnroll/behave/Cucumber-JVM) — covered in Phase 3.

**Связанные AC:** [AC-1.1](ACCEPTANCE_CRITERIA.md#ac-11), [AC-1.2](ACCEPTANCE_CRITERIA.md#ac-12), [AC-1.3](ACCEPTANCE_CRITERIA.md#ac-13)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-1

## FR-2

**Phase 1 — In-memory SpecGraph builder**

System SHALL build an in-memory `SpecGraph` from `.specs/**/*.md` + `**/*.feature` + `.dev-pomogator/.last-test-run.ndjson` on MCP server startup and incrementally update on file changes (via `chokidar` with polling fallback). Graph nodes: FR/NFR/AC/SCEN/TASK/USECASE/RISK/File. Edges: `refs`, `covers`, `tested-by`, `tagged-by`, `implements`, `last-result`.

Cold-start rebuild time MUST be ≤2s for 30 specs (NFR-Performance). Incremental update on single-file change MUST be ≤100ms p95.

**Связанные AC:** [AC-2.1](ACCEPTANCE_CRITERIA.md#ac-21), [AC-2.2](ACCEPTANCE_CRITERIA.md#ac-22)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-2

## FR-3

**Phase 1 — Custom MD parser with dual-anchor + backward compat**

System SHALL parse spec headings via configurable regex `anchor_patterns` and register each FR/NFR/AC/SCEN/TASK/UC heading under **multiple anchor aliases** (Marksman-native slug + compact ID):
- `### FR-001: Login` → anchors `fr-001-login` AND `FR-001`
- Legacy `### Requirement: FR-001 Login` → anchors `requirement-fr-001-login`, `fr-001-login`, `FR-001`

All aliases resolve to the same heading. Wiki-link `[[FR-001]]` and `[[fr-001-login]]` MUST navigate identically. Legacy v3 anchors MUST continue working (no breaking change).

**Связанные AC:** [AC-3.1](ACCEPTANCE_CRITERIA.md#ac-31), [AC-3.2](ACCEPTANCE_CRITERIA.md#ac-32), [AC-3.3](ACCEPTANCE_CRITERIA.md#ac-33)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-3

## FR-4

**Phase 2 — MCP server with `get_trace(node_id)` primary tool**

System SHALL expose MCP server `dev-pomogator-specs` with 11 tools (see `SCHEMA.md`). Primary tool `get_trace(node_id)` returns BOTH:
- Structured tree (`acceptance_criteria[], scenarios[], tasks[], code_impl[], related_nodes[]`)
- Natural-language `explanation_for_agent` field summarizing context in ≤500 chars (FR title, counts, latest test status, failing step + error location if applicable)

Agent MUST be able to use response without follow-up file Read operations for the queried node.

**Связанные AC:** [AC-4.1](ACCEPTANCE_CRITERIA.md#ac-41), [AC-4.2](ACCEPTANCE_CRITERIA.md#ac-42)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-2, US-4

## FR-5

**Phase 2 — PreToolUse HARD hooks for syntax invariants**

System SHALL install PreToolUse hook `spec-conformance-guard` that DENIES Write/Edit on `.specs/**/*.md` or `**/*.feature` when content violates HARD invariants:
- `DUPLICATE_DEFINITION`: two `### FR-N:` headings with same ID
- `MALFORMED_FRONTMATTER`: YAML frontmatter syntax error
- `MALFORMED_GHERKIN`: `.feature` file gherkin parse error
- `INVALID_ANCHOR_PATTERN`: heading matches `anchor_patterns` regex but produces empty anchor

DENY response MUST include `permissionDecisionReason` with location + actionable hint.

**Связанные AC:** [AC-5.1](ACCEPTANCE_CRITERIA.md#ac-51), [AC-5.2](ACCEPTANCE_CRITERIA.md#ac-52), [AC-5.3](ACCEPTANCE_CRITERIA.md#ac-53)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-6

**Phase 2 — PostToolUse always-push conformance with 3s throttle**

System SHALL install PostToolUse hook that fires on Write/Edit matching `.specs/**/*.md` or `**/*.feature`. Hook:
1. Triggers incremental reindex of affected file (target ≤100ms p95)
2. Runs `conformance_check(scope: affected_node_ids)`
3. Aggregates findings within a 3-second throttle window (configurable via `post_tool_use.throttle_ms`)
4. After window closes, injects deduplicated findings as `<system-reminder>` into agent context

If 0 findings — silent (no noise). If `_no_push_check: true` in spec frontmatter — skip push for that file (red phase escape hatch).

**Связанные AC:** [AC-6.1](ACCEPTANCE_CRITERIA.md#ac-61), [AC-6.2](ACCEPTANCE_CRITERIA.md#ac-62), [AC-6.3](ACCEPTANCE_CRITERIA.md#ac-63)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-7

**Phase 2 — Marksman as a NATIVE Claude Code LSP plugin (auto-installed, no fallback)**

> **Architecture decision (2026-06-04, supersedes the original "custom bridge" design).** Evidence this session: (a) the spec-graph already serves the AGENT (traceability + `[[…]]` resolution via registered anchors); (b) a custom Marksman BRIDGE in the MCP (`marksman-lsp/bridge.ts` + `md_references`) is the WRONG layer — Claude Code now has **native LSP support**; (c) Marksman resolves wiki-links by **full heading-text slug** (`[[note]]`→`# Note` ✓; `[[FR-1]]`→`## FR-1: Title` ✗ — `FR-1` is OUR alias). Verified live on Windows + Linux. The custom bridge / `md_references` / `skip-policy` / managed-hashes / js-fallback are **RETIRED** by this requirement.

**FR-7 (native LSP registration):** dev-pomogator SHALL register Marksman as a Claude Code LSP via the plugin's `.lsp.json` (referenced from `plugin.json` `"lspServers": "./.lsp.json"`): one server `marksman` with `command` resolving to the binary (a `node` launcher shim `tools/marksman-installer/launch-marksman.cjs` that execs the resolved binary `marksman server` over inherited stdio — cross-platform, no PATH mutation, mirrors `.mcp.json`'s `node` pattern), `args` = `["server"]`, **`extensionToLanguage` = `{".md": "markdown"}`** (confirmed field name per the Claude Code plugins-reference — NOT `extensions`), optional `startupTimeout`. Once the plugin registers the server, Claude Code's native **`LSP` tool** (agent-callable: definition / references / **rename** / hover / documentSymbol / implementations / call-hierarchy, plus ambient diagnostics — confirmed in the tools-reference, permission "No") exposes Marksman's primitives to the agent directly — NOT through a custom JSON-RPC bridge. There is **no `ENABLE_LSP_TOOL` env flag** (the original spec premise was wrong); the `LSP` tool simply activates when a code-intelligence plugin registers a server.

**FR-7a (AUTO-install the binary — no reliance on the user, no fallback):** dev-pomogator SHALL auto-install the Marksman binary itself (a `SessionStart` hook resolves it: PATH first, else managed download to `.dev-pomogator/bin/` with sha256 COMPUTED by `cli-update-hashes.ts`), then point the LSP `command` at the resolved path. The user SHALL NOT be required to install it. There is NO js-fallback navigation surface: when Marksman is genuinely unavailable (offline + unsupported platform), navigation features are simply absent with an actionable message — the system SHALL NOT fake a degraded MD-LSP.

**FR-7b (division of labour — LSP owns navigation/edit, graph owns spec-domain):** ALL markdown navigation/edit primitives over wiki-links SHALL be served by Marksman's native LSP tools, never reimplemented in custom code. The custom graph SHALL retain ONLY what an LSP has no concept of: spec-domain traceability (FR→AC→Scenario→Task→test coverage via `get_trace`/`get_coverage`), the honesty-gate (FR-32), conformance, and **broken-link detection** (the `wikilinks.ts` resolver stays as a CONFORMANCE check that flags unresolved `[[…]]`, NOT as a navigation fallback).

**FR-7c (reference form — what Marksman actually resolves):** Specs use markdown anchor links (`[AC-1.1](#ac-11)`), not live `[[wiki-links]]`. **EMPIRICALLY MEASURED against the real binary (2026-06-04), correcting an earlier over-generalisation:**

- **Bare `[[X]]` targets a DOCUMENT**, not an H2 heading — it resolves to a note whose H1 title (or filename) is `X`. The earlier `[[Note]] → # Note` result was *document/H1* resolution (`# Note` is the file's title), wrongly generalised to "`[[FR-1]]` resolves `## FR-1`". It does NOT.
- **To reach an H2 heading, the reference carries `#<slug>`:** `[text](#<slug>)` (markdown), `[[#Heading]]` (same-doc), or `[[doc#Heading]]` (cross-doc). Marksman matches by the heading's FULL-text slug.
- A link to the **existing full slug resolves the titled heading** — `[x](#fr-7-phase-2-title-here)` → `## FR-7: Phase 2 — Title Here` ✓ (so navigation is fixable link-side, no heading rename).
- **Short ID-only headings also resolve:** `## FR-7` (slug `fr-7`) ← `[x](#fr-7)` ✓ — but this DROPS the title from the heading and (for `## AC-N.M (FR-K)`) the parent-FR linkage the parser uses to build the `covers` edge.
- **Custom anchors `{#fr-7}` do NOT work** — Marksman parses them as a "Tag" symbol, but `#fr-7` references stay unresolved.

So the value is **editor-only** (human Ctrl-click in VS Code); the graph already resolves `[[FR-1]]`/`AC-N` for the agent via its own dual-anchor `definitions` (`wikilinks.ts`, FR-3). Any spec migration is a **separate, scoped task** with a real fork — short headings (lossy: title + AC↔FR linkage leave the heading, shared parser must change for all 45 specs) vs. rewriting link anchors to the real per-heading slug (non-lossy, no parser change, but needs Marksman's exact slug algorithm). Picking a form that does NOT resolve is forbidden ([[dead-integration-guard]]).

**FR-7d (skill — how & why to use the markdown LSP):** dev-pomogator SHALL ship a skill (in the spec-generator plugin) teaching how and why to use the markdown LSP for spec navigation + refactor (Ctrl-click `[[…]]`, rename a requirement and propagate, jump to definition/references), installed to users as part of the plugin.

**Связанные AC:** [AC-7.1](ACCEPTANCE_CRITERIA.md#ac-71), [AC-7.2](ACCEPTANCE_CRITERIA.md#ac-72), [AC-7.3](ACCEPTANCE_CRITERIA.md#ac-73), [AC-7.4](ACCEPTANCE_CRITERIA.md#ac-74), [AC-7.5](ACCEPTANCE_CRITERIA.md#ac-75)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-7

## FR-8

**Phase 3 — LLM-as-judge semantic drift check (opt-in)**

System SHALL support opt-in semantic drift check via `claude` CLI subprocess (Haiku model). When `conformance_check(scope, semantic: true)` is called, MCP server spawns `claude -p "<prompt>"` with FR text + scenario Given/When/Then text. Subprocess output (JSON) parsed into `SEMANTIC_DRIFT` finding with severity + explanation when mismatch detected.

Default: semantic check DISABLED. User opt-in via `.spec-config.json::conformance_checks.semantic_drift.enabled = true` OR per-call `semantic: true` flag.

Results cached by `hash(fr_text + scenario_text)` — repeat calls return cached result without re-spawning subagent.

**Связанные AC:** [AC-8.1](ACCEPTANCE_CRITERIA.md#ac-81), [AC-8.2](ACCEPTANCE_CRITERIA.md#ac-82)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-8

## FR-9

**Phase 3 — Multi-language BDD support (.NET/Python/Java)**

System SHALL accept Cucumber Messages NDJSON from any language runner emitting canonical schema:
- C# / .NET: Reqnroll v3+ (`reqnroll_report.ndjson`)
- Python: `behave` with message formatter
- Java: Cucumber-JVM with `--plugin message:...`

NDJSON ingester is language-agnostic — relies on `@cucumber/messages` package which is canonical schema parser. Code reference extraction (`step_bindings`) uses runner-specific binding registry format (Reqnroll: in NDJSON `stepDefinition` envelopes; cucumber-js: same; behave: bridge layer reading `behave --tags-help` output).

**Связанные AC:** [AC-9.1](ACCEPTANCE_CRITERIA.md#ac-91), [AC-9.2](ACCEPTANCE_CRITERIA.md#ac-92)
**Use Case:** [UC-10](USE_CASES.md#uc-10)
**User Story:** US-9

## FR-10

**Phase 4 — SQLite FTS5 cross-session persistent index**

System SHALL OPTIONALLY (config-gated) persist SpecGraph index to `.dev-pomogator/.spec-index.sqlite` (SQLite WAL mode). When enabled:
- Multiple Claude Code sessions on same project share one MCP server (per `.mcp-lock.json`)
- Cold start: read pre-built index from SQLite (faster than rebuild from MDs)
- Single-writer enforced via `BEGIN IMMEDIATE` transaction wrapping
- SQLite corruption auto-fallback to in-memory rebuild + warning logged
- Schema migrations via `meta.schema_version` table

Default Phase 2: DISABLED (in-memory only). Phase 4: opt-in via `.spec-config.json::storage.sqlite_enabled = true`.

**Связанные AC:** [AC-10.1](ACCEPTANCE_CRITERIA.md#ac-101), [AC-10.2](ACCEPTANCE_CRITERIA.md#ac-102), [AC-10.3](ACCEPTANCE_CRITERIA.md#ac-103)
**Use Case:** [UC-7](USE_CASES.md#uc-7)
**User Story:** US-10

## FR-11

**Phase 5 — Migration helper v3→v4**

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

**Связанные AC:** [AC-11.1](ACCEPTANCE_CRITERIA.md#ac-111), [AC-11.2](ACCEPTANCE_CRITERIA.md#ac-112)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-12

**Phase 6 — `architecture-research-workflow` skill (meta-deliverable)**

System SHALL provide new skill `architecture-research-workflow` analogous to existing `research-workflow`. 7-stage flow: problem framing → external pain validation → broad research (calls `research-workflow` as primitive) → focused research + self-pushback → variant generation (≥3 architectures) → iterative decision locking → phased rollout → hand-off to `create-spec`.

Stage outputs written to `.specs/{slug}/.architecture-research/<N>-<stage>.md` (committable to git for audit trail). Stage 7 merges all outputs into final `RESEARCH.md` with one Appendix per stage.

`create-spec` skill MUST auto-invoke `architecture-research-workflow` instead of `research-workflow` when complexity heuristic triggers (user prompt contains "архитектур"/"v\d+"/"rebuild" OR ≥3 components detected). Heuristic OVERRIDABLE via explicit flag.

Recursion guard: arch-research Stage 7 sets `--research-done` flag in context; create-spec checks flag — if set, skips own research invocation (avoid infinite loop).

**Связанные AC:** [AC-12.1](ACCEPTANCE_CRITERIA.md#ac-121), [AC-12.2](ACCEPTANCE_CRITERIA.md#ac-122), [AC-12.3](ACCEPTANCE_CRITERIA.md#ac-123)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-12

## FR-13

**Orphan resolution policy — warn-default, configurable**

System SHALL detect two orphan classes during conformance_check:
- `SCENARIO_TAG_ORPHAN`: Scenario has `@FR-N`/`@NFR-N`/`@AC-N` tag but corresponding node doesn't exist in MD specs
- `UNTAGGED_SCENARIO`: Scenario has no `@FR-`/`@NFR-`/`@AC-` tags at all

Default severity for both: `warning` (NOT `error`, NOT block). Configurable per-orphan-class via `.spec-config.json::orphan_policy.{class_name}`: `warn|block|exempt`. Exemption list: `orphan_policy.exempt_scenarios: ["@no-fr-required", ...]`, `orphan_policy.exempt_paths: ["tests/infrastructure/**"]`.

**Связанные AC:** [AC-13.1](ACCEPTANCE_CRITERIA.md#ac-131), [AC-13.2](ACCEPTANCE_CRITERIA.md#ac-132)
**Use Case:** [UC-6](USE_CASES.md#uc-6)
**User Story:** US-13

## FR-14

**Devcontainer / multi-env support (path conventions + watcher fallback)**

System SHALL function correctly across environments: host (Win/Mac/Linux), VS Code devcontainer, WSL2, Hyper-V VM. Specifically:
- All file paths in MCP API responses ARE relative to `git rev-parse --show-toplevel` (never absolute, never container-internal-only)
- `chokidar` watcher auto-detects slow FS via touch test at startup (create temp file, await event ≤500ms); if event missed → enable polling mode (1s interval) + log decision
- `.mcp-lock.json` tags `env` field (e.g., `host`, `container:devcontainer-abc123`, `wsl:ubuntu`) — ONE write-owner per worktree. A second concurrent session does NOT crash (P21-1): its door boots READ-ONLY — reads + the `propose_spec_change` dry-run stay live, while `apply_spec_change`/`delete_spec_doc`/`create_spec` refuse with `WRITE_LOCK_HELD` naming the holder pid+env — so every session keeps a usable door while writes serialise to the single lock owner. A different-`env` collision additionally surfaces the env-mismatch hint.
- `claude` CLI must be installed in each env where Claude Code runs (documented in onboard-repo flow)

**Связанные AC:** [AC-14.1](ACCEPTANCE_CRITERIA.md#ac-141), [AC-14.2](ACCEPTANCE_CRITERIA.md#ac-142), [AC-14.3](ACCEPTANCE_CRITERIA.md#ac-143)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-14

## FR-15

**Phase 4 — Side-channel conformance log (persistent JSONL)**

System SHALL append every conformance finding to persistent log `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`. Each line: `{ timestamp, finding_code, severity, location, message, spec_slug }`. Log files rotate when size >10MB (suffix `-<N>.jsonl`).

CLI `dev-pomogator spec-check-log [--since DURATION] [--grep PATTERN]` provides aggregated views (counts per FR, last occurrence timestamp, severity histogram).

Log is APPEND-ONLY (no in-place edits). Compatible with external analytics tools (`jq`, `grep`, ML pipelines).

**Связанные AC:** [AC-15.1](ACCEPTANCE_CRITERIA.md#ac-151), [AC-15.2](ACCEPTANCE_CRITERIA.md#ac-152)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-15

## FR-16

**Phase 4 — GitHub Codespaces lifecycle support**

System SHALL auto-start MCP server in Codespaces lifecycle via `postStartCommand` in `.devcontainer/devcontainer.json` (added by dev-pomogator install). Lock file `env` field MUST tag `codespaces:<machine-id>`.

Codespaces persistent `/workspaces/` volume MUST work without polling fallback (native FS events functional). MCP server resumes within 2s after Codespace hibernation/resume (in-memory rebuild from persistent files).

**Связанные AC:** [AC-16.1](ACCEPTANCE_CRITERIA.md#ac-161), [AC-16.2](ACCEPTANCE_CRITERIA.md#ac-162)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-16

## FR-17

**Phase 7 — Cross-spec + impl reconciliation skill (`cross-spec-reconcile`)**

System SHALL provide skill `cross-spec-reconcile` that scans ALL specs in `.specs/*/` plus actual implementation tree (`src/`, `extensions/`, `package.json`, `extensions/*/extension.json`) and emits structured findings to `.specs/{current_slug}/consistency-report.yaml`. Skill SHALL support two modes:

- `light` — mechanical-only checks (file existence, regex terminology drift, RUNTIME_IDENTIFIER_DRIFT via grep), budget ≤5s for 30-spec corpus.
- `full` — light + LLM-semantic pairwise FR/AC compare via `spec-llm-judge` through the local **Meridian** subscription proxy (`/v1/messages`, thinking OFF, ~3s/pair Haiku — measured 3841ms; NOT `claude -p` ~13s, see skill `meridian-model-call`). Fail-open: Meridian down → spawn throws → `SUBPROCESS_FAILED` → pair skipped (no slow-path fallback). Caches per-pair sha256 content hash to avoid re-evaluation.

Skill SHALL be invoked from `create-spec` at three points: Phase 2 step 4e (mode=light), Phase 3 step 1d (mode=light), Phase 3+ Audit category CROSS_SPEC_CONSISTENCY (mode=full). (Step labels 4e/1d reflect the actual create-spec phase numbering — 4d=SCHEMA.md, 1c=strong-tests were already taken.)

When CRITICAL findings exist — in `light` mode only for hard-conflict subset (`cross-spec/runtime-identifier-drift`, `cross-spec/module-ownership-conflict`, `cross-spec/contradictory-fr`), in `full` mode for all 28 finding codes that map to severity CRITICAL — skill SHALL emit a blocking AskUserQuestion with `header: "⚠️ CRIT"` (≤12 chars per AskUserQuestion schema) AND options listing each CRITICAL finding's spec_a/spec_b + message + suggested_fix. User MUST explicitly choose: «Fix now via /cross-spec-resolve» / «Acknowledge & override (logged)» / «Abort STOP». Override choice writes `acknowledged_by: user`, `override_reason: <text>`, `override_timestamp: <iso>` to YAML AND appends entry to `.claude/logs/cross-spec-overrides.jsonl` (mirror of existing `scope-gate/escape-hatch-audit.md` pattern).

WARNING/INFO findings SHALL be pushed to agent context as `<system-reminder>` aggregate (no blocking).

Skill SHALL produce secondary SARIF 2.1.0 output (`.specs/{slug}/consistency-report.sarif`) when `--sarif` flag passed or project config `.spec-config.json` `output_formats` includes `"sarif"` — for GitHub Code Scanning + IDE integration. Skill SHALL support `--dry-run` flag printing summary + first 10 findings to stdout WITHOUT writing YAML/SARIF.

Skill SHALL operate in degraded mode when SpecGraph + MCP server (Phase 1) unavailable: read `.specs/*/*.md` directly via `fs` + `remark` + `glob`.

**Связанные AC:** [AC-17.1](ACCEPTANCE_CRITERIA.md#ac-171), [AC-17.2](ACCEPTANCE_CRITERIA.md#ac-172), [AC-17.3](ACCEPTANCE_CRITERIA.md#ac-173), [AC-17.4](ACCEPTANCE_CRITERIA.md#ac-174), [AC-17.5](ACCEPTANCE_CRITERIA.md#ac-175), [AC-17.6](ACCEPTANCE_CRITERIA.md#ac-176), [AC-17.7](ACCEPTANCE_CRITERIA.md#ac-177), [AC-17.8](ACCEPTANCE_CRITERIA.md#ac-178)
**Use Case:** [UC-17](USE_CASES.md#uc-17), [UC-18](USE_CASES.md#uc-18)
**User Story:** US-17, US-18

## FR-18

**Phase 7 — Cross-spec resolve skill (`cross-spec-resolve`)**

System SHALL provide skill `cross-spec-resolve` invoked explicitly via `/cross-spec-resolve` (no auto-invocation from create-spec — explicit user action only). Skill SHALL execute the following 7-step flow:

1. Read `.specs/{slug}/consistency-report.yaml`; exit with hint «Run /cross-spec-reconcile first» if file absent.
2. Group findings by severity (CRITICAL → WARNING → INFO) and by category (cross-spec/* vs impl-drift/*); deduplicate by `code + spec_a + spec_b + location`.
3. For each finding requiring edit — BEFORE any Edit/Write — emit an explanation block containing 5 fields: (a) finding code + severity + class, (b) files to be modified with line ranges, (c) what will change in plain language, (d) WHY this fix follows from the finding message, (e) suggested options via AskUserQuestion: «Apply» / «Skip» / «Defer (logged with reason)».
4. For findings with mechanical fix (`impl-drift/missing-file`, `impl-drift/stale-reference`, `impl-drift/mcp-tool-drift`, `impl-drift/hook-registration-drift`) — apply via Edit/Write after AskUserQuestion confirm.
5. For `impl-drift/architectural-decision-vs-reality` and `impl-drift/duplicate-infrastructure` — present Path A/B/C alternatives via AskUserQuestion with trade-offs in `description` field of each option (Recommended / Current-spec / Custom).
6. For `cross-spec/stale-spec-outstanding-but-done` — propose patch to OTHER spec's README/CHANGELOG with explicit «⚠️ This edits foreign spec: .specs/{other-slug}/{file}» warning banner AND additional explicit confirm before applying.
7. After all findings processed (batch), invoke `Skill("cross-spec-reconcile", mode: "full")` to verify no new conflicts introduced; update each YAML finding's `resolution_status` field (`resolved` if code disappears from new report, `still_present` otherwise, `transformed` if code persists but spec_b changed).

Skill MUST NOT edit any file without explicit user confirm for that specific edit. Each foreign-spec edit (target path starts with `.specs/{other-slug}/`) requires a separate confirm distinct from the per-finding confirm.

**Связанные AC:** [AC-18.1](ACCEPTANCE_CRITERIA.md#ac-181), [AC-18.2](ACCEPTANCE_CRITERIA.md#ac-182), [AC-18.3](ACCEPTANCE_CRITERIA.md#ac-183), [AC-18.4](ACCEPTANCE_CRITERIA.md#ac-184), [AC-18.5](ACCEPTANCE_CRITERIA.md#ac-185)
**Use Case:** [UC-19](USE_CASES.md#uc-19), [UC-20](USE_CASES.md#uc-20), [UC-21](USE_CASES.md#uc-21)
**User Story:** US-19, US-20

## FR-19

**Two-tier hook failure-mode policy (preserve v3 fail-open + harden hard-tier)**

System SHALL apply a **two-tier failure policy** to PreToolUse hooks instead of a single «fail-open everywhere». A single-tier «all hooks fail-open» creates a bypass vector — an attacker crafts a `.md` whose content reliably crashes the hard guard's parser and thereafter enjoys an unprotected Write path on every file. Two-tier closes that hole while preserving v3 robustness:

- **Soft tier** — the 5 v3 form-guards (`user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`) and the meta-guard (`extension-json-meta-guard`): on ANY exception (parse error, missing file, runtime error), the hook MUST log `{ts, hook_id, file_path, error_message, error_stack}` to `~/.dev-pomogator/logs/form-guards.log` and exit 0 (allow operation through). Pattern preserved verbatim from v3 FR-10.
- **Hard tier** — the new `spec-conformance-guard` (FR-5): on STARTUP/config-load crash → exit 1 + write actionable error to stderr (broken install surfaces to user; user's Write tool blocked until the guard is repaired). On per-file CONTENT parse exception → append entry to spec-check-log JSONL (FR-15) AND exit 0 (user's Write proceeds — a single confused file does not DoS authoring).

Cross-phase note: hard-tier file-parse logging needs FR-15 JSONL writer. If FR-15 ships in Phase 4 but `spec-conformance-guard` ships in Phase 2, the writer SHALL be lifted to Phase 2 OR the hard tier SHALL fall back to `~/.dev-pomogator/logs/form-guards.log` (same schema as soft tier) until Phase 4. DESIGN.md «Hook failure-mode tiers» paragraph documents the chosen path.

**Связанные AC:** [AC-19.1](ACCEPTANCE_CRITERIA.md#ac-191), [AC-19.2](ACCEPTANCE_CRITERIA.md#ac-192), [AC-19.3](ACCEPTANCE_CRITERIA.md#ac-193)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-20

**Author-facing conformance summary at prompt time (threshold-only + on-demand)**

System SHALL surface conformance status to the spec author at prompt time **without** the noise of v3's «every prompt aggregate». Recommended combo (B3 + B4):

- **Threshold-only summary at `UserPromptSubmit`** — render a one-line summary ONLY when `unresolved_deny_events ≥ 1` since the author's last acknowledgment. State file `~/.dev-pomogator/state/last-summary-ack.json` tracks `{ack_timestamp, ack_event_count}`. Zero-noise default: if no unresolved events exist, the hook is silent.
- **On-demand pull via `/spec-status` skill** — author can always invoke `/spec-status` to see the full 24h aggregate regardless of threshold state. This is the explicit «show me everything» surface that replaces v3's blanket per-prompt aggregate.

NFR-Performance-6: prompt-time summary render SHALL complete ≤50ms p95. Reads from both `~/.dev-pomogator/logs/form-guards.log` (soft tier events) AND latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (hard tier events) — capped at last 1000 entries per file to bound scan cost.

DESIGN.md «Conformance summary surfacing» paragraph documents rejected alternatives B1 (every-prompt aggregate — latency cost) and B2 (deprecate-only — regression for users who rely on the v3 summary).

**Связанные AC:** [AC-20.1](ACCEPTANCE_CRITERIA.md#ac-201), [AC-20.2](ACCEPTANCE_CRITERIA.md#ac-202)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-21

**`spec-status.ts -Format task-table` backward-compat contract**

System SHALL preserve the v3 `spec-status.ts -Format task-table` CLI output as a STABLE PUBLIC CONTRACT. The output is a markdown table bounded by HTML comment markers (`<!-- auto-generated by spec-status.ts -Format task-table; do not edit manually -->` / `<!-- end auto-generated -->`); the `task-board-forms` skill, v3 spec workflow tooling, and third-party consumers depend on this exact shape.

Implementation MAY swap the underlying source (direct MD parse via `remark` vs MCP-routed `get_trace` from SpecGraph) at any minor version WITHOUT breaking the contract. The contract is enforced via a vitest fixture-based test:

- Fixture: `tools/specs-generator/__fixtures__/task-table.baseline.md`
- Test: `tools/specs-generator/__tests__/task-table-contract.test.ts` — generates output for a known input spec, diffs against the fixture, fails if shape changes.

Standalone CLI MUST work without the MCP server running (degraded mode: direct MD parse fallback, mirroring NFR-Reliability-7's pattern for `cross-spec-reconcile`).

**Связанные AC:** [AC-21.1](ACCEPTANCE_CRITERIA.md#ac-211)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-22

**Version gate for `spec-conformance-guard` (mirror of v3 FR-9)**

System SHALL gate `spec-conformance-guard` (FR-5) on the target spec's `.progress.json::version` field. If `version < 4` OR `version` is null/absent → guard exit 0 + log entry `{kind: "ALLOW_AFTER_MIGRATION", reason: "spec_version", target: <path>}` to spec-check-log JSONL.

Rationale: dev-pomogator users have 30+ legacy specs at versions 1, 2, 3. v4's new hard invariants (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN) were NOT enforced when those specs were authored. Without a version gate, the FR-5 hard guard would false-positive on legacy specs and DoS authoring until each one is migrated. The version gate is the same compatibility pattern v3 FR-9 used for v2→v3 transition.

The gate is bypassed (guard fires normally) ONLY when `.progress.json::version >= 4` — i.e., the spec was authored or migrated under v4 conventions.

**Связанные AC:** [AC-22.1](ACCEPTANCE_CRITERIA.md#ac-221)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11, US-13

## FR-23

**Log-file inventory contract (two log files, intentionally not unified)**

System SHALL preserve v3's `~/.dev-pomogator/logs/form-guards.log` AND introduce v4's `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (FR-15) as TWO DISTINCT log files with distinct schemas, retention, and consumers. DESIGN.md «Log file inventory» paragraph SHALL render this as a definitive table:

- `~/.dev-pomogator/logs/form-guards.log` — v3, kept; written by soft-tier hooks (FR-19); schema: text-line `{ts} {hook_id} {decision} {target} {message}`; retention: 30 days, 10MB cap, rotation via `validate-specs.ts` (v3 pattern preserved); consumer: `renderFormGuardsSummary()` (FR-20 threshold check + on-demand `/spec-status` skill).
- `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` — v4, new; written by hard-tier (FR-19) and conformance-check findings (FR-6); schema: JSON-per-line `{timestamp, finding_code, severity, location, message, spec_slug}`; retention: rotate at 10MB (FR-15); consumer: `dev-pomogator spec-check-log` CLI + analytics tooling.

The two log files are INTENTIONALLY NOT unified: different event taxonomies (form-validation decisions vs invariant findings), different consumers (legacy v3 summary vs new CLI analytics), different lifetimes. Schema migration tooling is out of scope.

**Связанные AC:** [AC-23.1](ACCEPTANCE_CRITERIA.md#ac-231)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6, US-15

## FR-24

**Meta-guard preservation and extension for v4 manifest**

System SHALL preserve v3's `extension-json-meta-guard.ts` (the PreToolUse hook that denies removal of form-guard registrations from `extension.json`) AND extend its protection scope to cover v4's `plugin.json` MCP-tool registrations.

Specifically, the meta-guard SHALL DENY any Write/Edit on `extension.json` OR `plugin.json` that removes:
- Any of the 5 v3 form-guard hook entries (`*-form-guard.ts` / `*-guard.ts` patterns)
- The new `spec-conformance-guard` (FR-5) registration
- The new MCP server `dev-pomogator-specs` tool registrations (FR-4 — `get_trace`, `find_by_tags`, `conformance_check`, etc.)
- The meta-guard's own registration (self-protection invariant)

Tampering attempts SHALL be logged to `.dev-pomogator/logs/meta-guard.log`. NFR-Security-2 references this FR as its concrete instantiation.

**Связанные AC:** [AC-24.1](ACCEPTANCE_CRITERIA.md#ac-241)
**Use Case:** [UC-9](USE_CASES.md#uc-9)
**User Story:** US-5

## FR-25

**canonical plugin SHALL ship a complete static hooks.json (additive union, nothing dropped)**

In the v2.0 canonical distribution dev-pomogator ships its own static `.claude-plugin/hooks.json` (aggregated hook declarations loaded by Claude Code directly) — there is NO install-time edit/merge of the user's `plugin.json` (that was the deprecated v1/npm model). The additive invariant therefore applies to the **shipped manifest**: it SHALL be the complete union of protective + v4 hooks, never a replacement that silently drops protection.

- The shipped `.claude-plugin/hooks.json` SHALL declare the protective hook entries (the plan-gate / phase-gate / build-guard / test-guard family) ALONGSIDE the v4 spec hooks (FR-5 `spec-conformance-guard`, FR-6 `spec-conformance-push`, `bash-post-test/ingest`).
- A v4 hook added to the manifest SHALL NOT remove or overwrite a pre-existing protective hook entry in the same event array — additions are additive within each event.
- `length(hooks.PreToolUse) ≥ 1` AND `length(hooks.PostToolUse) ≥ 1` — the spec hooks ship alongside the existing ones. Verified against the real `.claude-plugin/hooks.json` (SPECGEN004_52).

Rationale: a naive «overwrite hooks array» (or a manifest regenerated from scratch) silently drops protection and creates a window of unprotected authoring until users notice. FR-25 keeps the additive-union invariant explicit and enforceable on the static manifest the canonical plugin actually ships.

**Связанные AC:** [AC-25.1](ACCEPTANCE_CRITERIA.md#ac-251), [AC-25.2](ACCEPTANCE_CRITERIA.md#ac-252)
**Use Case:** [UC-4](USE_CASES.md#uc-4)
**User Story:** US-11

## FR-26

**LLM-as-judge content boundary (deny-list + per-spec opt-out)**

System SHALL apply a content boundary to `claude -p` subprocess invocations triggered by FR-8 (semantic drift check). The subprocess prompt SHALL NOT include text from any file or FR/scenario body that matches the deny-list:

- File-name deny-list: `.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `*secret*`
- Body-content deny-list (regex, case-insensitive): `\bAPI[_-]?KEY\b`, `\bBEARER\s+[A-Za-z0-9._-]+`, `\bSECRET[_-]?KEY\b`, `\b(PRIVATE|RSA)\s+KEY\b`, `\bPASSWORD\s*[:=]`, `\bTOKEN\s*[:=]\s*[A-Za-z0-9._-]{16,}`

WHEN any input to FR-8 matches a deny pattern THEN subprocess invocation SHALL be SKIPPED + a warning logged to spec-check-log JSONL with code `SEMANTIC_CHECK_SKIPPED_DENY_LIST`. The finding is NEVER reported as a missing drift signal (no false claim of «no drift detected» when content was skipped).

Per-spec opt-out: a spec MAY set frontmatter `spec_llm_judge_deny: true` to FORCE skip regardless of content (paranoid mode for specs known to contain mixed sensitive material). Opt-IN is impossible — there is no «allow-list override» for deny-list matches.

NFR-Security-7 captures this as a security NFR; this FR captures the behavioral contract.

**Связанные AC:** [AC-26.1](ACCEPTANCE_CRITERIA.md#ac-261), [AC-26.2](ACCEPTANCE_CRITERIA.md#ac-262)
**Use Case:** [UC-5](USE_CASES.md#uc-5)
**User Story:** US-8

## FR-27

**Marksman LSP supply-chain verification (sha256 against pinned hash)**

System SHALL verify the integrity of every Marksman LSP binary downloaded during `postInstall` (FR-7). The verification flow:

1. `package.json` ships a `marksmanHashes` object mapping `{platform, arch, version}` → `sha256` hex string (or alternatively a sibling `marksman-hashes.json` for verbosity).
2. After download, `postInstall` computes the downloaded file's sha256 and compares to the pinned hash for the current platform/arch/version.
3. Mismatch → install ABORTS with explicit error `Marksman binary sha256 mismatch — expected <pinned>, got <actual>. Refusing to install untrusted binary.` AND the downloaded file is deleted.
4. The hash list MAY be updated only via an explicit `dev-pomogator update-marksman-hashes` CLI that requires the maintainer to provide the new Marksman release version + sha256 from the upstream GitHub release.

Mitigation context: `npm install` running arbitrary binaries from third-party GitHub releases is a known supply-chain hole. FR-27 closes it for our specific dependency. NFR-Security-8 references this FR.

**Связанные AC:** [AC-27.1](ACCEPTANCE_CRITERIA.md#ac-271)
**Use Case:** [UC-8](USE_CASES.md#uc-8)
**User Story:** US-7

## FR-28

**PostToolUse throttle semantics — fixed-window, not sliding/debounce**

System SHALL implement the FR-6 PostToolUse 3-second throttle as a **fixed window** (NOT sliding, NOT debounce). Semantics:

- WHEN the first qualifying Write/Edit fires at time `t0` THEN a window opens `[t0, t0 + throttle_ms]`.
- Subsequent qualifying events at `t0 + δ` where `δ < throttle_ms` are batched into the current window.
- At `t0 + throttle_ms`, the window closes; aggregated findings push to agent context once; the throttle resets.
- A new event at `t0 + throttle_ms + ε` opens a NEW window starting at that timestamp.

Rationale: predictable latency upper-bound for the author (worst case: change visible after `throttle_ms` from the first edit in a burst, never longer). Sliding-window or debounce semantics could indefinitely defer push during continuous edits — the author waits forever for feedback during a long edit session.

NFR-Performance-7 documents the latency invariant.

**Связанные AC:** [AC-28.1](ACCEPTANCE_CRITERIA.md#ac-281)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-6

## FR-29

**Builder SHALL wire `implements` edges + `File` nodes from FILE_CHANGES.md and DESIGN.md**

System SHALL parse `FILE_CHANGES.md` tables (columns: `Path | Action | Reason`) in each spec dir AND `DESIGN.md` "Где код" / "App-код" sections to emit into SpecGraph:

- 1 `File` node per unique referenced path (deduplicated across both sources)
- 1 `implements` edge from each FR to its corresponding File node, where the FR↔file linkage is established via:
  - `Reason` column citing `FR-N` (regex `\bFR-\d+\b`), OR
  - Task `refs[]` containing FR-N whose `files[]` includes that path, OR
  - DESIGN.md section citing FR-N adjacent to a file path
- Edge metadata: `{ file_path: <repo-relative>, source_section: 'FILE_CHANGES' | 'DESIGN', action?: 'create' | 'edit' | 'delete' }`

Existing `types.ts` declarations for `EdgeType='implements'` and `NodeType='File'` remain authoritative — this FR only wires `builder.ts` to emit them. Glob patterns in `Path` (e.g. `tools/spec-graph/*.ts`) SHALL be skipped with a single warn-once log entry per build; no implements edge is created for unresolved patterns.

**Связанные AC:** [AC-29.1](ACCEPTANCE_CRITERIA.md#ac-291), [AC-29.2](ACCEPTANCE_CRITERIA.md#ac-292), [AC-29.3](ACCEPTANCE_CRITERIA.md#ac-293)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-17

## FR-30

**MCP `get_trace` response SHALL surface `code_impl[]` per node**

System SHALL extend the `get_trace` tool response shape to include `code_impl[]` per returned node — an array of `{ file_path, action?, source_section }` entries derived from FR-29 `implements` edges:

- **FR node** → `code_impl` = all File nodes connected by `implements` edge (direct).
- **AC node** → `code_impl` inherits parent FR's `code_impl` transitively (same entries).
- **Scenario node** → `code_impl` = StepBinding file paths ∪ parent FR's `code_impl` (deduplicated by `file_path`).
- **Task node** → `code_impl` = task `files[]` ∪ parent FR's `code_impl` (deduplicated).

If no `implements` edges exist for a node, `code_impl` SHALL be present as an empty array `[]` (not omitted) — preserves stable shape for clients.

**Зависит от:** FR-29 (no `implements` edges → `code_impl = []` for all FR/AC nodes; Scenario/Task still surface bindings/refs).
**Связанные AC:** [AC-30.1](ACCEPTANCE_CRITERIA.md#ac-301), [AC-30.2](ACCEPTANCE_CRITERIA.md#ac-302)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-18

## FR-31

**Test corpus SHALL include real multi-language NDJSON fixtures + e2e roundtrip**

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

**Связанные AC:** [AC-31.1](ACCEPTANCE_CRITERIA.md#ac-311), [AC-31.2](ACCEPTANCE_CRITERIA.md#ac-312)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-19

## FR-32

**Task status SHALL be evidence-derived from the latest test run, with a honesty gate**

System SHALL derive each task's effective status from the latest BDD/test run (`.dev-pomogator/.last-test-run.ndjson`) instead of trusting the hand-authored `Status:` field, by mapping each task to its scenarios via the task's `@featureN` / `SPECGEN004_NN` references and FR `refs[]`:

- A task's `verified_status` SHALL be `DONE` only when EVERY mapped scenario is `PASSED` in the latest run.
- If any mapped scenario is `pending` / `undefined` / `ambiguous` / `failed`, `verified_status` SHALL be capped at `IN_PROGRESS` (never `DONE`).
- A task with no mapped scenarios SHALL fall back to its hand-set status flagged `verified_status = "unverified"`.

System SHALL emit conformance finding `TASK_STATUS_UNVERIFIED` (severity WARNING) WHEN a task's hand-set `Status: DONE` conflicts with a `verified_status < DONE` — the honesty gate. The finding `suggestions[]` SHALL name the offending scenario(s) and their bucket. `spec-status.ts -Format task-table` SHALL render `verified_status` (not the raw field) so the summary table cannot claim DONE without green scenarios.

This codifies the manual discipline applied during the 2026-06-02 coverage audit (no task DONE while its BDD scenario is pending/undefined/ambiguous) into the spec-generator itself, removing the human as the enforcement point.

**Зависит от:** FR-2 (SpecGraph task↔scenario edges), FR-13 (conformance findings), FR-30 (MCP node surface). Surfaced via MCP `get_coverage` (per-scenario buckets + per-task derived status) and `get_trace` (`verified_status` per node).
**Связанные AC:** [AC-32.1](ACCEPTANCE_CRITERIA.md#ac-321), [AC-32.2](ACCEPTANCE_CRITERIA.md#ac-322), [AC-32.3](ACCEPTANCE_CRITERIA.md#ac-323)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-20

## FR-33

**System SHALL provide a thin workflow-orchestrator skill over the feature map, with a self-improving merge ledger**

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
**Связанные AC:** [AC-33.1](ACCEPTANCE_CRITERIA.md#ac-331), [AC-33.2](ACCEPTANCE_CRITERIA.md#ac-332), [AC-33.3](ACCEPTANCE_CRITERIA.md#ac-333), [AC-33.4](ACCEPTANCE_CRITERIA.md#ac-334), [AC-33.5](ACCEPTANCE_CRITERIA.md#ac-335)
**Use Case:** [UC-1](USE_CASES.md#uc-1)
**User Story:** US-21

---

## FR-34

**Anchor-integrity guard + auto-fix — keep descriptive headings safe from rename-induced broken links**

System SHALL keep the Marksman-standard **descriptive** heading form (`## FR-N: Title`; GLFM slug derived from heading text — `glfm_heading_ids.enable=true` is Marksman's documented default) and automate the ONLY failure mode of that form: a heading rename changes its slug and orphans inbound `#anchor` links. Realised as a three-layer guard so the standard, readable headings stay AND links never silently rot.

**FR-34a (detect — single slug source of truth):** System SHALL expose ONE shared `marksmanSlug(text)` implementing the GLFM rule **measured against the real binary** (lowercase → strip punctuation INCLUDING dots so `AC-1.1`→`ac-11`, `AC-27.1`→`ac-271` → spaces→`-` → collapse `-`), consumed by BOTH the graph parser (`md.ts`) and the validator (`specs-generator-core.mjs` — replacing the duplicated `toAnchorSlug`/`slugify`), and pinned by a **golden fixture captured from the Marksman binary** so a version bump that changes slugging FAILS loudly. An anchor-integrity check SHALL verify EVERY link anchor — same-file `[t](#a)` AND cross-file `[t](f.md#a)` — resolves to a heading whose slug matches (closing the same-file gap in the existing `CROSS_REF_LINKS` check whose `linkPattern` requires `.md`). Links inside fenced or inline code (illustrative examples, not live links) SHALL be skipped.

**FR-34b (catch immediately — hook + gate):** A PostToolUse hook on Write/Edit of `*.md` SHALL run the anchor-integrity check on the touched spec and inject a `<system-reminder>` listing broken anchors + the suggested fix (throttled, reusing the FR-6 push idiom). A Stop-gate (modelled on `claim-evidence-gate`) SHALL block declaring "done" while a session-touched spec has unresolved broken anchors, with an audited escape hatch `[skip-anchor-fix: <reason>]` logged to `.claude/logs/`.

**FR-34c (auto-fix — deterministic + `claude -p`/`-bg` fallback):** A fixer SHALL repair broken anchors. For **id-bearing** links (the link text carries the id — e.g. text `FR-7` with a stale anchor `#fr-7-old` — the majority) it SHALL resolve the id → the id's current heading → `marksmanSlug` → rewrite the anchor **deterministically** (no LLM, idempotent: `fix(fix(x))==fix(x)`). For **ambiguous prose** links (text does not name a heading id) it SHALL dispatch headless `claude -p` (or background) with the broken link + candidate headings to choose the target, then rewrite. The LLM branch SHALL run in the **background** and SHALL NOT block the triggering edit; when the binary/headless path is unavailable the link SHALL stay flagged (never guess-rewrite).

**Зависит от:** FR-3 (parser/anchors), FR-6 (PostToolUse push idiom), FR-32 (honesty/Stop-gate discipline), FR-7c (the measured Marksman slug behaviour). Reuses the validator's `CROSS_REF_LINKS` and the proven `claude -p` headless-dispatch pattern — no new infra duplicated.
**Связанные AC:** [AC-34.1](ACCEPTANCE_CRITERIA.md#ac-341), [AC-34.2](ACCEPTANCE_CRITERIA.md#ac-342), [AC-34.3](ACCEPTANCE_CRITERIA.md#ac-343), [AC-34.4](ACCEPTANCE_CRITERIA.md#ac-344), [AC-34.5](ACCEPTANCE_CRITERIA.md#ac-345)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-22

---

## FR-35

**Honesty hardening — the gate must judge test QUALITY, not just PASS/FAIL**

The FR-32 honesty gate derives `verified_status` from per-scenario PASS/FAIL only. VERIFIED this session (evidence: `computeCoverage`/`checkConformance` runs + grep of `.claude-plugin/hooks.json` and `scripts/feature-map.ts`): a fake-positive GREEN test (mocked / trivial-assert) marks a task `DONE`; the quality auditors `strong-tests`/`spec-status` are **advisory** — present in NEITHER the hooks registry NOR the orchestrator feature-map (WORKFLOW: scaffold→conformance→coverage→trace→reconcile→resolve→backlog→honesty-gate, no test-quality stage); and `checkConformance(done-task, zero linked scenario)` returns `[]` (silent). System SHALL close all three so a GREEN result can never silently mean "fake".

**FR-35a (test-quality gate — block DONE on weak / fake-positive):** When a task's linked scenario is GREEN the honesty derivation (`tools/spec-graph/coverage.ts`) SHALL additionally require a **test-quality verdict** from the `strong-tests`/`spec-status` test-body audit; a verdict of `WEAK` or `FAKE-POSITIVE-RISK` SHALL cap `verified_status` below `DONE` (`IN_PROGRESS`) and emit a `TASK_TEST_QUALITY` finding naming the task + verdict, so a passing-but-worthless test cannot mark a task `DONE`. A `STRONG` verdict SHALL leave `DONE` intact (no false-block).

**FR-35b (wire + enforce — not advisory):** A `test-quality` stage SHALL be added to the orchestrator feature-map (`scripts/feature-map.ts` `WORKFLOW`) **between `coverage` and `honesty-gate`**, routing to `strong-tests` + `spec-status`; AND a Stop / pre-DONE hook (modelled on `claim-evidence-gate`) SHALL **enforce** it — blocking a "done" claim when a session-touched task's test is `WEAK`/`FAKE-POSITIVE-RISK`/absent, with an audited escape hatch `[skip-test-quality: <reason>]` logged to `.claude/logs/`. The drift guard `checkFeatureMapDrift` (AC-33.5) SHALL FAIL when the stage is missing.

**FR-35c (zero-linkage DONE is not silent):** `checkConformance` SHALL emit a finding when a task is marked `DONE` with **zero linked scenarios** (no test at all) — complementing the FR/@feature-level `NOT_COVERED` it already emits — so the "mark done, write no test" path is visible, not `[]`.

**Зависит от:** FR-32 (honesty gate / `verified_status` derivation), FR-33 (orchestrator feature-map + `checkFeatureMapDrift`), FR-34b (Stop-gate idiom). Reuses `strong-tests`/`spec-status` (no new auditor) and the `claim-evidence-gate` hook pattern — no infra duplicated.
**Связанные AC:** [AC-35.1](ACCEPTANCE_CRITERIA.md#ac-351), [AC-35.2](ACCEPTANCE_CRITERIA.md#ac-352), [AC-35.3](ACCEPTANCE_CRITERIA.md#ac-353), [AC-35.4](ACCEPTANCE_CRITERIA.md#ac-354), [AC-35.5](ACCEPTANCE_CRITERIA.md#ac-355)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-22

---

## FR-36

**Unified spec-graph via spec-qualified node ids — specs are ONE graph, not 47 colliding ones**

The graph keys nodes by the BARE local id (`FR-2`, `AC-2.1`). MEASURED this session via the dogfood harness (`tools/spec-mcp-server/dogfood-dataset.ts`): **46 specs each define `FR-2`, yet the graph holds only 47 FR nodes from 6 spec dirs** (≈470 expected) — the node Map keeps the last writer and silently drops ≈90%; `FR-2` resolves to an arbitrary spec (`worktree-setup`). Every edge bug is a symptom: `covers` ×52 piled on one bare id, the FR/AC→Scenario `tested-by` layer orphaned (also because `SPEC_TAG_RE` only matches `@FR-N`, never the real `@featureN` tags), `get_trace` empty for ALL 47 FRs. It "works" today ONLY because `computeCoverage` + the patched `get_trace` scope by **file path**, never trusting a bare id — a workaround, not a fix. System SHALL make every node addressable without collision so specs form one coherent graph.

**FR-36a (composite node key, auto-derived — no domain rules to design):** The graph builder (`tools/spec-graph/builder.ts`) SHALL key every node by the composite `<slug>:<localId>` (e.g. `spec-generator-v4:FR-2`), where `<slug>` is derived MECHANICALLY from the node's `.specs/<slug>/…` file path and `<localId>` stays the human form (`FR-2`, `AC-2.1`, the scenario id) — the author keeps writing `## FR-2` with LOCAL 1..N numbering and never types a prefix. The node SHALL carry an explicit `spec: '<slug>'` field. Two specs defining `FR-2` SHALL therefore produce two distinct nodes (≈470 FR nodes present, none collision-dropped). Separator SHALL be `:` (clean; `/` collides with path/anchor syntax). This finishes a pattern already in the repo — scenarios are ALREADY prefixed (`SPECGEN004_40`, `PLUGIN005_NN`, `CORE024_NN`); only FR/AC were bare and collided.

**FR-36b (anchors stay bare + file-scoped — Marksman untouched):** Markdown anchor aliases SHALL remain the BARE file-local form (`#fr-2`), decoupled from the composite node key. Anchor resolution is WITHIN a file (`[x](FR.md#fr-2)`), there are zero cross-spec markdown links today, so the anchor index SHALL keep per-file bare aliases — Marksman, `anchor-fix`, and all existing intra-file links SHALL be unaffected. (This is the easy mistake to avoid: NODE key = composite, ANCHOR alias = bare.)

**FR-36c (edges use composite keys + build the @featureN tested-by layer):** Edge construction (`parsers/md.ts` `covers`, `parsers/gherkin.ts` `tested-by`) SHALL reference composite keys on BOTH endpoints, AND SHALL build a `tested-by` edge for EVERY same-spec scenario bearing either an `@FR-N` OR an `@featureN` tag (explicit disjunction — both conventions are hard requirements; the old code matched only `@FR-N`). After this, `get_trace(FR)` SHALL return its scenarios via REAL graph edges, and the tag-scan workaround in `get_trace` SHALL be removed.

**FR-36d (tool API: qualified internally, soft bare-id back-compat for agents):** The MCP tools (`tools/spec-mcp-server/tools.ts`) SHALL accept either `slug:id` or `{spec, node_id}` and resolve the exact node. When called with a BARE id that collides across specs, a tool SHALL return the CANDIDATE LIST (each `slug:id`) rather than one arbitrary node — soft back-compat, since agents often know only `FR-2`. Internally, edges SHALL always be qualified (hard). The `server.bundle.mjs` SHALL be rebuilt after the tools change.

**FR-36e (phased migration, each phase suite-green, dogfood-verified):** The migration SHALL proceed in phases that each leave the full clean-HEAD Docker suite green (clean-vs-clean): (1) composite key in the builder only; (2) edge endpoints + `@featureN` tested-by edges; (3) tools accept `slug:id`/candidate fallback; (4) update tests pinning a bare id to the qualified form. The `runtime-dogfood`/`spec-mcp-dogfood` harness SHALL verify each phase: FR-node count jumps 47→≈470, `get_trace` non-empty via edges, and a raw pre-map node dump shows 0 id collisions.

**Зависит от:** FR-4 (MCP server + 13 tools), FR-32 (honesty gate / `computeCoverage` — the file-scoped workaround this replaces). Reuses the existing parsers/builder/tool registry — no new infra; this is a refactor of node identity threaded through 21 TS files in `spec-graph` + `spec-mcp-server`. Evidence: `audit-reports/spec-mcp-dogfood-dataset.md` (runtime measurement) + `audit-reports/unified-spec-graph-design.md` (design + id-scheme deep-dive: domain-prefix beats global N+1 on both creation and work sides).
**Связанные AC:** [AC-36.1](ACCEPTANCE_CRITERIA.md#ac-361), [AC-36.2](ACCEPTANCE_CRITERIA.md#ac-362), [AC-36.3](ACCEPTANCE_CRITERIA.md#ac-363), [AC-36.4](ACCEPTANCE_CRITERIA.md#ac-364), [AC-36.5](ACCEPTANCE_CRITERIA.md#ac-365), [AC-36.6](ACCEPTANCE_CRITERIA.md#ac-366)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-21

---

## FR-37

**Smart verdict is authoritative + the corpus traces as ONE organism (cell→atom) — structural-pass is never "clean"**

MEASURED this session: the structural `validate-spec` returns `files_with_errors: 0` for spec-generator-v4 and that was reported as "spec valid" — a FALSE green, because `audit-spec` has 10 P0 (1 missing AC-link + **9 FILE_CHANGES entries pointing at deleted `extensions/…`/`dist/installer/…` paths**), `conformance_check` returns **1256 findings** (1243 `UNTAGGED_SCENARIO`, 11 `UNCOVERED_FR`, 2 `TASK_UNTESTED`), and the corpus `specs-validator` reports **32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP**. v4 ALREADY owns the smart machinery — FR-8 LLM-as-judge semantic drift, the `full` semantic skill mode, `conformance_check`, `get_coverage` (FR-32 honesty), `audit-spec` — but it is opt-in / not the boss, so a dumb structural pass masquerades as health. System SHALL make the smart graph analysis the canonical verdict and full cell→atom traceability a hard gate, so a GREEN verdict MEANS the organism traces from FR down to the atom (task / code / test line), across ALL specs — not "the formatting is fine."

**FR-37a (smart verdict authoritative; structural is a pre-filter only):** The canonical spec-health verdict SHALL be the smart analysis over the ONE graph (FR-36): `conformance_check` + `get_coverage` (FR-32) + `audit-spec` + the FR-37b traceability-completeness check, default-ON. `validate-spec` (structure + links) SHALL be a pre-filter whose pass SHALL NOT be reportable, by any tool/skill/agent, as "valid / clean / done." A tool that reports health SHALL cite the smart verdict, never a bare `validate-spec: 0 errors`.

**FR-37b (full cell→atom traceability is a hard gate):** The verdict SHALL FAIL while ANY of these hold, with an actionable per-item gap list: a FILE_CHANGES path that does not exist on disk (stale `extensions/…` etc.); an `UNCOVERED_FR` (FR with no AC, or no Scenario, or no Task); a `TASK_UNTESTED` (Task DONE with zero linked scenario); a Scenario not tagged up to a requirement (`UNTAGGED_SCENARIO`). Within spec-generator-v4 these SHALL be driven to 0; corpus-wide they SHALL be MEASURED and trend to 0 (the organism invariant: every atom reachable from the corpus via edges, no orphan).

**FR-37c (semantic check ON in the verdict path, fail-loud not fail-silent):** When a `claude` binary is present the FR-8 semantic drift check SHALL run as part of the authoritative verdict (not opt-in). When the binary/headless path is unavailable the verdict SHALL carry an explicit `SEMANTIC_SKIPPED` note and SHALL NEVER report "no drift detected" for unchecked content (no false all-clear) — mirroring the FR-32/FR-35 honesty discipline.

**FR-37d (skills/agents may not launder a structural pass):** The spec-facing skills (`spec-status`, `spec-mcp-dogfood`, `runtime-dogfood`, `suite-failure-triage`) and any agent reporting spec health SHALL be FORBIDDEN to state "valid / clean / done" off `validate-spec` alone; they SHALL surface the smart verdict (conformance/coverage/audit/traceability) and its gap list. This encodes the exact failure that triggered this FR (a structural "valid" trusted as health) as a guard, not a footnote.

**FR-37e (close the measured in-scope debt):** The 58 stale `extensions/…`/`dist/installer/…` paths in spec-generator-v4 `FILE_CHANGES.md` SHALL be reconciled (rewritten to the canonical post-v2 path or removed with reason), closing the 9 stale-path P0s; and a stale FILE_CHANGES path SHALL be a hard ERROR in the authoritative verdict (already in `audit-spec` — wire `audit-spec` into the verdict so reading `validate-spec` alone cannot bypass it).

**Зависит от:** FR-36 (ONE graph via composite ids — the precondition for corpus-wide traceability), FR-32 (`get_coverage` honesty gate), FR-8 (LLM-as-judge semantic drift), FR-35 (honesty-hardening idiom: GREEN never silently means fake). Reuses the existing smart tools — no new analyzer; this FR makes them AUTHORITATIVE + adds the traceability-completeness check. Evidence: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.
**Связанные AC:** [AC-37.1](ACCEPTANCE_CRITERIA.md#ac-371), [AC-37.2](ACCEPTANCE_CRITERIA.md#ac-372), [AC-37.3](ACCEPTANCE_CRITERIA.md#ac-373), [AC-37.4](ACCEPTANCE_CRITERIA.md#ac-374), [AC-37.5](ACCEPTANCE_CRITERIA.md#ac-375), [AC-37.6](ACCEPTANCE_CRITERIA.md#ac-376)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-22

---

## FR-38

**Полный lifecycle-статус спеки через MCP: тест-ран слинкован с summary, агент видит состояние целиком**

User ask (2026-06-06): «кейс когда есть тест-ран и линкуется ещё и тест-ран с summary-данными, чтоб агент понимал статус полностью: спека может быть RED, GREEN, тесты не написаны, или просто спека есть и больше ничего — должно быть через MCP трассируемо и покрыто BDD-сценариями».

System SHALL expose an MCP tool `get_spec_status({spec})` returning, for ONE spec (the cell), its full lifecycle state derived ONLY from the one graph (FR-36) + the ingested NDJSON test-run (FR-1) — no side files, no guesses.

**FR-38a (lifecycle states — исчерпывающий enum):** The tool SHALL classify the spec into exactly one of: `SPEC_ONLY` — spec docs exist, zero Scenario nodes (тесты не написаны вовсе); `TESTS_NOT_RUN` — Scenario nodes exist, but no scenario of this spec carries a `lastResult` (ран не делался или NDJSON не инжестился); `RED` — the last run holds ≥1 `FAILED`/`AMBIGUOUS` scenario of this spec; `PARTIAL` — the last run touched this spec, zero failed, but ≥1 scenario is `UNDEFINED`/`PENDING`/`SKIPPED` (степы не дописаны / сценарии пропущены); `GREEN` — every touched scenario is `PASSED` and ≥1 was touched.

**FR-38b (test-run summary linked):** When any run data exists the response SHALL embed `last_run`: `{at, source, summary: {passed, failed, pending, undefined, ambiguous, skipped, touched}}`, где `at` = max `lastRunAt` по сценариям спеки и `source` = путь инжестённого NDJSON. When no run data exists `last_run` SHALL be `null` — NEVER a fabricated summary (FR-35 honesty idiom).

**FR-38c (полная картина для агента):** The response SHALL also carry `counts` (FR/AC/Scenario/Task клетки), `gaps` (FR-37b per-class counts для этой спеки) and a one-line `hint` telling the agent what the state MEANS and the next action.

**FR-38d (BDD-покрытие состояний):** Every lifecycle state SHALL be covered by its own BDD scenario driving the REAL tool handler on a real fixture graph (NDJSON-контракт реальный, не hand-built инъекция результатов).

**Зависит от:** FR-36 (composite ids — spec scoping), FR-1/FR-9 (NDJSON ingest + `lastResult`/`lastRunAt`), FR-32 (bucket-семантика через `coverage.ts`), FR-37 (вердикт — GATE; `get_spec_status` — agent-facing READ той же правды).
**Связанные AC:** [AC-38.1](ACCEPTANCE_CRITERIA.md#ac-381), [AC-38.2](ACCEPTANCE_CRITERIA.md#ac-382), [AC-38.3](ACCEPTANCE_CRITERIA.md#ac-383), [AC-38.4](ACCEPTANCE_CRITERIA.md#ac-384), [AC-38.5](ACCEPTANCE_CRITERIA.md#ac-385)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-23

---

## FR-39

**MCP-only доступ агента к спекам (централизация + аудит-лог) — granica агент vs движок**

Запрет распространяется на TOOL-CALLS АГЕНТА и только на них: агентские Read / Grep / Glob / Edit / Write / Bash-чтения по `.specs/**` SHALL быть заменены MCP-вызовами; ДВИЖОК (builder, парсеры, CLI spec-verdict/corpus-health/spec-status/validate/audit, хуки, резолверы spec-backlog, сам MCP-сервер) SHALL продолжать читать/писать диск in-process — он и есть бэкенд этой двери. Противоречия с [FR-21](#fr-21) НЕТ: FR-21 — деградация ДВИЖКА без сервера, FR-39 — дисциплина АГЕНТА (verify-divergent-contracts соблюдено).

- **FR-39a (read-sufficiency first):** MCP SHALL отдавать ВЕСЬ контент, нужный для авторинга/ревью: `get_node` уже несёт `body` (проверено живой пробой 2026-06-07); добавляются `read_spec_doc({spec, doc})` для цельных документов И `list_spec_docs({spec})` (ОБЯЗАТЕЛЕН, не опционален — без него read_spec_doc превращается в угадайку имён). Инвентарь `doc`: фактическое содержимое каталога спеки (`*.md` + `*.feature` + `.progress.json` read-only) — list_spec_docs перечисляет, read_spec_doc отдаёт по имени из перечня; имя вне перечня → DOC_NOT_FOUND. Включение enforcement ДО доказанной read-sufficiency ЗАПРЕЩЕНО.
- **FR-39b (аудит-лог):** каждый агентский spec-доступ через MCP (read и write) SHALL логироваться append-only (O_APPEND) в `.dev-pomogator/logs/spec-access.jsonl`: `{ts, tool, args_digest, decision}`; ротация по образцу audit-logger (10MB / 30 дней). Централизация ради контроля и лога — мотивация волны, запрет грепа — следствие.
- **FR-39c (shadow → enforce, строго в этом порядке):** PreToolUse-хук `spec-access-guard` на Read|Grep|Glob|Edit|Write|Bash SHALL сначала работать в SHADOW-режиме (лог нарушений, без блока); флип в deny — через env `SPEC_ACCESS_ENFORCE=true`, ТОЛЬКО после (1) FR-39a доказан, (2) FR-40 mutation готова, (3) shadow-лог чист на живой работе. Escape hatch `[skip-spec-access: <reason ≥8>]` + JSONL-аудит по образцу scope-gate. Хук фильтрует по `.specs/` ДО любого I/O.
- **FR-39f (Bash-матчер: агент vs движок — алгоритм, не эвристика):** для Bash-вызовов наивный матч «`.specs/` в команде» ЗАПРЕЩЁН — он убил бы легитимные запуски движковых CLI (`spec-verdict.ts -Path .specs/X`, `corpus-health`, `--check tasks .specs/...`). Матчер SHALL различать: (1) ВАЙТЛИСТ движковых CLI (поимённый список скриптов в DESIGN: spec-verdict, validate-spec, audit-spec, spec-status, corpus-health, collision-probe, spec-form-parsers --check, scaffold-spec, anchor-integrity) — команда, чей исполняемый скрипт в вайтлисте, ALLOW независимо от `.specs/`-аргументов; (2) generic-читалки/писалки (cat/sed/grep/awk/головые `node -e`/heredoc-скрипты) с `.specs/`-путями — VIOLATION (лог в shadow, deny в enforce). Ad-hoc node-скрипты, пишущие в спеки, — ровно тот обход, который матчер обязан ловить.
- **FR-39g (сосуществование с form-guards):** `spec-access-guard` SHALL регистрироваться ПЕРВЫМ в PreToolUse-цепочке (дисциплина доступа раньше валидации формы); каждый guard отвечает СВОИМ именем в permissionDecisionReason — агент различает «не тем путём» от «не та форма». В enforce-режиме агентские записи в спеки идут через MCP (FR-40) — server-side fs-записи PreToolUse-хуков НЕ триггерят, поэтому form-валидация SHALL вызываться СЕРВЕРОМ in-process (FR-40b) — стражи не дерутся, контракт один.
- **FR-39d (хук живой, не мёртвый):** `spec-access-guard` SHALL быть зарегистрирован в ОБОИХ манифестах (`.claude/settings.json` + `.claude-plugin/hooks.json`), пройти deps-absent прогон, попасть в поимённый пин SPECGEN004_52 и в PROTECTED_HOOKS meta-guard-а — урок пяти мёртвых стражей (P16-1) кодируется требованием.
- **FR-39e (миграция корзины 1):** инструкции скиллов, велящие агенту напрямую читать `.specs/` (31 файл-кандидат; точная разметка — задача), SHALL быть переписаны на MCP-вызовы; carve-out лист корзины 2 (39 engine-файлов) фиксируется в DESIGN.

**Зависит от:** FR-4 (MCP server), FR-38 (get_spec_status), FR-21 (граница примирена). Evidence: `audit-reports/mcp-rails-wave-design.md`.
**Связанные AC:** [AC-39.1](ACCEPTANCE_CRITERIA.md#ac-391), [AC-39.2](ACCEPTANCE_CRITERIA.md#ac-392), [AC-39.3](ACCEPTANCE_CRITERIA.md#ac-393)
**User Story:** US-24

## FR-40

**Живой генератор: мутация спек через MCP с валидацией ДО записи**

MCP-поверхность SHALL получить мутирующие тулзы — спека пишется через сервер, который прогоняет валидацию ДО касания диска; «писать вслепую и узнавать о мусоре на вердикте» прекращается.

- **FR-40a (поверхность):** минимум `create_spec({slug})` (оборачивает scaffold — рождение verdict-GREEN), `apply_spec_change({spec, doc, change, reason})` и `propose_spec_change(...)` (dry-run: те же проверки, без записи). Формат `change` SHALL быть ОДНИМ из двух (без изобретения diff-языка): `{content}` — полная замена документа, ИЛИ `{old_string, new_string, replace_all?}` — anchored-замена с семантикой Edit-тула (знакомая агенту; уникальность old_string обязательна без replace_all). Сервер применяет change к текущему содержимому В ПАМЯТИ → валидирует результат (FR-40b) → пишет. Тулзы SHALL ОБОРАЧИВАТЬ существующий движок (scaffold-spec, резолверы spec-backlog, form-парсеры) — НЕ дублировать его логику (анти-паттерн «второй валидатор»).
- **FR-40b (валидация на записи):** перед записью сервер SHALL прогнать in-process: form-контракты (spec-form-parsers), анкеры (anchor-integrity checkLinks), conformance затронутой спеки; ЛЮБОЙ error-severity результат → отказ с findings list (агент правит и повторяет). Запись SHALL быть атомарной (temp+rename) и логироваться в spec-access.jsonl (FR-39b).
- **FR-40c (инкрементальный отклик):** после успешной записи сервер SHALL обновить граф (incremental rebuild FR-14 / полный ребилд как fallback), чтобы следующий read-вызов агента видел свежее состояние.

**Зависит от:** FR-39a, FR-14 (watcher/incremental), FR-34 (anchors), FR-5 (conformance). Evidence: `audit-reports/mcp-rails-wave-design.md`.
**Связанные AC:** [AC-40.1](ACCEPTANCE_CRITERIA.md#ac-401), [AC-40.2](ACCEPTANCE_CRITERIA.md#ac-402)
**User Story:** US-24

## FR-41

**Создание спеки агентами по фазам + оркестратор-проверятор (headless claude -p/-bg)**

Каждый этап create-spec SHALL исполняться выделенным headless-агентом, а переходы между этапами SHALL гейтиться проверятором.

- **FR-41a (фазовые агенты):** определения в `.claude/agents/spec-phase-*.md` (discovery / requirements / finalization / audit). MCP-only SHALL принуждаться через allowed-tools агента (выданы MCP-тулзы, НЕ выданы Read/Grep/Edit по спекам) — второй слой enforcement, независимый от хука FR-39c. Спавн — `claude -p` (длинные фазы — detached `-bg` паттерн из `tools/anchor-integrity/claude-fallback.mjs`); переиспользовать инжектируемый spawn из `tools/spec-llm-judge` (тестируемость без реального бинаря).
- **FR-41b (оркестратор-проверятор):** оркестратор SHALL спавнить фазу, ждать завершения, между фазами прогонять spec-verdict + get_spec_status; RED → вернуть фазу ТОМУ ЖЕ агенту с gap list (bounded retries), GREEN-гейт фазы → следующая. Расширяет skill `spec-generator-orchestrator` (FR-33, thin-router дисциплина сохраняется: проверятор КОМПОЗИРУЕТ существующие вердикты, не реализует свои).
- **FR-41c (наблюдаемость):** каждый спавн/ретрай/гейт SHALL логироваться (spec-access.jsonl или сосед) — юзер видит, какой агент что сделал на каком этапе.

**Зависит от:** FR-39a + FR-40 (агентам нужна полная MCP-дверь), FR-33 (оркестратор), FR-37 (вердикт), FR-8/судья (headless-инфра). Evidence: `audit-reports/mcp-rails-wave-design.md`.
**Связанные AC:** [AC-41.1](ACCEPTANCE_CRITERIA.md#ac-411), [AC-41.2](ACCEPTANCE_CRITERIA.md#ac-412)
**User Story:** US-24

---

## FR-42

**Слойный контракт skill↔MCP: тонкий скилл — толстый сервер (каждому юзер-сценарию MCP — своя skill-обёртка)**

Юзер НЕ вызывает MCP напрямую — точкой входа остаётся СКИЛЛ (как сегодня): «создай спеку» → скилл create-spec → MCP-вызовы. Скилл SHALL знать КАК пользоваться MCP (какие тулзы, с какими параметрами, в какой последовательности, как реагировать на findings) и SHALL NOT содержать бизнес-логику; ВСЯ логика (валидация, мутация, чтение, статусы, гейты) SHALL жить в MCP/движке.

- **FR-42a (обёртка на каждый юзер-сценарий):** каждый пользовательский сценарий работы со спеками SHALL иметь skill-обёртку, маппящую его на MCP-тулзы; покрытие фиксируется таблицей «MCP-тул → скилл(ы)-потребители» в DESIGN; юзер-сценарий без обёртки (только «голый MCP») — violation. Read-only тулзы, нужные лишь агентам внутри других скиллов (напр. validate_anchor), могут не иметь СОБСТВЕННОГО скилла, но обязаны иметь потребителя в таблице.
- **FR-42b (тонкость скилла — механически проверяемо):** SKILL.md spec-скиллов SHALL NOT инструктировать пере-реализацию серверной логики (парсинг спек, conformance-подсчёты, валидация анкеров в теле скилла); drift-guard FR-33 (orchestrator feature-map) SHALL расширяться: новый user-facing MCP-тул без skill-потребителя в таблице → guard fail с именем тулзы.
- **FR-42c (create-spec остаётся дверью):** воркфлоу create-spec SHALL сохранить сегодняшний UX (юзер вызывает скилл, STOP-точки, фазы), но шаги фаз SHALL исполняться MCP-вызовами (FR-40 mutation, FR-39a чтение) и фазовыми агентами (FR-41) — скилл оркестрирует, сервер делает.

**Зависит от:** FR-40 (mutation поверхность), FR-41 (фазовые агенты), FR-33 (drift-guard расширяется). Родственная дисциплина: правило commands-via-skill-reference (onboard-repo) — та же философия для команд. Evidence: `audit-reports/mcp-rails-wave-design.md` (дополнение 2026-06-07).
**Связанные AC:** [AC-42.1](ACCEPTANCE_CRITERIA.md#ac-421), [AC-42.2](ACCEPTANCE_CRITERIA.md#ac-422)
**User Story:** US-24

## FR-43

**Триаж легаси/дрейфа спек: 4 состояния + reality-anchored подозрение (расширение spec-reality-check)**

Спека может быть «реализована, но уже не актуальна» ЧЕТЫРЬМЯ разными способами с РАЗНЫМИ действиями — конфляция этих состояний и есть причина, почему «непонятно как определять». Система SHALL различать их по reality-anchored сигналам, НЕ авто-ретайрить, и фиксировать вердикт явным маркером. Запланировано ПОСЛЕ Phase 17 (P17-6 enforce — последним); это Phase 18.

- **FR-43a (4 состояния, разные действия):** триаж SHALL классифицировать спеку-кандидата в одно из четырёх: SUPERSEDED (есть версия-преемник vN→vN+1, покрывающий те же FR → архив + маркер `supersedes`); REMOVED (заявленная реализация исчезла с диска → архив/удаление); DRIFTED (код есть и работает, спека врёт про КАК → ОБНОВИТЬ спеку, это НЕ легаси); ABSORBED (FR переехали в другую подсистему → redirect/merge FR). «Всё зарефакторено» по умолчанию SHALL трактоваться как DRIFTED (re-sync), НЕ retire — иначе теряются ещё-в-силе требования.
- **FR-43b (решающий сигнал = существование реализации; переиспользовать, не строить):** триаж SHALL опираться на УЖЕ существующий skill `spec-reality-check` (категория-15 reality-drift: FILE_CHANGES-пути + символы спеки против диска) как опорный сигнал «реализация ещё есть?», скрещённый с version-lineage (slug `vN`) и not_run-by-feature (FR-32). НОВЫЙ движок ЗАПРЕЩЁН (анти-паттерн «второй валидатор»). git-staleness SHALL иметь near-zero вес — стабильная законченная спека неотличима по давности от заброшенной.
- **FR-43c (никогда не авто-определять; явный маркер, HITL):** триаж SHALL вычислять ПОДОЗРЕНИЕ и выдавать кандидатов в триаж-отчёт; финальное состояние SHALL подтверждаться человеком и записываться явным маркером (`.progress.json` `status: superseded|drifted|removed|absorbed` ИЛИ перенос в `.specs/archive/`). Авто-ретайр и авто-удаление ЗАПРЕЩЕНЫ. Решено один раз — guard больше не переспрашивает.

**Зависит от:** FR-32 (not_run-by-feature сигнал), spec-reality-check skill (категория-15 reality-drift), FR-36 (lineage по slug). Триггер-инцидент: `legacy-v3.feature` (28 сценариев SPECGEN003, инстанс SUPERSEDED) всплыл при NOT_RUN-разборе 2026-06-08. Evidence: `audit-reports/mcp-rails-wave-design.md`.
**Связанные AC:** [AC-43.1](ACCEPTANCE_CRITERIA.md#ac-431)
**User Story:** US-24

---

## Out of Scope

### FR-OUT-1: Real-time spec collaborative editing (CRDT/OT) — OUT OF SCOPE

> OUT OF SCOPE — Phase 7+ consideration. v4 не покрывает многопользовательское одновременное редактирование одного spec файла (CRDT/OT). MCP per-worktree-per-env + git workflow считается достаточным для single-developer / async team scenarios. Real-time collab — отдельная фича, требует full server architecture (WebSocket / sync engine), несовместимая с stdio MCP.

### FR-OUT-2: GUI / web dashboard для просмотра графа — OUT OF SCOPE

> OUT OF SCOPE — v4 фокусируется на agent-facing MCP API + LSP integration в IDE. Standalone GUI/web viewer для browse SpecGraph — отдельная фича (можно сделать как opt-in CLI `dev-pomogator graph-server` запускающий read-only HTTP viewer, но не в core v4 scope).

## FR-44

**Двусторонняя трассируемость (reverse-traceability)**

Граф спеки SHALL давать ОБРАТНУЮ трассировку наравне с прямой: каждый артефакт обязан трассироваться к источнику, иначе «свети дыру» (аудит 2026-06-09, audit-reports/bidirectional-traceability-audit-2026-06-09.md).

- **GT-1 (headline):** проектный тест (cucumber step-def / vitest `it()`), не имеющий узла-сценария ни в одной `.feature` спеки, SHALL детектиться. Сейчас граф строится ТОЛЬКО из `.feature` → 1195 vitest + 589 step-defs невидимы (структурная дыра — builder не сканит tests/step_definitions, tests/e2e).
- **GT-2:** FR, не ссылающийся ни на одну находку `RESEARCH.md`, SHALL детектиться (RESEARCH.md не ингестится; 47 файлов вне графа).
- **GT-3:** таск IN_PROGRESS с пустыми `refs` (ни одного требования) SHALL детектиться (сейчас аудитятся только DONE-таски через TASK_UNTESTED).
- **GT-4:** USER_STORIES / USE_CASES / DESIGN SHALL иметь обратную трассировку к требованиям.
- **Беззубые обратные проверки** (ORPHAN_TASK / SCENARIO_TAG_ORPHAN / TASK_STATUS_UNVERIFIED — warning, НЕ в GAP_CLASSES, не гейтят) — осознанно решить promote-to-gate vs keep-advisory.

### FR-OUT-3: Spec auto-generation from code (reverse engineering) — OUT OF SCOPE

> OUT OF SCOPE — v4 это spec-first инструмент (spec → code), не reverse-engineering (code → spec). Tools типа OpenLore (reverse-eng codebase to OpenSpec) — отдельная категория, может быть исследована в Phase 8+.

---

## FR-45

**Архивация доказанных легаси-спек: proof-gated execute + prune + report (исполнение FR-43)**

FR-43 даёт ПОДОЗРЕНИЕ (4 состояния, HITL, без авто-ретайра). FR-45 добавляет слой ИСПОЛНЕНИЯ: по подтверждённому подозрению система SHALL доказать заброшенность против репозитория и действовать ТОЛЬКО на твёрдом пруфе, иначе — поймать ложную тревогу («наоборот ошибка»). Доступ к спекам ТОЛЬКО через MCP-дверь (FR-39/FR-40); git-операции (перенос, prune теста) допустимы напрямую; всё git-revert-able.

- **FR-45a (пруф через дверь):** перед архивацией система SHALL вызвать дверной тул `get_archival_proof(slug)`, считающий ЖИВЫЕ входящие ссылки на спеку — граф-рёбра ИЗ не-архивных спек ПЛЮС prose/markdown-ссылки в `.specs/*` вне самой спеки. Вердикт: ARCHIVE (нет живых ссылок) / KEEP_FALSE_POSITIVE (есть → спека ещё в работе, не трогать) / SPEC_NOT_FOUND / ALREADY_ARCHIVED.
- **FR-45b (исполнение только на пруфе, TOCTOU, аудит):** `archive_spec(slug, reason)` SHALL перенести `.specs/<slug>/` в `.specs/archive/<slug>/` ТОЛЬКО когда нет живых ссылок И сигнал FR-43 принадлежит {SUPERSEDED, REMOVED, ABSORBED}; иначе ARCHIVE_BLOCKED. Ссылки SHALL переcчитываться ВНУТРИ `archive_spec` (защита TOCTOU). Каждое действие SHALL писать аудит-строку в `.dev-pomogator/logs/spec-archive.jsonl`.
- **FR-45c (архив запечатан + prune + отчёт + HITL):** запись под `.specs/archive/**` через дверь SHALL отвергаться (ARCHIVE_SEALED — архив read-only). Агент-консьюмер `spec-archive` SHALL после переноса удалить осиротевшие тесты (покрывающие ТОЛЬКО архивируемую спеку; общий тест НЕ трогать) и написать отчёт-пруф; автономно на твёрдом пруфе, эскалация на NEEDS_HUMAN, без авто-удаления неоднозначного.

**Зависит от:** FR-43 (подозрение/4 состояния), FR-39 (MCP-only доступ агента), FR-40 (mutation door), FR-42 (декларация-vs-реальность потребителей тулов), FR-36 (composite ids/lineage). Триггер: dogfood 24 кандидата дали 0 ложных архиваций (19 спасены как ещё-ссылаемые). Evidence: `audit-reports/archival-verification-plan.md`.
**Связанные AC:** [AC-45.1](ACCEPTANCE_CRITERIA.md#ac-451)
**User Story:** US-24

---

## FR-46

**Двусторонняя трассируемость задачи: задача ↔ свой BDD-сценарий + задача ↔ требование; DONE только при своём ЗЕЛЁНОМ сценарии (enforced в conformance/двери)**

Сейчас задача связывается со сценарием только через `refs: FR-N` → ко ВСЕМ `@featureN` требования (`mapTasksToScenarios`), а свой конкретный сценарий не требуется — поэтому «готово» можно поставить, ридуя на тесты всего требования, и дрейф «готово-vs-не-построено» неотличим. Доказано read-only пробой: 0 из 26 v4-задач цитируют свой `specgen004_NN`. Правило живёт в ОДНОМ месте — `conformance.ts`, который прогоняют дверь `apply_spec_change`, `spec-conformance-guard`, `conformance_check`, verdict и census.

- **FR-46a (двусторонняя связь):** задача SHALL ссылаться И на требование (`_Requirements: [FR-N]_`), И на свой конкретный сценарий (`specgen004_NN` в Done-When). FR-ref ко всему требованию НЕ заменяет ссылку на свой сценарий.
- **FR-46b (DONE только при своём зелёном):** задача SHALL NOT быть DONE, если (1) не цитирует свой `specgen004_NN`, ИЛИ (2) этот сценарий не PASSED. Закрывается новым правилом `TASK_NO_OWN_SCENARIO` + существующим `TASK_STATUS_UNVERIFIED`. Связь нужна к DONE, не к созданию (тесты пишутся ПОСЛЕ задачи, TDD); todo/in-progress без своего сценария разрешены.
- **FR-46c (порядок — детект→чистка→гейт):** правило SHALL вводиться поэтапно: сначала severity WARNING (детект + surface в census/баннере), затем ретрофит существующих задач, и ТОЛЬКО потом промоут до ERROR (дверь отказывает запись) — иначе ERROR заклинит дверь на предсуществующих нарушителях (вердикт: 129 warning). Допустимая альтернатива: дверь error-ит только на нарушении, ВВЕДЁННОМ этой записью (delta old→new), не на предсуществующих.
- **FR-46d (read-видимость):** `get_trace` SHALL surface связь задача→свой `specgen004_NN` + его результат (сейчас отдаёт `tasks:[]`).

**Зависит от:** FR-32 (evidence-derived status + honesty-gate), FR-37b (cell→atom traceability), FR-40 (mutation door прогоняет conformance), FR-44 (reverse-traceability GT-3). Триггер: дрейф 7 FR (помечены IN_PROGRESS при зелёных тестах) + проба 0/26 задач со своим сценарием (read-only `mapTasksToScenarios` на живом графе, 2026-06-12).
**Связанные AC:** [AC-46.1](ACCEPTANCE_CRITERIA.md#ac-461)
**User Story:** US-24

---

## FR-47

**Полная двусторонняя паутина трассируемости: дизайн/ресерч/история — первоклассные узлы графа + вердикт полноты требования**

FR-44 ловит обратные дыры эвристикой по тексту (FR без ресерча, upstream-unlinked). FR-47 делает паутину НАСТОЯЩЕЙ: дизайн-решения, истории и ресерч-находки моделируются узлами графа с реальными рёбрами к требованию (не текст-скан тела — «костыль», по требованию owner'а). Цель: у любой фичи 100% = все ноги привязаны (критерии + сценарий + задача + ресерч + дизайн + история), enforced в двери + видно в трассе в обе стороны.

- **FR-47a (узлы вместо текст-скана):** дизайн-решения SHALL моделироваться узлами `Decision` с ребром `covers` FR→Decision, построенным ТОЛЬКО из явной строки `**Требование:** [FR-N]` в блоке `### Decision:` (НЕ из упоминания FR в Rationale). Аналогично — USER_STORIES (`Story`) и RESEARCH-находки. Парсер + builder, не эвристика.
- **FR-47b (вердикт полноты требования):** conformance SHALL давать `FR_NO_DESIGN` (FR без покрывающего Decision), зеркально `FR_NO_RESEARCH`; и единый вердикт «полнота требования» — FR без хоть одной ноги (AC / сценарий / задача / ресерч / дизайн / история) подсвечивается через `webComplete` AND-агрегацию в `fr-census` (ВСЕ ноги, не ЛЮБАЯ — rollup-completeness-all-not-any). Поэтапно detect→retrofit→gate (как FR-46c), дельта-скоуп — не клинить дверь на предсуществующих.
- **FR-47c (read-видимость в обе стороны):** `get_trace` SHALL surface все ноги требования (decisions / research / stories), не только AC/scenario/task — чтобы реально прыгать требование↔дизайн в обе стороны (обратный индекс `backlinks` уже двусторонний).
- **FR-47d (формат-страж):** блок `### Decision:` SHALL нести строку `**Требование:** [FR-N]` (страж `design-decision-guard`) — иначе ребро не построить; аналогично для USER_STORIES/RESEARCH.

**Зависит от:** FR-44 (обратная трассируемость — FR-47 делает её graph-native), FR-46 (паттерн task↔own-scenario + detect→gate), FR-36 (composite ids), FR-40 (дверь прогоняет conformance), FR-37b (cell→atom). Триггер: owner — «текст-скан = костыль, чинить перестройкой графа; всё обратно-трассируемо во все стороны» (2026-06-13).
**Связанные AC:** [AC-47.1](ACCEPTANCE_CRITERIA.md#ac-471)
**User Story:** US-24

---

## FR-48

**Централизованный жизненный цикл статусов через дверь: переход «в работу» гейтится собранной+проверенной цепочкой (фаза-aware, detect→gate)**

FR-46 закрыл заднюю скобку («нельзя ЗАКОНЧИТЬ задачу без своего зелёного сценария»). FR-48 — передняя: нельзя НАЧАТЬ (перевести в работу) задачу, пока для её требования не собрана и не проверена вся цепочка (критерии + дизайн + история + ресерч + сценарий). Статус ставится централизованно через дверь, не свободной правкой markdown; агент узнаёт правило из текста отказа, а не из памяти.

- **FR-48a (минимальный словарь + машина переходов):** хранимые статусы SHALL быть `todo → ready → in-progress → blocked → done` (для сущностей спеки; задачи первыми, словарь обобщаемый). `ready` — новый узел «цепочка собрана и проверена, можно брать». Качественные вердикты (done-unverified / IMPLEMENTED / PLANNED) НЕ хранятся — выводятся переклички (`fr-census`) из статуса + результата теста (один источник правды). Легальные переходы (вкл. обратные `done→in-progress`, `blocked↔*`) определены; нелегальный SHALL отвергаться.
- **FR-48b (гейт «в работу», фаза-aware, detect→gate):** state-инвариант в `conformance.ts` — задача в `ready`/`in-progress`, чьё требование НЕ «собрано+непротиворечиво» (есть AC + дизайн + история + ресерч + failing-сценарий, per-FR; НЕ «работа сделана», НЕ whole-spec verdict) SHALL давать находку. ФАЗА-aware: impl-фаза гейтится строго; spec-authoring/retrofit — только «требование существует» (анти-deadlock: задача, создающая ногу, не должна блокироваться её отсутствием). Поэтапно WARNING→ERROR, дельта-скоуп — не клинить дверь на 0/47.
- **FR-48c (агент знает через deny):** текст отказа двери SHALL называть недостающие ноги + навык для сборки (`/task-status`) — discoverability в точке трения, приём как у test-guard (печатает готовую команду).
- **FR-48d (гибрид: команда + пол):** централизованная команда/тул `set_entity_status` SHALL делать типизированный переход (читает цепочку через `get_trace` → проверяет собранность + легальность → пишет: ЗАДАЧА — через mutation-путь двери с `expected_sha` CAS; ФАЗА — через атомарный писатель `.progress.json` без CAS, как существующий `-ConfirmStop`, см. FR-48e) ПЛЮС conformance-находка как пол — сырая правка markdown не обходит гейт. Навык `task-status` описывает протокол агенту.
- **FR-48e (все сущности — диспетчер по типу):** `set_entity_status` SHALL принимать ЛЮБУЮ сущность спеки и отвечать по её типу, чтобы ни одна не миновала единую дверь. **Авторские (статус ставится руками, гейтятся):** (1) ЗАДАЧА — словарь `todo→ready→in-progress→blocked→done` (FR-48a), в `TASKS.md`, запись mutation-путём + CAS (FR-48d). (2) ФАЗА (Discovery/Context/Requirements/Finalization) — единственное авторское поле `stopConfirmed` (`completedAt`/`currentPhase` ВЫВОДЯТСЯ из наличия файлов, не ставятся); авторский переход БИНАРНЫЙ: `done` = подтвердить STOP, reopen = снять; статусы `ready`/`in-progress`/`blocked` для фазы SHALL отвергаться как нелегальные-для-типа. Гейт фазы = STOP всех предыдущих фаз подтверждён + входные файлы фазы существуют + предусловие фазы (напр. Requirements → классификация «## BDD Test Infrastructure» в `DESIGN.md`). Запись статуса фазы SHALL идти через ТОТ ЖЕ полный transform `.progress.json`, что и `-ConfirmStop` (`stopConfirmed` И `currentPhase` И `completedAt` — не половинный, иначе дуальная правда), атомарным писателем `.progress.json` (НЕ mutation-путь/CAS двери — это JSON, а не markdown-док; своя concurrency-история, как у `-ConfirmStop`). **Вычисляемые (статус НЕ ставится руками):** требование (FR) / история / решение / критерий / сценарий / спека-целиком — `set_entity_status` SHALL отказать с типом `STATUS_DERIVED`, НЕСУЩИМ вычисленный вердикт (`fr-census` per-FR / `get_spec_status` per-spec) + как его менять (собрать ноги / прогнать тест); вердикт по-прежнему не хранится (FR-48a). **Discoverability:** id фазы (напр. `<slug>:phase:Requirements`) SHALL публиковаться в `get_spec_status` (фазы не узлы графа — `get_node`/`get_trace` их не возвращают; без публикации команда для фаз неюзабельна — нарушение FR-48c).

**Зависит от:** FR-46 (задняя скобка + паттерн detect→gate в conformance), FR-47 (узлы/ноги цепочки + `webComplete`/`missingLegs`), FR-40 (дверь прогоняет conformance + CAS), FR-37b (cell→atom). Триггер: owner — «через мсп ставить статусы, нельзя в прогресс пока цепочка не собрана+прочитана+свалидирована; агент должен знать; гибрид команда+пол; сразу все сущности» (2026-06-13).
**Связанные AC:** [AC-48.1](ACCEPTANCE_CRITERIA.md#ac-481)
**User Story:** US-25

---

## FR-49

**Авто-сёрфинг честного статуса + анти-false-close: гибрид (баннер несёт следующий шаг + census-aware стоп-гейт + освежение кэша на смене статуса + сверщик устаревших маркеров + LLM-судья на серую зону через Meridian)**

Инцидент (2026-06-13): агент закончил кусок (FR-48e) и СЛОЖИЛ ход «готово, дальше сам», хотя у спеки 11 требований ещё в работе; per-prompt баннер переписи УЖЕ показывал незавершённое, но пассивно игнорировался; стоп-гейт ловил передачу хода по ФРАЗАМ, не по данным. Owner: «это должно быть автоматом, частью спек-плагина; гибрид всего» (2026-06-13). FR-49 связывает существующие сурфейсеры + гейт в замкнутую петлю честного статуса. Не показывать — а ЗАСТАВЛЯТЬ.

- **FR-49a (баннер несёт следующий шаг):** per-prompt баннер переписи (`buildTaskCensusLine`) SHALL дополнительно называть ОДНУ конкретную следующую открытую задачу (из самой нагруженной спеки с незавершённым) — чтобы «что дальше» было в постоянном сигнале, не только числа. Читает кэш (`task-census.json`), граф на hot-path не строит (NFR-Performance-6).
- **FR-49b (census-aware стоп-гейт):** класс `works-done`/завершение в claim-evidence-gate, КОГДА claim про завершение СПЕКИ И кэш переписи показывает незавершённое по затронутой спеке, SHALL впечатывать реальные числа в текст блока («спека X: N готово / M в работе — не закрывай»). ЖЁСТКО привязан к спек-контексту: claim про не-спек завершение («починил опечатку») SHALL НЕ триггерить census-ветку (анти-overgeneralization, H1). Читает дешёвый кэш, граф на стоп-пути не строит. Fail-open.
- **FR-49c (смена статуса освежает кэш):** смена статуса спеки через дверь (`set_entity_status` / `apply_spec_change` по `TASKS.md`) SHALL оставлять кэш переписи свежим (баннер и гейт читают актуальные числа) — через refresh watcher'а MCP-сервера; проверяется, не предполагается.
- **FR-49d (сверщик устаревших маркеров):** сверщик (CLI) SHALL после полного прогона тестов ФЛАЖИТЬ (никогда не авто-закрывать) задачи со статусом `in-progress`, у которых все сопоставленные сценарии PASSED и Done-When выполнен — «вероятно устарело, проверь и закрой»; это класс дрейфа этой сессии (кластер FR-17). Защита от ложно-зелёного: ТОЛЬКО флаг, закрытие — человеком/агентом через `set_entity_status`.
- **FR-49e (LLM-судья на серую зону через Meridian, fail-open):** когда финальное сообщение хода — claim прогресса/завершения, БЫСТРЫЙ слой (regex `works-done`/not-found/verified + census-факт FR-49b; deferred-work-regex по фразам УДАЛЁН 2026-06-16 — и мазал по реальным стопам, и ложно фаерил на честных отчётах, поэтому судья теперь его ЕДИНСТВЕННЫЙ детектор) НЕ дал вердикта, а кэш переписи показывает незакрытое — стоп-гейт SHALL эскалировать на LLM-судью: Хайку через локальный Meridian-прокси (`POST /v1/messages`, **thinking OFF**), которому хук кладёт в промпт финальное сообщение + что агент сделал + факт переписи (N незакрытых); судья возвращает `{block, reason}`. Это ловит то, на чём regex по фразам спотыкается (announce-and-stop, тонкий слив), БЕЗ whack-a-mole с формулировками. **Транспорт — Meridian, НЕ `claude -p`:** замерено — `claude -p` ~13с (cold-start MCP/хуков/плагина), Meridian+thinking-off ~3с при 6/6 точности; thinking ON вердикт НЕ улучшает (0/6 расхождений), только +5с. **Fail-open (обязательно):** Meridian недоступен/не поднят → судья ПРОПУСКАЕТСЯ, вердикт за быстрым слоем (плагин-хук НЕ должен зависеть от прокси; у юзера без Meridian regex+факт-гейт работают). **Дистрибуция (паритет — у юзеров включено как везде):** судья ВКЛ по умолчанию (`CLAIM_GATE_JUDGE=false` чтобы выключить; мёртвый прокси = мгновенный ECONNREFUSED → no-op, не зависание); Meridian SHALL подниматься САМ через SessionStart-хук `ensure-up.cjs` (fast health-probe → detached-старт при наличии Docker, fail-open/non-blocking, `MERIDIAN_AUTOSTART=false` для opt-out); контейнер SHALL переиспользовать УЖЕ существующий хостовый логин Claude (монтирование `~/.claude`, на Windows — host-native путь через `CLAUDE_CREDS_DIR`), без отдельного `claude login`. Жёсткий потолок (не автоматизируемо): наличие Docker. Анти-цикл (cooldown + maxRetries + 8-block override) гасит возможную агрессию судьи. Рецепт вызова зафиксирован в скиле `meridian-model-call` (чтобы не изобретать медленный `claude -p`).
- **FR-49f (дверь жёстко отказывает авторингу сценария-пустышки):** запись `.feature` через дверь (`apply_spec_change`), КОТОРАЯ ДОБАВЛЯЕТ сценарий-заготовку — шаг, целиком состоящий из plain-плейсхолдера (`<...>` с пробелом ИЛИ `{...}`) ЛИБО несущий НОВЫЙ маркер `[TBD]` — SHALL быть ОТКЛОНЕНА с finding'ом слоя `strength` (нельзя заявить покрытие сценарием-пустышкой). Сигнал ТОЛЬКО точный: параметр Scenario Outline (`<amount>`, один токен без пробела) и скобка внутри текста (`{"k":"v"}`) НЕ заготовка (анти-overgeneralization, H1). NET-NEW + doc-scoped: отклоняется лишь заготовка, которую ДОБАВЛЯЕТ эта запись; легаси-пустышки в других местах НЕ клинят несвязанные правки. Оба producer'а скелетов (`create_spec`-скаффолд из шаблона, `scenario-writer`-резолвер) пишут СЫРЬЁМ мимо двери — by design (стартовый каркас и есть заготовка под заполнение); гейт кусает на авторинге/правке через дверь, где агент мог бы оставить пустышку. Fuzzy-критерии («нет негативного сценария», «нужен инвариант») — НЕ жёсткий отказ (там легко переборщить — та же ложно-отказная боль, что у пинатора), а правила написания (`feature-creation-rules.md §6`) + аудит `strong-tests`. Реализация: `tools/spec-graph/feature-strength.ts` (детектор + net-new) врезан в `validateSpecChange` слоем `strength`; bundle двери пересобран (иначе gate мёртв у юзеров).

**Self-exemption (turtle):** собственные авторские/impl-задачи FR-49 ОСВОБОЖДЕНЫ от блока FR-49b на время его постройки (гейт, блокирующий false-close, не должен блокировать постройку самого гейта) — через spec-phase-маркер / существующий self-marker гейта.

**Зависит от:** FR-48 (дверь `set_entity_status`), FR-20 (баннер + side-channel лог), FR-32 (перепись/coverage машинерия), claim-evidence-gate (живой стоп-хук). Триггер: owner «автоматом частью спек-плагина; гибрид всего и протести» (2026-06-13).
**Связанные AC:** [AC-49.1](ACCEPTANCE_CRITERIA.md#ac-491), [AC-49.2](ACCEPTANCE_CRITERIA.md#ac-492), [AC-49.3](ACCEPTANCE_CRITERIA.md#ac-493)
**User Story:** US-26

---

