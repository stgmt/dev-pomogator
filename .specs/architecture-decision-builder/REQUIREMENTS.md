# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-axis-enumeration-из-prd) | Axis enumeration | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) | Per-axis artefact (md+html) | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe) | Browser auto-open | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-итеративный-выбор-через-askuserquestion) | Iterative choice | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) | INDEX compile | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-cascading-implications-bmad-pattern) | Cascading implications | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) | Two run modes | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-anti-bias-guardrails) | Anti-bias guardrails | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-audit-category-architecture_coverage) | ARCHITECTURE_COVERAGE audit | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail) | Escape hatch + audit trail | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) | Eval suite (debug + benchmark) | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Draft |

## Functional Requirements

- [FR-1: Axis enumeration из PRD](FR.md#fr-1-axis-enumeration-из-prd)
- [FR-2: Per-axis artefact (md+html)](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html)
- [FR-3: Browser auto-open](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe)
- [FR-4: Iterative choice](FR.md#fr-4-итеративный-выбор-через-askuserquestion)
- [FR-5: INDEX compile](FR.md#fr-5-index-compile-idempotent-status-matrix)
- [FR-6: Cascading implications](FR.md#fr-6-cascading-implications-bmad-pattern)
- [FR-7: Two run modes](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175)
- [FR-8: Anti-bias guardrails](FR.md#fr-8-anti-bias-guardrails)
- [FR-9: ARCHITECTURE_COVERAGE audit](FR.md#fr-9-audit-category-architecture_coverage)
- [FR-10: Escape hatch + audit trail](FR.md#fr-10-escape-hatch-с-audit-trail)
- [FR-11: Eval suite (debug + benchmark)](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Axis enumeration](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Per-axis artefact](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Browser auto-open](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Iterative choice](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): INDEX compile](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Cascading](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Two run modes](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): Anti-bias guardrails](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): ARCHITECTURE_COVERAGE audit](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10): Escape hatch](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11): Eval suite](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Axis enumeration детектит ≥1 ось на greenfield PRD | FR-1, AC-1, @feature1 | Integration test | Draft | ARCH001 |
| CHK-FR1-02 | Brownfield build-manifest → axes_detected=0 | FR-1, AC-1, @feature1 | Integration test | Draft | ARCH001 hard-OUT |
| CHK-FR2-01 | Per-axis md+html с ≥3 вариантами + When-NOT | FR-2, AC-2, @feature2 | Integration test | Draft | ARCH002 |
| CHK-FR2-02 | Seeded randomization + recommendation pinned top | FR-2, AC-2, @feature2 | Integration test | Draft | ARCH002 |
| CHK-FR3-01 | Cross-platform browser launch (start/open/xdg-open) | FR-3, AC-3, @feature3 | Integration test | Draft | ARCH004 mocked |
| CHK-FR3-02 | ENOENT → launched=false + fallback, без throw | FR-3, AC-3, @feature3 | Integration test | Draft | ARCH004 |
| CHK-FR4-01 | AskUserQuestion с [Беру рекомендацию] + запись выбора | FR-4, AC-4, @feature4 | Integration test | Draft | ARCH005 cli |
| CHK-FR5-01 | INDEX compile idempotent (AUTOGEN markers) | FR-5, AC-5, @feature5 | Integration test | Draft | ARCH003 |
| CHK-FR6-01 | Cascading add to QUEUE + depth cap 2 | FR-6, AC-6, @feature6 | Integration test | Draft | ARCH005 |
| CHK-FR7-01 | create-spec Phase 1.75 invocation + v<4 no-op | FR-7, AC-7, @feature7 | Integration test | Draft | ARCH005 |
| CHK-FR8-01 | ≥1 non-default variant + [VERIFIED]/[UNVERIFIED] markers | FR-8, AC-8, @feature8 | Integration test | Draft | ARCH002 |
| CHK-FR9-01 | Pending ось → ARCHITECTURE_COVERAGE WARNING | FR-9, AC-9, @feature9 | Integration test | Draft | ARCH005 audit |
| CHK-FR10-01 | Escape hatch → JSONL log + short-reason WARNING | FR-10, AC-10, @feature10 | Integration test | Draft | ARCH001 |
| CHK-FR11-01 | Deterministic eval → grading.json + aggregate.json | FR-11, AC-11, @feature11 | Integration test | Draft | ARCH006 eval |
| CHK-FR11-02 | Artifact-bench rubric R3 fail на тех-заявлении без [VERIFIED] marker | FR-11, AC-11, @feature11 | Integration test | Draft | ARCH006 anti-hallucination |

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

- Total CHKs: 15
- Verified: 0
- In Progress: 0
- Draft: 15
- Blocked: 0
