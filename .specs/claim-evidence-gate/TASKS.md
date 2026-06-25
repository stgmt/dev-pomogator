# Tasks — Claim-Evidence Gate (pinator)

> FR-1..FR-13 already implemented in `tools/claim-evidence-gate/`. FR-17..FR-22 (2026-06-25 session:
> «Дальше»-arming, lastUserPrompt strip, live openWork, self-skip removal, which-spec block, recency
> offer) are implemented + committed (462a3e93, 768731f0, 108e36d0) + recorded in FR.md. These tasks
> cover FR-14/FR-15 (loud token demand). Each task: `**Done When:**` ≥1 checkbox, Status, Est.

## Phase 0: BDD Foundation (Red)

- [x] Author CEGATE001_17/18 scenarios + tests for FR-14/FR-15 BEFORE wiring -- @feature15 — Status: DONE | Est: 20m
  _Requirements: FR-14, FR-15_
  **Done When:**
  - [x] CEGATE001_17/18 exist in `claim-evidence-gate.test.ts` and the `.feature`
  - [x] they assert the demand text + the token-priority flip (Red before the impl)

## Phase 1: Loud token demand (FR-15)

- [x] Surface a chat-visible "connect the aipomogator token" demand when the smart judge has no token -- @feature15 — Status: DONE | Est: 45m
  _Requirements: FR-14, FR-15_
  **Done When:**
  - [x] In `claim_evidence_gate_stop.ts` gray-zone branch: when `resolveEndpoint()===null` (no token) and a gray stop with open work, the demand names the token env vars + endpoint (owner changed block→WARN: `warn()` emits `{decision:"approve", systemMessage}`, FR-15)
  - [x] The "why judge can't run" is in the chat-visible message (`systemMessage`), not stderr-only
  - [x] Offline user not hung — warn never blocks at all

## Phase 2: BDD in Docker

- [ ] BDD CEGATE001_17/18 driving the real hook decision, green in Docker -- @feature15 — Status: BLOCKED | Est: 30m
  _Requirements: FR-15_
  _Blocker: vitest суйт гоняется только в Docker; WSL docker-сокет под группой 1001 ≠ docker(989) → нужен одноразовый `sudo chown root:docker /var/run/docker.sock` (пароль WSL — только владелец). Логика доказана прямыми host-прогонами (CEGATE001_17/18 + FR15_WARN_NOT_BLOCK_PASS)._
  **Done When:**
  - [ ] CEGATE001_17: gray stop + no token -> chat-visible demand (warn, not block)
  - [ ] CEGATE001_18: gray stop + token set -> no-token branch does not fire
  - [ ] scenarios run in Docker green

## Phase 3: Verify for all users

- [x] Prove the demand fires deps-absent (bundled, no node_modules) -- @feature15 — Status: DONE | Est: 20m
  _Requirements: FR-15_
  **Done When:**
  - [x] `claim_evidence_gate_stop.bundle.mjs` is self-contained (esbuild) and runs via bare `node` with no node_modules
  - [x] driven deps-absent with no token -> chat-visible message contains the token demand (real-run FR15_WARN_NOT_BLOCK_PASS)
