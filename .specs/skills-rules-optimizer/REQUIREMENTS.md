# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-audit-skills-directory) | Audit skills directory | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec) | Frontmatter validation | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-allowed-tools-coverage-check) | Allowed-tools coverage | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-triple-axis-overlap-detection) | Triple-axis overlap | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-llm-merge-synthesis-через-sub-agent) | LLM merge envelope | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-ratchet-scorer-regression-prevention) | Ratchet scorer | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-preserve-originals-no-auto-delete) | Preserve originals | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-unified-scoring-engine-для-rules-skills) | Unified scoring engine | (transitively covered) | (transitively covered) | Draft |
| [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side) | Backward compat (rules) | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-9) | @feature8 | Draft |

## Functional Requirements

- [FR-1: Audit skills directory](FR.md#fr-1-audit-skills-directory)
- [FR-2: Frontmatter validation per Anthropic spec](FR.md#fr-2-frontmatter-validation-per-anthropic-spec)
- [FR-3: Allowed-tools coverage check](FR.md#fr-3-allowed-tools-coverage-check)
- [FR-4: Triple-axis overlap detection](FR.md#fr-4-triple-axis-overlap-detection)
- [FR-5: LLM merge synthesis](FR.md#fr-5-llm-merge-synthesis-через-sub-agent)
- [FR-6: Ratchet scorer](FR.md#fr-6-ratchet-scorer-regression-prevention)
- [FR-7: Preserve originals](FR.md#fr-7-preserve-originals-no-auto-delete)
- [FR-8: Unified scoring engine](FR.md#fr-8-unified-scoring-engine-для-rules-skills)
- [FR-9: Backward compatibility (rules)](FR.md#fr-9-backward-compatibility-для-rules-side)
- ~~[FR-10: Embedding-based semantic merge](FR.md#fr-10-embedding-based-semantic-merge-out-of-scope)~~ — OUT OF SCOPE (deferred to v0.2.0)
- ~~[FR-11: Auto-apply без human review](FR.md#fr-11-auto-apply-без-human-review-out-of-scope)~~ — OUT OF SCOPE (design choice, never)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Audit JSON shape](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): Frontmatter forbidden token](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Tools coverage missing](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Jaccard ≥0.3 flagged](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): Merge envelope JSON](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Ratchet revert on regression](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Originals preserved](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-9): Rules audit byte-identical](ACCEPTANCE_CRITERIA.md#ac-8-fr-9)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | audit-skills.ts emits structured JSON со всеми required keys | FR-1, AC-1, @feature1 | BDD scenario | Draft | F-1 fixture |
| CHK-FR1-02 | Token count + line count emitted per skill | FR-1, AC-1, UC-1 | Unit test | Draft | tests/e2e/skills-rules-optimizer-audit.test.ts |
| CHK-FR2-01 | Forbidden token "claude" в name detected | FR-2, AC-2, @feature2 | BDD scenario | Draft | F-2 fixture |
| CHK-FR2-02 | Description third-person validation | FR-2, AC-2, UC-1 | Unit test | Draft | Anthropic spec compliance |
| CHK-FR2-03 | Oversize SKILL.md (>500 lines) warning | FR-2, AC-2, UC-4 | Unit test | Draft | F-4 fixture |
| CHK-FR3-01 | Skill invocation в body но missing в allowed-tools — error | FR-3, AC-3, @feature3 | BDD scenario | Draft | F-3 fixture |
| CHK-FR3-02 | Bash invocation parsed by regex | FR-3, AC-3, UC-1 | Unit test | Draft | tool detection regex |
| CHK-FR4-01 | Jaccard ≥0.3 на triggers axis flagged | FR-4, AC-4, @feature4 | BDD scenario | Draft | F-6 fixture |
| CHK-FR4-02 | Triple-axis (sections) computed | FR-4, AC-4, UC-1 | Unit test | Draft | section heading axis |
| CHK-FR4-03 | Triple-axis (functional) computed | FR-4, AC-4, UC-2 | Unit test | Draft | functional keywords axis |
| CHK-FR5-01 | Merge envelope structure (action, subagent_type, prompt, continuation) | FR-5, AC-5, @feature5 | BDD scenario | Draft | F-6 fixture |
| CHK-FR5-02 | MERGE_PROMPT loaded from references/merge-prompt-template.md | FR-5, AC-5, UC-2 | Unit test | Draft | template substitution |
| CHK-FR5-03 | Path validation (no traversal) | FR-5, AC-5, UC-2 | Unit test | Draft | NFR-Security |
| CHK-FR6-01 | Scorer envelope structure | FR-6, AC-6, UC-2 | Unit test | Draft | envelope shape |
| CHK-FR6-02 | Regression detection (score_merged < score_originals) → revert | FR-6, AC-6, @feature6 | BDD scenario | Draft | mock data inline |
| CHK-FR6-03 | --force flag overrides regression decision | FR-6, AC-6, UC-3 | Unit test | Draft | force override |
| CHK-FR7-01 | Originals untouched after successful merge | FR-7, AC-7, @feature7 | BDD scenario | Draft | F-6 fixture |
| CHK-FR7-02 | Cleanup suggestion в output (не auto-execute) | FR-7, AC-7, UC-2 | Unit test | Draft | dim text suggestion |
| CHK-FR8-01 | Asset interface generic (rule or skill) | FR-8, AC-1, UC-1 | Unit test | Draft | parseFrontmatterFlexible coverage |
| CHK-FR8-02 | shared.ts exports stable (existing types preserved) | FR-8, AC-8, UC-6 | Integration test | Draft | TS compile check |
| CHK-FR9-01 | audit.ts --dir .claude/rules byte-identical baseline | FR-9, AC-8, @feature8 | Integration test | Draft | snapshot test |
| CHK-FR9-02 | /suggest-rules Phase 6 не regression | FR-9, AC-8, UC-6 | Manual review | Draft | run end-to-end |
| CHK-FR9-03 | check-antipatterns.ts на rules-only — verbatim | FR-9, AC-8, UC-6 | Unit test | Draft | regression test |
| CHK-FR9-04 | report.ts --before --after на rules-only — verbatim | FR-9, AC-8, UC-6 | Unit test | Draft | regression test |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs в `Draft` ✓ (текущая)
- Phase 3 STOP: ≥50% of CHKs in `In Progress` (после implementation start)
- Implementation end: 100% `Verified` или explicit `Blocked` с issue link

## Summary Counts

- Total CHKs: 24
- Verified: 0
- In Progress: 0
- Draft: 24
- Blocked: 0
