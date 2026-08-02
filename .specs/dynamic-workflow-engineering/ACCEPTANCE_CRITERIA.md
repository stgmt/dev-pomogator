# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)

WHEN a real protected pre-spawn boundary is proven and installed and any native Claude Code Agent/subagent invocation is attempted THEN the boundary SHALL deny it before spawn with reason `DWE_DIRECT_AGENT_DENIED` and guidance naming Dynamic Workflow and `dynamic-workflow-engineering`, including when the native call originates inside a Workflow worker; Workflow-native `agent()` delivery SHALL remain a separate subject admitted only through its bounded packet contract. No prompt, label, frontmatter, subtype, session, environment marker, or claimed Workflow provenance SHALL authorize the native route. WHEN the boundary is not proven THEN the release SHALL publish `STEERING_ONLY` or `UNAVAILABLE` without installing a fake hard gate.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)

IF a child invocation presents a valid runtime-issued run/attempt identity bound to an unexpired exact consumer contract and finite packet and remains within scope, subtype, call, concurrency, envelope, and schema limits THEN the policy SHALL admit it; OTHERWISE it SHALL deny it without trusting caller-provided prose, labels, frontmatter, session identifiers, or environment values. The packet/run SHALL declare expectedRoot, exact existing or explicitly isolated worktree, baseSha, ownerTaskId, and dirty-path allowlist. Before the first work action, normalized expectedRoot SHALL equal normalized `git rev-parse --show-toplevel`; mismatch SHALL terminate/block before Read/Write/Bash/spawn/mutation, and existing-worktree continuation SHALL not silently create a new worktree. Completion SHALL require an intact atomic Agent→root/worktree→process-group→lease→runId→proof-phase binding.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)

WHEN dev-pomogator is installed canonically THEN Claude Code SHALL discover the bundled skill from the existing plugin skill directory, executable `scriptPath` values SHALL resolve from `CLAUDE_PLUGIN_ROOT` or an equivalent installed root, and denied direct delegation SHALL return guidance without assuming `.claude/workflows/` is distributed or requiring a nested plugin.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)

WHEN a packet omits a finite population or discovery bound, distinct ownership/dependencies, barrier justification, evidence/output contract, stop condition, or blocked/dropped state THEN admission SHALL refuse the plan before any child starts and report the missing bounds deterministically. One CAS-based per-run state machine SHALL use universal runtime states and an ordered packet-specific `requiredGates` list, exactly one mutating owner instance, `stateVersion`, and a monotonically increasing `fencingToken`; PID reuse or an old fencing token SHALL never authorize a write. Separate checkout-writer and external/shared-runtime leases SHALL be acquired only in canonical order and SHALL define timeout, renewal, expiry, release, stale-owner inspection, and takeover behavior. `RUNNING` and mutation SHALL be blocked until `ROOT_VERIFIED`, `EXCLUSIVE_OWNERSHIP`, green preflight, and frozen baseline/plan; nested fan-out SHALL require a central ownership census.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)

WHEN a finite collector can retrieve and filter the population deterministically THEN the packet SHALL run that collector first, pass its persisted evidence to any model loop, and classify every logical-call, physical-attempt, concurrency, round, tool-call, finding, byte, token, and wall-clock ceiling as `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable` from real-host evidence. A control SHALL be called enforced only when the measured boundary prevents or cancels the excess; post-event monitoring is not enforcement, and a packet requiring an unavailable hard guarantee SHALL be rejected or explicitly downgraded before launch. The bounded spec-generator inventory and serial phase-runner adapters SHALL be used. External commands SHALL use a typed argv-array captured runner with separate UTF-8 stdout/stderr/evidence, native exit code, atomic JSON, and diagnostics; one canonical API path and typed `count == items.length` summaries SHALL distinguish harness defect, capability gap, and product failure, with independent producer readback required.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)

WHEN the same unchanged failure recurs, or a failure is context exhaustion, `invalid_request`, schema-invalid, or budget-exhausted, THEN the automatic loop SHALL circuit-break; at most one retry SHALL be allowed only after a materially changed or narrowed strategy is journaled, with logical calls distinguished from physical attempts, and further work SHALL require changed explicit resume. Stop SHALL own an OS process group and SHALL not be terminal until owner, descendants, and writers are zero, with `ownerStopped`, `descendantsRemaining`, and `writersRemaining` evidence. Stop state SHALL be `PAUSED_RESUMABLE` or `TERMINATED_NO_RESUME`; contamination/context overflow requires a new worker with a recovery capsule. Two repeated infrastructure failures SHALL enter `HARNESS_REPAIR` and block domain apply.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)

WHEN journal-backed workflow status is rendered THEN it SHALL expose logical calls separately from physical attempts, branch and barrier state, resource counters, repeated signatures, circuit state, and `FACT`/`INFERENCE`/`UNKNOWN`/`ACTION` classification; size, time, tokens, or `Large workflow` alone SHALL NOT produce a stalled or runaway verdict. Per-run state/progress/commands/artifacts/terminal records SHALL be filtered by runId and monotonic seq; monitors inherit and end with owners; watchdog IDs distinguish agent/background/monitor; status correlates notifications, descendants, diagnostics, dirty paths, leases, proof layers, terminal marker, and available productive/recovery/restart/stale-writer/false-blocker/context-overflow metrics. Old pulses and stale monitors never prove current progress.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)

WHEN an independent branch succeeds and a sibling fails, is blocked, or is dropped THEN the completed output SHALL remain inspectable, exportable, and conserved; synthesis SHALL identify missing scope and partial status, and SHALL report `COMPLETE` only when every mandatory branch has completed with required evidence. Mutations SHALL capture baseline hashes and use staged/quarantined copies until all required gates pass; failed mandatory gates rollback or mark unproven, typed original/staged/proven/rejected/deferred/unprovenApplied collections remain explicit, and generic global BDD/log green cannot green an incomplete active run or make unproven applied entries DONE.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)

WHEN a finding enters verification THEN the bounded verifier SHALL try to refute its premise, reachability, gates, reproduction, and severity from cited evidence and SHALL return exactly one of `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED` without rerunning complete discovery. Probes/fixtures SHALL call one canonical real API path; harness defect, capability gap, and product failure SHALL remain distinct; external-producer claims require independent readback/provenance, and a useful partial finding SHALL not imply full scope coverage.

## AC-10 (FR-10)

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)

WHEN an operator requests stop, resume, replay, or a quality verdict THEN the system SHALL inspect the redacted per-run journal and producer evidence first, preserve completed unchanged outputs, rerun only incomplete or materially changed work, and return `REPLAY_UNAVAILABLE` when required producer journal/transcript evidence or compatibility is missing. Events require runId, monotonic seq, owner task/PID, worktree, phase, status, and terminal marker; stale shared pulses are ignored; a 1–3 KiB recovery capsule replaces full transcript replay, and `TERMINATED_NO_RESUME` cannot receive an old-context SendMessage continuation.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)

WHEN a protected policy decision or policy-path failure occurs THEN exactly one redacted event SHALL record version, consumer, run/attempt, reason, counters, input hash, strategy-change marker, and schema result without raw sensitive payload; native exit code and terminal diagnostics SHALL remain authoritative over warnings, lock errors, stale pulses, or foreign runs. Only a proven and installed protected native-Agent route SHALL fail closed, while unrelated routes retain documented behavior; stop completion requires owner/descendant/writer evidence and intact identity binding.

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)

WHEN the real-host capability matrix, clean marketplace install, foreign-CWD, `CLAUDE_PLUGIN_ROOT`, and dependency-absent probes complete THEN the feature SHALL publish exactly one `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE` tier and SHALL classify each promised control as `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`. The matrix SHALL prove or reject native-Agent deny-before-spawn for direct and Workflow-nested calls, independent valid Workflow-native `agent()` allowance, retry interception, tool-call ceilings, partial-output access, cancellation, and context/budget observability; a missing boundary SHALL prevent an enforcement claim and SHALL not install a fake gate. External/shared resources SHALL use run/worktree-derived identity where possible, labels for repository/worktree/SHA/owner/lease, actual mount/source validation on reuse, and foreign-resource preservation with full diagnostics on failure.

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)

WHEN the real incident exporter replays `audit-reports/wf-0315d03b-28f-mcp-incident.json` with its producer journal/transcript provenance THEN the evidence SHALL preserve six spec attempts, 695 spec-MCP calls, 5,459,786 response bytes, the completed GitHub branch, and zero spec structured outputs; corrected bounded verification SHALL be at most three spec-MCP calls and 512 KiB aggregate response bytes, non-zero serial child exit SHALL be an explicit phase failure, unchanged retries SHALL remain bounded, and missing producer evidence SHALL yield `REPLAY_UNAVAILABLE` rather than completion. The second user-supplied incident SHALL remain `[UNVERIFIED_FOR_THIS_REPOSITORY]`: adjacent commits/tests/models/container names are context only, authoritative replay awaits original run-state/journals/process scans/terminal diagnostics/lease and mount evidence/independent producer readback, and no implementation claim or task completion follows from the report.
