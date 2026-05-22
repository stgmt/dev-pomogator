# Spec Generator V4

> **Status:** ✅ **APPROVED — Ready for Implementation** (обсуждена 2026-05-18)
> **Phase progress:** Discovery ✅ → Context ✅ → Requirements ✅ → Finalization ✅ → Audit ✅
> **Spec review:** 0 P0 / 0 P1 blockers, 4 P2 / 5 P3 improvements logged in REVIEW_NOTES.md
> **Implementation:** Not yet started — awaiting kickoff of Phase 0 (`install-bdd-framework`)

Эволюция spec-generator v3: переход от плоских MD спек к **in-memory SpecGraph + MCP server + LSP integration + canonical Cucumber-JS BDD with NDJSON**, чтобы AI агент автоматически трассировал FR ↔ AC ↔ Scenario ↔ TestResult ↔ Code без галлюцинаций над спеками. **18 FRs, 8 phases** (Phase 0 cucumber-js миграция → Phase 6 architecture-research-workflow skill → Phase 7 cross-spec reconciliation).

## Ключевые идеи

- **In-memory SpecGraph builder** (Phase 1) — `unified+remark` для MD + `@cucumber/gherkin` для .feature + `@cucumber/messages` для NDJSON → типизированный граф с nodes (FR/NFR/AC/SCEN/TASK/UC/RISK) + edges (refs/covers/tested-by/tagged-by/implements/last-result). Cold start ≤2s для 30 specs, incremental ≤100ms p95.
- **MCP server `dev-pomogator-specs` с 11 tools** (Phase 2) — главный `get_trace(node_id)` отдаёт structured tree + natural-language `explanation_for_agent` за один call. Агент не делает follow-up Read'ов для понимания контекста.
- **Dual-anchor heading convention** — `### FR-001: Login` регистрирует **оба** anchors `FR-001` и `fr-001-login`. Wiki-link `[[FR-001]]` (compact) и `[[fr-001-login]]` (descriptive) работают. Legacy v3 `### Requirement: FR-N` ALSO работает через triple-anchor (backward compat без миграции).
- **PreToolUse HARD hooks + PostToolUse always-push с 3s throttle** — hard invariants (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN) блокируются sync-time; soft drift (UNCOVERED_FR, ORPHAN_TASK, SCENARIO_TAG_ORPHAN) push'ится в agent context aggregated в 3-секундном окне.
- **Marksman LSP bundled silent install** — wiki-link navigation в любом LSP-compatible редакторе (VS Code, Neovim, Obsidian, Helix) out of the box. +15MB binary.
- **Cucumber-JS canonical NDJSON output** (Phase 0) — миграция dev-pomogator с vitest pseudo-BDD на real `@cucumber/cucumber` runner. Mandatory additive для всех TS target projects.
- **Phase 6 meta-deliverable** — новый skill `architecture-research-workflow` encapsulates 7-stage flow (pain validation → research → variants → decisions → phases → hand-off), чтобы будущие major features занимали 5-8 turns вместо 30+.
- **Phase 7 cross-spec reconciliation** (v0.2.0 spec-only addition 2026-05-20) — два новых skill (`cross-spec-reconcile` + `cross-spec-resolve`) детектят конфликты между всеми `.specs/*/` (terminology drift, runtime identifier mismatch, module ownership conflict, contradictory FR, NFR conflict + 23 more codes) и spec-vs-implementation drift (missing-file, mcp-tool-drift, hook-registration-drift, architectural-decision-vs-reality + 9 more). Findings → YAML `.specs/{slug}/consistency-report.yaml` + optional SARIF 2.1.0. CRITICAL findings блокируют STOP с CAPS prompt; resolve skill применяет fix'ы через explain-then-confirm flow + Path A/B/C для архитектурных развилок. См. FR-17, FR-18 + 9-я audit-категория CROSS_SPEC_CONSISTENCY (запланирована в Phase 7 TASKS.md).

## Где лежит реализация

- **App-код** (новая структура): `extensions/specs-workflow/tools/spec-graph/`, `extensions/specs-workflow/tools/spec-mcp-server/`, `extensions/specs-workflow/tools/spec-conformance-guard/`, `extensions/specs-workflow/tools/spec-conformance-push/`, `extensions/specs-workflow/tools/bash-post-test-ingest/`, `extensions/specs-workflow/tools/migrate-v3-to-v4/`, `extensions/specs-workflow/tools/claude-cli-bridge/`
- **Skill**: `.claude/skills/architecture-research-workflow/`, `.claude/skills/_shared/research-base.md`, `.claude/skills/cross-spec-reconcile/` (Phase 7 — FR-17 reconcile entry point + scripts + references), `.claude/skills/cross-spec-resolve/` (Phase 7 — FR-18 resolve entry point + scripts + references)
- **Wiring**: `extensions/specs-workflow/extension.json` (v4.0.0 — registers MCP + 3 hooks + meta-guard), `package.json` (cucumber-js + remark + chokidar + MCP SDK + better-sqlite3 optional dep), `.devcontainer/devcontainer.json` (postStartCommand)
- **Existing infrastructure reused**: `extensions/specs-workflow/tools/specs-generator/{validate-spec,audit-spec,bdd-framework-detector,scaffold-spec}.ts`, all 6 v3 form-guards as patterns
- **Marksman binary** (postInstall): `.dev-pomogator/bin/marksman` (per-platform)
- **In-memory state** (Phase 2): no persistence — graph rebuilds on MCP startup
- **Optional SQLite** (Phase 4): `.dev-pomogator/.spec-index.sqlite` (WAL mode, FTS5)
- **Locks/config** (per worktree): `.dev-pomogator/.mcp-lock.json`, `.dev-pomogator/.spec-config.json`, `.dev-pomogator/.last-test-run.ndjson`, `.dev-pomogator/.spec-check-log/<YYYY-MM-DD>.jsonl`

## Phases overview

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 0** | Cucumber-JS BDD migration (dev-pomogator + target TS mandatory) | 1-2 days |
| **Phase 1** | SpecGraph builder + 3 parsers (MD/Gherkin/NDJSON) + dual-anchor + conformance checker | 4-5 days |
| **Phase 2** | MCP server (11 tools) + PreToolUse HARD + PostToolUse push + Marksman bundle | 5-7 days |
| **Phase 3** | LLM semantic drift check + multi-language (C#/Python/Java) | 2-3 days |
| **Phase 4** | SQLite persistence + side-channel JSONL log + Codespaces support | 3-4 days |
| **Phase 5** | Migration helper v3→v4 (interactive + suggest-only) | 2 days |
| **Phase 6** | architecture-research-workflow skill + research-workflow enrichment + create-spec integration | 7-10 days |
| **Phase 7** | Cross-spec reconciliation (FR-17 reconcile + FR-18 resolve, 28 finding codes, SARIF, dry-run, Path A/B/C, JSONL audit) | 10-11 days |

Total: ~35-46 days effort.

> **Estimate derivation:** Phase 7 task estimates in `TASKS.md` sum to ~5100 minutes (~85 hours ≈ 10-11 dev-days at 8h/day). Key drivers: `impl-mechanical-checks` (12h), `impl-resolve-loop` (12h), `impl-architectural-detection` (12h), `impl-semantic-subagent` (8h), `install-cross-spec-skills` (8h), `e2e-test-reconcile-roundtrip` (8h); 8 smaller tasks make up the remainder.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 20 user stories с form (Priority+Why+Independent Test+Acceptance Scenarios)
- [USE_CASES.md](USE_CASES.md) — 15 UCs + 12 edge cases (UC-1 happy path, EC-* failure modes, UC-17..21 cross-spec reconciliation)
- [RESEARCH.md](RESEARCH.md) — 1300+ строк, 17 appendices (A-Q), включая alternatives rejected, Cucumber Messages 21 envelopes, devcontainer constraints, architecture decisions history (WHY), + Related sprint work + Prior art (Phase 7)
- [FR.md](FR.md) — 18 FRs + 3 OUT_OF_SCOPE (real-time collab, GUI, reverse-eng)
- [NFR.md](NFR.md) — 25 NFRs across Performance / Security / Reliability / Usability
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 51 EARS ACs (1:1 with FRs)
- [REQUIREMENTS.md](REQUIREMENTS.md) — 18-row traceability matrix + 54 CHKs verification matrix
- [DESIGN.md](DESIGN.md) — Components, Algorithm, API, Key Decisions (Rationale+Trade-off+Alternatives), BDD Test Infrastructure, Cross-spec reconciliation architecture
- [spec-generator-v4_SCHEMA.md](spec-generator-v4_SCHEMA.md) — 7 base entities + Consistency Report YAML schema + 28 Cross-Spec Finding Codes + SARIF mapping
- [FILE_CHANGES.md](FILE_CHANGES.md) — 87 files across 8 phases (75 create + 12 edit) — Phase 7 implementation files described in TASKS.md
- [spec-generator-v4.feature](spec-generator-v4.feature) — 48 SPECGEN004 scenarios mapped 1:1 to @feature1..@feature18
- [TASKS.md](TASKS.md) — 64 tasks TDD-ordered with Done When / Status / Est / dependencies (14 new Phase 7 tasks)
- [FIXTURES.md](FIXTURES.md) — BDD fixtures inventory + Gap analysis + cross-spec-corpus fixture for Phase 7
- [REVIEW_NOTES.md](REVIEW_NOTES.md) — Phase 1 + Phase 2 spec-review findings (0 P0/P1, recommendations logged) + 2026-05-20 cross-spec reconciliation tracking entry
- [CHANGELOG.md](CHANGELOG.md) — feature change log
