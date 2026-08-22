# Requirements

## Functional Requirements

- [FR-1](FR.md#fr-1-root-marketplace-distribution): root marketplace distribution.
- [FR-2](FR.md#fr-2-authoritative-engine-delegation): authoritative engine delegation.
- [FR-3](FR.md#fr-3-docker-installed-plugin-evidence): Docker installed-plugin evidence.
- [FR-4](FR.md#fr-4-complete-hook-contract-matrix): complete hook contract matrix.
- [FR-5](FR.md#fr-5-w0-bounded-rollback): W0 bounded rollback.
- [FR-6](FR.md#fr-6-portable-mcp-door): portable MCP door.

## Verification Matrix

| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |
|---|---|---|---|---|---|
| CHK-FR1-01 | Root catalog installs and activates the intended plugin. | FR-1, AC-1, @feature1, UC-1 | Integration test | Draft | W0 project-scope install, reload and fresh-session probe. |
| CHK-FR2-01 | OMP wrappers delegate to the authoritative readiness and mutation engines. | FR-2, AC-2, @feature2, UC-2 | BDD scenario | Draft | Broken traceability and invalid mutation fixtures. |
| CHK-FR3-01 | Migration evidence runs through the declared Docker Cucumber profile. | FR-3, AC-3, @feature3, UC-3 | BDD scenario | Draft | Feature, steps, hook and canonical result ingestion. |
| CHK-FR4-01 | Each enabled guard has an event/result/headless contract and regression. | FR-4, AC-4, @feature4, UC-4 | Integration test | Draft | Unmapped hooks remain disabled. |
| CHK-FR5-01 | W0 rollback is bounded and preserves unrelated specs and Claude access. | FR-5, AC-5, @feature5, UC-5 | BDD scenario | Draft | Forced failure plus sentinel byte comparison. |
| CHK-FR6-01 | Installed OMP plugin discovers the real MCP door and preserves atomic refusal. | FR-6, AC-6, @feature6, UC-6 | Integration test | Draft | Root .mcp.json command/env/root/collision probe. |

## Verification Process

### How CHKs are verified

1. Each CHK has one named feature scenario and one bounded fixture.
2. Status changes only after the linked Docker evidence is ingested.
3. A regression turns Verified into Blocked until a fresh run succeeds.

### Status lifecycle

Draft → In Progress → Verified → Blocked

### Review cadence

- Discovery and Requirements gates retain Draft while W0 proof is incomplete.
- Finalization may not claim delivery until every CHK is Verified or explicitly Blocked with an issue link.

## Summary Counts

- Total CHKs: 6
- Verified: 0
- In Progress: 0
- Draft: 6
- Blocked: 0
