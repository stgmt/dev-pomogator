# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Requirement:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)

WHEN a supported Claude Code project installs or refreshes dev-pomogator THEN the integration SHALL create or refresh project-local managed CARL artifacts containing `managedBy=dev-pomogator`, schema/plugin version, source hashes, platform state, and language coverage.

WHEN installation is repeated THEN the managed result SHALL be idempotent and SHALL not change user-owned configuration outside the managed boundary.

WHEN Claude Code installation runs THEN Russian rule/skill adaptation SHALL complete before prompt hooks consume the project-local manifest, and sources without safe aliases SHALL be marked as needing aliases rather than omitted.

WHEN a Russian prompt is evaluated without current Russian domains or aliases THEN the result SHALL be degraded with `project-language-missing`, `project-language-stale`, or `language-unsupported`, not healthy empty recall.

## AC-2 (FR-2)

**Requirement:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

IF no runnable CARL runtime consumer, required dependency, or usable project-local state exists THEN installer, doctor, status, and review SHALL report a degraded condition and SHALL NOT claim `healthy`, `active`, `installed`, or `ready`.

WHEN a check observes only files on disk THEN it SHALL identify the missing runtime proof and SHALL not produce a green verdict.

## AC-3 (FR-3)

**Requirement:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

WHEN the distributed hook is registered THEN the real hook-service dispatcher SHALL invoke `tools/carl/runner.ts` through the registered command path.

WHEN the runtime-consumer BDD scenario runs THEN it SHALL execute the dispatcher-to-runner command path and record runtime proof only after the runner consumes the event; dispatcher/runner files alone and a manifest entry written without execution SHALL remain non-proof.

IF fixture output has no producer provenance THEN it SHALL remain explicitly `[UNVERIFIED]` and SHALL be excluded from final done evidence.

## AC-4 (FR-4)

**Requirement:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

WHEN the runner encounters missing dependency, timeout, malformed output, unsupported mode, or exception THEN it SHALL return fail-open and the agent session SHALL continue.

WHEN fail-open is returned THEN `hookSpecificOutput.additionalContext` SHALL include a concise warning that CARL did not run and instruct the agent to tell the user CARL guidance/recall was unavailable.

WHEN the runner succeeds THEN it SHALL not emit that failure warning.

## AC-5 (FR-5)

**Requirement:** [FR-5](FR.md#fr-5-doctor-health-and-repair)

WHEN `pomogator-doctor` checks CARL THEN it SHALL return one of `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable` independently for Claude Code and Codex.

IF managed artifacts are missing or stale and repair is enabled THEN doctor SHALL refresh only those artifacts and report before/after evidence.

IF external runtime dependencies or platform capabilities are unavailable THEN doctor SHALL report `broken-runtime` or `unsupported` with an actionable next step.

## AC-6 (FR-6)

**Requirement:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

WHEN shared configuration is changed THEN each managed region SHALL have explicit markers, a managed manifest entry, or a deterministic managed object key.

IF user-authored CARL content exists outside that boundary THEN repair SHALL preserve its original bytes and values byte-for-byte and value-for-value.

IF a user-authored entry conflicts with the managed key THEN the result SHALL be `user-conflict` and SHALL not overwrite the entry without an explicit decision.

## AC-7 (FR-7)

**Requirement:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

IF the Codex launcher, project-local dispatcher, or required version capability is unavailable THEN Codex CARL SHALL remain deferred or unsupported while Claude Code CARL is evaluated independently.

WHEN Codex is enabled THEN it SHALL register through its deterministic dispatcher and project-local artifact model rather than copying Claude Code hook files.

## AC-8 (FR-8)

**Requirement:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

WHEN review evidence is generated THEN the report SHALL cover install, runtime consumer, fail-open warning, doctor repair, user preservation, Codex sequencing, Russian evaluation, and benchmark evidence.

IF a claim relies on external or fixture-backed behavior THEN it SHALL include `[VERIFIED]`, `[UNVERIFIED]`, `[ASSUMED]`, or `[NEEDS_CONFIRMATION]` and an evidence source or explicit gap.

WHEN Russian evaluation runs THEN each prompt SHALL have expected and actual domains, false-positive/false-negative results, and a concrete optimization recommendation for every gap; sibling fixture output SHALL not upgrade runtime readiness.

## AC-9 (FR-9)

**Requirement:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

IF recall has no real artifact or producer output with provenance, source hashes, and ground truth THEN benchmark status SHALL remain `draft` or `blocked` and SHALL not invent a numeric threshold.

WHEN a real artifact is accepted THEN the benchmark SHALL record a baseline for supported latency, token-overhead, and recall-quality metrics and SHALL use that baseline for future regression checks.
