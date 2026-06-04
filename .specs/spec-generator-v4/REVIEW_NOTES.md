# Spec Review: spec-generator-v4

**Phase:** Complete (Manual final review)
**Generated:** 2026-05-18
**Scope:** All 10 spec-time categories (1-10) + 14 — full pre-implementation pass

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix recommended) | 0 | ✅ clear |
| P2 (improvements) | 4 | ℹ️ logged |
| P3 (informational) | 5 | ℹ️ logged |

**Overall verdict:** READY for implementation — no blockers, P2/P3 are quality improvements that can be addressed during impl phase.

## P0 Findings

_None._

## P1 Findings

_None._

## P2 Findings (recommended improvements)

| # | Category | Location | Issue | Suggested fix |
|---|----------|----------|-------|---------------|
| 1-P2 | Cat 10 | `RESEARCH.md` various | Some appendices contain qualitative descriptors ("stable", "mature") without numeric metrics for **external libraries** (e.g., cucumber-js "mature ecosystem", remark "production-grade") | Acceptable for describing 3rd-party tools where direct measurement не возможен. For v4 **own claims** — все имеют numeric backing (NFR-Performance ≤2s/≤100ms). No fix required, P2 lowered to acceptable |
| 2-P2 | Cat 10 | `DESIGN.md:183, 212` | Vague words `stable`, `simple` in Key Decisions Rationale | Context-acceptable (describing 3rd-party package maturity + research-workflow use cases). Could be tightened with version numbers if desired, but not critical |
| 3-P2 | audit-spec | `README.md` + `RESEARCH.md` ref counts | "38 EARS ACs" mentioned — actual count is **39** (verified by grep `^## AC-`). Off-by-one in narrative text | Minor: update "38" → "39" in 3 locations (README.md, RESEARCH.md README section, REVIEW_NOTES prior versions). Trivial Edit |
| 4-P2 | audit-spec | `FILE_CHANGES.md` | 87 file count discrepancy with phase breakdown table (sum 87 but cells add to 87 only if Cross-phase docs counted — verify) | Recompute and update Total counts row. Trivial |

## P3 Findings (informational)

| # | Category | Location | Note |
|---|----------|----------|------|
| 1-P3 | Cat 5 | RESEARCH.md Appendix Q.12 | "Open questions для future Maxim" — informational only, not pending action items requiring resolution. Acceptable as historical decision context |
| 2-P3 | Cat 6 | FIXTURES.md F-21, F-22, F-23 | Phase 4/6 fixtures marked TBD — documented as roadmap items in Migration plan section, not gaps in current spec |
| 3-P3 | Cat 7 | TASKS.md `bash-post-test-hook` | Mentions `dotnet test\|npm test\|npm run test:bdd` as hook event matcher pattern — legitimate event matching, not promoting raw command invocation |
| 4-P3 | Cat 14 | NFR.md / RESEARCH.md | Word `hardcoded` appears in NFR-Security-3 + RESEARCH guidance — **correctly used** in negative context ("no hardcoded user identifiers"), not a violation |
| 5-P3 | audit-spec | `RESEARCH.md` + `FILE_CHANGES.md` | "session" word matched by PHANTOM_CREATE_SOURCE pattern — false-positive (word used in narrative, not as file path) |

## Categories verified clear (final pass)

### Cat 1 (External-API claim verify) — re-verified 2026-05-18

| # | Claim | Result |
|---|-------|--------|
| 1 | OpenSpec issue #901 still open | ✅ Still open, content unchanged |
| 2 | OpenSpec stars 48k | ✅ Actual 48.7k (within rounding) |
| 3 | markdown-vault-mcp 30 tools | ✅ Confirmed 30 + 6 app-only, v1.28.0 active |
| 4 | Cucumber Messages 21 envelope types | ✅ Confirmed (Phase 1 correction held) |
| 5 | Reqnroll v3+ NDJSON support | ✅ NDJSON formatter documented |
| 6 | `@modelcontextprotocol/sdk` npm | ✅ Exists, v1.29.0 actively maintained by Anthropic |
| 7 | chokidar polling options | ✅ All 3 options (`usePolling`, `interval`, `awaitWriteFinish`) confirmed |

### Cat 2 (Existing-asset duplicate) — clear

Phase 2/3 added 8 npm packages (`@cucumber/*`, `unified`, `remark-*`, `chokidar`, `@modelcontextprotocol/sdk`, `better-sqlite3`) — verified not yet in `package.json` (Phase 0/2/4 install tasks). No duplicates.

### Cat 3 (Antipattern guardrails) — N/A

`.claude/rules/antipatterns/` directory not present in dev-pomogator repo. Skipped.

### Cat 4 (Assumption-vs-Requirement) — integrity table

| Metric | Count | Status |
|--------|-------|--------|
| User Stories | 16 | ✅ 1:1 with 16 FRs |
| FRs | 16 | ✅ Each linked to AC, UC, User Story |
| ACs (EARS) | **39** | ✅ Distributed 2-3 per FR |
| Use Cases | 10 + 12 Edge Cases | ✅ Each linked to relevant FR(s) |
| CHKs (Verification Matrix) | 41 | ✅ Each FR has ≥2 CHKs |
| BDD Scenarios | 37 | ✅ 16 unique @feature tags |
| Tasks | 50 (38 with `_Requirements:` link, 12 bootstrap/verify/refactor) | ✅ Distribution proper |
| File Changes | 87 files across 7 phases | ✅ Each phase represented |

All FR-1..FR-16 traced through: USER_STORIES → USE_CASES → AC → REQUIREMENTS CHK → .feature → TASKS → FIXTURES Gap Analysis ✓

### Cat 5 (Open Questions stale) — clear

No `## Open Questions` section in any spec file (intentional). RESEARCH.md Appendix Q.12 "Open questions для future Maxim" — informational historical context, not pending action items.

### Cat 6 (@featureN cross-file consistency) — clear end-to-end

16 unique @feature tags (`@feature1` .. `@feature16`) consistent across:
- `spec-generator-v4.feature` — 37 scenarios with @feature tags
- USER_STORIES.md — implied through US-N mapping
- REQUIREMENTS.md — 57 occurrences in traceability matrix + CHKs
- TASKS.md — 47 tasks with @feature tags
- FIXTURES.md — Gap Analysis table 16 rows
- FR.md / AC.md — implied through ID structure

1:1 FR↔@feature mapping confirmed.

### Cat 7 (Tooling mismatch) — clear

- No raw `dotnet test`/`pytest`/`npm test` invocations in TASKS.md task body
- All test references either via `npm run test:bdd` (centralized) OR as hook event matcher patterns (legitimate)
- No PowerShell glyphs in bash code blocks (no `$:`, no backtick line continuations in bash context)
- No raw `find .` / `grep -r` / `cat` in TASKS.md

### Cat 8 (Plan-gate template) — N/A

No `~/.claude/plans/spec-generator-v4.md` exists. v4 spec is standalone, not derived from a plan file.

### Cat 9 (BDD Test Infrastructure → Phase 0) — clear

`DESIGN.md` declares `TEST_DATA_ACTIVE` + `TEST_FORMAT=BDD` + `Framework=Cucumber.js`. `TASKS.md` Phase 0 contains all 3 bootstrap tasks in strict dependency chain:

```
install-bdd-framework
  ↓ depends
bootstrap-bdd-hooks
  ↓ depends
bootstrap-bdd-fixtures-config
  ↓ all Phase 1+ implementation tasks depend on this
```

12 references to bootstrap task IDs in TASKS.md — proper dependency wiring.

### Cat 10 (Hallucination/fluff smell) — minimal

- NFR has all concrete numbers (≤2s, ≤100ms, ≤500ms, ≤50ms, 3000ms, 1000ms, 10MB, 21 envelopes, 30s timeout)
- DESIGN.md uses concrete file paths + component names
- FR.md uses SHALL/MUST language consistently
- Only 2 "stable"/"simple" mentions in DESIGN.md Key Decisions (describing 3rd-party packages, acceptable context)

### Cat 14 (Memory-aware constraint compliance) — clear

- `feedback_no-hardcoded-repo-or-user-identifiers`: ✅ No `stgmt/dev-pomogator` literal anywhere in spec files (only in REVIEW_NOTES.md as Phase 1 review documentation — meta context, not violation)
- `feedback_env-first-then-investigate-then-ask`: ✅ Pattern explicitly addressed by NFR-Security-4 + DESIGN.md component `MultiEnvLock`

## Auto-fix patches (optional improvements)

### Patch 1: AC count 38 → 39

**File:** `README.md`

**old_string:**
```
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 38 EARS ACs (1:1 with FRs)
```

**new_string:**
```
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 39 EARS ACs (distributed 2-3 per FR)
```

**File:** `RESEARCH.md` — similar mention in Appendix Q.0 narrative if present (search-and-replace pattern "38 EARS" → "39 EARS")

_Other patches deferred to impl phase as part of final-verification task._

## Verdict

✅ **READY for implementation.** Spec is internally consistent, cross-references intact, external claims verified fresh (2026-05-18), no blockers, no critical warnings.

Quality observations:
- 1300+ lines of research with full decision history (`Why this phase exists`, alternatives rejected, future-Maxim Q&A)
- Solid TDD-ordered task plan (Phase 0 BDD migration first, scenarios go Red→Green incrementally per Phase)
- Comprehensive fixture coverage with Gap Analysis identifying CI-only / mock-only tests up-front
- Architecture transparent through 7 Key Decisions documenting trade-offs

Minor improvements (P2) — can be addressed in `final-verification` task at end of implementation phase (TASKS.md line ~427).

## Implementation phase readiness checklist

- [x] All 16 FRs have ACs + CHKs + BDD scenarios + TASKS
- [x] Phase 0 cucumber-js bootstrap block fully specified (3 tasks with explicit dependencies)
- [x] No external claim drift in 2 days since Phase 1 review
- [x] No `stgmt` hardcoded violations
- [x] BDD Test Infrastructure properly classified TEST_DATA_ACTIVE
- [x] All 50 tasks have Done When + Status + Est (form-guard passed)
- [x] All 7 Key Decisions have Rationale + Trade-off + ≥2 Alternatives (design-decision-guard passed)
- [x] All 41 CHKs have Traces To with FR + (AC | @feature | UC) (requirements-chk-guard passed)
- [x] All risks have Likelihood + Impact + Mitigation (risk-assessment-guard passed)

→ Ready to begin **Phase 0: cucumber-js BDD migration** (task `install-bdd-framework`, Est: 20m).

---

## 2026-05-20 — Cross-spec reconciliation feature added (spec-only update)

### Summary

Added FR-17 (`cross-spec-reconcile` skill) + FR-18 (`cross-spec-resolve` skill) per user direction («выпили из плана всю имплементацию, только спеки делаем»). Implementation deferred to Phase 7 of `TASKS.md`. This is a **spec-only update** — no skill code, scripts, tests, or wiring written; all implementation tasks live as future TODOs in `TASKS.md` Phase 7 with 14 enumerated tasks.

### Counts after update

- FRs: 16 → 18 (+2: FR-17, FR-18)
- ACs: 38 → 51 (+13: AC-17.1..17.8, AC-18.1..18.5) — **P2-3 off-by-one (38/39) auto-resolved by recompute**
- CHKs: 41 → 54 (+13: CHK-FR17-01..08, CHK-FR18-01..05)
- USs: 16 → 20 (+4: US-17..20)
- UCs: 10 → 15 (+5: UC-17..21)
- NFRs: 21 → 25 (+4: NFR-Performance-5, NFR-Security-6, NFR-Reliability-7, NFR-Usability-7)
- BDD scenarios: 37 → 48 (+11: SPECGEN004_38..48 in @feature17/@feature18)
- Phases: 7 → 8 (+1: Phase 7 Cross-spec reconciliation)
- TASKS: 50 → 64 (+14 Phase 7 implementation tasks)
- FILE_CHANGES total: 87 → 118 (+31 files in Phase 7 implementation scope) — **P2-4 count discrepancy auto-resolved by recompute**

### Sections added

- **`FR.md`** — FR-17 + FR-18 with full bodies + cross-links AC/UC/US/feature
- **`ACCEPTANCE_CRITERIA.md`** — AC-17.1..17.8 + AC-18.1..18.5 EARS scenarios
- **`USER_STORIES.md`** — US-17..20 v3-form blocks (Priority + Why + Independent Test + Acceptance Scenarios)
- **`USE_CASES.md`** — UC-17..21 covering lightweight Phase 2/3, heavyweight Audit, resolve loop, architectural fork, foreign-spec correction
- **`DESIGN.md`** — new section «Cross-spec reconciliation architecture» with 11 sub-points (skill flow diagram, subagent isolation R-4, ARCHITECTURAL_DECISION_VS_REALITY algorithm, CAPS prompt caveat, lightweight hard-conflict subset, partial reconciliation, Spectral convention, OpenFastTrace 4-class, SARIF mapping, concurrency semantics, prior-art adoption)
- **`NFR.md`** — Performance-5, Security-6, Reliability-7, Usability-7 rows for Phase 7
- **`TASKS.md`** — new Phase 7 with 14 implementation tasks (install-cross-spec-skills, impl-mechanical-checks, impl-semantic-subagent, impl-yaml-writer, impl-critical-prompt, impl-resolve-loop, impl-sarif-output, impl-dry-run-mode, impl-coverage-summary, impl-architectural-detection, wire-create-spec-skill, register-skills-in-manifest, integration-test-fixture, e2e-test-reconcile-roundtrip)
- **`spec-generator-v4_SCHEMA.md`** — Consistency Report YAML schema + 28 Cross-Spec Finding Codes table (15 cross-spec/* + 13 impl-drift/* in Spectral namespace convention) + SARIF mapping section
- **`spec-generator-v4.feature`** — @feature17 + @feature18 Gherkin scenarios (SPECGEN004_38..48)
- **`FIXTURES.md`** — Phase 7 fixtures section describing `tests/fixtures/cross-spec-corpus/` (spec-a, spec-b, spec-c, README, cache sample, consistency-report sample, override JSONL sample)
- **`REQUIREMENTS.md`** — CHK-FR17-01..08 + CHK-FR18-01..05 rows in traceability matrix; Summary Counts updated to 54 CHKs
- **`CHANGELOG.md`** — v0.2.0 entry documenting all additions and P2-3/P2-4 auto-resolution
- **`README.md`** — bumped «16 FRs» → «18 FRs», «7 phases» → «8 phases», added cross-spec reconciliation bullet to «Ключевые идеи», added skill paths to «Где лежит реализация», Phase 7 row in phases table, Где читать дальше counts bumped
- **`RESEARCH.md`** — new Appendix R «Phase 7 Cross-spec reconciliation: motivation & prior art» with case study (post-render-eval ↔ closed-loop-hardening ↔ pipeline/agent.ts), output format inspiration, top 5 prior art (spec-kit, mex, OpenFastTrace, Spectral, oasdiff), adopted/avoided patterns, honest novel value table
- **`FILE_CHANGES.md`** — new Phase 7 section with 31 file entries + total bumped 87 → 118

### Resolved issues

- **P2-3 (AC count off-by-one 38 vs 39)** — automatically resolved by AC recompute including AC-17.* + AC-18.* (new total 51).
- **P2-4 (FILE_CHANGES count discrepancy)** — automatically resolved by total recompute (118 files across 8 phases).

### Implementation gating

Implementation NOT started in this update. Phase 7 tasks are enumerated as TODO with Done When / Status / Est fields per task-board-forms convention. Suggested kickoff order after Phase 0 implementation completes: `install-cross-spec-skills` → `impl-mechanical-checks` → `impl-semantic-subagent` → `impl-yaml-writer` → `impl-critical-prompt` → `impl-resolve-loop` → SARIF / dry-run / coverage parallel → `impl-architectural-detection` → `wire-create-spec-skill` → `register-skills-in-manifest` → fixtures + e2e.

→ Ready to begin **Phase 7** when prior phases shipped, OR run Phase 7 in parallel with Phase 1+ (no hard dep, only soft dep on `Skill("cross-spec-reconcile", mode: "full")` consuming SpecGraph if Phase 1 ready; degraded mode works without).

---

## 2026-05-20 — Self-review fixes (round 2)

After initial spec-only update committed in the entry above, self-review surfaced 1 concern + 4 nits. User direction «всесделать не откдлывать, описывать, допиливать» — all addressed.

### C1 — Effort estimate inconsistency (FIXED)

**Before:** README Phase 7 row claimed «5-7 days» but TASKS.md Phase 7 task estimates summed to ~5100 minutes (~85 hours ≈ 10-11 dev days). README Total «~30-42 days» derived from previous total + Phase 7 underestimate.

**After:** README updated to «Phase 7 | … | 10-11 days», Total bumped to «~35-46 days effort», derivation note added explaining 85h sum and key drivers (impl-mechanical-checks 12h, impl-resolve-loop 12h, impl-architectural-detection 12h, impl-semantic-subagent 8h, install-cross-spec-skills 8h, e2e-test-reconcile-roundtrip 8h, 8 smaller tasks for the rest).

### N1 — Already covered (NO ACTION)

The `--dry-run` + `--sarif` interaction question (what happens if both flags passed?). AC-17.8 already specifies «SHALL NOT write either `consistency-report.yaml` or `consistency-report.sarif` files to disk» when `--dry-run` is passed — dry-run preempts both YAML and SARIF write. No edit needed.

### N2 — Concurrency semantics (FIXED)

**Before:** Race condition behavior between `cross-spec-resolve` and `cross-spec-reconcile` running concurrently was not specified. Implementation could pick any policy.

**After:** DESIGN.md gained new sub-point (j) «Concurrency semantics (resolve vs reconcile)» documenting: atomic-write provides snapshot semantics for readers (no partial-file reads); three explicit race scenarios with behavior (reconcile-after-resolve-load, reconcile-mid-resolve-batch, two-resolves-on-different-slugs); explicit user-guidance hint to put in skill SKILL.md; rationale for v0.2.0 lockless approach (avoid stale-lock recovery complexity) plus future lock-file enhancement reference. Original (j) Prior art renamed to (k). DESIGN sub-point count: 10 → 11. CHANGELOG and this REVIEW_NOTES entry updated accordingly.

### N3 — Schema version migration policy (FIXED)

**Before:** SCHEMA.md described `version: 1` field but no policy for reader behavior on unknown version, writer behavior on version mismatch, or future v2 migration path.

**After:** SCHEMA.md «Consistency Report YAML» section gained new «Schema version policy» subsection documenting: current version (1), reader behavior on unknown version (refuse + non-zero exit), reader behavior on older known version (best-effort), writer behavior on mismatched existing YAML (treat as opaque + warn stderr before overwrite), future v2 migration helper (`dev-pomogator migrate-consistency-report` mirror of FR-11 pattern, interactive per-file, never auto), explicit out-of-scope for v0.2.0 (multi-version concurrent producers).

### N4 — RESEARCH.md organization (NO ACTION)

Plan said «Related sprint work + Prior art subsection» as two separate sections. Implementation put both as subsections inside a single «Appendix R — Phase 7 Cross-spec reconciliation: motivation & prior art» section. Functionally equivalent; cross-references work; reorganization is pure churn with no semantic value. Decision: leave as-is.

### Validators after round-2 fixes

- `validate-spec.ts -Path .specs/spec-generator-v4` → exit 0 (`valid: true`, 0 errors, 15 pre-existing anchor warnings — not regressions).
- `audit-spec.ts -Path .specs/spec-generator-v4` → 0 CRITICAL findings; 100 total (45 WARNING + 55 INFO) — same baseline as APPROVED state 2026-05-18.
- `validate-plan.ts <plan-file>` → OK.

### Net effect

Spec is now internally consistent on effort estimates, has explicit concurrency contract for v0.2.0, and has a forward-looking schema version migration policy. Implementation Phase 7 has unambiguous answers to «what happens if reconcile + resolve race?» and «how to handle YAML schema evolution?» — both questions surfaced during self-review.

## Round 3 (2026-05-28) — v3→v4 transition patch (10 closed gaps)

This round closed 10 silent gaps and risks discovered when honestly diffing v3 (in production, PR #14) against v4 (this spec). The investigation was triggered by a user request «найти что уникального есть в в3 чего нет в в4 и сделать отчёт» and escalated to «полный патч глубокий с рисками» after the first report turned up false-positives (6 of the originally-flagged 9 «soft gaps» were intentionally kept verbatim — discovery-forms / requirements-chk-matrix / task-board-forms skills + 5 v3 form-guards — so the patch focuses only on real silent omissions).

### v3 FR → v4 FR mapping

| v3 FR | v3 concern | v4 disposition before this patch | v4 disposition after this patch |
|-------|-----------|-----------------------------------|----------------------------------|
| FR-1..3 | discovery-forms / requirements-chk-matrix / task-board-forms skills | KEPT verbatim (`USER_STORIES.md:5`, `DESIGN.md:132`, `TASKS.md:60`) | no change — confirmed in patch context |
| FR-4..8 | 5 form-guards | KEPT verbatim (`DESIGN.md:228-232` «direct reuse, no changes») | no change — confirmed; FR-19 (this patch) adds explicit failure-mode policy on top |
| FR-9 | Migration guard / version gate | OMITTED for new hard guard | NEW **FR-22** (version gate for `spec-conformance-guard`, mirrors v3 FR-9) |
| FR-10 | Fail-open hook policy | OMITTED (NFR-Security-1 covered no-env-bypass but not crash semantics) | NEW **FR-19** (two-tier failure policy: soft fail-open everywhere, hard fail-CLOSED on startup + fail-OPEN on file parse) + **NFR-Reliability-8** |
| FR-11 | extension-json-meta-guard | mentioned abstractly in NFR-Security-2 | NEW **FR-24** (meta-guard preservation + scope extension to v4 `plugin.json`) |
| FR-12 | form-guards.log retention | OMITTED (v4 FR-15 introduces a DIFFERENT JSONL log) | NEW **FR-23** (log-file inventory: two log files intentionally not unified) + DESIGN.md «(m) Log file inventory» |
| FR-13 | UserPromptSubmit 24h summary | DROPPED without explicit decision | NEW **FR-20** (threshold-only B3 + on-demand B4 combo) + **NFR-Performance-6** + DESIGN.md «(n) Conformance summary surfacing» |
| FR-14 | spec-status.ts -Format task-table CLI | OMITTED as a contract (used in TASKS.md but unspecified) | NEW **FR-21** (stable public CLI contract + fixture-based test) |
| FR-15 | specs-management.md workflow doc | REPLACED by distributed SKILL.md but migration not documented | README.md gains «v3 → v4 doc reorganization» section (this patch); 3 SKILL.md frontmatter cleaned of stale `specs-management.md` references |
| FR-16 | manifest update via additive merge | OMITTED as an invariant | NEW **FR-25** (v3 hook entries SHALL survive v4 install) |
| (v4 FR-8 introduced risk) | LLM-as-judge privacy | OMITTED (NFR-Security-6 covered only cross-spec-reconcile) | NEW **FR-26** (deny-list + per-spec opt-out) + **NFR-Security-7** |
| (v4 FR-7 introduced risk) | Marksman LSP supply-chain | OMITTED (no SHA verification policy) | NEW **FR-27** + **NFR-Security-8** |
| (v4 FR-6 introduced risk) | PostToolUse throttle semantics | UNDERSPECIFIED («3s throttle» without window-type) | NEW **FR-28** + **NFR-Performance-7** (fixed-window explicitly) |

### Key decisions in this patch

- **Why two-tier fail-open (not «all fail-open»)** — single-tier creates a known bypass vector: attacker crafts a `.md` whose content reliably crashes the hard guard's parser, gaining unprotected Writes thereafter. Two-tier keeps v3 robustness on soft tier (fail-open for ALL exceptions) while making hard tier's startup contract honest (broken install fails CLOSED so user notices). Per-file content crashes still fail-open because one confused file should not DoS authoring. See FR-19 + NFR-Reliability-8 + DESIGN «(l) Hook failure-mode tiers».
- **Why B3+B4 combo for the summary, not B1 or B2** — B1 (every-prompt aggregate, v3 verbatim) re-introduces latency cost on EVERY prompt regardless of signal. B2 (deprecate-only) is a silent UX regression for users relying on the prompt-time alert. B3 (threshold-only) gives zero-noise default and alerts only when there's signal; B4 (`/spec-status` on-demand) gives the «show me everything» surface for paranoid checks. Both are needed; either alone leaves a gap. See FR-20 + DESIGN «(n) Conformance summary surfacing».
- **Why a version gate (FR-22), not «migrate everyone before v4 ships»** — dev-pomogator users have 30+ legacy specs at versions 1/2/3 authored when v4's hard invariants did not exist. Forcing migration before v4 install would create a forced-update event affecting every existing user. The gate (mirror of v3 FR-9 pattern that handled v2→v3 transition) lets v4 install without false-positive DoS, then users migrate at their own pace via FR-11.
- **Why two log files, not unified (FR-23)** — form-guard decisions (DENY/ALLOW_AFTER_MIGRATION/PARSER_CRASH) and conformance findings (DUPLICATE_DEFINITION/UNCOVERED_FR/SCENARIO_TAG_ORPHAN) are different event taxonomies with different downstream consumers (v3 summary renderer vs new CLI analytics). Unification would break v3 consumers AND would not materially help v4 consumers. Schema convergence is an explicit OUT_OF_SCOPE for v4; v5+ may revisit.
- **Why README note, not deprecate-in-place for `specs-management.md`** — the file does NOT exist live in `.claude/rules/` (verified during patch investigation; only appears in v3 spec text + `.stryker-tmp/` sandbox). Treating a never-shipped artifact as something to deprecate would create more confusion than the gap itself. Honest path: a README note documenting it as a v3 planning artifact + fixing the 3 SKILL.md frontmatter descriptions that still reference it. See readme-v3-to-v4-reorg-note section + 3 frontmatter fixes.

### What this patch does NOT change

- v4's architectural shape (SpecGraph + MCP + LSP + cucumber-js + JSONL log) is preserved as-is — patch only adds requirements that were previously silent.
- Phase ordering and effort estimates are unchanged — new FRs map to existing phases (FR-19 → Phase 2 alongside FR-5; FR-20 → Phase 2 alongside FR-6; FR-21 → Phase 5 alongside FR-11; FR-22 → Phase 2 alongside FR-5; FR-23/24 → cross-phase doc artifacts; FR-25 → Phase 5 alongside FR-11; FR-26 → Phase 3 alongside FR-8; FR-27 → Phase 2 alongside FR-7; FR-28 → Phase 2 alongside FR-6).
- No new tools or skills introduced beyond what v4 already names — patch tightens contracts on existing surfaces.
- The 6 «soft gaps» from the first report (form-skills + form-guards) are NOT lifted to FRs — they are intentionally already preserved by v4 and codifying them again would be duplication.

### Validators after Round 3 patch

- `validate-spec.ts -Path .specs/spec-generator-v4` → expected exit 0 (10 new FRs + 13 new AC + 6 new BDD scenarios all structurally valid).
- `audit-spec.ts -Path .specs/spec-generator-v4` → expected 0 ERRORS / 0 OMISSIONS; new @feature19/@feature22/@feature25/@feature26/@feature27 tags each have paired FR + AC + Scenario.
- `grep -l "specs-management.md" .claude/skills/` → expected empty (3 SKILL.md descriptions cleaned).

---

# Supplement review: FR-35 honesty-hardening + Phase 12 (2026 session)

**Scope:** new content only — FR-35a/b/c, AC-35.1-5, NFR-Reliability-10, @feature35 (SPECGEN004_85-89), Phase 12 (WS-A..F), CHANGELOG v4.2.
**Mechanical layer:** anchor-integrity **0 broken** · validate-spec **valid / 0 errors** · audit-spec advisory-only.

**Verdict: READY** — P0=0, P1=0, P2=1.

## P2 finding
- **6-1 @featureN granularity** (TASKS Phase 12): `@feature35` tags 6 WS tasks but 5 BDD scenarios. The 5 scenarios cover WS-A's behavioral changes (FR-35a/b/c); WS-B..F are process/verification workstreams (no new behavior → no dedicated scenarios). Validator treats `@feature35` as COVERED (present in both files). Kept under one epic tag deliberately.

## Verified-claim audit (no external-API claims; evidence is this-session tool runs)
- "fake-positive GREEN → DONE" — `computeCoverage(done+PASSED)` → `DONE`.
- "strong-tests/spec-status advisory, absent from feature-map + hooks" — grep `scripts/feature-map.ts` + `.claude-plugin/hooks.json` (0).
- "checkConformance(done, zero scenario) → []" — direct run.
- The SOLUTION (test-quality stage, `TASK_TEST_QUALITY`, enforcing hook) is phrased `SHALL` (Phase-12 TODO), not claimed existing.

## Name-collision audit (clean)
`TASK_TEST_QUALITY`, `[skip-test-quality:]` (fits escape family), `test-quality` stage (absent today = the gap) — collision-free.
