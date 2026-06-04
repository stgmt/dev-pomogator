# Non-Functional Requirements (NFR)

## Performance

### NFR-Performance-1

**SpecGraph cold start**
System SHALL build full SpecGraph from cold start in **≤2 seconds** for project with up to 30 specs (~300 MD files + 50 `.feature` + 1 NDJSON). Larger projects SHOULD complete linearly (target: ≤10s for 200 specs before re-evaluating SQLite persistence per FR-10).

### NFR-Performance-2

**Incremental reindex latency**
System SHALL update SpecGraph on single-file change in **≤100ms p95** for projects up to 30 specs. Includes: chokidar event → re-parse changed file → graph updates → invalidate dependent backlinks.

### NFR-Performance-3

**MCP tool response time**
System SHALL respond to MCP tool calls within these p95 budgets:
- `get_trace(id)`: ≤50ms
- `find_by_tags(tags)`: ≤30ms
- `conformance_check(scope: single FR)`: ≤200ms (without semantic check)
- `conformance_check(scope: "all")`: ≤2s for 30 specs
- `search(query)`: ≤100ms text-only, ≤500ms with semantic embeddings

### NFR-Performance-4

**PostToolUse hook latency budget**
System hook fires within `throttle_ms` budget (default 3000ms). Within window: incremental reindex ≤100ms + conformance check ≤200ms + aggregation/dedupe ≤50ms. Total push-to-context latency ≤500ms after throttle window closes.

### NFR-Performance-5

**Cross-spec reconcile budget (Phase 7)**
`Skill("cross-spec-reconcile", mode: "light")` SHALL complete within 5 seconds for a 30-spec corpus (mechanical-only checks: glob + remark parse + Jaccard concept overlap + file existence + identifier extraction regex). `mode: "full"` has no time budget but SHALL cache pairwise semantic-judge results in `.dev-pomogator/.cross-spec-cache/<sha256(spec_a_content + spec_b_content)>.json` to avoid re-evaluating unchanged pairs across runs. Pre-filter SHALL skip Agent subagent invocation for pairs with <3 concept-noun overlap to bound N×N cost.

### NFR-Performance-6

**UserPromptSubmit summary render budget (FR-20)**
FR-20 threshold-only summary renderer SHALL complete in **≤50ms p95** between `UserPromptSubmit` hook invocation and the line being emitted to agent context. Reads from `~/.dev-pomogator/logs/form-guards.log` AND latest `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` are capped at last 1000 entries per file to bound scan cost. Threshold-tracker state (`~/.dev-pomogator/state/last-summary-ack.json`) is read+written atomically via temp-file-rename pattern (NFR-Reliability-2).

### NFR-Performance-7

**PostToolUse throttle is fixed-window (FR-28)**
FR-6 PostToolUse 3-second throttle SHALL be implemented as a **fixed window** (not sliding, not debounce). First qualifying event at `t0` opens a window `[t0, t0 + throttle_ms]`; subsequent events within the window batch into it; at window close the aggregated findings push once and the throttle resets. New event at `t0 + throttle_ms + ε` opens a fresh window. Latency upper-bound for the author: `throttle_ms` from the first edit in a burst (default 3000ms). Sliding-window / debounce semantics are explicitly out of scope — they could indefinitely defer push during continuous edits.

### NFR-Performance-8

**Anchor-integrity check latency budget (FR-34)**
The anchor-integrity check on a SINGLE touched spec (PostToolUse path) SHALL complete in **≤150ms p95** for specs up to ~40 headings (slug computation is pure-string; no LSP round-trip). A full-corpus check (CI / `--all`) SHALL be O(headings+links) and complete in **≤3s** for the 48-spec corpus (~1500 headings, ~4440 links). The deterministic fixer SHALL add no LSP/network call; the `claude -p` branch runs in the background and is NOT counted against the edit-path budget.

## Security

### NFR-Security-1

**No env-var bypass for HARD hooks**
System HARD hooks (`spec-conformance-guard`, PreToolUse syntax checks) MUST NOT have environment variable bypass. No `SPEC_CONFORMANCE_DISABLE=1` or similar. Pattern proven by v3 form-guards. Agents physically cannot disable enforcement. Soft features (PostToolUse push, semantic check) MAY have config-flag opt-out via `.spec-config.json` (NOT env-var) to prevent CI bypass.

### NFR-Security-2

**Meta-guard protects manifest**
System SHALL include meta-guard hook that DENIES removal of conformance guard from `extension.json` or `.claude/settings.local.json`. Pattern from v3 `extension-json-meta-guard`. Tampering attempts logged to `.dev-pomogator/logs/meta-guard.log`.

### NFR-Security-3

**No hardcoded user identifiers**
System MUST NOT embed maintainer-specific identifiers (GitHub owner/repo, user paths) into shipped artifacts. All such values derived at runtime (`git remote get-url`, `gh api user`, `git rev-parse --show-toplevel`, `path.basename(cwd)`). See memory `feedback_no-hardcoded-repo-or-user-identifiers`.

### NFR-Security-4

**Env-first config resolution**
System SHALL resolve config-derivable values via strict order: env file `~/.dev-pomogator/{component}.env` → runtime investigation (verified commands, not fantasy) → AskUserQuestion with derived default → persist outcome. See memory `feedback_env-first-then-investigate-then-ask`.

### NFR-Security-5

**SQLite file permissions (Phase 4)**
When SQLite persistence enabled — `.dev-pomogator/.spec-index.sqlite` file mode SHALL be `0600` (owner read/write only). Lock file `.dev-pomogator/.mcp-lock.json` same. Prevents accidental sharing in multi-user systems.

### NFR-Security-6

**Cross-spec reconcile respects boundaries (Phase 7)**
Reconcile skill MUST NOT read secret files even when globbed by its `.specs/*/` + impl-tree scan. It SHALL honor `boundaries.never[]` array from `.specs/.onboarding.json` if present (e.g. `.env`, `*.pem`, `credentials.json`, `~/.config/**`); else falls back to a hardcoded deny-list (`.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `**/secrets/**`). Override audit log `.claude/logs/cross-spec-overrides.jsonl` SHALL never contain secret values — only finding codes + reason text + session_id.

### NFR-Security-7

**LLM-as-judge content boundary (FR-26)**
FR-8 semantic-drift `claude -p` subprocess MUST NOT receive content matching the deny-list defined in FR-26 (file-name globs + body-content regex covering API keys, bearer tokens, private keys, password assignments). Matched inputs SKIP the subprocess invocation entirely and emit a `SEMANTIC_CHECK_SKIPPED_DENY_LIST` finding — never substituting a false «no drift detected» result. Per-spec opt-out (`spec_llm_judge_deny: true` frontmatter) FORCES skip regardless of content; no «allow-list override» exists. Extends NFR-Security-6 boundary policy from reconcile to FR-8's subprocess channel.

### NFR-Security-8

**Marksman LSP supply-chain verification (FR-27)**
FR-7 Marksman binary `postInstall` download MUST verify sha256 against the pinned hash in `package.json::marksmanHashes` (or sibling `marksman-hashes.json`) for the current platform/arch/version triple. Mismatch → install ABORTS with explicit error message naming both hashes; downloaded file deleted. Hash list updates require explicit `dev-pomogator update-marksman-hashes` CLI invocation with maintainer-provided upstream sha256 — no auto-update from GitHub releases API.

## Reliability

### NFR-Reliability-1

**Graceful degradation on missing NDJSON**
System SHALL function with reduced capability when `reqnroll_report.ndjson` / equivalent is absent. `get_trace` returns nodes WITHOUT test result data (scenarios listed without `lastResult` field). Warning surfaced via `STALE_NDJSON` or `NO_TEST_RUN_DATA` finding. No crash, no blocked spec workflow.

### NFR-Reliability-2

**Atomic config writes**
System SHALL write all config / state files atomically (temp file + atomic move). Applies to `.spec-config.json`, `.mcp-lock.json`, `.spec-index.sqlite` (via WAL). Prevents corruption on crash mid-write. Pattern from `atomic-config-save` rule.

### NFR-Reliability-3

**Lock file stale detection**
`.mcp-lock.json` MUST check existing pid validity via `process.kill(pid, 0)` on startup. If pid not alive (ESRCH) — lock deleted, new lock created atomically (`flag: 'wx'`).

### NFR-Reliability-4

**chokidar polling fallback**
System SHALL auto-detect FS events reliability via touch test at startup (create temp file, await event ≤500ms). If event missed → enable polling mode (1s interval) + log decision. Covers Docker Desktop bind-mounts, WSL2 `/mnt/c/...`, network FS.

### NFR-Reliability-5

**SQLite corruption recovery (Phase 4)**
System SHALL run `PRAGMA integrity_check` on SQLite at startup. If failure → auto-fallback to in-memory rebuild + corrupted file moved to `.dev-pomogator/.spec-index.sqlite.corrupt-{timestamp}` for postmortem + warning logged.

### NFR-Reliability-6

**Marksman crash isolation (native LSP, no fake fallback)**
Marksman runs as a NATIVE Claude Code LSP plugin (`.lsp.json`), so Claude Code's LSP host owns the subprocess lifecycle — including restart (`maxRestarts` in `.lsp.json`). If Marksman is genuinely unavailable (crash, offline + unsupported platform), markdown navigation is simply absent with an actionable message — the system SHALL NOT fake a degraded JS MD-LSP (FR-7a). Spec-DOMAIN queries (`get_trace` / `get_coverage` / `find_refs`) are graph-backed and unaffected by Marksman's state.

### NFR-Reliability-7

**Cross-spec reconcile graceful degradation (Phase 7)**
Reconcile YAML write SHALL be atomic (temp file `consistency-report.yaml.tmp` + rename, per `.claude/rules/atomic-config-save.md`). Agent subagent invocations SHALL have a 120-second per-pair timeout; on timeout fallback to mechanical-only mode + log warning. If subagent completes on some pairs but fails on others, YAML `partial: true` flag set + warning emitted; system does NOT fail-loud. If SpecGraph + MCP server (Phase 1) unavailable, reconcile operates in degraded mode reading `.specs/*/*.md` directly via `fs` + `remark` + `glob`. Existing `acknowledged_by` / `resolution_status` fields are preserved on merge writes (never overwritten by new run).

### NFR-Reliability-8

**Two-tier hook failure-mode invariants (FR-19)**
PreToolUse hooks SHALL follow the two-tier failure policy defined in FR-19. SOFT tier (5 v3 form-guards + meta-guard): on ANY exception (parse, IO, runtime, timeout) MUST log to `~/.dev-pomogator/logs/form-guards.log` AND exit 0 (allow operation). HARD tier (`spec-conformance-guard`, FR-5): startup/config crash → exit 1 + stderr (hard fail surfaces broken install); per-file content-parse exception → log to spec-check-log JSONL + exit 0 (graceful per-file degradation). Rationale documented in DESIGN.md «Hook failure-mode tiers» paragraph. Single-tier «all fail-open» creates a known bypass vector (malicious .md crashes hard guard → unprotected Writes everywhere) and is explicitly rejected.

### NFR-Reliability-9

**Anchor auto-fix is non-blocking, idempotent, and never guesses (FR-34c)**
The auto-fix `claude -p`/background branch MUST NOT block the triggering Write/Edit — it is dispatched detached and reports asynchronously. The deterministic branch MUST be idempotent (`fix(fix(x))==fix(x)`) and MUST only rewrite an anchor when the target heading is unambiguously identified by id; ambiguous links are left flagged, never guess-rewritten (a wrong auto-rewrite is worse than a flagged broken link). The Stop-gate escape hatch `[skip-anchor-fix:]` MUST be append-logged to `.claude/logs/` for audit (mirrors the scope-gate escape-hatch discipline). PostToolUse anchor-check exceptions follow the SOFT-tier policy (log + exit 0 — never block the edit on a checker bug).

### NFR-Reliability-10

**Test-quality gate must not false-block a strong test (FR-35)**
The test-quality gate MUST have zero false positives on a `STRONG` verdict — a wrongful block erodes trust and trains agents to game the `[skip-test-quality:]` escape (the same failure mode the gate exists to prevent). The test-body audit MUST run within the existing `get_coverage` latency budget (no separate >2s per-task stall); when the auditor is unavailable the gate MUST degrade to the current PASS/FAIL behaviour + a visible `TASK_TEST_QUALITY=unknown` note (fail-open, never silently pass a possibly-fake test as DONE).

## Usability

### NFR-Usability-1

**Single-call agent context**
Primary tool `get_trace(node_id)` MUST provide enough context for agent to reason about the node WITHOUT follow-up file Read operations. Measured: agent test fixture invokes `get_trace("FR-001")` then produces coherent next action — without any Read tool call for spec files.

### NFR-Usability-2

**Actionable error messages**
Every `conformance_check` finding MUST include `suggestions[]` array with concrete actions (`rename_ref`, `remove_ref`, `create_fr`, etc.) with `confidence` score + `reason`. Agent never has to investigate "what's wrong" — finding tells it.

### NFR-Usability-3

**No hidden state**
All v4 state derivable from filesystem (`.specs/`, `.feature`, NDJSON) + `.spec-config.json`. No hidden caches surviving across CLI invocations (in-memory only — process restart = clean state). Phase 4 SQLite — explicit and inspectable via standard `sqlite3` CLI.

### NFR-Usability-4

**Migration is interactive, never silent**
`dev-pomogator migrate-v3-to-v4` MUST require explicit user consent per file (default `skip` if no input within 30s). Never auto-rewrite without confirm. `--suggest-only` mode for preview-without-apply.

### NFR-Usability-5

**Backward compat as first-class concern**
System MUST work with legacy v3 specs without ANY migration (read-only compat mode). Triple-anchor registration in custom MD parser. Agent gets less context for legacy specs (no IDE wiki-links until migration) but workflow not broken. User chooses when/whether to migrate.

### NFR-Usability-6

**Cross-platform install**
System SHALL install successfully on: Windows 10/11, macOS 12+, Ubuntu 20.04+, Alpine Linux 3.18+. Marksman binary bundled per-platform. Native deps minimized (pure JS preferred). Install verified via CI matrix.

### NFR-Usability-7

**Cross-spec reconcile CRITICAL prompt rendering (Phase 7)**
CRITICAL blocking AskUserQuestion SHALL use `header: "⚠️ CRIT"` (≤12 chars to satisfy AskUserQuestion schema constraint). Actual color rendering of the chip/tag is up to the Claude Code client (terminal vs web vs IDE) — the system guarantees only that the ⚠️ symbol + CAPS string telegraphs severity, NOT a specific red color. Resolve skill 5-field explanation block SHALL use fenced code blocks for diff preview so terminal and web clients render them legibly. Foreign-spec edit banner «⚠️ This edits foreign spec: …» SHALL be a separate line above the per-finding AskUserQuestion to maximize visibility.

## Legacy v3 budgets (preserved from spec-generator-v3, consolidated 2026-05-28)

These NFRs were the shipped contracts of spec-generator-v3 (PR #14) and remain in force for v4's soft-tier hook system (FR-19). They are reproduced here so the v3 spec folder can be deleted without losing the performance + reliability guarantees the production code depends on.

### NFR-Legacy-1

**Soft-tier hook chain latency**
Each soft-tier form-guard SHALL short-circuit in ≤30ms for non-target files (filename filter in the first 3 lines of the hook). Full validation SHALL complete in ≤150ms p95 worst case on a 500-line spec. The serial chain of all 6 v3 form-guards (kept verbatim by v4 FR-19) SHALL add ≤180ms per Write/Edit invocation.

### NFR-Legacy-2

**Audit log append latency**
`audit-logger.logEvent` SHALL complete in ≤5ms p95 (synchronous `appendFileSync` to `~/.dev-pomogator/logs/form-guards.log`). v4 FR-23 keeps this file path and write path verbatim.

### NFR-Legacy-3

**Audit log retention and rotation**
The form-guards log SHALL retain 30 days of events, with the file capped at 10MB. Rotation runs via `validate-specs.ts` once per session. v4 FR-23 keeps these parameters; v4's separate `.dev-pomogator/.spec-check-log/<DATE>.jsonl` (FR-15) has its own 10MB rotation independent of this one.

### NFR-Legacy-4

**Hook fail-open safety invariant**
Every soft-tier hook SHALL be wrapped in `main().catch(() => exit(0))` so an internal exception never blocks a legitimate Write. v4 FR-19 + NFR-Reliability-8 codify this as the soft-tier rule.

### NFR-Legacy-5

**UserPromptSubmit summary latency (v3 behavior)**
`renderFormGuardsSummary` SHALL complete in ≤50ms (read + parse last 24h events from `~/.dev-pomogator/logs/form-guards.log`). v4 supersedes the v3 «render at every prompt» behavior with FR-20 threshold-only + on-demand `/spec-status` (B3 + B4); the underlying renderer code path SHALL be preserved unchanged as long as v3 form-guards remain installed.

### NFR-Legacy-6

**Backward-compat for `.progress.json::version` reads**
`readProgressState` SHALL continue to ignore unknown fields so that v4's `version: 4` bump does not break v3-era readers still loaded in target projects mid-migration.
