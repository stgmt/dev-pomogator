# Requirements Matrix

## Functional Requirements

- [FR-1](FR.md#fr-1) — Direct OpenRouter target and source/bundle parity.
- [FR-2](FR.md#fr-2) — Catalog-first AiPomogator routing and fail-soft behavior.
- [FR-3](FR.md#fr-3) — Semantic selectors, overrides, and observable diagnostics.
- [FR-4](FR.md#fr-4) — Generated artifacts, mirrors, documentation, and exact-ID integrity.
- [FR-5](FR.md#fr-5) — Real-workload quality, cost, and pricing-drift gate.

## Non-Functional Requirements

- [NFR-1](NFR.md#nfr-1-deterministic-observable-selection) — deterministic observable selection.
- [NFR-2](NFR.md#nfr-2-reliability-and-fail-soft-safety) — reliability and fail-soft safety.
- [NFR-3](NFR.md#nfr-3-reproducible-semantic-evaluation) — reproducible semantic evaluation.
- [NFR-4](NFR.md#nfr-4-derived-artifact-and-mirror-integrity) — derived-artifact integrity.
- [NFR-5](NFR.md#nfr-5-performance-and-cost-transparency) — performance and cost transparency.
- [NFR-6](NFR.md#nfr-6-fixture-secrecy-and-data-minimization) — fixture secrecy and data minimization.

## Acceptance Criteria

- [AC-1](ACCEPTANCE_CRITERIA.md#ac-1) — direct target and override precedence.
- [AC-2](ACCEPTANCE_CRITERIA.md#ac-2) — catalog-first route selection and non-Haiku fail-soft behavior.
- [AC-3](ACCEPTANCE_CRITERIA.md#ac-3) — semantic selector observability and failure behavior.
- [AC-4](ACCEPTANCE_CRITERIA.md#ac-4) — generated/canonical/mirror exact-policy integrity.
- [AC-5](ACCEPTANCE_CRITERIA.md#ac-5) — real-workload and pricing-drift decision gate.

## Check Matrix

| CHK-ID | Requirement | Traces To | Verification Method | Status | Evidence / Expected Observation |
|---|---|---|---|---|---|
| CHK-FR1-01 | FR-1 | FR-1, AC-1, UC-1 | BDD scenario | Draft | Direct default reaches `deepseek/deepseek-v4-flash` at the supported seam. |
| CHK-FR1-02 | FR-1 | FR-1, AC-1, UC-1 | Integration test | Draft | Supported override wins and source/bundle effective behavior is equal. |
| CHK-FR2-01 | FR-2 | FR-2, AC-2, UC-2 | BDD scenario | Draft | Valid producer-shaped catalog yields only a returned compatible route. |
| CHK-FR2-02 | FR-2 | FR-2, AC-2, UC-2 | BDD scenario | Draft | Catalog/credential/provider failures emit diagnostics and no Haiku fallback. |
| CHK-FR3-01 | FR-3 | FR-3, AC-3, UC-3 | BDD scenario | Draft | Defaults, overrides, malformed/empty output, and provider failure are observable. |
| CHK-FR3-02 | FR-3 | FR-3, AC-3, UC-3 | Integration test | Draft | All scoped semantic entry points expose effective provider/model and decision source. |
| CHK-FR4-01 | FR-4 | FR-4, AC-4, UC-4 | Integration test | Draft | Regenerated bundles and synchronized mirrors match canonical active policy. |
| CHK-FR4-02 | FR-4 | FR-4, AC-4, UC-4 | BDD scenario | Draft | Installer/config/docs assert exact selected ID rather than generic presence. |
| CHK-FR5-01 | FR-5 | FR-5, AC-5, UC-5 | Manual review | Draft | Human-reviewed fixed-rubric record contains all required dimensions and decision. |
| CHK-FR5-02 | FR-5 | FR-5, AC-5, UC-5 | Integration test | Draft | Pricing drift withholds numeric savings while retaining historical context. |