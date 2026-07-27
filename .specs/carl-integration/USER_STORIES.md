# User Stories

> Discovery stories use the v3 form: priority, requirement link, actor/goal/value, why, independently executable test, and Given/When/Then acceptance scenarios. CARL readiness is evidence-gated: project deployment, runtime consumption, and producer provenance are separate claims.

---

### User Story 1: Supported Claude Code projects receive managed CARL state (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1-claude-code-managed-carl-install)

As a dev-pomogator user working in a supported Claude Code project, I want the canonical plugin's SessionStart flow to create or refresh project-local `.carl/carl.json` and managed CARL settings, so that CARL guidance is available for this project without manual dotfile setup.

**Why:** The repository had a registered CARL consumer but did not deploy project CARL state. Merged PR #202 identifies the causal gap, but its current merged-state evidence is not yet independently aligned with every current runtime artifact. Earlier PR #94 reports automatic Russian adaptation and SessionStart bootstrap; the current install path can swallow adaptation exceptions, so deployment success must not imply adaptation success. Evidence: [src:https://github.com/stgmt/dev-pomogator/pull/202], [src:https://github.com/stgmt/dev-pomogator/pull/94], [ref:tools/carl/install.ts:133-213].

**Independent Test:** In an isolated project fixture, invoke the same SessionStart/bootstrap path used by the plugin, then invoke UserPromptSubmit with that project's `cwd`; assert `.carl/carl.json` exists, `managedBy=dev-pomogator`, managed version/schema metadata is present, and adaptation failure is visible rather than silently returned as a successful install.

**Acceptance Scenarios:**

Given a supported Claude Code project has no `.carl/carl.json`
When the canonical SessionStart/bootstrap flow runs
Then project-local CARL state is created with dev-pomogator ownership and managed version/schema metadata

Given project rule/skill adaptation throws during install
When the installer returns its result
Then the result is degraded or explicitly adaptation-failed and does not claim complete CARL readiness

Given a project already has a managed CARL manifest
When the bootstrap/install flow runs again without repair
Then managed state is refreshed without silently replacing user-owned configuration

Given a Russian prompt reaches a project whose language metadata is missing or stale
When the CARL runner evaluates the prompt
Then it reports degraded language coverage rather than claiming healthy empty Russian recall

---

### User Story 2: CARL absence is visible instead of falsely green (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent)

As an AI agent and maintainer, I want missing project state, missing runtime, and unverified runtime consumption to be reported as degraded, so that files on disk cannot masquerade as a healthy integration.

**Why:** The original CARL path reported `project-missing` and failed open when `CARL_PROJECT_DIR` pointed at a different project root. Issues #128, #130, #203, #205, and #206 show that root selection and project-state discovery are the central failure surface. The current open-issue inventory is 60, making stale-state and evidence-drift a repository-wide operational context rather than a single defect. Evidence: [src:https://github.com/stgmt/dev-pomogator/issues/128], [src:https://github.com/stgmt/dev-pomogator/issues/130], [src:https://github.com/stgmt/dev-pomogator/issues/203], [src:https://github.com/stgmt/dev-pomogator/issues/205], [src:https://github.com/stgmt/dev-pomogator/issues/206].

**Independent Test:** Run health/reporting against fixtures for absent manifest, wrong `CARL_PROJECT_DIR`, missing runtime command, and a present-but-unexecuted manifest; assert no case returns `healthy`, `ready`, or equivalent green status and every diagnostic names the failing condition.

**Acceptance Scenarios:**

Given the runner receives `cwd=E:/repos/lm-saas` but an override points to another nonexistent project
When CARL project-root resolution runs
Then it reports `project-missing` for the selected root and does not claim the caller project is healthy

Given `.carl/carl.json` exists but no runnable runtime consumer is available
When CARL health is evaluated
Then the result is degraded and names the missing or unverified runtime consumer

Given files and registration are present but the runtime consumer has not been exercised for the project
When the review report is generated
Then the fake-green gate remains blocking

---

### User Story 3: The registered hook path proves runtime consumption (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)

As a Claude Code user, I want the distributed plugin hook chain to invoke the CARL runner through its actual dispatch path, so that a passing file-existence check cannot hide a dead integration.

**Why:** PR #202 documents the actual chain `.claude-plugin/hooks.json` → SessionStart bootstrap → hook-service registry → `tools/carl/runner.ts`, and explains why grepping only `hooks.json` became stale after the HTTP dispatcher migration. PR #94's smoke claim and the current merged state remain separate evidence that must be replayed against the installed package. Evidence: [src:https://github.com/stgmt/dev-pomogator/pull/202], [src:https://github.com/stgmt/dev-pomogator/pull/94].

**Independent Test:** In an installed-plugin fixture with development dependencies unavailable, execute the registered SessionStart and UserPromptSubmit path; assert the route reaches `tools/carl/runner.ts`, the project manifest records runtime-consumer proof, and the test fails when only CARL files exist. Dependency-absent proof is currently unverified and cannot be inferred from source inspection.

**Acceptance Scenarios:**

Given `.claude-plugin/hooks.json` registers the SessionStart bootstrap and the hook-service registry routes UserPromptSubmit to `tools/carl/runner.ts`
When a normal plugin-user hook event executes
Then the registered chain invokes the managed runner and records runtime-consumer proof

Given the runner file exists but the registered launcher or dispatcher does not call it
When the runtime-consumer scenario runs
Then the scenario fails instead of accepting file presence as integration proof

Given plugin-user dependencies are absent from the project
When the distributed hook path executes
Then it either exercises the packaged runtime path or reports the missing runtime explicitly; a silent skip is a failure

---

### User Story 4: Hook failures fail open with an agent-visible disclosure (Priority: P1)

**Требование:** [FR-4](FR.md#fr-4-fail-open-warning-injection)

As a Claude Code user, I want CARL failures to leave the main session running while disclosing the failure to the AI agent, so that degraded guidance is visible and unrelated work is not blocked.

**Why:** The runner contract uses `hookSpecificOutput.additionalContext`, exits successfully on controlled failure, and includes the required instruction to tell the user CARL guidance/recall was unavailable. Evidence: [ref:tools/carl/runner.ts:16], [ref:tools/carl/runner.ts:82-87], [src:https://github.com/stgmt/dev-pomogator/issues/203].

**Independent Test:** Execute the real runner with each controlled failure mode (missing dependency, timeout, malformed output, unsupported runtime, and exception); assert exit code zero, a diagnostic code, no false success claim, and an agent-visible warning containing the unavailable-guidance disclosure.

**Acceptance Scenarios:**

Given the managed hook encounters a missing dependency, timeout, malformed output, unsupported runtime, or exception
When UserPromptSubmit runs
Then the hook exits fail-open and emits `hookSpecificOutput.additionalContext`

Given the hook fails open
When the AI agent continues the session
Then the warning says CARL did not run and tells the agent to tell the user CARL guidance/recall was unavailable

Given the hook succeeds
When the runner emits normal CARL context
Then it does not inject a false failure warning

---

### User Story 5: Doctor classifies and repairs CARL safely (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5-doctor-health-and-repair)

As a dev-pomogator maintainer or user, I want `pomogator-doctor` to classify CARL health and repair safe drift, so that recovery is available through the normal diagnostic flow.

**Why:** CARL health spans project state, runtime, language metadata, platform prerequisites, and ownership conflicts. The current manifest and doctor integration model explicit degraded states instead of collapsing all failures into installed/healthy. Evidence: [src:https://github.com/stgmt/dev-pomogator/blob/main/tools/carl/manifest.ts], [src:https://github.com/stgmt/dev-pomogator/blob/main/.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts], [src:https://github.com/stgmt/dev-pomogator/pull/202].

**Independent Test:** For stale, missing, broken-runtime, unsupported, and user-conflict fixtures, run the doctor check with and without repair; assert the state is classified, safe managed drift is repaired only when requested, and runtime failures are not disguised as configuration repair.

**Acceptance Scenarios:**

Given a project has stale managed CARL version metadata
When `pomogator-doctor` runs without repair
Then it reports the stale state and does not mutate the project

Given managed CARL artifacts are missing or stale and repair is enabled
When `pomogator-doctor` runs
Then it refreshes only repairable managed state and reports before/after status

Given runtime dependencies or platform capabilities are unavailable
When doctor evaluates CARL
Then it reports `broken-runtime` or `unsupported` with an actionable diagnostic

---

### User Story 6: Managed repair preserves user-owned configuration (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration)

As a project owner, I want CARL installation and repair to write only within explicit dev-pomogator ownership boundaries, so that my hooks, aliases, and settings are not overwritten.

**Why:** The installer reserves a deterministic managed settings key and refuses a conflicting owner rather than silently replacing it. This ownership boundary is necessary because doctor repair is expected to be repeatable in projects with hand-authored configuration. Evidence: [ref:tools/carl/install.ts:73-104], [src:https://github.com/stgmt/dev-pomogator/blob/main/tools/carl/install.ts].

**Independent Test:** Create a project fixture containing user-owned settings outside the managed key and a conflicting value at the managed key; run install and repair; compare a byte snapshot of user-owned content and assert conflict refusal for the reserved key.

**Acceptance Scenarios:**

Given user-authored CARL settings exist outside the dev-pomogator managed region
When install or doctor repair runs
Then those settings remain byte-equivalent

Given the reserved managed key is owned by another tool or user
When repair runs
Then the integration reports `user-conflict` and does not overwrite the entry

Given a managed region is rewritten
When the resulting configuration is inspected
Then ownership is recoverable from the managed marker, manifest entry, or deterministic managed key

---

### User Story 7: Codex CARL stays gated behind platform prerequisites (Priority: P2)

**Требование:** [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)

As a user of both Claude Code and Codex, I want Codex CARL to be enabled only after launcher, deterministic dispatcher, and version-capability prerequisites are present, so that a premature Codex path cannot break healthy Claude Code CARL.

**Why:** The CARL manifest evaluates Codex prerequisites separately and reports `codex-deferred-prerequisite` when the launcher, plugin manifest, or deterministic dispatcher is missing. This preserves the context-menu/Codex sequencing boundary. Evidence: [ref:tools/carl/manifest.ts:257-301], [src:https://github.com/stgmt/dev-pomogator/issues/173].

**Independent Test:** Evaluate a fixture with missing Codex prerequisites and a fixture with all prerequisites plus a version-aware dispatcher; assert Codex is deferred/unsupported in the first case, independently ready only in the second, and Claude Code status is unchanged in both.

**Acceptance Scenarios:**

Given the Codex launcher or deterministic project-local dispatcher is unavailable
When the CARL platform evaluator runs
Then Codex is reported deferred or unsupported and Claude Code health is evaluated independently

Given the installed Codex version lacks the required hook capability
When Codex CARL health is evaluated
Then it reports a version-aware unsupported state and does not claim Codex readiness

Given launcher, plugin-manifest, dispatcher, and version prerequisites are present
When Codex CARL is evaluated
Then it uses the deterministic Codex dispatcher rather than copied Claude Code hook files

---

### User Story 8: Review separates implementation, runtime, and provenance evidence (Priority: P2)

**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)

As a maintainer, I want CARL review reports to distinguish verified local implementation, unverified external behavior, fixture-backed sibling output, and runtime-consumer proof, so that a report cannot turn partial evidence into readiness.

**Why:** The current review report has a fake-green gate and evidence markers, while the audit records that external CARL source/runtime ownership and agent-visible behavior remain unresolved. The sibling fixture is useful evidence but is not automatically dev-pomogator-owned. Graph/spec evidence currently says 9 FR, 9 AC, and 12 scenarios/tasks while the executable feature has 15 named CARL scenarios, so the inventory itself is drifted and must be reconciled before a green claim. Evidence: [ref:.specs/carl-integration/AUDIT_REPORT.md:1-85], [ref:.specs/carl-integration/carl-integration.feature:1-119], [ref:tests/features/carl-integration.feature:1-148].

**Independent Test:** Generate a review report for local source only, sibling fixture-backed output, and a project with verified runtime-consumer execution; assert each section is marked `[VERIFIED]`, `[UNVERIFIED]`, or `[ASSUMED]` according to evidence, the graph/executable scenario census is explicit, and the fake-green gate blocks done until project execution exists.

**Acceptance Scenarios:**

Given local CARL files and hook registration exist but the project consumer has not executed
When the review report is generated
Then it marks runtime evidence unverified and blocks a done verdict

Given the graph/spec census reports 9 FR, 9 AC, and 12 scenarios/tasks while the executable feature has 15 named CARL scenarios
When review coverage is computed
Then the report flags graph drift and does not silently treat the counts as equivalent

Given a captured sibling producer output is used
When the report is generated
Then it marks the result fixture-backed and does not claim dev-pomogator runtime readiness

Given external CARL behavior is not backed by source, documentation, or captured output
When the claim is reported
Then it remains explicitly unverified or assumed with a named research gap

---

### User Story 9: Recall benchmarks use real provenance and refuse invented thresholds (Priority: P2)

**Требование:** [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

As a maintainer optimizing CARL recall, I want benchmark baselines and regression gates to use real producer evidence, so that latency, context, and recall claims are reproducible rather than invented.

**Why:** The captured sibling benchmark contains real rows, including `old_bulk_autoload_chars=683575` and five iterations, but the source/vendor relationship to dev-pomogator remains unverified. The current benchmark contract therefore keeps the threshold draft until provenance is complete. Evidence: [src:https://github.com/stgmt/dev-pomogator/blob/main/tests/fixtures/carl/bench.stdout.tsv], [src:https://github.com/stgmt/dev-pomogator/blob/main/tools/carl/bench.ts], [src:https://github.com/stgmt/dev-pomogator/blob/main/tests/fixtures/carl/manifest.json].

**Independent Test:** Run the benchmark gate with no artifact, a sibling fixture lacking dev-pomogator ownership, and a provenance-complete real artifact; assert the first two remain draft/blocked and only the last records supported metrics and enables a regression comparison.

**Acceptance Scenarios:**

Given no real CARL artifact has been captured
When the benchmark gate runs
Then the threshold remains draft or blocked and no numeric pass threshold is invented

Given a fixture contains producer output but lacks complete provenance
When the benchmark runs
Then it records fixture-backed evidence without enabling a final regression gate

Given a real artifact includes provenance, source hashes, and producer ground truth
When the benchmark runs
Then it records only supported baseline metrics and future checks compare against that baseline

---

### Discovery boundary

The stories intentionally keep these evidence lanes separate:

- plugin registration and dispatch route;
- project-local deployment and root selection;
- runtime consumer execution;
- fail-open warning injection;
- doctor repair and ownership preservation;
- Codex prerequisite gating;
- producer shape, Russian evaluation, and benchmark provenance;
- graph/spec versus executable scenario census.

The evidence supports local implementation and the merged-fix claim, but does not by itself prove a clean plugin-user dependency-absent run, a dev-pomogator-owned external CARL producer, final root precedence, or a reconciled graph/executable census. Those remain implementation and audit gates, not Discovery assumptions.
