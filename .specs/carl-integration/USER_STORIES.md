# User Stories

> Phase 1 Discovery stories for CARL integration. Each story uses the v3 form required by `user-story-form-guard`: priority in the heading, **Why:**, **Independent Test:**, and inline Given/When/Then acceptance scenarios.

### User Story 1: Default CARL install for Claude Code users (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)
**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

As a dev-pomogator user, I want CARL rules and recall hooks to be installed automatically for Claude Code when my environment supports them, so that the agent benefits from CARL guidance without a separate manual setup step.

**Why:** The integration is valuable only if normal plugin users receive a working CARL path by default rather than discovering a separate hidden installer later.

**Independent Test:** `@feature1` fresh-install smoke: install dev-pomogator in a clean supported Claude Code project and verify the managed CARL hook/rules artifacts are present and callable without user-authored config changes.

**Acceptance Scenarios:**

Given a supported Claude Code environment with dev-pomogator installed and no existing managed CARL artifacts
When the CARL integration installer runs as part of the supported setup flow
Then the managed CARL hook/rules artifacts are created idempotently and marked as managed by dev-pomogator

Given an unsupported Claude Code environment
When the CARL integration installer evaluates support
Then it does not break plugin activation and records an actionable unsupported-environment warning for doctor/reporting

---

### User Story 2: Doctor repair for missing or broken CARL integration (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5-doctor-health-and-repair)
**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

As a dev-pomogator user, I want `pomogator-doctor` to detect missing, stale, or broken CARL integration and repair it when invoked, so that CARL drift can be fixed without hand-editing hook files.

**Why:** Existing dev-pomogator maintenance flows already use doctor-style checks for managed structure, hooks, versions, and gitignore drift; CARL should be recoverable through the same user-facing repair path.

**Independent Test:** `@feature5` doctor repair smoke: deliberately remove or corrupt one managed CARL artifact, run pomogator-doctor repair, and verify the artifact is restored while user-owned config is preserved.

**Acceptance Scenarios:**

Given a project with dev-pomogator installed and a missing managed CARL hook
When `pomogator-doctor` runs its CARL check with repair enabled
Then it reports the missing artifact and reinstalls the managed hook without overwriting unrelated user configuration

Given a project with a stale managed CARL version marker
When `pomogator-doctor` runs its CARL check
Then it reports version drift and repairs the managed artifact to the plugin version expected by the installed dev-pomogator package

---

### User Story 3: Agent-visible warning when a CARL hook cannot run (Priority: P1)

**Требование:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

As a user relying on CARL-backed recall and rules, I want a broken CARL hook to inject a clear warning into the chat or agent context, so that the AI agent is reminded to tell me CARL guidance was unavailable.

**Why:** Silent hook failure is worse than a visible degraded mode because the user and the agent may otherwise trust decisions that were made without expected recall/rule context.

**Independent Test:** `@feature4` hook failure smoke: force the CARL hook runner to fail in a controlled way and verify the next agent-visible context includes a warning instructing the agent to notify the user.

**Acceptance Scenarios:**

Given the managed CARL hook is configured but its runtime dependency is unavailable
When the hook executes during an agent session
Then the hook fails open, injects a warning into agent-visible context, and explicitly tells the agent to inform the user that CARL did not run

Given the managed CARL hook succeeds
When the hook executes during an agent session
Then no false failure warning is injected and normal CARL context is supplied where supported

---

### User Story 4: Codex integration after the Codex context-menu launcher path (Priority: P2)

**Требование:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

As a user who launches Codex through dev-pomogator, I want CARL integration to work on the Codex plugin path after the context-menu launcher work lands, so that Claude Code and Codex receive equivalent managed recall/rule support where their hook systems allow it.

**Why:** The user explicitly sequenced Codex plugin work after the context-menu launcher, and existing specs already establish Codex as a first-class platform with version-aware hook dispatch rather than a Claude-only afterthought.

**Independent Test:** `@feature7` Codex path smoke: after the Codex launcher/hook dispatcher is available, install the CARL integration for Codex and verify the Codex hook dispatcher invokes the managed CARL hook or reports a capability-based unsupported warning.

**Acceptance Scenarios:**

Given the Codex context-menu launcher and Codex hook dispatcher are available
When CARL integration is installed for the Codex plugin path
Then the Codex managed artifacts are registered through the deterministic dispatcher rather than by ad-hoc overwrites

Given the Codex version does not support the required hook capability
When CARL integration evaluates the Codex path
Then it marks the Codex CARL path as unsupported for that version and leaves Claude Code CARL behavior unaffected

---

### User Story 5: Reviewable analysis, report, and rollout plan (Priority: P2)

As a maintainer, I want the CARL integration spec to include an analysis/report/plan and later review path, so that the feature is not shipped as a hidden hook drop-in without evidence, sequencing, or failure-mode review.

**Why:** CARL touches plugin distribution, hooks, doctor repair, and two agent platforms, so the plan must make evidence, assumptions, and unresolved external details visible before implementation.

**Independent Test:** `@feature8` spec review smoke: run the spec review/audit workflow and verify CARL assumptions, unsupported details, doctor checks, and Claude/Codex paths are represented in Discovery, Requirements, Design, Tasks, and Audit output.

**Acceptance Scenarios:**

Given the CARL integration spec reaches later phases
When requirements, design, and tasks are authored
Then each CARL claim is either linked to repo/spec evidence, marked as an assumption, or marked as unverified external detail requiring research before implementation

Given implementation is ready for review
When the final review/audit runs
Then it checks the managed hook distribution, doctor repair path, warning injection behavior, and Codex sequencing instead of reviewing only the happy-path installer

---

### User Story 6: Runtime proof before CARL is trusted (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

As a maintainer, I want real CARL hook output and benchmark artifacts captured before implementation claims readiness, so that file presence cannot be mistaken for a working agent-visible integration.

**Why:** CARL only helps if the registered hook path actually invokes the runtime and produces the expected context; captured producer output is the evidence that prevents a fake-green install.

**Independent Test:** `@feature3` runtime proof smoke: execute the same hook command registered for plugin users and verify the captured output or provenance ledger proves the managed runner was invoked.

**Acceptance Scenarios:**

Given CARL files exist in a project but no hook command has been exercised
When the runtime proof is reviewed
Then the integration remains untrusted and cannot be reported as ready

Given a real CARL hook command has been captured with provenance and output shape
When the runtime proof is reviewed
Then the report distinguishes runtime-consumer proof from producer-shape proof

---

### User Story 7: Evidence report for Russian CARL readiness (Priority: P2)

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

As a maintainer, I want the CARL report to show Russian prompt results and remaining gaps, so that Russian support is accepted from evidence instead of from the mere existence of Cyrillic aliases.

**Why:** Russian CARL can fail by missing aliases, loading noisy domains, or adding too much context; the report must name those gaps and the optimization needed for each one.

**Independent Test:** `@feature8` Russian report smoke: run the Russian prompt matrix and verify expected domains, actual domains, false positives, false negatives, and optimization recommendations are recorded.

**Acceptance Scenarios:**

Given Russian prompt cases are evaluated against fixture-backed or real CARL output
When the CARL report is generated
Then each prompt records expected domains, actual domains, and a readiness boundary

Given a Russian prompt loads the wrong domains or misses an expected domain
When the CARL report is generated
Then it lists the gap and proposes a concrete alias, normalization, ranking, splitting, or context-budget optimization

---

### User Story 8: Benchmark baseline from real CARL output (Priority: P2)

**Требование:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

As a maintainer, I want recall benchmark thresholds to come from captured CARL output, so that future regression gates compare against real behavior instead of invented numbers.

**Why:** A benchmark gate with guessed thresholds would hide real regressions or block valid behavior; the first baseline must cite the real artifact and its ground truth.

**Independent Test:** `@feature9` benchmark baseline smoke: load the captured benchmark TSV or execute the verified CARL runtime and confirm latency/context metrics are recorded with provenance.

**Acceptance Scenarios:**

Given no real CARL artifact has been accepted
When the benchmark gate is evaluated
Then numeric thresholds remain draft or blocked

Given a real CARL benchmark artifact has been captured with source hashes and ground truth
When the benchmark gate is evaluated
Then supported metrics are recorded as the baseline for later comparison

---

### User Story 9: No fake healthy CARL status when runtime is absent (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

As a maintainer, I want CARL install and doctor surfaces to refuse a healthy verdict when the runtime or project data is absent, so that users do not trust guidance that was never loaded.

**Why:** A CARL integration that reports healthy from file presence alone would repeat the dead-integration failure mode and hide missing runtime evidence.

**Independent Test:** `@feature2` absence smoke: run the CARL health surface in a temp project with no runtime and verify it reports degraded or missing instead of healthy.

**Acceptance Scenarios:**

Given managed CARL metadata exists but the runtime command is missing
When CARL health is evaluated
Then the result is degraded and the integration is not reported healthy

Given project `.carl/carl.json` is missing required language or runtime state
When CARL health is evaluated
Then the report names the missing state instead of returning empty healthy recall

---

### User Story 10: Preserve user-owned CARL configuration during repair (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

As a dev-pomogator user with my own CARL settings, I want managed repair to touch only dev-pomogator-owned blocks, so that automatic fixes cannot erase my custom rules or hooks.

**Why:** CARL repair must be safe to run through doctor; if it overwrites user-owned entries, users will avoid the repair path and managed recovery becomes unsafe.

**Independent Test:** `@feature6` preservation smoke: create managed and user-owned CARL config in one temp project, run repair, and verify user-owned entries survive unchanged.

**Acceptance Scenarios:**

Given a CARL config contains a dev-pomogator managed block and a user-owned block
When doctor repair refreshes CARL artifacts
Then only the managed block changes and the user-owned block remains byte-equivalent

Given a user-owned key conflicts with a reserved managed key
When repair evaluates CARL config
Then it reports `user-conflict` and stops automatic overwrite
