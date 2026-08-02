# Design

## Реализуемые требования

- [FR-1](FR.md#fr-1-workflow-only-delegation-gate) through [FR-13](FR.md#fr-13-dogfood-regression-contract)

## Scope and ownership boundary

This specification is the sole canonical owner of Dynamic Workflow packet, admission, runtime delivery, monitoring, verification, replay, host-capability, and consumer-migration requirements. `spec-generator-v4` retains FR-82 as the bounded SpecGraph MCP prerequisite and may reference this specification, but it SHALL not duplicate Dynamic Workflow FR, AC, task, scenario, story, use-case, design, NFR, or implementation FILE_CHANGES rows. The two subjects are related by a dependency, not by shared ownership.

Native Claude Code Agent/subagent and Workflow-native `agent()` are separate permission subjects. Workflow text, labels, frontmatter, subtype, session, environment, claimed Workflow provenance, or other prose never authorizes native Agent. A proven protected boundary denies every native Agent call, including one attempted inside a Workflow worker; valid Workflow-native `agent()` delivery is admitted only by its own bounded packet contract. Bounded Workflow runtime delivery is independent of native-Agent enforcement. A protected Agent hook is conditional on a real pre-spawn proof; no fake gate is installed when that proof is unavailable.

## Components

- `dynamic-workflow-engineering` skill — bundled normative authoring and evaluation discipline.
- `workflow-contracts` registry — machine-readable, versioned contracts for finite consumers and packet schemas.
- `packet-admission` — validates finite populations, scope ownership, dependencies, barriers, budgets, and stop states before child start.
- `deterministic-collectors` — bounded inventory, filtering, pagination, incident import, and evidence export before model loops.
- `workflow-runtime` — Workflow-native `agent()` packet delivery with logical-call and physical-attempt accounting.
- `agent-policy` — conditional protected native-Agent pre-spawn policy, provenance checks, retry circuit, audit redaction, and capability tier classifier.
- `workflow-monitor` — journal consumer for progress, no-progress, barriers, partial outputs, and completeness.
- `bounded-verifier` — adversarial finding verifier that receives bounded evidence and never rediscovers the corpus.
- `journal-replay-exporter` — redacted append-only journal, offline replay/export, compatible resume, and `REPLAY_UNAVAILABLE` diagnostics.
- `spec-generator inventory adapter` — one bounded task/phase/search query path using FR-82 MCP contracts.
- `serial phase-runner adapter` — authoritative serial phase order, explicit non-zero child failure, and bounded unchanged retries without reordering.
- `consumer-census` — deterministic census of native Agent consumers and migration map, executed only after runtime and pilot evidence exist; includes `architecture-decision-builder` as a known prior omission.

## Where the proposed implementation would live

- Skill: `.claude/skills/dynamic-workflow-engineering/SKILL.md`
- Workflow packet/runtime and adapters: `tools/dynamic-workflow-engineering/` (exact paths remain implementation work)
- Hook authoring and generated wiring: existing plugin hook manifest/registry surfaces after the real-host capability matrix.
- BDD: `tests/features/core/dynamic-workflow-engineering.feature` and corresponding step definitions after implementation task ownership is approved.
- Incident evidence: `audit-reports/wf-0315d03b-28f-mcp-incident.json` plus producer journal/transcript references; replay fixtures are invalid as proof without producer provenance.

## Algorithm and contracts

1. Build a finite workflow packet from bounded scopes, deterministic collector plans, dependencies, ownership, barrier reasons, evidence schema, and stop condition.
2. Run deterministic inventory and filtering collectors first. Persist source, scope, digest, cardinality, ordering, and producer evidence before any model loop.
3. Admit Workflow-native `agent()` children only through runtime-issued packet/run/attempt identity and exact consumer contract. Native Agent remains a separate subject.
4. Count one logical call per work package and every physical provider/tool attempt separately. A retry is permitted at most once and only after a materially changed or narrowed strategy is journaled.
5. Circuit-break unchanged/context-exhausted/`invalid_request`/schema-invalid/budget-exhausted failures. Preserve partial output and scope state before deciding whether explicit changed resume is possible.
6. Persist each branch result before synthesis. Use a barrier only when every named input is required. Set `COMPLETE` only if all mandatory branches have completed with required evidence.
7. Verify findings with cited bounded context and a deterministic minimal reproduction; do not rediscover the population. Return `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED`.
8. Journal redacted decisions and resource counters. Offline replay uses the exporter and journal without contacting the producer; compatible resume reuses unchanged completed calls. Incomplete producer evidence returns `REPLAY_UNAVAILABLE`.
9. Publish real-host capability results before selecting a conditional protected hook or guarantee tier. Control modes are `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, and `unavailable`.
10. After working runtime and pilot evidence, run deterministic native-Agent consumer census and migration; do not treat a text search or an unproven hook as completion.

## Packet and consumer contract

A packet contains finite `scope_ids`, `population_digest`, `work_packages`, dependency and ownership declarations, barrier rationale, evidence standard, stop condition, `consumer_id`, plugin-root-resolved `skill_path`, operation, allowed `subagent_types`, logical-call/concurrency/attempt/round/tool-call/input/output-byte/response-token ceilings, output schema, owner, version, expiry, redaction policy, and `run_id`/`attempt_id` issued by the runtime. It also carries universal runtime state, ordered consumer-defined `requiredGates`, `stateVersion`, `fencingToken`, owner instance and process-start identity, canonical lock order, and lease timing. Missing or caller-forged provenance is not authorization.

Suggested numeric ceilings are planning inputs only until proven by runtime evidence. Every ceiling receives one measured mode: `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`. Post-event observation is never described as enforcement. A packet that requires a hard mode unavailable on the current host is rejected or explicitly downgraded before launch. Unchanged retries, context exhaustion, `invalid_request`, schema-invalid, and budget failures open the circuit where the runtime can observe them.

## Guarantee and control model

The capability matrix is measured first on the real host. Publish exactly one guarantee tier:

- `ENFORCED`: a trusted pre-spawn native-Agent boundary unconditionally denies direct and Workflow-nested native Agent calls, protected errors fail closed, and valid Workflow-native `agent()` delivery is independently proven and installed.
- `STEERING_ONLY`: bundled skill/advisory routing is available, but trusted origin or deny-before-spawn is unproven.
- `UNAVAILABLE`: safe routing/capability probing cannot operate.

The tier does not imply that every control mode is hard. Each control is classified independently as `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`. Protected route failure is fail-closed only when the protected route is proven and installed; unrelated routes preserve documented behavior.

## Key Decisions

### Decision: Separate native Agent enforcement from Workflow-native agent delivery

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)

**Rationale:** Native Agent/subagent and Workflow-native `agent()` are distinct runtime subjects. A native Agent call never becomes legitimate because it claims Workflow origin, while a valid Workflow-native child is admitted by its separate packet contract. A real pre-spawn proof is required before any unconditional native-Agent denial claim.

**Trade-off:** A host without the proven boundary can publish only steering or unavailable status, and native-Agent enforcement cannot be promised from the specification alone.

**Alternatives considered:**
- Trust workflow labels or frontmatter — rejected because they are caller-controlled prose.
- Treat every child as the same Agent subject — rejected because it conflates Workflow-native delivery and native-Agent enforcement.

### Decision: Admit exact runtime-issued finite contracts

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)

**Rationale:** Runtime-issued identities, finite scopes, and exact consumer contracts prevent copied prompts, labels, subtypes, sessions, or environment values from forging authorization.

**Trade-off:** Every legitimate consumer needs versioned ownership, expiry, and migration metadata.

**Alternatives considered:**
- Allow by skill name — rejected because the name is caller-controlled and does not prove origin.
- Allow by subtype or session identifier — rejected because these values are shared or forgeable.

### Decision: Bundle the skill and resolve scripts from plugin root

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)

**Rationale:** One canonical plugin bundle gives repository dogfood and clean installs the same skill and policy inventory while `CLAUDE_PLUGIN_ROOT` avoids foreign-CWD path drift.

**Trade-off:** The skill/runtime release shares plugin packaging and must prove dependency-absent operation.

**Alternatives considered:**
- Assume `.claude/workflows/` is automatically distributed — rejected because the manifest does not establish that assumption.
- Add a nested marketplace plugin — rejected because it duplicates discovery and versioning.

### Decision: Require finite packet admission before any child

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)

**Rationale:** Finite population, ownership, dependencies, barrier justification, evidence, output, and stop states prevent recursive widening and make completeness auditable.

**Trade-off:** Unknown-size work must declare a discovery cap and expose dropped remainder instead of silently pursuing it.

**Alternatives considered:**
- Trust broad natural-language intent — rejected because terms such as all do not define a population.
- Admit first and monitor later — rejected because unbounded work has already incurred cost and side effects.

### Decision: Deterministic collectors precede model loops

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)

**Rationale:** Deterministic inventory and serial phase adapters are finite, reproducible, and independently cardinality-checkable; model loops should consume evidence rather than rediscover it.

**Trade-off:** Adapter contracts and persisted evidence require explicit integration work, and hard time/token cancellation may remain unavailable.

**Alternatives considered:**
- Ask a high-effort agent to inventory the repository — rejected because it duplicates deterministic collection.
- Crawl one task/phase at a time — rejected because it creates N-by-M calls and silent cardinality loss.

### Decision: One changed-strategy retry, then circuit-break

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)

**Rationale:** Logical-call accounting stays honest while one narrowly justified strategy change can recover a classified failure without allowing unchanged retry storms.

**Trade-off:** Operators must explicitly resume after the circuit opens, and some provider failures remain incomplete.

**Alternatives considered:**
- Retry until StructuredOutput succeeds — rejected because context exhaustion and `invalid_request` do not improve through repetition.
- Count every attempt as a new logical call — rejected because it hides the cost and work-package failure.

### Decision: Classify progress from journal evidence

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)

**Rationale:** Branch state, calls, attempts, outputs, failures, signatures, barriers, and resource counters distinguish useful progress from no-progress without relying on UI size labels.

**Trade-off:** The runtime needs durable structured events and a monitor/exporter rather than a single aggregate status line.

**Alternatives considered:**
- Declare runaway from elapsed time — rejected because long work can be useful.
- Declare runaway from token volume — rejected because cost does not prove stall or quality.

### Decision: Preserve partial results and require all mandatory branches for completeness

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)

**Rationale:** Independent completed output remains useful even when a sibling fails, while `COMPLETE` must use an AND over mandatory branches to avoid false-green synthesis.

**Trade-off:** Consumers must handle explicit blocked/dropped scopes and partial statuses.

**Alternatives considered:**
- Put a barrier after every fan-out — rejected because it hides independent progress.
- Mark complete when any branch succeeds — rejected because OR aggregation is false completion.

### Decision: Verify bounded findings adversarially without rediscovery

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)

**Rationale:** A refuter with cited evidence can challenge reachability and reproduction while avoiding a duplicate corpus crawl and shared-model majority bias.

**Trade-off:** Findings can remain `PLAUSIBLE` or `BLOCKED` when deterministic proof is unavailable.

**Alternatives considered:**
- Accept structured output as truth — rejected because shape does not prove premise or wrong output.
- Repeat the complete discovery for every finding — rejected because it duplicates cost and widens scope.

### Decision: Journal first, then offline replay and compatible resume

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)

**Rationale:** A redacted journal and exporter preserve the producer evidence needed for stop, replay, accounting, and compatible resume without contacting a live producer.

**Trade-off:** Replay refuses incomplete or incompatible evidence and requires stable fingerprints and exporter maintenance.

**Alternatives considered:**
- Judge from UI totals — rejected because totals omit provenance and scope state.
- Replay by recontacting the producer — rejected because it is not offline and can rediscover or mutate the source.

### Decision: Redact audit and fail closed only on the proven protected route

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)

**Rationale:** Redaction protects sensitive input while conditional fail-closed behavior avoids a false security promise on hosts where the pre-spawn boundary is not proven.

**Trade-off:** Protected-route capability must be established before the stricter failure mode is enabled; unrelated hooks retain their existing semantics.

**Alternatives considered:**
- Fail open on every hook failure — rejected because it defeats a proven protected boundary.
- Fail closed on every unrelated hook — rejected because it changes documented behavior outside the protected route.

### Decision: Publish measured guarantee tiers and control modes

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)

**Rationale:** Real-host capability, clean install, foreign CWD, plugin-root resolution, and dependency-absent probes distinguish enforcement from steering and unavailable operation.

**Trade-off:** The first release may honestly publish `STEERING_ONLY` or `UNAVAILABLE`, and individual controls may remain best-effort.

**Alternatives considered:**
- Claim ENFORCED from mocks or source-tree presence — rejected because neither proves host behavior.
- Install a hook before proving its pre-spawn subject — rejected because that would be a fake gate.

### Decision: Use real incident provenance and serial adapter regressions

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)

**Rationale:** The six-attempt incident metrics and producer references provide a concrete regression boundary, while bounded inventory and serial phase adapters protect the spec-generator integration from N-by-M crawling and silent child failures.

**Trade-off:** Replay cannot claim completion until the real journal/transcripts and exporter are present; implementation tasks remain TODO.

**Alternatives considered:**
- Hand-invent a producer-shaped incident fixture — rejected because it can create fake-positive replay.
- Treat non-zero child exit as a warning or reorder phases for convenience — rejected because it hides phase failure and violates authoritative serial order.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE [PLANNED: fixtures and step definitions are implementation tasks; no executable evidence is claimed]
**TEST_FORMAT:** BDD [PLANNED: source scenarios use real tags and unique DWE001 IDs]
**Framework:** Cucumber.js (planned integration path)
**Install Command:** none claimed
**Evidence:** No production or test changes are authorized by this consolidation. Required BDD paths, real incident provenance fixtures, capability fixtures, and dependency-absent launch fixtures remain TODO in TASKS.md.
**Verdict:** The source contract is ready for implementation planning only; structural form is not product health and no implementation/executable evidence is claimed.

### Existing hooks

| Hook file | Type | Tag/Scope | What it does | Reuse status |
|-----------|------|-----------|-----------|--------------|
| Existing repository hook and plugin surfaces | registry/manifest | implementation lane | Candidate integration points only | Verify during host-capability PoC |

### New hooks

| Hook file | Type | Tag/Scope | What it does | Analogue |
|-----------|------|-----------|-----------|----------|
| Conditional protected Agent hook and generated files | host-capability lane | only if real pre-spawn boundary is proven | fail-closed protected route; otherwise no fake gate | Existing plugin hook registry |

### Cleanup Strategy

Future scenario-local fixtures SHALL use unique temporary homes and remove only task-owned runtime state/processes. No cleanup or test change is part of this specification-only transaction.

### Test Data & Fixtures

| Fixture/Data | Path | Purpose | Lifecycle |
|---|---|---|---|
| Real incident/provenance manifest | `audit-reports/wf-0315d03b-28f-mcp-incident.json` | Six attempts, 695 calls, 5,459,786 bytes, completed GitHub branch, zero spec structured outputs, producer references | implementation fixture; REPLAY_UNAVAILABLE until references are present |
| Packet/contract matrix | `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | finite scopes, forged/stale/oversized/budget cases | per-feature static TODO |
| Journal/transcript replay set | `tests/fixtures/dynamic-workflow-engineering/journals/` | redacted offline replay and compatible resume | static TODO; must mirror producer |
| Capability matrix fixtures | `tests/fixtures/dynamic-workflow-engineering/capability-matrix/` | real-host outcomes and conditional hook tiers | static TODO |
| Clean plugin home | generated temporary directory | clean install, foreign CWD, plugin-root and dependency-absent proof | per-scenario TODO |

## Second dogfood design decisions (authoring-only)

The following decisions generalize the second user-supplied postmortem. They are normative design constraints and planned evidence targets, not implementation or repository proof. Adjacent-project commits, model names, container names, and reported self-test counts remain context only.

### Decision: Bind root, worktree, process group, lease, run, and proof phase before work

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)

**Rationale:** A prompt path cannot override the checkout in which git, relative artifacts, and commits actually execute. The packet must carry expected root, exact existing or explicitly isolated worktree, base SHA, owner task, and dirty-path allowlist; normalized expected root must equal the actual git top-level before the first action. The binding must include the OS process group, shared-resource lease, run ID, and proof phase.

**Trade-off:** Existing-agent continuation needs an explicit existing-worktree contract, while a requested isolated worktree remains a distinct admission choice. A mismatch stops before evidence collection, even when prose appears plausible.

**Alternatives considered:**
- Trust an absolute path in a prompt — rejected because process cwd, git, relative artifacts, and commits remain bound to the actual root.
- Silently create a new worktree for a continuation — rejected because it changes ownership and invalidates evidence.

### Decision: Make admission a CAS single-writer state machine with separate locks

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)

**Rationale:** One run needs one mutating owner instance, CAS `stateVersion`, a monotonically increasing `fencingToken`, and process-start identity so PID reuse cannot restore stale authority. Universal runtime states carry an ordered consumer-defined `requiredGates` list instead of hard-coded domain phases. A checkout-writer lock protects source changes and a separate external/shared-runtime lease protects Docker or other shared resources; both use canonical acquisition order, timeout, renewal, expiry, release, stale-owner inspection, and fenced takeover. `RUNNING` is gated by root verification, exclusive ownership, green preflight, and a frozen baseline/plan.

**Trade-off:** Nested fan-out needs a central ownership census and cannot opportunistically take a second writer. A stale owner can be inspected and fenced out, but recovery requires explicit lease evidence and a newer token. Lock contention remains a diagnosable blocked state rather than permission to mutate.

**Alternatives considered:**
- Protect only the dev stack — rejected because the checkout and phase state can still be concurrently mutated.
- Allow nested workers to self-assign ownership — rejected because no single owner can prove the run state.

### Decision: Use one typed captured-process and one canonical probe path

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)

**Rationale:** argv arrays, separate UTF-8 stdout/stderr/evidence, native exit codes, atomic JSON, and failure diagnostics prevent malformed argument lists, redirect locks, path errors, and warning text from masking the terminal error. A probe must execute the canonical real API path and validate typed collection invariants.

**Trade-off:** Script text remains an escape hatch for genuinely unsupported commands, but it is not the normal interface. Harness defect, capability gap, and product failure may remain distinct outcomes.

**Alternatives considered:**
- Compose free-form PowerShell command strings — rejected because argument and redirect defects become indistinguishable from product failures.
- Trust a scratch or alternate API probe — rejected because it can produce a false RED or false GREEN for the real path.

### Decision: Own and terminate the complete process tree

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)

**Rationale:** The owner, descendants, and writers must share an OS process group (Windows Job Object or Unix process group conceptually). Stop is terminal only with ownerStopped=true, zero descendants, and zero writers, including PowerShell jobs, wrappers, WSL, nested CLIs, and child Claude processes.

**Trade-off:** A paused run can be resumable only when contamination and context integrity are known. Contamination or context overflow is TERMINATED_NO_RESUME and requires a new worker with a 1–3 KiB recovery capsule. Two repeated infrastructure failures enter HARNESS_REPAIR and block domain apply.

**Alternatives considered:**
- Kill only the visible owner PID — rejected because detached writers can continue mutating the checkout.
- Resume a contaminated child through old context — rejected because stale assumptions reintroduce the same failure.

### Decision: Treat per-run observability as the source of current progress

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)

**Rationale:** Each run gets isolated state, progress, commands, artifacts, and terminal records. Events carry run ID, monotonic sequence, owner task/PID, worktree, phase, and status; monitors and watchdogs inherit ownership and filter only the selected run.

**Trade-off:** The monitor must correlate notifications, descendants, diagnostics, dirty paths, leases, proof layers, and terminal markers instead of relying on a global pulse file. User updates are phase start, new confirmed blocker, and terminal result, not every heartbeat.

**Alternatives considered:**
- Treat a shared AGENT_PROGRESS file as current truth — rejected because stale and foreign run pulses can look healthy.
- Treat global BDD/log green as active-run green — rejected because it omits run-specific writers and proof gaps.

### Decision: Apply mutations transactionally and require the full evidence pyramid

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)

**Rationale:** Baseline hashes, staged copies, quarantine, rollback, and typed original/staged/proven/rejected/deferred/unprovenApplied collections prevent partial writes from being mistaken for completion. All mandatory proof layers are required; one representative green check is insufficient.

**Trade-off:** Useful partial results remain available while applied-but-unproven entries stay explicitly unproven. Plan refresh must not close them, and failed mandatory gates may leave quarantine diagnostics.

**Alternatives considered:**
- Replace source files before L1/build/critical gates — rejected because later failures create ambiguous partial apply.
- Mark a batch complete when any proof layer is green — rejected because completeness is an AND over mandatory layers.

### Decision: Verify canonical-path claims independently without widening scope

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)

**Rationale:** A typed probe must distinguish harness defect, capability gap, and product failure, and external-producer claims require independent real readback and provenance. Verification consumes bounded evidence and preserves missing-scope status.

**Trade-off:** A useful confirmed result may coexist with an uncovered or blocked branch; the verdict remains partial rather than being promoted by narrative synthesis.

**Alternatives considered:**
- Accept a probe's object summary or alternate request as product truth — rejected because the harness may be the defect.
- Re-run full discovery to explain one finding — rejected because it widens cost and scope.

### Decision: Journal stop, resume, and recovery from durable run evidence

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)

**Rationale:** Per-run journals with monotonic sequence, terminal markers, and owner identity allow offline replay and compatible resume without old transcript replay. A recovery capsule carries root, owner, base SHA, dirty paths, accepted evidence/commits, unproven work, last green gate, blocker, next action, and do-not-touch paths.

**Trade-off:** Missing or incompatible producer evidence yields REPLAY_UNAVAILABLE. A terminated contaminated run cannot receive an old-context continuation, and lazy references replace replaying the full skill or incident history.

**Alternatives considered:**
- Reuse stale pulses or old context as proof — rejected because neither binds to the current run.
- Recontact the producer during offline replay — rejected because it is not replay and may mutate or rediscover state.

### Decision: Preserve terminal diagnostics and redacted ownership evidence

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)

**Rationale:** Native exit code and complete diagnostics must outrank a final warning, shared-file lock, stale monitor, or foreign run. Exactly one redacted audit event records the decision without raw prompt, secret, token, or payload.

**Trade-off:** Failure reports are more verbose in structured evidence but safer and more actionable than a warning-only summary. Stop completion remains blocked when the identity binding is broken.

**Alternatives considered:**
- Keep only the last warning — rejected because it hides the terminal failure.
- Delete foreign resources to simplify recovery — rejected because ownership is unproven and data may belong to another run.

### Decision: Derive shared resources from run/worktree and validate actual mounts

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)

**Rationale:** Fixed container names and shared stacks can point at a different checkout. Run/worktree-derived identity, repository/worktree/SHA/owner/lease labels, and mount/source validation make reuse ownership-aware.

**Trade-off:** Foreign resources remain untouched and can cause a blocked start with full diagnostics. A healthy resource is reusable only after both ownership and actual source validation pass.

**Alternatives considered:**
- Delete any conflicting fixed-name container — rejected because it may be foreign-owned.
- Trust a project label without checking its mount/source — rejected because labels can outlive or misdescribe the mounted checkout.

### Decision: Keep the second incident as an unverified regression contract

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)

**Rationale:** The supplied postmortem is valuable for failure-class coverage but is not a local producer artifact. It can define planned fixtures and BDD cases while authoritative replay remains unavailable until original run-state, journals, process scans, terminal diagnostics, lease/mount evidence, and independent readback are supplied.

**Trade-off:** The specification becomes more complete without pretending that adjacent-project commits, model names, or self-test counts prove this repository. All tasks remain TODO.

**Alternatives considered:**
- Invent a journal or replay fixture from the prose — rejected because it would be a fake-positive external artifact.
- Treat reported adjacent tests as dev-pomogator implementation evidence — rejected because ownership and repository identity are not established.
