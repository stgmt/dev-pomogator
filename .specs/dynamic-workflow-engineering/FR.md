# Functional Requirements (FR)

## FR-1: Workflow-only delegation gate

The plugin SHALL deny every native Agent/subagent tool invocation that lacks verified Dynamic Workflow provenance before a child starts. The denial SHALL use a stable reason code and direct the main agent to Dynamic Workflow plus the bundled skill. Prompt text, labels, frontmatter, `subagent_type`, `session_id`, and caller-supplied environment markers SHALL NOT grant access.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-reject-direct-native-agent-delegation)

## FR-2: Origin-safe Workflow child policy

The plugin SHALL admit a child only when a trusted pre-spawn boundary supplies runtime-issued Workflow run and attempt identity bound to one current consumer contract. The policy SHALL validate the exact consumer and skill binding, operation kind, allowed subtype, call and concurrency ceilings, envelope size, output schema, owner, version, and expiry. Missing, forged, stale, ambiguous, duplicate, or exceeded contracts SHALL be denied by default.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-admit-a-registered-bounded-workflow-child)

## FR-3: Bundled skill and deterministic steering

The canonical dev-pomogator plugin SHALL ship `.claude/skills/dynamic-workflow-engineering/SKILL.md` inside the existing plugin root, discover it through the existing skills directory, and steer a denied direct Agent request to Workflow and that skill. The implementation SHALL NOT create a nested marketplace plugin. Repository dogfood and installed plugin SHALL use the same policy inventory and guidance.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ship-and-steer-through-the-bundled-skill)

## FR-4: Bounded workflow admission

Before spawning any child, the workflow layer SHALL require a finite target population or explicit discovery bound, distinct work packages, dependencies, read/write ownership, barrier justification, evidence standard, output schema, and stop condition. It SHALL enforce per-run maximum logical calls and concurrency and SHALL reject malformed, oversized, or silently widened plans.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-2](USE_CASES.md#uc-2-admit-a-registered-bounded-workflow-child)

## FR-5: Deterministic-first resource budgets

The workflow layer SHALL route finite collection and filtering through deterministic repository/API operations before LLM classification. Every child contract SHALL declare maximum physical attempts, tool calls, discovery rounds, output findings, and context/input size. Wall-clock or token preemption SHALL be marked best-effort until a runtime PoC proves an enforceable cancellation surface; unsupported hard limits SHALL NOT be advertised as guarantees.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-6: Structured-output retry circuit breaker

The system SHALL record one logical call independently from its physical attempts. Automatic retry SHALL use a small configured ceiling, surface the retry reason and prior resource counts, and stop when the same normalized failure signature repeats without a changed prompt, scope, or contract. Further work SHALL require an explicit resume with a material change.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-7: Progress and no-progress monitoring

Monitoring SHALL report phase, logical calls, physical attempts, completed/failed/blocked branches, elapsed time, tokens, tool calls, last progress, repeated failure signatures, and barrier dependencies. It SHALL classify output as FACT, INFERENCE, UNKNOWN, and ACTION. `Large workflow`, duration, or token volume alone SHALL NOT imply stalled or runaway status.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-8: Partial-result preservation and barrier policy

Completed outputs SHALL become inspectable and exportable even when an independent sibling fails. A `parallel()` barrier SHALL be used only when downstream correctness requires all branches. Synthesis over incomplete required inputs SHALL preserve useful verified findings, mark missing scopes, and SHALL NOT claim full coverage or completion.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-9: Adversarial verification without rediscovery

Every agent finding SHALL start as a hypothesis. Verification SHALL attempt to refute it using the cited location, allowed input, reachability, surrounding gates, concrete wrong output, and the minimal deterministic reproduction. Verifiers SHALL receive bounded finding context and SHALL NOT repeat the complete discovery crawl. Final verdicts SHALL be `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-10: Journal-first stop, resume, and accounting

Before stopping, resuming, or judging a workflow, the operator path SHALL inspect journal events, logical calls, physical retries, completed outputs, failures, coverage gaps, and reproduction evidence. Resume SHALL reuse completed unchanged calls and rerun only incomplete or materially changed work. The system SHALL distinguish useful, complete, partial, stalled, and runaway assessments.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-11: Sanitized audit and fail-closed protected path

Every allow, deny, retry, circuit-break, stop, and resume decision SHALL append one auditable event containing policy version, consumer, run/attempt, reason code, resource counters, input hash, and schema result without raw prompt, secret, token, or unredacted tool payload. Initialization, authorization, or transport failure SHALL fail closed for the protected native Agent boundary while unrelated hooks retain their documented behavior.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-6](USE_CASES.md#uc-6-audit-and-declare-the-real-guarantee-tier)

## FR-12: Distribution parity and guarantee tiers

The feature SHALL validate canonical marketplace installation in a clean home with plugin assets resolved through `CLAUDE_PLUGIN_ROOT` and repository `node_modules` unavailable. Runtime capability probing and real-host tests SHALL publish exactly one tier: `ENFORCED` when trusted pre-spawn provenance and fail-closed denial are proven, `STEERING_ONLY` when only instructions or advisory hooks are available, or `UNAVAILABLE` when safe routing cannot operate. No lower tier SHALL be described as a complete ban.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-6](USE_CASES.md#uc-6-audit-and-declare-the-real-guarantee-tier)

## FR-13: Dogfood regression contract

Repository tests SHALL encode both supplied incident classes: bounded finite inventory instead of recursive corpus audit; circuit breaking for unchanged broad retries; independent partial-output release; logical-call versus physical-attempt accounting; synthesis with missing input; journal-first classification; and preservation of independently reproduced findings from a partial but useful run.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)
