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

- [ ] Surface a chat-visible "connect the aipomogator token" message when the smart judge has no token -- @feature15 — Status: TODO | Est: 45m
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

- [ ] Prove the demand fires deps-absent (bundled, no node_modules) -- @feature15 — Status: TODO | Est: 20m
  _Requirements: FR-15_
  **Done When:**
  - [ ] rebuild `claim_evidence_gate_stop.bundle.mjs`; run it deps-absent with no token -> chat-visible message contains the token demand
