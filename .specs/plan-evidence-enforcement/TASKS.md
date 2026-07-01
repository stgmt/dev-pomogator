# Tasks

## TDD Workflow

> Recorded after-the-fact: both workstreams implemented and committed (8e33904). Status DONE.

## Phase 1: Evidence enforcement (Green)

- [x] validateEvidence in validate-plan.ts -- @feature1 — Status: DONE | Est: 60m
  _Requirements: [FR-1](FR.md#fr-1-validate-plan-enforces-evidence)_
  **Done When:**
  - [x] the validator warns on a missing sources section and flags claims with no proof marker (commit 8e33904)
  - [x] the evidence tests pass (4 of 4 on host)
- [x] claims-need-evidence rule plus template plus index -- @feature2 — Status: DONE | Est: 30m
  _Requirements: [FR-2](FR.md#fr-2-claims-need-evidence-rule-and-template)_
  **Done When:**
  - [x] rule plus template sources section plus CLAUDE.md row (commit 8e33904)
  - [x] @feature2 scenario passes

## Phase 3: Refactor and Polish

- [x] Final verification — Status: DONE | Est: 15m
  **Done When:**
  - [x] committed with explicit paths; this plan dogfoods the rule (it has a sources section)
  - [x] spec-verdict reviewed
