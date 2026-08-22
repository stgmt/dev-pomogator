# Design

## Components

- Root .omp-plugin/marketplace.json: OMP-preferred catalog, containing the same dev-pomogator source ./ as the existing root marketplace catalog.
- Root package.json: declares one OMP extension entry, omp-extension/index.ts.
- omp-extension/index.ts: default extension factory that registers approved pi.on adapters and pi.registerTool wrappers.
- omp-extension/hook-map.ts: exhaustive legacy trigger to OMP event, result, order and headless-policy matrix.
- omp-extension/spec-tools.ts: wrappers that delegate to authoritative graph, MCP and CLI implementations; no duplicate validation.
- Root .mcp.json: portable Node-backed definition of dev-pomogator-specs and dev-pomogator-advisor.
- docs/migration-runbook.md: W0 rollback contract.

## Artifact and runtime contract

Repository root is the only marketplace and plugin source. A marketplace install identifies dev-pomogator@stgmt and resolves source ./ from that root. W0 must record the resolved root, lock entry, extension path and loaded module paths.

The root extension uses the documented factory model. A mapped guard declares its legacy source trigger, OMP event, return shape, ordering, UI/headless behavior and regression scenario. tool_call uses block/reason/input results; tool_result uses content/details overrides. Stop semantics use a documented terminal lifecycle event, not context by name alone.

Agent-facing wrappers are registered by the root extension and expose stable names, parameter schema, authoritative delegation target, cancellation policy and an integration scenario. Object default exports are not used for OMP tools.

The existing root .mcp.json remains portable. Its Node command, mcp-stdio launcher, plugin-root/project-root substitution and native dependency boundary are tested as part of W0. A duplicate .omp/mcp.json entry is prohibited until server-name precedence is proven.

## Migration waves

1. W0: create root catalog and extension skeleton; capture runtime/version evidence; perform disposable project-scope install; reload and start fresh session; prove extension tool, MCP request and bounded rollback. W1 cannot begin before this gate passes.
2. W1: wrap the authoritative graph, validator, verdict and MCP surfaces; prove broken traceability and invalid mutation refusal through OMP.
3. W2: port only hook-map-approved guards, preserving event-specific behavior and headless policy.
4. W3: add remaining form/status/plan guidance wrappers, rerun installed-plugin discovery and full regression evidence.

A failed wave disables only the disposable OMP path. It never resets repository .specs. The Claude plugin remains usable.

## Key Decisions

### Decision: Keep one repository-root plugin source

**Требование:** [FR-1](FR.md#fr-1-root-marketplace-distribution)

**Rationale:** the existing root marketplace already resolves source ./ and root content contains distributed skills, launcher, MCP manifest and engines.

**Trade-off:** the root package must explicitly test its OMP extension and multi-runtime boundary.

**Alternatives considered:**
- Nested omp-plugin package — rejected because the existing root catalog would not select it.
- Separate OMP repository — rejected because it duplicates authoritative engines and increases drift.

### Decision: Use an OMP extension factory for hooks and wrappers

**Требование:** [FR-4](FR.md#fr-4-complete-hook-contract-matrix)

**Rationale:** OMP documents factory modules, pi.on handlers and pi.registerTool registration.

**Trade-off:** each legacy hook needs explicit semantic mapping instead of a mechanical rename.

**Alternatives considered:**
- Claude-shaped async context callbacks — rejected because they do not satisfy the documented OMP loader contract.
- Reimplementing enforcement inside each wrapper — rejected because it duplicates guard semantics.

### Decision: Retain the Node MCP launcher during migration

**Требование:** [FR-6](FR.md#fr-6-portable-mcp-door)

**Rationale:** root .mcp.json and the current launcher already define the real server process and environment boundary.

**Trade-off:** OMP delivery requires Node beside its host runtime.

**Alternatives considered:**
- Rewrite the MCP server for Bun first — rejected because it expands scope before compatibility is proven.
- Add a duplicate native MCP definition immediately — rejected until W0 proves precedence and substitution behavior.

### Decision: Make rollback a W0 prerequisite

**Требование:** [FR-5](FR.md#fr-5-w0-bounded-rollback)

**Rationale:** no wave is safe if recovery can reset unrelated specs.

**Trade-off:** W0 takes longer before feature adapters begin.

**Alternatives considered:**
- Publish the runbook in finalization — rejected because W1 already needs recovery.
- Restore all .specs through Git — rejected because it can erase user work.


### Decision: Delegate OMP wrappers to existing engines

**Требование:** [FR-2](FR.md#fr-2-authoritative-engine-delegation)

**Rationale:** one SpecGraph, conformance path, verdict and mutation door preserve existing truth and avoid split-brain readiness.

**Trade-off:** wrapper code must retain the Node/MCP boundary instead of replacing it with convenient OMP-local state.

**Alternatives considered:**
- Rebuild graph and verdict inside the extension — rejected because it creates divergent evidence and readiness results.
- Permit direct OMP writes to specs — rejected because it bypasses CAS, anchors and pre-write validation.

### Decision: Run migration acceptance through an isolated Docker profile

**Требование:** [FR-3](FR.md#fr-3-docker-installed-plugin-evidence)

**Rationale:** Docker supplies a reproducible OMP plus Node environment and keeps user plugin state and shared specs outside the test fixture.

**Trade-off:** setup is slower than a host command and requires explicit image/profile maintenance.

**Alternatives considered:**
- Host Cucumber execution — rejected because it cannot prove the installed OMP artifact and violates the Docker-only BDD rule.
- Reuse the shared test profile without a migration hook — rejected because it cannot provide isolated install, rollback and evidence ownership.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD [VERIFIED: scripts/docker-bdd.sh]
**Framework:** Cucumber.js in Docker
**Evidence:** existing Docker BDD wrapper and real local OMP version capture.
**Verdict:** migration scenarios use a disposable project fixture, not the repository shared .specs root.

- Mirror feature: tests/features/omp/migrate-to-omp.feature.
- Step definitions: tests/step_definitions/omp_migration.ts.
- Tagged lifecycle: tests/hooks/omp-migration.ts, registered for @migrate-to-omp.
- Container: docker/omp.Dockerfile plus declared compose/profile integration.
- Teardown removes only temporary fixture and project-scope OMP state; it asserts an unrelated sentinel spec is unchanged.

### Cleanup Strategy

Each scenario records its temporary project, fixture root and project-scope OMP state before setup. Teardown stops only the disposable container and removes only those recorded paths. It never resets repository .specs or user OMP state. A forced rollback compares the sentinel spec bytes before and after cleanup.
