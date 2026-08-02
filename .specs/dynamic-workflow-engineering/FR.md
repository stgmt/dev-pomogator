# Functional Requirements (FR)

## FR-1: Workflow-only delegation gate

The specification SHALL treat native Claude Code Agent or subagent invocation and Workflow-native `agent()` delivery as separate subjects. Workflow text, labels, frontmatter, subtype, session identifiers, caller-supplied environment markers, and claimed Workflow provenance SHALL never authorize a native Agent invocation. If and only if a real pre-spawn boundary is proved and installed, the protected native-Agent route SHALL deny every native Agent invocation before spawn with a stable reason code and guidance to Dynamic Workflow, including a native Agent call attempted from inside a Workflow worker. Workflow-native `agent()` delivery SHALL be admitted only through its separate bounded packet contract and SHALL remain independently usable when native-Agent enforcement is unavailable. If the host cannot prove the protected boundary, the release SHALL publish `STEERING_ONLY` or `UNAVAILABLE` and SHALL not install or describe a fake hard gate.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-reject-direct-native-agent-delegation)

## FR-2: Origin-safe Workflow child policy

A Workflow child SHALL be admitted only from a trusted runtime-issued run and attempt identity bound to one current consumer contract and one finite packet. Admission SHALL validate the consumer, plugin-root-resolved skill binding, operation kind, allowed subtype, owner, version, expiry, finite scope, call and concurrency ceilings, envelope size, output schema, and redaction policy. Missing, forged, stale, ambiguous, duplicate, widened, or exceeded contracts SHALL be denied. Prompt prose, labels, frontmatter, `subagent_type`, session identifiers, and caller-controlled environment values SHALL not substitute for runtime provenance.

The packet/run SHALL additionally declare `expectedRoot`, the exact existing worktree or an explicitly requested isolated worktree, `baseSha`, `ownerTaskId`, and a dirty-path allowlist. Before the first work action, the mechanical preflight SHALL normalize `expectedRoot` and compare it with the actual `git rev-parse --show-toplevel`; a mismatch SHALL terminate/block the branch before any Read, Write, Bash, child spawn, or mutation. An absolute path in prompt prose SHALL never authorize a mismatch, and continuation of an existing agent/worktree SHALL not silently create a new worktree. The runtime SHALL atomically bind Agent/Workflow branch, repository root/worktree, OS process group, shared-resource lease, `runId`, and proof phase; any broken binding SHALL block mutation and completion.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-admit-a-registered-bounded-workflow-child)

## FR-3: Bundled skill and deterministic steering

The canonical dev-pomogator marketplace plugin SHALL bundle `.claude/skills/dynamic-workflow-engineering/SKILL.md` and resolve every executable `scriptPath` from the installed plugin root, preferably through `CLAUDE_PLUGIN_ROOT`. The design SHALL not assume that `.claude/workflows/` is automatically distributed by the plugin manifest. Repository dogfood and clean installation SHALL use the same policy inventory and guidance, without a nested marketplace plugin or a user-home-only copy.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-ship-and-steer-through-the-bundled-skill)

## FR-4: Bounded workflow admission

Before any child starts, admission SHALL require a finite target population or an explicit finite discovery bound, distinct work packages, dependency edges, read/write ownership, barrier justification, evidence standard, output schema, stop condition, and an explicit result state for blocked or dropped scopes. It SHALL reject malformed, oversized, silently widened, or recursively rediscovered plans. Runtime packet budgets SHALL include logical calls, physical attempts, concurrency, rounds, tool calls, input and output bytes, and response tokens when available.

Admission SHALL use one CAS-based per-run state machine with universal runtime states: `CREATED → ROOT_VERIFIED → EXCLUSIVE_OWNERSHIP → PREFLIGHT_GREEN → PLAN_FROZEN → RUNNING → VERIFYING → COMMITTING → DONE`, plus terminal `PARTIAL`, `FAILED`, `BLOCKED`, `CANCELLED`, `PAUSED_RESUMABLE`, `TERMINATED_NO_RESUME`, and `HARNESS_REPAIR` outcomes. Domain-specific proof layers SHALL be declared as an ordered packet `requiredGates` list and SHALL not be hard-coded as generic L1–L6 states. Every mutation transition SHALL compare `stateVersion` and use a monotonically increasing `fencingToken`; owner identity SHALL include a runtime-issued owner instance ID and process start identity so PID reuse cannot authorize. A separate checkout-writer lock SHALL protect source mutations, and a separate external/shared-runtime lease SHALL protect Docker/dev-stack or other shared resources. Locks SHALL be acquired only in the canonical order checkout-writer then external-runtime, with declared timeout, renewal, expiry, release, stale-owner inspection, and takeover rules. A writer presenting an old fencing token SHALL be denied. `RUNNING` and mutation SHALL be impossible until root verification, exclusive ownership, green preflight, and a frozen baseline/plan are recorded. Nested fan-out SHALL require a central ownership census; a child cannot silently acquire a second writer or mutate outside its dirty-path allowlist.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-2](USE_CASES.md#uc-2-admit-a-registered-bounded-workflow-child)

## FR-5: Deterministic-first resource budgets

Finite collection, filtering, pagination, and inventory verification SHALL run through deterministic repository or API operations before model-backed loops. Every packet SHALL declare ceilings for logical calls, physical attempts, concurrency, discovery rounds, tool calls, findings, input bytes, output bytes, response tokens, and wall-clock time. Each ceiling SHALL carry one measured control mode: `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`. Only controls proven by the real-host capability matrix MAY be described as enforced; post-event observation SHALL not be called enforcement. A packet requiring an unavailable hard guarantee SHALL be rejected or explicitly downgraded before launch. The spec-generator integration SHALL use a bounded inventory adapter and a serial phase-runner adapter rather than an N-by-M crawl.

External processes SHALL be launched through one typed captured-process runner with an argv-array API, separate UTF-8 stdout/stderr/evidence files, native exit code, atomic JSON, and failure diagnostics collected on non-zero exit. Free-form script text SHALL be a last-resort fallback, not the normal API. Probes and fixtures SHALL execute one canonical real API path, use typed summaries whose invariant is `count == items.length`, and independently read back external-producer results; harness defect, capability gap, and product failure SHALL be distinct result classes.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-6: Structured-output retry circuit breaker

One logical work-package call SHALL be counted separately from its physical attempts. Automatic retry SHALL be at most one and SHALL be admitted only after a materially changed or narrowed prompt, scope, contract, or strategy is recorded. Unchanged failures, context exhaustion, `invalid_request`, schema failures, and budget exhaustion SHALL circuit-break the automatic loop; a single classified recoverable failure MAY use the one changed-strategy retry, after which the circuit remains open. The system SHALL expose the retry reason and prior logical/physical/resource counts and SHALL require an explicit materially changed resume after the circuit opens.

Each agent/branch SHALL own an OS process group (Windows Job Object or Unix process group conceptually). Stop SHALL be terminal only after the owner and all descendants/writers are zero, including PowerShell jobs, heartbeat/sync wrappers, WSL commands, nested CLIs, and child Claude processes. Terminal evidence SHALL include `ownerStopped`, `descendantsRemaining`, and `writersRemaining`. Stop state SHALL distinguish `PAUSED_RESUMABLE` from `TERMINATED_NO_RESUME`; contamination or context overflow SHALL use the latter and require a new worker with a bounded recovery capsule. After two repeated infrastructure failures, the circuit SHALL transition to `HARNESS_REPAIR` and block domain apply until the harness is repaired or explicitly dispositioned.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-7: Progress and no-progress monitoring

The journal-backed monitor SHALL report phase, scope, logical calls, physical attempts, completed, failed, blocked, and dropped branches, elapsed time, tokens when available, tool calls, response bytes, last progress, repeated failure signatures, circuit state, and barrier dependencies. It SHALL classify observations as `FACT`, `INFERENCE`, `UNKNOWN`, and `ACTION`. Workflow size, elapsed time, token volume, or a `Large workflow` label alone SHALL never imply stalled or runaway execution.

Every run SHALL have an isolated directory containing `state.json`, `progress.jsonl`, `commands/`, `artifacts/`, and `terminal.json`. Events SHALL carry `runId`, monotonic `seq`, `ownerTaskId`/PID, worktree, phase, and status. A monitor SHALL filter the selected `runId` and monotonic sequence, inherit the owner, and terminate with the owner. Watchdog/stop identifiers SHALL distinguish agent, background process, and monitor; killed/failed terminal state SHALL be inspected before cleanup. Status SHALL correlate task notifications, per-run journal, detached descendants, diagnostics, dirty worktree, leases, proof-layer completeness, and terminal marker, and SHALL expose productive time, recovery time, restarts, stale writers, false blockers, and context overflows when available.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)

## FR-8: Partial-result preservation and barrier policy

Completed branch outputs SHALL be durable, inspectable, exportable, and conserved when an independent sibling fails, is blocked, or is dropped. A barrier SHALL be admitted only when downstream correctness requires every named branch. Overall completeness SHALL be `COMPLETE` only when all mandatory branches complete with required evidence; otherwise synthesis SHALL preserve useful verified output and explicitly expose missing scopes, blocked or dropped reasons, and partial status.

Mutation SHALL be transactional: capture baseline hashes, mutate staged copies or quarantine, and replace/commit source only after the required gates. A failed mandatory gate SHALL rollback staged work or mark it quarantined/unproven; an applied-but-unproven entry SHALL never count as completed on plan refresh. Run state SHALL retain typed collections `originalCandidates`, `staged`, `proven`, `rejected`, `deferred`, and `unprovenApplied`. The evidence pyramid SHALL require every mandatory proof layer, not any green representative check; generic global BDD/log green SHALL not green an active incomplete run.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-9: Adversarial verification without rediscovery

Every finding SHALL begin as a hypothesis. A bounded verifier SHALL receive only the finding, cited location, allowed input, relevant gates, expected and wrong output, and minimal reproduction evidence. It SHALL attempt to refute premise, reachability, validators, reproduction, and severity without rerunning complete discovery or rediscovering the corpus. It SHALL return exactly one of `CONFIRMED`, `PLAUSIBLE`, `REFUTED`, or `BLOCKED`, with evidence and an explicit dropped or unverified scope where applicable.

A fixture/probe SHALL drive one canonical real API path and SHALL classify a harness defect separately from a capability gap and a product failure. A claim about an external producer SHALL require independent real readback and provenance; a synthetic side-channel or ad-hoc alternate request SHALL not prove the product path. The verifier SHALL preserve the source scope and shall not turn a useful partial finding into full coverage.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-10: Journal-first stop, resume, and accounting

Every allow, deny, retry, circuit-break, stop, resume, replay, and synthesis decision SHALL be represented in a redacted append-only journal with logical-call and physical-attempt identity, scope, branch, resource counters, input and strategy fingerprints, output references, failure classification, and coverage state. Offline replay SHALL operate from the journal and exporter without contacting the producer. Compatible resume SHALL reuse unchanged completed calls and rerun only incomplete or materially changed work. If producer evidence is incomplete, missing, expired, or incompatible, replay SHALL return `REPLAY_UNAVAILABLE` rather than infer completion.

The per-run state and journal SHALL use the run identity contract, monotonic sequence, owner task/PID, worktree, phase, and terminal marker; a shared `AGENT_PROGRESS.jsonl` or stale pulse from another run SHALL never prove current progress. Recovery SHALL use a concise 1–3 KiB capsule containing root, owner, base SHA, dirty paths, accepted evidence/commits, unproven work, last green gate, blocker, next action, and do-not-touch paths. Lazy references SHALL replace full transcript/skill/incident replay. A contaminated or context-exhausted run cannot be resumed with old context.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-5](USE_CASES.md#uc-5-resume-and-verify-without-rediscovery)

## FR-11: Sanitized audit and fail-closed protected path

Every protected decision SHALL append exactly one redacted audit event containing policy version, consumer, run and attempt identity, stable reason code, resource counters, input hash, strategy-change marker, and schema result, but no raw prompt, secret, token, or unredacted tool payload. Initialization, authorization, or transport failure SHALL fail closed only for the protected native-Agent route when that route is proven and installed. Unrelated hooks and routes SHALL retain their documented behavior and SHALL not be reclassified as protected by implication.

The audit/terminal record SHALL preserve native exit codes and the terminal diagnostics that explain failure; a final warning, shared-file lock, stale monitor pulse, or foreign run SHALL never replace the terminal error. Stop completion SHALL be accepted only with owner/descendant/writer evidence and the fundamental identity binding intact. Audit records SHALL identify the selected run and owner without leaking secrets.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-6](USE_CASES.md#uc-6-audit-and-declare-the-real-guarantee-tier)

## FR-12: Distribution parity and guarantee tiers

A real-host capability matrix SHALL be collected before publishing any enforcement claim. A conditional protected Agent hook MAY ship only when a real native-Agent pre-spawn boundary, unconditional deny-before-spawn behavior for direct and Workflow-nested native Agent calls, and independent allowance of valid Workflow-native `agent()` delivery are proved on the target host; otherwise the release SHALL publish a lower tier and SHALL not install or describe a fake gate. The system SHALL publish exactly one guarantee tier: `ENFORCED`, `STEERING_ONLY`, or `UNAVAILABLE`, and separately classify every promised control as `hard admission`, `hard cancellation`, `monitored circuit`, `best-effort`, or `unavailable`. Clean marketplace install, foreign-CWD startup, `CLAUDE_PLUGIN_ROOT` resolution, dependency-absent execution, retry interception, tool-call ceilings, partial-output access, cancellation, and context/budget observability SHALL be part of the evidence matrix.

External/shared resources SHALL derive identity from run/worktree where possible; fixed names SHALL be treated as unsafe. Resource labels SHALL record repository, worktree, SHA, run owner, and lease. Reuse SHALL require ownership plus actual mount/source validation. Foreign-owned containers, files, processes, or leases SHALL never be deleted; reuse/startup failure SHALL preserve full diagnostics. The binding from branch to resource lease SHALL be atomic with run identity and proof phase.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-6](USE_CASES.md#uc-6-audit-and-declare-the-real-guarantee-tier)

## FR-13: Dogfood regression contract

The regression contract SHALL use the real provenance artifact `audit-reports/wf-0315d03b-28f-mcp-incident.json` and its producer journal and transcript references. The incident evidence records six spec attempts, 695 spec-MCP calls, 5,459,786 response bytes, a completed GitHub branch, and zero spec structured outputs. The corrected path SHALL use deterministic bounded collection and stay within three spec-MCP calls and 512 KiB aggregate response bytes for the declared verification. Replay SHALL require the real producer journal/transcripts and incident exporter; missing evidence is `REPLAY_UNAVAILABLE`, and no replay completion is claimed by this specification.

The canonical spec-generator adapter SHALL provide bounded inventory retrieval and a serial phase-runner adapter. A non-zero child exit SHALL be an explicit phase failure, while unchanged retries SHALL remain bounded and SHALL never reorder the authoritative serial phases. Deterministic Agent consumer census and migration SHALL begin only after a working runtime and pilot exist; `architecture-decision-builder` SHALL be included as a known prior omission. Clean-install, foreign-CWD, and dependency-absent proof, redacted offline replay, partial-result conservation, all-mandatory-branch completeness, and the separate native-Agent versus Workflow-native subjects SHALL be exercised by the BDD contract.

The second dogfood incident supplied with this authoring update is explicitly `[USER-SUPPLIED][UNVERIFIED_FOR_THIS_REPOSITORY]`. It describes wrong-worktree admission, detached descendant writers after stop, missing single-writer checkout ownership, fixed-name foreign resource collisions, terminal diagnostics being hidden by warnings/locks, partial apply before all proof layers, false RED from a scratch probe, object-versus-array count errors, mixed-run journals, stale monitor/watchdog lifecycle, unsafe resume/context overflow, pulse noise, nested fan-out, and observability that reported global green while the active run was incomplete. These failure classes are normative regression targets, not implementation evidence.

The same input names adjacent-project commits, model identifiers, container names, and self-test counts as context only; they SHALL not be treated as dev-pomogator implementation or test evidence. Authoritative replay of this second incident SHALL remain `REPLAY_UNAVAILABLE` until original run-state, per-run journals, process-group scans, terminal diagnostics, lease/mount evidence, and independent producer readback are provided. No task in this specification is thereby complete.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stop-unchanged-retries-and-expose-no-progress)
