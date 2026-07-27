# User Stories

### User Story 1: Direct OpenRouter migration (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1)

As a dev-pomogator maintainer, I want each direct OpenRouter selector to use the exact DeepSeek V4 Flash default, so that live hook/helper behavior is consistent and observable.

**Why:** An ID replacement is incomplete if generated bundle behavior or override precedence drifts from canonical source.

**Independent Test:** Docker BDD invokes source and bundle-supported entry points with default and override inputs and observes the effective configuration/request model.

**Acceptance Scenarios:**
- Given no override, when a direct selector runs, then it exposes `deepseek/deepseek-v4-flash`.
- Given a supported override, when a direct selector runs, then it exposes that override and its source.

### User Story 2: Catalog-verified routed selection (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2)

As an operator, I want AiPomogator model routing to be chosen from its live catalog, so that a direct OpenRouter slug cannot become an invented routed route.

**Why:** Provider namespaces and availability differ; a catalog error must not silently preserve Haiku.

**Independent Test:** Docker BDD injects redacted producer-shaped catalog captures and observes a compatible returned route or explicit configured non-Haiku fail-soft behavior.

**Acceptance Scenarios:**
- Given a compatible returned catalog route, when routing runs, then it records the returned ID and verified-catalog source.
- Given absent, malformed, empty, or incompatible catalog data, when routing runs, then it emits a diagnostic and does not select Haiku.

### User Story 3: Preserve semantic operation safely (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3)

As a maintainer, I want semantic selectors and their overrides to remain observable and fail-soft during migration, so that a model swap cannot hide behavior loss.

**Why:** Public benchmarks cannot establish task-specific judge, Russian, format, or failure behavior.

**Independent Test:** Docker BDD invokes supported selector paths under default, override, provider failure, malformed-output, and empty-output conditions.

**Acceptance Scenarios:**
- Given a supported override, when a semantic selector runs, then it wins over the default and is observable.
- Given a provider/output failure, when the selector runs, then it records a non-Haiku fail-soft diagnostic.

### User Story 4: Keep distributed policy artifacts exact (Priority: P2)

**Требование:** [FR-4](FR.md#fr-4)

As a maintainer, I want generated bundles, canonical guidance, mirrors, installer settings, and BDD/current-behavior docs to agree on the exact active policy, so that users do not receive stale behavior.

**Why:** Source-only checks miss stale bundles, independently edited mirrors, and generic assertions.

**Independent Test:** Supported regeneration/synchronization plus integration BDD observes source/bundle parity, canonical/mirror parity, and exact installed/configured IDs.

**Acceptance Scenarios:**
- Given a canonical source change, when the supported build runs, then the bundle exposes equivalent effective behavior.
- Given canonical `.claude` policy changes, when synchronization runs, then `.agents` exposes the same active policy.

### User Story 5: Prove readiness with real workloads (Priority: P2)

**Требование:** [FR-5](FR.md#fr-5)

As a reviewer, I want a deterministic real-workload comparison and live price check, so that rollout and savings claims have auditable evidence.

**Why:** A historical 65.3 percent calculation and external benchmarks are candidate context, not current product acceptance.

**Independent Test:** The quality gate evaluates redacted representative samples under fixed settings, records the rubric, and withholds numeric savings on pricing drift.

**Acceptance Scenarios:**
- Given complete baseline/candidate evidence, when the gate evaluates a surface, then it records a pass, fail, or no-go decision.
- Given missing or drifted pricing metadata, when the gate evaluates cost, then it withholds the numeric savings claim.