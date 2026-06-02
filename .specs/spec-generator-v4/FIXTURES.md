# Fixtures

## Overview

BDD fixtures for v4 self-test cover parser regression + scenario isolation. Three main categories:

1. **Real-world spec copies** — `.specs/personal-pomogator/` + `.specs/codex-cli-support/` (both real v3-format specs in this repo) + a synthesized minimal v3-format sample under `tests/fixtures/v3-format-sample/` are copied as fixtures for parser regression. Guarantees backward compat (v4 works on existing v3-format specs). The former `.specs/spec-generator-v3/` was consolidated into v4 on 2026-05-28; v3 BDD contract lives at `.specs/spec-generator-v4/legacy-v3.feature`.
2. **Synthetic large-spec benchmark** — generated 30 specs × ~10 MDs × 3 .feature files для NFR-Performance-1/2 benchmarks (cold start ≤2s, incremental ≤100ms).
3. **Error-case fixtures** — namespace для PreToolUse HARD hook regression (DUPLICATE_DEFINITION, MALFORMED_FRONTMATTER, MALFORMED_GHERKIN) + orphan policy scenarios.
4. **Cucumber Messages NDJSON samples** — canonical NDJSON pre-recorded для ingester unit-tests (без необходимости запускать full BDD).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | personal-pomogator spec copy | static | `tests/fixtures/v4-self-test/.specs/personal-pomogator/` | shared | BeforeAll hook |
| F-2 | codex-cli-support spec copy | static | `tests/fixtures/v4-self-test/.specs/codex-cli-support/` | shared | BeforeAll hook |
| F-3 | v3-format spec sample | static | `tests/fixtures/v4-self-test/.specs/v3-format-sample/` (synthesized minimal v3 spec; the former `.specs/spec-generator-v3/` was consolidated into this v4 spec on 2026-05-28) | shared | BeforeAll hook |
| F-4 | Real .feature files | static | `tests/fixtures/v4-self-test/features/*.feature` | shared | BeforeAll hook |
| F-5 | Canonical NDJSON sample | static | `tests/fixtures/ndjson/sample.ndjson` | shared | BeforeAll hook |
| F-6 | NDJSON with FAILED scenarios | static | `tests/fixtures/ndjson/failed-cases.ndjson` | shared | BeforeAll hook |
| F-7 | NDJSON truncated (incomplete run) | static | `tests/fixtures/ndjson/truncated.ndjson` | shared | BeforeAll hook |
| F-8 | corrupt-frontmatter.md | static | `tests/fixtures/error-cases/corrupt-frontmatter.md` | per-scenario | Before hook copy to temp |
| F-9 | duplicate-fr.md | static | `tests/fixtures/error-cases/duplicate-fr.md` | per-scenario | Before hook copy to temp |
| F-10 | malformed-gherkin.feature | static | `tests/fixtures/error-cases/malformed-gherkin.feature` | per-scenario | Before hook copy to temp |
| F-11 | orphan-tagged.feature | static | `tests/fixtures/error-cases/orphan-tagged.feature` | per-scenario | Before hook copy to temp |
| F-12 | untagged-scenarios.feature | static | `tests/fixtures/error-cases/untagged-scenarios.feature` | per-scenario | Before hook copy to temp |
| F-13 | legacy-v3-heading.md | static | `tests/fixtures/v3-legacy/legacy-v3-heading.md` | per-scenario | Before hook |
| F-14 | Synthetic 30-spec benchmark | factory | `tests/fixtures/large-spec/` (gen script) | shared (read-only) | npm run gen-large-fixture |
| F-15 | MCP server subprocess | container | spawned per feature | per-feature | BeforeFeature hook |
| F-16 | temp workspace dir | per-scenario factory | os.tmpdir()/v4-test-{uuid} | per-scenario | Before hook |
| F-17 | .mcp-lock.json fixtures | static | `tests/fixtures/locks/{host,container,wsl,codespaces,stale}.json` | per-scenario | Before hook |
| F-18 | .spec-config.json variants | static | `tests/fixtures/configs/{default,strict-orphans,no-throttle,semantic-on}.json` | per-scenario | Before hook |
| F-19 | Reqnroll NDJSON output sample | static | `tests/fixtures/ndjson/reqnroll-sample.ndjson` | shared | BeforeAll hook |
| F-20 | behave NDJSON output sample | static | `tests/fixtures/ndjson/behave-sample.ndjson` | shared | BeforeAll hook |
| F-21 | minimal-spec (empty edges) | static | `tests/fixtures/specs/minimal-spec/` | per-scenario | Before hook copy to temp |
| F-22 | no-scenarios-spec (FRs without .feature) | static | `tests/fixtures/specs/no-scenarios-spec/` | per-scenario | Before hook copy to temp |
| F-23 | conflicting-fr-spec (duplicate FR ID) | static | `tests/fixtures/specs/conflicting-fr-spec/` | per-scenario | Before hook copy to temp |
| F-24 | v3-legacy-spec (mixed dual/triple anchor) | static | `tests/fixtures/specs/v3-legacy-spec/` | per-scenario | Before hook copy to temp |
| F-25 | deep-multi-fr-refs-spec (dense cross-refs) | static | `tests/fixtures/specs/deep-multi-fr-refs-spec/` | shared | BeforeAll hook |

> Note: F-21 in the original migration plan referenced SQLite corruption (line 168). Reassign that to **F-26** in the Phase 4 row (see below); use F-21..F-25 for the new shape corpus here.

## Fixture Details

### F-1: personal-pomogator spec copy

- **Type:** static (file copy)
- **Format:** Markdown files (`FR.md`, `NFR.md`, `ACCEPTANCE_CRITERIA.md`, `DESIGN.md`, `TASKS.md`, etc.)
- **Setup:** `cp -r .specs/personal-pomogator/ tests/fixtures/v4-self-test/.specs/personal-pomogator/` once at Phase 0 bootstrap
- **Teardown:** none (read-only fixture, immutable)
- **Dependencies:** none
- **Used by:** SPECGEN004_03 (cold start benchmark), SPECGEN004_05, SPECGEN004_06 (parser tests)
- **Assumptions:** v3 spec format `### Requirement: FR-N` headings present + at least one `.feature` file

### F-5: Canonical NDJSON sample

- **Type:** static
- **Format:** Cucumber Messages NDJSON (one JSON envelope per line)
- **Setup:** Pre-recorded from successful cucumber-js test run on personal-pomogator fixture
- **Teardown:** none (read-only)
- **Dependencies:** F-4 (.feature files used to generate this NDJSON)
- **Used by:** SPECGEN004_02 (per-spec split), SPECGEN004_07/08 (get_trace with test results)
- **Assumptions:** Contains all 21 envelope types referenced in SCHEMA.md Entity 2

### F-9: duplicate-fr.md (error case)

- **Type:** static
- **Format:** Markdown with two `### FR-001:` headings
- **Setup:** Before hook copies to temp workspace dir
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16 (temp workspace)
- **Used by:** SPECGEN004_09 (DUPLICATE_DEFINITION hook test)
- **Assumptions:** Triggers DUPLICATE_DEFINITION finding when parsed; test asserts Write is DENIED

### F-14: Synthetic 30-spec benchmark

- **Type:** factory (generated)
- **Format:** 30 spec folders × 10 MDs + 3 .feature files = ~330 files
- **Setup:** `npm run gen-large-fixture` (TypeScript script generates synthetic but realistic-shaped spec content)
- **Teardown:** none (committed to repo for reproducible benchmarks; regenerate only if structure changes)
- **Dependencies:** none
- **Used by:** SPECGEN004_03 (cold start ≤2s NFR-Performance-1 benchmark), SPECGEN004_04 (incremental ≤100ms p95)
- **Assumptions:** File count + folder structure matches typical real-world dev-pomogator project usage

### F-15: MCP server subprocess

- **Type:** container (subprocess)
- **Format:** Node.js process spawned via `child_process.spawn('node', ['.dev-pomogator/bin/spec-mcp-server.js'])` with stdio pipes
- **Setup:** `BeforeFeature` hook spawns process, establishes JSON-RPC connection, awaits `initialize` response
- **Teardown:** `AfterFeature` hook sends `shutdown` request + `exit` notification, awaits process exit
- **Dependencies:** F-3 (v3-format sample or other fixtures depending on scenario)
- **Used by:** All scenarios that call MCP tools (~25 of 37)
- **Assumptions:** MCP server binary built and present in `.dev-pomogator/bin/`

### F-17: .mcp-lock.json fixtures

- **Type:** static
- **Format:** JSON files matching SCHEMA.md Entity 4
- **Setup:** Before hook copies relevant variant (`host.json`, `container.json`, `wsl.json`, `codespaces.json`, `stale.json`) to temp workspace
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16 (temp workspace)
- **Used by:** SPECGEN004_33 (multi-env lock deny), edge cases for lock manager
- **Assumptions:** `stale.json` has pid=99999 (guaranteed dead), other variants have alive pid=process.pid

### F-21: minimal-spec (empty edges shape)

- **Type:** static (file copy)
- **Format:** `README.md` + `FR.md` (1 FR, 0 AC, 0 scenarios, 0 tasks); `FILE_CHANGES.md` with header only, zero data rows
- **Setup:** Before hook copies fixture dir to temp workspace
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16 (temp workspace)
- **Used by:** `tests/e2e/fixture-shapes.test.ts` → SHAPE001 (`SPECGEN004_58` empty FILE_CHANGES → 0 edges)
- **Assumptions:** Builder MUST NOT crash on empty edges; returned graph has zero `File` nodes and zero `implements` edges

### F-22: no-scenarios-spec (FRs without .feature)

- **Type:** static (file copy)
- **Format:** `FR.md` (5 FRs FR-1..FR-5) + `ACCEPTANCE_CRITERIA.md` (5 ACs) + NO `.feature` file
- **Setup:** Before hook copies to temp workspace
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16
- **Used by:** `tests/e2e/fixture-shapes.test.ts` → SHAPE002 (orphan + coverage queries)
- **Assumptions:** `get_coverage_summary` returns `{scenarios: 0, fr_covered: 0}`; `find_orphans` flags all 5 FRs as `UNCOVERED`

### F-23: conflicting-fr-spec (duplicate FR ID)

- **Type:** static (file copy)
- **Format:** `FR.md` containing two distinct headings `### FR-1: Login` (duplicate ID, different bodies)
- **Setup:** Before hook copies to temp workspace
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16
- **Used by:** `tests/e2e/fixture-shapes.test.ts` → SHAPE003 (PreToolUse hard hook DUPLICATE_DEFINITION DENY)
- **Assumptions:** `spec-conformance-guard` exits PreToolUse decision = `deny` with finding code `DUPLICATE_DEFINITION` on `Write`/`Edit` attempt

### F-24: v3-legacy-spec (mixed dual/triple anchor)

- **Type:** static (file copy)
- **Format:** `FR.md` containing BOTH old-format `### Requirement: FR-1 Login` AND new-format `### FR-2: Logout {#fr-2}` headings in the same file
- **Setup:** Before hook copies to temp workspace
- **Teardown:** After hook removes temp dir
- **Dependencies:** F-16
- **Used by:** `tests/e2e/fixture-shapes.test.ts` → SHAPE004 (parser regression — triple-anchor + dual-anchor coexist)
- **Assumptions:** MD parser yields `FR` nodes for both headings; triple-anchor heading is NOT flagged as `MALFORMED_HEADING`

### F-25: deep-multi-fr-refs-spec (dense cross-refs)

- **Type:** static (file copy)
- **Format:** `FR.md` (10 FRs) + `ACCEPTANCE_CRITERIA.md` (15 ACs each citing 2-3 FRs) + `<slug>.feature` (8 scenarios each tagged with 2 `@FR-N`) + `TASKS.md` (12 tasks each referencing 1-2 FRs) + `FILE_CHANGES.md` with 5 unique paths cited by FRs
- **Setup:** BeforeAll hook (shared, immutable)
- **Teardown:** none
- **Dependencies:** none
- **Used by:** `tests/e2e/fixture-shapes.test.ts` → SHAPE005; also consumed by SCENGEN004_55 (5-path File node emission); NFR-Performance density check (`get_trace` ≤200ms p95 on dense graph)
- **Assumptions:** Graph contains 10 FR + 15 AC + 8 Scenario + 12 Task + 5 File nodes; ≥60 edges total; `get_trace` for any single FR returns within 200ms p95

## Dependencies Graph

```
F-16 (temp workspace) ────┐
                          ├─► F-8/F-9/F-10/F-11/F-12/F-13/F-17/F-18 (per-scenario copies)
F-1/F-2/F-3 (spec copies)─┤
F-4 (.feature files) ─────┘
F-5/F-6/F-7/F-19/F-20 (NDJSON samples) ───► F-15 (MCP server) ──► Most scenarios
F-14 (large-spec) ────────► NFR benchmarks
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | SPECGEN004_01 (NDJSON output) | F-3, F-4 + cucumber-js runtime | none |
| @feature1 | SPECGEN004_02 (per-spec split) | F-5 | none |
| @feature2 | SPECGEN004_03 (cold start ≤2s) | F-14 (30-spec benchmark) | none |
| @feature2 | SPECGEN004_04 (incremental ≤100ms) | F-14 | none |
| @feature3 | SPECGEN004_05 (dual-anchor new) | F-1/F-2/F-3 | none |
| @feature3 | SPECGEN004_06 (triple-anchor legacy) | F-13 (legacy heading) | none |
| @feature4 | SPECGEN004_07 (get_trace structured + explanation) | F-1, F-5, F-15 | none |
| @feature4 | SPECGEN004_08 (failing step in explanation) | F-6 (FAILED scenarios NDJSON) | none |
| @feature5 | SPECGEN004_09 (DUPLICATE_DEFINITION deny) | F-9 | none |
| @feature5 | SPECGEN004_10 (MALFORMED_FRONTMATTER deny) | F-8 | none |
| @feature5 | SPECGEN004_11 (MALFORMED_GHERKIN deny) | F-10 | none |
| @feature6 | SPECGEN004_12/_13 (throttle, dedup) | F-15 + dynamic fixtures | none |
| @feature6 | SPECGEN004_14 (silence flag) | F-1 + frontmatter mutation in Before hook | none |
| @feature7 | SPECGEN004_15 (Marksman installed) | Real install flow (CI) | gap: requires CI for full verification; smoke test only locally |
| @feature7 | SPECGEN004_16 (fallback to JS LSP) | Mock Marksman absent via F-18 config | none |
| @feature8 | SPECGEN004_17 (semantic drift) | F-1 + F-15 + F-18 (semantic-on config) | gap: requires Claude CLI installed in test env |
| @feature8 | SPECGEN004_18 (default disabled) | F-1 + F-18 (default config) | none |
| @feature9 | SPECGEN004_19 (Reqnroll NDJSON) | F-19 | none |
| @feature9 | SPECGEN004_20 (behave NDJSON) | F-20 | none |
| @feature10 | SPECGEN004_21/_22 (SQLite cross-session) | F-15 multi-instance + F-18 sqlite-on | gap: Phase 4 deliverable, Phase 2 covers in-memory only |
| @feature10 | SPECGEN004_23 (SQLite corruption recovery) | Synthetic corrupt SQLite file fixture (TBD) | gap: fixture not in inventory yet; add F-21 in Phase 4 |
| @feature11 | SPECGEN004_24/_25 (migration helper) | F-3 (v3-format sample as migration source) | none |
| @feature12 | SPECGEN004_26/_27/_28 (arch-research skill) | Synthetic feature description fixtures (TBD) | gap: add F-22 in Phase 6 (synthetic feature inputs for dogfood test) |
| @feature13 | SPECGEN004_29 (orphan warn default) | F-11 + F-18 (default) | none |
| @feature13 | SPECGEN004_30 (orphan block escalation) | F-11 + F-18 (strict-orphans config) | none |
| @feature14 | SPECGEN004_31 (relative paths) | F-15 inside Docker container fixture (TBD) | gap: requires Docker setup; CI-only test |
| @feature14 | SPECGEN004_32 (polling auto-detect) | F-15 + mocked slow FS via touch test | none |
| @feature14 | SPECGEN004_33 (multi-env lock deny) | F-17 (variant locks) | none |
| @feature15 | SPECGEN004_34/_35 (side-channel log + rotation) | F-15 + log file inspection | gap: Phase 4 deliverable |
| @feature16 | SPECGEN004_36/_37 (Codespaces) | Mocked Codespaces env (CODESPACES=true) | gap: full E2E needs actual Codespace, smoke test mocks env var |
| @feature29 | SPECGEN004_55..SPECGEN004_59 | F-25, F-21 (empty), F-16 | none |
| @feature30 | SPECGEN004_60..SPECGEN004_64 | F-25, F-15 | none |
| @feature31 | SPECGEN004_65..SPECGEN004_69 | reqnroll-sample, behave-sample, jvm-sample, F-15 | none |

## Notes

### Cleanup order

1. **Per-scenario** (After hook): remove temp workspace dir created by Before hook; clear MCP server in-memory graph via internal `clear_index` admin tool
2. **Per-feature** (AfterFeature hook): send `shutdown` + `exit` to MCP subprocess, await exit code 0; remove SQLite fixture if used
3. **Per-test-suite** (AfterAll hook): cleanup all NDJSON output files generated during run; reset chokidar watchers; clear any stale lock files

### Known issues

- **Marksman binary download** in CI requires network access — flaky on offline CI; skip via env var `SKIP_MARKSMAN_INSTALL=1` and use mocked LSP for those tests
- **SQLite corruption fixture** (F-21, Phase 4) — TBD; will create deliberately-corrupt SQLite file via `dd if=/dev/urandom` overlay
- **Codespaces full E2E** — only mockable in CI (no real Codespace), accept smoke-test coverage
- **`large-spec` fixture regeneration** — invalidates cached benchmarks; document baseline in REGEN_BASELINE.md when regenerating

### Migration plan (cross-phase fixture additions)

| Phase | New fixtures |
|-------|--------------|
| Phase 0 | F-1..F-7 (spec copies + NDJSON samples), F-15 (MCP subprocess), F-16 (temp workspace) |
| Phase 1 | F-8..F-13 (error cases + legacy v3) |
| Phase 2 | F-17 (.mcp-lock variants), F-18 (.spec-config variants) |
| Phase 3 | F-19/F-20 (Reqnroll/behave NDJSON samples) |
| Phase 4 | F-26 (SQLite corruption — renumbered from prior F-21), F-27 (Codespaces env mock), large-spec increase |
| Phase 6 | F-28 (synthetic feature description for arch-research dogfood — renumbered from prior F-22) |
| Phase 8 | F-21..F-25 (5-shape fixture corpus for FR-29/30/31 gap-close) |

### Cascading dependencies

- F-15 (MCP server subprocess) depends on built binary at `.dev-pomogator/bin/spec-mcp-server.js` — must run `npm run build` before BDD test suite
- F-14 (large-spec) generated lazily on first request; cached in repo to ensure reproducibility
- F-1/F-2/F-3 must be updated when source `.specs/personal-pomogator/` etc. change structurally — add to `npm run sync-fixtures` script

### Phase 7 fixtures (Cross-spec reconciliation)

| Fixture | Path | Purpose | Lifecycle |
|---------|------|---------|-----------|
| `cross-spec-corpus/spec-a/FR.md` | `tests/fixtures/cross-spec-corpus/spec-a/FR.md` | Declares `feedback_key = "session_token"` referencing `src/auth/jwt.ts`; baseline for cross-spec/runtime-identifier-drift detection | shared (read-only) |
| `cross-spec-corpus/spec-a/DESIGN.md` | `tests/fixtures/cross-spec-corpus/spec-a/DESIGN.md` | Declares latency budget <100ms on `/api/auth` endpoint; baseline for cross-spec/nfr-conflict pairing | shared (read-only) |
| `cross-spec-corpus/spec-b/FR.md` | `tests/fixtures/cross-spec-corpus/spec-b/FR.md` | Declares same concept as `sessionToken` (RUNTIME_IDENTIFIER_DRIFT vs spec-a) + same file path (MODULE_OWNERSHIP_CONFLICT) | shared (read-only) |
| `cross-spec-corpus/spec-b/DESIGN.md` | `tests/fixtures/cross-spec-corpus/spec-b/DESIGN.md` | Declares latency budget <50ms on the same endpoint (NFR_CONFLICT vs spec-a) | shared (read-only) |
| `cross-spec-corpus/spec-c/FR.md` | `tests/fixtures/cross-spec-corpus/spec-c/FR.md` | Declares MCP tool `validate_user` with no implementation file present (MISSING_FILE + MCP_TOOL_DRIFT) | shared (read-only) |
| `cross-spec-corpus/README.md` | `tests/fixtures/cross-spec-corpus/README.md` | Documents intentional conflicts + expected finding codes per scenario | shared (read-only) |
| `cross-spec-cache-sample/<hash>.json` | `tests/fixtures/cross-spec-cache-sample/` | Pre-recorded Agent subagent response for one fixture pair — used by unit tests to bypass live LLM call | shared (read-only) |
| `consistency-report-sample.yaml` | `tests/fixtures/cross-spec-corpus/consistency-report-sample.yaml` | Reference output for resolve-skill input fixture tests | shared (read-only) |
| `cross-spec-overrides-sample.jsonl` | `tests/fixtures/cross-spec-corpus/cross-spec-overrides-sample.jsonl` | Reference JSONL audit-log content used by override-flow tests | shared (read-only) |

Expected finding codes when reconcile is run against the full corpus:

- `cross-spec/runtime-identifier-drift` — spec-a vs spec-b (CRITICAL)
- `cross-spec/module-ownership-conflict` — spec-a vs spec-b on `src/auth/jwt.ts` (CRITICAL)
- `cross-spec/nfr-conflict` — spec-a vs spec-b on `/api/auth` latency (WARNING)
- `impl-drift/missing-file` — spec-c references `src/mcp/validate_user.ts` (WARNING)
- `impl-drift/mcp-tool-drift` — spec-c declares MCP tool not exported (WARNING)

### Phase 8 fixtures (FR-29/30/31 gap-close)

| Fixture | Path | Purpose | Lifecycle |
|---------|------|---------|-----------|
| `specs/minimal-spec/README.md` + `FR.md` + empty `FILE_CHANGES.md` | `tests/fixtures/specs/minimal-spec/` | Empty-edges shape — builder must not crash on zero `implements` (SCENGEN004_58 / SHAPE001) | per-scenario (Before hook copy) |
| `specs/no-scenarios-spec/{FR.md,ACCEPTANCE_CRITERIA.md}` | `tests/fixtures/specs/no-scenarios-spec/` | 5 FRs + 5 ACs + zero `.feature` files; flags all FRs UNCOVERED (SHAPE002) | per-scenario |
| `specs/conflicting-fr-spec/FR.md` | `tests/fixtures/specs/conflicting-fr-spec/` | Two `### FR-1:` headings in one file — DUPLICATE_DEFINITION hook DENY path (SHAPE003) | per-scenario |
| `specs/v3-legacy-spec/FR.md` | `tests/fixtures/specs/v3-legacy-spec/` | Mixed old `### Requirement: FR-1` + new `### FR-2: {#fr-2}` headings — backward-compat parser proof (SHAPE004) | per-scenario |
| `specs/deep-multi-fr-refs-spec/` (5 files) | `tests/fixtures/specs/deep-multi-fr-refs-spec/` | 10 FR × 15 AC × 8 Scenario × 12 Task × 5 File; dense cross-refs for `get_trace` perf + SCENGEN004_55 (5 unique paths → 5 File nodes) | shared (read-only) |
| `reqnroll-sample/{output.ndjson,README.md}` | `tests/fixtures/reqnroll-sample/` | Real Reqnroll NDJSON output + reproduction README (SCENGEN004_65, FR-31 AC-31.1) | shared |
| `behave-sample/{output.ndjson,README.md}` | `tests/fixtures/behave-sample/` | Real behave NDJSON output + reproduction README (SCENGEN004_66, FR-31 AC-31.2) | shared |
| `jvm-sample/{output.ndjson,README.md}` | `tests/fixtures/jvm-sample/` | Real cucumber-jvm NDJSON output + reproduction README (SCENGEN004_67) | shared |
