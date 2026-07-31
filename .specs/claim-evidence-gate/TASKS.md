# Claim-Evidence Gate — Implementation Tasks

All tasks are pending. Historical implementation satisfied the superseded globally-armed contract and is not evidence that this redesign is complete.

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
