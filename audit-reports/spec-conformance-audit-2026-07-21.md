# Spec-Conformance Audit — 2026-07-21

**Auditor**: strict spec-conformance (verdicts only by evidence; no «structural valid» per `no-structural-valid` / FR-37d)
**Instruments (canonical)**: `tools/spec-graph/corpus-health.ts --strict` (organism level) + `tools/specs-generator/spec-verdict.ts --json --no-semantic` (per-spec smart verdict: audit + traceability + conformance + coverage over one graph)
**Scope**: all 61 real specs (dirs with `FR.md`) under `.specs/`; `archive/`, `backlog/`, 10× `spec-v3-verify-*` scratch dirs excluded from per-spec sweep (included in corpus graph)
**Honesty note**: semantic leg skipped (`--no-semantic`) — FR↔AC semantic pairing NOT evaluated this pass; conformance `warningCount` reported but not gate-failing.

---

## VERDICT: 🔴 RED (corpus) — 42/61 specs RED, 19 GREEN

## 1. Corpus-level findings (`corpus-health --strict`)

Graph: **5635 nodes / 7326 edges**

| # | Class | Count | Verdict impact |
|---|-------|------:|----------------|
| 1 | id collisions (raw pre-map) | **0** (5029 raw / 5029 unique) | hard-gate ✅ — FR-36 disease class currently cured |
| 2 | dangling edges | **1926** | hard-gate 🔴 |
| 3 | untraced atoms (FR-37b) | **899** — UNCOVERED_FR: 22 · TASK_UNTESTED: 34 · UNTAGGED_SCENARIO: 843 | strict 🔴 |
| 4 | stale FILE_CHANGES paths | **112** | hard-gate 🔴 |
| 5 | orphan project tests (FR-44/GT-1) | **0** | ✅ |
| 6 | FRs citing no RESEARCH.md (FR-44/GT-2) | **680** | strict 🔴 |
| 7 | upstream unlinked (FR-44/GT-4) | **572** — story: 177 · use-case: 344 · decision: 51 | strict 🔴 |

`VERDICT: 🔴 RED (hard: collisions+stale) | strict: 🔴 RED`

**Producer note (corpus-wide)**: 61× `[spec-graph] FILE_CHANGES.md contains glob path(s); implements edges skipped (first: .specs/pomogator-doctor/*.md)` — glob paths in FILE_CHANGES disable `implements`-edge generation for those specs, inflating untraced-atom counts. Fixing the producer (resolve globs → concrete files) is the highest-leverage single repair.

Sample dangling edges: `fix-bg-output-loss:FR-10…FR-14 → AC-10…AC-14 (missing: from)` — FR nodes referenced by edges but absent from FR.md (phantom requirements, FR-36 family).
Sample stale paths: `worktree-setup:FR-3 → src/scripts/tsx-runner.js`, `tui-test-runner-v2:FR-1…3 → extensions/tui-test-runner/…` (pre-v2 `extensions/` layout no longer on disk).

## 2. Per-spec sweep — histogram

**RED: 42 · GREEN: 19**

### 2.1 GREEN specs (19)

bdd-mutation-quality*, bdd-only-migration, bdd-test-scanner, carl-integration*, codex-init, context-mode-integration, native-statusline*, report-issue, skill-listing-budget*, skills-rules-optimizer, spec-generator-v4†, spec-mcp-usability-dogfood, spec-reality-check, spec-variant-matrix, spec-workflow-feature-steps-validation, spec-workflow-md-validation, strong-tests, undefined‡, voice-s5

\* GREEN verdict but carries bdd-sync debt (SOURCE_ONLY / FR_TAG_DRIFT / EXEC_ONLY_MISSING_MAP) — tolerable for the gate, visible debt.
† `spec-generator-v4`: coverage buckets `passed: 507, stale: 6` — GREEN verdict tolerates 6 stale test-result buckets; auditor flags as evidence-freshness debt.
‡ `undefined` — a spec literally named "undefined": near-certain scaffolding-bug artifact. Structurally GREEN, but a strict auditor treats this as garbage to archive/delete, not a healthy spec.

### 2.2 RED specs ranked by total gap count

| Spec | Verdict | Audit errors (class) | Trace gaps | Gaps | Coverage passed |
|------|---------|---------------------|-----------|------:|----------------:|
| spec-generator-v3 | RED | 41 (LINK_VALIDITY) | 34 | **75** | 26 |
| codex-cli-support | RED | 21 (LINK_VALIDITY) | 29 | **50** | 0 |
| stale-build-guard | RED | 27 (LINK_VALIDITY) | 14 | **41** | 11 |
| extension-beta-flag | RED | 28 (LINK_VALIDITY) | 8 | **36** | 0 |
| session-pilot | RED | 0 | 34 | **34** | 0 |
| tests-create-update | RED | 31 (LINK_VALIDITY) | 0 | **31** | 10 |
| architecture-decision-builder | RED | 6 (PARTIAL_IMPL) | 22 | **28** | 42 |
| claude-mem-midsession-reaper | RED | 27 (LINK_VALIDITY) | 0 | **27** | 5 |
| claude-mem-integration | RED | 22 (LINK_VALIDITY) | 0 | **22** | 13 |
| specs-management-as-skill | RED | 3 (LINK_VALIDITY) | 14 | 17 | 0 |
| prompt-suggest | RED | 1 (LINK_VALIDITY) | 14 | 15 | 0 |
| spec-workflow-vmodel | RED | 3 (LINK_VALIDITY) | 3 | 15 | 0 |
| tui-statusline-mode | RED | 5 (FILE_CHANGES) | 10 | 15 | 0 |
| cursor-dead-code-cleanup | RED | 7 (LINK_VALIDITY) | 7 | 14 | 0 |
| fix-bg-output-loss | RED | 10 (LINK_VALIDITY) | 2 | 12 | 6 |
| plan-pomogator-plain-language | RED | 6 (FILE_CHANGES) | 6 | 12 | 0 |
| plan-pomogator-prompt-isolation | RED | 6 (FILE_CHANGES) | 5 | 11 | 0 |
| install-diagnostics | RED | 1 (LINK_VALIDITY) | 10 | 11 | 0 |
| forbid-root-artifacts | RED | 11 (LINK_VALIDITY) | 0 | 11 | 38 |
| context-menu | RED | 0 | 10 | 10 | 29 |
| global-dir-guard | RED | 2 (FILE_CHANGES) | 8 | 10 | 8 |
| lint-self-bootstrap | RED | 10 (LINK_VALIDITY) | 0 | 10 | 6 |
| specs-workflow-jira-mode | RED | 0 | 10 | 10 | 10 |
| lsp-setup | RED | 0 | 9 | 9 | 0 |
| suggest-rules-insights | RED | 2 (FILE_CHANGES) | 7 | 9 | 0 |
| test-statusline | RED | 0 | 9 | 9 | 20 |
| bg-task-guard | RED | 5 (LINK_VALIDITY) | 2 | 7 | 32 |
| tui-test-runner-v2 | RED | 7 (FILE_CHANGES) | 0 | 7 | 20 |
| answer-simple | RED | 1 (LINK_VALIDITY) | 2 | 3 | 9 |
| dev-pomogator-canonical-plugin | RED | 6 (LINK_VALIDITY) | 0 | 6 | 24 |
| create-specs-bdd-enforcement | RED | 6 (FILE_CHANGES) | 0 | 6 | 6 |
| personal-pomogator | RED | 6 (FILE_CHANGES) | 0 | 6 | 27 |
| pomogator-doctor | RED | 3 (LINK_VALIDITY) | 0 | 3 | 31 |
| spec-phase-gate | RED | 4 (FILE_CHANGES) | 0 | 4 | 37 |
| verify-generic-scope-fix | RED | 3 (FILE_CHANGES) | 0 | 3 | 37 |
| worktree-setup | RED | 2 (FILE_CHANGES) | 0 | 2 | 30 |
| onboard-repo-phase0 | RED | 2 (FILE_CHANGES) | 0 | 2 | 96 |
| auto-capture | RED | 3 (FILE_CHANGES) | 0 | 14 | 16 |
| claim-evidence-gate | RED | 0 | 0 | 1 (bdd-sync EXEC_ONLY_MISSING_MAP) | 0 |
| plan-evidence-enforcement | RED | 1 (FILE_CHANGES) | 0 | 1 | 0 |
| tui-test-runner | RED | 1 (LINK_VALIDITY) | 0 | 1 | 75 |

## 3. RED root-cause taxonomy

1. **LINK_VALIDITY (broken spec-internal links / anchors)** — dominant class, ~225 errors across ~21 specs. Worst: spec-generator-v3 (41), tests-create-update (31), extension-beta-flag (28), stale-build-guard (27), claude-mem-midsession-reaper (27), claude-mem-integration (22), codex-cli-support (21). Mechanical to repair (`anchor-fix` skill covers the id-bearing majority).
2. **FILE_CHANGES staleness** — ~14 specs reference paths no longer on disk (the `extensions/` → canonical-layout migration left spec docs pointing at the old tree). Worst: tui-test-runner-v2 (7), the plan-pomogator-* pair (6 each), create-specs-bdd-enforcement (6), personal-pomogator (6).
3. **Traceability gaps (UNCOVERED_FR / UNTAGGED_SCENARIO)** — 17 specs. session-pilot (34 FRs uncovered), codex-cli-support (29), spec-generator-v3 (34), architecture-decision-builder (22).
4. **Claimed-only specs (coverage `passed: 0`)** — 14 RED specs have ZERO fresh passed-test buckets: codex-cli-support, session-pilot, extension-beta-flag, specs-management-as-skill, prompt-suggest, spec-workflow-vmodel, tui-statusline-mode, cursor-dead-code-cleanup, plan-pomogator-plain-language, plan-pomogator-prompt-isolation, install-diagnostics, lsp-setup, suggest-rules-insights, claim-evidence-gate. These are the highest-honesty-risk specs: requirements exist, no verifiable green evidence.
5. **bdd-sync debt** (FR_TAG_DRIFT / SOURCE_ONLY / EXEC_ONLY_MISSING_MAP) — present in 13 specs including 4 GREEN ones; scenario↔task↔source drift, not yet gate-failing.
6. **PARTIAL_IMPL** — single spec: architecture-decision-builder (6).

## 4. Strict-auditor flags (beyond tool verdicts)

- **F-A1**: `.specs/undefined/` — GREEN verdict on a spec named `undefined` = scaffolding-bug artifact. Should be archived (`spec-archive` with archival proof), not counted as corpus health.
- **F-A2**: `spec-generator-v4` GREEN with 6 stale test-result buckets — verdict tolerates, evidence freshness does not; re-run the mapped tests.
- **F-A3**: glob FILE_CHANGES (pomogator-doctor et al.) silently disable `implements` edges — the corpus undercounts traceability for every affected spec; any GREEN/RED of those specs is computed on an impoverished graph.
- **F-A4**: `fix-bg-output-loss:FR-10…FR-14` phantom FRs (edges exist, nodes don't) — classic FR-36-collateral; needs producer-side reconciliation, not link patching.

## 5. Recommended repair order (leverage-first)

1. Producer fix: resolve globs in FILE_CHANGES → concrete paths (restores implements edges for ~61 runs; may reclassify several REDs).
2. `anchor-fix` pass over the 21 LINK_VALIDITY specs (mechanical, ~225 errors).
3. FILE_CHANGES re-sync for the 14 stale-path specs (post-`extensions/`-migration cleanup).
4. Archive `.specs/undefined` + decide fate of the 14 claimed-only specs (write tests or mark OUT_OF_SCOPE per `cross-scope-coverage`).
5. bdd-sync debt sweep (13 specs) before it becomes gate-failing.

---
*Generated by strict spec-conformance audit pass; raw lines reproducible via `npx tsx tools/spec-graph/corpus-health.ts --strict` and the per-spec sweep (spec-verdict `--no-semantic`).*
