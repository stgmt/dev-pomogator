# User Stories

### User Story 1: Reject direct Agent delegation (Priority: P1)

As a dev-pomogator user, I want native subagent delegation denied outside Dynamic Workflow, so that no direct Agent call bypasses workflow policy.

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)
**Feature:** @feature1

**Why:** Direct calls evade bounded orchestration, review, and audit.

**Independent Test:** DWE001_01 denies an actual direct Agent invocation before spawn.

**Acceptance Scenarios:**

Given no trusted Workflow context exists
When the native Agent tool is invoked
Then the call is denied before a child starts and points to Dynamic Workflow

### User Story 2: Admit only origin-safe Workflow children (Priority: P1)

As a security maintainer, I want exact runtime provenance and consumer contracts checked, so that copied prompt text cannot forge an exception.

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)
**Feature:** @feature2

**Why:** Skill names, labels, subtype, and caller-supplied IDs are spoofable or shared.

**Independent Test:** DWE001_02 admits one valid child and rejects forged, expired, duplicate, or over-budget variants.

**Acceptance Scenarios:**

Given a runtime-issued Workflow identity matches a current exact contract
When one permitted child is requested within all bounds
Then exactly that child is admitted and invalid variants are denied

### User Story 3: Receive the bounded workflow skill everywhere (Priority: P1)

As a marketplace user, I want the workflow engineering skill bundled in dev-pomogator, so that denial guidance works after canonical installation.

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)
**Feature:** @feature3

**Why:** A user-home-only or nested plugin would not provide one team-distributed contract.

**Independent Test:** DWE001_03 installs into a clean home and discovers the skill with matching policy guidance.

**Acceptance Scenarios:**

Given dev-pomogator is installed from its marketplace source
When direct delegation is denied
Then the existing plugin exposes dynamic-workflow-engineering and no nested plugin is required

### User Story 4: Refuse unbounded plans before work starts (Priority: P1)

As a workflow operator, I want admission to require finite scope and explicit orchestration contracts, so that a broad prompt cannot become a recursive corpus audit.

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)
**Feature:** @feature4

**Why:** The first dogfood incident widened an inventory into repeated unbounded searches.

**Independent Test:** DWE001_04 rejects a plan missing bounds, ownership, evidence, barrier rationale, or stop condition.

**Acceptance Scenarios:**

Given a workflow has no finite population or auditable discovery bound
When admission validates the plan
Then no child starts and every missing contract field is reported

### User Story 5: Spend agents only after deterministic collection (Priority: P1)

As a cost owner, I want mechanical collection and enforceable resource ceilings, so that LLM work handles only the bounded remainder.

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)
**Feature:** @feature5

**Why:** Deterministic retrieval is cheaper, auditable, and terminates over a finite population.

**Independent Test:** DWE001_05 proves deterministic-first routing and attempts, calls, rounds, findings, and input-size ceilings.

**Acceptance Scenarios:**

Given a finite inventory can be retrieved and filtered mechanically
When the workflow is planned
Then deterministic collection precedes bounded LLM classification and unsupported preemption stays best-effort

### User Story 6: Stop unchanged retry storms (Priority: P1)

As a workflow operator, I want logical calls separated from physical attempts and repeated failures circuit-broken, so that retries do not replay an unchanged strategy indefinitely.

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)
**Feature:** @feature6

**Why:** Both dogfood runs repeated broad calls after stalls or missing structured output.

**Independent Test:** DWE001_06 opens the circuit at the configured ceiling and requires a materially changed resume.

**Acceptance Scenarios:**

Given one logical call repeats the same normalized failure
When its physical attempts reach the ceiling without material change
Then no further automatic attempt starts

### User Story 7: See evidence-based workflow status (Priority: P1)

As an operator, I want progress and no-progress telemetry separated from quality verdicts, so that elapsed time or token count alone never fabricates a runaway judgment.

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)
**Feature:** @feature7

**Why:** Large-workflow UI metrics show size and progress, not whether useful work is occurring.

**Independent Test:** DWE001_07 classifies a journal into FACT, INFERENCE, UNKNOWN, and ACTION with logical/physical accounting.

**Acceptance Scenarios:**

Given a large workflow has journal progress, failures, outputs, and barrier state
When status is rendered
Then evidence categories and call attempts are explicit and size alone does not imply runaway

### User Story 8: Keep useful partial results (Priority: P1)

As a reviewer, I want completed independent output preserved when a sibling fails, so that a barrier cannot hide useful evidence or synthesis gaps.

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)
**Feature:** @feature8

**Why:** Completed branches in the incidents were delayed or synthesized without an honest completeness boundary.

**Independent Test:** DWE001_08 conserves successful output and reports missing scope after sibling retry exhaustion.

**Acceptance Scenarios:**

Given one independent branch completes and another fails
When partial synthesis runs
Then completed output stays inspectable and full coverage is not claimed

### User Story 9: Verify findings without rediscovery (Priority: P1)

As a code owner, I want each finding challenged with minimal cited and reproducible evidence, so that structured output or agent votes cannot become truth by repetition.

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)
**Feature:** @feature9

**Why:** A bounded refuter catches false premises while avoiding the cost of repeating the whole search.

**Independent Test:** DWE001_09 tests premise, reachability, gates, reproduction, severity, and one allowed verdict.

**Acceptance Scenarios:**

Given a finding supplies a concrete location input and wrong output
When a bounded adversarial verifier evaluates it
Then it tries to refute the claim without rerunning discovery

### User Story 10: Stop and resume from the journal (Priority: P1)

As an operator, I want stop, resume, and quality judgments to start from real journal evidence, so that completed calls are reused and failures are described honestly.

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)
**Feature:** @feature10

**Why:** Logical calls, physical retries, outputs, failures, and coverage gaps are the actual execution record.

**Independent Test:** DWE001_10 resumes one changed incomplete call while reusing completed unchanged calls.

**Acceptance Scenarios:**

Given a run has completed calls and one incomplete call
When resume follows a material change
Then journal evidence is inspected first and only incomplete or changed work reruns

### User Story 11: Audit without leaking and fail closed (Priority: P1)

As a security operator, I want protected decisions auditable and redacted, so that an outage cannot allow Agent and logs cannot expose sensitive prompts.

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)
**Feature:** @feature11

**Why:** The generic hook client currently fails open and raw payload logging would create another security defect.

**Independent Test:** DWE001_11 denies on protected-path failure and emits exactly one sanitized decision event.

**Acceptance Scenarios:**

Given protected policy initialization authorization or transport fails
When a native Agent call is attempted
Then it is denied and the audit contains metadata and hashes but no sensitive payload

### User Story 12: Know the real guarantee after installation (Priority: P1)

As a maintainer, I want clean-install and real-host evidence mapped to a fixed guarantee tier, so that steering is never sold as complete enforcement.

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)
**Feature:** @feature12

**Why:** Mock-only tests cannot prove host matcher semantics, trusted origin, or installed asset resolution.

**Independent Test:** DWE001_12 publishes ENFORCED, STEERING_ONLY, or UNAVAILABLE from clean-home and real-host probes.

**Acceptance Scenarios:**

Given capability and install-parity probes have completed
When the guarantee is published
Then the tier matches evidence and missing trusted origin prevents an enforcement claim

### User Story 13: Prevent both dogfood regressions (Priority: P1)

As a project owner, I want both incident shapes replayed as deterministic regressions, so that useful findings survive without retry storms, false completion, or hidden coverage gaps.

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)
**Feature:** @feature13

**Why:** The supplied incidents define the concrete failure modes this feature must improve.

**Independent Test:** DWE001_13 replays finite-inventory and partial-useful-review journal fixtures.

**Acceptance Scenarios:**

Given sanitized journal-shaped fixtures represent both incidents
When the evaluator replays them
Then unchanged retries stop, useful output remains, and missing coverage stays explicit
