# User Stories

### User Story 1: Keep native Agent and Workflow-native delivery separate (Priority: P1)

As a dev-pomogator user, I want native Claude Code Agent delegation governed separately from Workflow-native `agent()` delivery, so that workflow text cannot forge native-Agent authorization and the host guarantee is not overstated.

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)
**Feature:** @feature1

**Why:** Native Agent and Workflow-native agent() are separate subjects; a pre-spawn gate may be unavailable on a real host.

**Independent Test:** DWE001_01 evaluates both subjects and publishes STEERING_ONLY or UNAVAILABLE instead of a fake native-Agent gate when proof is absent.

**Acceptance Scenarios:**

Given no proven protected native-Agent pre-spawn boundary is installed and a Workflow-native packet is available
When the capability matrix evaluates native Agent and Workflow-native delivery
Then native-Agent enforcement is not claimed and Workflow delivery remains independently evaluated

### User Story 2: Admit only finite origin-safe Workflow packets (Priority: P1)

As a security maintainer, I want exact runtime provenance and finite consumer contracts checked, so that copied prompts, labels, sessions, subtypes, or environment values cannot authorize work.

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)
**Feature:** @feature2

**Why:** Caller-controlled prose and identifiers do not prove the origin, scope, or expiry of a Workflow child.

**Independent Test:** DWE001_02 admits one valid child and rejects forged, stale, duplicate, widened, expired, or over-budget variants.

**Acceptance Scenarios:**

Given a runtime-issued Workflow identity matches a current finite contract
When one permitted child is requested within every declared bound
Then exactly that child is admitted and invalid variants are denied

### User Story 3: Receive a bundled plugin-root-resolved skill (Priority: P1)

As a marketplace user, I want the Dynamic Workflow skill bundled in the canonical plugin, so that clean installs and foreign working directories use the same guidance and script paths.

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)
**Feature:** @feature3

**Why:** A nested plugin, user-home copy, or assumed `.claude/workflows/` distribution path would drift from the canonical plugin.

**Independent Test:** DWE001_03 discovers the skill and resolves scriptPath through `CLAUDE_PLUGIN_ROOT` or the installed plugin root with repository dependencies absent.

**Acceptance Scenarios:**

Given the canonical plugin is installed in a clean home from a foreign CWD
When the installed denial guidance and executable script are resolved
Then the bundled skill is found without assuming `.claude/workflows/` distribution

### User Story 4: Refuse unbounded or widened packets before work starts (Priority: P1)

As a Workflow operator, I want admission to require finite scope and explicit orchestration contracts, so that broad language cannot become recursive discovery.

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)
**Feature:** @feature4

**Why:** A packet without ownership, barriers, evidence, stop states, or finite scope cannot provide bounded cost or completeness.

**Independent Test:** DWE001_04 rejects a packet missing any required bound before a child starts.

**Acceptance Scenarios:**

Given a packet lacks a finite population or auditable discovery cap
When admission validates the packet
Then no child starts and every missing contract field is reported

### User Story 5: Collect deterministically before model work (Priority: P1)

As a cost owner, I want mechanical collection and finite adapters to run before model loops, so that agents classify a bounded remainder rather than rediscovering the repository or SpecGraph.

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)
**Feature:** @feature5

**Why:** Deterministic inventory and serial phase execution are cheaper, reproducible, and cardinality-checkable.

**Independent Test:** DWE001_05 proves collector-first ordering, adapter bounds, explicit non-zero phase failure, and unchanged serial order.

**Acceptance Scenarios:**

Given finite issue and spec populations can be collected mechanically
When the packet runs inventory and phase adapters
Then persisted collector evidence precedes model work and all declared ceilings remain bounded

### User Story 6: Stop unchanged retry storms (Priority: P1)

As a Workflow operator, I want logical calls separated from physical attempts and only one changed-strategy retry, so that context, schema, invalid-request, and budget failures circuit-break instead of looping.

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)
**Feature:** @feature6

**Why:** Repeating an unchanged strategy does not repair the failure and hides the actual cost.

**Independent Test:** DWE001_06 opens the circuit after the bounded retry policy and exposes logical/physical accounting.

**Acceptance Scenarios:**

Given one logical call fails without sufficient output
When retry policy sees an unchanged strategy or a classified non-retryable failure
Then unchanged work is not retried and at most one materially changed retry is allowed

### User Story 7: See evidence-based progress status (Priority: P1)

As an operator, I want progress and no-progress telemetry separated from quality claims, so that elapsed time, token volume, or a `Large workflow` label alone never fabricates runaway status.

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)
**Feature:** @feature7

**Why:** Size is not progress, and progress is not proof of quality.

**Independent Test:** DWE001_07 classifies journal evidence as FACT, INFERENCE, UNKNOWN, and ACTION with separate logical and physical counts.

**Acceptance Scenarios:**

Given a journal includes progress, failures, outputs, attempts, and barrier state
When status is classified
Then evidence categories and calls-versus-attempts are explicit and metric-only runaway inference is absent

### User Story 8: Preserve useful partial results and honest completeness (Priority: P1)

As a reviewer, I want completed independent output preserved when a sibling fails, so that barriers do not hide useful evidence and completion uses all mandatory branches.

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)
**Feature:** @feature8

**Why:** A failed branch must not discard completed evidence, while one completed branch must not produce false COMPLETE status.

**Independent Test:** DWE001_08 conserves successful output and rejects COMPLETE when a mandatory scope is blocked or missing.

**Acceptance Scenarios:**

Given one mandatory branch completed and another is blocked or exhausted
When partial synthesis runs
Then completed output remains inspectable and completeness remains non-COMPLETE

### User Story 9: Verify findings without rediscovery (Priority: P1)

As a code owner, I want every finding challenged with minimal cited evidence, so that structured output and agent agreement do not become truth by repetition.

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)
**Feature:** @feature9

**Why:** A bounded refuter can test premise and reproduction without repeating complete discovery.

**Independent Test:** DWE001_09 checks premise, reachability, gates, reproduction, severity, and one allowed verdict.

**Acceptance Scenarios:**

Given a finding supplies a location, allowed input, wrong output, and minimal reproduction
When a bounded verifier evaluates it
Then the verifier attempts refutation without a full rediscovery crawl

### User Story 10: Stop, replay, and resume from a redacted journal (Priority: P1)

As an operator, I want stop, replay, resume, and quality judgments to begin with journal evidence, so that completed calls are reused and missing producer proof is reported honestly.

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)
**Feature:** @feature10

**Why:** Logical calls, physical attempts, fingerprints, outputs, failures, and producer references are the execution record.

**Independent Test:** DWE001_10 replays offline, reuses unchanged calls, reruns only incomplete/changed work, and returns REPLAY_UNAVAILABLE when evidence is incomplete.

**Acceptance Scenarios:**

Given a redacted journal has completed calls and one incomplete call
When offline replay and materially changed resume run
Then completed unchanged work is reused and missing producer proof prevents a completion claim

### User Story 11: Audit without leaking and fail closed only when proven (Priority: P1)

As a security operator, I want protected decisions redacted and conditional fail-closed, so that an outage cannot silently allow a proven protected route and unrelated hooks do not change behavior.

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)
**Feature:** @feature11

**Why:** Redaction protects private input; conditionality prevents a fake security boundary.

**Independent Test:** DWE001_11 checks one redacted event and protected-route denial on an installed proven boundary while preserving unrelated behavior.

**Acceptance Scenarios:**

Given a proven protected route cannot initialize or authorize
When a native Agent call is attempted
Then it is denied, one redacted event is emitted, and unrelated routes retain their documented behavior

### User Story 12: Publish the real guarantee tier (Priority: P1)

As a maintainer, I want a real-host capability matrix before any hook or guarantee claim, so that ENFORCED is never inferred from mocks, prose, or source-tree presence.

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)
**Feature:** @feature12

**Why:** Host origin, clean installation, foreign CWD, and dependency absence determine what can be promised.

**Independent Test:** DWE001_12 publishes exactly one tier and control-mode matrix from real probes.

**Acceptance Scenarios:**

Given clean-install, foreign-CWD, dependency-absent, and real-host probes have completed
When the guarantee is published
Then the tier and control modes match evidence and an unproven boundary does not install a fake gate

### User Story 13: Regress the real incident and adapters (Priority: P1)

As a project owner, I want the real incident provenance and spec-generator adapter contracts preserved as regressions, so that bounded collection, explicit phase failure, and replay evidence cannot drift.

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)
**Feature:** @feature13

**Why:** The manifest-backed incident shows six spec attempts, 695 calls, 5,459,786 response bytes, a completed GitHub branch, and zero spec structured outputs; the corrected path is bounded.

**Independent Test:** DWE001_13 replays the real exporter/provenance inputs, enforces the <=3-call/<=512 KiB corrected path, and returns REPLAY_UNAVAILABLE without producer evidence.

**Acceptance Scenarios:**

Given the real incident manifest references producer journal and transcripts
When the evaluator replays the incident and corrected path
Then exact incident evidence is preserved, corrected collection is bounded, serial non-zero failure is explicit, and absent producer proof is not completion

## Cross-cutting invariants attached to the existing 13 stories

This section adds no story ID. The existing stories inherit the following shared acceptance obligations through their linked FR/AC/scenario/task rows:

- admission binds expected root, exact worktree mode, base SHA, owner task, dirty paths, process group, shared-resource lease, run ID, and proof phase before work;
- root mismatch, broken binding, missing ownership, or nested fan-out without census blocks mutation before the first action;
- stop owns the complete process tree and proves owner/descendant/writer zero before terminal state;
- transactional mutation, all mandatory proof layers, typed result collections, and explicit unproven/partial state prevent false completion;
- probes use the canonical API path, typed invariants, and independent readback;
- per-run journal/monitor evidence, bounded recovery capsule, and active-run correlation outrank stale pulses, warnings, global green, or old context;
- resource reuse is ownership- and mount/source-validated and never deletes foreign resources;
- the supplied second incident remains provenance-only and does not close an implementation task.
