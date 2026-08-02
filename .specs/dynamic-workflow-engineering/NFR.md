# Non-Functional Requirements (NFR)

## Performance

- A policy decision SHALL perform bounded deterministic registry/contract validation and SHALL not spawn an LLM agent as part of admission.
- Deterministic collectors SHALL prove finite cardinality, uniqueness, conservation, logical-call limits, physical-attempt limits, concurrency, rounds, tool calls, findings, and input/output byte ceilings without relying on model timing.
- The default packet envelope is a planning input only until runtime evidence proves it: at most one retry, 12 tool calls, 3 rounds, 10 minutes wall time, 1 MiB response bytes, and 32k response tokens. Configuration MAY narrow these bounds and SHALL not create an unbounded mode.
- Wall-clock, provider-token, context, and internal Workflow cancellation SHALL be labelled `best-effort` or `unavailable` unless a real host boundary proves hard cancellation. Monitoring SHALL not be relabelled as hard enforcement.
- The corrected incident verification target is at most three spec-MCP calls and 512 KiB aggregate response bytes for the declared corpus; this is a scoped test budget, not a universal performance claim.

## Security

- Authorization SHALL depend on trusted runtime provenance and exact finite contracts, never prompt text, labels, frontmatter, `subagent_type`, session identifiers, or caller-supplied environment values.
- Native Claude Code Agent/subagent and Workflow-native `agent()` are separate subjects. Workflow text or labels never authorize native Agent, and bounded Workflow delivery remains independent of native-Agent enforcement.
- A protected native-Agent route SHALL fail closed on initialization, authorization, or transport errors only when a real pre-spawn boundary and trusted origin have been proved and the route is installed. An unavailable proof SHALL yield a lower tier and no fake gate.
- Audit and journal records SHALL redact prompts, secrets, tokens, and raw tool payloads while retaining policy version, consumer, run/attempt identity, reason, hashes, fingerprints, counters, scope, branch, and schema result.
- Direct loopback, wrapper, Bash, or other unrelated routes SHALL not be reclassified as protected native-Agent coverage without a distinct capability proof; unrelated routes retain documented behavior.

## Reliability

- One logical work-package call SHALL remain distinct from its physical attempts across retries; unchanged, context-exhausted, `invalid_request`, schema-invalid, and budget failures SHALL circuit-break, with at most one materially changed/narrowed retry.
- Completed branch outputs SHALL be durable, inspectable, exportable, and conserved when siblings fail, block, or drop. Overall `COMPLETE` SHALL require every mandatory branch and required evidence (AND semantics), not any successful branch.
- Offline replay SHALL use only the redacted journal and incident exporter, without contacting the producer. Incomplete, missing, expired, or incompatible producer journal/transcript evidence SHALL return `REPLAY_UNAVAILABLE` and SHALL not imply completion.
- Compatible resume SHALL reuse unchanged completed calls and rerun only incomplete or materially changed work. A serial phase-runner adapter SHALL preserve authoritative phase order and treat non-zero child exit as explicit failure; bounded unchanged retries SHALL not reorder phases.
- Missing required reports SHALL yield explicit partial, blocked, or dropped scope state and coverage gaps, never false completion.

## Usability

- Every denial SHALL include a stable reason code and concise guidance to use Dynamic Workflow with `dynamic-workflow-engineering`, without claiming native-Agent enforcement when the host proof is absent.
- Monitoring SHALL separate `FACT`, `INFERENCE`, `UNKNOWN`, and `ACTION`, and SHALL expose phase, scope, branch, logical calls, physical attempts, resources, progress, failure signatures, circuit state, barriers, and coverage gaps.
- A `Large workflow` label, elapsed time, token volume, or number of agents alone SHALL never imply stalled, runaway, or quality status.
- The bounded adversarial verifier SHALL receive cited finding context and minimal deterministic reproduction evidence, SHALL not rediscover the corpus, and SHALL return exactly `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED`.

## Portability

- Canonical marketplace installation, repository dogfood, Windows, Docker, foreign-CWD startup, `CLAUDE_PLUGIN_ROOT` resolution, and dependency-absent execution SHALL consume the same bundled skill/runtime assets or declare a tested limitation.
- The design SHALL not assume `.claude/workflows/` is automatically distributed by the plugin manifest; executable `scriptPath` values SHALL resolve from the installed plugin root.
- A real-host capability matrix SHALL publish exactly one tier: `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE`, plus independent control modes `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`.
- Deterministic native-Agent consumer census and migration SHALL run only after working Workflow runtime and pilot evidence exist and SHALL include `architecture-decision-builder` as a known prior omission.

## Second dogfood NFR addendum (authoring-only)

The following non-functional constraints are derived from the user-supplied second dogfood postmortem. They are planned behavior for the canonical Dynamic Workflow harness, not evidence that this repository already implements them. The incident and all adjacent-project facts remain `[USER-SUPPLIED][UNVERIFIED_FOR_THIS_REPOSITORY]`.

### Identity, isolation, and ownership

- Every packet/run SHALL declare normalized `expectedRoot`, exact existing worktree or explicit isolation request, `baseSha`, `ownerTaskId`, and dirty-path allowlist. Mechanical root preflight SHALL compare expected root with the actual git top-level before the first work action; mismatch SHALL block/terminate before Read, Write, Bash, spawn, or mutation.
- The runtime SHALL atomically bind Agent/Workflow branch, repository root/worktree, process group, shared-resource lease, `runId`, and proof phase. Broken binding SHALL block mutation and completion; prompt paths and caller prose SHALL not authorize a different checkout.
- One CAS-based per-run state owner SHALL control the mutating phase. Checkout-writer lock and external/shared-runtime lease SHALL be separate. Nested fan-out SHALL require a central ownership census.

### Process, stop, and recovery reliability

- Each worker SHALL own an OS process group (Windows Job Object or Unix process group conceptually), and terminal stop SHALL require `ownerStopped=true`, `descendantsRemaining=0`, and `writersRemaining=0`, including wrappers, PowerShell jobs, WSL, nested CLIs, and child Claude processes.
- Stop states SHALL distinguish `PAUSED_RESUMABLE` from `TERMINATED_NO_RESUME`. Contamination and context overflow SHALL require a new worker with a concise recovery capsule, not old-context continuation. Two repeated infrastructure failures SHALL transition to `HARNESS_REPAIR` and block domain apply.
- Recovery capsules SHALL be 1–3 KiB and contain root, owner, base SHA, dirty paths, accepted evidence/commits, unproven work, last green gate, blocker, next action, and do-not-touch paths; full transcript replay is prohibited as the normal recovery mechanism.

### Evidence, mutation, and observability reliability

- APPLY SHALL be unavailable until root verification, exclusive ownership, green preflight, and frozen baseline/plan. Baseline hashes, staged/quarantined copies, rollback, and typed `originalCandidates`, `staged`, `proven`, `rejected`, `deferred`, and `unprovenApplied` collections SHALL preserve the evidence pyramid; completeness SHALL be an AND over all mandatory proof layers.
- External execution SHALL use argv arrays, separate UTF-8 stdout/stderr/evidence, native exit codes, atomic JSON, and failure diagnostics. A terminal error SHALL not be replaced by a warning, redirect/file-lock message, stale pulse, or foreign run.
- Per-run state, progress, commands, artifacts, and terminal records SHALL be isolated by run ID and monotonic sequence. Status SHALL correlate notifications, descendants, diagnostics, dirty paths, leases, proof-layer completeness, and terminal marker. Generic global BDD/log green SHALL not green an active incomplete run.
- Resource identity SHALL derive from run/worktree where possible. Labels SHALL include repository, worktree, SHA, owner, and lease; reuse SHALL validate ownership and actual mount/source; foreign resources SHALL never be deleted.
- Probes SHALL use one canonical real API path, typed schemas, `count == items.length` invariants, and independent external readback. Harness defect, capability gap, and product failure SHALL be distinct outcomes.
