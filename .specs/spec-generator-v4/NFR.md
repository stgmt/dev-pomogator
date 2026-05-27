# Non-Functional Requirements (NFR)

## Performance

### NFR-Performance-1: SpecGraph cold start
System SHALL build full SpecGraph from cold start in **≤2 seconds** for project with up to 30 specs (~300 MD files + 50 `.feature` + 1 NDJSON). Larger projects SHOULD complete linearly (target: ≤10s for 200 specs before re-evaluating SQLite persistence per FR-10).

### NFR-Performance-2: Incremental reindex latency
System SHALL update SpecGraph on single-file change in **≤100ms p95** for projects up to 30 specs. Includes: chokidar event → re-parse changed file → graph updates → invalidate dependent backlinks.

### NFR-Performance-3: MCP tool response time
System SHALL respond to MCP tool calls within these p95 budgets:
- `get_trace(id)`: ≤50ms
- `find_by_tags(tags)`: ≤30ms
- `conformance_check(scope: single FR)`: ≤200ms (without semantic check)
- `conformance_check(scope: "all")`: ≤2s for 30 specs
- `search(query)`: ≤100ms text-only, ≤500ms with semantic embeddings

### NFR-Performance-4: PostToolUse hook latency budget
System hook fires within `throttle_ms` budget (default 3000ms). Within window: incremental reindex ≤100ms + conformance check ≤200ms + aggregation/dedupe ≤50ms. Total push-to-context latency ≤500ms after throttle window closes.

### NFR-Performance-5: Cross-spec reconcile budget (Phase 7)
`Skill("cross-spec-reconcile", mode: "light")` SHALL complete within 5 seconds for a 30-spec corpus (mechanical-only checks: glob + remark parse + Jaccard concept overlap + file existence + identifier extraction regex). `mode: "full"` has no time budget but SHALL cache pairwise semantic-judge results in `.dev-pomogator/.cross-spec-cache/<sha256(spec_a_content + spec_b_content)>.json` to avoid re-evaluating unchanged pairs across runs. Pre-filter SHALL skip Agent subagent invocation for pairs with <3 concept-noun overlap to bound N×N cost.

## Security

### NFR-Security-1: No env-var bypass for HARD hooks
System HARD hooks (`spec-conformance-guard`, PreToolUse syntax checks) MUST NOT have environment variable bypass. No `SPEC_CONFORMANCE_DISABLE=1` or similar. Pattern proven by v3 form-guards. Agents physically cannot disable enforcement. Soft features (PostToolUse push, semantic check) MAY have config-flag opt-out via `.spec-config.json` (NOT env-var) to prevent CI bypass.

### NFR-Security-2: Meta-guard protects manifest
System SHALL include meta-guard hook that DENIES removal of conformance guard from `extension.json` or `.claude/settings.local.json`. Pattern from v3 `extension-json-meta-guard`. Tampering attempts logged to `.dev-pomogator/logs/meta-guard.log`.

### NFR-Security-3: No hardcoded user identifiers
System MUST NOT embed maintainer-specific identifiers (GitHub owner/repo, user paths) into shipped artifacts. All such values derived at runtime (`git remote get-url`, `gh api user`, `git rev-parse --show-toplevel`, `path.basename(cwd)`). See memory `feedback_no-hardcoded-repo-or-user-identifiers`.

### NFR-Security-4: Env-first config resolution
System SHALL resolve config-derivable values via strict order: env file `~/.dev-pomogator/{component}.env` → runtime investigation (verified commands, not fantasy) → AskUserQuestion with derived default → persist outcome. See memory `feedback_env-first-then-investigate-then-ask`.

### NFR-Security-5: SQLite file permissions (Phase 4)
When SQLite persistence enabled — `.dev-pomogator/.spec-index.sqlite` file mode SHALL be `0600` (owner read/write only). Lock file `.dev-pomogator/.mcp-lock.json` same. Prevents accidental sharing in multi-user systems.

### NFR-Security-6: Cross-spec reconcile respects boundaries (Phase 7)
Reconcile skill MUST NOT read secret files even when globbed by its `.specs/*/` + impl-tree scan. It SHALL honor `boundaries.never[]` array from `.specs/.onboarding.json` if present (e.g. `.env`, `*.pem`, `credentials.json`, `~/.config/**`); else falls back to a hardcoded deny-list (`.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `**/secrets/**`). Override audit log `.claude/logs/cross-spec-overrides.jsonl` SHALL never contain secret values — only finding codes + reason text + session_id.

## Reliability

### NFR-Reliability-1: Graceful degradation on missing NDJSON
System SHALL function with reduced capability when `reqnroll_report.ndjson` / equivalent is absent. `get_trace` returns nodes WITHOUT test result data (scenarios listed without `lastResult` field). Warning surfaced via `STALE_NDJSON` or `NO_TEST_RUN_DATA` finding. No crash, no blocked spec workflow.

### NFR-Reliability-2: Atomic config writes
System SHALL write all config / state files atomically (temp file + atomic move). Applies to `.spec-config.json`, `.mcp-lock.json`, `.spec-index.sqlite` (via WAL). Prevents corruption on crash mid-write. Pattern from `atomic-config-save` rule.

### NFR-Reliability-3: Lock file stale detection
`.mcp-lock.json` MUST check existing pid validity via `process.kill(pid, 0)` on startup. If pid not alive (ESRCH) — lock deleted, new lock created atomically (`flag: 'wx'`).

### NFR-Reliability-4: chokidar polling fallback
System SHALL auto-detect FS events reliability via touch test at startup (create temp file, await event ≤500ms). If event missed → enable polling mode (1s interval) + log decision. Covers Docker Desktop bind-mounts, WSL2 `/mnt/c/...`, network FS.

### NFR-Reliability-5: SQLite corruption recovery (Phase 4)
System SHALL run `PRAGMA integrity_check` on SQLite at startup. If failure → auto-fallback to in-memory rebuild + corrupted file moved to `.dev-pomogator/.spec-index.sqlite.corrupt-{timestamp}` for postmortem + warning logged.

### NFR-Reliability-6: Marksman crash isolation
If bundled Marksman LSP subprocess crashes during runtime — MCP server detects via process exit code, logs warning, falls back to custom JS-based MD LSP. Auto-restart attempt every 30s; after 3 consecutive failures, disable Marksman for session.

### NFR-Reliability-7: Cross-spec reconcile graceful degradation (Phase 7)
Reconcile YAML write SHALL be atomic (temp file `consistency-report.yaml.tmp` + rename, per `.claude/rules/atomic-config-save.md`). Agent subagent invocations SHALL have a 120-second per-pair timeout; on timeout fallback to mechanical-only mode + log warning. If subagent completes on some pairs but fails on others, YAML `partial: true` flag set + warning emitted; system does NOT fail-loud. If SpecGraph + MCP server (Phase 1) unavailable, reconcile operates in degraded mode reading `.specs/*/*.md` directly via `fs` + `remark` + `glob`. Existing `acknowledged_by` / `resolution_status` fields are preserved on merge writes (never overwritten by new run).

## Usability

### NFR-Usability-1: Single-call agent context
Primary tool `get_trace(node_id)` MUST provide enough context for agent to reason about the node WITHOUT follow-up file Read operations. Measured: agent test fixture invokes `get_trace("FR-001")` then produces coherent next action — without any Read tool call for spec files.

### NFR-Usability-2: Actionable error messages
Every `conformance_check` finding MUST include `suggestions[]` array with concrete actions (`rename_ref`, `remove_ref`, `create_fr`, etc.) with `confidence` score + `reason`. Agent never has to investigate "what's wrong" — finding tells it.

### NFR-Usability-3: No hidden state
All v4 state derivable from filesystem (`.specs/`, `.feature`, NDJSON) + `.spec-config.json`. No hidden caches surviving across CLI invocations (in-memory only — process restart = clean state). Phase 4 SQLite — explicit and inspectable via standard `sqlite3` CLI.

### NFR-Usability-4: Migration is interactive, never silent
`dev-pomogator migrate-v3-to-v4` MUST require explicit user consent per file (default `skip` if no input within 30s). Never auto-rewrite without confirm. `--suggest-only` mode for preview-without-apply.

### NFR-Usability-5: Backward compat as first-class concern
System MUST work with legacy v3 specs without ANY migration (read-only compat mode). Triple-anchor registration in custom MD parser. Agent gets less context for legacy specs (no IDE wiki-links until migration) but workflow not broken. User chooses when/whether to migrate.

### NFR-Usability-6: Cross-platform install
System SHALL install successfully on: Windows 10/11, macOS 12+, Ubuntu 20.04+, Alpine Linux 3.18+. Marksman binary bundled per-platform. Native deps minimized (pure JS preferred). Install verified via CI matrix.

### NFR-Usability-7: Cross-spec reconcile CRITICAL prompt rendering (Phase 7)
CRITICAL blocking AskUserQuestion SHALL use `header: "⚠️ CRIT"` (≤12 chars to satisfy AskUserQuestion schema constraint). Actual color rendering of the chip/tag is up to the Claude Code client (terminal vs web vs IDE) — the system guarantees only that the ⚠️ symbol + CAPS string telegraphs severity, NOT a specific red color. Resolve skill 5-field explanation block SHALL use fenced code blocks for diff preview so terminal and web clients render them legibly. Foreign-spec edit banner «⚠️ This edits foreign spec: …» SHALL be a separate line above the per-finding AskUserQuestion to maximize visibility.
