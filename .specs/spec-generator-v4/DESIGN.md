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

**Rationale:** Simplicity wins for the 30-spec scale typical of v4 first deployment. Pure JS implementation has zero native dependencies (`better-sqlite3` requires platform-specific compile), making install trivial on devcontainer / Codespaces / WSL where bind-mount FS lock semantics are unreliable. Cold-start rebuild at 1-2s is acceptable for single Claude Code session lifecycle. Source-of-truth always lives in `.specs/**/*.md` (git-committed) — in-memory index is purely derived, loss = 1-2s rebuild not data loss.

**Trade-off:** No cross-session sharing — each Claude Code session pays the 1-2s rebuild cost. Multi-session scenarios (developer running two terminals on same project) cannot share SpecGraph state without going through filesystem.

**Alternatives considered:**
- SQLite FTS5 (rejected for Phase 2) — devcontainer bind-mount lock corruption risk (Docker Desktop on Windows/Mac), `better-sqlite3` native compile complicates install matrix, schema migrations add maintenance burden, cross-session benefit not justified at single-session scale. Deferred to Phase 4 opt-in via config flag.
- LMDB / RocksDB (rejected) — same native-deps issue plus less common in JS ecosystem, harder to debug for users.
- Persistent JSON file (rejected) — atomic write/lock semantics same problem as SQLite, no query performance benefit over in-memory, only marginal cold-start savings.

### Decision: Dual-anchor heading convention (FR-001 + fr-001-login)

**Rationale:** Marksman LSP generates wiki-link slugs from heading text natively (`### FR-001: Login` → `fr-001-login`), enabling IDE Ctrl+Click navigation without custom plugins. Compact `[[FR-001]]` form preferred by agents for dense cross-refs. Registering BOTH anchors satisfies both human readers (descriptive `[[fr-001-login]]`) and agent context efficiency (`[[FR-001]]`). Legacy v3 `### Requirement: FR-001 Login` continues to work via triple-anchor registration in our custom parser — no breaking change.

**Trade-off:** Parser complexity (regex `anchor_patterns` config + triple-registration during indexing) adds ~150 lines of code vs single-anchor approach. Slight indexing overhead (~5ms per heading vs 1ms).

**Alternatives considered:**
- Status quo `### Requirement: FR-N` only (rejected) — no IDE wiki-link navigation in Marksman / VS Code, slugs unusable (`requirement-fr-001-login` too long).
- Short heading only `### FR-N: ...` without backward compat (rejected) — breaks 30+ existing v3 specs across the dev-pomogator user base; forced migration too invasive.
- HTML anchor markers `<a name="FR-001"></a>` adjacent to headings (rejected) — clutters MD source, requires migration script to add markers to all existing specs anyway, no advantage over regex parser.

### Decision: Workflow orchestrator architecture = thin orchestrator + existing workers (Option B)

**Rationale:** v4 already ships the workers (create-spec phases, cross-spec-reconcile/resolve, spec-backlog resolvers, MCP `get_trace`/`get_coverage`/`get_test_result`, conformance hooks). A thin orchestrator that owns only the feature-map + routing reuses all of them (per repo reuse rules), stays token-cheap, scales (workers run as isolated sub-agents, parallelizable), and matches the repo's proven dispatch pattern (spec-backlog specialist resolvers, cross-spec semantic subagent). Self-improvement is a human-merge dated ledger (`SELF_IMPROVE.md`): the orchestrator accumulates `pending` improvement notes, proactively reminds the human, and only auto-applies after the human marks an entry `approved` — keeping the human as the validation gate (consistent with FR-32 honesty discipline) while removing them as the memory of what's left to do.

**Trade-off:** More moving parts than a single monolithic skill; sub-agent worker dispatch costs extra latency/tokens; the routing feature-map must be kept current as capabilities grow (mitigated by the FR-33 drift guard, task T-Orch.3).

**Alternatives considered:**
- Option A — single "general" monolithic playbook skill (rejected): one `SKILL.md` grows past the skill-listing budget, one context does everything → hits limits on large workflows, no parallelism; its only edge is a single update point.
- Option C — tools-only / emergent, no central skill (rejected): no single entry point that "knows the whole workflow" (the explicit requirement), no holistic self-improve ledger, and the manual-coverage / stale-TASKS friction that motivated this recurs because nothing orchestrates the honesty discipline end-to-end.
- Full restructure files-per-FR (`.specs/auth/fr-001.md`) (rejected) — too invasive, loses spec cohesion, breaks audit/validation tooling.

### Decision: MCP and LSP as separate layers, not nested

**Rationale:** LSP is reactive (responds to file events / Read tool enrichment), MCP is pull-based (agent explicitly calls tools). Different ментальные модели и activation patterns. Forcing MCP-wraps-LSP would lose MCP's autonomous initiation capability (e.g., `conformance_check` doesn't map to any standard LSP request). Keeping them parallel: agent uses LSP-backed tools (`FindReferences`) for known symbol queries, MCP for domain queries (`get_trace`).

**Trade-off:** Some capability duplication — `FindReferences` (LSP) and `backlinks` (MCP) overlap. Cost: two implementations to maintain. Benefit: each layer optimized for its access pattern.

**Alternatives considered:**
- Pure LSP-as-MCP-wrap (rejected) — loses MCP's autonomous pull-based initiation, all calls become reactive, complicates conformance_check (no natural LSP equivalent).
- Pure MCP only (no LSP backing) (rejected) — loses 900× speedup on cross-file symbol queries (`textDocument/references` vs grep), wastes agent context on large match sets.
- LSP only, no MCP (rejected) — no way to expose domain-specific queries (`get_trace`, `blast_radius`); LSP standard not extensible enough.

### Decision: PostToolUse always-push with 3s throttle

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

**Rationale:** IDE wiki-link navigation (Ctrl+Click on `[[FR-001]]` in VS Code) is critical for human-readable spec workflow. Opt-in postInstall introduces friction — users skip and lose IDE features without realizing. Silent bundle = "just works" out of the box. Binary size +15MB is acceptable trade-off for adoption.

**Trade-off:** +15MB to dev-pomogator install footprint per platform. Slightly slower `npm install` (single binary download). Network dependency at install time (mitigated: fallback to custom JS MD LSP if download fails).

**Alternatives considered:**
- Opt-in postInstall (`dev-pomogator install-marksman`) (rejected) — user friction, most won't run it, IDE features silently absent.
- Custom JS MD LSP only (no Marksman) (rejected) — incomplete feature set (no broken-link diagnostics, no rename refactoring); reimplementing Marksman from scratch is 6-12 months of work.
- VS Code extension instead of LSP (rejected) — VS Code-specific, breaks Neovim/Helix/Sublime users; LSP is editor-agnostic standard.

### Decision: Phase 6 added — architecture-research-workflow skill (meta-deliverable)

**Rationale:** This v4 spec itself took 30+ turns of manual user pushback to reach quality (session 2026-05-17). The pattern (pain validation → research → variants → decision Q&A → phases) is reusable for future major features (v5, v6). Encoding it as a skill means future arch features take 5-8 turns instead of 30+. The skill calls existing `research-workflow` as a primitive for individual research bursts, adding meta-stages (variants, decisions, phases) on top.

**Trade-off:** Skill creep risk — 7 stages may be overkill for medium features. Mitigated via complexity heuristic in `create-spec` (auto-invoke only on "архитектур"/"v\d+"/"rebuild" keywords or ≥3 components detected).

**Alternatives considered:**
- Extend existing `research-workflow` skill (rejected) — mixes "find facts" with "design architecture" mental models, bloats skill to 800+ строк, breaks current `create-spec` integration.
- Single combined skill (rejected) — same bloating concern; loss of modularity (research-workflow can be invoked standalone for simple lookups).
- Manual pattern per major feature (status quo, rejected) — proven 30+ turn cost per feature, doesn't scale; the pattern IS the deliverable.

### Decision: Marksman LSP bridge — hand-rolled JSON-RPC framing, handshake-first, captured-real

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

**Rationale:** the graph keyed nodes by the bare local id (`FR-2`), so across 47 specs the ids collide and the node Map keeps only the last writer — 46 specs define `FR-2` yet only 47 FR nodes survive (≈470 expected). Measured by the dogfood harness; every edge bug (`get_trace` empty, `covers` ×52, `AC-36` from `pomogator-doctor` leaking into v4's FR-36 trace) is a symptom. The fix keys every node by `<slug>:<localId>` where `<slug>` is derived MECHANICALLY from the `.specs/<slug>/` path (the author keeps writing `## FR-2`, no prefix to type), and **decouples the anchor alias** — anchors stay bare `#fr-2` (file-local) so Marksman / anchor-fix / existing links are untouched.

**Trade-off:** test churn — every test asserting a bare id must move to the qualified form in lockstep (this is why the suite was "green" on a broken graph: it asserted bare ids that happened to resolve). Mitigated by phasing (Phase 13, each phase suite-green) + soft bare→candidate-list fallback for agent callers.

**Alternatives considered:**
- global N+1 counter (`FR-347`) — needs a CENTRAL ALLOCATOR → merge conflict on the counter every time any spec adds an FR, lost locality, brittle renumber, and `FR-347` carries no spec context; the project ALREADY prefixes scenarios (`SPECGEN004_NN`/`PLUGIN005_NN`/`CORE024_NN`), so composite ids just finish a pattern in use.
- separator `/` instead of `:` — collides with path/anchor syntax, so `:` chosen. Full deep-dive: `audit-reports/unified-spec-graph-design.md` §9.

### Decision: spec-health verdict = smart graph analysis, structural is a pre-filter only (FR-37)

**Rationale:** a structural `validate-spec: 0 errors` was reported as "spec valid" while `audit-spec` had 10 P0, `conformance_check` 1256 findings, and the corpus 32 NOT_COVERED + 75 ORPHAN + 9 unconfirmed STOP — a false green. v4 already owns the smart machinery (FR-8 semantic, `conformance_check`, `get_coverage` honesty, `audit-spec`) but it was opt-in / not authoritative. The verdict is therefore composed from the smart tools over the ONE graph (FR-36) + a traceability-completeness check (the cell→atom invariants), default-ON; `validate-spec` is demoted to a pre-filter whose pass is NOT emittable as "valid/clean/done".

**Trade-off:** the verdict is heavier (graph build + optional `claude -p` semantic) than a structural lint; mitigated by FR-36's bounded node count (NFR-Performance-9) and semantic being binary-present-gated with a fail-loud `SEMANTIC_SKIPPED` (never silent no-drift).

**Alternatives considered:**
- keep structural as the gate — the exact false-green that triggered this.
- make semantic opt-in — status quo, it never runs, so the dumb check wins.
- a brand-new analyzer — the smart tools exist; this FR makes them AUTHORITATIVE + adds the completeness check, no new engine. Evidence: `audit-reports/v4-smart-verdict-and-organism-traceability.md`.

### Decision: get_spec_status — agent-facing READ of the same truth the verdict gates on (FR-38)

**Rationale:** агенту нужен ОДИН вызов, чтобы понять состояние спеки целиком: написаны ли тесты, гонялись ли, чем кончился последний ран (summary), сколько дыр трассировки. До FR-38 эта картина собиралась из 3-4 вызовов (get_coverage_summary + find_by_tags + get_test_result по сценариям) и всё равно не отвечала «а ран вообще был?». Lifecycle выводится только из графа (FR-36) + инжестённого NDJSON (FR-1): SPEC_ONLY (нет сценариев) → TESTS_NOT_RUN (сценарии без lastResult) → RED (есть failed/ambiguous) → PARTIAL (0 failed, но есть undefined/pending/skipped — написано ≠ реализовано, FR-35 идиома) → GREEN (все тронутые passed).

**Trade-off:** PARTIAL объединяет undefined/pending/skipped в одно «жёлтое» состояние — гранулярность отдана в `last_run.summary` (по-классово), сам enum остаётся пятизначным и читаемым агентом без таблицы.

**Alternatives considered:**
- расширять `list_specs` per-spec статусом — раздувает каждый ответ ради редкой нужды.
- отдельный side-файл статуса — нарушает «no side files»; правда живёт в графе+NDJSON.
- вычислять в скилле spec-status — скилл оркестрирует LLM, а статус должен быть механическим и MCP-трассируемым.

### Decision: MCP-rails — агентский доступ к спекам только через MCP (FR-39/40/41)

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

### Decision: Honest-status auto-surface is a closed loop over LIVE pieces, not 4 net-new subsystems (FR-49)

**Требование:** [FR-49](FR.md#fr-49)

**Rationale:** The false-close incident (the agent declared done while 11 FRs were in-progress, IGNORING the per-prompt census banner) is not «add a tool» — the surfacing already existed and was ignored. So FR-49 ENFORCES, not just shows. Advisor-vetted scope: 3 of 4 parts WIRE+ENRICH live machinery, 1 is net-new:
- **FR-49a** — enrich the EXISTING `buildTaskCensusLine` with the next open task (`nextOpen` on the census cache).
- **FR-49b** — make the LIVE `claim-evidence-gate` census-AWARE: a whole-spec completion claim while the census shows unfinished work blocks with the real numbers. The text classes (works-done/deferred-work) miss the CLEAN false-close (executor ran, no defer phrasing); the census IS the disproof.
- **FR-49c** — NO new writer: the existing `lifecycle.ts` watcher already refreshes the census on every door write (`refreshCensus` on boot + each `onPatch`). Verified, not rebuilt.
- **FR-49d** — the ONE net-new piece: a flag-only reconciler for stale in-progress markers.

**Trade-off:** Three guards keep it from becoming noise / false-green. (1) anti-H1 (FR-49b): `isSpecCompletionClaim` is WHOLE-spec only (not per-task, not a progress report) AND requires a REAL unfinished census — a non-spec «fixed the typo» never trips the census branch (the gate already had SELF_MARKERS false-fire history; same discipline). (2) false-green (FR-49d): the reconciler FLAGS, never auto-closes (an auto-closing reconciler would be the very false-green the honesty machinery fights); a task with no scenario is never flagged. (3) dep-safety: the gate's new `task-census` import is builtins-only (`coverage.ts` has zero imports), so the plugin-distributed Stop hook stays runnable for users with no `node_modules`. Turtle: the gate that blocks false-close is itself specced through the door it guards; FR-49's own whole-spec claims self-block while the spec is unfinished — correct, not a bug (report component-level done).

**Alternatives considered:**
- 4 net-new hooks (rejected) — 3 of the 4 concerns already had live machinery; net-new would duplicate + drift.
- A research-N/A escape to lift web-complete (rejected mid-session as invented scope — research citation is ~3% by design, INFO-only, not a target).
- Auto-closing reconciler (rejected) — false-green risk; flag-only, the human/agent closes via `set_entity_status`.
