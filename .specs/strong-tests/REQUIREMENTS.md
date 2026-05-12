# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-greenfield-strong-test-generation-with-pbt) | Greenfield strong-test generation with PBT | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue) | Audit existing tests against 8 anti-patterns | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-mutation-feedback-loop-until-threshold) | Mutation-feedback loop until threshold | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-multi-stack-auto-detection) | Multi-stack auto-detection | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-12-point-self-eval-as-final-gate-with-passfail-report) | 12-point self-eval as final gate | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-pit--strykernet--cargo-mutants--go-mutesting-deep-integration--out-of-scope) | PIT / Stryker.NET / cargo-mutants / go-mutesting deep integration (OUT OF SCOPE) | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | — | OUT OF SCOPE |
| [FR-7](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook) | JiT auto-trigger via PostToolUse hook | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |

## Functional Requirements

- [FR-1: Greenfield strong-test generation with PBT](FR.md#fr-1-greenfield-strong-test-generation-with-pbt)
- [FR-2: Audit existing tests against 8-anti-pattern catalogue](FR.md#fr-2-audit-existing-tests-against-8-anti-pattern-catalogue)
- [FR-3: Mutation-feedback loop until threshold](FR.md#fr-3-mutation-feedback-loop-until-threshold)
- [FR-4: Multi-stack auto-detection](FR.md#fr-4-multi-stack-auto-detection)
- [FR-5: 12-point self-eval as final gate with PASS/FAIL report](FR.md#fr-5-12-point-self-eval-as-final-gate-with-passfail-report)
- [FR-7: JiT (Just-in-Time) auto-trigger via PostToolUse hook](FR.md#fr-7-jit-just-in-time-auto-trigger-via-posttooluse-hook)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Greenfield PBT generation](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Audit existing tests](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Mutation-feedback loop](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Auto-detect stacks](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): 12-point eval report](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-7 (FR-7): JiT auto-trigger via PostToolUse hook](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 covered: Greenfield emits PBT for invariant-bearing function | FR-1, AC-1, @feature1, UC-1 | BDD scenario | Draft | TS+fast-check happy path |
| CHK-FR1-02 | FR-1 covered: Greenfield emits Hypothesis test for Python tuple-returning function | FR-1, AC-1, @feature1, UC-1 | BDD scenario | Draft | Python+Hypothesis path |
| CHK-FR1-03 | FR-1 NFR: assertions include failure messages, negative:positive ratio ≥1:2 | FR-1, AC-1 | Unit test | Draft | NFR-U2 regex over generated test files |
| CHK-FR2-01 | FR-2 covered: Audit flags toBeDefined + arr.length>0 as weak | FR-2, AC-2, @feature2, UC-2 | BDD scenario | Draft | direct fixture file |
| CHK-FR2-02 | FR-2 covered: Audit flags missing await + cross-refs tests-create-update rule 10 | FR-2, AC-2, @feature2, UC-2 | BDD scenario | Draft | async path |
| CHK-FR2-03 | FR-2 NFR: scan 100 files ≤10s | FR-2, AC-2 | Integration test | Draft | NFR-P2 |
| CHK-FR3-01 | FR-3 covered: Mutation-feedback runs Stryker, reports survivors, applies fixes | FR-3, AC-3, @feature3, UC-3 | BDD scenario | Draft | TS+Stryker primary |
| CHK-FR3-02 | FR-3 covered: max-iter ceiling emits [GAP] report | FR-3, AC-3, @feature3, UC-3 | BDD scenario | Draft | max-iter path |
| CHK-FR3-03 | FR-3 covered: tool-missing fallback offers install + manual mutation | FR-3, AC-3, @feature3, UC-5 | BDD scenario | Draft | fallback path |
| CHK-FR3-04 | FR-3 NFR: run_in_background for >2min runs + persistent log | FR-3, AC-3 | Manual review | Draft | NFR-P1, no-blocking rule |
| CHK-FR4-01 | FR-4 covered: detect TS+Python both stacks, emit matrix, AskUserQuestion | FR-4, AC-4, @feature4, UC-4 | BDD scenario | Draft | polyglot path |
| CHK-FR4-02 | FR-4 covered: no-recognized-stack → clear message + 6-stack list | FR-4, AC-4, @feature4 | BDD scenario | Draft | empty-repo path |
| CHK-FR5-01 | FR-5 covered: 12-point self-eval section emitted in every mode | FR-5, AC-5, @feature5 | BDD scenario | Draft | final-gate enforcement |
| CHK-FR5-02 | FR-5 covered: FAIL row has actionable remediation pointer | FR-5, AC-5, @feature5 | Unit test | Draft | remediation column |
| CHK-FR5-03 | FR-5 covered: Kill-rate-readiness HIGH/MEDIUM/LOW computed per rule | FR-5, AC-5, @feature5 | Unit test | Draft | summary line |
| CHK-FR7-01 | FR-7 covered: PostToolUse hook fires on Write or Edit production TS file; detector identifies Collection-returning function; additionalContext emitted | FR-7, AC-7, @feature7, UC-7 | BDD scenario | Verified | TS detection path |
| CHK-FR7-02 | FR-7 covered: suppression comment skips detection AND appends JSONL audit entry | FR-7, AC-7, @feature7, UC-8 | BDD scenario | Verified | suppression path |
| CHK-FR7-03 | FR-7 covered: reason under 8 chars writes JSONL entry with warning REASON_TOO_SHORT plus additionalContext audit note | FR-7, AC-7, @feature7 | Unit test | Verified | anti-gaming guard |
| CHK-FR7-04 | FR-7 covered: §1.5 behavioural prior section loads BEFORE §2 in every Skill activation path | FR-7, AC-7, @feature7, UC-9 | Integration test | Verified | prior-activator |
| CHK-FR7-05 | FR-7 NFR: detector p95 latency under 500ms on files up to 2000 LOC | FR-7, AC-7, @feature7 | Integration test | Verified | NFR-P4 perf |
| CHK-FR7-06 | FR-7 NFR: detector errors do not fail Write or Edit (exit 0 unconditional) | FR-7, AC-7, @feature7 | Integration test | Verified | NFR-R5 graceful degradation |
| CHK-FR7-07 | FR-7 covered v0.3.0: C# detection path identifies collection-returning function with nested for/foreach loops; Tests/ folder + Steps.cs/Tests.cs excluded; suppression comment skips with audit log | FR-7, AC-7, @feature7, UC-1 | BDD scenario | Draft | C# detection path v0.3.0 |
| CHK-FR11-01 | FR-11 composition-chain detection в scan() assigns kind correctly when ≥2 chained method calls detected | FR-11, AC-7, @feature7 | Unit test | Verified | TS .filter().map().reduce() and C# LINQ smoke confirmed |
| CHK-FR11-02 | FR-11 detection priority correct nxm-overlap takes precedence over composition-chain when nestedFor ≥2 | FR-11, AC-7, @feature7 | Unit test | Verified | TESTQUAL001_11b ProcessItems composition-chain CartesianProduct nxm-overlap |
| CHK-FR12-01 | FR-12 Stryker.NET dispatch runStrykerNet function exists in run-mutation.ts | FR-12, AC-3, @feature3 | Integration test | Verified | TESTQUAL001_11 dry-run returns stack csharp tool stryker-net |
| CHK-FR12-02 | FR-12 Stryker.NET template references/stryker-net.config.template.json with TODO placeholders | FR-12, AC-3, @feature3 | Manual review | Verified | Template created with full schema documentation |
| CHK-FR12-03 | FR-12 detection augmented Stryker.NET tool detected via PackageReference OR stryker-config.json | FR-12, AC-3, @feature3 | Integration test | Verified | detectStack expanded with existsSync check |
| CHK-FR13-01 | FR-13 default skip Integration E2E runStrykerNet applies Category Unit filter by default | FR-13, AC-3, @feature3 | Integration test | Verified | Filter args explicit plus log line emit when override |
| CHK-FR14-01 | FR-14 ast-grep TS branch getTsFunctionsViaAstGrep integrated with regex fallback | FR-14, AC-1, @feature1 | Integration test | Verified | 47 unit tests pass with NAPI loaded regex fallback if NAPI fails |
| CHK-FR14-02 | FR-14 NAPI module load try catch on require ast-grep napi graceful degradation | FR-14, AC-1, @feature1 | Integration test | Verified | astGrepModule null fallback path |
| CHK-FR15-01 | FR-15 LLM survivor stub annotateSurvivorsForLlmReview preserves cardinality 1-to-1 | FR-15, AC-3, @feature3 | Integration test | Draft | input length equals output length invariant tested via integration |
| CHK-FR15-02 | FR-15 reconstructedContext 3 lines around mutation point read from disk | FR-15, AC-3, @feature3 | Integration test | Draft | File not readable graceful path emits null context |
| CHK-FR16-01 | FR-16 Ghostwriter integration runGhostwriter function spawns hypothesis write subprocess | FR-16, AC-1, @feature1 | Integration test | Draft | Pre-flight hypothesis version check plus STDOUT parse |
| CHK-FR17-01 | FR-17 framework selection documented in SKILL.md section 3 with AskUserQuestion pattern plus 6 frameworks enumerated | FR-17, AC-4, @feature4 | Manual review | Verified | Cross-link to 9 established skills |

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

- Total CHKs: 34
- Verified: 16
- In Progress: 0
- Draft: 18
- Blocked: 0
