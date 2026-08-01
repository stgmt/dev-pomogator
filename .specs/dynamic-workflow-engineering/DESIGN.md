# Design

## Реализуемые требования

- [FR-1](FR.md#fr-1-workflow-only-delegation-gate) through [FR-13](FR.md#fr-13-dogfood-regression-contract)

## Компоненты

- `dynamic-workflow-engineering` skill — normative bounded authoring and evaluation discipline shipped by the existing plugin.
- `workflow-contracts` registry — machine-readable, versioned contracts for each migrated consumer.
- `agent-policy` — pure policy engine for provenance, admission, budgets, circuit breaking, audit redaction, and guarantee tier.
- protected pre-spawn adapter — obtains non-spoofable runtime context and fails closed for native Agent calls.
- workflow monitor — consumes journal events, preserves partial results, and produces evidence-based status.
- generated hook-service route — defense-in-depth steering and install parity, not sole authority unless trusted origin is proven.

## Где лежит реализация

- Skill: `.claude/skills/dynamic-workflow-engineering/SKILL.md`
- Policy runtime: `tools/dynamic-workflow-engineering/`
- Hook authoring source: `.claude-plugin/hooks.legacy.json`
- Generated wiring: `.claude-plugin/hooks.json`, `.claude/settings.json`, `tools/hook-service/registry.json`
- BDD: `tests/features/core/dynamic-workflow-engineering.feature`, `tests/step_definitions/feature_dynamic_workflow_engineering.ts`

## Алгоритм

1. Load and validate the policy registry and probe trusted-origin capabilities.
2. Classify an actual native Agent event at the pre-spawn boundary.
3. Deny absent or invalid Workflow provenance; admit only an exact in-budget contract.
4. Track logical call, attempts, progress, signatures, outputs, and barrier dependencies.
5. Circuit-break unchanged repeated failure and preserve completed independent output.
6. Verify findings with bounded adversarial evidence and synthesize explicit coverage gaps.
7. Publish the measured guarantee tier without converting steering into enforcement.

## Policy contract

A contract contains `consumer_id`, exact plugin-relative `skill_path`, `operation`, allowed `subagent_types`, maximum calls, concurrency, attempts, tool calls, and input bytes, output schema reference, owner, version, expiry/review date, and redaction policy. Runtime-issued context carries opaque Workflow run and attempt identity. Stable outcome identifiers are proposed implementation constants `[UNVERIFIED until DWE-T04]`: `ALLOW`, `DWE_DIRECT_AGENT_DENIED`, `DWE_ORIGIN_UNTRUSTED`, `DWE_CONTRACT_UNKNOWN`, `DWE_CONTRACT_EXPIRED`, `DWE_SUBTYPE_DENIED`, `DWE_BUDGET_EXCEEDED`, `DWE_ENVELOPE_INVALID`, `DWE_CIRCUIT_OPEN`, and `DWE_POLICY_UNAVAILABLE`.

## Guarantee model

The following tier names are proposed implementation constants `[UNVERIFIED until DWE-T01/DWE-T04]`:

- `ENFORCED`: real-host proof demonstrates trusted pre-spawn origin, deny-before-spawn, fail-closed protected errors, and valid Workflow allowance.
- `STEERING_ONLY`: skill and hooks route normal behavior, but trusted origin or pre-spawn denial is unproven.
- `UNAVAILABLE`: safe policy initialization or routing cannot run.

Bash-launched `claude -p`, renamed wrappers, and direct scripts are separate bypass surfaces and are not counted as native Agent coverage without a distinct tested boundary.

## Key Decisions

### Decision: Deny native Agent without Workflow provenance

**Требование:** [FR-1](FR.md#fr-1-workflow-only-delegation-gate)

**Rationale:** The user-facing invariant is a complete ban on direct native Agent delegation.

**Trade-off:** Delegation becomes unavailable during protected policy outage.

**Alternatives considered:**
- Advisory warning — rejected because it still permits bypass.
- PostToolUse detection — rejected because the child has already spawned.

### Decision: Authorize exact runtime-bound consumer contracts

**Требование:** [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy)

**Rationale:** Opaque host provenance plus exact contracts avoids forgeable prose exemptions.

**Trade-off:** Every legitimate consumer requires explicit migration and versioned metadata.

**Alternatives considered:**
- Skill-name allowlist — rejected because names are caller-controlled text.
- Subagent-type allowlist — rejected because types are shared across consumers.

### Decision: Ship one plugin with a bundled skill

**Требование:** [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering)

**Rationale:** The existing manifest already exposes the plugin skill directory and repository-root marketplace source.

**Trade-off:** Skill and executable runtime share one release cadence.

**Alternatives considered:**
- Nested marketplace plugin — rejected because it adds discovery and versioning without authority.
- User-home-only skill — rejected because it lacks team distribution parity.

### Decision: Reject plans missing bounded admission fields

**Требование:** [FR-4](FR.md#fr-4-bounded-workflow-admission)

**Rationale:** Finite scope, ownership, evidence, barrier, and stop contracts prevent recursive widening.

**Trade-off:** Unknown-size discovery must declare and expose a cap or dropped remainder.

**Alternatives considered:**
- Trust natural-language intent — rejected because broad words such as all are ambiguous.
- Admit then monitor — rejected because unbounded work has already started.

### Decision: Prefer deterministic collection and honest budgets

**Требование:** [FR-5](FR.md#fr-5-deterministic-first-resource-budgets)

**Rationale:** Mechanical retrieval and filtering terminate over finite populations and are independently checkable.

**Trade-off:** Hard time/token cancellation remains best-effort until the runtime proves a preemption surface.

**Alternatives considered:**
- High-effort agent for inventory — rejected because it duplicates deterministic work.
- Advertise unsupported limits — rejected because a configured number is not enforcement.

### Decision: Circuit-break unchanged retry signatures

**Требование:** [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker)

**Rationale:** Repeating an identical prompt, scope, and failure cannot be treated as a new logical strategy.

**Trade-off:** Operators must resume explicitly after a material change.

**Alternatives considered:**
- Unlimited automatic retry — rejected because it obscures cost and progress.
- Count each attempt as a logical call — rejected because it falsifies work-package accounting.

### Decision: Classify status from journal evidence

**Требование:** [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring)

**Rationale:** Calls, attempts, outputs, failures, signatures, and barriers distinguish size from no progress.

**Trade-off:** Monitoring needs durable structured events instead of one aggregate UI line.

**Alternatives considered:**
- Time threshold alone — rejected because long useful work is possible.
- Token threshold alone — rejected because cost does not prove stall or quality.

### Decision: Release independent partial results

**Требование:** [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy)

**Rationale:** A failed sibling must not hide or discard a completed independent result.

**Trade-off:** Synthesis must model missing inputs and partial status.

**Alternatives considered:**
- Barrier after every fan-out — rejected because it blocks independent progress.
- All-or-nothing result discard — rejected because useful evidence is lost.

### Decision: Refute findings with minimal reproducible evidence

**Требование:** [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery)

**Rationale:** Structured output and model agreement do not prove reachability or wrong output.

**Trade-off:** Findings can remain PLAUSIBLE or BLOCKED when proof is unavailable.

**Alternatives considered:**
- Majority vote — rejected because agents can share one false premise.
- Full discovery rerun — rejected because it duplicates cost and widens scope.

### Decision: Stop and resume from logical journal state

**Требование:** [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting)

**Rationale:** The journal identifies completed calls, physical attempts, open work, and coverage gaps.

**Trade-off:** Resume compatibility depends on stable prompt and option fingerprints.

**Alternatives considered:**
- Replay every call — rejected because unchanged completed work is wasted.
- Judge from UI totals — rejected because totals omit result and failure provenance.

### Decision: Fail closed only on the protected path and redact audit

**Требование:** [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)

**Rationale:** A complete ban is false if policy failure permits Agent, while raw payload logging leaks data.

**Trade-off:** Security-specific behavior must be isolated from unrelated fail-open hooks.

**Alternatives considered:**
- Reuse generic fail-open transport unchanged — rejected because availability defeats the invariant.
- Log complete prompts — rejected because they can contain secrets and private code.

### Decision: Publish an evidence-backed guarantee tier

**Требование:** [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers)

**Rationale:** Real-host and clean-install proof are required to distinguish enforcement from steering.

**Trade-off:** Initial release may be labelled STEERING_ONLY or UNAVAILABLE.

**Alternatives considered:**
- Claim enforcement from mocks — rejected because mocks do not prove host behavior.
- Hide capability gaps — rejected because users would receive a false security promise.

### Decision: Replay both dogfood incident contracts

**Требование:** [FR-13](FR.md#fr-13-dogfood-regression-contract)

**Rationale:** The incidents define bounded collection, retry, barrier, partial-output, and quality-classification regressions.

**Trade-off:** Sanitized fixtures must preserve provenance and mirror actual journal shape.

**Alternatives considered:**
- Narrative-only lessons — rejected because they cannot block recurrence.
- Hand-invented fixture fields — rejected because fake artifacts can create false green tests.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE [VERIFIED: this section's fixture inventory and per-scenario clean-home state]
**TEST_FORMAT:** BDD [VERIFIED: cucumber.json and cucumber.docker.json]
**Framework:** Cucumber.js
**Install Command:** already installed
**Evidence:** `cucumber.json` and `cucumber.docker.json` exist; executable step definitions are under `tests/step_definitions/*.ts`.
**Verdict:** Reuse the existing Cucumber.js runner. Add deterministic policy and journal fixtures plus isolated clean-home and real-host launch fixtures; clean up temporary homes, runtime state, and task-owned processes per scenario.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/step_definitions/common.ts` | World/helper lifecycle | suite scenarios | Existing shared scenario state and helpers | Verify exact helper before edit, then reuse |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/step_definitions/feature_dynamic_workflow_engineering.ts` | scenario-local cleanup | `@dynamic-workflow-engineering` | Remove temporary home, policy journal, state, and task-owned processes | Existing hook-service integration steps |

### Cleanup Strategy

Use a unique temporary directory per scenario. Stop only task-owned child processes, remove policy runtime state and clean-home cache after assertions, and leave repository and user state untouched. Failure paths execute identical cleanup.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Consumer contracts | `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | valid, expired, forged, oversized, and budget-exhausted cases | per-feature static |
| Journal incidents | `tests/fixtures/dynamic-workflow-engineering/journals/` | replay both dogfood shapes with provenance | per-feature static |
| Clean plugin home | generated by step definitions | canonical install and dependency-absent execution | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `policyResult` | object | policy invocation step | admission assertions | stable decision and reason |
| `spawnRecords` | array | injected or real child seam | no-spawn and exact-count assertions | conservation and budget proof |
| `journalEvents` | array | telemetry fixture or runtime | monitor and synthesis assertions | logical/physical accounting |
| `installedRoot` | path | clean-install step | parity assertions | dependency-absent proof |
