# Claim-Evidence Gate — Design

## Architecture

One bounded event reader feeds four source collectors. Empty source context exits before side effects. Active commitments merge into a bounded packet and structured judge result. Plan completion is ALL-not-ANY. Native goal stays independent. State is session/context scoped. Client shapes are explicit.

### Decision: Eligibility-first Stop flow
**Требование:** [FR-1](FR.md#fr-1)
**Rationale:** Prose cannot safely establish that the user assigned unfinished work.
**Trade-off:** Every Stop must parse enough lifecycle evidence before classification.
**Alternatives considered:**
- Keep global claim classification and add more carve-outs.
- Disable Pinator for all dialogue and all implementation work.

### Decision: Replay only owned task lifecycle
**Требование:** [FR-2](FR.md#fr-2)
**Rationale:** Shared task lists otherwise contaminate the current session.
**Trade-off:** Result correlation and re-key handling add parser state.
**Alternatives considered:**
- Count every visible TaskList row.
- Trust only assistant prose about task status.

### Decision: Correlate successful plan approval
**Требование:** [FR-3](FR.md#fr-3)
**Rationale:** Plan files and attempts do not prove user approval or execution.
**Trade-off:** Multiple real result shapes require fixtures.
**Alternatives considered:**
- Use newest plan file mtime.
- Activate on every ExitPlanMode tool use.

### Decision: Persist an evidence-backed plan ledger
**Требование:** [FR-4](FR.md#fr-4)
**Rationale:** One completed task must not false-green the whole plan.
**Trade-off:** Completion state needs atomic persistence by plan hash.
**Alternatives considered:**
- Close a plan when any linked task completes.
- Keep every approved plan active forever.

### Decision: Require spec activity and mapped open work
**Требование:** [FR-5](FR.md#fr-5)
**Rationale:** Mutation alone and global backlog alone are both insufficient.
**Trade-off:** Spec activation requires a scoped census lookup.
**Alternatives considered:**
- Arm on any spec read or write.
- Arm from every open repository spec.

### Decision: Treat native goal as independent
**Требование:** [FR-6](FR.md#fr-6)
**Rationale:** Claude already owns goal evaluation and lifecycle.
**Trade-off:** Clear/resume parser support waits for real artifacts.
**Alternatives considered:**
- Reimplement goal state in Pinator.
- Let Pinator judge and close native goals.

### Decision: Merge sources with provenance
**Требование:** [FR-7](FR.md#fr-7)
**Rationale:** Selecting one source hides simultaneous obligations.
**Trade-off:** The packet must expose duplicate links and conflicts.
**Alternatives considered:**
- Use a fixed source priority and discard the rest.
- Ask the user to select one source at every Stop.

### Decision: Send bounded current evidence
**Требование:** [FR-8](FR.md#fr-8)
**Rationale:** Full transcript prompts are noisy and can expose secrets.
**Trade-off:** Bounded fields can omit useful history and must mark truncation.
**Alternatives considered:**
- Send the whole transcript to the judge.
- Send only the final assistant message.

### Decision: Judge commitments structurally
**Требование:** [FR-9](FR.md#fr-9)
**Rationale:** Per-commitment states and evidence make ALL rollup verifiable.
**Trade-off:** Judge output requires schema validation.
**Alternatives considered:**
- Accept one free-text block boolean.
- Let deterministic claim classes decide every stop.

### Decision: Scope atomic state to context revision
**Требование:** [FR-10](FR.md#fr-10)
**Rationale:** Retry state and warnings must not leak across contexts.
**Trade-off:** Context hashing and atomic ledger writes are required.
**Alternatives considered:**
- Keep one repository-global marker.
- Remove anti-loop state entirely.

### Decision: Delete global activation heuristics
**Требование:** [FR-11](FR.md#fr-11)
**Rationale:** Their carve-out maze exists because activation is too broad.
**Trade-off:** Historical tests must be retired or rewritten.
**Alternatives considered:**
- Keep the heuristics behind eligibility as dead complexity.
- Add more regex exceptions.

### Decision: Share one parser and isolate clients
**Требование:** [FR-12](FR.md#fr-12)
**Rationale:** One parse controls performance while client adapters prevent false assumptions.
**Trade-off:** Codex may fail open until its real contract is captured.
**Alternatives considered:**
- Parse JSONL separately in every collector.
- Apply Claude transcript rules to every client.

## Verification architecture

Source BDD specifies lifecycle and invariants; external CEGATE001 drives the real Stop hook in Docker. Sanitized real fixtures pin task, plan, goal clear/resume, and client records. A local judge spy proves zero inactive calls and packet shape. Live judge bench covers semantics only. Mutation pins eligibility, statuses, plan correlation, ALL rollup, goal met, spec AND predicate, final-message precedence, and merge cardinality.
