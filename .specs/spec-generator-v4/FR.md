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

System SHALL function correctly across environments: host (Win/Mac/Linux), VS Code / Cursor IDE agent hosts, VS Code devcontainer, WSL2, Hyper-V VM. Specifically:
- All file paths in MCP API responses ARE relative to `git rev-parse --show-toplevel` (never absolute, never container-internal-only)
- `chokidar` watcher auto-detects slow FS via touch test at startup (create temp file, await event ≤500ms); if event missed → enable polling mode (1s interval) + log decision
- `.mcp-lock.json` tags `env` field (e.g., `host`, `container:devcontainer-abc123`, `wsl:ubuntu`) as a **presence/heartbeat lock**, not a lifetime write lock. A second concurrent session does NOT crash (P21-1/P28-6): its door boots as a presence-reader — reads + the `propose_spec_change` dry-run stay live, and `apply_spec_change`/`delete_spec_doc`/`create_spec` still run. Mutations serialize only for the short critical section through `.mcp-write.lock`; a true in-flight writer can return transient `WRITE_LOCK_BUSY`, and same-doc stale writes are refused by `CAS_MISMATCH` via `expected_sha`. A different-`env` collision additionally surfaces the env-mismatch hint.
- `claude` CLI must be installed in each env where Claude Code runs (documented in onboard-repo flow)
- Cursor IDE is a supported second agent host for the same SpecGraph/MCP door when project `.claude/` is present and `.cursor/mcp.json` registers the door (see [FR-81](#fr-81)); Claude Code remains the canonical plugin distribution channel

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
- `full` — light + LLM-semantic pairwise FR/AC compare via `spec-llm-judge` through the local **Meridian** subscription proxy (`/v1/messages`, thinking OFF, ~3s/pair Haiku — measured 3841ms; NOT `claude -p` ~13s, see skill `meridian-model-call`). Per-pair semantic calls use a 120-second timeout. Fail-open: Meridian down / non-200 / timeout → spawn throws → `SUBPROCESS_FAILED` → mechanical findings are preserved, `cross-spec/semantic-check-failed` WARNING is emitted for the affected pair, and the report is marked `partial: true` with `partial_reasons[]` (no slow-path fallback). Caches per-pair sha256 content hash to avoid re-evaluation.

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

## FR-32

**Task status SHALL be evidence-derived from the latest test run, with a honesty gate**

System SHALL derive each task's effective status from the latest BDD/test run (`.dev-pomogator/.last-test-run.ndjson`) instead of trusting the hand-authored `Status:` field, by mapping each task to its scenarios via the task's `@featureN` / `SPECGEN004_NN` references and FR `refs[]`:

- A task's `verified_status` SHALL be `DONE` only when EVERY mapped scenario is `PASSED` in the latest run.
- If any mapped scenario is `pending` / `undefined` / `ambiguous` / `failed`, `verified_status` SHALL be capped at `IN_PROGRESS` (never `DONE`).
- A task with no mapped scenarios SHALL fall back to its hand-set status flagged `verified_status = "unverified"`.

System SHALL emit conformance finding `TASK_STATUS_UNVERIFIED` (severity WARNING) WHEN a task's hand-set `Status: DONE` conflicts with a `verified_status < DONE` — the honesty gate. The finding `suggestions[]` SHALL name the offending scenario(s) and their bucket. `spec-status.ts -Format task-table` SHALL render `verified_status` (not the raw field) so the summary table cannot claim DONE without green scenarios.

This codifies the manual discipline applied during the 2026-06-02 coverage audit (no task DONE while its BDD scenario is pending/undefined/ambiguous) into the spec-generator itself, removing the human as the enforcement point.

**Зависит от:** FR-2 (SpecGraph task↔scenario edges), FR-13 (conformance findings), FR-30 (MCP node surface). Surfaced via MCP `get_spec_status` (view coverage: per-scenario buckets + per-task derived status) and `get_trace` (`verified_status` per node).
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

**FR-34b (catch immediately — hook + provenance-safe gate):** A SessionStart hook SHALL capture a read-only fingerprint baseline of dirty `.specs/**/*.md` files, and a PostToolUse hook on Write/Edit of `*.md` SHALL record the exact spec file touched by that `session_id`, run the anchor-integrity check, and inject a `<system-reminder>` listing broken anchors + the suggested fix (throttled, reusing the FR-6 push idiom). The Stop-gate (modelled on `claim-evidence-gate`) SHALL block declaring "done" only for unresolved anchors in files both changed since that session's baseline and recorded as touched by that session. Pre-existing or other-session changes SHALL NOT be attributed as `you edited`; changes without a reliable baseline/touch record SHALL be reported as `provenance unknown` and fail open. Staged and unstaged fingerprints SHALL be classified read-only without mutating the Git index. The audited escape hatch `[skip-anchor-fix: <reason>]` remains logged to `.claude/logs/`.

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
**Связанные AC:** [AC-36.1](ACCEPTANCE_CRITERIA.md#ac-361), [AC-36.2](ACCEPTANCE_CRITERIA.md#ac-362), [AC-36.3](ACCEPTANCE_CRITERIA.md#ac-363), [AC-36.4](ACCEPTANCE_CRITERIA.md#ac-364), [AC-36.5](ACCEPTANCE_CRITERIA.md#ac-365), [AC-36.6](ACCEPTANCE_CRITERIA.md#ac-366), [AC-36.7](ACCEPTANCE_CRITERIA.md#ac-367), [AC-36.8](ACCEPTANCE_CRITERIA.md#ac-368), [AC-36.9](ACCEPTANCE_CRITERIA.md#ac-369), [AC-36.10](ACCEPTANCE_CRITERIA.md#ac-3610)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-21

---


**FR-36f — first-class identity (GitHub #172):** каждый spec-owned узел SHALL иметь exact canonical identity `<namespace>:<localId>`, собираемую и разбираемую одним pure contract без ad-hoc slicing. Namespace MAY быть иерархическим path-like slug; localId SHALL NOT содержать `:`. Exact spelling canonical identity SHALL сохраняться при parse/format round-trip.

**FR-36g — normalization safety:** case-fold и Unicode NFKC SHALL использоваться только для обнаружения конфликтов. Два exact/case/NFKC-equivalent localId в одном canonical namespace SHALL давать blocking identity-collision с обоими исходными ID/файлами; одинаковый localId в разных namespaces SHALL оставаться допустимым.

**FR-36h — lookup compatibility:** qualified lookup и `{spec,node_id}` SHALL возвращать exact canonical node; bare lookup с несколькими кандидатами SHALL оставаться fail-loud `AMBIGUOUS_BARE_ID`, дополненным `local_id` и sorted canonical candidates. Alias/import SHALL NOT переписывать canonical node/edge/backlink identity; полноценный import transport остаётся в #164.
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
- **FR-39c (default-on enforce with explicit opt-out):** PreToolUse-хук `spec-access-guard` на Read|Grep|Glob|Edit|Write|Bash SHALL включать deny по умолчанию, когда ни один поддерживаемый сигнал не задан. Приоритет сигналов SHALL быть `SPEC_ACCESS_ENFORCE` → `CLAUDE_PLUGIN_OPTION_spec_access_enforce` → `CLAUDE_PLUGIN_OPTION_SPEC_ACCESS_ENFORCE`; первый заданный и распознаваемый `true|1|false|0` побеждает, нераспознаваемое значение пропускается, явный `false|0` включает shadow. Escape hatch `[skip-spec-access: <reason ≥8>]` + JSONL-аудит по образцу scope-gate. Хук фильтрует по `.specs/` ДО любого I/O, SHALL детектить whole-tree Git-мутации (`git add -A`/`--all`, `git commit -a`/`-am`) без литерала пути, SHALL оставлять текст commit message данными, а structured deny SHALL переживать реальный bootstrap/tsx-runner без подмены причины диагностикой runner-а. Каждый command-hook SHALL загружать bootstrap по абсолютному пути через `path.resolve`, чтобы запуск без `CLAUDE_PLUGIN_ROOT` не деградировал в package lookup / `MODULE_NOT_FOUND`.
- **FR-39f (Bash-матчер: агент vs движок — алгоритм, не эвристика):** для Bash-вызовов наивный матч «`.specs/` в команде» ЗАПРЕЩЁН — он убил бы легитимные запуски движковых CLI (`spec-verdict.ts -Path .specs/X`, `corpus-health`, `--check tasks .specs/...`). Матчер SHALL различать: (1) ВАЙТЛИСТ движковых CLI (поимённый список скриптов в DESIGN: spec-verdict, validate-spec, audit-spec, spec-status, corpus-health, collision-probe, spec-form-parsers --check, scaffold-spec, anchor-integrity) — команда, чей исполняемый скрипт в вайтлисте, ALLOW независимо от `.specs/`-аргументов; (2) generic-читалки/писалки (cat/sed/grep/awk/головые `node -e`/heredoc-скрипты) с `.specs/`-путями — VIOLATION (лог в shadow, deny в enforce). Ad-hoc node-скрипты, пишущие в спеки, — ровно тот обход, который матчер обязан ловить.
- **FR-39g (сосуществование с form-guards):** `spec-access-guard` SHALL регистрироваться ПЕРВЫМ в PreToolUse-цепочке (дисциплина доступа раньше валидации формы); каждый guard отвечает СВОИМ именем в permissionDecisionReason — агент различает «не тем путём» от «не та форма». В enforce-режиме агентские записи в спеки идут через MCP (FR-40) — server-side fs-записи PreToolUse-хуков НЕ триггерят, поэтому form-валидация SHALL вызываться СЕРВЕРОМ in-process (FR-40b) — стражи не дерутся, контракт один.
- **FR-39d (хук живой, не мёртвый):** `spec-access-guard` SHALL быть зарегистрирован в ОБОИХ манифестах (`.claude/settings.json` + `.claude-plugin/hooks.json`), пройти deps-absent прогон, попасть в поимённый пин SPECGEN004_52 и в PROTECTED_HOOKS meta-guard-а — урок пяти мёртвых стражей (P16-1) кодируется требованием. Cursor third-party hooks load the **project** `.claude/settings.json` (not `.claude-plugin/hooks.json`); dogfood therefore depends on project settings remaining present (see [FR-81](#fr-81) / FR-81f).
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
- **FR-46b (DONE только при своём зелёном):** задача SHALL NOT быть DONE, если (1) не цитирует свой `specgen004_NN` И не имеет принятого FR-52/F7 many→few covering-сценария с PASSED результатом, ИЛИ (2) процитированный собственный сценарий не PASSED. Закрывается новым правилом `TASK_NO_OWN_SCENARIO` + существующим `TASK_STATUS_UNVERIFIED`. Связь нужна к DONE, не к созданию (тесты пишутся ПОСЛЕ задачи, TDD); todo/in-progress без своего сценария разрешены. Исключение many→few ослабляет только «нет своего id» для мигрированных консолидированных сценариев; красные/непрогнанные mapped-сценарии всё ещё видны отдельным honesty-гейтом.
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

**Авто-сёрфинг честного статуса: shared census/router + cache refresh + stale-marker reconciler (Pinator Stop-judge policy → [.specs/pinator/](../pinator/FR.md))**

Инцидент (2026-06-13): агент закончил кусок (FR-48e) и СЛОЖИЛ ход «готово, дальше сам», хотя у спеки 11 требований ещё в работе; per-prompt баннер переписи УЖЕ показывал незавершённое, но пассивно игнорировался; стоп-гейт ловил передачу хода по ФРАЗАМ, не по данным. Owner: «это должно быть автоматом, частью спек-плагина; гибрид всего» (2026-06-13). FR-49 связывает существующие сурфейсеры + гейт в замкнутую петлю честного статуса. Не показывать — а ЗАСТАВЛЯТЬ.

- **FR-49a (scope-aware next-step router; баннер несёт следующий шаг без чужого scope):** per-prompt баннер переписи (`buildTaskCensusLine`) SHALL дополнительно называть ОДИН конкретный следующий шаг, но источник «следующего» SHALL быть привязан к ТЕКУЩЕМУ мандату агента, а не к глобальному backlog корпуса. Приоритет выбора строгий и общий для баннера + Stop-gate `nextLine`/`nextOpenTask`: (1) текущий открытый todo самого агента из transcript (`TodoWrite` / `TaskCreate` / `TaskUpdate`, `agentNextOpenTodo`) — всегда сильнее spec-census; (2) активная async-работа агента (background Bash, background Agent/subagent, pending completion) — «следующее» должно ждать/обработать именно этот результат и НЕ подсовывать отдельный backlog; (3) текущая спека рабочего контекста (последняя spec-mutation / `create_spec` / `apply_spec_change` / raw spec write, только в текущем repo root) — можно назвать `nextOpen` ТОЛЬКО этой спеки; (4) если agent todo нет, async нет, текущая спека по контексту сделана или текущий slug неизвестен, глобальный census остаётся только health-сводкой и SHALL НЕ печатать `👉 следующее` из чужой спеки. Hook data root SHALL браться из payload (`cwd` / `workspace_roots[0]`) и валидироваться как текущий проект; `CLAUDE_PLUGIN_ROOT` / `process.cwd()` могут служить только для загрузки скрипта, но НЕ для чтения `.dev-pomogator/.task-census.json`. Регрессия: сессия в `E:\repos\lm-saas`, где создаётся `.specs/reel-agent-marketplace/`, SHALL NOT получить `dev-pomogator → spec-generator-v4 → WS-F/@feature35` как next-step. Читает кэш (`task-census.json`), граф на hot-path не строит (NFR-Performance-6).
- **FR-49b (Pinator Stop policy — owned elsewhere):** whole-spec completion blocking, claim classification, Meridian/помогатор judge, fire/marker policy, and require-next-section live under [.specs/pinator/](../pinator/FR.md) modules **M1–M2** (migrated from claim-evidence-gate). FR-49 only supplies the shared census/router facts those consumers may read; it SHALL NOT redefine Pinator judge policy here.
- **FR-49c (смена статуса освежает кэш):** смена статуса спеки через дверь (`set_entity_status` / `apply_spec_change` по `TASKS.md`) SHALL оставлять кэш переписи свежим (баннер и гейт читают актуальные числа) — через refresh watcher'а MCP-сервера; проверяется, не предполагается.
- **FR-49d (сверщик устаревших маркеров):** сверщик (CLI) SHALL после полного прогона тестов ФЛАЖИТЬ (никогда не авто-закрывать) задачи со статусом `in-progress`, у которых все сопоставленные сценарии PASSED и Done-When выполнен — «вероятно устарело, проверь и закрой»; это класс дрейфа этой сессии (кластер FR-17). Защита от ложно-зелёного: ТОЛЬКО флаг, закрытие — человеком/агентом через `set_entity_status`.
- **FR-49f (дверь жёстко отказывает авторингу сценария-пустышки):** запись `.feature` через дверь (`apply_spec_change`), КОТОРАЯ ДОБАВЛЯЕТ сценарий-заготовку — шаг, целиком состоящий из plain-плейсхолдера (`<...>` с пробелом ИЛИ `{...}`) ЛИБО несущий НОВЫЙ маркер `[TBD]` — SHALL быть ОТКЛОНЕНА с finding'ом слоя `strength` (нельзя заявить покрытие сценарием-пустышкой). Сигнал ТОЛЬКО точный: параметр Scenario Outline (`<amount>`, один токен без пробела) и скобка внутри текста (`{"k":"v"}`) НЕ заготовка (анти-overgeneralization, H1). NET-NEW + doc-scoped: отклоняется лишь заготовка, которую ДОБАВЛЯЕТ эта запись; легаси-пустышки в других местах НЕ клинят несвязанные правки. Оба producer'а скелетов (`create_spec`-скаффолд из шаблона, `scenario-writer`-резолвер) пишут СЫРЬЁМ мимо двери — by design (стартовый каркас и есть заготовка под заполнение); гейт кусает на авторинге/правке через дверь, где агент мог бы оставить пустышку. Fuzzy-критерии («нет негативного сценария», «нужен инвариант») — НЕ жёсткий отказ (там легко переборщить — та же ложно-отказная боль, что у пинатора), а правила написания (`feature-creation-rules.md §6`) + аудит `strong-tests`. Реализация: `tools/spec-graph/feature-strength.ts` (детектор + net-new) врезан в `validateSpecChange` слоем `strength`; bundle двери пересобран (иначе gate мёртв у юзеров).

- **FR-49h (transcript todo replay reconciliation; no stale `agentOpenTodo`, 2026-07-09):** live Pinator incident after the CARL evidence commit proved that FR-49a's `agentNextOpenTodo` layer can become false when reconstructed from compacted/transcript tool events by positional index instead of real task id. Observed evidence: Stop fire logged `agentNextOpenTodo="Capture real CARL runtime evidence"` and ~79/80 open tasks even after the real evidence file existed, BDD `CARL001_(03|09|10)` passed, and the commit was complete; root cause was transcript replay using sparse/non-monotonic `TaskCreate`/`TaskUpdate` history where a later visible `Task #72` completion did not close older internal duplicate entries (`id:5/30/35/37/59`). The router SHALL keep agent-todo priority, but only over a canonicalized todo view: replay keys updates by real task id from tool metadata/result/input, never `tasks[id-1]`; duplicate subjects within the same scope are normalized and collapsed by newest-event plus completion/evidence precedence; ambiguous duplicate clusters are logged and demoted rather than allowed to block as stale work; compaction/rebase snapshots SHALL not resurrect pre-compaction open duplicates once a later completion/evidence event exists; fire logs SHALL include selected source, real id, transcript event location/range, and reconciliation reason. Regression target: replaying the captured CARL incident transcript SHALL NOT select stale `Capture real CARL runtime evidence` after the evidence file + BDD proof + commit exist, and completing visible task `#72` SHALL update the task with real id `72`, not array slot 71 or a stale internal id.

**Self-exemption (turtle):** historical while FR-49b lived as an in-v4 Stop block; Pinator ([.specs/pinator/](../pinator/FR.md)) now owns self-markers / judge exemptions. FR-49 no longer defines that block.

**Зависит от:** FR-48 (дверь `set_entity_status`), FR-20 (баннер + side-channel лог), FR-32 (перепись/coverage машинерия), [pinator](../pinator/README.md) (живой стоп-хук; runtime `tools/claim-evidence-gate/`). Триггер: owner «автоматом частью спек-плагина; гибрид всего и протести» (2026-06-13).
**Связанные AC:** [AC-49.1](ACCEPTANCE_CRITERIA.md#ac-491), [AC-49.2](ACCEPTANCE_CRITERIA.md#ac-492), [AC-49.3](ACCEPTANCE_CRITERIA.md#ac-493), [AC-49.4](ACCEPTANCE_CRITERIA.md#ac-494)
**User Story:** US-26

---



### 2026-07-30 ownership clarification

FR-49 owns reusable spec/task state machinery only:
- scoped task census resolves the target workspace and never leaks the plugin repository backlog;
- shared next-step routing prefers current-session agent todo, then relevant active async work, then current-spec open work, with no global fallback for unknown scope;
- lifecycle mutations refresh census and stale in-progress reconciliation remains flag-only and own-scenario-based;
- task replay keys successful TaskCreate/TaskUpdate events by real task ID, rolls back failed updates, and demotes ambiguous duplicate subjects;
- Pinator eligibility, completion-claim classification, judge/provider behavior, fire/marker policy, no-progress/blocker handling, and native `/goal` integration are owned by [.specs/pinator/](../pinator/FR.md) (M1–M2) and are not activated by FR-49 alone.

The earlier global-gate clauses in this section are superseded by this clarification; their completed tasks remain historical implementation evidence, not the current product contract.
## FR-50

**Жёсткий отказ закрывать намеренно-отложенную (waived) задачу — анти-fake-close через дверь**

Инцидент (2026-06-17): при разборе backlog-а агент чуть не закрыл `verify-phase0-red` — задачу, намеренно оставленную ОТКРЫТОЙ (advisor-вейвер 2026-06-07: red-precondition пост-фактум непроверяема, флип = soft fake-DONE). Поймала РУЧНАЯ сверка с кодом (прочитал блок, увидел `_waived:`), а не дверь — защита держалась на внимательности, что ненадёжно. Owner: «как это в спек-генераторе мсп автоматизровать… довести до грин с тестами» (2026-06-17). FR-50 автоматизирует ровно ту сверку: дверь сама знает про `_waived:` и отказывает закрытие. Тот же приём, что у гейта цепочки (FR-48b) и own-scenario-гейта (FR-46) — опасный переход гейтится в conformance, дверь его прогоняет.

- **FR-50a (вейвер виден графу):** парсер задач спек-графа (`tools/spec-graph/parsers/tasks.ts`) SHALL поднимать маркер `_waived: <причина>_` из тела блока в поле `TaskNode.waived` — тот же маркер, что форм-гейт уже пропускает, через ОБЩИЙ `WAIVED_RE` (единый источник, чтобы два regex не разъехались). Колоночный `- [..]`-буллет с `id:` SHALL быть ГРАНИЦЕЙ задачи даже при неэнумном `Status:` (напр. `WONT-VERIFY`): иначе строки задачи-сироты (включая её `_waived:`) втекают в тело ПРЕДЫДУЩЕЙ задачи и приписывают вейвер ей (ложный TASK_WAIVED_CLOSED на соседней DONE-задаче). `headerOf` НЕ ослабляется — задача с неэнумным статусом остаётся невидимой графу (намеренно), но больше не «течёт».
- **FR-50b (команда отказывает закрытие waived):** `set_entity_status`, КОГДА у задачи стоит `waived` И целевой статус — `done`, SHALL ОТКЛОНИТЬ переход с `error: WAIVED` + причиной вейвера + указанием «убери маркер `_waived:` отдельной правкой, чтобы снять вейвер». Для задачи, НЕВИДИМОЙ графу (неэнумный статус), на попытке закрытия SHALL сканировать `TASKS.md` и вернуть причину вейвера (мотивирующий случай `verify-phase0-red`), а не глухой `NOT_FOUND`. Снятие вейвера — намеренная правка, удаляющая маркер, НЕ флип статуса.
- **FR-50c (conformance-пол, необходимый):** `checkConformance` SHALL эмитить находку `TASK_WAIVED_CLOSED` severity **ERROR**, когда у задачи стоит `waived` И статус `done`. Дверь уже фильтрует error-severity → любой `apply_spec_change`, флипающий waived-задачу в DONE, ОТКЛОНЯЕТСЯ. ERROR (не staged-WARNING как FR-46/47/48): «waived + done» — логическое противоречие без легитимного применения и (проверено сканом корпуса) с НУЛЁМ легаси-нарушителей, поэтому дверь отказывает сразу. Единственный сигнал — `TaskNode.waived` (поднятый парсером из того же `WAIVED_RE`), поэтому пол и команда не расходятся.

**Зависит от:** FR-48 (дверь `set_entity_status` + lifecycle-машина), FR-32 (граф задач + conformance), FR-5 (форм-парсер задач — владелец `WAIVED_RE`). Триггер: owner «как это в спек-генераторе мсп автоматизровать… че за стройка впереди» (2026-06-17).
**Связанные AC:** [AC-50.1](ACCEPTANCE_CRITERIA.md#ac-501), [AC-50.2](ACCEPTANCE_CRITERIA.md#ac-502)
**User Story:** US-29

---

## FR-51

**Универсальный BDD-мигратор: инвентаризация + классификация + корпусная дорожная карта (plan P2 / FR-M1)**

После ручного переноса claim-evidence-gate на БДД (пилот SPECGEN004_186..198 доказал рецепт) owner выбрал «сначала собрать мигратор» (2026-06-17), чтобы остальные ~188 не-БДД тест-файлов (2137 кейсов) не переносить руками по одному. FR-51 кодифицирует мехнизируемый фронт рецепта; шипится в плагине (node-builtins-only, dep-safe).

- **FR-51a (инвентаризация + классификация):** `tools/bdd-migrator/inventory.ts` SHALL парсить не-БДД тест-файл в структурный инвентарь (describe/it, id, прод-импорты) и классифицировать КАЖДЫЙ кейс по тому, КАК он гоняет код: `runtime` (spawn реального процесса — прямо ИЛИ через хелпер, чьё тело спавнит, напр. `runHook`), `artifact` (fs-чтение реального артефакта), `pure` (прямой in-process вызов прод-функции), `manual` (it.skip/it.todo → @wip). Класс определяет форму BDD-степа. Детект хелпера обязателен: кейс, зовущий `runHook()`, — runtime, хотя его собственное тело не спавнит.
- **FR-51b (корпусная дорожная карта):** `tools/bdd-migrator/corpus.ts` SHALL обойти репо, заинвентаризировать каждый не-БДД тест-файл и ранжировать easy-first (mostly-pure = easy: детерминированные in-process степы; runtime/artifact = medium; manual/большой = hard) — видимый приоритизированный ledger для многозаходного rollout (FR-M5).
- **FR-51c (ко-локированный юнит-хвост → BDD):** Оставшийся ко-локированный юнит-хвост (`tools/**/__tests__/*.test.ts` 63 + `.claude/skills/**/__tests__/*.test.ts` 4 — §9 `audit-reports/coverage-not-run-rollcall-analysis.md`) SHALL мигрироваться ПО ОБЛАСТИ (одна homeless-feature `PLUGINxxx_<area>.feature` + step-def агентом `bdd-migrator`, независимыми волнами): преимущественно pure (sample-verified spawn-grep — spec-graph 18 / spec-mcp-server 13 / marksman-installer 4 / skills 4 гоняют код прямым in-process import+call, приём `spec-status`/`plan-validator`, без spawn), а spawn-class файлы (anchor-integrity 2, specs-validator 1, plan-pomogator 1, claim-evidence-gate 1, spec-backlog 1 resolver) — per их класс (runtime step-def на реальном движке/хуке, без моков). Каждая волна зелена в Docker через детерминированный unique-config обход, mutation-проверена (сломать движок → сценарий RED → восстановить), vitest-двойник выпилен ПОСЛЕ зелёного эквивалента. ИСКЛЮЧЕНЫ как fixtures (НЕ цель миграции): backlog `.specs/backlog/**/_artifact/__fixtures__/*.test.ts` (10 — сгенерённое scaffolding с мёртвыми ссылками на снятый v2.0 `extensions/`-layout + несуществующий прод; corpus `SKIP_DIRS` уже исключает `.specs`, guard уже allowlist `__fixtures__/`). ОТДЕЛЬНАЯ ЗАМЕТКА: §9 «3 не-TS-совпадения» (`*_test.py`/`*Tests.cs`) — это НЕ цель миграции: единственные `*Tests.cs` — fixtures (`tests/fixtures/dotnet-stryker-target`, `tests/fixtures/steps-validator`), `*_test.py` вне own-domain = 0, а session-pilot/TUI Python — собственный домен (своя спека, pilot-API тесты); ЖИВОЙ не-TS тест прод-кода (если появится) → language-native BDD (pytest-bdd/behave, Reqnroll) отдельной дорожкой, не cucumber-js. РИСК (§9): часть хвоста — тесты САМОЙ инфраструктуры графа/переклички (`coverage.test.ts`/`task-census.test.ts`/`ndjson-ingester.test.ts`) → мигрировать ВМЕСТЕ/ПОСЛЕ фикса-читателя переклички, не под движущуюся мишень.

- **FR-51d (wire-time tag promotion):** `scripts/wire-feature.mjs` SHALL, while holding the same shared wiring lock, validate every `@featureN` tag in the target `.feature` against an existing same-spec `FR-N`, promote immediately-preceding comment tag lines (`# @featureN`, plus control tags such as `# @manual`/`# @wip` on that tag line) to real Gherkin tag lines, and atomically write the promoted feature content together with the idempotent `cucumber.json` path update. If any promoted/current `@featureN` does not resolve to a same-spec FR, the wire step SHALL refuse before touching either file, preventing a wrong tested-by edge.

**Зависит от:** пилот (claim-evidence-gate перенос, SPECGEN004_186..198). Триггер: owner «сначала собрать мигратор» (2026-06-17).
**User Story:** US-30

---

## FR-52

**Session dogfood hardening — door/MCP/BDD-workflow frictions surfaced in use (2026-06-18)**

Аудит сессии раскатки BDD-миграции (`audit-reports/session-dogfood-findings-2026-06-18.md`) вскрыл ряд frictions/багов воркфлоу — пойманных при РЕАЛЬНОМ использовании двери и BDD-конвейера, не теоретически. FR-52 кодифицирует их как требования к харднингу; каждое — отдельный детерминированный фикс с тестом. Owner: «много догфуда багов спекгенератора мсп тулов и воркфлоу... план работ по фиксу, фиксим через добавление в спеки, анализ и отчет» (2026-06-18).

- **FR-52a (канонический ndjson клоббер-безопасен):** отфильтрованный/scoped cucumber-прогон (`--name`, частичный `paths`) SHALL НЕ перезаписывать канонический `.dev-pomogator/.last-test-run.ndjson` — иначе `spec-verdict`/перепись/стоп-гейт читают частичный прогон как полный и врут `not_run`. Только ПОЛНЫЙ прогон пишет канонический артефакт; фильтрованные → throwaway ndjson (обёртка/гейт формата). Инцидент F2: диагностический `--name`-прогон затёр покрытие всех спек, пришлось перепрогонять полный сьют. **Умная история прогонов (идея owner'а 2026-06-18): затирание → фича.** КАЖДЫЙ прогон SHALL архивироваться кусочком `.dev-pomogator/.test-history/run-<epoch>-<kind>.ndjson` + компактной строкой индекса (`ts`, `kind` full/filtered, `scenarios`, `durationMs`, `exit`); полные payload-куски ротируются (последние N=30), индекс-строки долгоживущие — ни один прогон не потерян + видны тренды по времени; полный кусок хранит per-step тайминги и точный pass/fail (через канонический парсер). Реализация: `scripts/run-bdd.mjs` (фильтрованный → throwaway + архив; полный → канонический + архив; verified: фильтрованный прогон оставляет канонический нетронутым).
- **FR-52b (anchor-fix через дверь под enforce):** чинилка якорей (FR-34) SHALL иметь door-совместимый путь под `SPEC_ACCESS_ENFORCE` — сейчас `fix.mjs --apply` И блокируется Bash-гардом (`.specs/` в команде, не whitelisted), И пишет `.specs/` напрямую мимо двери. Нужен door-тул (считает canonical slug через `marksman-slug.mjs`, пишет валидированной дверью) ЛИБО enforce-aware remediation в `anchor_gate_stop` (перестать советовать запрещённый под enforce `fix.mjs`). Инцидент F3/F10: 3 якоря чинились вручную (hand-computed GLFM slug + door).
- **FR-52c (validate_anchor: ясность + heading-slug):** `validate_anchor` SHALL в описании явно различать spec-graph compact-id/alias-реестр (что он проверяет) от Marksman heading-слагов (FR-34, что он НЕ проверяет), и SHALL получить проверку резолва `DOC.md#heading-slug` (reuse `marksman-slug.mjs` + заголовки дока). Инцидент F4: тул молча ответил `registered:false` про другой смысл «якоря».
- **FR-52d (audit ловит v1→v2 дрейф путей FILE_CHANGES):** когда `edit`-путь в FILE_CHANGES совпадает с удалённым v1-префиксом (`src/`, `extensions/`) И файла нет — audit SHALL эмитить конкретную находку «v1-layout путь — ремапь в v2 `.claude/...` или удали», а не только generic FILE_CHANGES_VERIFY. Инцидент F5: 14 мёртвых v1-строк у pomogator-doctor классифицировались вручную.
- **FR-52e (FR-32 join: задача verified своим сценарием, не worst-of-feature):** rollup покрытия FR-32 SHALL скоупить «verified» к РЕЗУЛЬТАТУ собственного покрывающего сценария задачи, не worst-of по всем сценариям её @featureN (включая not-run `@manual`) — иначе задача с зелёным покрывающим сценарием ложно остаётся DONE-but-unverified. Инцидент F8: strong-tests:t29 (покрыт passed-сценарием TESTQUAL001_10) висит unverified.
- **FR-52g (кардинальность задача↔сценарий для миграций):** conformance SHALL accept migrated many→few consolidation for `TASK_NO_OWN_SCENARIO`: DONE-задача без собственного `specgen004_NN` не флагается этим правилом, если она мапится через `@featureN`/FR хотя бы на один PASSED covering-сценарий. Непрошедшие/непрогнанные mapped siblings остаются видимы через `TASK_STATUS_UNVERIFIED`; исключение ослабляет только требование 1:1 own-id для консолидированных миграций. Инцидент F7: strong-tests 12 задач покрыты 6 consolidated scenarios.
- **FR-52f (изменение поведения двери обязано обновить свой BDD в том же изменении):** WHEN изменение кода двери/локов меняет наблюдаемое поведение (как незакоммиченная переделка «E-A»: убран lifetime read-only-замок, `readOnlyRefusal` → no-op) THEN оно SHALL обновить свой BDD-сценарий + FR в ТОМ ЖЕ изменении — иначе стейл-сценарий валит канонический сьют (класс verify-divergent-contracts). Инцидент F1: SPECGEN004_149 тестирует УБРАННУЮ read-only-семантику → красный; обновление — за автором E-A (чужая незакоммиченная работа, код двери не трогаю).

**Зависит от:** FR-32 (перепись/coverage), FR-34 (Marksman anchor-integrity), FR-37 (smart-verdict/audit), FR-39 (MCP-дверь/enforce), FR-51 (мигратор). Триггер: owner «много догфуда багов... фиксим через добавление в спеки, анализ и отчет» (2026-06-18); полный анализ — `audit-reports/session-dogfood-findings-2026-06-18.md`.
**Связанные AC:** [AC-52.1](ACCEPTANCE_CRITERIA.md#ac-521)
**User Story:** US-31

---

## FR-53

**Deterministic mutation kill verifier (`verify-kill`) — trustworthy mutation-parity gate for BDD migration**

System SHALL provide `tools/stryker-mutation/verify-kill.ts` — the deterministic inject+restore kill-gate used as the mutation-parity step of the BDD migration workflow (FR-51). The tool is trustworthy where the `@stryker-mutator/cucumber-runner` aggregate is not (evidence: `audit-reports/stryker-bdd-mutation-finding.md` documents up to 48 verdict flips between identical runs due to `supportCodeLibrary` reuse across mutants).

**FR-53a (`verifyKill` — deterministic three-phase verify):** `verifyKill(spec, run)` SHALL execute: (1) baseline — run ONLY the covering scenario, MUST pass (green start, else throw); (2) inject — replace `original→mutant` on disk, run the scenario, a FAIL result means killed; (3) restore — ALWAYS restore the file via `try/finally`, then re-run, MUST pass. SHALL throw when `original` is absent OR baseline is not green. Return value SHALL carry `{ verdict: 'KILLED'|'SURVIVED', killed, baseline, mutant, restored }`. Node builtins only (`node:fs`, `node:child_process`) — safe to ship in-plugin.

**FR-53b (`verifyBatch` — gate over a survivor set):** `verifyBatch(specs, run)` SHALL verify a list of mutants, restoring each file per-mutant, and tally `{ total, killed, survived, errors }`. A bad spec (original absent or red baseline) SHALL produce verdict `ERROR` in the per-spec results — not a crash, batch always completes. CLI gate exit: 0 only if `killed === total`.

**FR-53c (`runScenario` — the real cucumber runner):** `runScenario(config, name)` SHALL run a covering scenario via `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js -c <config> --name <name>`, parse `N scenarios (...)` from combined stdout+stderr, and return `{ passed, ran, summary }`. A run where `ran === 0` SHALL NOT count as passed (`passed` requires `status === 0 AND ran >= 1 AND !failed`).

**Связанные AC:** [AC-53.1](ACCEPTANCE_CRITERIA.md#ac-531), [AC-53.2](ACCEPTANCE_CRITERIA.md#ac-532), [AC-53.3](ACCEPTANCE_CRITERIA.md#ac-533)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-30

---

---

## FR-54

**TASKS.md task-id rework helper — make loose task lists parser-trackable @feature54**

The repo SHALL ship a rework helper (`scripts/add-task-ids.ts`: `addTaskIds` for `Tnn:`-prefixed headers, `addTaskIdsAnyHeader` for title-only / phase-dashed headers) that inserts an explicit `— id: t<nn>` token before `— Status:` on every task HEADER the SpecGraph task parser requires (the parser needs BOTH `Status:` and an explicit `— id:`). The rework SHALL be CRLF-safe (no split/join reflow), status-preserving (the `Status:` token byte-unchanged), child-safe (Done-When sub-checkboxes without `Status:` never receive an id), idempotent (a header that already has `id:` is left as-is), and id-unique (colliding prefixes deduped, e.g. `t01` / `t01-1`).


---

## FR-55

**Child phase-assistant skills SHALL have non-auto-trigger frontmatter descriptions @feature55**

Each child phase-assistant skill packaged under `.claude/skills/` (specifically `discovery-forms`,
`requirements-chk-matrix`, and `task-board-forms`) SHALL have SKILL.md frontmatter that:
- Does NOT contain auto-trigger phrases (`when the user`, `whenever`, `use this skill whenever`)
  in the first 600 characters of the file (individual skill check) and first 800 characters
  across all three skills together (combined check, SPECGEN003_24).
- Has a clear, non-prescriptive description that does not cause Claude Code to auto-invoke the
  skill on unrelated user prompts.
- `requirements-chk-matrix` SKILL.md SHALL explicitly reference Jira trace preservation (the
  skill preserves existing Jira issue links in verification matrices).

These skills are phase-assistants invoked ON-DEMAND by the user or the parent `create-spec` skill,
not auto-triggered. Auto-trigger phrases in SKILL.md descriptions cause spurious skill invocations
on unrelated tasks, violating the principle of minimal-surprise tool activation.

**Background (migrated from vitest):** SPECGEN003_16/17/21/24 tested these properties via
`tests/e2e/spec-generator-v3.test.ts`. With the BDD-only migration (FR-51), these are now
traceable `@feature55` BDD scenarios in `spec-generator-v4.feature`.

**User Story:** US-19

---

## FR-56

**Честная перекличка покрытия: снимок-канон + посценарный оверлей свежести + рантайм-трейс**

Перекличка/покрытие читают ТОЛЬКО канон `.dev-pomogator/.last-test-run.ndjson`, который пишет лишь ПОЛНЫЙ прогон; фильтрованные / `-c cucumber.sx.json` / точечные валидации намеренно его не трогают (защита F2/FR-52a) → зелёный точечный прогон читается как `not_run`, а на общем дереве параллельная сессия непрерывно перетирает канон, поэтому «просто прогони полный сьют» недолговечно. Полный анализ (симптом, механизм с пруфами §2-§3, усилитель общего дерева §4, варианты дизайна A/B/C §7, рекомендация §8, файлы-якоря §10) — `audit-reports/coverage-not-run-rollcall-analysis.md`. FR-56 кодифицирует owner-одобренный гибрид: канон остаётся снимком ПОЛНОГО прогона (читатели «один связный прогон вместе» не ломаются), а посценарная свежесть приходит из НОВОГО append-only оверлея, который пишет КАЖДЫЙ путь прогона.

- **FR-56a (канон неизменен — снимок полного прогона):** писатели канона `.dev-pomogator/.last-test-run.ndjson` (message-форматтер полного прогона) SHALL остаться без изменений; читатели, которым нужен ОДИН связный прогон вместе (`spec-verdict` + claim-evidence honesty-gate), продолжают читать канон как есть. Оверлей НЕ заменяет канон.
- **FR-56b (append-only посценарный оверлей):** System SHALL писать НОВЫЙ append-only `.dev-pomogator/.scenario-results.ndjson`, куда КАЖДЫЙ путь прогона — полный, фильтрованный `--name`/`--tags`, обход `-c <config>`, in-Docker `docker-bdd.sh` — дописывает ОДНУ строку на исполненный сценарий: `{scenario_id, result, time, run_id, source, trace_id}`. System SHALL держать оверлей ОГРАНИЧЕННЫМ: периодическая КОМПАКЦИЯ до свежайшей-на-сценарий записи (или ротация), чтобы файл и скан читателя не росли безгранично (оверлей читается на КАЖДЫЙ UserPromptSubmit переклички — обязан оставаться быстрым). Append-only ⇒ конкурентно-безопасно на общем дереве (параллельные сессии только дописывают, не перетирают). Запись каждой строки SHALL быть АТОМАРНОЙ — одна строка = один `O_APPEND` write() целиком, без чередования частичных строк конкурентных писателей (правила репо `atomic-update-lock`/`atomic-config-save`).
- **FR-56c (читатель = свежайший из {канон, оверлей} + страж свежести, ТРИ бакета):** читатели в `tools/spec-graph/` (`coverage.ts bucketByResult` + `task-census.ts`) SHALL вычислять ЭФФЕКТИВНЫЙ результат сценария как свежайший из {канон, оверлей}, с ОКНОМ СВЕЖЕСТИ: passed из оверлея засчитывается ТОЛЬКО если его `time` ≥ `max(mtime .feature, mtime step-def-файла сценария)` (MVP-страж): step-def — это КОД, движущийся вместе с тестом, поэтому `.feature`-mtime ОДНОЙ НЕДОСТАТОЧНО — типовая регрессия меняет ПРОД/step-def КОД при НЕИЗМЕННОМ `.feature`, и feature-mtime-only продолжил бы читать `passed` после правки кода (ложный зелёный — ровно то, что фича убивает); «также mtime тестируемого ПРОД-кода» — задокументированный следующий шаг сверх MVP. Бакеты: passed / stale / not_run (`stale` = когда-то passed, но сценарий изменился с тех пор → перепроверить; убивает «любой зелёный вечно прячет регрессию»). ПЕРФ: слияние/чтение оверлея SHALL укладываться в текущий бюджет латентности переклички (читается на КАЖДЫЙ UserPromptSubmit) — ограниченный скан через компакцию (FR-56b) или индекс, не полный проход растущего append-only файла.
- **FR-56d (захват trace_id → след падения):** `trace_id` SHALL указывать на след падения: кусок прогона `.dev-pomogator/.test-history/run-<id>.ndjson` (уже архивируется `scripts/run-bdd.mjs`, FR-52a) + `testCaseStartedId` сценария; cucumber message-ndjson уже несёт упавший шаг + ошибку в `testStepFinished.testStepResult.{status,message,duration}` → восстановимо. WHERE путь прогона не архивирует достаточно для восстановления (обход `-c` пропускает архив — `scripts/run-bdd.mjs:88-93`) THEN FR-56 SHALL требовать добавить этот архив. РОТАЦИЯ КУСКОВ (последние 30 — `scripts/run-bdd.mjs:131-143`) может удалить кусок, на который ещё ссылается АКТУАЛЬНАЯ («current») строка оверлея → висячий `trace_id`; FR-56 SHALL ЛИБО ПИНИТЬ (исключать из ротации) кусок любого всё-ещё-актуального в оверлее сценария, ЛИБО мягко деградировать в `get_scenario_trace` («трейс истёк — перепрогони для обновления»), а не падать на отсутствующем куске.
- **FR-56e (новый MCP-тул `get_scenario_trace`):** `tools/spec-mcp-server/` SHALL получить тул `get_scenario_trace(scenario_id)`, возвращающий свежайший результат + (если failed/stale) упавший шаг + текст ошибки + run_id/time/source + путь к куску — «где упало» ОДНИМ вызовом без grep'а. SHALL быть вписан в реестр тулов (`buildToolRegistry`) + покрыт `@feature56` BDD-сценарием (иначе мёртв у пользователей плагина — dead-integration).
- **FR-56f (трассировка вниз до рантайма):** спек-граф уже трассирует spec→FR→scenario→code; FR-56 SHALL расширить цепочку до рантайма: spec→FR→scenario→result→trace→logs. `ScenarioNode.lastResult` уже есть; добавить указатель на трейс + путь `get_trace`/coverage, достающий деталь падения. IF рантайм-трейс-ребро отсутствует на `ScenarioNode` THEN FR-56 его добавляет.

**Зависит от:** FR-32 (перепись/coverage-rollup — читатели), FR-52a (умная история прогонов `.test-history` + клоббер-безопасный канон — половина инфраструктуры уже пишется), FR-34/FR-44 (трассируемость — расширяется до рантайма). Триггер: owner-одобренный дизайн по анализу `audit-reports/coverage-not-run-rollcall-analysis.md` (2026-06-29). Анти-цель: НЕ «просто гонять полный сьют» — на общем дереве недолговечно (§4) и стоит ~70 мин.

## FR-57

**Аудит дописанности прозы: scaffold-плейсхолдеры рубят вердикт (единый классификатор, phase-aware, все документы)**

Смарт-вердикт и трассируемость проверяют СТРУКТУРУ и СВЯЗИ (FR→AC→scenario→task), но НЕ «дописан ли документ». Плейсхолдер валиден структурно (`| TBD-1 | {first task} | TODO |` — корректная строка таблицы; `{Краткое описание фичи}` — валидный текст), поэтому спека уходит в GREEN при нулевых дырах трассируемости, а её `README.md`/`TASKS.md`/`FIXTURES.md` остаются нетронутым scaffold'ом. Живой инцидент: `.specs/forbid-root-artifacts` числилась GREEN (`UNCOVERED_FR`/`TASK_UNTESTED`/`UNTAGGED_SCENARIO` = 0) при трёх документах из рыбы. Существующая ловля частична и беззуба: `validate-spec` эмитит `PLACEHOLDER` WARNING по всем документам, но это pre-filter — НЕ гейтит смарт-вердикт (правило `no-structural-valid`); `audit-spec` ловит плейсхолдеры лишь в `FIXTURES.md` и лишь под `TEST_DATA_ACTIVE` (WARNING, 2 хардкод-сентинела). FR-57 закрывает измерение «дописанность прозы», ОРТОГОНАЛЬНОЕ трассируемости. Полный разбор — `audit-reports/spec-generator-stub-detection-gap-handoff.md` (2026-07-01).

- **FR-57a (единый классификатор — один источник правды):** System SHALL иметь ОДИН модуль-классификатор scaffold-сентинелов, извлекающий литеральные маркеры ДОСЛОВНО из `tools/specs-generator/templates/*.template` (брейс-плейсхолдеры `{Название}`/`{first task}`/`{Краткое описание фичи}`/`{Название фикстуры}` и др. + не-брейс `TBD-1`/`TBD-2` + незаполненные якоря `#fr-N-название`). Классификатор — ЕДИНСТВЕННЫЙ источник истины для ERROR-гейта: audit-категория (FR-57b) зовёт ТОЛЬКО его. `validate-spec` сохраняет свою БОЛЕЕ ШИРОКУЮ `PLACEHOLDER`-эвристику как отдельный WARNING-предфильтр (ловит и строчные токены `{placeholder_not_filled}`, которые точный гейт намеренно пропускает, чтобы не краснить спеку по ложняку). Два слоя ОБЯЗАНЫ СОГЛАШАТЬСЯ в одном: дословный шаблонный сентинел — это заглушка (кросс-проверка `@feature57`; правило `verify-divergent-contracts`). Классификатор SHALL вырезать fenced+inline код перед матчем и НЕ флагать строчно-однословные токены (`{int}`/`{string}`/`{slug}`/`{framework}`), JSON-скобки и EARS-примеры внутри кода. Регресс-тест SHALL держать набор сентинелов ⊇ актуальных плейсхолдеров шаблонов (ловит дрейф при правке `*.template`).

- **FR-57b (новая audit-категория `SCAFFOLD_INCOMPLETE`, phase-gated severity):** `audit-spec` SHALL эмитить `SCAFFOLD_INCOMPLETE` (category LOGIC_GAPS) на КАЖДЫЙ документ спеки, дословно содержащий scaffold-сентинел вне кода, с полями `{file, line, sentinel, hint}` (hint = какой автозаполнитель дописывает: `discovery-forms`/`requirements-chk-matrix`/`task-board-forms` либо «вручную через дверь»). Severity SHALL зависеть от того, ПРЕТЕНДУЕТ ЛИ спека на проверенную готовность: IF спека claims-done (lifecycle GREEN от реального ПОЛНОГО прогона ИЛИ фаза Finalization `stop_confirmed`) THEN severity=ERROR; ELSE (свежий scaffold / ранняя фаза / тесты не прогонялись) severity=INFO. Инвариант «scaffold GREEN at birth» (инцидент templates-fix) SHALL сохраниться: свежесозданная спека с плейсхолдерами НЕ краснеет.

- **FR-57c (гейтит смарт-вердикт):** WHEN `SCAFFOLD_INCOMPLETE` эмитится severity=ERROR THEN `spec-verdict.ts` SHALL включить его в gap list → verdict=RED (существующий audit-hard-gate — каждая ERROR-находка рубит вердикт). Спека с дописанной прозой → категория исчезает → GREEN. Регресс-фикстура — из git-истории `.specs/forbid-root-artifacts` ДО финализации (реальный артефакт, не синтетика).

- **FR-57d (поглощает узкую FIXTURES-проверку):** существующая `FIXTURES_CONSISTENCY`-ветка на placeholder-`FIXTURES.md`-под-`TEST_DATA_ACTIVE` (WARNING, 2 хардкод-сентинела) SHALL быть сведена в классификатор FR-57a, чтобы `FIXTURES.md` не репортился дважды и сентинелы не дрейфовали от шаблона.

- **FR-57e (исключения — anti-over-generalization, правило H1):** классификатор SHALL НЕ флагать: сами `templates/*.template`; `__fixtures__/**` (тестовые данные легитимно содержат сентинелы); `.specs/backlog/**` (never-built scaffolding — максимум INFO, не ERROR). Мета-документ, обсуждающий сентинел, оборачивает пример в inline-код (классификатор его вырежет).

- **FR-57f (самодогфуд парадигмы FR→task→BDD):** FR-57 сам SHALL быть покрыт `@feature57`-сценарием на РЕАЛЬНОМ коде классификатора + задачей с `refs: FR-57` — иначе гейты FR-37b (`UNCOVERED_FR`/`TASK_UNTESTED`/`UNTAGGED_SCENARIO`) держат спеку RED. Это подтверждает: парадигма «каждый FR несёт задачу + BDD-сценарий (TDD Red→Green)» УЖЕ enforce'ится генератором структурно и НЕ требует нового слоя; FR-57 её дожёвывает измерением дописанности, не дублирует. Статический контроль SHALL ограничиваться существованием связки FR→task→scenario (порядок «Red-first» статически недоказуем — не заявляется).

**Зависит от:** FR-37 (смарт-вердикт + audit hard gate — точка встраивания категории), FR-37b (traceability-инварианты — уже держат FR→task→BDD; FR-57 ортогонален), FR-32 (lifecycle/перепись — источник сигнала «claims-done»). Триггер: handoff `audit-reports/spec-generator-stub-detection-gap-handoff.md` (2026-07-01) + owner-директива «спекв4 сам должен ловить недописанный scaffold и держать парадигму FR-task-BDD-TDD без напоминаний».

---

## FR-58

**Inherited v3 form-contract scenarios SHALL have an explicit v4 owner and SHALL NOT inflate FR-19 @feature58**

BDD-only migration moved legacy SPECGEN003 form-guard and form-skill regression scenarios into `spec-generator-v4.feature`. Those scenarios protect real inherited contracts — form-document guard routing, form parser Edit reconstruction, child form-skill executable evals, and v3 fail-open robustness — but they are NOT all evidence for FR-19's two-tier failure-mode policy. Blanket-tagging them `@feature19` polluted FR-19 coverage and made the semantic judge see unrelated form-contract regressions as proof of the hard/soft tier policy. System SHALL give these inherited v3 form-contract scenarios their own explicit v4 owner (`@feature58`) so coverage remains honest: FR-19 is covered only by true two-tier policy scenarios, while migrated v3 contracts remain traceable and executable.

- **FR-58a (retag inherited form contracts):** all migrated SPECGEN003 form guard/form skill scenarios and the SPECGEN004 form-guards-dispatch / `extractWriteContent` / form-skill-eval scenarios that do not test FR-19's hard-tier startup/file-parse policy SHALL be tagged `@feature58`, not `@feature19`.
- **FR-58b (real-code regression surface):** these scenarios SHALL continue to drive the real production entry points (`tools/specs-validator/*form*guard*.ts`, `form-guards-dispatch.ts`, `spec-form-parsers.ts`, and the executable eval runners under `.claude/skills/*/evals/`) through process execution or direct production imports; no mock-only retag is allowed.
- **FR-58c (FR-19 remains narrow):** FR-19 SHALL retain only scenarios that demonstrate the two-tier failure policy itself: hard-tier startup/config-load crash blocks Write, hard-tier per-file parse crash logs and allows Write, and soft-tier exception handling where the scenario's subject is explicitly the two-tier policy. Inherited contract checks (Priority/Done-When/CHK/Key Decisions/Risk forms, dispatcher routing, edit reconstruction, and form-skill eval aggregates) SHALL not count as FR-19 coverage.

**Связанные AC:** [AC-58.1](ACCEPTANCE_CRITERIA.md#ac-581), [AC-58.2](ACCEPTANCE_CRITERIA.md#ac-582), [AC-58.3](ACCEPTANCE_CRITERIA.md#ac-583)
**Use Case:** [UC-3](USE_CASES.md#uc-3)
**User Story:** US-19

## FR-59

**Claude-facing hook reminders SHALL be bounded while the durable conformance log stays complete**

PostToolUse conformance push currently has two valid outputs with different audiences: (1) the durable spec-check-log, which must keep every finding for audit/debugging, and (2) the `<system-reminder>` that is injected into Claude's context, which must stay small enough not to bloat the session. System SHALL cap the agent-facing reminder produced by `tools/spec-conformance-push/spec-conformance-push.ts` while preserving the complete `appendFindings(...)` journal. The capped reminder SHALL include total finding count, counts by severity, at most 20 sample findings, an omitted count, and a pointer to the full audit surface (`spec-check-log` / `/spec-status`). The default byte budget SHALL be 6000 bytes; if individual finding messages are long, truncation SHALL still keep the whole reminder under budget. The distributed bundle `tools/spec-conformance-push/spec-conformance-push.bundle.mjs` SHALL be rebuilt so plugin users receive the cap, not only source-tree users. Prompt-time status/census banners SHALL remain compact (one-line conformance summary, top-5 task-census specs, target ≤1500 chars) so repeated prompts do not accumulate avoidable noise.

Grounding: [RESEARCH.md Z.6](RESEARCH.md#z6-hook-output-context-bloat) records the live transcript evidence (`attachment.stdout len=713574` and repeated ~716KB pushes) and identifies the producer/consumer split.

**Связанные AC:** [AC-59.1](ACCEPTANCE_CRITERIA.md#ac-591), [AC-59.2](ACCEPTANCE_CRITERIA.md#ac-592), [AC-59.3](ACCEPTANCE_CRITERIA.md#ac-593)
**Use Case:** [UC-2](USE_CASES.md#uc-2)
**User Story:** US-37

## FR-60

**High-level MCP authoring API — strict spec door without str_replace UX tax**

System SHALL keep the MCP spec door strict (validation before write, audit log, single-writer semantics) while raising the authoring surface above fragile exact-string replacement. The current dogfood failure mode is real: agents writing normal spec deltas must manually reimplement mini-version-control over `read_spec_doc` + `expected_sha` + exact `old_string`, fight CAS mismatches, EOL drift, CRLF/LF formatter differences, and coordinate separate writes across FR/AC/TASKS/.feature/FILE_CHANGES. Safety rails stay; authoring API becomes intent/anchor aware.

**FR-60a (anchor and section operations):** MCP SHALL expose append/insert operations such as `append_to_section`, `insert_after_heading`, and `insert_at_eof` that address stable headings/anchors instead of exact trailing text. Operations MUST preserve the target document's original EOL style and indentation conventions.

**FR-60b (EOL-tolerant replacement + diagnostics):** literal replacement SHALL support `normalize_eol: true` and return remediation-grade errors. `old_string not found` MUST distinguish at least: same text after EOL normalization, same anchor but changed body, multiple matches, whitespace-only drift, and missing anchor; each response SHALL suggest the next safe operation.

**FR-60c (proposal/apply transaction):** MCP SHALL support `propose_patch` returning found anchors, preview diff, affected graph nodes, conformance/form findings, resulting sha/section tokens, and a `proposal_id`; `apply_proposed_patch(proposal_id)` SHALL apply the exact validated proposal if still valid. A multi-document `apply_spec_transaction` SHALL validate all target docs together and atomically write all-or-none with one audit event.

**FR-60d (domain-level authoring commands):** MCP SHALL provide high-level helpers for common spec workflows: `add_backlog_task`, `add_phase`, `amend_requirement`, `add_acceptance_criterion`, and `register_incident_backlog`. These helpers SHALL render canonical markdown for TASKS/FR/AC/FILE_CHANGES, maintain traceability links, enforce id uniqueness, and avoid creating executable `.feature` scenarios without matching step-def work or an explicit `add_acceptance_pin`/TASKS-only mode.

**FR-60e (read-for-edit anchors + CAS rebase):** `read_spec_doc` SHALL have a `read_for_edit` mode returning `eol_style`, `heading_anchor`, `section_sha`, `start_line/end_line`, and append/insert tokens. On CAS mismatch, non-conflicting anchor-targeted changes SHALL auto-rebase onto the fresh sha when the target anchor and preconditions still hold; real conflicts SHALL refuse with the fresh anchor context.

**Evidence:** dogfood from the P32/root-isolation and canonical-plugin sessions: exact-match edits failed on multi-line `old_string` despite visible text, manual sha chaining was required across docs, `.dev-pomogator/.tmp` vs Docker image visibility forced evidence relocation, and future authoring needed FR/AC/TASKS/feature/FILE_CHANGES updates as one conceptual change. User-provided UX backlog explicitly called for append_section/insert_after_heading, CRLF-insensitive matching, propose_patch preview, batch transactions, add_task/amend_requirement tools, read_for_edit anchors, CAS auto-rebase, remediation errors, register_incident_backlog, dry-run conformance summaries, and feature/step-def safety.

**Связанные AC:** [AC-60.1](ACCEPTANCE_CRITERIA.md#ac-601), [AC-60.2](ACCEPTANCE_CRITERIA.md#ac-602), [AC-60.3](ACCEPTANCE_CRITERIA.md#ac-603), [AC-60.4](ACCEPTANCE_CRITERIA.md#ac-604)
**Use Case:** UC-24 (MCP authoring UX)
**User Story:** US-24

---

## FR-61

**Unified readiness UX: one honest status contract across verdict, MCP status, task truth, BDD sync, and filtered evidence**

System SHALL replace the current split-brain spec health experience with a single readiness contract. The dogfood incident is concrete: CARL `TASKS.md` could say `Status: DONE` for all tasks while canonical coverage said `passed:0 / not_run:12`; `spec-verdict` still printed plain `VERDICT: GREEN`; `get_spec_status(view="status")` surfaced `UNCOVERED_FR` in a way that disagreed with `spec-verdict` traceability; the focused Docker BDD proof passed but stayed invisible to canonical MCP coverage because it was filtered; and executable BDD scenarios drifted beyond the source `.specs/<slug>/<slug>.feature`. The system SHALL keep the strict safety properties of FR-32/37/38/46/49/60, but SHALL present them as one product-readable truth.

- **FR-61a (multi-lane verdict, no plain green laundering):** `spec-verdict` SHALL emit separate lanes for `STRUCTURE`, `TRACEABILITY`, `EXECUTION`, `TASK_TRUTH`, `BDD_SYNC`, and `SEMANTIC`; a final `OVERALL` SHALL be `NOT_READY` when any lane contains blocking or honesty debt (`not_run`, failed/undefined/ambiguous scenarios, `DONE-but-unverified`, unchecked `Done When`, source/executable BDD drift, or skipped semantic check when semantic is required). Plain `VERDICT: GREEN` SHALL be reserved for the state where every readiness lane is green, not merely structural/audit/traceability pass.
- **FR-61b (aligned status gap semantics):** `get_spec_status(view="status")`, `get_spec_status(view="coverage")`, `conformance_check`, and `spec-verdict` SHALL use the same traceability gap vocabulary. Execution-derived absence SHALL be named separately (for example `FR_NOT_EXECUTION_VERIFIED` / `SCENARIO_NOT_RUN`), and SHALL NOT be reported as `UNCOVERED_FR` if the FR has traceability edges but lacks a canonical passed run.
- **FR-61c (task DONE truth guard):** textual `Status: DONE` in `TASKS.md` SHALL be denied or auto-downgraded to evidence-derived `IN_PROGRESS` when the task's mapped scenarios are not all canonical PASSED, when its own scenario requirement from FR-46 is missing/not passed, or when any `Done When` checkbox remains unchecked. The denial/downgrade SHALL be visible through `set_entity_status`, `apply_spec_change`, `spec-verdict`, and the prompt-time census.
- **FR-61d (source/executable BDD sync):** the graph SHALL compare source spec features (`.specs/<slug>/<slug>.feature`) with executable Cucumber features (`tests/features/**/<slug>*.feature` and configured paths). Every executable scenario id SHALL have a source scenario or explicit `[EXEC_ONLY]` / `[OUT_OF_SCOPE]` marker; every source scenario SHALL have an executable counterpart or explicit pending marker; FR tags and scenario count claims SHALL be checked for drift.
- **FR-61e (filtered-run evidence lane):** filtered Docker BDD runs SHALL remain clobber-safe and SHALL NOT update canonical `.last-test-run.ndjson`, but MCP/status/verdict SHALL surface them as `FILTERED_PROOF` evidence: artifact path, selected scenario ids, pass/fail summary, timestamp/source, and a clear note that canonical coverage remains unchanged until a full run lands or an explicit filtered-artifact attachment is accepted.
- **FR-61f (actionable next step):** when readiness is not green, the status/verdict surface SHALL return one concrete next action (for example: run full Docker BDD, attach a filtered artifact as review evidence, fix BDD sync drift, or reopen/downgrade DONE tasks), so users are not left reconciling multiple contradictory surfaces by hand.

**Evidence:** `audit-reports/specgen-v4-mcp-ux-session-2026-07-09.md` records the dogfood analysis and live CARL examples.
**Связанные AC:** [AC-61.1](ACCEPTANCE_CRITERIA.md#ac-611), [AC-61.2](ACCEPTANCE_CRITERIA.md#ac-612), [AC-61.3](ACCEPTANCE_CRITERIA.md#ac-613), [AC-61.4](ACCEPTANCE_CRITERIA.md#ac-614), [AC-61.5](ACCEPTANCE_CRITERIA.md#ac-615)
**Use Case:** UC-24 (MCP authoring/status UX)
**User Story:** US-24

---

## FR-62

**Cross-host target-project identity (#126).** `spec-status` and MCP readiness SHALL resolve the target project in strict order: valid explicit `SPECS_GENERATOR_ROOT`; validated caller/project root; then `findRepoRoot(SCRIPT_DIR)`. `SPECS_GENERATOR_ROOT` is an environment override only, never a stdin payload. Inherited, closed, and noninteractive stdin SHALL not be consumed for root resolution; any child or confirmation path SHALL terminate within its bounded timeout and return a structured result. `process.cwd()` is only a validated caller/project candidate and SHALL never authorize `C:\Windows`, an unrelated plugin cache, an UNC-relative path, or another accidental root. The resolver SHALL normalize Windows-drive and host-to-WSL `/mnt/<drive>/` forms and establish target-project identity; tracked-file inventory invariants remain the FR-64 release gate.

- **FR-62a (ordered independent sources):** The resolver SHALL identify the selected `env_override`, `caller_project`, or `script_dir` source and rejected predecessors. An invalid, empty, out-of-worktree, or collapsed `process.cwd()` candidate SHALL be diagnosed before fallback and SHALL not change a valid explicit or caller-selected project.
- **FR-62b (Windows-to-WSL installed-cache proof):** Before returning readiness, CLI and MCP SHALL prove the selected identity across Windows-hosted Code, WSL shell hop, repository root, and installed-plugin cache. They SHALL report all observed forms and show that the installed cache provides the executable while the caller-selected repository remains the target.
- **FR-62c (actionable refusal):** If target identity or path translation is unproven, the result SHALL be structured `NOT_READY`, name observed and rejected paths, and state the correction. It SHALL not substitute a CWD, UNC-relative path, or plugin-cache directory as the target project.

**Связанные AC:** [AC-62.1](ACCEPTANCE_CRITERIA.md#ac-621), [AC-62.2](ACCEPTANCE_CRITERIA.md#ac-622), [AC-62.3](ACCEPTANCE_CRITERIA.md#ac-623)
**Use Case:** UC-25
**User Story:** US-39

---

## FR-63

**Canonical readiness precheck and verdict.** `spec-status`, the MCP status surface, and `spec-verdict` SHALL read the same graph snapshot and apply one mandatory-lane AND gate over AC/scenario discovery, mapping, evidence recency, canonical outcome, and provenance. A structural-only or partially discovered result SHALL be NOT_READY; no single green lane may override absent, stale, duplicate, or unrecorded required evidence.

- **FR-63a (shared discovery and recency):** `precheck.ts` SHALL use graph-derived AC and scenario identities, including its `parseAcIds(...).map` input and `.dev-pomogator/.test-status` evidence, while MCP and `spec-verdict` consume the equivalent graph/test-result nodes. They SHALL deduplicate inventory, report baseline/run identity and recency, classify `not_recorded` and never-run evidence explicitly, and return the same next action.
- **FR-63b (MCP provenance and refusal):** Every readiness result SHALL identify the graph snapshot, runtime root, trace or test-result identity, evidence source, mandatory-lane state, and missing-evidence next action. Mock-only, source-tree-only, or stale evidence SHALL not satisfy the gate.
- **FR-63c (release-safe ownership boundary):** The command path SHALL be dependency-safe when installed, but dependency-absent packaging, documentation, PR/tag/release control, rollback, and monitoring are release-inventory duties of FR-64.

**Связанные AC:** [AC-63.1](ACCEPTANCE_CRITERIA.md#ac-631), [AC-63.2](ACCEPTANCE_CRITERIA.md#ac-632), [AC-63.3](ACCEPTANCE_CRITERIA.md#ac-633), [AC-63.4](ACCEPTANCE_CRITERIA.md#ac-634)
**Use Case:** UC-26, UC-28
**User Story:** US-40, US-42

---

## FR-64

**Graph-native inventory and controlled release evidence.** The generator SHALL parse, index, and conformance-check every FR, story, use case, AC, scenario, task, file-change record, and implementation edge using canonical identifiers and explicit links. It SHALL classify each unit as PASSED, FAILED, PENDING, UNDEFINED, AMBIGUOUS, or NOT_RUN; apply all-unit AND aggregation; and never convert missing or mock-only evidence to implementation proof.

- **FR-64a (parseable traceability):** Every FR SHALL link to a graph-parseable story and use case, and every AC, scenario, task, file-change record, and implementation edge SHALL retain canonical IDs. Conformance SHALL emit `FR_NO_STORY`, `FR_NO_USE_CASE`, malformed-identifier, or dangling-edge findings rather than accepting prose resemblance.
- **FR-64b (conserved release inventory):** Pre/post Git tracked-file inventories SHALL use cardinality and conservation checks to expose additions, removals, duplicates, and untracked artifacts. A release-ready result requires every in-scope unit, inventory check, and real installed-runtime/Docker BDD happy, negative, and invariant result.
- **FR-64c (PR, tag, rollback, and monitoring control):** Release evidence for commit `0b291bac` and subsequent PR/tag candidates SHALL record test paths, baseline/run identities, dependency-absent result, documentation updates, responsible owner, monitoring signal, rollback action, and post-release follow-up verification. `not_recorded` and never-run outcomes SHALL remain explicit; mock-only tests SHALL not satisfy this control.

**Связанные AC:** [AC-64.1](ACCEPTANCE_CRITERIA.md#ac-641), [AC-64.2](ACCEPTANCE_CRITERIA.md#ac-642), [AC-64.3](ACCEPTANCE_CRITERIA.md#ac-643), [AC-64.4](ACCEPTANCE_CRITERIA.md#ac-644)
**Use Case:** UC-27, UC-29
**User Story:** US-41, US-43

---

## FR-62..64 implementation clarification

**FR-63 correction:**

**Observed regression invariant:** precheck SHALL not duplicate AC identifiers; SHALL not return `test_paths=[]` where executable scenario/step paths exist; and SHALL not state that tests never ran where canonical run evidence exists. Each violation is a mandatory-lane defect and SHALL return `NOT_READY` with source/provenance and remediation.
 `.claude/skills/spec-status/scripts/precheck.ts`, MCP status, and `tools/specs-generator/spec-verdict.ts` SHALL share a graph-derived, deduplicated AC/scenario inventory and mandatory-lane AND gate. They SHALL preserve the FR-61 evidence taxonomy: `PASSED`, `FAILED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, `NOT_RUN`, and `not_recorded`. Structural-only, duplicate, stale, source-only, mock-only, empty-`test_paths`, or never-run evidence SHALL return `NOT_READY`. Readiness evidence updates SHALL use CAS or equivalent conditional retry so a concurrent writer cannot overwrite fresher evidence or fabricate green status.

**FR-63c correction:** Dependency-safe installed runtime is mandatory; dependency-absent result, README/TASKS/CHANGELOG updates, PR/tag/release candidate evidence, rollback, monitoring, and post-release follow-up are FR-64 release-inventory controls. Documentation alone SHALL not satisfy a readiness lane.

**FR-64 correction:**

- **FR-64d (current Docker-only execution):** Release readiness SHALL be based on a current-worktree `/run-tests` invocation executed only through the Docker BDD runner. The current result SHALL contain zero non-passing in-scope scenarios: no `FAILED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, `NOT_RUN`, or `not_recorded` outcome may be collapsed to `PASSED` or accepted as green.
- **FR-64e (candidate evidence and artifacts):** A dependency-absent run for every GitHub PR/tag/release candidate SHALL bind the current artifact, invocation, GitHub candidate identity, and result to the release record. Pre/post inventories SHALL account for tracked, untracked, temporary, generated, and smoke artifacts; untracked, temporary, and smoke-only paths SHALL be classified and excluded or removed deliberately rather than silently entering the release. The record SHALL retain tag, owner, monitoring signal, rollback action, and post-release verification.
 Graph-native inventory SHALL evaluate the current worktree and current `/run-tests` evidence, not prose or historic source-only output. It SHALL CAS-protect inventory/evidence updates; compare pre/post artifacts and tracked paths; classify every artifact keep/remove/generated/temporary/smoke-only; retain every FR evidence state; and require Docker-only installed-runtime, dependency-absent, PR/tag/release-candidate, tag, monitoring, rollback, and follow-up evidence under all-unit AND semantics.

FR-62 is traced exclusively to US-39 and UC-25. The root resolver is noninteractive and uses explicit `SPECS_GENERATOR_ROOT`, validated caller/project root, then `SCRIPT_DIR`; it rejects cache, untracked, UNC-relative, and cross-worktree substitutions with `NOT_READY`, and preserves the selected artifact across Windows-host Code to WSL shell hops.

FR-63 is traced to US-40, US-42, UC-26, and UC-28. `.claude/skills/spec-status/scripts/precheck.ts`, MCP status, and `tools/specs-generator/spec-verdict.ts` share graph-derived, deduplicated AC/scenario inventory; every mandatory lane uses AND semantics, with `not_recorded`, never-run, mock-only, source-only, and stale evidence returning `NOT_READY`. The installed command and MCP path must work dependency-absent.

FR-64 is traced to US-41, US-43, UC-27, and UC-29. The release inventory classifies each path keep/remove/generated/temporary/smoke-only, deduplicates it, and applies pre/post tracked-file conservation. Docker-only installed-runtime evidence preserves `PASSED`, `FAILED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, and `NOT_RUN`; GitHub #45, README, TASKS, CHANGELOG, PR/tag evidence, owner, monitoring, rollback, and follow-up are AND-gated.

## FR-65

**Acceptance-to-delivery coverage for external, deployed, authenticated, and paid contracts**

The spec generator SHALL classify externally observable acceptance claims and SHALL produce a deterministic coverage plan before Finalization can stop. Every triggered claim SHALL map explicitly to its AC id and to implementation analysis, regression verification, and semantic live/deploy evidence; an FR-only task reference is insufficient for a claim-level contract.

- **FR-65a (text-driven classifier):** public API/catalog/policy/DTO fields, versioned contracts, UI input schemas, redaction boundaries, auth/balance/paid/settlement flows, result or artifact readback, and deployed response semantics SHALL be detected from AC text without project-specific field names.
- **FR-65b (required lanes):** public-shape claims require DTO/source-of-truth mapping, a contract regression, and live status/content-type/body readback; version claims require producer/consumer compatibility or an explicit architecture decision; paid/auth claims require unauthenticated, insufficient-balance, funded success, settlement/idempotency, and result/artifact readback lanes with controlled-spend guardrails when production execution is costly. UI input claims require a renderable schema or an explicit no-schema UX decision; public/internal detail claims require allowlist/redaction proof.
- **FR-65c (blocking unknowns):** if an implementation surface cannot be inferred, the generated plan SHALL contain an AC-linked `Status: BLOCKED` investigation task rather than omit the acceptance. The hard gate remains red until the investigation is resolved into implementation/test/evidence tasks.
- **FR-65d (one deterministic gate):** `audit-spec`/`spec-verdict`, `create-spec` Finalization, `task-board-forms`, and `spec-review` SHALL share the same acceptance-coverage vocabulary. A reviewer SHALL emit a blocking `ACCEPTANCE_DELIVERY_COVERAGE` finding when any required lane is absent. The regression corpus SHALL model the #140 root `/api` vs prefixed `/go/api`, HTML infrastructure 404 vs JSON auth/billing boundaries, registry publication, slug/settlement mapping, and semantic live readback.

**Связанные AC:** [AC-65.1](ACCEPTANCE_CRITERIA.md#ac-651), [AC-65.2](ACCEPTANCE_CRITERIA.md#ac-652), [AC-65.3](ACCEPTANCE_CRITERIA.md#ac-653), [AC-65.4](ACCEPTANCE_CRITERIA.md#ac-654)
**Use Case:** [UC-30](USE_CASES.md#uc-30)
**User Story:** US-44

## FR-66

**Typed requirement metadata and delivery demands:** FR/NFR SHALL support an explicit local metadata block with `schemaVersion`, typed verification method, safety class, rationale, risks and forward-compatible `_unknown` fields. Delivery demands SHALL use the closed registry `implementation|integration-test|documentation|migration|operational-proof`, obligations `required|optional|not-applicable`, and evidence states `PRESENT|MISSING|NOT_APPLICABLE|WAIVED`; justified exceptions SHALL carry rationale and WAIVED SHALL carry actor/audit evidence. Declared required demands SHALL roll up by non-empty ALL. Existing task/test `FrCensusVerdict` SHALL remain separate from `delivery.overall=NOT_DECLARED|DELIVERED|INCOMPLETE`; smart overall SHALL fail closed on incomplete required delivery. Forwarded needs SHALL use deterministic precedence/dedup/conflict findings. Parser, MCP author/query, migration dry-run/apply, conformance, verdict and SQLite SHALL share one validator/evaluator. Until result adapters arrive, integration-test PRESENT SHALL require current non-stale `PASSED` canonical BDD evidence.

**Связанные AC:** [AC-66.1](ACCEPTANCE_CRITERIA.md#ac-661), [AC-66.2](ACCEPTANCE_CRITERIA.md#ac-662), [AC-66.3](ACCEPTANCE_CRITERIA.md#ac-663), [AC-66.4](ACCEPTANCE_CRITERIA.md#ac-664), [AC-66.5](ACCEPTANCE_CRITERIA.md#ac-665), [AC-66.6](ACCEPTANCE_CRITERIA.md#ac-666)
**User Story:** [User Story 45](USER_STORIES.md#user-story-45-typed-delivery-truth-priority-p1)


## FR-67

**Typed edge semantics and endpoint contract:** The graph SHALL expose `verifies` and `entitles` as distinct `EdgeType` members while preserving `covers` and `tested-by`; SHALL define every edge kind in one exhaustive source/target schema; SHALL surface each forbidden known-node pair as error `ENDPOINT_VIOLATION`; and SHALL apply the same fail-closed contract to full/incremental graph builds, fully staged MCP mutations, and SQLite cold/warm restore without silently dropping invalid edges.

**Связанные AC:** [AC-67.1](ACCEPTANCE_CRITERIA.md#ac-671), [AC-67.2](ACCEPTANCE_CRITERIA.md#ac-672), [AC-67.3](ACCEPTANCE_CRITERIA.md#ac-673), [AC-67.4](ACCEPTANCE_CRITERIA.md#ac-674), [AC-67.5](ACCEPTANCE_CRITERIA.md#ac-675), [AC-67.6](ACCEPTANCE_CRITERIA.md#ac-676), [AC-67.7](ACCEPTANCE_CRITERIA.md#ac-677)
**User Story:** [User Story 46](USER_STORIES.md#user-story-46-typed-edge-truth-priority-p1)



## FR-68

**Acceptance criterion owns its proof:** Each AC SHALL be evaluated from its own `tested-by` and current passing `verifies` evidence. Parent-FR scenarios MAY be surfaced as `inherited` context but SHALL NOT complete the AC. An AC with no own scenario SHALL emit error `UNCOVERED_AC`; an AC with own scenarios but no current passing verification SHALL emit error `UNVERIFIED_AC`. Mandatory readiness SHALL include `AC_SATISFACTION`, computed by non-empty ALL over every AC in scope. Bulk tag patterns that mechanically attach sibling ACs without distinct behavioral assertions SHALL emit blocking `TAG_BULK_SUSPECT` rather than laundering retrofit debt.

**Связанные AC:** AC-68.1, AC-68.2, AC-68.3, AC-68.4, AC-68.5
**User Story:** [User Story 47](USER_STORIES.md#user-story-47-acceptance-criterion-owns-its-proof-priority-p1)


## FR-69

**Non-functional requirements participate in completion truth:** NFR nodes SHALL be inventoried, traced, verified, delivery-evaluated and persisted on the same fail-closed path as FR nodes. A required NFR with no own scenario SHALL emit error `UNCOVERED_NFR`; a required NFR with scenarios but no current passing verification SHALL emit error `UNVERIFIED_NFR`. Mandatory readiness SHALL include `NFR_SATISFACTION`, computed by non-empty ALL over required NFRs; optional or justified not-applicable NFRs SHALL remain visible without completing required siblings.

**Связанные AC:** AC-69.1, AC-69.2, AC-69.3, AC-69.4
**User Story:** [User Story 48](USER_STORIES.md#user-story-48-non-functional-requirements-participate-in-readiness-priority-p1)


## FR-70

**Content-addressed artifact evidence:** The graph SHALL model an `Evidence` node and typed `evidenced-by` edge from FR/NFR/AC/Scenario to evidence. An evidence manifest SHALL carry `schemaVersion`, attachment-relative path, kind/media type, `sha256`, byte size, producer, run/invocation id, finalized time and subject revision. For required `operational-proof`, state SHALL be derived as PRESENT only when the path remains within the spec attachment root, the regular file exists and is non-empty, its digest matches, recording is finalized, and freshness policy passes; missing, malformed, escaped, digest-mismatched or stale evidence SHALL be MISSING. `demonstration` and `inspection` verification methods SHALL imply required operational proof unless explicitly not-applicable with rationale. Hand-authored `PRESENT` SHALL be invalid for operational proof, and evidence references SHALL be evaluated by target state, not target existence alone.

**Связанные AC:** AC-70.1, AC-70.2, AC-70.3, AC-70.4, AC-70.5, AC-70.6
**User Story:** [User Story 49](USER_STORIES.md#user-story-49-artifact-evidence-is-graph-verifiable-priority-p1)


## FR-71

**Independent demonstration judgment:** A demonstration SHALL be produced by exercising the live target and finalizing a reviewable artifact. A separate judge whose auditable identity differs from the producer SHALL inspect the exact artifact digest and issue a structured verdict containing reviewer, producer, judge invocation reference, artifact digest, criterion ids, timestamped observations, and per-criterion `CONFIRMED|DENIED`. Equality or absence of identities SHALL classify the review as `self-attested`; self-attested, unavailable, digest-mismatched, incomplete or any required DENIED review SHALL NOT satisfy operational proof. Required proof SHALL fail closed when artifact or judge is unavailable. FR-71 itself SHALL use verification method `demonstration` and SHALL be completed only by an independently reviewed demonstration of this protocol.

**Связанные AC:** AC-71.1, AC-71.2, AC-71.3, AC-71.4, AC-71.5
**User Story:** [User Story 50](USER_STORIES.md#user-story-50-independent-judge-watches-the-demonstration-priority-p1)



## FR-72

**Canonical versioned typed-task representation:** The task-planning subsystem SHALL parse the strict human-authored `TASKS.md` Markdown source into canonical representation version `task/v1`. Each `task/v1` record SHALL contain immutable qualified ID, title, kind, definition revision, declared status, `estimateMinutes`, typed requirement and AC links, structured DoneWhen criteria, typed dependencies, execution surfaces, input/output artifacts, evidence policy, unknown-field bag, and comment/source-span preservation data. The exact migration mapping is: strict task heading/key → `qualifiedId`; title → `title`; kind/status/estimate metadata → `kind`/`declaredStatus`/`estimateMinutes`; requirement/AC references → typed links; Done When list → ordered criteria; dependency/surface/artifact/evidence blocks → like-named fields; unsupported metadata and non-semantic comments → preserved unknown/comment payload. One version-aware parser, model, and renderer SHALL supply SpecGraph, MCP, lifecycle, task census, and summary renderer. Parse-render-parse of an unchanged supported record SHALL produce byte-equivalent canonical JSON after stable ordering and preserve READY; comments and unknown fields SHALL round-trip. Markdown remains source of truth during observe/warn/enforce migration. Every legacy, loose, duplicate, or invalid record SHALL remain queryable with source location and diagnostic; only a mutation that creates an ambiguous or invalid `task/v1` document SHALL be rejected, retaining the prior model. The system SHALL never silently drop a task. Exact or case/Unicode-normalization duplicate qualified IDs SHALL yield error findings listing every source location.

**Связанные AC:** AC-72.1, AC-72.2, AC-72.3, AC-72.4, AC-72.5
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 52](USER_STORIES.md#user-story-52-canonical-task-model-priority-p1)

## FR-73

**Validated typed dependency DAG:** The task-planning subsystem SHALL represent `depends-on`, `blocks`, and `consumes` as first-class versioned edges containing source ID, target ID, relation, hard/soft semantics, and non-empty reason. Before an edge enters the executable DAG, the validator SHALL resolve its target, normalize IDs, and reject a missing target, self-dependency, or directed cycle with deterministic named findings, source locations, and cycle path while retaining the prior DAG. The query SHALL return deterministic reverse blockers with relation, reason, predecessor status, and evidence state. A task SHALL be READY only when every hard predecessor has current-success evidence; soft edges remain explanatory. Prose-only sequencing SHALL be a queryable migration diagnostic and SHALL neither create an edge nor change readiness. Source, incremental, and SQLite restoration SHALL return the same normalized DAG and blocker order.

**Связанные AC:** AC-73.1, AC-73.2, AC-73.3, AC-73.4, AC-73.5
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 53](USER_STORIES.md#user-story-53-typed-dependency-dag-priority-p1)

## FR-74

**Constrained blast-radius execution surfaces:** Each task SHALL declare typed execution-surface claims with kind `file|glob|symbol|api-contract|schema|data|config|generated-artifact|test-resource|runtime-resource|external-contract`, access `read|write|exclusive`, normalized locator/scope, and non-empty rationale. For file/glob claims, planner SHALL normalize case and Unicode, resolve realpath through symlink/junction chains, and confine result to repository root; it SHALL reject `..`, absolute/UNC path, root escape, normalization collision, symlink/junction escape, and glob expansion beyond configured match/depth budget with named findings and no safe schedule. Locator/rationale text is data: no command/script/URL/shell fragment may execute. Planner SHALL redact secrets from claims, findings, reports, and MCP output. After execution it SHALL compare declarations to actual changed files/artifacts, report undeclared/missing/over-broad claims, and return direct/transitive impact paths; nonlocal claims remain explicit external resources.

**Связанные AC:** AC-74.1, AC-74.2, AC-74.3, AC-74.4, AC-74.5
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 54](USER_STORIES.md#user-story-54-typed-execution-surfaces-priority-p1)

## FR-75

**Derived non-causal conflict graph:** From valid surface claims, planner SHALL derive conflict graph separately from dependency DAG. It SHALL identify write/write, stable read/write, and exclusive conflicts, including semantic overlap across differing files for same API contract, schema, registry, configuration, generated/test artifact, or normalized resource. Each conflict output SHALL include both task IDs, class, contributing claims, normalized overlap, deterministic derivation rule, and redacted explanation. Override SHALL only suppress identified conflict within scope until explicit expiry and SHALL record actor, rationale, creation, expiry, and audit ID; expired/missing/mismatched overrides do not suppress. Planner SHALL never change a dependency edge because of conflict. It SHALL partition each dependency-ready wave into conflict-free batches and report task that cannot be safely batched.

**Связанные AC:** AC-75.1, AC-75.2, AC-75.3, AC-75.4, AC-75.5
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 55](USER_STORIES.md#user-story-55-derived-conflict-graph-priority-p1)

## FR-76

**Deterministic bounded execution planner:** For selected valid subgraph, planner SHALL compute the zero-predecessor frontier independently of task readiness; return every frontier task as `READY`, `BLOCKED`, `STALE`, or `INVALID` with an explanation; schedule only READY tasks into topological parallel waves and conflict-free batches; and return an explicit explained `unscheduled` remainder. Any non-empty remainder SHALL yield `complete: false`; the planner SHALL never report a complete plan while selected nodes remain. It SHALL normalize `estimateMinutes` using documented half-up minute rounding/default, calculate weighted longest critical path and per-task slack, and show blocked/stale downstream impact. It SHALL use stable normalized qualified-ID ascending tie-break for equals and serialize canonical stable-key JSON. Identical canonical input, selected IDs, configuration, and persistence state SHALL produce byte-equivalent JSON through incremental, cold, and warm planning. Harness defines cold as no graph/planner cache and warm as graph, claim index, and SQLite page cache populated; it SHALL measure p95 over at least 30 repetitions of corpus with 300 tasks, 450 typed dependency edges, and 1,500 claims distributed across all kinds/access modes. Warm query SHALL finish ≤200ms p95. Cycle, invalid estimate, or missing selected task SHALL return deterministic findings and no inferred schedule.

**Связанные AC:** AC-76.1, AC-76.2, AC-76.3, AC-76.4, AC-76.5
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 56](USER_STORIES.md#user-story-56-deterministic-execution-planner-priority-p1)

## FR-77

**Task-owned evidence and fail-closed stale invalidation:** Graph SHALL persist task-owned `validates`/`tested-by` edges and evidence containing owner, validated task/artifact IDs, run identity, redacted environment, result, proof scope, and input fingerprints/digests. When consumed artifact, prerequisite definition, scenario, or evidence input changes, evaluator SHALL return deterministic downstream stale closure with path/reason. Historical evidence remains queryable but SHALL not satisfy current DONE; affected task transitions succeeded → stale → READY/in-progress only after current prerequisites reevaluate. Full-proof policy SHALL retain but reject filtered-only evidence for completion. Missing, stale, malformed, or unowned proof SHALL fail closed with actionable status. Graph, MCP, and SQLite restoration SHALL preserve ownership, current/historical state, fingerprints, stale reason, and redacted fields.

**Связанные AC:** AC-77.1, AC-77.2, AC-77.3, AC-77.4, AC-77.5, [AC-77.6](ACCEPTANCE_CRITERIA.md#ac-776)
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 57](USER_STORIES.md#user-story-57-task-owned-evidence-priority-p1)

## FR-78

**Bounded reviewed discovery expansion:** Discovery task SHALL produce schema-valid graph-patch proposal and SHALL not mutate graph directly. Proposal SHALL derive child ID from parent ID plus normalized semantic key, include output digest and requested surface/write scope, and enforce configured child-count, scope, and write budget. Equal output-digest replay SHALL return prior proposal or idempotent no-op without duplicates. Every dry-run/apply SHALL use ordinary target, DAG, conflict, evidence, CAS, and all-or-nothing validation; refusal returns named findings and leaves state unchanged. Empty discovery retains `no_children` evidence. Proposal at/above high-impact threshold remains `awaiting_approval` until authorized approval, and SHALL not auto-apply.

**Связанные AC:** AC-78.1, AC-78.2, AC-78.3, AC-78.4, AC-78.5, [AC-78.6](ACCEPTANCE_CRITERIA.md#ac-786)
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 58](USER_STORIES.md#user-story-58-bounded-discovery-expansion-priority-p1)

## FR-79

**MCP planning API, reports, persistence, and staged rollout:** MCP SHALL expose versioned execution-plan query returning selected typed nodes/edges, direct/transitive impact, conflicts, waves, batches, zero-predecessor frontier entries with readiness/explanations, explicit unscheduled remainder, `complete`, critical path, slack, stale reasons, diagnostics, and redacted explanations in stable JSON order. Typed task/graph-patch mutation SHALL provide dry-run and CAS/all-or-nothing apply: stale revision, validation error, or persistence failure SHALL return deterministic findings and leave state unchanged. SQLite cold/warm restoration SHALL preserve canonical records, diagnostics, plans, evidence state, and byte-equivalent query result. Installed `server.bundle.mjs` SHALL prove planning query/validation when dependencies absent, not skip behavior. Reports SHALL identify task IDs/explanations for quality, conflicts, impact, critical path, stale evidence, migration diagnostics, and redacted security findings; a non-empty unscheduled remainder SHALL be reported as incomplete and SHALL NOT be presented as complete. Observe → warn → enforce SHALL preserve source task count/queryability of invalid/legacy records; enforce SHALL reject unresolved canonicalization explicitly and never silently lose task.

**Связанные AC:** AC-79.1, AC-79.2, AC-79.3, AC-79.4, AC-79.5, AC-79.6, [AC-79.7](ACCEPTANCE_CRITERIA.md#ac-797), [AC-79.8](ACCEPTANCE_CRITERIA.md#ac-798)
**Use Case:** [UC-31](USE_CASES.md#uc-31-create-an-execution-aware-safe-parallel-task-plan)
**User Story:** [User Story 59](USER_STORIES.md#user-story-59-planning-api-and-rollout-priority-p1)



## FR-80

**Deterministic pre-scheduling task synthesis:** Before any FR-72..FR-79 scheduling, planning, conflict, impact, wave, or rollout operation, the system SHALL deterministically synthesize canonical `task/v1` records from applicable FR, acceptance criteria, DESIGN decisions, BDD scenarios, and repository reality into one stored SpecGraph. The synthesis SHALL set `domainMode` to `ddd` only when repository reality establishes a domain boundary; in `ddd` mode it SHALL record the verified boundary, aggregate, invariant, and contract, while in `none` mode it SHALL record module, adapter, and contract boundaries and SHALL NOT invent domain entities, aggregates, or invariants. It SHALL conserve every applicable acceptance lane, assign each lane to one vertical BDD slice that owns the requirement, acceptance criterion, scenario, and verification evidence, and preserve causal `RED -> GREEN -> REFACTOR` BDD-only TDD edges. An unknown implementation surface SHALL create a named `BLOCKED` investigation record, retain its owning acceptance lane, and prevent task finalization. Every generated record SHALL have measurable `doneWhen`, estimate, requirement and acceptance references, typed dependencies, and declared read, write, and exclusive surfaces. Identical inputs SHALL yield stable-key byte-equivalent output with neither silent loss nor duplication, and the resulting single SpecGraph SHALL feed FR-72..FR-79 directly without a second planning graph.

**Связанные AC:** AC-80.1, AC-80.2, AC-80.3, AC-80.4, AC-80.5, AC-80.6, AC-80.7, AC-80.8, AC-80.9, AC-80.10, [AC-80.11](ACCEPTANCE_CRITERIA.md#ac-8011), [AC-80.12](ACCEPTANCE_CRITERIA.md#ac-8012)
**Use Case:** UC-32
**User Story:** [User Story 60](USER_STORIES.md#user-story-60-pre-scheduling-task-synthesis-preserves-acceptance-proof-priority-p1)




**Agent-execution plan amendment:** Synthesis SHALL accept the approved design revision and its digest plus a repository-verified component/interface responsibility map. It SHALL project one canonical agent-execution plan from the stored SpecGraph: each graph task is an independently valuable AC/BDD vertical outcome, while its ordered 2–5-minute execution steps are embedded instructions and SHALL NOT become separate graph nodes. Before FR-72..FR-79 planning, a deterministic synthesis-review gate SHALL reject placeholders; unconserved lanes; missing boundary or ownership; absent exact file/source locations or interfaces; infeasible work; untyped or cyclic causal order; and incomplete declared surfaces. `TaskPlanResult` SHALL hand an agent a self-contained canonical task brief containing the full task text, exact files/source locations, interfaces, dependencies, relevant predecessor summaries, scenario and evidence command, safe-batch membership, blockers, machine next action, and a proof of independence. The handoff is a projection of canonical SpecGraph data and SHALL NOT create a `.superpowers/sdd`-like second authority or executor. Execution outcomes SHALL include `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, and `BLOCKED`; only evidence-backed `DONE` completes a task, and every other outcome SHALL emit evidence-backed diagnostics and follow-up proposals. A parallel batch SHALL prove each pair’s independence by the absence of a causal path in either direction and the absence of a conflict pair, not by prose assertion.




**Verification-bearing generated-task amendment:** Every synthesized acceptance-bearing task SHALL carry a canonical machine-checkable verification contract derived from its FR, AC, scenario, approved design, and repository-verified execution surfaces. Green CI or BDD evidence alone SHALL be necessary but insufficient for completion: the contract SHALL additionally require task-specific real-consumer runtime proof, executable negative/adversarial checks, strength evidence through a targeted mutation kill or explicit self-challenge policy, and an independent verifier attestation bound to the current task, graph revision, commit, commands, observations, and artifact digests. The worker MAY produce implementation and suite evidence but SHALL NOT self-authorize completion. A bounded worker → fresh verifier → integration-owner flow SHALL fail closed on missing, stale, filtered-only, self-attested, weak, mismatched, or non-runtime proof, while preserving diagnostics and follow-up work without inventing a second task authority.
## FR-81

**Cursor IDE host compatibility (compat-first — one MCP path twin)**

Claude Code remains the canonical install (marketplace plugin / repo dogfood: skills, hooks, root `.mcp.json`). Cursor SHALL be a second client of the **same** SpecGraph MCP door without a second skill/hook tree or Cursor marketplace package.

- **FR-81a (native pickup):** Cursor SHALL consume project `.claude/skills/` and, when Third-party skills/hooks are enabled, project `.claude/settings.json` hooks (including Claude nested `permissionDecision` JSON and exit code 2). SHALL NOT require mirrored `.cursor/skills` or `.cursor/hooks.json` for day-1 door use.
- **FR-81b (MCP registration glue):** The project SHALL ship `.cursor/mcp.json` whose `dev-pomogator-specs` entry launches the same `tools/spec-mcp-server/server.bundle.mjs` as root `.mcp.json`. `DEV_POMOGATOR_REPO_ROOT` / `resolveRepoRoot` SHALL tolerate Cursor env and an unexpanded `${CLAUDE_PROJECT_DIR}` literal by falling back to a cwd that contains `.specs/`.
- **FR-81c (split proof):** Deterministic suite evidence covers file presence, JSON door-entry parity, and `resolveRepoRoot`. Live Cursor dogfood (manual evidence) covers MCP tool catalog visibility, enforce deny on raw `.specs/**` Write/Edit when enforce is on, and successful MCP mutation. Suite MUST NOT fake-green the live ACs.
- **FR-81d (non-goals):** No Cursor marketplace plugin; FR-41 phase spawn remains `claude -p` (usable from Cursor only if Claude CLI is on PATH); no new skill wrapper (user entry remains create-spec / README).
- **FR-81e (drift):** Root `.mcp.json` and `.cursor/mcp.json` `dev-pomogator-specs` entries SHALL stay content-equivalent (BDD parity; helper `tools/spec-mcp-server/ensure-cursor-mcp.ts`).
- **FR-81f (known host gaps):** Document that Claude matcher `Glob` may not fire under Cursor third-party tool maps and Claude `mcp__…` matchers may not bind Cursor MCP call names. Day-1 smoke focuses Write/Edit/Read/Shell. Cursor loads project settings.json, not plugin hooks.json.
- **FR-81g (install contract):** Installing for Claude Code SHALL remain unchanged. Enabling Cursor on the same tree SHALL require at most `.cursor/mcp.json` plus Settings → Third-party skills/hooks. This repo SHALL commit the twin for dogfood. Consumer projects MAY copy the twin or run doctor warn/apply (`ensure-cursor-mcp.ts`) — not a second distribution channel.

**Зависит от:** FR-4, FR-14, FR-39.
**Связанные AC:** [AC-81.1](ACCEPTANCE_CRITERIA.md#ac-811), [AC-81.2](ACCEPTANCE_CRITERIA.md#ac-812), [AC-81.3](ACCEPTANCE_CRITERIA.md#ac-813), [AC-81.4](ACCEPTANCE_CRITERIA.md#ac-814), [AC-81.5](ACCEPTANCE_CRITERIA.md#ac-815), [AC-81.6](ACCEPTANCE_CRITERIA.md#ac-816), [AC-81.7](ACCEPTANCE_CRITERIA.md#ac-817), [AC-81.8](ACCEPTANCE_CRITERIA.md#ac-818), [AC-81.9](ACCEPTANCE_CRITERIA.md#ac-819), [AC-81.10](ACCEPTANCE_CRITERIA.md#ac-8110)
**Use Case:** [UC-33](USE_CASES.md#uc-33)
**User Story:** [User Story 61](USER_STORIES.md#user-story-61-cursor-uses-the-same-spec-door-priority-p1)


- **FR-81h (canonical containment):** The live-evidence validator SHALL canonicalize the repository root, the trace path, and every workspace file through realpath and SHALL fail closed with a named finding when a real path escapes the workspace or cannot be resolved. Symlink/junction targets outside the repository SHALL be rejected before any bytes are hashed or accepted.
- **FR-81i (two-sided completeness):** Expected-record completeness SHALL be two-sided when an expectation set is provided: every expected scenario/profile record SHALL be present, and every manifest record outside the expectation set SHALL be rejected with a named finding. Without an expectation set, completeness alone SHALL NOT reject records.
- **FR-81g-proof (independent ground truth):** Deterministic suite proof over live-evidence artifacts SHALL use a captured fixture with independently precomputed digests (or a deterministic producer plus captured artifact and recorded provenance). Same-code recomputation alone is self-attested and insufficient.
## FR-82

**Bounded, truthful MCP inventory and read-side query contracts (immediate)**

**Delivery status:** Immediate Requirements-phase package. The SpecGraph MCP SHALL expose bounded, complete read-side queries whose contracts describe the live graph rather than a future parser state. The package SHALL support one complete task-inventory request followed by bounded verification; it SHALL NOT require an N×M crawl of task nodes.

- **FR-82a (`list_tasks`):** The server SHALL expose `list_tasks({spec,statuses?,phase?,requirement?,include_comments?,limit?,cursor?})`. With no `statuses` filter it SHALL return every non-terminal task for the selected spec, so “give me every unfinished task” is one paginated collection operation. Each item SHALL include canonical task id, title, status, phase, comment or rationale when present, linked requirements, linked issues when present, and source file plus line/range. A blocker SHALL be emitted only with evidence identifying its source or verification; an unsupported or unevidenced blocker SHALL not be presented as fact. The response SHALL include `total`, `returned`, `truncated`, and an opaque `next_cursor` when more records remain.
- **FR-82b (`list_phase_tasks`):** The query SHALL be spec-scoped and SHALL accept status filters, a bounded `limit`, and an opaque cursor. It SHALL use canonical phase names or return nearest canonical phase candidates. It SHALL distinguish `PHASE_NOT_FOUND` for an unknown phase from `EMPTY_PHASE` for a known phase with no matching tasks. Its description and tests SHALL state that live task nodes are available; they SHALL not claim that task phases are always absent until a future parser.
- **FR-82c (`search`):** Search SHALL accept an optional spec scope and a cursor, and SHALL provide complete deterministic pagination with `total`, `returned`, `truncated`, and `next_cursor`; a silent result cap is forbidden. Existing query and type filters remain supported.
- **FR-82d (`get_spec_status`):** `view: "summary"` SHALL provide a compact inventory/status view for agent routing without embedding the full task or inventory payload. On an unchanged read-side graph revision it SHALL reuse the existing summary/census result and SHALL not recompute an unchanged global census merely to answer the summary request.
- **FR-82e (`read_spec_doc`):** A read without pagination or a section SHALL use a safe bounded page default of 200 lines and SHALL reject or require explicit `whole_document: true` for a large whole-document read. A single page SHALL be capped at 500 lines. `SECTION_NOT_FOUND` SHALL return nearest canonical headings/anchors from the requested document so the caller can correct the query without crawling the document.
- **FR-82f (truthful contract regression):** The implementation contract, MCP tool metadata, and existing integration test SHALL be updated together. The live inventory already contains task nodes, so the stale “Task nodes are not produced by the Phase-1 parsers; populated in Phase 2B” claim SHALL be removed or narrowed to the actual limitation, and an empty phase SHALL never be used to imply that the task inventory is empty.
- **FR-82g (incident and budget evidence):** The measured incident snapshot `wf_0315d03b-28` from 2026-08-01 SHALL be retained as incident evidence: a stopped workflow retried six collectors, made 695 MCP calls, returned approximately 5.46 MB, and reached approximately 297–312k input tokens across attempts. These measurements motivate the bounded contract and are not an eternal performance claim. Acceptance SHALL prove one bounded task-inventory request plus bounded verification, explicit response-size/latency budgets, deterministic cardinality, and no silent cap against a real captured corpus artifact.

**Зависит от:** [FR-4](FR.md#fr-4), [FR-14](FR.md#fr-14), [FR-32](FR.md#fr-32), [FR-39](FR.md#fr-39), [FR-40](FR.md#fr-40).
**Связанные AC:** [AC-82.1](ACCEPTANCE_CRITERIA.md#ac-821), [AC-82.2](ACCEPTANCE_CRITERIA.md#ac-822), [AC-82.3](ACCEPTANCE_CRITERIA.md#ac-823), [AC-82.4](ACCEPTANCE_CRITERIA.md#ac-824), [AC-82.5](ACCEPTANCE_CRITERIA.md#ac-825), [AC-82.6](ACCEPTANCE_CRITERIA.md#ac-826), [AC-82.7](ACCEPTANCE_CRITERIA.md#ac-827), [AC-82.8](ACCEPTANCE_CRITERIA.md#ac-828), [AC-82.9](ACCEPTANCE_CRITERIA.md#ac-829)
**Use Case:** [UC-34](USE_CASES.md#uc-34)
**User Story:** [User Story 62](USER_STORIES.md#user-story-62-bounded-task-inventory-and-truthful-read-contracts-priority-p1)

---

## Cross-spec dependency: Dynamic Workflow Engineering

dynamic-workflow-engineering owns all bounded workflow runtime, retry, partial-result, journal, replay, native-Agent capability/security, census/migration, adapters, incident regression, and distribution requirements; FR-82 remains the bounded spec-MCP query prerequisite/consumer surface; spec-generator-v4 must not implement a second runtime.
## FR-83

**Codex Desktop first-class host adapter and distributable spec workflow**

**Delivery status:** Requirements and execution plan only. The existing SpecGraph, MCP registry, authoring door, phase gates, and evidence model remain canonical. Codex Desktop and Codex CLI SHALL consume them through a thin host adapter and a separately installable `spec-generator-v4` Codex plugin; this requirement does not claim implementation or live proof.

- **FR-83a (one engine, explicit ownership):** `tools/spec-graph/**`, `tools/spec-mcp-server/**`, canonical requirement/status semantics, and the create-spec phase model SHALL remain shared. Codex support SHALL NOT fork the graph, MCP registry, spec documents, task store, or gate/retry logic. `codex-init:FR-8` owns marketplace allowlisting and install-status evidence only; this FR owns runtime, skills, hooks, orchestration, doctor, and live-host behavior.
- **FR-83b (separate distribution entry):** The existing `context-menu` Codex plugin SHALL retain its current identity and narrow capability. A second marketplace entry with plugin id `spec-generator-v4` and a distinct source/manifest SHALL distribute the spec workflow. The package-producing task `p50-codex-plugin-distribution` SHALL emit an immutable id/source/manifest/capability handoff; `codex-init:FR-8` SHALL be the sole writer of marketplace order and support status. Package artifacts SHALL be generated from canonical sources and checked for drift rather than maintained as a hand-copied product tree.
- **FR-83c (single target repository root):** One resolved target repository root SHALL be injected into every MCP handler and helper. Read, mutation, proposal, transaction, status, attachment, and `create_spec` operations SHALL use that root even when process cwd is a Codex plugin-cache directory; no operation may read from or write to the cache by accident. Root resolution SHALL support Codex cache layouts and preserve realpath confinement. After any successful mutation, proposal apply, or multi-document transaction, the next live MCP read/status/trace SHALL expose the complete refreshed cross-document graph and SHALL match a fresh cold graph build for the affected nodes.
- **FR-83d (Codex hook normalization):** A channel-aware renderer SHALL derive Codex and Claude hook manifests from one route registry. Codex payloads and names — including `apply_patch`, shell commands, `update_plan`, and normalized `mcp__dev_pomogator_specs__*` calls — SHALL be converted to neutral internal events before guards run. Raw `.specs/**` access SHALL be denied under enforce while the corresponding MCP mutation remains allowed.
- **FR-83e (native phase orchestration):** The existing phase runner SHALL accept a host spawn adapter. In Codex Desktop it SHALL use native Codex subagents or the built-in `worker`/`explorer` fallback while preserving phase isolation, MCP-only spec access, STOP confirmation, gate retries, budgets, and failure semantics. Installed workflow correctness SHALL NOT depend on plugin distribution of custom `.codex/agents/*.toml`; repo-scoped generated agent profiles MAY optimize dogfood.
- **FR-83f (semantic judgment honesty):** The semantic judge and legacy judge call sites SHALL share the host adapter. When no supported Codex execution path is available they SHALL emit the existing explicit semantic-skip/not-ready outcome; they SHALL never translate an unavailable judge into GREEN.
- **FR-83g (generated adapters, not manual mirrors):** Canonical skill, agent, hook, MCP-consumer, and policy metadata SHALL have deterministic Codex projections with source fingerprints and `--check` drift enforcement. `.claude` MAY remain the source during this increment; `.agents`, `.codex`, and the installed plugin payload SHALL be generated or thin indexes. A broad manual second rules/skills tree is forbidden.
- **FR-83h (installed and dependency-absent proof):** The distributable bundle SHALL start without repository `node_modules`, expose the canonical required MCP surface, load the expected skills and hooks, and produce actionable doctor output for missing/stale plugin, MCP, hook, generated-adapter, root, or host capability state. Tool-count assertions SHALL compare the package catalog with the canonical registry rather than freeze today's count.
- **FR-83i (real Desktop evidence):** Release readiness SHALL include an isolated `CODEX_HOME` install plus a fresh Codex Desktop task after plugin reload/restart. The evidence SHALL prove installed-cache paths, MCP list/read/mutate/status, raw-write deny, phase-agent execution, and honest semantic status. A PATH shim, repo checkout alone, Codex CLI-only smoke, manifest inspection, or owner prose without a captured live record SHALL not satisfy this lane.
- **FR-83j (bounded host matrix and non-goals):** The supported matrix is Codex Desktop and Codex CLI, each in repo-dogfood and installed-plugin modes. App task/thread management APIs, scheduled automations, connectors, `app://` integration, context-menu behavior changes, Cursor FR-81 replacement, and wholesale canonical-tree relocation are OUT OF SCOPE. Native subagents used inside the workflow are in scope; managing the Codex application's user-owned tasks is not.

**Зависит от:** [FR-4](FR.md#fr-4), [FR-39](FR.md#fr-39), [FR-41](FR.md#fr-41), [FR-42](FR.md#fr-42), [FR-62](FR.md#fr-62), [FR-81](FR.md#fr-81).
**Связанные AC:** [AC-83.1](ACCEPTANCE_CRITERIA.md#ac-831), [AC-83.2](ACCEPTANCE_CRITERIA.md#ac-832), [AC-83.3](ACCEPTANCE_CRITERIA.md#ac-833), [AC-83.4](ACCEPTANCE_CRITERIA.md#ac-834), [AC-83.5](ACCEPTANCE_CRITERIA.md#ac-835), [AC-83.6](ACCEPTANCE_CRITERIA.md#ac-836), [AC-83.7](ACCEPTANCE_CRITERIA.md#ac-837), [AC-83.8](ACCEPTANCE_CRITERIA.md#ac-838), [AC-83.9](ACCEPTANCE_CRITERIA.md#ac-839), [AC-83.10](ACCEPTANCE_CRITERIA.md#ac-8310)
**Use Case:** [UC-35](USE_CASES.md#uc-35)
**User Story:** [User Story 63](USER_STORIES.md#user-story-63-codex-desktop-runs-the-full-spec-workflow-priority-p1)

---
