# Requirements Traceability Matrix

| ID | Requirement | Acceptance criteria | Design decision | Verification |
|---|---|---|---|---|
| FR-1 | [Bootstrap decision](FR.md#fr-1-bootstrap-decision-feature1) | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | [Deterministic bootstrap](DESIGN.md#decision-deterministic-bootstrap-and-provenance) | `@feature1` decision outline |
| FR-2 | [Non-interactive install](FR.md#fr-2-non-interactive-install-command-feature2) | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2) | [Deterministic bootstrap](DESIGN.md#decision-deterministic-bootstrap-and-provenance) | `@feature2` recorded launcher |
| FR-3 | [Idempotency and backoff](FR.md#fr-3-idempotency-and-backoff-feature3) | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3) | [Deterministic bootstrap](DESIGN.md#decision-deterministic-bootstrap-and-provenance) | `@feature3` installed/opt-out cases |
| FR-4 | [Fail-open builtins-only](FR.md#fr-4-fail-open-builtins-only-feature4) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4) | [Hooks always continue](DESIGN.md#decision-hooks-always-continue-without-dependencies) | `@feature4` malformed-input and health seams |
| FR-5 | [Doctor detection](FR.md#fr-5-doctor-detection-feature5) | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5) | [Canonical state/config contract](DESIGN.md#decision-one-canonical-state-config-and-doctor-contract) | `@feature5` doctor scenarios |
| FR-6 | [Canonical global MCP config](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6) | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature6) | [Canonical state/config contract](DESIGN.md#decision-one-canonical-state-config-and-doctor-contract) | `@feature6` global config scenario |
| FR-7 | [Worker reaper](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7) | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature7) | [Platform-aware recovery](DESIGN.md#decision-surgical-platform-aware-health-recovery) | `@feature7` decision and hook scenarios |

## Non-functional requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)
