# Functional Requirements

## FR-1: Root marketplace distribution

**Feature tag:** @feature1

The system SHALL publish one repository-root OMP marketplace catalog and one root plugin source for dev-pomogator@stgmt. The catalog SHALL resolve source ./ from its own marketplace root, and the installed artifact SHALL include the declared OMP extension, skills and MCP definition.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-root-install-and-activation)

## FR-2: Authoritative engine delegation

**Feature tag:** @feature2

OMP-facing wrappers SHALL delegate to the existing SpecGraph, conformance, verdict and mutation-door implementations. They SHALL NOT create a second graph, direct spec writer, or independent readiness result.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-authoritative-delegation)

## FR-3: Docker installed-plugin evidence

**Feature tag:** @feature3

Migration acceptance scenarios SHALL execute only through a declared Docker Cucumber profile that discovers the migration feature, step definitions and tagged lifecycle hook. Canonical evidence SHALL be ingested from that run.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-docker-lifecycle-evidence)

## FR-4: Complete hook contract matrix

**Feature tag:** @feature4

Every in-scope legacy guard SHALL have one explicit source-to-OMP mapping that names the source trigger, OMP event, returned result shape, ordering, headless policy, owner, and regression scenario. A guard without a proven mapping SHALL remain outside the enabled OMP extension.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-hook-mapping-behavior)

## FR-5: W0 bounded rollback

**Feature tag:** @feature5

Before W1 begins, the system SHALL provide and test a rollback procedure that disables only the disposable OMP migration path, removes only its fixture and project-scope state, preserves an unrelated sentinel spec byte-for-byte, and leaves the Claude path usable.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-rollback-preservation)

## FR-6: Portable MCP door

**Feature tag:** @feature6

OMP SHALL discover dev-pomogator-specs through the installed plugin's root .mcp.json route or an explicitly proven replacement. The resolved command, environment, root and collision policy SHALL be evidenced by a fresh session; invalid mutation requests SHALL remain atomic refusals.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-mcp-discovery-and-refusal)
