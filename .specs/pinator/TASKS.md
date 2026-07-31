# Pinator — Implementation Tasks

Wave section = migrate DoD + GH debt (M0/M6/M7 open → product NOT COMPLETE). Phase 1–N below are inherited eligibility-first redesign tasks — still open where unfinished; do not read “contract migrated” as those checkboxes done.

## Wave: unified pinator spec (2026-07-31)

- [x] Migrate CEG contract docs → pinator (M1–M4) — id: wave-migrate-docs — Status: DONE | Est: 120m
  _Requirements: FR-1..FR-12_
  **Done When:**
    - [x] FR/AC/DESIGN/feature/REQUIREMENTS mirrored under `.specs/pinator/`
    - [x] Former live slug archived (superseded)

- [ ] M0 Intent — goal-driven auto-continue (#63) — id: m0-intent-gh63 — Status: TODO | Est: 480m
  _Requirements: M0 (open backlog)_
  **Done When:**
    - [ ] Spec+impl for drive-until-genuine-decision without fake COMPLETE rollup

- [ ] M6 Polarity flip (#74) — id: m6-polarity-gh74 — Status: TODO | Est: 240m
  _Requirements: M6 (open backlog)_
  **Done When:**
    - [ ] Referent carve-out documented and tested under pinator

- [ ] M2 evidence/normative follow-ups (#149/#161/#193) — id: m2-gh-followups — Status: TODO | Est: 360m
  _Requirements: FR-8, FR-9, FR-11_
  **Done When:**
    - [ ] Each issue mapped to CHK/status; not marked complete merely by ingest

- [ ] M7 Orchestration (#212/#215) — id: m7-orchestration — Status: TODO | Est: 0m
  _Requirements: M7 OUT_OF_SCOPE this wave_
  **Done When:**
    - [ ] Tracked as open backlog; implementation deferred


## Phase 1: Context foundations

- [ ] Capture real lifecycle fixtures — id: context-fixtures — Status: TODO | Est: 120m
  _Requirements: FR-2, FR-3, FR-6, FR-12_
  **Done When:**
  - [ ] Real sanitized fixtures cover task failure/re-key/ownership, both plan approval shapes, native goal set/met/clear/resume, and Codex adapter or fail-open.
  - [ ] Fixtures retain producer/version provenance and no secret values.

- [ ] Build one-pass event reader — id: transcript-events — Status: TODO | Est: 120m
  _Requirements: FR-8, FR-12_
  **Done When:**
  - [ ] Task, plan, spec, goal, and turn consumers share one bounded parsed event set.
  - [ ] `last_assistant_message`, result correlation, malformed lines, and truncation are covered.

## Phase 2: Source collectors

- [ ] Implement session task source — id: task-context — Status: TODO | Est: 120m
  _Requirements: FR-2_
  **Done When:**
  - [ ] Open/closed, failed update, re-key, duplicate, reminder/List/Get ownership, and final closure scenarios pass.

- [ ] Implement approved plan ledger — id: plan-context — Status: TODO | Est: 180m
  _Requirements: FR-3, FR-4_
  **Done When:**
  - [ ] Only successful correlated approval activates and extracts stable commitment IDs.
  - [ ] Linked evidence closes one commitment; ALL-not-ANY, blocked/awaiting, abandon, and supersede pass.

- [ ] Implement active spec source — id: spec-context — Status: TODO | Est: 120m
  _Requirements: FR-5_
  **Done When:**
  - [ ] Session activity AND mapped open work activate; read-only/global/feature-only-without-task do not.
  - [ ] Multiple specs remain visible and close independently.

- [ ] Implement native goal source — id: goal-context — Status: TODO | Est: 120m
  _Requirements: FR-6_
  **Done When:**
  - [ ] Set/met/clear/resume fixtures replay without prose regexes.
  - [ ] Native evaluator coexistence cannot cross-close or create an unbounded loop.

## Phase 3: Stop and judge

- [ ] Invert Stop flow to eligibility-first — id: eligibility-first — Status: TODO | Est: 120m
  _Requirements: FR-1, FR-11_
  **Done When:**
  - [ ] No-source and every old prose arming signal approve before classifier, judge, warning, census, and state.
  - [ ] Enforce and shadow inactive paths have zero side effects.

- [ ] Merge bounded current context — id: merged-context — Status: TODO | Est: 120m
  _Requirements: FR-7, FR-8_
  **Done When:**
  - [ ] Four-source merge preserves deterministic provenance/conflicts.
  - [ ] Final-message precedence, result evidence, redaction, and truncation pass.

- [ ] Implement structured commitment judge — id: structured-judge — Status: TODO | Est: 180m
  _Requirements: FR-9_
  **Done When:**
  - [ ] Every commitment and evidence ID is schema-validated.
  - [ ] Actionable blocks ALL rollup; blocked/awaiting approve without closure; async alone never activates.

- [ ] Scope state and credentials — id: scoped-state — Status: TODO | Est: 90m
  _Requirements: FR-10_
  **Done When:**
  - [ ] Active no-token warns without blocking and inactive stays silent.
  - [ ] Same revision bounds retries; changed revision rejects stale state; inactive writes nothing.

## Phase 4: Cross-spec and distribution

- [ ] Reconcile spec-generator-v4 FR-49 ownership — id: specgen-reconcile — Status: TODO | Est: 180m
  _Requirements: FR-5, FR-7, FR-11_
  **Done When:**
  - [ ] Generic census/task routing remains in spec-generator-v4 and structured active-spec context replaces global gate arming.
  - [ ] Dependent FR/AC/scenario/task edges are updated without duplicate claim-gate ownership.

- [ ] Rebuild and verify shipped clients — id: distribution — Status: TODO | Est: 120m
  _Requirements: FR-12_
  **Done When:**
  - [ ] Deps-absent Claude bundle works, endpoint resolver consumer remains, and canonical route is unchanged.
  - [ ] Codex uses a proven adapter or explicit observable fail-open.

## Phase 5: Evidence

- [ ] Implement BDD and mutation pins — id: bdd-mutation — Status: TODO | Est: 240m
  _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12_
  **Done When:**
  - [ ] External CEGATE001 mirrors source scenarios CEGATE001_66..91 and drives the real Stop hook in Docker.
  - [ ] Mutation pins kill eligibility, status, approval, ALL-rollup, goal, spec-AND, final-message, and merge-cardinality mutations.

- [ ] Run final evidence matrix — id: final-verification — Status: TODO | Est: 120m
  _Requirements: FR-1, FR-12_
  **Done When:**
  - [ ] Targeted/full Docker BDD, build, lint, hook review, semantic judge bench, pack, and deps-absent smoke have fresh evidence.
  - [ ] Conformance, coverage, and smart spec verdict are recorded honestly.
