# Design

## Реализуемые требования

- [FR-1: Phase 0 cucumber-js BDD migration](FR.md#fr-1)
- [FR-2: SpecGraph builder](FR.md#fr-2)
- [FR-3: Custom MD parser dual-anchor](FR.md#fr-3)
- [FR-4: MCP server get_trace](FR.md#fr-4)
- [FR-5: PreToolUse HARD hooks](FR.md#fr-5)
- [FR-6: PostToolUse always-push throttle](FR.md#fr-6)
- [FR-7: Marksman bundle install](FR.md#fr-7)
- [FR-8: LLM semantic drift check (opt-in)](FR.md#fr-8)
- [FR-9: Multi-language BDD support](FR.md#fr-9)
- [FR-10: SQLite cross-session (Phase 4)](FR.md#fr-10)
- [FR-11: Migration helper v3→v4](FR.md#fr-11)
- [FR-12: architecture-research-workflow skill](FR.md#fr-12)
- [FR-13: Orphan resolution policy](FR.md#fr-13)
- [FR-14: Devcontainer / multi-env support](FR.md#fr-14)
- [FR-15: Side-channel conformance log](FR.md#fr-15)
- [FR-16: GitHub Codespaces support](FR.md#fr-16)
- [FR-57: Scaffold-completeness audit](FR.md#fr-57)

## Компоненты

### Core
- `SpecGraph` (in-memory) — типизированные nodes (FR/NFR/AC/SCEN/TASK/UC/RISK/File) + typed edges (refs/covers/tested-by/tagged-by/implements/last-result)
- `MdParser` — `unified` + `remark-parse` + `remark-frontmatter` + `remark-wiki-link` + `unist-util-visit`; dual-anchor registration via configurable regex `anchor_patterns`
- `GherkinParser` — `@cucumber/gherkin` + `@cucumber/gherkin-utils` (AST walker, tag inheritance)
- `NdjsonIngester` — `@cucumber/messages` (canonical NDJSON parser/serializer), reads `reqnroll_report.ndjson`-compatible files
- `ConformanceChecker` — структурные checks (UNCOVERED_FR / ORPHAN_TASK / BROKEN_REF / DUPLICATE_DEFINITION / SCENARIO_TAG_ORPHAN / UNTAGGED_SCENARIO / STALE_NDJSON / FR_REGRESSION)
- `GraphBuilder` — orchestrates parsers, merges trees → SpecGraph, runs incremental rebuild on chokidar events

### MCP layer
- `McpServer` — `@modelcontextprotocol/sdk` stdio MCP, exposes 11 tools (`get_trace`, `get_node`, `find_by_tags`, `find_by_type`, `conformance_check`, `blast_radius`, `list_orphans`, `broken_refs`, `git_diff_impact`, `search`, `overview`)
- `LspBridge` (optional) — spawns Marksman subprocess, proxies LSP `textDocument/references`/`textDocument/definition` requests for MD subgraph navigation

### Hooks (PreToolUse / PostToolUse)
- `spec-conformance-guard` (PreToolUse) — HARD invariants: DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN
- `spec-conformance-push` (PostToolUse) — async push: incremental reindex + conformance_check + 3s throttle + aggregation + `<system-reminder>` injection
- `bash-post-test-ingest` (PostToolUse on Bash) — detects `dotnet test`/`npm run test:bdd` completion → invokes `ingest-ndjson` MCP tool → splits master NDJSON per spec

### Subagent (Phase 3+)
- `claude-cli-bridge` — spawns `claude -p "..."` subprocess for semantic checks (Haiku model)
- `SemanticDriftCheck` — caches by `hash(fr_text + scenario_text)`, async

### Infrastructure
- `FileWatcher` — `chokidar` with auto-polling fallback (touch test at startup)
- `MultiEnvLock` — `.dev-pomogator/.mcp-lock.json` atomic create + pid+env tracking
- `SqliteIndex` (Phase 4 opt-in) — `better-sqlite3` WAL mode, FTS5 для full-text search

## Где лежит реализация

- Core graph + parsers: `extensions/specs-workflow/tools/spec-graph/` (NEW directory in existing extension)
- MCP server: `extensions/specs-workflow/tools/spec-mcp-server/` (NEW)
- Hooks: `extensions/specs-workflow/tools/spec-conformance-guard/`, `extensions/specs-workflow/tools/spec-conformance-push/` (NEW)
- Subagent bridge: `extensions/specs-workflow/tools/claude-cli-bridge/` (NEW, Phase 3+)
- Marksman binary: `.dev-pomogator/bin/marksman` (per-platform, installed by postInstall script)
- Migration script: `extensions/specs-workflow/tools/migrate-v3-to-v4/` (NEW, Phase 5)
- New skill: `.claude/skills/architecture-research-workflow/` (NEW, Phase 6)
- Existing patterns reused: `extensions/specs-workflow/tools/specs-generator/{validate-spec,audit-spec,bdd-framework-detector,scaffold-spec}.ts`

## Директории и файлы

См. [FILE_CHANGES.md](FILE_CHANGES.md) — полный список ~40 файлов across 7 phases.

## Алгоритм

### Boot sequence (MCP server startup)

1. Read `.spec-config.json` (defaults if absent)
2. Acquire `.dev-pomogator/.mcp-lock.json` atomic (env+pid+session_id)
3. Spawn Marksman LSP subprocess (if bundled binary available)
4. Initialize chokidar watcher + run touch test (auto-detect polling need)
5. Initial SpecGraph build: glob `.specs/**/*.md` + `**/*.feature` → parse → merge → in-memory graph
6. Read `.dev-pomogator/.last-test-run.ndjson` if exists → enrich graph with TestResult nodes/edges
7. MCP server `initialize` LSP-style handshake with Claude Code client
8. Ready to serve tool calls

### `get_trace(node_id)` request flow

1. Validate `node_id` shape (regex match against known patterns)
2. Lookup in `definitions` map → if not found, fuzzy-match (Levenshtein top-3 suggestions)
3. Resolve `backlinks[node_id]` → list of citing locations
4. For Scenario nodes: lookup `pickleId` → `testCase.id` → `testCaseStarted.id` → latest `testStepFinished.testStepResult`
5. For FR/NFR nodes: walk edges to collect AC + Scenarios + Tasks + Code refs (via step bindings)
6. Generate `explanation_for_agent` (template-based, ≤500 chars, includes counts + failing step if any)
7. Return structured tree + explanation

### PostToolUse hook flow

1. Hook receives `tool_input.file_path` after Write/Edit success
2. Match path against `.specs/**/*.md` or `**/*.feature` — skip if no match
3. Send `affected_file` to MCP via internal IPC → MCP runs incremental reindex
4. Run `conformance_check(scope: affected_node_ids)` → collect findings
5. Throttle: queue findings in 3s window keyed by `spec_slug`
6. After window closes: dedupe (same finding_code + location) → assemble `<system-reminder>` text
7. Return to Claude Code harness as `permissionDecision: "allow"` with `hookSpecificOutput.additionalContext = "<system-reminder>...</system-reminder>"`

### Migration v3→v4 flow

1. CLI parse `--suggest-only` flag
2. Scan `.specs/*/FR.md`, `.specs/*/ACCEPTANCE_CRITERIA.md`, `.specs/*/*.feature`
3. For each file: detect legacy patterns (`### Requirement: FR-N`, untagged scenarios, missing frontmatter)
4. Generate per-file diff (heading conversion, frontmatter add, tag predictions)
5. `--suggest-only`: print all diffs to stdout, exit
6. Interactive mode: prompt per file (approve/skip/edit) with 30s default-skip timeout
7. Apply approved diffs atomically (temp file + move)
8. Bump `.progress.json::version: 4` only on successful spec migration
9. Print summary: N files migrated, M skipped, K errors

## API

### MCP tools (canonical list)

См. [spec-generator-v4_SCHEMA.md](spec-generator-v4_SCHEMA.md) для полных input/output JSON schemas.

| Tool | Input | Output schema |
|------|-------|---------------|
| `get_node(id)` | `{ id: string }` | `Node` (type-aware payload) |
| `get_trace(id, depth?)` | `{ id: string, depth?: number }` | `TraceResponse` (structured tree + explanation_for_agent) |
| `find_by_tags(tags, operator?)` | `{ tags: string[], operator?: "AND"\|"OR" }` | `Node[]` |
| `find_by_type(type, slug?)` | `{ type: NodeType, slug?: string }` | `Node[]` |
| `conformance_check(scope?, severity?, semantic?)` | `{ scope?: string, severity?: Severity[], semantic?: boolean }` | `Finding[]` |
| `blast_radius(node_id, change_type)` | `{ node_id: string, change_type: "delete"\|"modify"\|"rename" }` | `BlastResponse` |
| `list_orphans(type?)` | `{ type?: NodeType }` | `Node[]` |
| `broken_refs(scope?)` | `{ scope?: string }` | `BrokenRef[]` |
| `git_diff_impact(rev?)` | `{ rev?: string }` | `ImpactResponse` |
| `search(query, filter?)` | `{ query: string, filter?: NodeFilter }` | `SearchResult[]` |
| `overview(slug?)` | `{ slug?: string }` | `Overview` |

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format:
> each `### Decision:` block must include **Rationale:**, **Trade-off:**, **Alternatives considered:** with ≥2 `- {alt}` bullets.

### Decision: In-memory storage only for Phase 2

**Требование:** [FR-2](FR.md#fr-2)

**Rationale:** Simplicity wins for the 30-spec scale typical of v4 first deployment. Pure JS implementation has zero native dependencies (`better-sqlite3` requires platform-specific compile), making install trivial on devcontainer / Codespaces / WSL where bind-mount FS lock semantics are unreliable. Cold-start rebuild at 1-2s is acceptable for single Claude Code session lifecycle. Source-of-truth always lives in `.specs/**/*.md` (git-committed) — in-memory index is purely derived, loss = 1-2s rebuild not data loss.

**Trade-off:** No cross-session sharing — each Claude Code session pays the 1-2s rebuild cost. Multi-session scenarios (developer running two terminals on same project) cannot share SpecGraph state without going through filesystem.

**Alternatives considered:**
- SQLite FTS5 (rejected for Phase 2) — devcontainer bind-mount lock corruption risk (Docker Desktop on Windows/Mac), `better-sqlite3` native compile complicates install matrix, schema migrations add maintenance burden, cross-session benefit not justified at single-session scale. Deferred to Phase 4 opt-in via config flag.
- LMDB / RocksDB (rejected) — same native-deps issue plus less common in JS ecosystem, harder to debug for users.
- Persistent JSON file (rejected) — atomic write/lock semantics same problem as SQLite, no query performance benefit over in-memory, only marginal cold-start savings.

### Decision: Dual-anchor heading convention (FR-001 + fr-001-login)

**Требование:** [FR-3](FR.md#fr-3)

**Rationale:** Marksman LSP generates wiki-link slugs from heading text natively (`### FR-001: Login` → `fr-001-login`), enabling IDE Ctrl+Click navigation without custom plugins. Compact `[[FR-001]]` form preferred by agents for dense cross-refs. Registering BOTH anchors satisfies both human readers (descriptive `[[fr-001-login]]`) and agent context efficiency (`[[FR-001]]`). Legacy v3 `### Requirement: FR-001 Login` continues to work via triple-anchor registration in our custom parser — no breaking change.

**Trade-off:** Parser complexity (regex `anchor_patterns` config + triple-registration during indexing) adds ~150 lines of code vs single-anchor approach. Slight indexing overhead (~5ms per heading vs 1ms).

**Alternatives considered:**
- Status quo `### Requirement: FR-N` only (rejected) — no IDE wiki-link navigation in Marksman / VS Code, slugs unusable (`requirement-fr-001-login` too long).
- Short heading only `### FR-N: ...` without backward compat (rejected) — breaks 30+ existing v3 specs across the dev-pomogator user base; forced migration too invasive.
- HTML anchor markers `<a name="FR-001"></a>` adjacent to headings (rejected) — clutters MD source, requires migration script to add markers to all existing specs anyway, no advantage over regex parser.

### Decision: Workflow orchestrator architecture = thin orchestrator + existing workers (Option B)

**Требование:** [FR-33](FR.md#fr-33)

**Rationale:** v4 already ships the workers (create-spec phases, cross-spec-reconcile/resolve, spec-backlog resolvers, MCP `get_trace`/`get_coverage`/`get_test_result`, conformance hooks). A thin orchestrator that owns only the feature-map + routing reuses all of them (per repo reuse rules), stays token-cheap, scales (workers run as isolated sub-agents, parallelizable), and matches the repo's proven dispatch pattern (spec-backlog specialist resolvers, cross-spec semantic subagent). Self-improvement is a human-merge dated ledger (`SELF_IMPROVE.md`): the orchestrator accumulates `pending` improvement notes, proactively reminds the human, and only auto-applies after the human marks an entry `approved` — keeping the human as the validation gate (consistent with FR-32 honesty discipline) while removing them as the memory of what's left to do.

**Trade-off:** More moving parts than a single monolithic skill; sub-agent worker dispatch costs extra latency/tokens; the routing feature-map must be kept current as capabilities grow (mitigated by the FR-33 drift guard, task T-Orch.3).

**Alternatives considered:**
- Option A — single "general" monolithic playbook skill (rejected): one `SKILL.md` grows past the skill-listing budget, one context does everything → hits limits on large workflows, no parallelism; its only edge is a single update point.
- Option C — tools-only / emergent, no central skill (rejected): no single entry point that "knows the whole workflow" (the explicit requirement), no holistic self-improve ledger, and the manual-coverage / stale-TASKS friction that motivated this recurs because nothing orchestrates the honesty discipline end-to-end.
- Full restructure files-per-FR (`.specs/auth/fr-001.md`) (rejected) — too invasive, loses spec cohesion, breaks audit/validation tooling.

### Decision: MCP and LSP as separate layers, not nested

**Требование:** [FR-4](FR.md#fr-4)

**Rationale:** LSP is reactive (responds to file events / Read tool enrichment), MCP is pull-based (agent explicitly calls tools). Different ментальные модели и activation patterns. Forcing MCP-wraps-LSP would lose MCP's autonomous initiation capability (e.g., `conformance_check` doesn't map to any standard LSP request). Keeping them parallel: agent uses LSP-backed tools (`FindReferences`) for known symbol queries, MCP for domain queries (`get_trace`).

**Trade-off:** Some capability duplication — `FindReferences` (LSP) and `backlinks` (MCP) overlap. Cost: two implementations to maintain. Benefit: each layer optimized for its access pattern.

**Alternatives considered:**
- Pure LSP-as-MCP-wrap (rejected) — loses MCP's autonomous pull-based initiation, all calls become reactive, complicates conformance_check (no natural LSP equivalent).
- Pure MCP only (no LSP backing) (rejected) — loses 900× speedup on cross-file symbol queries (`textDocument/references` vs grep), wastes agent context on large match sets.
- LSP only, no MCP (rejected) — no way to expose domain-specific queries (`get_trace`, `blast_radius`); LSP standard not extensible enough.

### Decision: PostToolUse always-push with 3s throttle

**Требование:** [FR-6](FR.md#fr-6)

**Rationale:** Pull-only conformance check requires agent to remember to call `conformance_check` after every spec edit. Empirical observation (session 2026-05-17): agents forget. Push-based with throttling guarantees conformance feedback reaches agent context within bounded time, eliminating silent drift between spec edit and detection. 3-second throttle balances real-time feedback against bulk-edit spam.

**Trade-off:** Red-phase TDD noise — agent intentionally writing failing tests sees push warnings. Mitigated via `_no_push_check: true` frontmatter escape hatch + `_no_push_check` exempt list in config. Some shift in user expectation: previously silent, now chatty.

**Alternatives considered:**
- Pull-only (rejected) — proven agent forgetfulness in 30+ turn session; primary v4 value prop lost.
- Side-channel JSONL only (rejected — moved to Phase 4 supplementary feature) — log persists but agent doesn't see; same forgetfulness problem.
- HARD-block only (rejected) — covers syntax invariants but misses soft drift (UNCOVERED_FR, semantic mismatch).
- Configurable threshold (push only on `error` severity) (deferred) — could be added as `post_tool_use.severity_filter` config in Phase 2.5; default is push all severities.

### Decision: cucumber-js as Phase 0 canonical BDD runner

**Требование:** [FR-1](FR.md#fr-1)

**Rationale:** Only TypeScript-compatible BDD runner emitting canonical Cucumber Messages NDJSON (the same schema Reqnroll v3+ produces for .NET). Single schema across languages = simplified NDJSON ingester in Phase 1, no per-runner adapters in Phase 3. Mature ecosystem (`@cucumber/cucumber`, `@cucumber/messages`, `@cucumber/gherkin-utils` все official, MIT, stable).

**Trade-off:** Migration burden for dev-pomogator: existing vitest pseudo-BDD (`.feature` as docs only, tests in vitest) must convert to real cucumber-js. Estimated 1-2 days of work for ~30 scenarios. Vitest unit tests stay untouched (additive setup), but CI now runs two test suites.

**Alternatives considered:**
- `@amiceli/vitest-cucumber` (rejected) — custom output format, not Cucumber Messages NDJSON; would block v4 trace pipeline.
- QuickPickle (rejected) — Cucumber Messages output support unclear/unverified; smaller community = higher risk of NDJSON breaking changes.
- `jest-cucumber` (rejected) — jest-specific, dev-pomogator uses vitest; would require jest install or wholesale framework change.
- Keep vitest pseudo-BDD (rejected) — no runtime test trace = v4 graph cannot link FR→Scenario→TestResult, defeats core v4 value.

### Decision: Marksman bundle install (always silent default)

**Требование:** [FR-7](FR.md#fr-7)

**Rationale:** IDE wiki-link navigation (Ctrl+Click on `[[FR-001]]` in VS Code) is critical for human-readable spec workflow. Opt-in postInstall introduces friction — users skip and lose IDE features without realizing. Silent bundle = "just works" out of the box. Binary size +15MB is acceptable trade-off for adoption.

**Trade-off:** +15MB to dev-pomogator install footprint per platform. Slightly slower `npm install` (single binary download). Network dependency at install time (mitigated: fallback to custom JS MD LSP if download fails).

**Alternatives considered:**
- Opt-in postInstall (`dev-pomogator install-marksman`) (rejected) — user friction, most won't run it, IDE features silently absent.
- Custom JS MD LSP only (no Marksman) (rejected) — incomplete feature set (no broken-link diagnostics, no rename refactoring); reimplementing Marksman from scratch is 6-12 months of work.
- VS Code extension instead of LSP (rejected) — VS Code-specific, breaks Neovim/Helix/Sublime users; LSP is editor-agnostic standard.

### Decision: Phase 6 added — architecture-research-workflow skill (meta-deliverable)

**Требование:** [FR-12](FR.md#fr-12)

**Rationale:** This v4 spec itself took 30+ turns of manual user pushback to reach quality (session 2026-05-17). The pattern (pain validation → research → variants → decision Q&A → phases) is reusable for future major features (v5, v6). Encoding it as a skill means future arch features take 5-8 turns instead of 30+. The skill calls existing `research-workflow` as a primitive for individual research bursts, adding meta-stages (variants, decisions, phases) on top.

**Trade-off:** Skill creep risk — 7 stages may be overkill for medium features. Mitigated via complexity heuristic in `create-spec` (auto-invoke only on "архитектур"/"v\d+"/"rebuild" keywords or ≥3 components detected).

**Alternatives considered:**
- Extend existing `research-workflow` skill (rejected) — mixes "find facts" with "design architecture" mental models, bloats skill to 800+ строк, breaks current `create-spec` integration.
- Single combined skill (rejected) — same bloating concern; loss of modularity (research-workflow can be invoked standalone for simple lookups).
- Manual pattern per major feature (status quo, rejected) — proven 30+ turn cost per feature, doesn't scale; the pattern IS the deliverable.

### Decision: Marksman LSP bridge — hand-rolled JSON-RPC framing, handshake-first, captured-real

**Требование:** [FR-7](FR.md#fr-7)

> **SUPERSEDED (2026-06-04) by FR-7 «native Claude Code LSP plugin».** The custom bridge (`marksman-lsp/bridge.ts`), `md_references` MCP tool, `skip-policy`, managed-hashes and the js-fallback are RETIRED: Claude Code has native LSP support, so Marksman is registered via the plugin's `.lsp.json`/`marketplace.json` `lspServers` (auto-installed binary, no fallback), and the graph keeps only spec-domain traceability. The framing/capture work below is kept for historical context only.

**Rationale:** FR-7 declares Marksman the primary md-navigation surface but it was downloaded-and-never-run (`resolveLspMode` had zero runtime consumers). The bridge (`tools/marksman-lsp/bridge.ts`) spawns `marksman server` and speaks LSP over stdio. Framing is **hand-rolled** (`Content-Length: N\r\n\r\n<utf8-json>`, byte-level incremental reader) rather than pulling `vscode-jsonrpc`: keeps the repo's zero-runtime-dep posture (consistent with the in-memory-storage decision above), and the reader was **verified against the real Marksman 2026-02-08 binary** during a capture spike before any production code — its full `initialize` capabilities response is preserved as the test fixture `tools/marksman-lsp/__tests__/fixtures/initialize-result.json`. `definition`/`references` (FR-7b) were built from a real captured wiki-link round-trip (fixtures `definition-result.json` = single `Location`, `references-result.json` = `Location[]`). **Critical wire fact, learned by capture not assumption:** Marksman emits `<Folder> Workspace folder is bogus` and returns empty refs UNLESS the client (a) declares `capabilities.workspace.workspaceFolders: true` in `initialize` AND (b) the workspace has a project-root marker (`.marksman.toml` or `.git`). This reproduces on BOTH Linux and Windows — it is NOT a platform quirk (an earlier note wrongly blamed Windows drive-letter casing). The bridge therefore always declares the workspace capability; the e2e workspace ships a `.marksman.toml`. The real-binary round-trip against the bridge runs in the Docker e2e (P3), where the pinned Linux Marksman is present.

**Trade-off:** Hand-rolled framing must handle the messy cases the library would handle for free — split frames across `data` events, multiple frames per chunk, and UTF-8 byte-vs-char length. Covered by a unit mock that deliberately emits a split + concatenated + multibyte stream; cost is ~40 lines of reader + that test discipline. Re-capturing on a Marksman version bump is a manual step.

**Alternatives considered:**
- `vscode-jsonrpc` library (rejected for now) — correct framing for free, but adds a runtime dependency to a repo that deliberately ships none, and the messy-chunk cases are cheap to cover + already proven against the real binary. Reconsider if we grow beyond handshake+definition+references.
- Spec-derived mock without real capture (rejected) — would encode assumptions about Marksman's wire behaviour and go green in P1 while the real binary surprises us in P3 (the `verify-against-real-artifact` failure class); capture-first eliminates it.
- Full LSP client (hover/completion/diagnostics/documentSymbol) (rejected/out-of-scope) — only the methods actually surfaced via MCP (`initialize`+`definition`+`references`) are built; the rest is a separate task.

### Decision: Two-tier cross-spec reconcile — mechanical light mode + opt-in LLM full mode

**Требование:** [FR-17](FR.md#fr-17)

**Rationale:** Cross-spec drift splits into two detectable layers. Most classes (missing files/symbols, duplicate FR ids, enum/schema/URL/flag divergence, orphans) are purely MECHANICAL — exact/structural comparison over a per-spec index, fast (<5s), no model call, CI-safe. But two same-id FRs can share 60% of their tokens and still describe genuinely different behaviour — only an LLM can judge that. So the engine ships LIGHT mode (mechanical only, the default, `reconcile.ts`) and `full-mode.ts` adds an OPT-IN semantic pass that escalates ONLY the gray same-id pairs to the judge. Light is always-on + cheap; full is paid only when asked, and reuses the FR-8 judge transport (Meridian, fail-open) rather than a second judge.

**Trade-off:** Two code paths to keep aligned (mechanical + semantic findings merged into one report) and full mode's semantic accuracy depends on Meridian being up — mitigated by fail-open (proxy down → semantic pass skipped, mechanical findings still ship).

**Alternatives considered:**
- LLM-for-everything (rejected) — slow, costly, non-deterministic for classes a regex nails exactly (missing file, duplicate id); wastes tokens on the ~90% mechanical cases.
- Mechanical-only, no semantic layer (rejected) — misses the highest-value class (two same-id FRs that look similar but contradict), which is the whole reason the FR-8 judge exists.
- A separate semantic-only tool (rejected) — duplicates the per-spec index build + the report writer; one engine with a light/full toggle reuses both.

### Decision: Resolve findings via an interactive explain-before-edit loop, never auto-fix

**Требование:** [FR-18](FR.md#fr-18)

**Rationale:** A finding's fix usually carries a real trade-off (update the spec vs the code vs defer; edit a foreign spec or not). Auto-applying a "suggested fix" would silently pick a side and risk cross-spec contamination. So `cross-spec-resolve` is an INTERACTIVE 7-step loop: per finding it emits a 5-field explanation (code/severity/class, files+lines, plain-language, WHY-if-shipped, options) and asks via AskUserQuestion BEFORE any edit. CRITICAL findings block (header ⚠️ CRIT) with an audited override path; foreign-spec edits get a second confirm; after the batch it re-runs reconcile to stamp the real outcome (resolved/still_present/transformed). Spec writes go through the mutation door; only implementation code (outside `.specs/`) uses an ordinary Edit.

**Trade-off:** Interactive = not headless/batchable — a human must walk each finding. Slower than auto-fix, but the cost of a wrong silent fix (especially a cross-spec one) is higher than the walk-through time.

**Alternatives considered:**
- Auto-apply `suggested_fix` for all findings (rejected) — silently picks a side on genuine trade-offs (decision-vs-reality, foreign-spec edits) and risks contaminating another spec; the explain-before-edit block exists precisely to surface that trade-off.
- Print findings only, no resolve loop (rejected) — leaves the user to fix by hand with no guided options or audit trail; the resolve half of the feature would be missing.
- Block-only on CRITICAL, auto-fix the rest (rejected) — WARNING/INFO findings still have trade-offs (which doc to edit); a uniform explain-before-edit is simpler and safer than a severity-split fix policy.

### Decision: Scaffold-completeness gate — reuse the existing classifier, phase-gate the severity, exact-sentinel for the RED tier

**Требование:** [FR-57](FR.md#fr-57)

**Rationale:** Placeholder detection already exists twice but toothless — `validate-spec` emits a broad `PLACEHOLDER` WARNING that is pre-filter (never gates the smart verdict, per `no-structural-valid`), and `audit-spec` catches only `FIXTURES.md` under `TEST_DATA_ACTIVE` (WARNING, 2 hardcoded sentinels). The reusable smart classifier `countSpecStatusPlaceholders` (`specs-generator-core.mjs:515`) already strips fenced+inline code and drops lowercase-single-token/JSON braces; `listPlaceholders` (:413) already yields line numbers. So the fix promotes this existing logic into ONE classifier feeding BOTH validate and a NEW verdict-gating `audit-spec` category — not a third detector. Severity is phase-gated: ERROR only when the spec claims verified-completion (lifecycle GREEN from a full run OR Finalization `stop_confirmed`), INFO otherwise — preserving the deliberately-fixed «scaffold GREEN at birth» invariant (a fresh scaffold is all placeholders by design and must not go RED). This dimension is ORTHOGONAL to traceability: `forbid-root-artifacts` was GREEN with `UNCOVERED_FR`/`TASK_UNTESTED`/`UNTAGGED_SCENARIO` all 0 while its prose stayed stub.

**Trade-off:** A verdict-gating ERROR means a false positive blocks a legitimate spec, so the RED tier uses EXACT template sentinels (precise by construction) rather than the broad heuristic — the heuristic false-positives on camelCase tokens (`{installCommand}`, proven by a real classifier run this session). Cost: the sentinel set must track template edits, mitigated by a drift regression test asserting sentinels ⊇ current template placeholders.

**Alternatives considered:**
- Broad heuristic (`countSpecStatusPlaceholders`) as the RED gate (rejected) — false-positives on camelCase instructional tokens; blocking a legit spec is worse than a missed WARNING. Kept for the WARNING tier only.
- Promote validate's `PLACEHOLDER` WARNING to ERROR in place (rejected) — validate-spec is pre-filter by design, not the health verdict, and it lacks phase-gating so it would RED every fresh scaffold (re-breaking the templates-fix invariant).
- New TDD-ordering enforcement (rejected / out of scope) — «Red test written before the code» is not statically provable; only the FR→task→scenario chain existence is enforced (already held by the FR-37b invariants), which FR-57 dogfoods rather than duplicates.



### Decision: Separate task completion from delivery completion

**Требование:** [FR-66](FR.md#fr-66)

**Rationale:** Existing `FrCensusVerdict` truthfully answers whether tasks are done and scenarios pass. A neighboring delivery dimension adds required artifacts without changing the meaning of an established public enum.

**Trade-off:** Consumers must inspect `taskVerdict`, `delivery.overall`, and smart overall rather than one overloaded status.

**Alternatives considered:**
- Downgrade IMPLEMENTED to DONE_UNTESTED when documentation is missing — rejected because documentation debt is not test debt.
- Add new values to FrCensusVerdict — rejected because it mixes independent dimensions and breaks exhaustive consumers.

### Decision: Closed demand registry with open metadata extensions

**Требование:** [FR-66](FR.md#fr-66)

**Rationale:** Unknown descriptive metadata can round-trip safely, but unknown demand types cannot participate in completion policy without defined evidence semantics.

**Trade-off:** New demand kinds require an explicit registry/version change instead of silently appearing through extensions.

**Alternatives considered:**
- Preserve unknown demand kinds in `_unknown` — rejected because they could be silently ignored by the ALL gate.
- Allow arbitrary string demands — rejected because parser, query and verdict would disagree on evidence resolution.

### Decision: One validator for parse, authoring and migration

**Требование:** [FR-66](FR.md#fr-66)

**Rationale:** Markdown parsing, MCP mutation and schema migration must accept and reject identical shapes to prevent write-time success followed by read-time RED.

**Trade-off:** The metadata module owns rendering and migration concerns in addition to validation.

**Alternatives considered:**
- Validate only after rebuilding the graph — rejected because invalid source would already be written.
- Duplicate schemas in MCP and parser layers — rejected because enum and rationale rules would drift.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js (`@cucumber/cucumber`) for dev-pomogator self-test; Reqnroll for C# target projects; behave for Python target projects (Phase 3+)
**Install Command:** `npm install --save-dev @cucumber/cucumber @cucumber/messages @cucumber/gherkin @cucumber/gherkin-utils` (Phase 0 bootstrap)
**Evidence:** RESEARCH.md Appendix J BDD framework detection table; bdd-framework-detector output (csharp/Reqnroll detected in fixture); current vitest pseudo-BDD requires Phase 0 migration
**Verdict:** Phase 0 bootstrap block in TASKS.md MUST install cucumber-js + create `tests/step_definitions/` + `cucumber.json` config + Before/AfterScenario hooks for test isolation + per-spec NDJSON output configuration. Fixture copy from existing `.specs/personal-pomogator/` + `.specs/codex-cli-support/` (two real v3-format specs in this repo) + a synthesized minimal v3-format sample for self-test. (The former `.specs/spec-generator-v3/` was consolidated into this v4 spec on 2026-05-28; v3 BDD scenarios live in `.specs/spec-generator-v4/legacy-v3.feature`.)

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `extensions/specs-workflow/tools/specs-generator/user-story-form-guard.ts` | PreToolUse | Write\|Edit USER_STORIES.md | Validates v3 form fields | Yes — pattern direct copy for spec-conformance-guard |
| `extensions/specs-workflow/tools/specs-generator/task-form-guard.ts` | PreToolUse | Write\|Edit TASKS.md | Done When/Status/Est fields | Yes — pattern reuse for new guards |
| `extensions/specs-workflow/tools/specs-generator/design-decision-guard.ts` | PreToolUse | Write\|Edit DESIGN.md | Key Decisions Rationale/Trade-off/Alternatives | Yes — direct reuse, no changes |
| `extensions/specs-workflow/tools/specs-generator/requirements-chk-guard.ts` | PreToolUse | Write\|Edit REQUIREMENTS.md | CHK matrix format | Yes — direct reuse |
| `extensions/specs-workflow/tools/specs-generator/risk-assessment-guard.ts` | PreToolUse | Write\|Edit RESEARCH.md | Risk Assessment ≥2 rows | Yes — direct reuse |
| `extensions/specs-workflow/tools/specs-generator/extension-json-meta-guard.ts` | PreToolUse | Write\|Edit extension.json | Protects manifest from tampering | Yes — extend pattern for meta-guard on new components |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `extensions/specs-workflow/tools/spec-conformance-guard/spec-conformance-guard.ts` | PreToolUse | Write\|Edit `.specs/**/*.md`, `**/*.feature` | HARD invariants: DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN | user-story-form-guard pattern |
| `extensions/specs-workflow/tools/spec-conformance-push/spec-conformance-push.ts` | PostToolUse | Write\|Edit `.specs/**/*.md`, `**/*.feature` | Incremental reindex + conformance_check + 3s throttle + push findings | new pattern; uses MCP IPC |
| `extensions/specs-workflow/tools/bash-post-test-ingest/bash-post-test-ingest.ts` | PostToolUse | Bash `dotnet test\|npm test\|npm run test:bdd` | Detect test run completion, invoke MCP ingest-ndjson + split per spec | new pattern; pattern after `tui-test-runner` post-hook |

### Cleanup Strategy

В test fixture для self-test (v4 development): чистые копии `.specs/personal-pomogator/` + `.specs/codex-cli-support/` (два реальных v3-format спека в этом репо) + синтезированный минимальный v3-format sample живут в `tests/fixtures/v4-self-test/`. (Бывшая папка `.specs/spec-generator-v3/` сконсолидирована в этот v4-spec 2026-05-28; v3 BDD-сценарии в `.specs/spec-generator-v4/legacy-v3.feature`.) Каждый BDD scenario: Before — copy fixture to temp dir, set CWD; After — cleanup temp dir + reset MCP server state via `clear_index` admin tool.

Cleanup порядок для production (target projects):
1. После теста: in-memory graph НЕ persists (по definition Phase 2)
2. SQLite (Phase 4): тестовая база `tests/.spec-index.test.sqlite`, удаляется after suite
3. NDJSON test fixtures в `tests/fixtures/ndjson/` — read-only, no cleanup
4. Temp files (graph rebuild artifacts): автоудаление через `os.tmpdir()` lifecycle

### Test Data & Fixtures

См. [FIXTURES.md](FIXTURES.md) для полного перечня. Ключевые fixtures:

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `v4-self-test/.specs/` | `tests/fixtures/v4-self-test/.specs/` | Copy of 3 real specs for parser regression | shared (read-only) |
| `v4-self-test/.feature` | `tests/fixtures/v4-self-test/features/` | Real .feature files for Gherkin parser | shared |
| `cucumber-messages-sample.ndjson` | `tests/fixtures/ndjson/sample.ndjson` | Pre-recorded canonical NDJSON for ingester unit-tests | shared |
| `corrupt-frontmatter.md` | `tests/fixtures/error-cases/corrupt-frontmatter.md` | Trigger MALFORMED_FRONTMATTER finding | per-scenario |
| `duplicate-fr.md` | `tests/fixtures/error-cases/duplicate-fr.md` | Trigger DUPLICATE_DEFINITION finding | per-scenario |
| `orphan-tagged.feature` | `tests/fixtures/error-cases/orphan-tagged.feature` | `@FR-999` Scenario for SCENARIO_TAG_ORPHAN | per-scenario |
| `large-spec/` | `tests/fixtures/large-spec/` | Synthetic 30 specs, 300 MDs, для NFR-Performance benchmarks | shared (read-only) |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `currentSpecGraph` | `SpecGraph` | `BeforeScenario` (build from fixture) | Steps (`get_trace`, `conformance_check`) | Shared graph state for each scenario |
| `mcpProcess` | `ChildProcess` | `BeforeFeature` (spawn MCP server subprocess) | Steps (send JSON-RPC requests) | MCP server subprocess for integration tests |
| `lastFindings` | `Finding[]` | `When conformance_check ran` step | `Then findings should include` step | Carry findings between Given/When/Then |
| `pushedReminders` | `string[]` | PostToolUse hook simulation | `Then agent context should contain` step | Capture push notifications |
| `lockFileState` | `LockFileContent` | `Given MCP server in env X` step | `Then second start denies with reason` step | Multi-env conflict scenarios |

---

## Cross-spec reconciliation architecture (Phase 7)

This section describes the design for FR-17 (`cross-spec-reconcile`) and FR-18 (`cross-spec-resolve`). Implementation is scheduled as Phase 7 of TASKS.md. The 28 finding codes, YAML schema, and SARIF mapping live in `spec-generator-v4_SCHEMA.md`.

### (a) Skill flow diagram

```
create-spec workflow
   ├── Phase 2 step 4d  ──┐
   ├── Phase 3 step 1c  ──┼──>  Skill("cross-spec-reconcile", mode: "light")
   └── Phase 3+ Audit ────┘                  │
                                             ▼
                            ┌─────────────────────────────┐
                            │  build-graph.ts             │  parse .specs/*/*.md + .feature
                            │  └ per-spec concept index   │  (FR titles, paths, symbols, identifiers)
                            ├─────────────────────────────┤
                            │  check-cross-spec.ts        │  Jaccard, exact-match, levenshtein
                            │  check-impl-drift.ts        │  fs.exists, grep, extension.json parse
                            │  code-shape-index.ts        │  exports, ports, MCP tools, hooks
                            ├─────────────────────────────┤
                            │  semantic-judge.ts          │  pre-filter (concept overlap ≥3 nouns)
                            │  └ Agent subagent dispatch  │  cached by sha256(spec_a+spec_b content)
                            ├─────────────────────────────┤
                            │  write-yaml-report.ts       │  atomic temp+rename, merge preserve
                            │  write-sarif-report.ts      │  SARIF 2.1.0 (opt-in via --sarif)
                            ├─────────────────────────────┤
                            │  CRITICAL prompt step       │  AskUserQuestion header "⚠️ CRIT"
                            └─────────────────────────────┘
                                             │
                                             ▼
                            .specs/{slug}/consistency-report.yaml
                            .specs/{slug}/consistency-report.sarif (optional)
                            .claude/logs/cross-spec-overrides.jsonl (on override)

/cross-spec-resolve  ──>  load YAML → group → explain → AskUserQuestion confirm → Edit/Write
                                                                              │
                                                                              ▼
                                                            batch re-invoke reconcile mode=full
                                                            update resolution_status per finding
```

### (b) Subagent isolation (R-4 mitigation)

The Agent tool subagent invoked by `semantic-judge.ts` runs in an isolated context — it CANNOT call `AskUserQuestion` to reach the outer user. The subagent returns structured JSON (`{verdict: contradiction|overlap|complementary, confidence: 0..1, snippets: [...]}`) ONLY. All AskUserQuestion orchestration — CRITICAL blocking prompts, per-finding confirms, Path A/B/C alternatives, foreign-spec banners — happens in the OUTER skill (`cross-spec-reconcile` or `cross-spec-resolve`). This is a hard invariant; subagent prompt template `references/semantic-judge-prompt.md` instructs the subagent NOT to attempt interactive prompts and to return findings as data only.

### (c) ARCHITECTURAL_DECISION_VS_REALITY detection algorithm

The novel finding class `impl-drift/architectural-decision-vs-reality` requires comparing prose architectural claims in DESIGN.md against actual code shape. The algorithm has two stages:

1. **Code-shape pre-indexing** (`code-shape-index.ts`) — glob `src/**/*.{ts,py,go}` + `extensions/**/*.{ts,json}`. For each file extract:
   - Exports: regex `export\s+(?:async\s+)?(?:function|class|const|type)\s+(\w+)` → list of exported symbols
   - Module boundaries: top-level directory under `src/` or `extensions/` → module name
   - Declared HTTP ports: grep `\.listen\(\s*(\d+)`, `port\s*[:=]\s*(\d+)`
   - MCP tools registered: grep `server\.tool\(\s*['"]([\w_-]+)['"]`
   - Hooks registered: parse `extensions/*/extension.json` `hooks` blocks → list of `{event, matcher, command}`
   
   Output: in-memory `CodeShape` object passed to subagent.

2. **LLM semantic compare** — for each spec's `DESIGN.md` extract architectural-claim phrases (regex on stock phrases: «inline TS service», «separate agent on port N», «PreToolUse hook», «MCP tool X exposed», «module path Y owns Z»). Send `{spec_claim, code_shape}` to Agent subagent with `references/semantic-judge-prompt.md` prompt; subagent returns `{verdict: "contradiction"|"matches"|"unclear", path_alternatives: [{label, pros, cons, impacted_files}, ...]}`. Outer skill packs this into the YAML finding with `class: orphaned` (claim has no code) or `class: covered` (claim matches code) per OpenFastTrace 4-class mapping.

The `path_alternatives` array (when subagent emits one) drives the Path A/B/C AskUserQuestion in `cross-spec-resolve`.

### (d) YAML schema overview

See `spec-generator-v4_SCHEMA.md` section «Consistency Report YAML» for full schema. Top-level fields: `version`, `generated_at`, `spec_slug`, `mode`, `dry_run`, `partial`, `scope`, `summary` (dashboard with `by_severity` + `by_class` + `by_namespace` + `totals`), `findings[]`, `recommendations[]`, `acknowledged[]`.

### (e) CRITICAL prompt rendering caveat

The blocking AskUserQuestion uses `header: "⚠️ CRIT"` (≤12 chars). Actual color rendering (red/yellow/default) depends on the Claude Code client (terminal ANSI, web CSS, IDE plugin theme). System guarantees only the ⚠️ glyph + CAPS string telegraphs severity — there is NO guarantee of red color. Per AskUserQuestion tool schema, `header` is rendered as a chip/tag; longer text goes in the `question` field. Question text uses literal phrase «⚠️ CRITICAL CROSS-SPEC CONFLICTS — RESOLVE BEFORE PROCEED» in CAPS for visual reinforcement.

### (f) Lightweight CRITICAL subset

`light` mode (Phase 2 step 4d, Phase 3 step 1c) only fires CRITICAL severity for a curated hard-conflict subset of 3 finding codes:

- `cross-spec/runtime-identifier-drift` — guaranteed runtime breakage if shipped (e.g. self-improve filter scope drift)
- `cross-spec/module-ownership-conflict` — guaranteed merge conflict
- `cross-spec/contradictory-fr` — semantically incompatible direct contradiction

All other 25 finding codes in light mode default to WARNING severity. `full` mode (Phase 3+ Audit) uses the full severity matrix from `references/finding-codes.md`. This avoids spurious STOP-blocks during early authoring while ensuring the worst classes still gate.

### (g) Partial reconciliation behavior

If the Agent subagent fails on some pairs (timeout, error, rate-limit) but succeeds on others, the YAML report writes `partial: true` flag and a `warnings[]` entry listing the failed pairs. The report is NOT considered an error — it is a partial result that the user can act on for the resolved pairs while a follow-up run retries the failed ones. The mechanical checks (file existence, terminology Jaccard, etc.) always succeed independently of subagent state and contribute findings regardless.

### (h) Finding code naming convention (Spectral)

All 28 finding codes follow Spectral convention `namespace/kebab-case-rule`:

- `cross-spec/*` — 15 codes for cross-spec conflicts (runtime-identifier-drift, terminology-drift, fr-overlap, module-ownership-conflict, contradictory-fr, nfr-conflict, duty-delegation-ambiguity, integration-contract-drift, schema-drift, naming-convention-drift, priority-inversion, skill-trigger-collision, cascading-interaction, stale-spec-outstanding-but-done, stale-spec-roadmap-drift)
- `impl-drift/*` — 13 codes for spec-vs-implementation drift (missing-file, missing-symbol, output-not-exposed, data-shape-incompatible, stale-reference, mcp-tool-drift, hook-registration-drift, scenario-no-step-def, test-missing, type-drift, architectural-decision-vs-reality, duplicate-infrastructure, cold-start-ux-gap)

Project `.spec-config.json` may include `disabled_rules[]: string[]` listing namespace-prefixed codes to suppress. This mirrors Spectral's selective-disable ergonomic and prevents rule sprawl when teams disagree on a specific check.

### (i) OpenFastTrace 4-class summary grouping

Each finding's `class` field maps to one of four classes (OpenFastTrace inspired): `covered` (spec claim matches code), `uncovered` (spec claim has no code counterpart), `orphaned` (code has no spec claim describing it), `outdated` (spec claim describes obsolete code). The YAML `summary.by_class` block aggregates counts per class for the dashboard view. This 4-class layer sits ABOVE the 28 fine-grained codes and gives reviewers a quick covered/uncovered status without reading every finding.

### (j) Concurrency semantics (resolve vs reconcile)

`cross-spec-resolve` skill reads `.specs/{slug}/consistency-report.yaml` once at step 1 of its execution (see FR-18) and operates on that snapshot for the rest of the session. `cross-spec-reconcile` writes YAML atomically (temp file + rename per NFR-Reliability-7), so a concurrent reconcile run cannot produce a partially-written file readable by resolve mid-update — readers always see a complete prior version OR a complete new version.

**Race scenarios + behavior:**

- **Reconcile starts after resolve has already loaded YAML in memory** — Resolve continues processing the snapshot it loaded. After batch completion, resolve invokes `Skill("cross-spec-reconcile", mode: "full")` in step 7, overwriting whatever the concurrent run produced. Last writer wins. User-visible effect: resolve fixes get attributed to the slug they were invoked under; concurrent reconcile run's results are discarded by step 7.
- **Reconcile starts while resolve is mid-batch (after some Edits applied)** — Concurrent reconcile observes the in-progress code/spec state and may emit findings that reflect partial fix application. Its YAML output is then clobbered by resolve's step 7 batch re-check.
- **Two resolves concurrently on different slugs** — Each operates on its own `.specs/{slug}/consistency-report.yaml`; no shared mutable state in the YAML files themselves. Foreign-spec edits (FR-18 step 6) on the SAME other-slug could collide — both resolves edit the same foreign README/CHANGELOG. Mitigation: foreign-spec confirmation prompt makes the user aware; git merge will catch true conflicts on commit.

**Explicit guidance** (documented in skill SKILL.md once implemented): «Не запускай `/cross-spec-resolve` пока активен create-spec Phase 2/3 reconcile (lightweight). Подожди завершения lightweight reconcile, потом запускай resolve». In CI/automation contexts where this guarantee is hard to enforce, the atomic-write semantics provide eventual consistency — last writer wins, no corruption.

A future enhancement (out of scope for v0.2.0) could introduce a `.specs/{slug}/consistency-report.lock` file using the same `flag: 'wx'` pattern as MCP server lock per `atomic-update-lock.md` — but v0.2.0 deliberately keeps it lockless to avoid stale-lock recovery complexity.

### (k) Prior art adoption rationale

Design borrows the following patterns from prior art (see RESEARCH.md «Prior art» subsection for full survey):

- **SARIF 2.1.0 secondary output** (Spectral precedent) — opt-in via `--sarif` flag; 1:1 rule-id mapping to finding codes enables GitHub Code Scanning + IDE integration without bespoke schema work.
- **`--dry-run` mode** (mex precedent) — prints summary + first 10 findings to stdout, skips file writes; lets author preview impact before committing YAML/SARIF artifacts.
- **Coverage Summary Table dashboard** (GitHub spec-kit `/speckit.analyze` precedent) — `summary` block at YAML top with `by_severity` / `by_class` / `by_namespace` / `totals` keys; users see a snapshot without scrolling the findings list.
- **Append-only JSONL audit log** (existing dev-pomogator `scope-gate/escape-hatch-audit.md` precedent) — `.claude/logs/cross-spec-overrides.jsonl` for CRITICAL acknowledge-and-override choices; cross-spec mirrors the same JSON shape and audit workflow.
- **Two-skill separation** (shinpr/claude-code-workflows precedent) — `cross-spec-reconcile` (detection) and `cross-spec-resolve` (fix loop) are separate skills with a shared YAML contract. The novel addition vs shinpr is the schema-driven contract itself; shinpr emits prose, we emit structured findings.

Avoided patterns (also see RESEARCH.md): ESLint `--fix` style semantic-breaking auto-apply (we always explain-then-confirm); Dependabot per-finding-PR fatigue (we batch findings per spec slug in a single YAML); mex single-shot AI fix without alternatives (we present Path A/B/C); OpenFastTrace `// [impl->REQ-N]` code-annotation requirement (we parse prose claims directly).

The `verify-divergent-contracts.md` rule (test-vs-eval-vs-spec divergence pattern in dev-pomogator) describes the exact class of failure this reconcile feature is designed to detect across the cross-spec axis. See RESEARCH.md «Related sprint work» for the post-render-eval ↔ closed-loop-hardening ↔ pipeline/agent.ts case study that motivated the work.

### (l) Hook failure-mode tiers (FR-19)

v4 PreToolUse hooks split into **two operational tiers** with distinct failure semantics. Single-tier «all fail-open» was explicitly rejected because it creates a bypass: an attacker crafts a `.md` whose content reliably crashes the hard guard's parser and thereafter Writes are unprotected on every file.

| Tier | Members | Startup/config crash | Per-file content-parse crash | Log path |
|------|---------|----------------------|------------------------------|----------|
| **Soft** | `user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`, `extension-json-meta-guard` (FR-24) | exit 0, log entry (fail-open) — same as per-file | exit 0, log entry (fail-open). Pattern preserved verbatim from v3 FR-10. | `~/.dev-pomogator/logs/form-guards.log` |
| **Hard** | `spec-conformance-guard` (FR-5) | **exit 1** + stderr (fail-CLOSED — broken install must surface; user's Write blocked until repair) | exit 0, log entry (fail-open — one confused file does not DoS authoring) | `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (FR-15) |

**Cross-phase dependency note**: FR-15 JSONL writer ships in Phase 4 per current TASKS.md ordering. Hard tier ships with FR-5 in Phase 2. Resolution options:

1. **Lift FR-15 writer to Phase 2** (recommended): the JSONL writer is small (append-only, atomic-via-write, daily rotation) and decoupling it from FR-15's CLI consumer is trivial.
2. **Fallback path** until Phase 4: hard tier per-file events write to `~/.dev-pomogator/logs/form-guards.log` with `kind: "hard_tier_file_parse"` discriminator; FR-15 CLI consumes both files in Phase 4.

The patch (FR-19 introducing this tiering) is agnostic between options; Phase 2 implementer chooses based on dependency-graph cost.

### (m) Log file inventory (FR-23)

v4 ships with **two distinct log files**, intentionally NOT unified. Each has its own schema, retention, and consumer. Form-guard decisions (DENY/ALLOW_AFTER_MIGRATION/PARSER_CRASH) and conformance findings (DUPLICATE_DEFINITION/UNCOVERED_FR/SCENARIO_TAG_ORPHAN) are different event taxonomies with different downstream tooling — unification would create incompatibility for v3 consumers without a clear gain.

| Path | Origin | Writer | Schema | Retention / rotation | Consumer |
|------|--------|--------|--------|----------------------|----------|
| `~/.dev-pomogator/logs/form-guards.log` | v3, kept | soft-tier hooks (FR-19); fallback for hard-tier file-parse (during Phase 2-3 if Option 2 chosen) | text line: `{ISO ts} {hook_id} {decision} {target_path} {message}` | 30 days OR 10MB cap, whichever hits first; rotation handled by `validate-specs.ts` (v3 pattern) | `renderFormGuardsSummary()` (FR-20 threshold check + on-demand `/spec-status` skill) |
| `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` | v4, new (FR-15) | hard-tier `spec-conformance-guard`, PostToolUse push (FR-6) | JSONL: `{timestamp, finding_code, severity, location: {path,line,col}, message, spec_slug}` | rotate at 10MB → `-<N>.jsonl` suffix (FR-15) | `dev-pomogator spec-check-log` CLI (FR-15) + FR-20 summary reader + analytics tooling |

Schema migration / unification tooling is OUT OF SCOPE for v4. v5+ may consolidate.

### (n) Conformance summary surfacing options (FR-20)

Four candidate UXes were considered for replacing v3's «every prompt prints 24h aggregate». Recommended combo: **B3 + B4**.

| Option | UX | Pros | Cons | Verdict |
|--------|----|------|------|---------|
| **B1** | Render 24h aggregate at every UserPromptSubmit (v3 verbatim) | familiar to v3 users | per-prompt latency (file-scan cost on every prompt); noise even when nothing changed | **rejected** — regression on latency-conscious users |
| **B2** | Deprecate summary entirely; require user to invoke a CLI for status | clean v4 architecture (no UserPromptSubmit hook) | silent UX regression — users miss alerts that v3 surfaced inline | **rejected** — regression on alerting |
| **B3** | Threshold-only: render summary at UserPromptSubmit ONLY when unresolved DENY events ≥1 since last acknowledgment | zero-noise default; alerts only when there's signal; preserves prompt-time visibility | requires state tracker (`~/.dev-pomogator/state/last-summary-ack.json`); ack semantics need definition | **recommended** (combined with B4) |
| **B4** | On-demand pull via `/spec-status` skill + tiny statusline indicator | always available; explicit user action; no hook overhead for «I want full picture» | doesn't alert if user never asks | **recommended** (combined with B3) |

Combined B3+B4 satisfies both regression cases: threshold-only B3 catches «something needs attention» surface; on-demand B4 provides «show me everything» when author wants the full picture.

State file `last-summary-ack.json` schema: `{ack_timestamp: ISO8601, ack_event_count: int, ack_session_id: uuid}`. Ack is triggered explicitly by user invoking `/spec-status` OR by clicking on the rendered B3 line (future Claude Code UX); never implicit. The state file is per-machine (`~/`), not per-repo.

### (o) Inherited design decisions from v3 (consolidated 2026-05-28)

The four design decisions below shipped in spec-generator-v3 (production via PR #14) and are PRESERVED VERBATIM by v4. Cross-references: FR-19 (soft tier preserves v3 fail-open + hook chain), FR-22 (version gate mirrors v3 migration guard), FR-24 (meta-guard extension preserves v3 protection scope), FR-25 (additive merge preserves v3 hook registrations). These decisions are reproduced here so that v3's spec folder can be deleted without losing the institutional rationale.

**Decision: anti-pushy description pattern for hidden child skills.** Rationale: Claude Code has no native `internal: true` frontmatter; the proven workaround is description-without-trigger-phrases (no «when the user», no «whenever»). Trade-off: no hard guarantee against edge-case auto-trigger; SPECGEN003_24 negative test (now `tests/e2e/spec-generator-v3.test.ts`) checks against real-world prompts. Alternatives rejected: `internal: true` frontmatter (doesn't exist; upstream patch out of scope); `plugin-dev/` subdirectory placement (cosmetic, doesn't change auto-trigger); monolith skill (bloats description, breaks anti-pushy principle).

**Decision: meta-guard protects `extension.json` AND `.claude/settings.local.json` (extended by v4 FR-24 to cover `plugin.json` MCP-tool registrations).** Rationale: agents kept finding env-var bypass (`SPEC_FORM_GUARDS_DISABLE`) and forgetting to remove it. Env-var bypass was DELETED in v3 and the meta-guard now denies removal of any form-guard entry from the manifest. Trade-off: legitimate manifest changes (rename, consolidate extensions) require human editing outside Claude Code. Alternatives rejected: keep env-var bypass (trivially circumvented); read-only filesystem flag on `extension.json` (blocks install-time updates); cryptographic signature on manifest (over-engineering; no key-management infra).

**Decision: migration guard via `.progress.json::version >= 3` (extended by v4 FR-22 to gate on `version >= 4`).** Rationale: 30+ existing v1/v2 specs are not ready for the new form enforcement; need migration isolation without a forced dev-company upgrade. `scaffold-spec.ts` stamps `version: 3` for new specs; hooks check the version immediately after the matcher filter. Trade-off: existing specs stay v1/v2 forever (or until manual migration); enforcement cannot be applied retroactively. Alternatives rejected: WARNING-only period followed by ERROR-switch (agents ignore warnings — 1.5-year track record per `validate-specs.ts`); bulk migration of all existing specs (days of manual work + risk of breaking completed specs); opt-in via explicit env var (`.progress.version` is the natural version marker; no new config files).

**Decision: 3 skills split by Phase, not 7 atomic or 1 monolith.** Rationale: each skill = one mental unit + one workflow Phase. Aligns with STOP gates in the spec workflow. Claude switches between skills once per Phase. Trade-off: Risk Assessment + User Stories are bundled in `discovery-forms` (Phase 1) — not pure single-responsibility. CHK matrix + Key Decisions are bundled in `requirements-chk-matrix` — same compromise. Alternatives rejected: 7 atomic skills, 1 per artifact (Skill-invocation overhead; parent makes 7 calls in series); 1 monolith skill (bloated SKILL.md, pushy description, breaks skill-creator best practices).

## Phase 13–14: one-graph identity + authoritative verdict architecture (2026-06-05)

### Decision: node identity = composite `<slug>:<localId>`, anchors stay bare (FR-36)

**Требование:** [FR-36](FR.md#fr-36)

**Rationale:** the graph keyed nodes by the bare local id (`FR-2`), so across 47 specs the ids collide and the node Map keeps only the last writer — 46 specs define `FR-2` yet only 47 FR nodes survive (≈470 expected). Measured by the dogfood harness; every edge bug (`get_trace` empty, `covers` ×52, `AC-36` from `pomogator-doctor` leaking into v4's FR-36 trace) is a symptom. The fix keys every node by `<slug>:<localId>` where `<slug>` is derived MECHANICALLY from the `.specs/<slug>/` path (the author keeps writing `## FR-2`, no prefix to type), and **decouples the anchor alias** — anchors stay bare `#fr-2` (file-local) so Marksman / anchor-fix / existing links are untouched.

**Trade-off:** test churn — every test asserting a bare id must move to the qualified form in lockstep (this is why the suite was "green" on a broken graph: it asserted bare ids that happened to resolve). Mitigated by phasing (Phase 13, each phase suite-green) + soft bare→candidate-list fallback for agent callers.

**Alternatives considered:**
- global N+1 counter (`FR-347`) — needs a CENTRAL ALLOCATOR → merge conflict on the counter every time any spec adds an FR, lost locality, brittle renumber, and `FR-347` carries no spec context; the project ALREADY prefixes scenarios (`SPECGEN004_NN`/`PLUGIN005_NN`/`CORE024_NN`), so composite ids just finish a pattern in use.
- separator `/` instead of `:` — collides with path/anchor syntax, so `:` chosen. Full deep-dive: `audit-reports/unified-spec-graph-design.md` §9.

### Decision: spec-health verdict = smart graph analysis, structural is a pre-filter only (FR-37)

**Требование:** [FR-37](FR.md#fr-37)

**Rationale:** a structural `validate-spec: 0 errors` was reported as "spec valid" while `audit-spec` had 10 P0, `conformance_check` 1256 findings, and the corpus 32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP — a false green. v4 already owns the smart machinery (FR-8 semantic, `conformance_check`, `get_coverage` honesty, `audit-spec`) but it was opt-in / not authoritative. The verdict is therefore composed from the smart tools over the ONE graph (FR-36) + a traceability-completeness check (the cell→atom invariants), default-ON; `validate-spec` is demoted to a pre-filter whose pass is NOT emittable as "valid/clean/done".

**Trade-off:** the verdict is heavier (graph build + optional `claude -p` semantic) than a structural lint; mitigated by FR-36's bounded node count (NFR-Performance-9) and semantic being binary-present-gated with a fail-loud `SEMANTIC_SKIPPED` (never silent no-drift).

**Alternatives considered:**
- keep structural as the gate — the exact false-green that triggered this.
- make semantic opt-in — status quo, it never runs, so the dumb check wins.
- a brand-new analyzer — the smart tools exist; this FR makes them AUTHORITATIVE + adds the completeness check, no new engine. Evidence: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.

### Decision: get_spec_status — agent-facing READ of the same truth the verdict gates on (FR-38)

**Требование:** [FR-38](FR.md#fr-38)

**Rationale:** агенту нужен ОДИН вызов, чтобы понять состояние спеки целиком: написаны ли тесты, гонялись ли, чем кончился последний ран (summary), сколько дыр трассировки. До FR-38 эта картина собиралась из 3-4 вызовов (get_coverage_summary + find_by_tags + get_test_result по сценариям) и всё равно не отвечала «а ран вообще был?». Lifecycle выводится только из графа (FR-36) + инжестённого NDJSON (FR-1): SPEC_ONLY (нет сценариев) → TESTS_NOT_RUN (сценарии без lastResult) → RED (есть failed/ambiguous) → PARTIAL (0 failed, но есть undefined/pending/skipped — написано ≠ реализовано, FR-35 идиома) → GREEN (все тронутые passed).

**Trade-off:** PARTIAL объединяет undefined/pending/skipped в одно «жёлтое» состояние — гранулярность отдана в `last_run.summary` (по-классово), сам enum остаётся пятизначным и читаемым агентом без таблицы.

**Alternatives considered:**
- расширять `list_specs` per-spec статусом — раздувает каждый ответ ради редкой нужды.
- отдельный side-файл статуса — нарушает «no side files»; правда живёт в графе+NDJSON.
- вычислять в скилле spec-status — скилл оркестрирует LLM, а статус должен быть механическим и MCP-трассируемым.

### Decision: MCP-rails — агентский доступ к спекам только через MCP (FR-39/40/41)

**Требование:** [FR-39](FR.md#fr-39), [FR-40](FR.md#fr-40), [FR-41](FR.md#fr-41)

**Rationale:** Централизация через одну дверь даёт контроль + аудит-лог агентских действий и живую валидацию на записи (генератор перестаёт писать вслепую); запрет прямого grep — следствие, не цель. Граница: запрет касается TOOL-CALLS АГЕНТА; движок (39 in-process файлов: builder/парсеры/CLI/хуки/резолверы) читает и пишет диск как раньше — он бэкенд двери. FR-21 (CLI без сервера) не нарушен: FR-21 — деградация движка, FR-39 — дисциплина агента.

**Trade-off:** Каждый агентский spec-доступ теперь идёт через MCP-вызовы (чуть медленнее и многословнее, чем прямой Read); enforce-режим требует выдержанной цепочки read→write→shadow→migrate→enforce — преждевременный флип окирпичивает авторинг; фазовые headless-агенты добавляют минуты латентности на фазу.

**Alternatives considered:**
- Только «рекомендация использовать MCP» без хука — отклонено: не даёт ни контроля, ни лога; 31 скилл продолжит грепать по привычке.
- Полный запрет включая движок (всё через сервер) — отклонено: ломает FR-21 деградацию, превращает каждый CLI в клиента сервера, самоблокирующаяся архитектура.
- Один монолитный агент создания вместо фазовых — отклонено: нет промежуточных гейтов проверятора, ошибки фаз копятся до финала (текущая болезнь и есть).


### Mutation tools — edge-case hardening (review 2026-06-07, dynamic workflow wf_859eee1f-282)

5-angle adversarial review (platforms / worktrees / concurrency / inputs / clone) + per-finding refutation. 13 confirmed, 5 refuted. Fixes in `tools/spec-mcp-server/mutations.ts` (`validateTarget`) + handlers; regressions = SPECGEN004_124..130.

**Closed (HIGH first):**
- **Slug traversal** (`../escape`) → arbitrary write outside `.specs/`: `SAFE_SLUG_RE` + explicit `..` reject, BEFORE any fs touch.
- **Mixed-case extension** (`FR.MD`) skipped every case-sensitive gate then overwrote the real `FR.md` on a case-insensitive FS: extension must be canonical lowercase `.md`/`.feature`.
- **`.progress.json` / non-md-feature docs** wrote unvalidated through all gates: `MUTABLE_DOC_RE` whitelist; `.progress.json` deliberately excluded (single-writer via spec-status).
- **Empty full-replace** silently destroyed a doc → refused. **Both `content` + edit-pair** ambiguous → `AMBIGUOUS_CHANGE`. **Missing-spec `.md`** threw uncaught ENOENT in the clone → now clean `VALIDATION_FAILED`/SPEC_NOT_FOUND. **Reserved Windows slug** (`con`/`nul`/…) → `RESERVED_SLUG`. **Orphan `.tmp`** on rename failure → unlinked.

**Platform / worktree answers (refuted as defects, documented):** the server's repoRoot is `process.cwd()` and the FR-14 watcher + graph share it, so a worktree's own `.specs/` is read AND written consistently (no split-brain — `DEV_POMOGATOR_REPO_ROOT` defaults to cwd in the real launch). conformanceFindings clones only the one spec dir; cross-spec conformance codes are advisory there — the AUTHORITATIVE cross-spec verdict stays `spec-verdict.ts` over the full corpus, as designed.

**Known residual (accepted, low):** `apply_spec_change` is last-writer-wins on concurrent edits of the same doc (TOCTOU validate→write window) — acceptable for a single-agent authoring loop; both writes are audited. The conformance clone layer is error-severity-only (rarely the rejecting gate; anchors + form contracts are the live gates) — matches the authoritative verdict's own conformance gating.

### Engine carve-out — two recognizers, not a hand-maintained basename list (FR-39f, P17-4)

The carve-out has two halves, with very different enforce-risk:

1. **In-process engine readers (39 files: builder / form-parsers / resolvers / hooks / MCP server).** These read/write `.specs/` via `fs` IN-PROCESS — they never pass through PreToolUse, so the guard *cannot* block them. "Must not block" is trivially true; listing them is informational only. They are the door's backend (FR-39 rationale, DESIGN §"MCP-rails").

2. **Bash-invoked engine (`invokesEngineCli`).** This is the FUNCTIONAL spine. The guard gates a Bash command iff it `touchesSpecs(cmd)`; the command is then allowed only if it INVOKES THE ENGINE. A legitimate engine invocation the recognizer misses is silently DENIED when enforce flips (P17-6) — a deferred regression.

**Correction (2026-06-08 review #2 — the basename-only list was NOT complete).** The first cut allowed only `token.basename ∈ ENGINE_CLI` (a 10-item array) and was declared "verified complete" via three oracles. That conclusion was **wrong**: `invokesEngineCli` matches a token's *basename minus extension*, but several real engine CLIs have basenames absent from the list — `tools/anchor-integrity/check.mjs`→`check`, `…/fix.mjs`→`fix`, `…/full-mode.ts`→`full-mode`, `architecture-decision-cli.ts`, `variant-matrix-cli.ts` — and the lone directory-named entry `anchor-integrity` can NEVER be a `.pop()` basename. So `anchor-fix`'s real write path `node tools/anchor-integrity/fix.mjs --spec .specs/<slug> --apply` was **DENIED** — exactly the regression P17-4 exists to prevent. SPECGEN004_133's first cut hid it (it probed synthetic `tools/x/anchor-integrity.ts`, the *declared name*, not the *real producer* — the `verify-against-real-artifact` anti-pattern). All three oracles missed it (the shadow log never ran anchor-fix; the grep was eyeball-classified "CLI ⇒ safe" without probing the guard).

**Fix — recognize the engine by what it IS, not a drifting list.** `invokesEngineCli` now allows a command if **(a)** some token's basename ∈ `ENGINE_CLI` (canonical CLI by bare name / path — PATH-installed or `tsx tools/…/spec-verdict.ts`), **OR (b)** some token is a **project script** — a `.ts/.js/.mjs/.cjs` path under `tools/` or `.claude/skills/`. The DESIGN rationale already says the engine IS the door's backend, and the engine is every project script, not 10 named ones. Inline code carries no script-path token, so it stays a violation: `node -e "fs.readFileSync('.specs/…')"`, a `<<EOF`→`/tmp/x.mjs` heredoc (`/tmp/` is not under `tools/`/`.claude/skills/`), and generic `cat`/`grep`/`sed` all fail both recognizers.

**Verification (2026-06-08) — REAL producer invocations probed via `violationOf`:** ALLOW for `spec-verdict.ts`, `collision-probe.ts`, `anchor-integrity/check.mjs`, `anchor-integrity/fix.mjs --apply`, `cross-spec-reconcile/scripts/full-mode.ts`, `architecture-decision-cli.ts`, `variant-matrix-cli.ts` (all over `.specs/`); DENY for `cat .specs/…`, `grep -rn … .specs/…`, `node -e "…readFileSync('.specs/…')"`, `node /tmp/t.mjs .specs/…`. Pinned by SPECGEN004_133 against those **real** strings (no synthetic basenames). So `anchor-fix` / `cross-spec-reconcile` / `architecture-decision-builder` / `variant-matrix-build` need no per-skill migration — the fix is at the guard, where it future-proofs every directory-named or generic-basename engine tool.

### MCP tool → skill-consumer table (FR-42a, P17-9)

**Требование:** [FR-42](FR.md#fr-42)

Thin skill, thick server: every USER-FACING MCP tool has a skill that knows how to drive it (the user enters through the SKILL, never naked MCP). The table is the canonical declaration in `.claude/skills/spec-generator-orchestrator/scripts/feature-map.ts::TOOL_CONSUMERS`; the drift guard (`drift-check.ts`) fails if a live registry tool is absent or has zero consumers (`checkToolConsumers`, FR-42b). SPECGEN004_120 enforces it; SPECGEN004_121 pins create-spec as the entry that drives the mutation tools without re-implementing server logic.

| MCP tool | Skill consumer(s) | Door |
|---|---|---|
| get_trace / get_node / find_refs / find_by_tags / search | spec-graph-query | read (query) |
| conformance_check | spec-graph-query, cross-spec-reconcile | read |
| get_coverage / get_coverage_summary / get_spec_status | spec-graph-query, spec-status | read (honesty) |
| list_phase_tasks / list_specs / find_orphans / validate_anchor | spec-graph-query | read |
| **list_spec_docs / read_spec_doc** | spec-graph-query | **FR-39a read door** |
| **propose_spec_change / apply_spec_change / create_spec** | create-spec | **FR-40 mutation door** |

A new user-facing tool MUST be added to TOOL_CONSUMERS with a real consumer skill (and that skill must actually document/use it) or the drift guard blocks — this is the FR-42 «no naked MCP tool» invariant.

### Decision: Toothless reverse-trace checks stay ADVISORY until the debt is cleaned (P20-5, FR-44)

**Требование:** [FR-44](FR.md#fr-44)

**Rationale:** The live corpus data decides this, not taste. Promoting the warning-class reverse checks (ORPHAN_TASK, SCENARIO_TAG_ORPHAN, TASK_STATUS_UNVERIFIED) or the new INFO trio (TASK_NO_REQUIREMENT: 7, ORPHAN_PROJECT_TEST: 72, FR_NO_RESEARCH: 538) into the FR-37b GAP_CLASSES hard gate TODAY would flip spec-generator-v4 itself RED on the spot (3 live TASK_STATUS_UNVERIFIED) and flood the corpus with hundreds of legacy findings. A gate that is born red on day one teaches escape-hatch gaming instead of hygiene (the H1 / scope-gate anti-gaming lesson) — surfacing first, gating after cleanup, preserves the gate's authority.

**Trade-off:** Advisory findings can be ignored, so new debt of these classes can still accumulate until promotion — the cost of not flooding RED now. Mitigated by visibility: all six classes appear in the spec-verdict conformance summary and corpus-health sections 3/5/6 on every run, so the debt is measured, not hidden.

**Alternatives considered:**
- Promote everything to GAP_CLASSES now (rejected) — instant corpus-wide RED (538+72+7 findings), drowns the three real residuals, incentivises gaming the escape hatches.
- Per-spec opt-in gating (e.g. only specs created after FR-44 landed) (deferred) — viable second step after cleanup; adds config surface now without removing the legacy-debt problem.
- Keep-advisory with explicit promotion criteria (CHOSEN) — a class is promoted to GAP_CLASSES (+ BDD regression per the SPECGEN004_98 lesson) only once its corpus count is driven to ~0 and stays there for a full hygiene cycle; until then the counts in corpus-health are the burn-down metric.

### Decision: Gate task START on the chain phase-aware, NOT on whole-spec health (FR-48)

**Требование:** [FR-48](FR.md#fr-48)

**Rationale:** The gate must block starting an impl task whose requirement lacks its chain — but a flat «chain complete» gate deadlocks the remedy: with 0/47 FRs web-complete, the very task that authors FR-X's design leg cannot go in-progress (FR-X has no design leg — that is what the task produces). Keying the gate off task PHASE breaks the cycle: impl-phase tasks gate on the upstream chain existing; spec-authoring/retrofit tasks gate only on «the FR heading exists». This is the repo's «spec fully, then code» order made enforceable, not an exemption hack. «Validated» = legs present + internally consistent per-FR (cheap, reuses `missingLegs`), NOT spec-verdict GREEN (which would couple one task's start to the entire spec's health — one red scenario anywhere blocks an unrelated start).

**Trade-off:** Phase classification needs an explicit signal (a task marker), not a fragile text heuristic — small authoring cost per task. And per-FR «legs present» is weaker than «legs green»: a failing scenario counts as present (TDD-first), so the gate guarantees the chain is ASSEMBLED, not that work is done (that stays the FR-46 done gate). Accepted: the two brackets are deliberately different checks.

**Alternatives considered:**
- Gate on `webComplete` everywhere (rejected) — instant deadlock on the retrofit (0/47), nothing can start.
- Gate on spec-verdict GREEN (rejected) — couples one task's start to the whole spec; one red scenario anywhere blocks unrelated starts; heavy (audit+traceability+semantic per transition).
- Phase-aware «legs present per-FR» (CHOSEN) — breaks the cycle, cheap (reuses `missingLegs`), staged WARNING→ERROR so it does not flip the corpus red on day one (the FR-44 advisory lesson above).

### Decision: One door, entity-type dispatch — authored (Task+Phase) vs derived (refuse with verdict) (FR-48e)

**Требование:** [FR-48e](FR.md#fr-48)

**Rationale:** Owner: «сразу все сущности». But «all entities» splits cleanly along authored-vs-derived, NOT one uniform status. (1) AUTHORED = a human/agent declares the state: TASK (5-vocab in `TASKS.md`) + PHASE (the STOP-confirm in `.progress.json`). These route the WRITE through `set_entity_status` and are gated. (2) DERIVED = the state is COMPUTED, never hand-set: FR / story / decision / AC / scenario / whole-spec — their truth is `fr-census` (per-FR) / `get_spec_status` (per-spec). Storing a hand-set status on them duplicates truth — the exact thing FR-48a forbids («вердикт не хранится, выводится»). So `set_entity_status` accepts EVERY entity but answers by type: authored → typed transition; derived → refuse `STATUS_DERIVED` CARRYING the live computed verdict + how to change it. «All entities route through one door» holds without a fake stored status.

**Phase is NOT a 5-vocab entity.** Its single authored field is `stopConfirmed`; `completedAt`/`currentPhase` are recomputed from file existence (`-ConfirmStop`, `specs-generator-core.mjs:1480-1542`). So a phase's authored transition is BINARY — `done` = confirm STOP, reopen = clear — and `ready`/`in-progress`/`blocked` are illegal-for-type. `done` ⇒ `stopConfirmed=true` (NOT `completedAt`, which stays derived). The write MUST reuse the EXACT `-ConfirmStop` transform (the FULL recompute, not a half that sets only `stopConfirmed` and leaves `currentPhase`/`completedAt` stale — that half-write IS the dual-truth bug). `.progress.json` is JSON, not a markdown doc: it does NOT pass the door's mutation-path (validateSpecChange/conformance) nor sha-CAS — it uses the `.progress.json` atomic writer with the same last-writer-wins story as `-ConfirmStop` today. FR-48d's CAS claim is task-only.

**Phase-id discoverability.** Phases are not graph nodes, so `get_node`/`get_trace` cannot surface `<slug>:phase:Requirements`. The id is published by `get_spec_status` — without it the command is unusable for phases, violating FR-48c (the agent learns the handle at the point of use).

**Trade-off:** `set_entity_status` gains an entity-type dispatch + a real wire to `fr-census`/`get_spec_status` for the derived verdict (not a throwaway branch). The phase write reuses the `.mjs` `-ConfirmStop` transform — IMPLEMENTED by DELEGATING: `set_entity_status` spawns `node specs-generator-core.mjs spec-status -ConfirmStop` (the same plain-ESM engine `create_spec` already spawns via `process.execPath` in tools.ts — no tsx dep for users, no `.mjs` refactor, no second `.progress.json` writer). The ordering+inputs+precondition gate lives in `phase-lifecycle.ts` AHEAD of the spawn (the CLI confirms `stopConfirmed` without checking prior-STOP order). A partial in-TS re-implementation of the transform would have been the dual-truth bug, so it was rejected. Skill stays named `task-status` (rename touches 4 registration points + the FR-42b grep) with a one-line «broader than tasks» note.

**Alternatives considered:**
- Uniform 5-vocab on every entity (rejected) — meaningless for a phase (a `ready` phase?) and forces a stored status onto derived content, duplicating the census/verdict truth FR-48a forbids.
- Refuse content silently / NOT_FOUND (rejected) — the agent can't tell «no such entity» from «status is derived»; the typed `STATUS_DERIVED` + live verdict is the discoverable answer.
- A second `.progress.json` writer inside `set_entity_status` (rejected) — diverges from `-ConfirmStop` (dual truth); reuse the one transform.

### Decision: FR-49 owns reusable census and routing, not Pinator policy (FR-49)

**Требование:** [FR-49](FR.md#fr-49)

**Rationale:** Task census, target-root resolution, next-step routing, transcript replay, and stale-marker reconciliation are shared spec infrastructure; [.specs/pinator/](../pinator/README.md) separately owns whether a Stop may be judged (M1–M2).

**Historical rationale superseded:** The false-close incident (the agent declared done while 11 FRs were in-progress, IGNORING the per-prompt census banner) is not «add a tool» — the surfacing already existed and was ignored. So FR-49 ENFORCES, not just shows. Advisor-vetted scope: 3 of 4 parts WIRE+ENRICH live machinery, 1 is net-new:
- **FR-49a** — enrich the EXISTING `buildTaskCensusLine` with the next open task (`nextOpen` on the census cache).
- **FR-49b** — historical: Pinator census-aware Stop policy now lives in pinator M2 (not redefined here).
- **FR-49c** — NO new writer: the existing `lifecycle.ts` watcher already refreshes the census on every door write (`refreshCensus` on boot + each `onPatch`). Verified, not rebuilt.
- **FR-49d** — the ONE net-new piece: a flag-only reconciler for stale in-progress markers.

**Trade-off:** The integration boundary spans two specs and requires explicit cross-spec scenarios, but ordinary census use cannot accidentally arm a completion judge. Historical implementation guards remain below for provenance. (1) anti-H1 (FR-49b): `isSpecCompletionClaim` is WHOLE-spec only (not per-task, not a progress report) AND requires a REAL unfinished census — a non-spec «fixed the typo» never trips the census branch (the gate already had SELF_MARKERS false-fire history; same discipline). (2) false-green (FR-49d): the reconciler FLAGS, never auto-closes (an auto-closing reconciler would be the very false-green the honesty machinery fights); a task with no scenario is never flagged. (3) dep-safety: the gate's new `task-census` import is builtins-only (`coverage.ts` has zero imports), so the plugin-distributed Stop hook stays runnable for users with no `node_modules`. Turtle: the gate that blocks false-close is itself specced through the door it guards; FR-49's own whole-spec claims self-block while the spec is unfinished — correct, not a bug (report component-level done).

**Alternatives considered:**
- 4 net-new hooks (rejected) — 3 of the 4 concerns already had live machinery; net-new would duplicate + drift.
- A research-N/A escape to lift web-complete (rejected mid-session as invented scope — research citation is ~3% by design, INFO-only, not a target).
- Auto-closing reconciler (rejected) — false-green risk; flag-only, the human/agent closes via `set_entity_status`.

### Decision: Waived tasks are hard-gated against closing — ERROR floor, no headerOf relaxation (FR-50)

**Требование:** [FR-50](FR.md#fr-50)

**Rationale:** The near-fake-close of `verify-phase0-red` was caught by a human RE-READING the block, not by the door — so the discipline must move INTO the door. The single signal is the EXISTING `_waived:` marker the form-gate already honours; FR-50 just makes the spec-GRAPH see it too via ONE shared `WAIVED_RE` (no second concept to drift). The shape is the FR-46/48 pattern: a state-invariant in `checkConformance` + a `set_entity_status` refusal sharing ONE truth (`TaskNode.waived`), so floor and command never disagree. ERROR (not the staged-WARNING the FR-44/47/48 gates use) is justified because a corpus scan proved ZERO `waived && done` violators — a born-green gate doesn't teach escape-hatch gaming (the H1 lesson), unlike a gate that flips the corpus red on day one.

**Trade-off:** Lifting `_waived:` into the graph forced a parser boundary fix — a column-0 `- [..]` bullet with `id:` must END the prior block even when its `Status:` is non-enum; without it the orphan's `_waived:` line bleeds into the PREVIOUS DONE task and false-fires the floor (caught empirically pre-commit, on `migrate-vitest-bdd-pseudo`). Accepted: the boundary fix is strictly more correct (a DONE task's Done-When no longer absorbs the next orphan). A waived task with a non-enum status stays INVISIBLE to the graph by design (no `headerOf` relaxation) — protected at the close attempt (the command's TASKS.md fallback scan + the floor once it becomes DONE), NOT surfaced as an open `todo`.

**Alternatives considered:**
- Relax `headerOf` to surface WONT-VERIFY as `todo` (rejected) — highest blast radius (every malformed-status task across 47 specs surfaces at once) AND mislabels a deliberate PERMANENT waiver as an open todo that fr-census would nag about forever.
- Staged WARNING→ERROR like the FR-46/47/48 gates (rejected) — zero legacy `waived && done` violators, so staging only opens a soft window for the exact contradiction with no upside; ERROR from day one is safe and immediate.
- Command-only refusal without the conformance floor (rejected) — a raw `apply_spec_change` flipping the status bypasses the command; the floor is the un-bypassable guarantee, the command is the clean early UX (CHOSEN: both, sharing one `TaskNode.waived` truth).

### Decision: get_trace returns BOTH a structured tree AND a pre-written explanation_for_agent

**Требование:** [FR-4](FR.md#fr-4)

**Rationale:** The primary MCP tool `get_trace(node_id)` must let the agent act on one queried node without any follow-up file Read. Returning structured JSON alone (acceptance_criteria[]/scenarios[]/tasks[]/code_impl[]/related_nodes[]) forces the agent to re-interpret raw data — exactly where hallucinated cross-refs creep in. So the server ALSO composes a ≤500-char natural-language `explanation_for_agent` (FR title, AC/scenario/task counts, latest test status, failing step + error location when present), grounding the agent in fact. Implemented in `tools/spec-mcp-server/tools.ts` (`explanation_for_agent: explanation`, ~line 662) over the graph slice assembled by `tools/spec-graph` — no extra round-trip, the summary is built from the same in-memory nodes already gathered for the structured payload.

**Trade-off:** The server owns a hand-written summariser that must stay in sync with the structured fields (a new edge type means updating both the tree and the prose), and the ≤500-char budget means the explanation is lossy for very large traces — it cites counts + the single most relevant failing step, not every node.

**Alternatives considered:**
- Structured JSON only, no prose (rejected) — pushes interpretation onto the agent, the documented hallucination source FR-4 exists to remove.
- Prose only, no structured tree (rejected) — agent cannot programmatically walk AC->Scenario->Task edges; loses machine-actionable traceability.
- Let the agent run a second summarising LLM call over the JSON (rejected) — extra latency/token cost per query and non-deterministic; a server-composed deterministic summary is cheaper and stable.

### Decision: Syntax invariants are HARD PreToolUse DENY, not soft warnings

**Требование:** [FR-5](FR.md#fr-5)

**Rationale:** A class of spec defects breaks graph integrity outright — two `### FR-N:` headings with the same id (DUPLICATE_DEFINITION), YAML frontmatter that won't parse (MALFORMED_FRONTMATTER), a `.feature` that fails gherkin parse (MALFORMED_GHERKIN), a heading that matches `anchor_patterns` but yields an empty anchor (INVALID_ANCHOR_PATTERN). Soft warnings on these get ignored by both agent and human (the proven v3 form-guard track record), so they must be enforced SYNCHRONOUSLY at Write/Edit time: the PreToolUse hook `spec-conformance-guard` DENIES the tool call with a `permissionDecisionReason` carrying location + an actionable hint. Implemented in `tools/spec-conformance-guard/spec-conformance-guard.ts` (matches `.specs/**/*.md` + `**/*.feature`), mirroring the v3 form-guard hard-deny pattern.

**Trade-off:** A hard deny can block a legitimate in-progress edit (e.g. mid-refactor a heading is briefly duplicated); the cost is the developer must resolve the invariant before the write lands. Limited deliberately to true syntax/integrity invariants — soft drift (UNCOVERED_FR, semantic mismatch) is left to the PostToolUse push (FR-6), not this hard gate.

**Alternatives considered:**
- Soft WARNING only (rejected) — 1.5-year evidence that agents and humans ignore warnings; broken graph integrity ships.
- PostToolUse async check (rejected for this class) — fires after the broken content is already on disk; a duplicate id has already corrupted the graph by then. Async push is correct for soft drift, not for hard invariants.
- Validate only at commit time / CI (rejected) — too late in the loop, the agent has already built on the broken state for many turns.

### Decision: Marksman is registered as a native Claude Code LSP plugin (supersedes the custom bridge + js-fallback)

**Требование:** [FR-7](FR.md#fr-7)

**Rationale:** Markdown navigation/edit over wiki-links (definition / references / rename / hover / documentSymbol) is a solved LSP problem, and Claude Code now has NATIVE LSP support. So dev-pomogator registers Marksman via the plugin's `.lsp.json` (`plugin.json` `lspServers`): one server `marksman`, `command` = a `node` launcher shim `tools/marksman-installer/launch-marksman.cjs` that execs the resolved binary `marksman server` over inherited stdio (cross-platform, no PATH mutation, mirrors `.mcp.json`'s node pattern), `args=["server"]`, `extensionToLanguage={".md":"markdown"}`. A SessionStart hook auto-installs the binary (PATH first, else managed download to `.dev-pomogator/bin/` with sha256 computed by `cli-update-hashes.ts`) — the user is never asked to install it. The custom graph keeps ONLY spec-domain concerns an LSP has no concept of: traceability (get_trace/get_coverage), the honesty gate, conformance, and broken-link detection (`wikilinks.ts` stays a CONFORMANCE check, not a navigation fallback).

**Trade-off:** When Marksman is genuinely unavailable (offline + unsupported platform) navigation features are simply ABSENT with an actionable message — the system does NOT fake a degraded MD-LSP (dead-integration-guard). Versus the old bridge, dev-pomogator gives up wire-level control of the JSON-RPC framing (now Claude Code's native LSP host owns it), and a Marksman version bump means re-resolving/re-hashing the binary.

**Alternatives considered:**
- Custom hand-rolled JSON-RPC bridge (`marksman-lsp/bridge.ts` + `md_references` MCP tool) (rejected/RETIRED 2026-06-04) — wrong layer once native LSP exists; reimplements what the LSP host already does; was downloaded-and-never-run.
- A JS MD-LSP fallback when Marksman is missing (rejected) — fakes a degraded navigation surface that lies about resolution (dead-integration-guard); FR-7 mandates honest absence instead.
- Heading migration to short slugs so bare `[[FR-1]]` resolves to `## FR-1` (rejected here, scoped out) — lossy (drops the title + AC<->FR linkage from headings) and the agent already resolves `[[FR-1]]`/`AC-N` via the graph's own dual-anchor definitions; any migration is a separate forked task.

### Decision: Semantic drift is an opt-in LLM judge, default OFF, result-cached by content hash

**Требование:** [FR-8](FR.md#fr-8)

**Rationale:** Structural checks miss the case where a test technically passes but does not validate the requirement (FR says 'redirect to /login', the scenario asserts an API 401 — both pass syntactic checks, semantically misaligned). Only an LLM can judge that. So `conformance_check(scope, semantic: true)` spawns a `claude -p` subprocess (Haiku) with the FR text + the scenario Given/When/Then text and parses the JSON verdict into a `SEMANTIC_DRIFT` finding (severity + explanation). It is DISABLED by default (per-call `semantic: true` or `.spec-config.json::conformance_checks.semantic_drift.enabled`) because the call costs tokens and is non-deterministic. Results are cached by `hash(fr_text + scenario_text)` so a repeat call returns the cached verdict without re-spawning. Implemented in `tools/spec-graph/conformance.ts` + `tools/spec-llm-judge/` (`index.ts`, `cache.ts`, `deny-list.ts`).

**Trade-off:** When enabled it adds latency + token spend per scope and the verdict can vary run-to-run; mitigated by default-OFF + the content-hash cache. The judge transport must fail-open (judge unavailable -> drift pass skipped, structural findings still ship) so a missing `claude` binary never blocks conformance.

**Alternatives considered:**
- Always-on semantic check (rejected) — token cost + non-determinism on every spec edit; the documented forgetfulness-vs-noise balance breaks.
- Pure structural conformance, no semantic layer (rejected) — misses the highest-value class (test passes but doesn't validate the FR), the whole reason the judge exists.
- A second bespoke judge stack (rejected) — reuse the existing judge transport + deny-list rather than maintaining a parallel one.

### Decision: Multi-language BDD via the canonical Cucumber Messages schema, not per-runner adapters

**Требование:** [FR-9](FR.md#fr-9)

**Rationale:** Cucumber Messages NDJSON is a language-agnostic standard that every major BDD runner emits (Reqnroll v3+ for .NET, behave with the message formatter for Python, Cucumber-JVM with `--plugin message:` for Java) — the same schema cucumber-js produces for TypeScript. So the NDJSON ingester relies on the `@cucumber/messages` canonical parser and stays runner-agnostic: one ingester populates the SpecGraph regardless of source language, and `get_trace` works identically across stacks. Only code-reference extraction (`step_bindings`) is runner-specific (Reqnroll/cucumber-js carry `stepDefinition` envelopes in NDJSON; behave needs a small bridge reading its bindings). Implemented in `tools/spec-graph/parsers/multilang.ts` + `parsers/ndjson.ts`, exercised by `tests/e2e/multilang-ingest-roundtrip.test.ts`.

**Trade-off:** v4 is tied to runners that emit canonical Cucumber Messages — a runner with a non-standard output format needs a producing-side conversion (or a bridge) before ingestion; behave specifically needs the extra binding-extraction bridge. Re-verifying against each real runner's actual NDJSON is a maintenance cost (verify-against-real-artifact).

**Alternatives considered:**
- Per-language bespoke parsers (rejected) — duplicates ingest logic N times, drifts per runner, defeats the point of a shared schema.
- TypeScript/cucumber-js only (rejected) — locks v4 to one ecosystem; the whole FR is to support C#/Python/Java projects.
- Parse each runner's human stdout (rejected) — brittle, format-unstable; canonical NDJSON is the machine-readable contract that exists precisely to avoid stdout scraping.

### Decision: SQLite cross-session index is opt-in (config-gated), WAL + single-writer, with corruption auto-fallback

**Требование:** [FR-10](FR.md#fr-10)

**Rationale:** The Phase-2 default is in-memory only (see 'In-memory storage only for Phase 2', owned by FR-2), but multi-session users (two Claude Code terminals on one project) pay the rebuild cost per session and can see inconsistent state. So Phase 4 ADDS an OPT-IN persistent index at `.dev-pomogator/.spec-index.sqlite` (SQLite WAL mode), gated by `.spec-config.json::storage.sqlite_enabled=true`: sessions share one MCP server (per `.mcp-lock.json`), cold start reads the pre-built index instead of rebuilding, writes are single-writer-enforced by wrapping in a `BEGIN IMMEDIATE` transaction, schema migrations run off a `meta.schema_version` table, and on corruption the server auto-falls-back to an in-memory rebuild + logs a warning (the index is purely derived — `.specs/**/*.md` stays source of truth, so loss = rebuild not data loss). Implemented in `tools/spec-mcp-server/sqlite/wrapper.ts`.

**Trade-off:** SQLite is opt-in precisely because its native binding complicates the install matrix (devcontainer/Codespaces/WSL bind-mount lock semantics) and adds schema-migration maintenance — so it is OFF by default and only paid by users who explicitly want cross-session sharing. WAL single-writer serialises writers; concurrent sessions read freely but writes go through the lock owner.

**Alternatives considered:**
- Make SQLite the default (rejected) — native-compile + bind-mount lock-corruption risk on the common devcontainer/Codespaces/WSL targets; in-memory is the safe default, SQLite the opt-in.
- Persistent JSON file instead of SQLite (rejected) — same atomic-write/lock problem with no query-performance benefit and only marginal cold-start savings.
- No fallback on corruption (rejected) — a corrupt index would hard-fail the server; auto-rebuild from the git-committed MDs is free and keeps the door alive.

### Decision: v3->v4 migration is consent-first — dry-run default-safe, interactive with skip-default, explicit --yes for CI

**Требование:** [FR-11](FR.md#fr-11)

**Rationale:** Forcing manual edits across 20+ existing v3 specs is a non-starter, but silently auto-rewriting them is risky. So `dev-pomogator migrate-v3-to-v4` is consent-first with three modes: `--suggest-only` prints per-file diffs (heading conversions, frontmatter additions, anchor changes) WITHOUT touching files; the no-flag default is interactive (approve/skip/edit per file, defaulting to `skip` on 30s of no input); `--yes` is the only non-dry-run path that writes without per-file confirmation, reserved for CI/unattended. Migration converts legacy `### Requirement: FR-N <title>` -> `### FR-N: <title>` (body preserved), creates `.spec-config.json` if absent, predicts `@FR-N` tags for untagged scenarios by naming heuristic, and bumps `.progress.json::version` 3->4 ONLY when the spec migration is confirmed. Backward compat is preserved via triple-anchor registration so legacy headings keep working. Implemented in `tools/migrate-v3-to-v4/` (`cli.ts`, `converter.ts`, `interactive.ts`, `tag-predictor.ts`).

**Trade-off:** The interactive 30s-skip default means a fully unattended run does nothing unless `--yes` is passed (deliberate — safe default over convenience); and the tag-prediction heuristic can mis-suggest a tag, which is why suggestions are shown for approval rather than auto-applied.

**Alternatives considered:**
- Silent auto-rewrite of all specs (rejected) — risk of corrupting completed specs with no consent; the whole FR is consent-first.
- Default to apply (no dry-run) (rejected) — a wrong conversion lands before the user sees it; dry-run / interactive-skip keeps the no-flag path non-destructive.
- Pure manual migration, no tool (status quo, rejected) — days of hand-editing across 20+ specs, the exact non-starter that motivates the helper.

### Decision: Orphan scenarios are WARNING by default (TDD red-phase safe), escalation is per-class config

**Требование:** [FR-13](FR.md#fr-13)

**Rationale:** Red-phase TDD writes failing scenarios before the FR/AC exists, so forcing every scenario to have a matching node upfront would break the red-green-refactor cycle. conformance_check detects two orphan classes — `SCENARIO_TAG_ORPHAN` (scenario tags `@FR-N`/`@NFR-N`/`@AC-N` but the node doesn't exist) and `UNTAGGED_SCENARIO` (no FR/NFR/AC tag at all) — and emits both at severity `warning` (NOT error, NOT block) by default, listing existing similar ids to help. Teams that want stricter enforcement raise it per class via `.spec-config.json::orphan_policy.{class}` = `warn|block|exempt`, with `exempt_scenarios` (e.g. `@no-fr-required`) and `exempt_paths` (e.g. `tests/infrastructure/**`) escape lists. Implemented in `tools/spec-graph/conformance.ts`.

**Trade-off:** A default-warn means a genuinely orphaned scenario can ship un-blocked until someone reads the warning — the cost of not breaking red-phase. Teams that prefer hard enforcement opt into `block` per class; the policy is per-orphan-class rather than global so untagged vs dangling-tag can be tuned independently.

**Alternatives considered:**
- Hard-block all orphans by default (rejected) — breaks red-phase TDD, the explicit motivation; agents/humans can't write a failing test first.
- Global single severity for both classes (rejected) — UNTAGGED_SCENARIO (infrastructure tests legitimately untagged) and SCENARIO_TAG_ORPHAN (a typo'd/renamed FR id) deserve different policies; per-class config is needed.
- No exemption lists (rejected) — infrastructure/`@no-fr-required` scenarios would forever warn; explicit exempt lists silence the known-OK cases without disabling the check.

### Decision: Multi-env correctness — repo-relative paths, watcher touch-test fallback, presence lock plus short write-lock

**Требование:** [FR-14](FR.md#fr-14)

**Rationale:** dev-pomogator must work across host (Win/Mac/Linux), VS Code devcontainer, WSL2, Hyper-V VM and Codespaces, where absolute/container-internal paths and unreliable bind-mount FS events silently break things. So: (1) every path in MCP API responses is relative to `git rev-parse --show-toplevel` (never absolute, never container-only); (2) the chokidar watcher runs a startup touch test (create temp file, await event <=500ms) and, if the event is missed, enables polling mode (1s) + logs the decision — auto-adapting to slow bind-mount FS; (3) `.mcp-lock.json` tags an `env` field (`host`/`container:...`/`wsl:...`) as a presence/heartbeat marker only. A second concurrent session does NOT crash: it boots as a presence-reader (it does not own the lifetime marker), but write tools still execute and serialize through the short `.mcp-write.lock` for the mutation critical section. A true concurrent in-flight write returns transient `WRITE_LOCK_BUSY`; same-doc stale writes are caught by optimistic CAS (`expected_sha` → `CAS_MISMATCH`); a different-env collision additionally surfaces an env-mismatch hint. Implemented in `tools/spec-mcp-server/lock-manager.ts` + `lifecycle.ts` + `mutations.ts` + `codespaces-autostart.ts`.

**Trade-off:** Polling fallback (1s interval) is slower than native FS events — accepted as the price of correctness on bind-mounts where native events are unreliable. The short write-lock enables co-sessions to write instead of being lifetime-read-only, but every mutation still pays a tiny serialized critical section; callers that omit `expected_sha` keep back-compat last-write-wins behavior, while CAS-aware callers get explicit `CAS_MISMATCH` instead of silent overwrite.

**Alternatives considered:**
- Absolute paths in responses (rejected) — break the moment the repo is opened from a different mount (`/workspace/...` vs `D:\...`); repo-relative is portable across host/container/WSL.
- Always-poll the watcher (rejected) — wastes CPU on fast host FS where native events work; the touch test picks the right mode per environment.
- Lifetime read-only co-sessions (rejected by P28-6/E-A) — kept reads usable but forced all writes through the first session, leaving a stale BDD/FR contract once the door was redesigned around short write-lock + CAS.
- Crash/deny the second session outright (rejected) — a co-session would lose its whole door; presence-reader boot keeps it usable while short write-lock + CAS protects mutations.

### Decision: Side-channel conformance log is persistent append-only JSONL, separate from the agent push

**Требование:** [FR-15](FR.md#fr-15)

**Rationale:** The PostToolUse push (FR-6) gives real-time feedback but is ephemeral — it vanishes from agent context. Team leads and retrospective analytics («which FRs fail conformance most often») need durable history without flooding agent context. A persistent per-day JSONL at `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (one line `{timestamp, finding_code, severity, location, message, spec_slug}`) is append-only so it doubles as an audit trail, daily-named so `--since` windows are cheap, and rotated at 10MB (`-<N>.jsonl` suffix) so a hot spec cannot grow one file unbounded. It is consumed by `dev-pomogator spec-check-log [--since][--grep]` and by external `jq`/`grep`/ML tooling (the prior-art append-only-JSONL pattern reused from `scope-gate/escape-hatch-audit.md`, DESIGN.md section (k)).

**Trade-off:** Two log files now coexist (this JSONL + v3 `form-guards.log`, see FR-23) with no unification tooling — different taxonomies and consumers. Append-only means no in-place dedup; size is bounded only by rotation, not de-duplication.

**Alternatives considered:**
- Push-only / no persistent log (rejected) — agent sees findings once then forgets; no retrospective audit, no ML training data for Phase 3+.
- Single unified log merging form-guard decisions + conformance findings (rejected) — incompatible event taxonomies break v3 `renderFormGuardsSummary()` consumers; see FR-23.
- In-place mutable store / SQLite (rejected for this artifact) — loses the grep/jq/external-tooling compatibility that is the whole point; rotation is simpler than a schema.

### Decision: Codespaces lifecycle = postStartCommand autostart + machine-tagged lock + in-memory resume

**Требование:** [FR-16](FR.md#fr-16)

**Rationale:** GitHub Codespaces differs from a local devcontainer in ways generic US-14 support does not cover: ephemeral CPU (hibernation), a persistent `/workspaces/` volume (not a bind-mount), and postCreate/postStart lifecycle hooks. dev-pomogator therefore adds a `postStartCommand` to `.devcontainer/devcontainer.json` that launches the MCP server on every cold or warm start, and tags the lock file's `env` field `codespaces:<machine-id>` so a second environment opening the same worktree is detected and refused. Because the persistent `/workspaces/` volume delivers native FS events, no polling fallback is needed; after hibernation/resume the server rebuilds its in-memory graph from the git-committed `.specs/**` files within 2s (loss = a 2s rebuild, not data loss — consistent with the in-memory-only storage decision).

**Trade-off:** Couples dev-pomogator install to editing the user's `.devcontainer/devcontainer.json` (postStartCommand). The 2s resume budget assumes the spec corpus stays at the 30-spec scale; a much larger corpus would exceed it. Machine-id tagging is best-effort — a Codespace machine-id change between hibernations would look like a new environment.

**Alternatives considered:**
- Rely on generic devcontainer support (US-14) only (rejected) — Codespaces hibernation/postStart specifics are unverified by US-14; silent breakage with no obvious cause.
- postCreateCommand instead of postStartCommand (rejected) — postCreate runs once at creation, not on warm resume; the server would not restart after hibernation.
- Persist the graph to disk to skip the resume rebuild (rejected) — the in-memory-only decision already accepts the 2s rebuild; persistence reintroduces the bind-mount/volume lock-semantics risk that decision avoids.

### Decision: Two-tier PreToolUse hook failure policy (soft fail-open preserved, hard tier fail-closed on startup)

**Требование:** [FR-19](FR.md#fr-19)

(Promotes the existing prose at DESIGN.md section «(l) Hook failure-mode tiers (FR-19)», DESIGN.md:456, into a graph-recognized `### Decision:` block — content lifted, not invented.)

**Rationale:** A single «all hooks fail-open» policy creates a bypass vector: an attacker crafts a `.md` whose content reliably crashes the hard guard's parser and thereafter Writes are unprotected on every file. Two tiers close that hole while preserving v3 robustness. The **soft tier** (the 5 v3 form-guards + the meta-guard) keeps v3 FR-10's behaviour verbatim — on ANY exception it logs `{ts,hook_id,file_path,error_message,error_stack}` to `~/.dev-pomogator/logs/form-guards.log` and exits 0. The **hard tier** (`spec-conformance-guard`, FR-5) splits by failure site: a STARTUP/config-load crash exits 1 + actionable stderr (broken install must surface; the user's Write is blocked until repair), whereas a per-file CONTENT parse exception appends to the spec-check-log JSONL (FR-15) and exits 0 — one confused file must not DoS authoring.

**Trade-off:** A broken hard-guard install now blocks the user's Write tool entirely until repaired (intentional — surfaces the breakage) rather than silently degrading. Adds a cross-phase dependency on the FR-15 JSONL writer; if FR-15 ships later, the writer is lifted to Phase 2 OR the hard tier falls back to `form-guards.log` with a `hard_tier_file_parse` discriminator until then.

**Alternatives considered:**
- Single-tier all-fail-open (rejected) — the parser-crash bypass above; an unprotected Write path on every file after one crafted crash.
- Single-tier all-fail-closed (rejected) — one confused/in-progress file DoSes authoring; regression vs v3's tolerant form-guards.
- Fail-closed on per-file parse errors too (rejected) — same DoS-on-authoring problem; the startup-vs-per-file split is the precise boundary.

### Decision: Author-facing conformance summary is threshold-only at prompt time plus on-demand /spec-status (B3+B4)

**Требование:** [FR-20](FR.md#fr-20)

(Promotes the existing prose at DESIGN.md section «(n) Conformance summary surfacing options (FR-20)», DESIGN.md:483, into a graph-recognized `### Decision:` block — content lifted, not invented.)

**Rationale:** v3 rendered the 24h aggregate at every UserPromptSubmit, costing file-scan latency on every prompt and emitting noise even when nothing changed. The chosen combo replaces it with two complementary surfaces: **B3 threshold-only** renders a one-line summary at UserPromptSubmit ONLY when `unresolved_deny_events ≥ 1` since the author's last acknowledgment (state in `~/.dev-pomogator/state/last-summary-ack.json` = `{ack_timestamp, ack_event_count, ack_session_id}`), so the default is zero-noise and alerts only on real signal; **B4 on-demand** lets the author always pull the full 24h aggregate via `/spec-status`. Reads are capped at the last 1000 entries per log file to keep the prompt-time render ≤50ms p95 (NFR-Performance-6).

**Trade-off:** B3 requires a per-machine ack state file and an explicit ack semantics (ack on `/spec-status` invocation or on clicking the rendered line — never implicit). B4 alone would never alert a user who never asks; B3 alone misses the «show me everything» need — hence both.

**Alternatives considered:**
- B1 — render 24h aggregate at every prompt, v3 verbatim (rejected) — per-prompt latency + noise when nothing changed; regression for latency-conscious users.
- B2 — deprecate the summary entirely, CLI-only (rejected) — silent UX regression; users miss alerts v3 surfaced inline.

### Decision: `spec-status.ts -Format task-table` output is a frozen public contract, source-swappable underneath

**Требование:** [FR-21](FR.md#fr-21)

**Rationale:** The `task-board-forms` skill, v3 spec-workflow tooling, and third-party consumers depend on the exact markdown table bounded by the `<!-- auto-generated by spec-status.ts -Format task-table; do not edit manually -->` / `<!-- end auto-generated -->` markers. We therefore treat that shape as a STABLE PUBLIC CONTRACT: the implementation MAY swap the underlying source (direct `remark` MD parse vs MCP-routed `get_trace` from SpecGraph) at any minor version, but the rendered shape may not change. The contract is pinned by a fixture-diff test (`tools/specs-generator/__tests__/task-table-contract.test.ts` against `__fixtures__/task-table-input/TASKS.md`). The CLI also runs in degraded mode (direct MD parse fallback) when the MCP server is down, mirroring NFR-Reliability-7's `cross-spec-reconcile` pattern.

**Trade-off:** Freezing the shape constrains future formatting changes — any improvement to the table must be additive or gated behind a new `-Format`. Maintaining a baseline fixture adds a test artifact that must be regenerated deliberately when the contract intentionally evolves.

**Alternatives considered:**
- Re-derive the table fresh from the graph each version without a frozen contract (rejected) — silently breaks `task-board-forms` and third-party parsers when the shape drifts.
- Require the MCP server for the CLI (rejected) — breaks standalone/degraded use; FR-21 explicitly mandates a direct-MD-parse fallback (see DESIGN.md:552 «ломает FR-21 деградацию»).

### Decision: Version gate for spec-conformance-guard — gate on .progress.json::version >= 4 (mirror of v3 FR-9)

**Требование:** [FR-22](FR.md#fr-22)

(Promotes the inherited inline decision at DESIGN.md section (o), DESIGN.md:506 «migration guard via .progress.json::version >= 3 (extended by v4 FR-22 …)», into a graph-recognized `### Decision:` block — content lifted, not invented.)

**Rationale:** dev-pomogator users hold 30+ legacy specs at versions 1/2/3. v4's new hard invariants (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN, INVALID_ANCHOR_PATTERN) were not enforced when those specs were authored. Without a gate the FR-5 hard guard would false-positive on every legacy spec and DoS authoring until each is migrated. So `spec-conformance-guard` fires only when the target spec's `.progress.json::version >= 4`; for `version < 4` / null / absent it exits 0 and logs `{kind:"ALLOW_AFTER_MIGRATION", reason:"spec_version", target:<path>}` to the spec-check-log JSONL. This is the same compatibility pattern v3 FR-9 used for the v2→v3 transition (`.progress.version` is the natural version marker; hooks check it right after the matcher filter).

**Trade-off:** Legacy specs stay un-enforced until manually migrated — enforcement cannot be applied retroactively. The gate keys on a single field, so a mis-stamped `.progress.json` silently disables the guard for that spec.

**Alternatives considered:**
- WARNING-only period then ERROR-switch (rejected) — agents ignore warnings (1.5-year track record per `validate-specs.ts`).
- Bulk-migrate all existing specs (rejected) — days of manual work + risk of breaking completed specs.
- Opt-in via explicit env var (rejected) — `.progress.version` is the natural marker; no new config file needed.

### Decision: Two distinct log files (v3 form-guards.log + v4 spec-check-log JSONL), intentionally not unified

**Требование:** [FR-23](FR.md#fr-23)

(Promotes the existing prose at DESIGN.md section «(m) Log file inventory (FR-23)», DESIGN.md:472, into a graph-recognized `### Decision:` block — content lifted, not invented.)

**Rationale:** v4 keeps v3's `~/.dev-pomogator/logs/form-guards.log` (text line `{ts} {hook_id} {decision} {target} {message}`; 30d/10MB cap; rotated by `validate-specs.ts`; consumed by `renderFormGuardsSummary()` for FR-20 + `/spec-status`) AND adds `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl` (FR-15; JSON-per-line `{timestamp, finding_code, severity, location, message, spec_slug}`; rotate at 10MB; consumed by the `dev-pomogator spec-check-log` CLI + analytics). They are deliberately NOT unified because they carry different event taxonomies (form-validation decisions vs invariant findings), have different consumers (legacy v3 summary vs new CLI analytics), and different lifetimes. Schema-migration/unification tooling is out of scope for v4.

**Trade-off:** Two files and two schemas to reason about; FR-20's summary reader must scan both. No cross-file de-duplication or unified query without external tooling.

**Alternatives considered:**
- Unify into one log (rejected) — incompatible taxonomies break v3 `renderFormGuardsSummary()` consumers for no clear gain; v5+ may consolidate.
- Drop the v3 form-guards.log and route everything to JSONL (rejected) — regression for v3 summary consumers that depend on the text-line schema + 30-day retention.

### Decision: Meta-guard preserved from v3 and extended to protect v4 plugin.json MCP-tool registrations

**Требование:** [FR-24](FR.md#fr-24)

(Promotes the inherited inline decision at DESIGN.md section (o), DESIGN.md:504 «meta-guard protects extension.json … extended by v4 FR-24 to cover plugin.json MCP-tool registrations», into a graph-recognized `### Decision:` block — content lifted, not invented.)

**Rationale:** Agents kept finding the env-var bypass (`SPEC_FORM_GUARDS_DISABLE`) and forgetting to remove it, so v3 deleted the bypass and made `extension-json-meta-guard.ts` DENY removal of any form-guard registration from the manifest. v4 extends that exact protection scope to `plugin.json`: the meta-guard denies any Write/Edit on `extension.json` OR `plugin.json` that removes (a) any of the 5 v3 form-guard hook entries, (b) the new `spec-conformance-guard` (FR-5) registration, (c) the new MCP server `dev-pomogator-specs` tool registrations (FR-4: get_trace, find_by_tags, conformance_check, …), or (d) the meta-guard's own registration (self-protection). Tampering attempts log to `.dev-pomogator/logs/meta-guard.log`. NFR-Security-2 is the concrete instantiation.

**Trade-off:** Legitimate manifest changes (renaming/consolidating extensions, removing a deprecated tool) now require human editing outside Claude Code. Self-protection means the guard cannot be removed by the agent even when removal is intended.

**Alternatives considered:**
- Keep the env-var bypass (rejected) — trivially circumvented; the exact failure that motivated deleting it.
- Read-only filesystem flag on the manifest (rejected) — blocks install-time updates.
- Cryptographic signature on the manifest (rejected) — over-engineering; no key-management infra.

### Decision: Canonical plugin ships a complete static hooks.json — additive union, never a replacement

**Требование:** [FR-25](FR.md#fr-25)

(Lifts the cross-reference at DESIGN.md section (o), DESIGN.md:500 «FR-25 (additive merge preserves v3 hook registrations)», into a standalone graph-recognized `### Decision:` block.)

**Rationale:** In the v2.0 canonical distribution there is no install-time edit/merge of the user's `plugin.json` (that was the deprecated v1/npm model); dev-pomogator ships its own static `.claude-plugin/hooks.json` loaded by Claude Code directly. The additive invariant therefore applies to the shipped manifest: it MUST be the complete union of the protective hooks (plan-gate / phase-gate / build-guard / test-guard family) AND the v4 spec hooks (FR-5 `spec-conformance-guard`, FR-6 `spec-conformance-push`, `bash-post-test/ingest`), with `length(PreToolUse) ≥ 1` AND `length(PostToolUse) ≥ 1`. A v4 hook added to an event array must not remove or overwrite a pre-existing protective entry in the same array. Enforced/verified against the real `.claude-plugin/hooks.json` (SPECGEN004_52).

**Trade-off:** The shipped manifest must be hand-maintained as a union; a regenerate-from-scratch step would silently drop protection and open a window of unprotected authoring until users notice. The invariant is a static-shape check, not a runtime merge.

**Alternatives considered:**
- Naive «overwrite the hooks array» / regenerate manifest from scratch (rejected) — silently drops protective hooks.
- Install-time merge into the user's plugin.json (rejected) — the deprecated v1/npm model; canonical plugins load a static shipped manifest.

### Decision: LLM-as-judge content boundary — deny-list scrub before claude -p, with paranoid per-spec opt-out

**Требование:** [FR-26](FR.md#fr-26)

**Rationale:** FR-8's semantic-drift check spawns a `claude -p` subprocess with FR + scenario text; sending secrets to an external model is a leak vector. So the subprocess prompt is scrubbed against a deny-list: file-names (`.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*`, `*secret*`) and body regexes (`\bAPI[_-]?KEY\b`, `\bBEARER\s+…`, `\bSECRET[_-]?KEY\b`, `\b(PRIVATE|RSA)\s+KEY\b`, `\bPASSWORD\s*[:=]`, `\bTOKEN\s*[:=]\s*[A-Za-z0-9._-]{16,}`). On a match the invocation is SKIPPED and a `SEMANTIC_CHECK_SKIPPED_DENY_LIST` warning is logged to the spec-check-log JSONL — crucially the result is NEVER reported as «no drift detected» (no false-clean when content was withheld). A spec may set frontmatter `spec_llm_judge_deny: true` to force-skip regardless of content (paranoid mode); there is deliberately no allow-list override — opt-in past a deny match is impossible. NFR-Security-7 captures the security NFR; this decision captures the behavioural contract.

**Trade-off:** Specs containing deny-matching text get no semantic check at all (skipped, not partially redacted) — a coverage gap traded for a hard no-leak guarantee. The regex deny-list can false-positive on benign text (e.g. a doc literally discussing `PASSWORD:`), silently skipping the check for that input.

**Alternatives considered:**
- Redact-and-send (mask the secret, send the rest) (rejected) — partial redaction is error-prone; a missed pattern still leaks; skip-on-match is the safe default.
- Allow-list override for known-safe specs (rejected) — any override reintroduces the leak path; deny-list is one-way by design.
- Report «no drift» when skipped (rejected) — manufactures a false-clean signal; the SKIPPED finding must be explicit.

### Decision: Marksman binary is sha256-verified against a pinned hash, install aborts on mismatch

**Требование:** [FR-27](FR.md#fr-27)

**Rationale:** `npm install` running an arbitrary binary fetched from a third-party GitHub release is a known supply-chain hole; the bundle-install decision (DESIGN.md:205) downloads Marksman but does not by itself prove the bytes. So `package.json` ships a `marksmanHashes` object mapping `{platform, arch, version} → sha256` (verbose sibling `marksman-hashes.json` allowed); after download, `postInstall` computes the file's sha256 and compares to the pinned hash for the current platform/arch/version. On mismatch the install ABORTS with `Marksman binary sha256 mismatch — expected <pinned>, got <actual>. Refusing to install untrusted binary.` and the downloaded file is deleted. The hash list is updatable ONLY via an explicit `dev-pomogator update-marksman-hashes` CLI that requires the maintainer to supply the new release version + upstream sha256. NFR-Security-8 references this.

**Trade-off:** Every new Marksman release requires a maintainer to run the update-hashes CLI before users can install it — a deliberate human gate that adds release friction. A platform/arch/version with no pinned hash cannot be installed until added.

**Alternatives considered:**
- Trust the download as-is (rejected) — the supply-chain hole FR-27 exists to close; a compromised release would execute unverified.
- Auto-fetch the hash from the same GitHub release at install time (rejected) — if the release is compromised the hash is too; the pin must be maintainer-reviewed and committed.
- GPG-signature verification instead of sha256 (rejected) — Marksman releases are not signed; a pinned sha256 is the available integrity primitive.

### Decision: Builder wires `implements` edges + `File` nodes from FILE_CHANGES.md and DESIGN.md

**Требование:** [FR-29](FR.md#fr-29)

**Rationale:** The trace web needs the FR→code leg, not just FR→AC/Scenario/Task. The builder parses each spec's `FILE_CHANGES.md` table (`Path | Action | Reason`) and DESIGN.md «Где код»/«App-код» sections, emitting one `File` node per unique referenced path (deduplicated across both sources and across all specs) and one `implements` edge from an FR to that File node. The FR↔file linkage is established by: a `Reason` column citing `FR-N` (`\bFR-\d+\b`), OR a Task whose `refs[]` contains FR-N and whose `files[]` includes that path, OR a DESIGN.md section citing FR-N adjacent to a path. Edge metadata = `{file_path, source_section: 'FILE_CHANGES'|'DESIGN', action?}`. The `types.ts` `EdgeType='implements'` / `NodeType='File'` declarations stay authoritative — this only wires `builder.ts` to emit them.

**Trade-off:** Glob patterns in `Path` (e.g. `tools/spec-graph/*.ts`) cannot be resolved to a concrete File node, so they are skipped with a single warn-once log per build (no implements edge) — a known coverage gap for glob-only rows. FILE_CHANGES.md wins on `action` metadata when a path appears in both sources, so a DESIGN-only action is shadowed.

**Alternatives considered:**
- Require explicit `// [impl->FR-N]` code annotations (OpenFastTrace style) (rejected) — pollutes source; we parse the spec's prose claims directly.
- Body text-scan any FR mention near a path to forge the edge (rejected) — coincidental FR mentions forge false edges; the linkage rules above are declared, not scanned (FR-46 «no crutch»).
- Resolve globs by filesystem expansion at build time (rejected) — non-deterministic across machines/checkouts; warn-once skip is predictable.

=== DESIGN.md (append a new `### Decision:` under the get_trace/MCP-surface decisions) ===

### Decision: get_trace surfaces code_impl[] per node, transitively derived (FR-30)

**Требование:** [FR-30](FR.md#fr-30)

**Rationale:** Once FR-29 builds `implements` edges (FR node → File node) the agent still needs the code per node WITHOUT a second hop. So `get_trace` (tools/spec-graph/coverage.ts → the trace assembler in tools/spec-mcp-server/tools.ts) attaches `code_impl[]` to every returned node: an FR node carries its direct `implements` File nodes; an AC node inherits its parent FR's entries transitively; a Scenario node unions its StepBinding file paths with the parent FR's `code_impl`; a Task node unions its `files[]` with the parent FR's. A node with no `implements` edge carries `code_impl: []` (present, never omitted) so the response shape stays stable for clients.

**Trade-off:** the transitive inheritance (AC→FR, Scenario→FR∪bindings, Task→FR∪files) duplicates entries across nodes in one response; dedup is by `file_path`. Accepted — the agent gets a complete per-node code map in one call instead of re-walking edges.

**Alternatives considered:**
- return only the FR's direct `implements` and make the agent re-traverse for AC/Scenario/Task — defeats the one-call goal (US-2 pain).
- omit `code_impl` when empty — breaks stable client shape; an explicit `[]` is the FR-30 contract.

=== USER_STORIES.md (append a new story; FR.md `**User Story:** US-18` citation is stale — US-18 is a cross-spec story) ===

### User Story 30: Per-node code map in one trace call (Priority: P2)

**Требование:** [FR-30](FR.md#fr-30)

As an AI agent inspecting a requirement, I want each node `get_trace` returns to carry the code files that implement it (`code_impl[]`), so that I see FR/AC/Scenario/Task → code in a single call without walking `implements` edges myself.

**Why:** FR-29 builds the FR→File `implements` edges, but without surfacing them per node the agent must make a second pass to find the code behind an AC/Scenario/Task — the exact N-call waste FR-2 set out to remove.

**Independent Test:** Call `get_trace` on an FR with 3 `implements` edges → response node carries `code_impl` of length 3; an AC under it inherits the same 3; a node with no `implements` edge carries `code_impl: []` (present, not omitted).

**Acceptance Scenarios:**

Given an FR with 3 implements edges
When get_trace returns the FR node
Then code_impl has length 3

Given an AC whose parent FR has implements edges
When get_trace returns the AC node
Then code_impl inherits the parent FR entries

Given a node with no implements edges
When get_trace returns it
Then code_impl is an empty array, not omitted

=== DESIGN.md (append under 'Test Data & Fixtures' or as a `### Decision:`) ===

### Decision: Real multi-language NDJSON fixtures + a cross-language roundtrip test (FR-31)

**Требование:** [FR-31](FR.md#fr-31)

**Rationale:** The NDJSON ingester (detectRunner / parseNdjson) must work against the REAL output of each runner, not a synthetic inline string that fakes the producer's envelope (the verify-against-real-artifact discipline). So the corpus ships three fixture dirs captured from actual runners — tests/fixtures/reqnroll-sample/ (.NET/Reqnroll), tests/fixtures/behave-sample/ (Python/behave), tests/fixtures/jvm-sample/ (Java/Cucumber-JVM) — each output.ndjson holding ≥1 PASSED + ≥1 FAILED, each with a README.md pinning the exact runner command+version for regeneration. tests/e2e/multilang-ingest-roundtrip.test.ts drives each: detectRunner → expected runner string; parseNdjson → ≥2 scenarios with a PASS and a FAIL; ingest into a synthetic fixture spec and assert get_trace scenarios[].lastResult + get_test_result agree per language.

**Trade-off:** real fixtures must be regenerated when a runner's Messages output changes (hence the README provenance) — heavier than hand-written NDJSON, but the only way to prove the ingester against the producer's true shape. Ships independently of FR-29/FR-30 (pure test infrastructure).

**Alternatives considered:**
- synthetic inline NDJSON strings — fast but fakes the producer; masked the worst-of-steps / Windows-path bugs the FR-32 corpus audit found.
- one TS-only fixture — leaves the multi-language claim (US-9) unproven; the runners differ in how they emit testStepResult.

=== USER_STORIES.md (append; FR.md `**User Story:** US-19` is stale — US-19 is cross-spec-resolve) ===

### User Story 31: The ingester is proven on real non-TS runner output (Priority: P2)

**Требование:** [FR-31](FR.md#fr-31)

As a maintainer of the NDJSON ingester, I want a committed fixture corpus of REAL Reqnroll/behave/Cucumber-JVM output plus a roundtrip test, so that detectRunner+parseNdjson are proven against each producer's true shape, not synthetic strings that fake it.

**Why:** Synthetic NDJSON fakes the envelope and hides cross-language bugs (worst-of-steps status collapse, path separators). Real captured fixtures + a roundtrip make the multi-language claim demonstrable.

**Independent Test:** For each of reqnroll-sample / behave-sample / jvm-sample: detectRunner returns the expected runner string; parseNdjson yields ≥2 scenarios with ≥1 PASSED and ≥1 FAILED; after ingest, get_trace scenarios[].lastResult and get_test_result agree.

**Acceptance Scenarios:**

Given the reqnroll-sample fixture
When detectRunner+parseNdjson run on it
Then the runner is 'reqnroll' and ≥2 scenarios with one PASSED and one FAILED are parsed

Given the behave-sample fixture ingested into a fixture spec
When get_trace and get_test_result are queried
Then the per-language statuses match

Given a fixture dir missing its README.md
When the corpus is validated
Then it errors loudly with an actionable hint

=== DESIGN.md (append a `### Decision:`) ===

### Decision: Task status is evidence-derived from the latest run, with a honesty gate (FR-32)

**Требование:** [FR-32](FR.md#fr-32)

**Rationale:** A hand-authored `Status: DONE` lies when the backing scenario is pending/undefined. So tools/spec-graph/coverage.ts derives each task's `verified_status` from the latest ingested run (.dev-pomogator/.last-test-run.ndjson): map the task to its scenarios via @featureN / SPECGEN004_NN refs and the FR refs[]; `DONE` only when EVERY mapped scenario is PASSED; any pending/undefined/ambiguous/failed caps it at IN_PROGRESS; no mapped scenario → fall back to the hand-set status flagged `unverified`. checkConformance emits TASK_STATUS_UNVERIFIED (WARNING) when a hand-set `Status: DONE` conflicts with `verified_status < DONE`, naming the offending scenario+bucket; spec-status.ts -Format task-table renders `verified_status`, so the summary cannot claim DONE without green scenarios. This codifies the 2026-06-02 coverage-audit discipline into the engine, removing the human as the enforcement point.

**Trade-off:** the derived status is only as good as scenario↔task mapping; an unmapped task stays `unverified` rather than blocking — visible, not enforced (TDD-first).

**Alternatives considered:**
- trust the hand-set Status: field — the false-green this FR exists to kill.
- block (ERROR) on any unverified task — would flip the corpus red on day one and teach escape-hatch gaming (the FR-44 advisory lesson); WARNING + render the derived status is the chosen surfacing.

=== USER_STORIES.md (append; FR.md `**User Story:** US-20` is stale — US-20 is the architect Path A/B/C story) ===

### User Story 32: A task can't claim DONE without green scenarios (Priority: P1)

**Требование:** [FR-32](FR.md#fr-32)

As a maintainer, I want each task's effective status derived from the latest test run instead of a hand-typed field, so that a task cannot read DONE while its BDD scenario is pending/undefined and I don't have to police it by hand.

**Why:** Status is set by free-text edit; 'done' can sit on a task whose scenario never passed. Deriving from the run + a honesty finding catches this mechanically.

**Independent Test:** A task whose mapped scenario is UNDEFINED reads verified_status IN_PROGRESS (never DONE), and a hand-set Status: DONE on it emits TASK_STATUS_UNVERIFIED naming the scenario; a task with all scenarios PASSED reads DONE.

**Acceptance Scenarios:**

Given a task mapped to scenarios that are all PASSED in the latest run
When verified_status is derived
Then it is DONE

Given a task hand-set Status: DONE whose mapped scenario is UNDEFINED
When conformance runs
Then it emits TASK_STATUS_UNVERIFIED naming the scenario and bucket

Given a task with no mapped scenarios
When verified_status is derived
Then it falls back to the hand-set status flagged unverified

=== DESIGN.md (append a `### Decision:`) ===

### Decision: Three-layer anchor-integrity guard keeps descriptive headings rename-safe (FR-34)

**Требование:** [FR-34](FR.md#fr-34)

**Rationale:** Marksman-standard descriptive headings (`## FR-N: Title`) derive their GLFM slug from the heading TEXT, so a rename silently orphans inbound `#anchor` links — the ONLY failure mode of the readable form. Three layers automate it (code: tools/anchor-integrity/): (34a detect) ONE shared marksmanSlug(text) in marksman-slug.mjs — measured against the real Marksman binary (lowercase, strip punctuation INCLUDING dots so AC-1.1→ac-11), consumed by both the graph parser and the validator and pinned by a golden fixture; check.mjs verifies EVERY same-file `[t](#a)` and cross-file `[t](f.md#a)` anchor, skipping links in fenced/inline code. (34b catch) anchor_check_post.ts (PostToolUse on *.md) injects a throttled system-reminder; anchor_gate_stop.ts (Stop-gate) blocks 'done' on a session-touched spec with broken anchors, escape `[skip-anchor-fix: <reason>]` logged to .claude/logs/. (34c fix) fix.mjs repairs id-bearing links deterministically (id → current heading → marksmanSlug → rewrite, idempotent); ambiguous prose links dispatch to claude-fallback.mjs in the background, never guess-rewritten when the headless path is unavailable.

**Trade-off:** the deterministic fixer only handles id-bearing links; ambiguous ones need a (background) LLM hop and stay flagged when claude is absent — correct over a wrong guess.

**Alternatives considered:**
- drop descriptive headings for bare `## FR-N` — kills IDE Ctrl+Click navigation (the value of the Marksman-standard form).
- a single deterministic fixer for all links — can't disambiguate prose links without an LLM; guessing would rewrite to the wrong heading.

=== USER_STORIES.md (append; FR.md `**User Story:** US-22` is stale — US-22 belongs to FR-37) ===

### User Story 34: Renaming a heading never silently breaks my spec links (Priority: P2)

**Требование:** [FR-34](FR.md#fr-34)

As a spec author who renames descriptive headings, I want broken inbound anchors detected at edit time and id-bearing links auto-fixed, so that I keep readable `## FR-N: Title` headings without links rotting after a rename.

**Why:** Descriptive headings derive their slug from the text, so a rename orphans every `#anchor` link to it; without a guard the rot is invisible until someone clicks a dead link.

**Independent Test:** anchor-integrity reports both same-file and cross-file broken anchors with the likely heading; marksmanSlug matches the Marksman golden fixture; a write that orphans an anchor fires a reminder + the Stop-gate (bounded escape); the deterministic fixer repairs an id-bearing link without an LLM and is idempotent; an ambiguous link is dispatched to claude in the background, never guess-rewritten.

**Acceptance Scenarios:**

Given a same-file and a cross-file broken anchor
When anchor-integrity runs
Then both are reported with the likely target heading

Given an id-bearing link with a stale anchor
When the deterministic fixer runs
Then it rewrites to the current slug and fix(fix(x))==fix(x)

Given an ambiguous prose link and no headless claude available
When the fixer runs
Then the link stays flagged and is never guess-rewritten

=== DESIGN.md (append a `### Decision:`) ===

### Decision: The honesty gate judges test QUALITY, not just PASS/FAIL (FR-35)

**Требование:** [FR-35](FR.md#fr-35)

**Rationale:** FR-32 derives verified_status from PASS/FAIL only, so a fake-positive GREEN test (mocked / trivial-assert) still marks a task DONE. FR-35 closes three holes: (35a) when a task's scenario is GREEN, the honesty derivation in tools/spec-graph/coverage.ts additionally requires a test-quality verdict from the strong-tests/spec-status test-body audit — WEAK or FAKE-POSITIVE-RISK caps verified_status at IN_PROGRESS and emits TASK_TEST_QUALITY naming task+verdict; STRONG leaves DONE intact (no false-block). (35b) a `test-quality` stage is added to the orchestrator feature-map (scripts/feature-map.ts WORKFLOW) between coverage and honesty-gate, routing to strong-tests+spec-status, AND a Stop/pre-DONE hook (claim-evidence-gate idiom) enforces it (escape `[skip-test-quality: <reason>]` logged); checkFeatureMapDrift FAILs if the stage is missing. (35c) checkConformance emits a finding when a task is DONE with ZERO linked scenarios, so 'mark done, write no test' is visible, not []. The producer joins per-test verdicts to the backing task worst-wins.

**Trade-off:** the quality verdict comes from an advisory auditor (strong-tests/spec-status) surfaced via a side-channel file the coverage reader consumes — keeps coverage.ts builtins-only (dep-safe for plugin users) at the cost of an extra producer step.

**Alternatives considered:**
- keep the gate PASS/FAIL-only — the fake-positive-marks-DONE hole this FR exists to close.
- leave strong-tests/spec-status advisory (not in hooks/feature-map) — measured this session: they then never run, so a worthless GREEN test wins.

=== USER_STORIES.md (append; FR.md `**User Story:** US-22` is stale — US-22 belongs to FR-37) ===

### User Story 35: A passing-but-worthless test can't mark a task DONE (Priority: P1)

**Требование:** [FR-35](FR.md#fr-35)

As a maintainer, I want the honesty gate to require a test-QUALITY verdict on top of GREEN, so that a mocked or trivial-assert test that passes cannot silently mark a task DONE and a task DONE with no test at all is surfaced.

**Why:** PASS/FAIL alone is gameable — a fake-positive GREEN reads DONE. A WEAK/FAKE-POSITIVE-RISK verdict must cap the status, the quality stage must be enforced (not advisory), and zero-linkage DONE must not be silent.

**Independent Test:** A task whose GREEN test is WEAK/FAKE-POSITIVE-RISK caps at IN_PROGRESS with TASK_TEST_QUALITY; a STRONG GREEN test stays DONE; the orchestrator feature-map carries an enforced test-quality stage (drift guard fails if missing); a DONE task with zero linked scenarios emits a finding.

**Acceptance Scenarios:**

Given a task whose linked scenario is GREEN but the test-body verdict is FAKE-POSITIVE-RISK
When verified_status is derived
Then it is capped below DONE and TASK_TEST_QUALITY is emitted

Given a task whose GREEN test verdict is STRONG
When verified_status is derived
Then DONE is left intact

Given a task marked DONE with zero linked scenarios
When conformance runs
Then a finding is emitted (not silent)

### Decision: 4-state legacy/drift triage, never auto-retire — reuse spec-reality-check, default DRIFTED (FR-43)

**Требование:** [FR-43](FR.md#fr-43)

**Rationale:** «Реализовано, но уже не актуально» — это не одно состояние, а ЧЕТЫРЕ с разными действиями (SUPERSEDED→archive+`supersedes`, REMOVED→archive/delete, DRIFTED→re-sync спеки, ABSORBED→redirect FR). Конфляция этих случаев и есть причина «непонятно как определять». Решающий сигнал — СУЩЕСТВОВАНИЕ реализации (переиспользуем skill `spec-reality-check` категория-15 reality-drift: FILE_CHANGES-пути + символы против диска), скрещённое с version-lineage по slug (FR-36) и not_run-by-feature (FR-32); git-staleness даём near-zero вес — стабильная законченная спека неотличима по давности от заброшенной. Дефолт «всё зарефакторено» = DRIFTED (re-sync), НЕ retire — иначе теряются ещё-в-силе требования. Реализовано в tools/specs-generator/legacy-triage.ts (классификатор) + legacy-judge.ts.

**Trade-off:** Триаж выдаёт лишь ПОДОЗРЕНИЕ + кандидатов; финальное состояние подтверждает человек явным маркером (`.progress.json status` или перенос в `.specs/archive/`). Авто-ретайр/авто-удаление запрещены — стоимость ложного ретайра (потеря живого требования) выше стоимости ручного подтверждения.

**Alternatives considered:**
- Новый отдельный движок staleness-детекции (rejected) — анти-паттерн «второй валидатор»; spec-reality-check уже считает reality-drift, дублировать незачем.
- git-staleness как главный сигнал (rejected) — давность коммита не отличает «заброшено» от «законченно и стабильно»; даёт ложные ретайры.
- Авто-ретайр на подозрении без HITL (rejected) — необратимо теряет ещё-в-силе FR при ложной тревоге; «решено один раз — guard не переспрашивает» сохраняет контроль у человека.

### Decision: Archive only on hard repo-proof — recount inside the door (TOCTOU), seal the archive (FR-45)

**Требование:** [FR-45](FR.md#fr-45)

**Rationale:** FR-43 даёт лишь подозрение; исполнение (перенос в `.specs/archive/`) должно действовать ТОЛЬКО на твёрдом пруфе, иначе ловим «наоборот ошибку» (архивируем ещё-живую спеку). Дверной тул `get_archival_proof(slug)` считает ЖИВЫЕ входящие ссылки — граф-рёбра из НЕ-архивных спек ПЛЮС prose/markdown-ссылки в `.specs/*` вне самой спеки — и даёт вердикт ARCHIVE / KEEP_FALSE_POSITIVE / SPEC_NOT_FOUND / ALREADY_ARCHIVED. `archive_spec` переносит ТОЛЬКО при отсутствии живых ссылок И сигнале FR-43 ∈ {SUPERSEDED,REMOVED,ABSORBED}. Реализовано: tools/spec-mcp-server/mutations.ts + tools.ts (door), tools/specs-generator/spec-archive.ts (agent-консьюмер: prune осиротевших тестов + отчёт-пруф). Доступ к спекам только через дверь (FR-39/40); git-операции напрямую, всё revert-able.

**Trade-off:** Ссылки пересчитываются ВНУТРИ `archive_spec` (защита TOCTOU) — двойной счёт (пруф + повторный счёт на записи), стоимость в обмен на отсутствие гонки между пруфом и действием. Архив запечатан (ARCHIVE_SEALED — запись под `.specs/archive/**` через дверь отвергается), поэтому правка архивной спеки требует ручного восстановления из git.

**Alternatives considered:**
- Авто-архив по сигналу FR-43 без пруфа ссылок (rejected) — dogfood 24 кандидата дал бы ложные архивации; 19 спасены именно тем, что ещё-ссылаемы.
- Пруф без пересчёта в момент записи (rejected) — TOCTOU-окно: ссылка появляется между get_archival_proof и archive_spec, архивируем живую спеку.
- Удалять осиротевшие тесты автоматически без эскалации неоднозначных (rejected) — общий тест (покрывает не только архивируемую спеку) удалять нельзя; spec-archive эскалирует NEEDS_HUMAN.

### Decision: Task↔own-scenario is a DECLARED link enforced in conformance, DONE-only, staged detect→gate (FR-46)

**Требование:** [FR-46](FR.md#fr-46)

**Rationale:** Сейчас задача связывается со сценарием лишь через `refs: FR-N` → ко ВСЕМ `@featureN` (`mapTasksToScenarios`), свой конкретный сценарий не требуется — «готово» можно поставить, ридуя на тесты всего требования, и дрейф «готово-vs-не-построено» неотличим (read-only проба: 0/26 v4-задач цитируют свой `specgen004_NN`). Правило живёт в ОДНОМ месте — `conformance.ts` (его прогоняют дверь apply_spec_change, spec-conformance-guard, conformance_check, verdict, census): новое `TASK_NO_OWN_SCENARIO` + существующее `TASK_STATUS_UNVERIFIED` гейтят DONE на «цитирует свой `specgen004_NN` И он PASSED». Связь нужна к DONE, не к созданию (TDD: тест пишется ПОСЛЕ задачи). get_trace отдаёт task→own_scenario + результат. Реализовано в tools/spec-graph/conformance.ts + fr-census.ts.

**Trade-off:** Правило вводится ПОЭТАПНО (WARNING → ретрофит → ERROR), иначе ERROR заклинит дверь на предсуществующих нарушителях (вердикт: 129 warning). Допустимая альтернатива — дверь error-ит только на нарушении, ВВЕДЁННОМ этой записью (delta old→new), не на предсуществующих. Стоимость: окно, в котором новый долг этого класса ещё может копиться до промоута.

**Alternatives considered:**
- Оставить связь только через `refs: FR-N` ко всем @featureN (rejected) — ровно текущая дыра: «готово» ставится на тестах всего требования, свой сценарий не доказан.
- Сразу ERROR без стадии WARNING (rejected) — заклинит дверь на 0/26 предсуществующих, учит геймить escape-hatch (урок H1/scope-gate).
- Требовать связь к СОЗДАНИЮ задачи (rejected) — ломает TDD red-first: сценарий пишется после задачи; связь нужна к DONE.

### Decision: Design/story/research are graph nodes with declared edges, not a body text-scan — completeness via webComplete AND (FR-47)

**Требование:** [FR-47](FR.md#fr-47)

**Rationale:** FR-44 ловит обратные дыры эвристикой по тексту тела; owner: «текст-скан = костыль, чинить перестройкой графа». FR-47 делает паутину НАСТОЯЩЕЙ: Decision/Story/Research моделируются узлами с реальным ребром `covers` FR→узел, построенным ТОЛЬКО из явной строки `**Требование:** [FR-N]` в блоке `### Decision:`/`### User Story:` (НЕ из упоминания FR в Rationale/прозе) — иначе случайный `FR-1` в тексте подделал бы ребро. conformance даёт `FR_NO_DESIGN` (зеркально `FR_NO_RESEARCH`); fr-census даёт единый вердикт «полнота требования» через `webComplete` AND-агрегацию (ВСЕ ноги: AC+сценарий+задача+ресерч+дизайн+история — не ЛЮБАЯ, per rollup-completeness-all-not-any). get_trace surface-ит все ноги в обе стороны. Страж `design-decision-guard` требует строку `**Требование:**`, иначе ребро не построить. Реализовано: tools/spec-graph/parsers/md.ts (parser+builder), conformance.ts, fr-census.ts, upstream-trace.ts/research-trace.ts.

**Trade-off:** Узлы вместо текст-скана требуют формат-стража и `**Требование:**`-строки в КАЖДОМ блоке (авторская стоимость; ровно те 13 unit'ов, что этот аудит чинит). Поэтапно detect→retrofit→gate (как FR-46c), дельта-скоуп — не клинить дверь на предсуществующих незаполненных ногах.

**Alternatives considered:**
- Оставить текст-скан FR-44 (rejected) — owner назвал костылём; случайное упоминание FR в прозе подделывает связь, нет настоящего ребра для прыжка в обе стороны.
- Строить ребро из ЛЮБОГО упоминания FR в блоке (rejected) — `FR-1` в Alternatives выковал бы ложный covers; только явная `**Требование:**`-строка = декларированная связь.
- webComplete как ЛЮБАЯ нога (OR) (rejected) — false-green: одна нога зеленит требование; нужна AND по всем ногам (rollup-completeness-all-not-any).

## Decision: FR-17 consistency-report carries a computed summary roll-up block
**Требование:** [FR-17](FR.md#fr-17)

**Rationale:** A scannable, top-level `summary` (by_severity/by_class/by_namespace/totals + top_3_recommendations) lets a reader triage a consistency-report without parsing every finding; counts are computed in `yaml-writer.ts::emitSummary` from the findings plus the `specsCompared`/`implPathsChecked` totals tracked in `reconcileLight`.
**Trade-off:** Adds a hand-emitted block to the fixed-shape YAML (still no YAML dep) and one counter in `findMissingFileReferences`; in exchange the report is self-summarising and diff-friendly.
**Alternatives considered:**
- A separate `summary.yaml` file — rejected: splits the report, breaks the one-file-per-spec contract.
- Post-hoc computation by every consumer — rejected: duplicates the bucketing logic the emitter already owns.

## Decision: FR-18 cross-spec-resolve gates every fix behind an explicit confirm-before-edit
**Требование:** [FR-18](FR.md#fr-18)

**Rationale:** Auto-applying fixes to a consistency-report's findings risks silent wrong edits; `cross-spec-resolve` emits a 5-field explanation per finding and requires an explicit Apply confirmation before any Edit/Write, with a separate banner for foreign-spec edits and an append-only override audit log.
**Trade-off:** More prompts per resolution run; in exchange every mutation is reviewed and auditable.
**Alternatives considered:**
- Batch auto-fix all findings — rejected: silent wrong edits with no review surface.
- Read-only report with no resolve path — rejected: leaves the user to hand-apply every fix.

## Decision: FR-56 scenario overlay trace keeps compact result rows linked to archived Cucumber chunks
**Требование:** [FR-56](FR.md#fr-56)

**Rationale:** FR-56 keeps the durable full-run snapshot intact but adds an append-only per-scenario overlay, so every filtered or explicit-config BDD run can refresh one scenario without clobbering canonical coverage. A compact overlay row is intentionally small (`scenario_id`, result, time, run/source, trace pointer); the detailed failure evidence stays in the archived Cucumber message chunk and is fetched only on demand through the graph/MCP trace path. This preserves fast prompt-time coverage checks while still letting an agent answer "where did this scenario fail?" without grepping raw logs.

**Trade-off:** The overlay reader must tolerate missing/expired trace chunks because history rotation may delete old run files. FR-56 chooses soft degradation in `get_scenario_trace` over pinning every chunk forever: current coverage remains readable, and the trace tool tells the user to rerun when the runtime chunk has expired.

**Alternatives considered:**
- Make filtered runs overwrite `.last-test-run.ndjson` — rejected: a partial run would erase full-suite truth for unrelated scenarios.
- Store full failure payloads in `.scenario-results.ndjson` — rejected: the prompt-time overlay scan would grow with logs and stack traces.
- Fail hard when a trace chunk is missing — rejected: stale runtime history should not break coverage/status; it should request a rerun.

## Decision: FR-59 caps only the Claude-facing reminder, not the durable log
**Требование:** [FR-59](FR.md#fr-59)

**Rationale:** The conformance push has two consumers with opposite size needs. The audit/debug consumer needs the full finding set in `.dev-pomogator/.spec-check-log/*.jsonl`; the Claude context consumer needs a short reminder. Therefore the producer keeps `appendFindings(...)` complete and applies a byte budget only inside the reminder formatter used by `decidePush`. The formatter emits counts first, then bounded sample findings, then an omitted count and the full-log pointer. The byte budget is enforced after UTF-8 encoding so long messages cannot bypass it. Prompt-time status banners keep their existing summary-only shape and get a regression cap so repeated prompts do not accumulate into the same class of context bloat.
**Trade-off:** Claude sees fewer individual findings in the immediate reminder; in exchange the session remains usable and the complete list remains available through the log and `/spec-status`.
**Alternatives considered:**
- Stop writing the conformance findings entirely — rejected: destroys auditability and violates FR-15's durable record.
- Rely on Claude Code's persisted-output preview — rejected: the transcript still stores raw hook stdout, which was the observed bloat.
- Cap by line count only — rejected: one very long finding message can still exceed the byte budget.

## Decision: Readiness is a lane-based product contract, not a single structural GREEN
**Требование:** [FR-61](FR.md#fr-61)

**Rationale:** The CARL dogfood incident proved that the graph already held enough facts, but different surfaces named them differently: `TASKS.md` said DONE, canonical coverage said `not_run`, `spec-verdict` printed plain GREEN, `get_spec_status` used traceability-looking `UNCOVERED_FR` language for execution absence, and a filtered Docker run passed without changing canonical coverage. FR-61 composes those facts into lanes (`STRUCTURE`, `TRACEABILITY`, `EXECUTION`, `TASK_TRUTH`, `BDD_SYNC`, `SEMANTIC`, `FILTERED_PROOF`) and reserves the final readiness label for the AND of all blocking lanes. The old structural/audit success remains visible, but it can no longer launder execution or task-truth debt into a product-readable GREEN.
**Trade-off:** Users will see more explicit debt even when the structural graph is clean. That is intentional: it separates "the spec is well-formed" from "the work is ready" and makes the next action mechanical.
**Alternatives considered:**
- Keep `VERDICT: GREEN` and rely on warning text — rejected: real sessions read the final label as readiness and missed `DONE-but-unverified` debt.
- Make filtered Docker runs update canonical coverage — rejected: filtered runs are clobber-safe proof, not a full-suite replacement.
- Put the fix only in `TASKS.md` guards — rejected: task truth, BDD sync, filtered evidence, and status vocabulary must agree across MCP/status/verdict/census.

## Decision: MCP mutations are anchor-aware transactions, not a string-replacement protocol (FR-60)

**Требование:** [FR-60](FR.md#fr-60)

**Rationale:** The public MCP door in `tools/spec-mcp-server/mutations.ts` and `tools/spec-mcp-server/tools.ts` exposes section/anchor operations rather than forcing every caller to recreate version control around exact `old_string`. `read_for_edit` returns heading and section tokens, section SHA, lines, EOL, and indentation. `append_to_section`, `insert_after_heading`, and `insert_at_eof` preserve document EOL and indentation. EOL-tolerant replacement normalizes only during matching and reports distinct normalized-EOL, changed-anchor-body, whitespace-only, multiple-match, and missing-anchor remediation.

A proposal has anchors, preview, graph IDs, validation findings, resulting SHAs, and a short-lived `proposal_id`. `apply_proposed_patch` is one-shot and idempotent: replay returns its recorded outcome. CAS auto-rebase is allowed only inside TTL while the anchor and every precondition still hold; otherwise it refuses with fresh anchor context. Multi-document staging validates every document and edge before an all-or-none commit, writes one audit event, cleans staging state, and provides recovery helpers for interrupted transactions.

Helpers (`add_backlog_task`, `add_phase`, `amend_requirement`, `add_acceptance_criterion`, `register_incident_backlog`) render canonical markdown, allocate unique IDs, and maintain FR/AC/task/file-change traceability. They cannot create an executable `.feature` scenario without matching step-definition work; `add_acceptance_pin` and TASKS-only are explicit alternatives.

**Trade-off:** Proposal, TTL, staging, and recovery state cost more than `str_replace`; partial multi-document writes and silently retargeted rebases are worse.

### Decision: FR-62 establishes project root without trusting stdin or collapsed CWD

**Требование:** [FR-62](FR.md#fr-62)

**Rationale:** Root resolution precedes readiness and release-inventory construction. Production code currently has two distinct inputs: `tools/specs-generator/specs-generator-core.mjs:252-258` resolves `SPECS_GENERATOR_ROOT` or `findRepoRoot(SCRIPT_DIR)`, while `tools/specs-generator/spec-status.ts:9-13` launches the installed script with `cwd: process.cwd()` and inherited stdio. The planned shared resolver must choose, in order, validated `SPECS_GENERATOR_ROOT`, validated caller/project CWD, then `findRepoRoot(SCRIPT_DIR)`; it records `stdin_mode` and a bounded timeout without treating stdin as root input, and must not describe the current `spec-status.ts` behavior as already inherited. Each canonical candidate must identify the selected repository/worktree and its tracked-file inventory before readiness consumes it.

Stdin is independent: absent, closed, non-interactive (`!isTTY`), malformed, or ignored stdin neither selects root nor hangs. A confirmation path is allowed only for an interactive TTY and has a bounded timeout; stdin never supplies a root. Windows-hosted-to-WSL installed-plugin proof exercises the selected caller project. When caller CWD is absent or ambiguous, SCRIPT_DIR fallback applies only after candidate validation. UNC and collapsed Windows CWD (including `C:\Windows`) are rejected when not the selected worktree. The resolver returns `NOT_READY` with candidate source, canonical identity, rejection, and next action rather than report a plugin cache or another checkout.

**Trade-off:** Ambiguous shells can yield NOT_READY. A wrong-target inventory is worse than refusal.

**Alternatives considered:**
- Prefer `process.cwd()` unconditionally (rejected) — UNC/collapse and cross-host launches can select `C:\Windows` or an unrelated directory.
- Prefer `SCRIPT_DIR` unconditionally (rejected) — an installed plugin cache is not the caller's target project.
- Accept root from stdin (rejected) — closed/piped stdin makes automation nondeterministic and can hang.

### Decision: FR-63 exposes one graph-and-evidence readiness model through MCP and verdict

**Требование:** [FR-63](FR.md#fr-63)

**Rationale:** `spec-status`, MCP `get_spec_status`, `conformance_check`, and `spec-verdict` must consume a shared canonical graph/evidence adapter and normalized readiness model; presentation layers adapt that model but do not reclassify it. Current defects are explicit: `precheck.ts:64-72` discovers FILE_CHANGES test evidence with a regex, `precheck.ts:82` has no canonical-ID deduplication, and `precheck.ts:109` considers only `.test-status`. The planned adapter creates one unique inventory keyed by canonical IDs for graph-derived FR, AC, scenario, task, and FILE_CHANGES nodes, then attaches provenance-rich evidence (source, graph snapshot, runtime root, timestamp, recency, full-or-filtered run scope, and next action) while retaining PASSED, FAILED, PENDING, UNDEFINED, AMBIGUOUS, and NOT_RUN. `audit-spec` and task-census consume the same canonical inventory for structural and task-truth reporting; they do not make a second readiness classifier.

The FR-61 lane classifier is the sole readiness reducer. Blocking lanes combine with AND and emit stable YAML/JSON plus individual lane results. `precheck` derives FILE_CHANGES identity from the graph, never from a test-file regex; `.dev-pomogator/.test-status` is only one execution-evidence source, not identity or readiness authority. Structural success cannot launder missing execution, unverified tasks, mock-only evidence, or absent distributed-runtime proof into GREEN; missing, stale, source-tree-only, or mock-only mandatory evidence is NOT_READY.

**Trade-off:** A shared adapter and provenance model cost more than independent parsing, but prevent divergent green labels and make readiness reproducible.

**Alternatives considered:**
- Keep separate precheck, MCP, and verdict implementations (rejected) — their inventory and reducer rules will drift.
- Parse human-oriented command output for evidence (rejected) — presentation text is not a stable canonical model.
- Treat status YAML or `.test-status` as graph truth (rejected) — execution artifacts cannot prove traceability, deduplicate nodes, or detect malformed edges.

### Decision: FR-64 gates publication on a complete, releasable inventory

**Требование:** [FR-64](FR.md#fr-64)

**Rationale:** A release manifest records graph IDs/edges for FR, story, use case, AC, scenario, task, and FILE_CHANGES. The canonical inventory classifies every candidate input as source, spec-test, declared generated/release artifact, temporary, smoke, unclassified, or silent; the status, verdict, MCP, audit-spec, and task-census views render that one classification rather than reconstruct it. Temporary output is removed before the pre-inventory and again after a failed gate; an unexpected or undeclared file is a failure, not a cleanup suggestion. Malformed IDs, dangling edges, missing story/use-case coverage, and prose-only references fail conformance. Completeness is an all-unit AND roll-up, so no passed subset greens pending, undefined, failed, ambiguous, or not-run siblings. Pre/post tracked-file inventories are checked against the manifest to reject undeclared, untracked, or missing paths.

The gate runs a clean-candidate Docker full suite before and after packaging, including installed-runtime and dependency-absent smoke execution. Filtered proof is diagnostic only and never release authority. It records actual/planned SHA, selected root, graph snapshot, manifest sections, test evidence, dependency-absent result, and actual dirty-tree state. Publication is transactional: validate manifest and clean candidate; produce and verify the package; publish artifact; create/verify the tag and one PR/release record; then publish documentation and monitoring metadata. If any later publication step fails, rollback removes or revokes the newly published artifact/tag when supported, restores the prior published artifact/tag, removes temporary output, and records the recovery against the same manifest/snapshot. Owner, monitoring signal, rollback trigger, and follow-up are mandatory before publication.

**Trade-off:** Pre/post Docker suites, dependency-absent smoke, temporary-file hygiene, and transactional release checks take longer and block on dirty-tree or documentation debt; a source-only package is not releasable.

**Alternatives considered:**
- Release on graph-green alone (rejected) — graph completeness does not prove packaging, runtime, or source conservation.
- Treat filtered tests as release proof (rejected) — a selected subset cannot establish full-suite readiness.
- Run a suite from a dirty candidate (rejected) — temporary or unrelated files can create false evidence.

### Decision: One deterministic acceptance-delivery classifier feeds generation and review

**Требование:** [FR-65](FR.md#fr-65)

**Rationale:** A pure text-driven analyzer parses AC sections, classifies generic public-contract/version/input/redaction/paid/deploy triggers, and emits required delivery lanes keyed by AC id. TASKS mapping is explicit at AC granularity. `audit-spec` converts missing lanes or unresolved blocking investigations into ERROR findings consumed by `spec-verdict`; `task-board-forms` and `create-spec` use the same lane vocabulary when authoring tasks, while `spec-review` treats the deterministic finding as P0 instead of re-inventing semantic matching.

The analyzer remains project-agnostic: it never hardcodes marketplace field names. The #140 paid-SPA fixture supplies real failure categories (root vs prefixed API, HTML infrastructure 404 vs JSON 401/402, registry and slug/settlement mapping, semantic readback) as a regression corpus, not production-specific logic.

**Trade-off:** Text heuristics are intentionally narrow and require explicit AC references in tasks. This can surface a blocking investigation for ambiguous prose, which is safer than silently declaring delivery coverage.

**Alternatives considered:**
- Prompt-only checklist (rejected: reviewer drift).
- Project-specific field dictionary (rejected: non-generic).
- FR-only task mapping (rejected: one broad task can hide several acceptance claims).


### Decision: One exhaustive endpoint schema validates every edge path

**Требование:** [FR-67](FR.md#fr-67)

**Rationale:** `tools/spec-graph/edge-schema.ts` owns `EndpointRule`, exhaustive `EDGE_SCHEMA`, stable `EndpointViolation`, and graph-wide validation. Parser slices remain declarative and are validated after full ingest and composite-id resolution so sibling-file targets do not create false errors. Builder and incremental generated edges use the same helper. Invalid edges remain visible for diagnosis; conformance emits error `ENDPOINT_VIOLATION`, allowing the existing fully staged MCP before/after gate to reject only newly introduced violations before writing. SQLite restore runs the same validation so a warm cache cannot bypass the contract. Synthetic result and trace targets are represented explicitly without adding another persisted `NodeType`.

**Trade-off:** A graph-wide O(E) pass runs at build and restore time, but it is deterministic, independent of parser order, and reports the full violation set instead of silently dropping data.

**Alternatives considered:**
- Validate independently inside each parser (rejected: sibling-file ordering and rule drift).
- Drop invalid edges (rejected: false-green graph and no repair evidence).
- Validate only MCP mutations (rejected: builder, incremental, and SQLite paths would bypass the contract).



## Completion evidence hardening (FR-68..FR-71)

### Decision: Separate mandatory AC and NFR readiness lanes

**Требование:** FR-68, FR-69

**Rationale:** AC and NFR failure classes need different diagnostics and remediation: an AC requires criterion-specific behavioral proof, while an NFR may use test, analysis, review, inspection or demonstration. `AC_SATISFACTION` and `NFR_SATISFACTION` remain separate mandatory lanes and each uses non-empty ALL, so one complete member cannot hide an open sibling. Parent-FR scenarios remain discoverable as inherited context but never become own AC evidence.

**Trade-off:** Two lanes increase surface/API cardinality and retrofit work; the benefit is an actionable first blocking lane instead of an opaque aggregate.

**Alternatives considered:**
- Keep both under `TRACEABILITY`: rejected because structural green can mask missing execution evidence.
- Reuse `EXECUTION` alone: rejected because it has no criterion-level or NFR-method accounting.


### Decision: Evidence is a first-class content-addressed graph node

**Требование:** FR-70

**Rationale:** An attachment path is mutable and currently disconnected from verdict truth. A first-class `Evidence` node gives the existing edge schema, endpoint validator, SQLite persistence and MCP query surfaces one shared identity. The node identity derives from canonical spec scope plus artifact `sha256`; `evidenced-by` is a typed edge from FR/NFR/AC/Scenario to Evidence. The manifest adapts provenance fields supported by SLSA/in-toto (subject digest, producer/builder identity, invocation identity and timestamps) without claiming that demonstration video is itself a SLSA build artifact.

**Trade-off:** Graph and SQLite schemas gain a node/edge type and artifact I/O; the benefit is immutable review identity and graph-native diagnosis.

**Alternatives considered:**
- Keep evidence inside free-form FR metadata: rejected because it cannot deduplicate exact bytes or validate graph endpoints.
- Identify evidence by path only: rejected because replacing bytes at the same path would retain stale approval.


### Decision: Operational-proof presence is derived and fail-closed

**Требование:** FR-70

**Rationale:** Existing delivery evaluation accepts hand-authored `state: PRESENT` before inspecting anything and checks evidence references only for node existence. For `operational-proof`, explicit PRESENT is invalid. The evaluator derives PRESENT only after path confinement, regular/non-empty file check, finalized recording, SHA-256 match, subject-revision freshness and successful target-state evaluation. `verificationMethod: demonstration|inspection` implies a required operational-proof demand unless a justified not-applicable record is explicit.

**Trade-off:** Missing storage or an unavailable probe blocks required completion; optional proof remains non-blocking and every failure carries a retry action.

**Alternatives considered:**
- Fail open when artifact inspection is unavailable: rejected because it recreates the target false-green.
- Trust an explicit `PRESENT` plus rationale: rejected because metadata would self-attest the fact it is meant to prove.


### Decision: Demonstration judgment is independent and digest-bound

**Требование:** FR-71

**Rationale:** Integrity proves which bytes were reviewed, not that those bytes satisfy an acceptance claim. The producer finalizes the artifact; a separate `spec-llm-judge` invocation reviews that exact digest and emits per-criterion `CONFIRMED|DENIED` observations with timestamps. Distinct auditable identities are mandatory. Equal/missing identities classify the verdict as `self-attested`, which is retained for audit but cannot satisfy required proof. Any required DENIED, incomplete review, digest mismatch or judge unavailability keeps the demand incomplete.

**Trade-off:** Independent review costs an extra model invocation and can block on judge availability; the benefit is separation of production from acceptance.

**Alternatives considered:**
- Require human-only approval: rejected because every demonstration would become a mandatory owner handoff.
- Let the producer self-review: rejected because the resulting evidence is not independent.


### Decision: Retrofit first and enable the corpus-wide hard gate last

**Требование:** FR-68, FR-69

**Rationale:** A measured current graph contains 811 ACs (803 without own scenario evidence) and 58 NFRs (58 without own evidence), which would yield 869 immediate blocking findings across 63 specs. The owner's policy remains error everywhere, not warning-on-legacy. Phase 44 therefore retrofits each spec first and switches the hard codes/mandatory lanes on only after the debt reaches zero. Bulk tag copying is not retrofit evidence and is blocked by `TAG_BULK_SUSPECT` unless distinct assertions prove each criterion.

**Trade-off:** Delivery is longer and requires semantic review of existing scenarios; the benefit is a hard gate without a permanently red main branch.

**Alternatives considered:**
- Enable the hard gate before retrofit: rejected because it leaves the whole corpus blocked during migration.
- Keep warnings on legacy forever: rejected because false completion remains possible.
- Mechanically copy tags: rejected because it launders parent-FR coverage into criterion proof.



### Decision: NFRs use method-aware evidence on their own mandatory lane

**Требование:** [FR-69](FR.md#fr-69)

**Rationale:** NFRs need the same fail-closed completion contract as FRs but may be verified by test, analysis, review, inspection or demonstration. `NFR_SATISFACTION` therefore evaluates each required NFR's declared method and evidence instead of forcing every NFR through a Cucumber-only route.

**Trade-off:** Method-aware adapters add evaluator branches; the benefit is evidence that matches the requirement rather than a meaningless green test.

**Alternatives considered:**
- Treat every NFR as an integration test: rejected because review, analysis and demonstration obligations cannot be represented honestly.
- Keep NFRs advisory: rejected because the requested completion contract requires them to block false-green delivery.



### Decision: Canonical task model is the source of every task view

**Требование:** [FR-72](FR.md#fr-72)

**Rationale:** One parser/model/renderer prevents Markdown, graph, MCP, lifecycle, census, and summary from diverging while strict TASKS.md remains the human projection during migration.

**Trade-off:** Compatibility parsing adds migration work but prevents silent loss and status drift.

**Alternatives considered:**
- Keep a parser per consumer: rejected because READY and revision could diverge.
- Replace TASKS.md immediately: rejected because it removes the current reviewed human source.

### Decision: Dependencies are a typed causal DAG

**Требование:** [FR-73](FR.md#fr-73)

**Rationale:** First-class dependency edges, reasons, cycle checks, and reverse blockers make readiness computable rather than inferred from prose.

**Trade-off:** Authors must supply structured targets and reasons, but blockers become actionable.

**Alternatives considered:**
- Retain prose-only ordering: rejected because no validator or planner can safely execute it.
- Infer dependency from conflicts: rejected because resource risk is not causal completion.

### Decision: Execution surfaces are typed claims reconciled with actual work

**Требование:** [FR-74](FR.md#fr-74)

**Rationale:** Typed resource kind, access, locator/scope, and rationale describe file and semantic blast radius before execution; repository-root confinement applies Unicode/case normalization, realpath symlink/junction resolution, absolute/UNC and traversal rejection, bounded glob expansion, and secret redaction. Reconciliation makes incorrect declarations visible afterward without executing locator text.

**Trade-off:** Authoring is more structured and reconciliation can emit advisory variance, but planned parallelism becomes explainable.

**Alternatives considered:**
- Infer surfaces only from a final diff: rejected because it cannot prevent unsafe parallel work.
- Use file paths only: rejected because contracts and schemas span files.

### Decision: Conflict graph is derived and remains separate from dependencies

**Требование:** [FR-75](FR.md#fr-75)

**Rationale:** Conflict represents temporary concurrency risk, not a causal edge. A separate derived graph retains explanations, supports scoped expiring override, and partitions waves without falsifying the DAG.

**Trade-off:** Planner evaluates two graphs, but avoids fake ordering and distorted critical paths.

**Alternatives considered:**
- Convert conflicts to depends-on: rejected because it creates fake causality.
- Ignore semantic conflicts across files: rejected because shared contracts still collide.

### Decision: Plan deterministically with topological waves and weighted paths

**Требование:** [FR-76](FR.md#fr-76)

**Rationale:** Topological waves, conflict-free batches, stable tie-breaks, and weighted longest-path metrics produce reproducible scheduling explanations.

**Trade-off:** The system chooses explainable bounded scheduling over global optimum search.

**Alternatives considered:**
- Nondeterministic worker queue: rejected because equal input produces review noise.
- Global optimal scheduler: rejected because complexity and opacity exceed the contract.

### Decision: Evidence fingerprint invalidation preserves history

**Требование:** [FR-77](FR.md#fr-77)

**Rationale:** Input fingerprints/digests derive stale closure when proof prerequisites change; historical proof remains auditable while current completion fails closed.

**Trade-off:** Storage and invalidation traversal increase, but recovery has an exact stale reason.

**Alternatives considered:**
- Delete old evidence: rejected because audit history disappears.
- Use timestamps alone: rejected because they do not prove consumed bytes or definitions.

### Decision: Discovery emits reviewed bounded patches

**Требование:** [FR-78](FR.md#fr-78)

**Rationale:** Stable child IDs, budgets, output-digest dedupe, normal validation, and high-impact approval allow discovery without autonomous unbounded graph mutation.

**Trade-off:** Some discoveries await approval, but replay and failure cannot corrupt task truth.

**Alternatives considered:**
- Mutate graph directly: rejected because replay/failure can corrupt planning state.
- Ban discovery: rejected because unknown work remains untracked prose.

### Decision: Roll out typed planning from observe through enforce

**Требование:** [FR-79](FR.md#fr-79)

**Rationale:** Observe measures debt, warn guides migration, and enforce blocks unresolved records while preserved counts prove no silent loss.

**Trade-off:** Compatibility code is temporary overhead but avoids abrupt breakage and fake migration success.

**Alternatives considered:**
- Enforce immediately: rejected because current source becomes unusable before verified migration.
- Warn forever: rejected because unsafe prose-only state remains implicitly executable.




**Алгоритмический владелец:** [TASK_PLANNING_PRIOR_ART.md](TASK_PLANNING_PRIOR_ART.md#4-алгоритмы-первого-инкремента) владеет алгоритмами Phase 45: DAG/циклы, surfaces/conflicts, waves/slack, fingerprints/evidence, bounded discovery и JSON read model. Этот DESIGN сохраняет product decisions и связи с FR.


### Task-planning prior art

The execution-aware task-planning design is grounded in [TASK_PLANNING_PRIOR_ART.md](TASK_PLANNING_PRIOR_ART.md#45-safe-parallel-waves-и-batches), including the frontier-aware wave algorithm, conflict batching, evidence invalidation, migration constraints, and direct-adoption licensing boundaries. Implementation must follow its [research snapshot and link-stability note](TASK_PLANNING_PRIOR_ART.md#research-snapshot-and-link-stability).


### Decision: Synthesize one canonical task graph before scheduling

**Требование:** [FR-80](FR.md#fr-80)

**Rationale:** FR-72..FR-79 operate on canonical records, dependencies, surfaces, evidence, and readiness. Deriving those records after scheduling would let separate planner state drift from the SpecGraph and would obscure whether an acceptance claim has an owner. A pure deterministic synthesis pass therefore reads normalized FR/AC/DESIGN/BDD inputs plus inspected repository reality and writes the resulting `task/v1` nodes and typed edges into the existing stored SpecGraph once; scheduling reads those exact nodes and edges rather than building another graph.

**Trade-off:** Synthesis must model incomplete repository knowledge explicitly and may block planning earlier. This is preferable to allowing a scheduler to infer an implementation surface or complete an acceptance lane without evidence.

**Alternatives considered:**
- Synthesize a planner-private graph: rejected because reconciliation with the SpecGraph would create an additional drift and loss path.
- Always model a DDD aggregate: rejected because infrastructure and integration work may have no domain boundary, and invented entities are false evidence.
- Defer task construction until wave selection: rejected because waves would be selected before acceptance-lane ownership and evidence are known.

### Algorithm: Deterministic synthesis precedes FR-72..FR-79 wave planning

**Требование:** [FR-80](FR.md#fr-80)

1. Normalize and stable-sort applicable FR, AC, DESIGN decisions, tagged BDD scenarios, and inspected repository surfaces; use their durable IDs as synthesis keys.
2. Classify each verified implementation area as `domainMode: ddd` only when a repository-supported domain boundary exists; then capture boundary, aggregate, invariant, and contract. Otherwise classify it as `domainMode: none` and capture only module, adapter, and contract boundaries.
3. Create one acceptance lane for each applicable AC, with a vertical BDD slice that owns the FR, AC, scenario, and evidence; record causal `RED -> GREEN -> REFACTOR` typed edges within that slice only.
4. For every lane, emit one or more canonical `task/v1` records with measurable `doneWhen`, estimate, requirement/AC references, typed dependency edges, and read/write/exclusive surfaces. A missing implementation surface becomes a `BLOCKED` investigation record that retains its lane and prevents finalization.
5. Validate source-claim and acceptance-lane conservation, uniqueness, causal order, and stable-key output. Any discrepancy is a named deterministic finding, never an implicit drop or duplicate.
6. Persist synthesized nodes and edges in the existing SpecGraph. Only after this succeeds may FR-72..FR-79 consume the same graph for lifecycle validation, conflict analysis, impact, waves, scheduling, and rollout; no secondary planning graph is constructed.



## FR-80 canonical agent-execution-plan projection

`task-synthesis.ts` receives `TaskSynthesisInput { approvedDesignRevision: { id, digest, approvalEvidence }, responsibilityMap: ComponentResponsibility[] }` in addition to the canonical FR/AC/DESIGN/BDD/repository-reality inputs. A responsibility item records the owning component, repository-relative file/source range, interface contract, and `domainMode`; DDD aggregates and invariants are accepted only when repository evidence establishes them, otherwise `domainMode: none` retains module/adapter/contract ownership without fabrication.

The synthesis result stores one canonical `TaskNode` per independently valuable AC/BDD vertical outcome. `executionSteps: ExecutionStep[]` are ordered, 2–5-minute RED/GREEN/REFACTOR actions nested in that node rather than graph nodes. This prevents micro-step DAG explosion while preserving the executable route to a measurable `doneWhen`.

Before `task-planner.ts` reads nodes, `reviewTaskSynthesis()` deterministically stable-sorts and rejects named findings for: placeholders; acceptance-lane conservation failure; missing boundary or responsibility owner; absent exact file/source range or interface; infeasible task; untyped or cyclic causal order; and incomplete read/write/exclusive surfaces. The review uses no LLM decision and is a prerequisite, not an advisory report.

`TaskPlanResult` is a read-only projection of stored SpecGraph nodes and edges. Each `TaskBrief` carries `fullTaskText`, `files` with exact source ranges, `interfaces`, typed `dependencies`, relevant `predecessorSummaries`, `scenario`, `evidenceCommand`, `blockers`, `safeBatchId`, `independenceProof`, and `nextAction`. It is sufficient for an AI agent or spec-generator worker to begin work without consulting a second plan directory. The plan neither persists a `.superpowers/sdd`-like store nor executes work.

`ExecutionOutcome` is `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`. The lifecycle accepts completion only for `DONE` with the task-owned evidence required by FR-77. The other variants retain their evidence, emit diagnostics, and create canonical follow-up proposals without falsely closing the parent task.

A `SafeBatch` contains an `independenceProof` for every member pair: graph reachability must be absent in both directions and `task-conflicts.ts` must derive no conflict pair. Planner prose is descriptive only and cannot establish parallel safety. Typed BDD-only causal edges keep `RED -> GREEN -> REFACTOR`; conditional DDD never weakens that order.


### Decision: Claude Code canonical host; Cursor second client via official compat + MCP path glue

**Требование:** [FR-81](FR.md#fr-81)

**Rationale:** Cursor natively loads `.claude/skills/` and (with Third-party toggle) `.claude/settings.json` hooks, including Claude deny JSON. The only layout mismatch is MCP config path: Claude/plugin use root `.mcp.json`; Cursor reads `.cursor/mcp.json`. Shipping a content-equivalent twin plus `ensure-cursor-mcp.ts` / doctor warn avoids forking skills, hooks, or the SpecGraph server.

**Trade-off:** Live enforce/MCP catalog proof stays manual dogfood (Docker cannot drive Cursor UI). Matcher gaps (Glob / `mcp__` names) are documented rather than silently claimed as full FR-39 parity.

**Alternatives considered:**
- Mirror skills/hooks under `.cursor/`: rejected — drifts from Claude SoT and duplicates maintenance.
- Cursor marketplace plugin: rejected — Anthropic plugin.json is not Cursor's install channel; overkill for one path adapter.
- Rewrite FR-41 to Cursor Task agents: deferred — hybrid (phases in Claude Code, day-to-day door in Cursor) is enough for FR-81.



### Decision: Bounded MCP query contracts before workflow fan-out

**Требование:** [FR-82](FR.md#fr-82)

**Rationale:** The live graph already contains task nodes while the `list_phase_tasks` description and test still describe a future parser state. A truthful, spec-scoped query contract with complete cursor pagination lets an agent obtain the unfinished inventory directly, instead of retrying collectors or issuing one call per task. The same contract boundary applies to phase lookup, search, summary status, and document reads so callers can reason about cardinality and response budgets.

**Trade-off:** Pagination metadata, cursors, phase-state errors, cache revision checks, and bounded document-read errors add API surface and migration work. That explicit surface is preferable to silent caps, ambiguous empty results, and large prompt payloads; defaults protect callers while opt-in whole-document reads remain available for deliberate editing workflows.

**Alternatives considered:**
- Keep the current parser caveat and let callers crawl task nodes: rejected because the live graph contradicts the caveat and the incident showed unbounded retries/call volume.
- Return a fixed first-N slice without cursors: rejected because it silently loses tasks and cannot satisfy “every unfinished task.”
- Add a second task-inventory store: rejected because it would create a new source of truth; existing SpecGraph task nodes and lifecycle data must remain authoritative.

## Cross-spec dependency: Dynamic Workflow Engineering

dynamic-workflow-engineering owns all bounded workflow runtime, retry, partial-result, journal, replay, native-Agent capability/security, census/migration, adapters, incident regression, and distribution requirements; FR-82 remains the bounded spec-MCP query prerequisite/consumer surface; spec-generator-v4 must not implement a second runtime.

### Decision: One canonical spec engine with generated Codex host adapters

**Требование:** [FR-83](FR.md#fr-83)

**Rationale:** The graph, MCP registry, authoring door, gate/retry loop, and evidence semantics are already client-neutral, while the verified gaps sit at distribution, cwd/root injection, hook payloads, spawn defaults, and manual mirrors. A second full Codex plugin entry preserves the installed `context-menu` identity; generated adapters keep the extra surface mechanical. This is the smallest architecture that makes an external Codex Desktop project first-class without cloning the spec system.

**Trade-off:** A generated package and host adapter add release checks and one unavoidable second plugin manifest/source directory. Live Desktop verification remains a separate manual-or-captured lane because deterministic CLI tests cannot prove Desktop discovery and reload. `.claude` remains canonical during this increment, so the generator is temporarily directional rather than host-neutral source authoring.

**Alternatives considered:**
- Expand the existing context-menu plugin into the full product: rejected because it changes an installed plugin identity and violates its narrow contract.
- Create a new Codex-specific spec engine or spec folder: rejected because it duplicates graph, requirements, tasks, and truth semantics.
- Hand-copy `.claude` skills/rules into `.agents` and plugin folders: rejected because live inventory already demonstrates drift.
- Require globally copied `.codex/agents/*.toml`: rejected as a portable plugin prerequisite; packaged skills plus built-in roles must work independently.
- Treat Codex CLI smoke as Desktop support: rejected because it does not prove plugin reload, Desktop discovery, or live hook/subagent behavior.

#### Responsibility map

| Concern | Canonical owner | Codex projection |
|---|---|---|
| Spec graph, parsers, MCP tools, lifecycle | existing `tools/spec-graph` and `tools/spec-mcp-server` | same bundle/registry; no fork |
| Spec authoring phases and gates | existing create-spec/orchestrator contracts | host spawn adapter + packaged skills |
| Hook routes and safety policy | existing hook registry/guards | channel renderer + payload normalizer |
| Skills, agent instructions, consumer map | canonical `.claude` sources for this increment | deterministic `.agents`/`.codex`/plugin output with fingerprints |
| Marketplace whitelist/install status | `codex-init:FR-8` | sole writer of the second `spec-generator-v4` catalog row and status |
| Context-menu launcher | context-menu spec/plugin | unchanged and independent |
| Cursor second-client support | [FR-81](FR.md#fr-81) | unchanged; no replacement |

#### Runtime flow

1. Plugin discovery locates the generated `spec-generator-v4` package; target-project discovery is kept separate from package/cache location.
2. One root resolver produces a canonical target root and passes it to one registry factory.
3. Every MCP handler, status helper, attachment path, and create operation consumes that injected root; cache cwd is never an implicit target. A successful mutation refreshes the complete affected cross-document edge set before the next MCP response is served.
4. The hook adapter maps host event/tool/payload to a neutral policy event, then dispatches the existing guard.
5. The orchestration adapter selects Codex native spawn or built-in-role fallback and returns the same phase result shape used by gate/retry logic.
6. The semantic adapter returns judged evidence or the existing honest skip state.

#### Generated distribution boundary

The generator SHALL read canonical hook routes, skill/agent sources, MCP consumer mapping, and plugin inventory; emit repo Codex projections plus `plugins/spec-generator-v4/` package inputs; stamp source/generator fingerprints; and provide `--check`. It SHALL emit an immutable package handoff for `codex-init:CODEXINIT-1-3`; it SHALL NOT write marketplace order or support status. Generated artifacts are distributable outputs, not a second editing surface. The AC-83.9 decision table is the authoritative host/distribution matrix.

#### Verification boundary

Deterministic Docker/integration proof owns root isolation, hook normalization, generation drift, dependency-absent startup, doctor, and CLI variants. The host/distribution aggregate consumes four distinct evidence keys (`desktop-repo`, `desktop-installed`, `cli-repo`, `cli-installed`) and fails unless their cardinality is exactly four. A captured fresh Codex Desktop task owns installed Desktop discovery, reload, hook deny, MCP mutation, phase spawn, and semantic-status evidence. These lanes are required independently; no single scenario result rolls them up.

### Decision: Request-scoped project roots and bounded spec-check journal

**Требование:** [FR-84]

**Rationale:** Installed plugin location is executable identity, while the hook payload identifies the repository whose specs and state are being processed. The two authorities must be explicit and independent on every request; aggregate and age retention are both required because shard rotation alone does not bound disk usage.

**Trade-off:** Each append performs a bounded project-local shard inventory and disk-space probe, and persistent workers must receive or key on project context. This adds small deterministic I/O and state plumbing in exchange for eliminating cross-root data access and unbounded disk growth.

**Alternatives considered:**
- Keep `CLAUDE_PLUGIN_ROOT` precedence and only delete old cache data manually — rejected because every installed request can recreate the leak and analyze the wrong specs.
- Disable conformance hooks or external plugins — rejected because it removes behavior and leaves the root/retention defect intact.
- Use rotation without aggregate, age, or free-space policy — rejected because it bounds one file but not the journal or disk reserve.

### Root model

Introduce an explicit context passed through client → hook service → route/worker → conformance tool: `{ pluginRoot, projectRoot, sessionId }`. `pluginRoot` is immutable service code identity. `projectRoot` is normalized independently for every request from the current payload/session binding, with request-scoped `CLAUDE_PROJECT_DIR` as the only fallback. The resolver returns `null` rather than falling back to plugin root or daemon CWD. Persistent worker reuse must be keyed or rebound so requests for one project cannot inherit another project's CWD/environment/state.

### Journal algorithm

The writer confines the journal directory under `projectRoot`, acquires the existing/new maintenance lock, inventories only recognized shard names, and identifies the active shard separately. Before append it removes expired closed shards, then oldest closed shards until projected retained bytes are at most 64 MiB. It rotates the active shard at 10 MiB. Before writing, it checks projected free space against the 1 GiB reserve; a failed reserve after pruning skips the write. The active shard is never a deletion candidate. Every deletion target must pass real-path confinement and shard-name validation.

### Failure and diagnostic model

Conformance remains fail-open. Invalid roots, missing `.specs`, lock contention, disk probe failure, prune failure, and append failure return structured bounded outcomes. Low-disk diagnostics are rate-limited and emitted outside `.spec-check-log` so reporting cannot recursively consume the resource it is protecting. No failure branch may retry against the plugin cache.

### Verification architecture

BDD fixtures SHALL inject filesystem/free-space/time adapters and run the real installed-layout request path with distinct roots. Assertions cover path provenance, no-spec no-op, byte and age retention, active-shard protection, concurrent maintenance, unsafe path rejection, low-disk skip, and dependency-absent execution. The test oracle records every read/write/delete path so cache-local state is a hard failure.

### Authenticated daemon recovery

Authenticated `/health` includes the service PID. When state metadata is absent, startup resolves the operating-system PID that owns the configured loopback listener, repeats authenticated health, resolves the owner again, and accepts ownership only when both PID observations are identical and agree with any health PID present. The token-authenticated service signature proves DevPomogator ownership; the repeated OS binding closes stale-record and listener-change races. Only that PID is eligible for termination. Failed proof, access denial, a foreign listener, or a changing PID leaves the process alive; the launcher starts current runtime with port `0`, the OS chooses a free loopback port, the child atomically writes the actual port plus runtime identity to `service.json`, and all clients discover and authenticate that published endpoint under the existing startup lease.

## PR #227 review-hardening design (2026-08-11)

The client reads the generated route registry to calculate an event budget as the sum of ordered route timeouts plus bounded transport overhead; the byte counter is updated before concatenation and detaches or pauses stdin at overflow. Worker startup is represented by a tracked child with a timer and one idempotent termination path shared by timeout, protocol failure, exit, recycle, and manager close. Group dispatch returns successful aggregation while the server appends bounded diagnostics for each failed route. Managed directories are created one component at a time only after `lstat` and canonical-parent confinement checks. Runtime hashing includes imported shared modules. Orphan recovery always routes through repeated authenticated health and repeated OS listener-PID proof; state alone is advisory.


## FR-84.m delivery graph

The auto-heal change is modeled as one recovery transaction: dead-owner listener evidence → constrained orphan-root classifier → tree termination attempt → same-port re-observation → failure-state transition. UserPromptSubmit route generation is a first-class edge because PreToolUse cannot run when the prompt hook itself is blocked.
