# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)

WHEN an actual native Agent/subagent invocation has no verified Workflow provenance THEN the protected boundary SHALL deny it before spawn, emit reason `DWE_DIRECT_AGENT_DENIED`, and point to Dynamic Workflow plus `dynamic-workflow-engineering`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)

IF a child invocation presents a valid runtime-issued run/attempt identity bound to an unexpired exact consumer contract and remains within subtype, call, concurrency, envelope, and schema limits THEN the policy SHALL admit it; OTHERWISE it SHALL deny it without trusting caller-provided prose or identifiers.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)

WHEN dev-pomogator is installed canonically THEN Claude Code SHALL discover the bundled skill from the existing plugin skill directory and denied direct delegation SHALL return its invocation guidance without a nested plugin.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)

WHEN a workflow omits a finite population or discovery bound, work-package ownership, evidence/output contract, barrier justification, or stop condition THEN admission SHALL refuse the plan before any child starts.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)

WHEN a finite collector can retrieve and filter the population deterministically THEN the plan SHALL use that collector before LLM classification and SHALL enforce configured attempts, calls, rounds, findings, and input-size limits; unsupported time/token preemption SHALL be reported as best-effort.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)

WHEN the same normalized structured-output or no-progress failure recurs without a material prompt, scope, or contract change THEN the circuit breaker SHALL stop automatic retries at the configured ceiling and SHALL require explicit changed resume.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)

WHEN workflow status is rendered THEN it SHALL expose logical calls separately from physical attempts, branch and barrier state, resource counters, repeated signatures, and FACT/INFERENCE/UNKNOWN/ACTION classification; size, time, or tokens alone SHALL NOT produce a runaway verdict.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)

WHEN an independent branch succeeds and a sibling exhausts bounded retries THEN the completed output SHALL remain inspectable and synthesis SHALL identify the missing scope and partial status without silently claiming complete coverage.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)

WHEN a finding enters verification THEN the verifier SHALL try to refute it with cited and reproducible evidence inside a bounded context and SHALL return exactly one of `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED` without rerunning full discovery.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)

WHEN an operator requests stop, resume, or a quality verdict THEN the system SHALL inspect journal call/attempt/output/failure/coverage evidence first, preserve completed unchanged outputs, and rerun only incomplete or materially changed calls.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)

WHEN a protected policy decision or policy-path failure occurs THEN exactly one sanitized event SHALL record version, consumer, run/attempt, reason, counters, input hash, and schema result, and an unhandled protected-path failure SHALL deny rather than fail open.

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)

WHEN clean-home marketplace and real-host capability tests complete THEN the feature SHALL publish `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE` from evidence and SHALL NOT label steering or an unavailable trusted origin as a complete direct-Agent ban.

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)

WHEN the two incident fixtures are replayed THEN deterministic tests SHALL demonstrate bounded collection, unchanged-retry circuit breaking, partial-output conservation, missing-input synthesis, logical/physical accounting, journal-first classification, and preservation of reproduced findings.
