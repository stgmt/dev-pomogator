# Use Cases

## UC-1: Reject direct native Agent delegation

**Features:** @feature1, @feature11

The protected boundary receives a native Agent/subagent invocation without runtime-issued Workflow provenance.

- Classify by actual tool-event identity, not text.
- Deny before spawn with a stable reason code and skill guidance.
- Emit one sanitized audit event.

## UC-2: Admit a registered bounded Workflow child

**Features:** @feature2, @feature4, @feature5

A Dynamic Workflow presents an opaque run/attempt identity bound to a current consumer contract.

- Validate consumer, skill binding, subtype, call/concurrency budgets, envelope, and schema.
- Admit only the declared child operation.
- Reject duplicate, extra, expired, or forged calls.

## UC-3: Ship and steer through the bundled skill

**Features:** @feature3, @feature12

A user installs dev-pomogator from the marketplace and requests a substantive delegated task.

- Discover `dynamic-workflow-engineering` from the plugin skill directory.
- Explain that direct Agent is unavailable and Workflow is the supported path.
- Preserve equivalent behavior in repository dogfood and installed-cache execution.

## UC-4: Stop unchanged retries and expose no progress

**Features:** @feature6, @feature7, @feature13

A logical child call stalls or fails structured output with the same signature.

- Report logical call and physical attempt separately.
- Apply the configured retry ceiling and trip the circuit breaker on repeated unchanged failure.
- Preserve prior useful outputs and expose missing coverage.

## UC-5: Resume and verify without rediscovery

**Features:** @feature8, @feature9, @feature10

An operator inspects a partial run and resumes after changing scope or prompt.

- Read journal and per-agent evidence before assigning quality labels.
- Reuse completed outputs and retry only incomplete work.
- Verify findings with minimal evidence and deterministic checks, not a repeated corpus crawl.

## UC-6: Audit and declare the real guarantee tier

**Features:** @feature11, @feature12

The policy loads, fails, or runs on a host with incomplete origin support.

- Redact prompts and secrets while recording decision metadata and input hashes.
- Fail closed only for the protected native Agent boundary.
- Report `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE` from runtime evidence.

## Cross-cutting harness invariants for UC-1 through UC-6

The existing use cases share one non-negotiable identity and evidence contract. Before any mutating action, the runtime binds branch, repository root/worktree, process group, shared-resource lease, run ID, and proof phase. It checks normalized expectedRoot against the actual git top-level, requires one CAS mutating owner plus separate checkout/runtime leases, and rejects broken bindings or uncensused nested fan-out.

Stop is terminal only after owner, descendants, and writers are zero with durable terminal evidence. APPLY waits for root verification, exclusive ownership, green preflight, and frozen baseline/plan. Staged/quarantined mutation, typed result collections, per-run journals, monotonic events, owner-inherited monitors, bounded recovery capsules, canonical-path probes, independent readback, and all-layer completeness are shared constraints. Global green or a useful partial result never substitutes for missing current-run proof.

The second user-supplied incident is a provenance-only input. Without original run-state/journals/process scans/terminal diagnostics/lease and mount evidence/independent producer readback, its replay is `REPLAY_UNAVAILABLE` and no implementation task is complete.
