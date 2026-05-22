# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

## v0.2.0 — 2026-05-20 — Cross-spec reconciliation (spec-only update)

**This release is a spec-only update.** Implementation deferred to Phase 7 of `TASKS.md`.

### Added

- **FR-17** (Phase 7 — `cross-spec-reconcile` skill) — scans all `.specs/*/` + implementation tree, writes findings to `.specs/{slug}/consistency-report.yaml`. Supports `light` and `full` modes; CRITICAL findings (hard-conflict subset in light mode, full set in full mode) block STOP via AskUserQuestion `header: "⚠️ CRIT"` with «Fix now / Acknowledge & override / Abort STOP» options. WARNING/INFO findings push to agent context. Secondary SARIF 2.1.0 output via `--sarif`. `--dry-run` flag skips writes.
- **FR-18** (Phase 7 — `cross-spec-resolve` skill) — explicit `/cross-spec-resolve` user invocation. Reads YAML, groups findings, emits 5-field explanation block before each Edit/Write (code+severity, files+lines, plain-language change, WHY rationale, options). Mechanical fixes apply via Edit/Write after confirm. Architectural decisions present Path A/B/C alternatives. Foreign-spec edits fire extra «⚠️ This edits foreign spec» banner + additional confirm. Batch re-invokes reconcile and updates `resolution_status` per finding.
- **AC-17.1..AC-17.8** + **AC-18.1..AC-18.5** EARS scenarios in `ACCEPTANCE_CRITERIA.md`.
- **US-17..US-20** v3-form blocks in `USER_STORIES.md` per discovery-forms convention.
- **UC-17..UC-21** use cases in `USE_CASES.md` covering lightweight invocation, heavyweight audit, resolve loop, architectural fork, foreign-spec correction.
- **DESIGN.md** new section «Cross-spec reconciliation architecture» with 11 sub-points covering skill flow diagram, subagent isolation (R-4), ARCHITECTURAL_DECISION_VS_REALITY detection algorithm, CAPS prompt rendering caveat, lightweight CRITICAL hard-conflict subset, partial reconciliation, Spectral namespace convention, OpenFastTrace 4-class summary grouping, SARIF mapping, concurrency semantics (resolve vs reconcile), prior-art adoption rationale.
- **NFR-Performance-5**, **NFR-Security-6**, **NFR-Reliability-7**, **NFR-Usability-7** in `NFR.md`.
- **Phase 7 «Cross-spec reconciliation»** in `TASKS.md` with 14 implementation tasks: `install-cross-spec-skills`, `impl-mechanical-checks`, `impl-semantic-subagent`, `impl-yaml-writer`, `impl-critical-prompt`, `impl-resolve-loop`, `impl-sarif-output`, `impl-dry-run-mode`, `impl-coverage-summary`, `impl-architectural-detection`, `wire-create-spec-skill`, `register-skills-in-manifest`, `integration-test-fixture`, `e2e-test-reconcile-roundtrip`.
- **Consistency Report YAML schema** + **Cross-Spec Finding Codes** table (28 codes: 15 `cross-spec/*` + 13 `impl-drift/*`) + **SARIF mapping** in `spec-generator-v4_SCHEMA.md`.
- **`@feature17`** + **`@feature18`** Gherkin scenarios (SPECGEN004_38..48) in `spec-generator-v4.feature`.
- **`cross-spec-corpus/` fixture entry** in `FIXTURES.md` describing 3 fixture specs (spec-a, spec-b, spec-c) with intentional conflicts + expected finding codes.
- **CHK-FR17-01..08** + **CHK-FR18-01..05** rows (13 new) in `REQUIREMENTS.md` traceability matrix. Total CHK count: 41 → 54.
- **README.md** bumped: 16 FRs → 18 FRs, 7 phases → 8 phases. New «cross-spec reconciliation» bullet in «Ключевые идеи». Path references to `.claude/skills/cross-spec-reconcile/` + `.claude/skills/cross-spec-resolve/` in «Где лежит реализация».
- **RESEARCH.md** new section «Related sprint work / cross-impact analysis pattern» (post-render-eval ↔ closed-loop-hardening case study) + «Prior art» subsection (spec-kit, mex, OpenFastTrace, Spectral, oasdiff with gap analysis + adopted/avoided patterns).

### Resolved

- **REVIEW_NOTES P2-3** (AC count 38/39 off-by-one) — automatically closed by recompute including new AC-17.1..8 + AC-18.1..5. New AC total: 51.
- **REVIEW_NOTES P2-4** (FILE_CHANGES count discrepancy) — automatically closed by recompute.

### Spec status

- **2026-05-18 — Spec APPROVED, ready for implementation.** All 4 workflow phases confirmed (Discovery + Context + Requirements + Finalization + Audit). Final spec-review: 0 P0/P1 blockers. Implementation not yet started; awaiting kickoff of Phase 0 (`install-bdd-framework` task, Est: 20m).

### Added

- **Spec authored 2026-05-16 → 2026-05-18** (this v4 spec itself):
  - 16 FRs + 21 NFRs + 38 ACs + 41 CHKs + 37 BDD scenarios
  - 7 phases planned (Phase 0 cucumber-js migration → Phase 6 architecture-research-workflow skill)
  - RESEARCH.md 1300+ lines / 17 appendices documenting: external pain validation (OpenSpec issue #901), variant analysis (4 architectures), decision history (in-memory vs SQLite, MCP vs LSP layering, throttling), devcontainer constraints, anchor convention evolution
  - Spec workflow took 30+ turns → motivated Phase 6 meta-deliverable (architecture-research-workflow skill)

### Planned Phase 0 — Cucumber-JS BDD migration

- Migrate dev-pomogator from vitest pseudo-BDD (`.feature` as documentation only, tests in vitest) to `@cucumber/cucumber` real BDD runner with canonical NDJSON output
- Target TS projects installing v4 must also adopt cucumber-js (additive to existing vitest unit tests)

### Planned Phase 1 — Graph builder + parsers

- `extensions/specs-workflow/tools/spec-graph/` new module with `unified+remark` MD parser (dual-anchor), `@cucumber/gherkin` Gherkin parser, `@cucumber/messages` NDJSON ingester
- In-memory SpecGraph with typed nodes/edges
- Conformance checker (all structural rules: UNCOVERED_FR / ORPHAN_TASK / BROKEN_REF / SCENARIO_TAG_ORPHAN / etc.)
- Backward compat: legacy v3 `### Requirement: FR-N` headings work via triple-anchor

### Planned Phase 2 — MCP server + hooks + Marksman

- New extension `dev-pomogator-specs` MCP server (`@modelcontextprotocol/sdk`) with 11 tools
- Primary tool `get_trace(node_id)` returns structured tree + natural-language explanation in one call
- PreToolUse HARD hook `spec-conformance-guard` for syntax invariants
- PostToolUse hook `spec-conformance-push` with 3s throttle + aggregation + dedup
- Bash post-test hook for NDJSON ingest after test runs
- Marksman LSP binary bundled (silent install, +15MB) for IDE wiki-link navigation
- chokidar file watcher with auto-polling fallback (devcontainer bind-mount safe)
- .mcp-lock.json with env+pid tracking for multi-session protection

### Planned Phase 3 — LLM layer + multi-language

- Opt-in semantic drift check via `claude` CLI subprocess (Haiku)
- Multi-language step binding extractor (Reqnroll C#, behave Python, Cucumber-JVM Java)

### Planned Phase 4 — SQLite + side-channel logs + Codespaces

- Optional SQLite FTS5 persistence (cross-session sharing)
- Side-channel JSONL log `.dev-pomogator/.spec-check-log/<date>.jsonl` for audit + analytics
- GitHub Codespaces lifecycle integration (postStartCommand)

### Planned Phase 5 — Migration helper v3→v4

- `dev-pomogator migrate-v3-to-v4 [--suggest-only]` interactive script
- Converts legacy headings, predicts tags for untagged scenarios, generates `.spec-config.json`

### Planned Phase 6 — architecture-research-workflow skill (meta-deliverable)

- New skill `architecture-research-workflow` (7 stages)
- Enriches existing `research-workflow` with shared base patterns
- `create-spec` heuristic auto-invokes new skill for complex features
- Goal: 5-8 turns for future major architecture features (vs 30+ for v4)

### Security

- **No env-var bypass** for HARD hooks. Pattern from v3 (`SPEC_FORM_GUARDS_DISABLE` doesn't exist)
- **Meta-guard** protects `extension.json` and `.claude/settings.local.json` from tampering
- **No hardcoded user identifiers** — all derived at runtime (`git remote`, `gh api user`, `git rev-parse`)
- **Env-first config resolution** for all config-derivable values
- **SQLite file mode 0600** when persistence enabled (Phase 4)

## [4.0.0] - TBD (after Phase 0-6 implementation complete)

### Added

- Initial v4 implementation across 7 phases
