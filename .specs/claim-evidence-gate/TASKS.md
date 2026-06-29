# Tasks — Claim-Evidence Gate (pinator)

> FR-1..FR-13 already implemented in `tools/claim-evidence-gate/`. These tasks cover FR-14/FR-15
> (loud token demand). Each task: `**Done When:**` ≥1 checkbox, Status, Est.

## Phase 0: BDD Foundation (Red)

- [x] Author CEGATE001_17/18 scenarios + tests for FR-14/FR-15 BEFORE wiring -- @feature15 — Status: DONE | Est: 20m
  _Requirements: FR-14, FR-15_
  **Done When:**
  - [x] CEGATE001_17/18 exist in `claim-evidence-gate.test.ts` and the `.feature`
  - [x] they assert the demand text + the token-priority flip (Red before the impl)

## Phase 1: Loud token demand (FR-15)

- [x] Surface a chat-visible "connect the aipomogator token" message when the smart judge has no token -- @feature15 — Status: DONE | Est: 45m
  _Requirements: FR-14, FR-15_
  **Done When:**
  - [ ] In `claim_evidence_gate_stop.ts` gray-zone branch: when `resolveEndpoint()===null` (no token) and a gray stop with open work, the message names the token env vars + endpoint
  - [ ] The "why judge can't run" is in the chat-visible message, not stderr-only
  - [ ] @feature15 scenarios pass

## Phase 2: BDD

- [ ] BDD CEGATE001_17/18 driving the real hook decision, green in Docker -- @feature15 — Status: TODO | Est: 30m
  _Requirements: FR-15_
  **Done When:**
  - [ ] CEGATE001_17: gray stop + no token -> chat-visible demand
  - [ ] CEGATE001_18: gray stop + token set -> no-token branch does not fire
  - [ ] scenarios run in Docker green

## Phase 3: Verify for all users

- [x] Prove the demand fires deps-absent (bundled, no node_modules) -- @feature15 — Status: DONE | Est: 20m
  _Requirements: FR-15_
  **Done When:**
  - [ ] rebuild `claim_evidence_gate_stop.bundle.mjs`; run it deps-absent with no token -> chat-visible message contains the token demand

## Phase 4: Offloading + fighting-the-gate hardening (FR-23..FR-30)

- [x] Judge catches offloading + weakening-the-gate; facts computed from real inputs; Docker fixed via TCP -- @feature15 — Status: DONE | Est: 90m
  _Requirements: FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30_
  **Done When:**
  - [x] game_guard_facts compute YES on real Edit / apply_spec_change / set_spec_status, NO on normal edits
  - [x] Docker test suite runs in-container via the TCP endpoint with no sudo
  - [ ] judge-bench green twice: offloading and gaming cases BLOCK, legit carve-outs APPROVE

## Phase 5: BDD-coverage findings (2026-06-29 audit)

- [ ] Retire-or-wire the orphan CEGATE001 .feature -- @feature15 — Status: TODO | Est: 60m
  _Requirements: FR-23, FR-24, FR-25, FR-26_
  **Done When:**
  - [ ] `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` is either retired OR given real step-defs and wired into `cucumber.json` (today it has 30 scenarios, no step-defs, and is absent from cucumber.json — dead documentation)
  - [ ] the new offloading facts get a `@featureN` scenario driving the real `gateSelfEdit` / `selfMarkedBlockedOrBacklog` during this spec FR-5 migration wave
- [ ] Record judge-bench as the legit non-tail exception -- @feature15 — Status: TODO | Est: 15m
  _Requirements: FR-23_
  **Done When:**
  - [ ] DESIGN/README note that the LLM-judge behaviour is pinned LIVE in `tools/claim-evidence-gate/bench/judge-bench.ts` (not a `*.test.ts`), so it is NOT an FR-5 migration target nor an FR-6 refusal — it is the genuine non-deterministic-judge exception
