# spec-generator-v4 — mutation test-quality audit (2026-06-15)

Two-part map of test strength across the whole v4 code surface (120 source files in
`tools/{spec-graph,spec-mcp-server,specs-validator,specs-generator,spec-conformance-guard,spec-conformance-push,spec-check-log,spec-backlog}`):

1. **Coverage partition** (free, from import-graph grep) — which files a unit test
   actually imports, so mutation can measure them; which have none.
2. **Mutation score per covered file** (Stryker `perTest`, `npm run mutation:specgen`)
   — of the files that ARE unit-tested, which have WEAK tests (mutants survive).

Method: `.dev-pomogator/.tmp/v4-coverage-partition.mjs` for part 1; `stryker.specgen.config.mjs`
+ `vitest.specgen.config.ts` for part 2. Only module-IMPORTING tests count — a
spawnSync/e2e-only suite cannot be traced by Stryker (subprocess boundary), so its
target lands in the "no mutation-testable coverage" bucket regardless of e2e runs.

## Part 1 — coverage partition (120 files)

| Bucket | Count | Meaning |
|---|---|---|
| Unit-import covered | 44 | a `__tests__` test imports it → mutation-testable (Part 2) |
| e2e-import only | 15 | covered, but only by slow e2e — excluded from the unit sweep |
| **Zero importing test** | **61** | **no test imports it → test strength cannot be measured** |

### Zero unit-test coverage (61) — the headline gap

Grouped by directory. Some are CLI entry / eval / benchmark scripts (expected to lack
unit tests — marked ⓘ); the rest are logic/guards that SHOULD have unit tests (⚠).

- **specs-validator (20)** ⚠ — `validate-specs`, `task-form-guard`, `user-story-form-guard`,
  `requirements-chk-guard`, `risk-assessment-guard`, `design-decision-guard`,
  `extension-json-meta-guard`, `form-guards-dispatch`, `spec-access-guard`, `phase-gate`,
  `architecture-gate`, `completeness`, `audit-runner`, `audit-logger`, `ack-summary`,
  `reporter`, `spec-form-parsers`, `parsers/feature-parser`, `parsers/md-parser`,
  `parsers/tag-utils`. The form-guards + gates are enforcement logic running with no unit test.
- **specs-generator (16)** — `spec-verdict` ⚠, `audit-spec` ⚠, `validate-spec` ⚠,
  `analyze-features` ⚠, `bdd-framework-detector` ⚠, `fill-template`, `list-specs`,
  `scaffold-spec`, `spec-status`, `variant-matrix/variant-matrix-cli` ⓘ,
  `architecture-decision/{arch-review, architecture-decision-cli ⓘ, escape-log, full-report, live-fetch, synthesis}`.
- **spec-graph (11)** ⚠ — `traceability`, `legs`, `research-trace`, `upstream-trace`,
  `project-test-trace`, `phase-lifecycle`, `collision-probe`, `test-quality-gate`,
  `test-quality-producer`, `parsers/design`, `parsers/file-changes`. Core graph logic untested.
- **spec-backlog (5+ evals)** — `auto-ingest-hook`, `cli` ⓘ, `session-summary-hook`,
  `resolvers/normalize-evidence`, `resolvers/types`, + `evals/*` ⓘ.
- **spec-mcp-server (3)** — `set-status` ⚠, `spec-access-log`, `dogfood-dataset` ⓘ.

### e2e-import only (15) — covered but outside the fast unit sweep

`specs-validator/{audit-checks, matcher, phase-constants, parsers/test-parser}`,
`specs-generator/variant-matrix/{audit, parsers, escape-log, trigger-phrases}`,
`specs-generator/architecture-decision/{audit, artefact-generator, axis-detector, html-renderer, index-compiler, open-in-browser, verify-log}`.
(audit-checks is also unit-covered via `tests/e2e/audit-checks.test.ts` property suite.)

## Part 2 — mutation score per covered file (44)

Run with `coverageAnalysis: perTest` + `ignoreStatic: true` (static const/regex mutants
skipped — they dominate wall-clock and are mostly char-shuffle noise; score reflects
in-FUNCTION logic). Total% counts no-coverage mutants against the file; covered% does not.

### spec-graph (16 files) — overall 51.57% 🟢 (`Done in 12m`)

| File | score% | survived | verdict |
|---|---|---|---|
| `task-census.ts` | 82.9 | 24 | 🟢 strong |
| `wikilinks.ts` | 80.0 | 9 | 🟢 strong |
| `gherkin.ts` | 77.4 | 14 | 🟢 strong |
| `task-lifecycle.ts` | 76.3 | 10 | 🟢 strong |
| `coverage.ts` | 73.7 | 33 | 🟢 strong |
| `ndjson.ts` | 63.4 | 73 | 🟡 ok |
| `builder.ts` | 63.0 | 73 | 🟡 ok |
| `md.ts` | 59.7 | 88 | 🟡 ok |
| `corpus-health.ts` | 45.1 | 51 | 🟠 borderline |
| `stale-marker-scan.ts` | 44.4 | 5 | 🟠 borderline (tiny) |
| `tasks.ts` | **41.9** | 60 | 🔴 weak — TASKS.md parser |
| `fr-census.ts` | **39.4** | 119 | 🔴 weak (in-function; render/sort were static, skipped here) |
| `multilang.ts` | 35.7 | 9 (+54 no-cov) | 🟠 covered 79.6%, many uncovered branches |
| `incremental.ts` | **36.5** | 54 | 🔴 weak — incremental rebuild |
| `conformance.ts` | **34.9** | **268** | 🔴 WEAKEST big file — the conformance checker |
| `test_quality_gate_stop.ts` | 12.5 | (84 no-cov) | ⚪ Stop-hook, mostly untested paths |

**spec-graph weak spots to harden:** `conformance.ts` (34.9%, 268 survivors — highest-value target), `incremental.ts`, `fr-census.ts` in-function logic, `tasks.ts`.

### tail + backlog (19 files) — overall 51.71% 🟢 (`Done in 9m`)

| File | score% | survived | verdict |
|---|---|---|---|
| `spec-backlog/resolvers/registry.ts` | 100.0 | 0 | 🟢 strong |
| `spec-check-log/writer.ts` | 77.4 | 18 | 🟢 strong |
| `spec-backlog/resolvers/cross-ref-linker.ts` | 74.7 | 43 | 🟢 strong |
| `spec-check-log/cli.ts` | 67.9 | 53 | 🟡 ok |
| `spec-backlog/resolvers/scenario-writer.ts` | 66.7 | 22 | 🟡 ok |
| `spec-backlog/writer.ts` | 63.5 | 23 | 🟡 ok |
| `specs-validator/conformance-summary.ts` | 62.4 | 37 | 🟡 ok |
| `spec-conformance-guard.ts` | 61.7 | 57 | 🟡 ok |
| `spec-backlog/resolvers/fr-author.ts` | 57.4 | 53 | 🟡 ok |
| `spec-backlog/resolvers/wrap-deprecated-ref.ts` | 57.0 | 66 | 🟡 ok |
| `spec-backlog/resolvers/ac-author.ts` | 55.2 | 29 | 🟡 ok |
| `spec-backlog/resolvers/decision-arbiter.ts` | 53.3 | 66 | 🟡 ok |
| `spec-backlog/resolvers/link-fixer.ts` | 53.4 | 30 | 🟡 ok |
| `spec-conformance-push.ts` | 51.2 | 45 | 🟡 ok |
| `specs-generator/legacy-judge.ts` | 51.1 | 40 | 🟡 ok |
| `spec-backlog/resolvers/owner-picker.ts` | **39.0** | 96 | 🔴 weak |
| `spec-backlog/classifier.ts` | **37.1** | 103 (+150 no-cov) | 🔴 weak |
| `specs-generator/legacy-triage.ts` | **31.7** | 114 | 🔴 weak |
| `specs-generator/spec-archive.ts` | **25.4** | 34 (+110 no-cov) | 🔴 weakest of batch |

**tail+backlog weak spots to harden:** `spec-archive.ts` (25%), `legacy-triage.ts` (32%), `classifier.ts` (37%, +150 no-cov), `owner-picker.ts` (39%).

### spec-mcp-server (6 of 7 files; `server.ts` un-mutatable) — overall 28.9% 🔴

| File | score% | survived | verdict |
|---|---|---|---|
| `sqlite/wrapper.ts` | 76.3 | 15 | 🟢 strong |
| `lock-manager.ts` | 75.8 | 24 | 🟢 strong |
| `codespaces-autostart.ts` | 56.5 | 16 | 🟡 ok |
| `mutations.ts` | **40.5** | 133 (+130 no-cov) | 🔴 weak — the door write/validation logic |
| `lifecycle.ts` | **37.3** | 30 (+39 no-cov) | 🔴 weak |
| `tools.ts` | **19.8** | **500 (+1082 no-cov)** | 🔴 **WEAKEST file in all of v4** — the MCP tool registry |
| `server.ts` | — | — | ⏸ un-mutatable (see below) |

**`server.ts` — isolated by bisection as the sole parse-error file.** Every batch
containing it crashed at dry-run; every batch without it ran. Its Stryker-instrumented
output makes vite's import scanner throw "invalid JS syntax / JSX" — NOT reproducible by
esbuild (`ts`/`tsx`) on the original or instrumented copy. This is a **Stryker+vite tooling
interaction** (likely a generic `<T>` in instrumented output misread as JSX), **not** a
test-quality or v4-code defect. To mutation-test it, either bundle/strip its generics for
the run or upgrade Stryker/vite; out of scope for this audit.

## Summary — where v4's tests are weakest

41 of 42 unit-covered files scored (server.ts tooling-blocked). Highest-value hardening
targets, by how much a weak test lets real breakage slip through:

1. `spec-mcp-server/tools.ts` — **19.8%** (the MCP tool registry; 500 survivors)
2. `specs-generator/spec-archive.ts` — 25.4%
3. `specs-generator/legacy-triage.ts` — 31.7%
4. `spec-graph/conformance.ts` — 34.9% (268 survivors — biggest single survivor count)
5. `spec-graph/incremental.ts` — 36.5%, `spec-backlog/classifier.ts` — 37.1%, `spec-mcp-server/lifecycle.ts` — 37.3%
6. `spec-backlog/resolvers/owner-picker.ts` — 39.0%, `spec-graph/fr-census.ts` — 39.4%, `spec-mcp-server/mutations.ts` — 40.5%, `spec-graph/tasks.ts` — 41.9%

Plus the **61 files with zero unit-test coverage** (Part 1) — the larger gap. Strongest
tests: `registry.ts` (100%), `task-census.ts` (82.9%), `wikilinks.ts` (80%).

## Already mutation-tested green (prior runs, 2026-06-15)

- `tools/spec-graph/parsers/ndjson.ts` — 61.2%
- `tools/spec-graph/fr-census.ts` — 53.1% (after renderFrCensus + sort tests)
- `scripts/add-task-ids.ts` — 56.4%
- These are the `npm run mutation` real-code gate (57.08% overall).
