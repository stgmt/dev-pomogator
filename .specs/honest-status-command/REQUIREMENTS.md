# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-invocation-surface) | Invocation surface | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-invocation-surface) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-active-spec-auto-detection) | Active spec auto-detection | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-active-spec-auto-detection) | @feature1 | Draft |
| [FR-3](FR.md#fr-3-sub-agent-delegation) | Sub-agent delegation | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-sub-agent-delegation) | @feature1 | Draft |
| [FR-4](FR.md#fr-4-ac-evidence-classification) | AC evidence classification | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-ac-evidence-classification) | @feature1, @feature2 | Draft |
| [FR-5](FR.md#fr-5-test-results-recency-audit) | Test results recency audit | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-test-results-recency) | @feature3 | Draft |
| [FR-6](FR.md#fr-6-test-body-quality-classification) | Test body quality classification | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-test-body-quality-classification) | @feature4 | Draft |
| [FR-7](FR.md#fr-7-git-working-state-cross-reference) | Git working state | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-git-working-state) | @feature1 | Draft |
| [FR-8](FR.md#fr-8-environmental-blockers-section) | Environmental blockers section | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-environmental-blockers-section) | @feature3 | Draft |
| [FR-9](FR.md#fr-9-output-format--structured-json--markdown-render) | Output format JSON + markdown | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-output-format) | @feature1 | Draft |
| [FR-10](FR.md#fr-10-reuse-spec-statusts-wrapper) | Reuse spec-status.ts wrapper | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-reuse-spec-statusts) | @feature1 | Draft |

## Functional Requirements

- [FR-1: Invocation surface](FR.md#fr-1-invocation-surface)
- [FR-2: Active spec auto-detection](FR.md#fr-2-active-spec-auto-detection)
- [FR-3: Sub-agent delegation](FR.md#fr-3-sub-agent-delegation)
- [FR-4: AC evidence classification](FR.md#fr-4-ac-evidence-classification)
- [FR-5: Test results recency audit](FR.md#fr-5-test-results-recency-audit)
- [FR-6: Test body quality classification](FR.md#fr-6-test-body-quality-classification)
- [FR-7: Git working state cross-reference](FR.md#fr-7-git-working-state-cross-reference)
- [FR-8: Environmental blockers section](FR.md#fr-8-environmental-blockers-section)
- [FR-9: Output format JSON + markdown](FR.md#fr-9-output-format--structured-json--markdown-render)
- [FR-10: Reuse spec-status.ts wrapper](FR.md#fr-10-reuse-spec-statusts-wrapper)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Invocation surface — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-invocation-surface)
- [AC-2 (FR-2): Active spec auto-detection — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-active-spec-auto-detection)
- [AC-3 (FR-3): Sub-agent delegation — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-sub-agent-delegation)
- [AC-4 (FR-4): AC evidence classification — 4 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-ac-evidence-classification)
- [AC-5 (FR-5): Test recency — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-test-results-recency)
- [AC-6 (FR-6): Test quality — 4 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-test-body-quality-classification)
- [AC-7 (FR-7): Git state — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-git-working-state)
- [AC-8 (FR-8): Env blockers — 4 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-environmental-blockers-section)
- [AC-9 (FR-9): Output format — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-output-format)
- [AC-10 (FR-10): Reuse — 3 sub-criteria](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-reuse-spec-statusts)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | FR-1 invocation user explicit `/spec-status <slug>` | FR-1, AC-1.1, @feature1, UC-2 | BDD scenario | Draft | — |
| CHK-FR1-02 | FR-1 invocation AI proactive via Skill tool | FR-1, AC-1.2, @feature1, UC-1 | BDD scenario | Draft | — |
| CHK-FR1-03 | FR-1 SKILL.md description содержит trigger keywords | FR-1, AC-1.3, @feature1 | Manual review | Draft | grep SKILL.md frontmatter |
| CHK-FR2-01 | FR-2 mtime-based autodetect single recent spec | FR-2, AC-2.1, @feature1, UC-1 | BDD scenario | Draft | — |
| CHK-FR2-02 | FR-2 tie-break via plan path matching | FR-2, AC-2.2, @feature1 | BDD scenario | Draft | — |
| CHK-FR2-03 | FR-2 no active spec — output usage hint | FR-2, AC-2.3, @feature1 | BDD scenario | Draft | — |
| CHK-FR3-01 | FR-3 Agent(subagent_type=general-purpose) invoked | FR-3, AC-3.1, @feature1, UC-1 | Integration test | Draft | mock Agent в test, verify call args |
| CHK-FR3-02 | FR-3 context bundle ≤4KB JSON с required keys | FR-3, AC-3.2, @feature1 | Unit test | Draft | bundle size check |
| CHK-FR3-03 | FR-3 sub-agent reads files (не main AI) | FR-3, AC-3.3, @feature1 | Integration test | Draft | trace Read tool calls в sub-agent output |
| CHK-FR3-04 | FR-3 NFR Performance — sub-agent timeout ≤60s | FR-3, AC-3.1, @feature1 | Integration test | Draft | NFR-Performance — timing assertion |
| CHK-FR3-05 | FR-3 NFR Security — credentials filter (no `*_KEY=` в bundle) | FR-3, AC-3.2, @feature1 | Unit test | Draft | NFR-Security — filter unit test |
| CHK-FR4-01 | FR-4 AC classified в 3 categories | FR-4, AC-4.1, @feature1, UC-1 | BDD scenario | Draft | — |
| CHK-FR4-02 | FR-4 verified requires evidence path | FR-4, AC-4.2, @feature1 | BDD scenario | Draft | — |
| CHK-FR4-03 | FR-4 blocked requires reason | FR-4, AC-4.3, @feature1 | BDD scenario | Draft | — |
| CHK-FR4-04 | FR-4 no overclaim — done без evidence marked claimed_only | FR-4, AC-4.4, @feature2, UC-2 | BDD scenario | Draft | core anti-overclaim test |
| CHK-FR5-01 | FR-5 fresh classification — YAML <5 min | FR-5, AC-5.1, @feature3, UC-3 | BDD scenario | Draft | — |
| CHK-FR5-02 | FR-5 stale heartbeat detection — YAML ≥5 min при running | FR-5, AC-5.2, @feature3 | BDD scenario | Draft | environmental hang detection |
| CHK-FR5-03 | FR-5 not_run when no YAML exists | FR-5, AC-5.3, @feature3 | BDD scenario | Draft | — |
| CHK-FR6-01 | FR-6 per-it classification STRONG/WEAK/FAKE-POSITIVE-RISK | FR-6, AC-6.1, @feature4, UC-4 | BDD scenario | Draft | — |
| CHK-FR6-02 | FR-6 weak detection — only toBeDefined / toBeTruthy | FR-6, AC-6.2, @feature4 | BDD scenario | Draft | — |
| CHK-FR6-03 | FR-6 mock-heavy fake-positive detection | FR-6, AC-6.3, @feature4 | BDD scenario | Draft | — |
| CHK-FR6-04 | FR-6 tautology detection | FR-6, AC-6.4, @feature4 | BDD scenario | Draft | — |
| CHK-FR7-01 | FR-7 git counts reported (modified/staged/committed/pushed) | FR-7, AC-7.1, @feature1, UC-1 | Integration test | Draft | mock git status |
| CHK-FR7-02 | FR-7 scope overlap limited to .specs/{slug}/ + FILE_CHANGES paths | FR-7, AC-7.2, @feature1 | Integration test | Draft | — |
| CHK-FR7-03 | FR-7 clean state marked 🟢 | FR-7, AC-7.3, @feature1 | BDD scenario | Draft | — |
| CHK-FR8-01 | FR-8 Docker daemon unreachable detected | FR-8, AC-8.1, @feature3, UC-3 | BDD scenario | Draft | mock docker ps exit non-zero |
| CHK-FR8-02 | FR-8 WSL connection failure detected (Windows) | FR-8, AC-8.2, @feature3 | Manual review | Draft | Windows-only, manual on Win host |
| CHK-FR8-03 | FR-8 stale heartbeat as env block (NOT test failure) | FR-8, AC-8.3, @feature3 | BDD scenario | Draft | core blocker-vs-failure distinction |
| CHK-FR8-04 | FR-8 empty section omitted from output | FR-8, AC-8.4, @feature3 | BDD scenario | Draft | — |
| CHK-FR9-01 | FR-9 JSON conforms to SCHEMA | FR-9, AC-9.1, @feature1, UC-1 | Unit test | Draft | JSON schema validation |
| CHK-FR9-02 | FR-9 markdown has 5 sections (Spec/AC/Tests/Git/EnvBlockers conditional) | FR-9, AC-9.2, @feature1 | BDD scenario | Draft | — |
| CHK-FR9-03 | FR-9 emoji prefixes (✓/⏸/❌/🟢/🟡/🔴) | FR-9, AC-9.3, @feature1 | Manual review | Draft | visual inspection |
| CHK-FR10-01 | FR-10 wraps spec-status.ts subprocess | FR-10, AC-10.1, @feature1, UC-1 | Integration test | Draft | spawn spec-status.ts, parse JSON |
| CHK-FR10-02 | FR-10 spec-status.ts file unchanged (git diff) | FR-10, AC-10.2, @feature1 | Manual review | Draft | git diff at end of implementation |
| CHK-FR10-03 | FR-10 DESIGN.md "Reuse map" documents source of behaviors | FR-10, AC-10.3, @feature1 | Manual review | Draft | DESIGN.md content check |

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

- Total CHKs: 35
- Verified: 0
- In Progress: 0
- Draft: 35
- Blocked: 0
