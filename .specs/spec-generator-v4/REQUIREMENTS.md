# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1) | Phase 0 cucumber-js BDD migration | [AC-1.1](ACCEPTANCE_CRITERIA.md#ac-11), [AC-1.2](ACCEPTANCE_CRITERIA.md#ac-12), [AC-1.3](ACCEPTANCE_CRITERIA.md#ac-13) | @feature1 | Draft |
| [FR-2](FR.md#fr-2) | In-memory SpecGraph builder | [AC-2.1](ACCEPTANCE_CRITERIA.md#ac-21), [AC-2.2](ACCEPTANCE_CRITERIA.md#ac-22) | @feature2 | Draft |
| [FR-3](FR.md#fr-3) | Custom MD parser dual-anchor | [AC-3.1](ACCEPTANCE_CRITERIA.md#ac-31), [AC-3.2](ACCEPTANCE_CRITERIA.md#ac-32), [AC-3.3](ACCEPTANCE_CRITERIA.md#ac-33) | @feature3 | Draft |
| [FR-4](FR.md#fr-4) | MCP server get_trace | [AC-4.1](ACCEPTANCE_CRITERIA.md#ac-41), [AC-4.2](ACCEPTANCE_CRITERIA.md#ac-42) | @feature4 | Draft |
| [FR-5](FR.md#fr-5) | PreToolUse HARD hooks | [AC-5.1](ACCEPTANCE_CRITERIA.md#ac-51), [AC-5.2](ACCEPTANCE_CRITERIA.md#ac-52), [AC-5.3](ACCEPTANCE_CRITERIA.md#ac-53) | @feature5 | Draft |
| [FR-6](FR.md#fr-6) | PostToolUse always-push 3s throttle | [AC-6.1](ACCEPTANCE_CRITERIA.md#ac-61), [AC-6.2](ACCEPTANCE_CRITERIA.md#ac-62), [AC-6.3](ACCEPTANCE_CRITERIA.md#ac-63) | @feature6 | Draft |
| [FR-7](FR.md#fr-7) | Marksman bundle install | [AC-7.1](ACCEPTANCE_CRITERIA.md#ac-71), [AC-7.2](ACCEPTANCE_CRITERIA.md#ac-72) | @feature7 | Draft |
| [FR-8](FR.md#fr-8) | LLM semantic drift check (opt-in) | [AC-8.1](ACCEPTANCE_CRITERIA.md#ac-81), [AC-8.2](ACCEPTANCE_CRITERIA.md#ac-82) | @feature8 | Draft |
| [FR-9](FR.md#fr-9) | Multi-language BDD support | [AC-9.1](ACCEPTANCE_CRITERIA.md#ac-91), [AC-9.2](ACCEPTANCE_CRITERIA.md#ac-92) | @feature9 | Draft |
| [FR-10](FR.md#fr-10) | SQLite FTS5 cross-session (Phase 4) | [AC-10.1](ACCEPTANCE_CRITERIA.md#ac-101), [AC-10.2](ACCEPTANCE_CRITERIA.md#ac-102), [AC-10.3](ACCEPTANCE_CRITERIA.md#ac-103) | @feature10 | Draft |
| [FR-11](FR.md#fr-11) | Migration helper v3→v4 | [AC-11.1](ACCEPTANCE_CRITERIA.md#ac-111), [AC-11.2](ACCEPTANCE_CRITERIA.md#ac-112) | @feature11 | Draft |
| [FR-12](FR.md#fr-12) | architecture-research-workflow skill | [AC-12.1](ACCEPTANCE_CRITERIA.md#ac-121), [AC-12.2](ACCEPTANCE_CRITERIA.md#ac-122), [AC-12.3](ACCEPTANCE_CRITERIA.md#ac-123) | @feature12 | Draft |
| [FR-13](FR.md#fr-13) | Orphan resolution policy | [AC-13.1](ACCEPTANCE_CRITERIA.md#ac-131), [AC-13.2](ACCEPTANCE_CRITERIA.md#ac-132) | @feature13 | Draft |
| [FR-14](FR.md#fr-14) | Devcontainer / multi-env support | [AC-14.1](ACCEPTANCE_CRITERIA.md#ac-141), [AC-14.2](ACCEPTANCE_CRITERIA.md#ac-142), [AC-14.3](ACCEPTANCE_CRITERIA.md#ac-143) | @feature14 | Draft |
| [FR-15](FR.md#fr-15) | Side-channel conformance log | [AC-15.1](ACCEPTANCE_CRITERIA.md#ac-151), [AC-15.2](ACCEPTANCE_CRITERIA.md#ac-152) | @feature15 | Draft |
| [FR-16](FR.md#fr-16) | GitHub Codespaces support | [AC-16.1](ACCEPTANCE_CRITERIA.md#ac-161), [AC-16.2](ACCEPTANCE_CRITERIA.md#ac-162) | @feature16 | Draft |

## Functional Requirements

- [FR-1: Phase 0 cucumber-js BDD migration](FR.md#fr-1)
- [FR-2: In-memory SpecGraph builder](FR.md#fr-2)
- [FR-3: Custom MD parser dual-anchor](FR.md#fr-3)
- [FR-4: MCP server get_trace](FR.md#fr-4)
- [FR-5: PreToolUse HARD hooks](FR.md#fr-5)
- [FR-6: PostToolUse always-push 3s throttle](FR.md#fr-6)
- [FR-7: Marksman bundle install](FR.md#fr-7)
- [FR-8: LLM semantic drift check (opt-in)](FR.md#fr-8)
- [FR-9: Multi-language BDD support](FR.md#fr-9)
- [FR-10: SQLite FTS5 cross-session (Phase 4)](FR.md#fr-10)
- [FR-11: Migration helper v3→v4](FR.md#fr-11)
- [FR-12: architecture-research-workflow skill](FR.md#fr-12)
- [FR-13: Orphan resolution policy](FR.md#fr-13)
- [FR-14: Devcontainer / multi-env support](FR.md#fr-14)
- [FR-15: Side-channel conformance log](FR.md#fr-15)
- [FR-16: GitHub Codespaces support](FR.md#fr-16)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-Performance-1..4 (cold start ≤2s, incremental ≤100ms, MCP tool budgets, hook latency)
- [Security](NFR.md#security) — NFR-Security-1..5 (no env-var bypass, meta-guard, no hardcoded IDs, env-first config, file perms)
- [Reliability](NFR.md#reliability) — NFR-Reliability-1..6 (graceful NDJSON, atomic writes, stale lock detection, polling fallback, SQLite recovery, Marksman crash isolation)
- [Usability](NFR.md#usability) — NFR-Usability-1..6 (single-call context, actionable errors, no hidden state, interactive migration, backward compat, cross-platform install)

## Acceptance Criteria

См. [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 38 AC blocks (AC-1.1..AC-16.2) в EARS формате, 1:1 mapped с FR.

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 cucumber-js NDJSON output via AC-1.1 | FR-1, AC-1.1, @feature1, UC-3 | BDD scenario | Draft | Phase 0 deliverable |
| CHK-FR1-02 | FR-1 per-spec NDJSON split via AC-1.2 | FR-1, AC-1.2, @feature1 | Integration test | Draft | Bash post-test hook |
| CHK-FR1-03 | FR-1 mandatory additive for TS targets via AC-1.3 | FR-1, AC-1.3, @feature1 | Manual review | Draft | onboard-repo flow |
| CHK-FR1-04 | FR-1 + FR-2 + FR-4 + FR-6 end-to-end happy path | FR-1, FR-2, FR-4, FR-6, UC-1, UC-2, UC-10 | BDD scenario | Draft | Cross-FR integration |
| CHK-FR2-01 | FR-2 cold start ≤2s via AC-2.1 | FR-2, AC-2.1, @feature2 | Integration test | Draft | NFR-Performance-1 benchmark |
| CHK-FR2-02 | FR-2 incremental ≤100ms via AC-2.2 | FR-2, AC-2.2, @feature2 | Integration test | Draft | NFR-Performance-2 benchmark |
| CHK-FR3-01 | FR-3 dual-anchor for new headings via AC-3.1 | FR-3, AC-3.1, @feature3 | Unit test | Draft | Parser regex test |
| CHK-FR3-02 | FR-3 triple-anchor for legacy v3 via AC-3.2 | FR-3, AC-3.2, @feature3 | Unit test | Draft | Backward compat |
| CHK-FR3-03 | FR-3 wiki-link navigation via AC-3.3 | FR-3, AC-3.3, @feature3 | BDD scenario | Draft | End-to-end |
| CHK-FR4-01 | FR-4 get_trace structured + explanation via AC-4.1 | FR-4, AC-4.1, @feature4, UC-1 | BDD scenario | Draft | Primary tool |
| CHK-FR4-02 | FR-4 failing step in explanation via AC-4.2 | FR-4, AC-4.2, @feature4 | BDD scenario | Draft | Rich context |
| CHK-FR5-01 | FR-5 DUPLICATE_DEFINITION deny via AC-5.1 | FR-5, AC-5.1, @feature5, UC-9 | BDD scenario | Draft | Hard invariant |
| CHK-FR5-02 | FR-5 MALFORMED_FRONTMATTER deny via AC-5.2 | FR-5, AC-5.2, @feature5 | BDD scenario | Draft | YAML check |
| CHK-FR5-03 | FR-5 MALFORMED_GHERKIN deny via AC-5.3 | FR-5, AC-5.3, @feature5 | BDD scenario | Draft | .feature check |
| CHK-FR6-01 | FR-6 push within 3s window via AC-6.1 | FR-6, AC-6.1, @feature6, UC-2 | BDD scenario | Draft | Throttle behavior |
| CHK-FR6-02 | FR-6 bulk edit dedup via AC-6.2 | FR-6, AC-6.2, @feature6 | BDD scenario | Draft | Aggregation |
| CHK-FR6-03 | FR-6 silence flag escape hatch via AC-6.3 | FR-6, AC-6.3, @feature6 | BDD scenario | Draft | Red phase support |
| CHK-FR7-01 | FR-7 Marksman binary installed via AC-7.1 | FR-7, AC-7.1, @feature7 | Integration test | Draft | postInstall |
| CHK-FR7-02 | FR-7 fallback to JS LSP via AC-7.2 | FR-7, AC-7.2, @feature7 | Integration test | Draft | Network/offline |
| CHK-FR8-01 | FR-8 semantic drift detection via AC-8.1 | FR-8, AC-8.1, @feature8, UC-5 | BDD scenario | Draft | Phase 3 |
| CHK-FR8-02 | FR-8 default disabled via AC-8.2 | FR-8, AC-8.2, @feature8 | Unit test | Draft | Config gate |
| CHK-FR9-01 | FR-9 Reqnroll C# NDJSON via AC-9.1 | FR-9, AC-9.1, @feature9 | Integration test | Draft | Multi-lang Phase 3 |
| CHK-FR9-02 | FR-9 behave Python NDJSON via AC-9.2 | FR-9, AC-9.2, @feature9 | Integration test | Draft | Multi-lang Phase 3 |
| CHK-FR10-01 | FR-10 SQLite lock reuse via AC-10.1 | FR-10, AC-10.1, @feature10, UC-7 | Integration test | Draft | Phase 4 |
| CHK-FR10-02 | FR-10 cross-session consistency via AC-10.2 | FR-10, AC-10.2, @feature10 | Integration test | Draft | Single-writer |
| CHK-FR10-03 | FR-10 corruption recovery via AC-10.3 | FR-10, AC-10.3, @feature10 | Integration test | Draft | Failure mode |
| CHK-FR11-01 | FR-11 suggest-only diff via AC-11.1 | FR-11, AC-11.1, @feature11, UC-4 | BDD scenario | Draft | Phase 5 |
| CHK-FR11-02 | FR-11 interactive 30s timeout via AC-11.2 | FR-11, AC-11.2, @feature11 | BDD scenario | Draft | Default skip |
| CHK-FR11-03 | FR-3 + FR-11 backward compat migration end-to-end | FR-3, FR-11, UC-4 | BDD scenario | Draft | Cross-FR migration path |
| CHK-FR12-01 | FR-12 7-stage outputs via AC-12.1 | FR-12, AC-12.1, @feature12, UC-5 | BDD scenario | Draft | Phase 6 |
| CHK-FR12-02 | FR-12 rewind audit trail via AC-12.2 | FR-12, AC-12.2, @feature12 | BDD scenario | Draft | Stage loop |
| CHK-FR12-03 | FR-12 complexity heuristic via AC-12.3 | FR-12, AC-12.3, @feature12 | Unit test | Draft | Auto-trigger |
| CHK-FR13-01 | FR-13 orphan warn default via AC-13.1 | FR-13, AC-13.1, @feature13, UC-6 | BDD scenario | Draft | Red phase friendly |
| CHK-FR13-02 | FR-13 block escalation via AC-13.2 | FR-13, AC-13.2, @feature13 | BDD scenario | Draft | Config-driven |
| CHK-FR14-01 | FR-14 relative paths in devcontainer via AC-14.1 | FR-14, AC-14.1, @feature14, UC-8 | Integration test | Draft | Multi-env |
| CHK-FR14-02 | FR-14 polling auto-detect via AC-14.2 | FR-14, AC-14.2, @feature14 | Integration test | Draft | chokidar fallback |
| CHK-FR14-03 | FR-14 env-mismatch lock deny via AC-14.3 | FR-14, AC-14.3, @feature14 | BDD scenario | Draft | Multi-session safety |
| CHK-FR14-04 | FR-7 + FR-10 + FR-14 + FR-16 multi-env end-to-end | FR-7, FR-10, FR-14, FR-16, UC-7, UC-8 | Integration test | Draft | Cross-FR devcontainer/Codespaces |
| CHK-FR15-01 | FR-15 JSONL append on finding via AC-15.1 | FR-15, AC-15.1, @feature15 | BDD scenario | Draft | Phase 4 |
| CHK-FR15-02 | FR-15 size-based rotation via AC-15.2 | FR-15, AC-15.2, @feature15 | Unit test | Draft | 10MB threshold |
| CHK-FR16-01 | FR-16 Codespaces postStartCommand via AC-16.1 | FR-16, AC-16.1, @feature16 | Integration test | Draft | Phase 4 |
| CHK-FR16-02 | FR-16 hibernate resume ≤2s via AC-16.2 | FR-16, AC-16.2, @feature16 | Integration test | Draft | Performance |
| CHK-FR17-01 | FR-17 light mode produces YAML ≤5s via AC-17.1 | FR-17, AC-17.1, @feature17, UC-17 | Integration test | Draft | Phase 7 |
| CHK-FR17-02 | FR-17 CRITICAL emits AskUserQuestion with header ⚠️ CRIT via AC-17.2 | FR-17, AC-17.2, @feature17, UC-17 | BDD scenario | Draft | Phase 7 |
| CHK-FR17-03 | FR-17 acknowledge writes YAML fields + JSONL audit entry via AC-17.3 | FR-17, AC-17.3, @feature17 | BDD scenario | Draft | Phase 7 — uses scope-gate JSONL pattern |
| CHK-FR17-04 | FR-17 full mode invokes Agent subagent per pair via AC-17.4 | FR-17, AC-17.4, @feature17, UC-18 | Integration test | Draft | Phase 7 — subagent isolation R-4 |
| CHK-FR17-05 | FR-17 impl-drift/missing-file finding fields via AC-17.5 | FR-17, AC-17.5, @feature17, UC-18 | Unit test | Draft | Phase 7 |
| CHK-FR17-06 | FR-17 runtime-identifier-drift severity CRITICAL via AC-17.6 | FR-17, AC-17.6, @feature17 | Unit test | Draft | Phase 7 — hard-conflict subset |
| CHK-FR17-07 | FR-17 SARIF secondary output via AC-17.7 | FR-17, AC-17.7, @feature17 | Integration test | Draft | Phase 7 — Spectral pattern |
| CHK-FR17-08 | FR-17 dry-run skips file writes via AC-17.8 | FR-17, AC-17.8, @feature17 | BDD scenario | Draft | Phase 7 — mex precedent |
| CHK-FR18-01 | FR-18 missing report exits with hint via AC-18.1 | FR-18, AC-18.1, @feature18, UC-19 | BDD scenario | Draft | Phase 7 |
| CHK-FR18-02 | FR-18 5-field explanation before Edit via AC-18.2 | FR-18, AC-18.2, @feature18, UC-19 | BDD scenario | Draft | Phase 7 — explain-then-confirm |
| CHK-FR18-03 | FR-18 Path A/B/C alternatives via AC-18.3 | FR-18, AC-18.3, @feature18, UC-20 | BDD scenario | Draft | Phase 7 — architectural fork UX |
| CHK-FR18-04 | FR-18 batch re-check updates resolution_status via AC-18.4 | FR-18, AC-18.4, @feature18, UC-19 | Integration test | Draft | Phase 7 |
| CHK-FR18-05 | FR-18 foreign-spec edit additional confirm via AC-18.5 | FR-18, AC-18.5, @feature18, UC-21 | BDD scenario | Draft | Phase 7 — cross-spec stale-state |
| CHK-FR29-01 | FR-29 implements edges + File nodes via AC-29.1/29.2/29.3 | FR-29, AC-29.1, AC-29.2, AC-29.3, @feature29, UC-1 | Integration test | Draft | Gap-close — builder.ts wiring |
| CHK-FR30-01 | FR-30 code_impl[] in get_trace via AC-30.1/30.2 | FR-30, AC-30.1, AC-30.2, @feature30, UC-1 | Integration test | Draft | Gap-close — MCP response shape; depends on FR-29 |
| CHK-FR31-01 | FR-31 real multi-lang NDJSON fixtures + roundtrip via AC-31.1/31.2 | FR-31, AC-31.1, AC-31.2, @feature31, UC-3 | Integration test | Draft | Gap-close — replaces inline-string NDJSON unit tests |
| CHK-FR29-02 | FR-29 BDD scenarios + step defs cover AC-29.1/29.2/29.3 | FR-29, AC-29.1, AC-29.2, AC-29.3, @feature29 | BDD scenario | Draft | Phase 8 — SCENGEN004_55..59 |
| CHK-FR30-02 | FR-30 BDD scenarios + step defs cover AC-30.1/30.2 | FR-30, AC-30.1, AC-30.2, @feature30 | BDD scenario | Draft | Phase 8 — SCENGEN004_60..64 |
| CHK-FR31-02 | FR-31 BDD scenarios + step defs cover AC-31.1/31.2 | FR-31, AC-31.1, AC-31.2, @feature31 | BDD scenario | Draft | Phase 8 — SCENGEN004_65..69 |
| CHK-MANUAL-E2E-01 | Manual agent walkthrough produces MANUAL_AGENT_E2E_WALKTHROUGH.md proof artifact with tool-invocation log + per-phase verdict | FR-4, FR-29, FR-30, FR-31, UC-1 | Manual review | Draft | Phase 8 — Claude-as-agent end-to-end run |
| CHK-FIXTURE-SHAPES-01 | 5-shape fixture corpus tested in tests/e2e/fixture-shapes.test.ts (one it() per shape) | FR-2, FR-3, FR-5, FR-29, F-21, F-22, F-23, F-24, F-25 | Integration test | Draft | Phase 8 — SHAPE001..SHAPE005 |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 62 (57 prior + 5 Phase 8 gap-close: FR-29-02, FR-30-02, FR-31-02, MANUAL-E2E-01, FIXTURE-SHAPES-01)
- Verified: 0
- In Progress: 0
- Draft: 62
- Blocked: 0
- Blocked: 0
