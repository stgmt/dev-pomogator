# Functional Requirements

## FR-1: Claude Code managed CARL install

**BDD AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**BDD scenarios:** CARL001_01, CARL001_11, CARL001_13, CARL001_14, CARL001_15
**Use cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-4](USE_CASES.md#uc-4-название)

The plugin SHALL install or refresh a project-local CARL integration for the Claude Code project selected by the hook event. Managed artifacts SHALL identify `managedBy=dev-pomogator`, schema version, plugin version, source hashes, platform state, and language coverage. Installation SHALL use the plugin root (`CLAUDE_PLUGIN_ROOT`) for distributed code and SHALL keep project-local recall data under `.carl/`. Russian-language coverage SHALL be reported as healthy only when its source domains and aliases are current; missing or stale coverage SHALL be reported as `project-language-missing`, `project-language-stale`, or `language-unsupported`. Repeated installation SHALL be idempotent, and user-owned configuration outside the managed boundary SHALL remain unchanged. Adaptation SHALL complete before prompt-hook consumption, and the FR-1 contract SHALL be exercised by CARL001_01, CARL001_11, CARL001_13, CARL001_14, and CARL001_15.

## FR-2: No fake green when CARL is absent

**BDD AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use cases:** [UC-2](USE_CASES.md#uc-2-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

Installer, doctor, status, and review surfaces SHALL distinguish files-on-disk evidence from a runnable CARL runtime consumer. If the runtime consumer, required dependency, or project-local state is absent, stale, or unusable, the integration SHALL return a degraded state and SHALL NOT claim `healthy`, `active`, `installed`, or `ready`. Diagnostics SHALL identify the missing condition and SHALL preserve the rest of the plugin workflow.

## FR-3: Runtime consumer and end-to-end proof

**BDD AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-3](USE_CASES.md#uc-3-название), [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

The canonical distributed hook configuration SHALL route the registered SessionStart/UserPromptSubmit path to the CARL runner through the real hook-service dispatcher, which SHALL invoke `tools/carl/runner.ts` through the registered command path. A runtime-consumer BDD scenario SHALL execute that dispatcher-to-runner path and record runtime proof in the project manifest only after the runner has consumed the hook event. The presence of dispatcher/runner files alone, or a manifest entry written without execution, SHALL not count as end-to-end proof; files-only and manifest-only states SHALL remain degraded. Dependency-absent plugin execution SHALL be exercised or explicitly remain unverified.

## FR-4: Fail-open warning injection

**BDD AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use cases:** [UC-3](USE_CASES.md#uc-3-название)

When the CARL runner encounters a missing dependency, timeout, malformed output, unsupported mode, or exception, it SHALL allow the host agent workflow to continue. The hook result SHALL use a stable diagnostic code and `hookSpecificOutput.additionalContext` SHALL contain a concise, agent-visible warning that CARL did not run and that the agent must tell the user CARL guidance/recall was unavailable. Successful execution SHALL not emit a failure warning.

## FR-5: Doctor health and repair

**BDD AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use cases:** [UC-2](USE_CASES.md#uc-2-название), [UC-4](USE_CASES.md#uc-4-название)

`pomogator-doctor` SHALL classify CARL independently for Claude Code and Codex as `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable`. When repair is enabled, doctor SHALL refresh only managed CARL artifacts, report before/after evidence, and be idempotent. Missing external runtime dependencies or unsupported capabilities SHALL produce an actionable diagnostic instead of rewriting configuration.

## FR-6: Managed markers preserve user configuration

**BDD AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use cases:** [UC-1](USE_CASES.md#uc-1-название), [UC-2](USE_CASES.md#uc-2-название), [UC-4](USE_CASES.md#uc-4-название)

Every managed CARL insertion into a shared file SHALL be bounded by explicit managed markers, a managed manifest entry, or a deterministic managed object key. Repair SHALL preserve user-authored hooks, rules, aliases, settings, and their original bytes and values outside that boundary byte-for-byte and value-for-value. A conflicting user-owned entry SHALL result in `user-conflict` and SHALL not be overwritten without an explicit conflict decision.

## FR-7: Codex path gated by launcher and dispatcher prerequisites

**BDD AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use cases:** [UC-4](USE_CASES.md#uc-4-название), [UC-5](USE_CASES.md#uc-5-название)

Codex CARL support SHALL remain deferred or unsupported until the context-menu launcher, project-local Codex dispatcher, and required version-aware hook capability are independently verified. The Codex path SHALL use its own deterministic dispatcher and artifact model rather than copying Claude Code hook files. A missing prerequisite SHALL not change the Claude Code CARL result.

## FR-8: Review, audit, and reporting

**BDD AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use cases:** [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

The review report SHALL cover installation, runtime consumption, fail-open warning injection, doctor repair, user preservation, Codex sequencing, Russian evaluation, and benchmark evidence. Claims SHALL be labelled `[VERIFIED]`, `[UNVERIFIED]`, `[ASSUMED]`, or `[NEEDS_CONFIRMATION]` with a source or explicit gap. Russian evaluation SHALL record expected versus actual domains, false positives, false negatives, and an optimization recommendation for each gap. Fixture-backed sibling output SHALL not be presented as dev-pomogator runtime readiness.

## FR-9: Recall benchmark threshold and regression gate

**BDD AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use cases:** [UC-6](USE_CASES.md#uc-6-later-review-checks-install-repair-warning-and-sequencing)

If CARL recall is enabled, the benchmark SHALL run against a real CARL recall artifact or producer output with provenance, source hashes, and producer ground truth. The first accepted real artifact SHALL establish a baseline only for metrics supported by that evidence, including latency, token overhead, and recall quality where available. Until such evidence or an approved external requirement exists, threshold status SHALL remain `draft` or `blocked` and SHALL not invent a numeric pass/fail threshold.
