# Design

## Scope and evidence posture

This design supports Claude Code first. CARL project-local state is managed under `.carl/`; distributed hook code comes from the canonical plugin. Codex is a separately gated path. Repository evidence currently proves the registry-backed hook shape, runner fail-open contract, managed-install intent, and BDD scenarios. External CARL producer/runtime shape, clean dependency-absent installed-plugin execution, final event-root precedence, and numeric recall thresholds remain `[UNVERIFIED]` until captured from real artifacts.

## Components

| Component | Responsibility | Evidence boundary |
|---|---|---|
| `tools/carl/manifest.ts` | schema, ownership, platform/language states, root selection, diagnostic codes | Repository contract; runtime semantics require BDD proof |
| `tools/carl/install.ts` | install/refresh managed project artifacts and preserve user-owned config | Managed markers/keys only; conflict is refusal |
| `tools/carl/adapt-rules.ts` | scan rules/skills, source hashes, domains, safe Russian aliases, `ru:needs-alias` | Source files and generated manifest |
| `tools/carl/runner.ts` | resolve event root, load `.carl/carl.json`, run or diagnose CARL, emit hook result | Must be invoked through real registry path |
| `tools/carl/hook-wrapper.ts` | stable hook launcher/wrapper contract | Distributed command path; exact external runtime remains `[UNVERIFIED]` |
| doctor CARL check | classify, report, and repair managed state | Must distinguish files from runtime proof |
| hook-service registry | route SessionStart/UserPromptSubmit to runner | Registry, not transport manifest alone, is registration source of truth |
| benchmark/evaluator | provenance ledger, Russian prompt comparison, baseline/regression status | Real producer output required for ready/verified |

## Root selection and lifecycle

1. The hook receives `input.cwd` and records the event root used for the decision.
2. `CARL_PROJECT_DIR` may be accepted only under documented validation and precedence rules; a stale or cross-drive override must not silently redirect another project.
3. The runner resolves the project-local `.carl/carl.json` for the selected root and must not walk to an unrelated parent merely because another manifest exists.
4. SessionStart/bootstrap installs or refreshes managed artifacts and reports completion or degraded state before the lifecycle ends.
5. UserPromptSubmit loads the same project-local manifest, executes the registered runner path, and records runtime-consumer proof only after execution.
6. Doctor reads the manifest, verifies markers/source hashes/platform prerequisites, and optionally repairs only managed drift.

## Managed data model

`.carl/carl.json` contains `schemaVersion`, `managedBy`, `managedVersion`, source hashes, language status, per-platform state, runtime verification, diagnostics, and benchmark provenance. Claude state may be `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable`. Codex additionally supports `deferred` and requires launcher, dispatcher, and capability evidence. `runtimeVerified=true` is writeable only from a real hook-consumer execution, never from file existence.

Shared configuration uses explicit managed markers, managed manifest entries, or deterministic managed object keys. Installation computes before snapshots, writes only managed regions atomically, and records after snapshots. User-owned entries outside those regions are byte-equivalent; a conflicting reserved key produces `user-conflict` and no overwrite.

## Failure and fail-open contract

The runner maps missing dependency, timeout, malformed output, unsupported runtime, and exception to stable diagnostic codes. It returns `mode=fail-open`, allows the host workflow to continue, and emits `hookSpecificOutput.additionalContext` containing a concise warning that CARL did not run and the agent must tell the user CARL guidance/recall was unavailable. Logs contain details by reference; agent context contains no secrets or raw private recall data. Successful runs emit normal context without a false failure warning.

## Codex gate

Codex evaluation is independent of Claude Code. The gate checks context-menu launcher/trust, project-local dispatcher, and installed-version hook capability. Missing prerequisites produce `deferred` or `unsupported`; the path never copies Claude Code hooks and never downgrades a healthy Claude Code result.

## Provenance and readiness

Every review claim is labelled `[VERIFIED]`, `[UNVERIFIED]`, `[ASSUMED]`, or `[NEEDS_CONFIRMATION]` and points to repository, command, or external evidence. Fixture-backed sibling output is not dev-pomogator readiness. Recall benchmark status is `draft` or `blocked` until a real producer artifact has provenance, source hashes, and ground truth. A baseline records only supported metrics; no numeric threshold is invented.

## BDD and runtime proof

All acceptance evidence is Cucumber.js BDD executed in Docker. The runtime-consumer scenario must execute the distributed registry command, not import the runner directly. Failure-mode scenarios cover missing dependency, timeout, malformed output, unsupported runtime, and exception. Fixture-based tests may assert schemas and failure contracts but cannot close real-artifact or dependency-absent gaps. Shared `cucumber.json` changes must remain safe for concurrent sessions.

### Decision: project-local Claude Code state

**Требование:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)

Use a project-local `.carl/carl.json` managed by the canonical plugin, with source hashes and language metadata. The installer and adapter update only managed artifacts atomically; safe Russian aliases are recorded, while unsafe aliases become `ru:needs-alias`. SessionStart SHALL run doctor/bootstrap adaptation before UserPromptSubmit; the manifest SHALL record adaptation source hashes, aliases, and `ru:needs-alias` outcomes consumed by the prompt hook.

**Rationale:** Project-local state addresses the documented cross-drive, nested-repository, and stale `CARL_PROJECT_DIR` failures.

**Trade-off:** Root selection and source-hash refresh add lifecycle and migration complexity.

**Alternatives considered:**
- Global-only CARL state, rejected because it can redirect or claim health for another project.
- Unmanaged rule copying, rejected because it cannot preserve ownership or language provenance.

### Decision: runtime proof before readiness

**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

Keep runtime-consumer verification separate from file existence. Health and review surfaces classify missing consumer, missing dependency, stale root, and absent project state as degraded.

**Rationale:** Discovery identifies file-inventory checks and fixture-only output as fake-green risks.

**Trade-off:** Integrations remain partial until a launcher/dispatcher execution is captured.

**Alternatives considered:**
- Treat managed files as installed and healthy, rejected because it hides dead integration.
- Treat all missing evidence as a hard plugin failure, rejected because the primary agent workflow must continue.

### Decision: registry-backed end-to-end execution

**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

Route the distributed hook through the hook-service registry to the runner. The BDD runtime-consumer scenario executes that registered command path and records proof in the manifest only after the runner consumes the event; dispatcher/runner files alone or a manifest entry written without execution remain degraded and do not establish runtime proof.

**Rationale:** The registry is the runtime source of truth; transport declarations alone do not prove a consumer.

**Trade-off:** The BDD harness must isolate and exercise the shared launcher path.

**Alternatives considered:**
- Import `runner.ts` directly from a step, rejected as a dead-integration false positive.
- Assert only `.claude-plugin/hooks.json`, rejected because the registry owns effective targets.

### Decision: fail-open, agent-visible degradation

**Требование:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

Normalize missing dependency, timeout, malformed output, unsupported runtime, and exception into stable fail-open payloads. `hookSpecificOutput.additionalContext` carries the concise warning; structured logs hold details.

**Rationale:** CARL must not block the agent, but silent loss of guidance is unsafe and unreviewable.

**Trade-off:** Degraded warnings add context noise during a CARL outage.

**Alternatives considered:**
- Log-only failure, rejected because the agent would not know to disclose unavailable guidance.
- Fail-closed hook execution, rejected because unrelated agent work would be blocked.

### Decision: independent doctor states and scoped repair

**Требование:** [FR-5](FR.md#fr-5-doctor-health-and-repair)

Add a CARL doctor check with independent Claude and Codex state, before/after evidence, and actionable next action. Repair is limited to managed drift.

**Rationale:** Doctor must distinguish stale configuration from broken external runtime and user ownership conflicts.

**Trade-off:** Doctor reports more states than a binary installed/missing check.

**Alternatives considered:**
- Rewrite all CARL configuration during repair, rejected because it violates the user trust boundary.
- Report only a boolean, rejected because remediation depends on the failure class.

### Decision: explicit managed boundaries

**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

Use explicit markers, manifest entries, or deterministic keys and atomic updates. Before/after snapshots prove user-owned bytes and parsed values remain byte-for-byte and value-for-value unchanged. Conflicting user-owned reserved keys return `user-conflict` without overwrite.

**Rationale:** Existing projects may contain user-authored CARL hooks, rules, aliases, or settings.

**Trade-off:** Boundary detection and conflict handling require deterministic schemas.

**Alternatives considered:**
- Whole-file replacement, rejected because it destroys user configuration.
- Silent merge by heuristic, rejected because it makes ownership and audit evidence ambiguous.

### Decision: gated Codex dispatcher

**Требование:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

Check launcher/trust, project-local dispatcher, and version-aware capability before enabling Codex. Codex has its own artifact model and cannot alter Claude Code health.

**Rationale:** Discovery and issue evidence show the Codex path is prerequisite-dependent and must not be inferred from Claude Code support.

**Trade-off:** Codex remains deferred while Claude Code can be ready independently.

**Alternatives considered:**
- Copy Claude Code hook files into Codex, rejected because the dispatch contracts differ.
- Enable Codex optimistically, rejected because it creates a false-green platform status.

### Decision: provenance-labelled review

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

Maintain a provenance ledger separating repository verification, fixture-backed evidence, assumptions, and external gaps. The Russian evaluator compares expected and actual domains, reports false positives/negatives, and proposes alias, normalization, ranking, or context-budget optimizations.

**Rationale:** Current CARL producer and sibling fixture claims are not all owned or runtime-verified by dev-pomogator.

**Trade-off:** Reports are more verbose and may conclude `NOT_READY` despite passing structural BDD scenarios.

**Alternatives considered:**
- Aggregate all evidence as green, rejected because provenance is mixed.
- Omit Russian evaluation, rejected because language coverage is a stated requirement.

### Decision: evidence-gated benchmark

**Требование:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

Accept a baseline only from a provenance-complete real artifact or producer output. Record supported metrics and keep status `draft` or `blocked` without evidence; numeric thresholds are never invented.

**Rationale:** The current benchmark fixture is not sufficient to justify a dev-pomogator-owned CARL threshold.

**Trade-off:** Performance regression gating is deferred until a real artifact is captured.

**Alternatives considered:**
- Hard-code an arbitrary latency or recall threshold, rejected because it would manufacture evidence.
- Treat a sibling fixture as the producer baseline, rejected because ownership and ground truth are unverified.
