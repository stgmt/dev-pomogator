# Claim-Evidence Gate — User Stories

### User Story 1: Quiet ordinary dialogue (Priority: P1)
**Требование:** [FR-1](FR.md#fr-1)
**Why:** Pinator must not invent work from conversation.
**Independent Test:** Run a no-source Stop containing completion prose and observe zero side effects.
**Acceptance Scenarios:**
- No-source Stop silently approves.

### User Story 2: Protect owned Claude tasks (Priority: P1)
**Требование:** [FR-2](FR.md#fr-2)
**Why:** Only work claimed in this session should keep the agent running.
**Independent Test:** Replay open, failed, re-keyed, unrelated, and closed task records.
**Acceptance Scenarios:**
- Final owned task closure disables task context.

### User Story 3: Protect approved plans only (Priority: P1)
**Требование:** [FR-3](FR.md#fr-3)
**Why:** A file or failed attempt is not user approval.
**Independent Test:** Replay both successful result shapes and rejected variants.
**Acceptance Scenarios:**
- Only correlated approval activates.

### User Story 4: Finish every plan commitment (Priority: P1)
**Требование:** [FR-4](FR.md#fr-4)
**Why:** One completed item must not hide remaining plan work.
**Independent Test:** Complete one of several commitments with evidence.
**Acceptance Scenarios:**
- Rollup stays active until ALL complete.

### User Story 5: Protect active spec work (Priority: P1)
**Требование:** [FR-5](FR.md#fr-5)
**Why:** Global spec backlog must not contaminate the session.
**Independent Test:** Compare read-only, feature-only, mapped-open, and multi-spec cases.
**Acceptance Scenarios:**
- Only activity plus mapped open work activates.

### User Story 6: Respect native goal (Priority: P1)
**Требование:** [FR-6](FR.md#fr-6)
**Why:** Claude already owns goal evaluation.
**Independent Test:** Replay set/met/clear/resume artifacts and combined Stop outcomes.
**Acceptance Scenarios:**
- Pinator never closes native goal.

### User Story 7: Preserve every source (Priority: P1)
**Требование:** [FR-7](FR.md#fr-7)
**Why:** Simultaneous obligations must not be discarded.
**Independent Test:** Activate all four source kinds with a conflict.
**Acceptance Scenarios:**
- Packet contains all provenance.

### User Story 8: Share relevant evidence safely (Priority: P1)
**Требование:** [FR-8](FR.md#fr-8)
**Why:** The judge needs current facts without secrets or transcript noise.
**Independent Test:** Build a packet from lagging transcript, large output, and secrets.
**Acceptance Scenarios:**
- Last assistant message wins and redaction holds.

### User Story 9: Judge each commitment (Priority: P1)
**Требование:** [FR-9](FR.md#fr-9)
**Why:** Structured states make completion and waiting auditable.
**Independent Test:** Validate mixed complete/actionable/awaiting output and evidence IDs.
**Acceptance Scenarios:**
- Any actionable item blocks ALL rollup.

### User Story 10: Isolate state and warnings (Priority: P2)
**Требование:** [FR-10](FR.md#fr-10)
**Why:** Old contexts must not release new work or produce irrelevant warnings.
**Independent Test:** Retry under same and changed context revisions with/without token.
**Acceptance Scenarios:**
- Inactive path writes and warns nothing.

### User Story 11: Remove obsolete over-firing (Priority: P1)
**Требование:** [FR-11](FR.md#fr-11)
**Why:** Historical regex arming caused ordinary-dialog interference.
**Independent Test:** Feed every old arming signal without a source.
**Acceptance Scenarios:**
- Old signals have no activation effect.

### User Story 12: Ship safely across clients (Priority: P2)
**Требование:** [FR-12](FR.md#fr-12)
**Why:** Claude and Codex do not share a proven lifecycle contract.
**Independent Test:** Run deps-absent Claude and Codex adapter/fail-open fixtures.
**Acceptance Scenarios:**
- One parser per input and no cross-client assumptions.
