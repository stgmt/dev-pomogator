# Acceptance Criteria

## AC-1

**Requirement:** [FR-1](FR.md#fr-1)

WHEN a scoped direct OpenRouter entry point executes without a supported override, THE system SHALL expose and use exactly `deepseek/deepseek-v4-flash` at its supported configuration/request seam.

WHEN a supported direct override is supplied, THE system SHALL select it ahead of the default and SHALL expose the override decision source.

WHEN canonical source is regenerated, THE source and distributed bundle SHALL expose the same effective direct model and SHALL not retain a live Haiku selection.

## AC-2

**Requirement:** [FR-2](FR.md#fr-2)

WHEN an AiPomogator-backed path needs a model, THE system SHALL validate `/go/v1/models` and SHALL choose only a compatible returned route.

IF the catalog is missing, malformed, empty, lacks a compatible route, the provider fails, or credentials are missing, THEN the system SHALL emit an explicit diagnostic and follow configured non-Haiku abstention, stop, or fallback behavior without inventing a route or silently retaining Haiku.

WHEN claude-mem bootstrap configures a routed model, THE installer SHALL propagate the exact verified selected catalog ID through its supported configuration seam.

## AC-3

**Requirement:** [FR-3](FR.md#fr-3)

WHEN claim-evidence-gate Meridian, learnings-capture semantic selection, or an affected current-ID surface executes, THE system SHALL preserve documented override precedence and emit effective provider/model, decision source, and secret-free diagnostic data.

IF the provider fails or output is malformed or empty, THEN the system SHALL follow its documented non-Haiku fail-soft behavior and SHALL not report a DeepSeek success while retaining Haiku.

## AC-4

**Requirement:** [FR-4](FR.md#fr-4)

WHEN canonical source or canonical `.claude` guidance changes, THE supported build/synchronization process SHALL produce executable bundles and `.agents` mirror content with identical active model and fallback policy.

WHEN the exact-current-ID census runs, THE verification SHALL invoke supported runtime/configuration paths and SHALL assert exact configured or outbound values, not source-text presence or a generic nonempty-model check.

## AC-5

**Requirement:** [FR-5](FR.md#fr-5)

WHEN a candidate quality evaluation runs, THE gate SHALL compare baseline and DeepSeek on the same redacted real workloads and SHALL record relevance, hallucination, Russian quality, format/length, malformed/empty rate, latency, token usage, cost, provenance, and per-surface pass/fail/no-go.

IF pricing metadata differs from the captured assumptions or is unavailable, THEN the gate SHALL emit pricing drift and SHALL withhold the numeric savings claim while preserving the historical captured evidence.

WHERE external benchmarks are recorded, THE system SHALL label them candidate evidence and SHALL require the product-specific result for acceptance.