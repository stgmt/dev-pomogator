# User Stories

### User Story 1: Install the root OMP plugin (Priority: P1)

As a maintainer, I want to install dev-pomogator from the repository-root marketplace source in OMP, so that the installed artifact contains the intended extension, skills and MCP definition.

**Требование:** [FR-1](FR.md#fr-1-root-marketplace-distribution)

**Why:** A successful catalog command is not enough if it resolves a different plugin root than the planned adapters.

**Independent Test:** @feature1 MIGRATE001_01 and MIGRATE001_02 run in a disposable project scope, record the resolved plugin root, reload plugins, start a fresh session, and invoke a registered capability.

**Acceptance Scenarios:**

Given a disposable OMP project without dev-pomogator
When the root marketplace is added and dev-pomogator@stgmt is installed
Then the resolved source is the repository root and the root extension is loaded after reload and fresh session

Given the root catalog is malformed or points outside the marketplace root
When OMP attempts the project-scope install
Then installation fails without changing the user plugin scope

### User Story 2: Preserve authoritative spec engines (Priority: P1)

As a spec author, I want OMP wrappers to delegate to the existing graph, verdict and mutation door, so that migration does not weaken traceability or validation.

**Требование:** [FR-2](FR.md#fr-2-authoritative-engine-delegation)

**Why:** A second graph or direct writer would create false-green status and inconsistent specs.

**Independent Test:** @feature2 MIGRATE001_03 and MIGRATE001_04 prove broken FR-to-AC traceability remains NOT_READY and an invalid phase confirmation is refused.

**Acceptance Scenarios:**

Given an isolated spec with broken FR-to-AC traceability
When the OMP wrapper invokes the authoritative verdict
Then the result is NOT_READY with a file and line finding

Given a spec whose verdict is not GREEN or READY
When an OMP flow requests phase confirmation
Then the transition is refused by the existing status engine

### User Story 3: Activate migration evidence through Docker (Priority: P1)

As a release engineer, I want migration acceptance evidence to run only in a disposable Docker fixture, so that real user state and shared specs are not affected.

**Требование:** [FR-3](FR.md#fr-3-docker-installed-plugin-evidence)

**Why:** Host-side BDD and shared corpus cleanup cannot prove the installed OMP artifact safely.

**Independent Test:** @feature3 MIGRATE001_05 and MIGRATE001_06 exercise the registered Cucumber profile, installed plugin lifecycle, and canonical result capture.

**Acceptance Scenarios:**

Given the OMP migration Docker profile is selected
When a migration scenario runs
Then the feature, step definitions and tagged lifecycle hook are discovered from the declared profile

Given an installed migration wave passes its probe
When its Docker BDD evidence is ingested
Then the corresponding scenario result is canonical and the existing regression corpus remains runnable

### User Story 4: Map guards to actual OMP events (Priority: P1)

As a safety owner, I want every in-scope legacy hook mapped to an OMP event and result contract, so that a guard does not silently disappear or change behavior.

**Требование:** [FR-4](FR.md#fr-4-complete-hook-contract-matrix)

**Why:** Direct Claude-style callback migration does not match OMP factory and event semantics.

**Independent Test:** @feature4 MIGRATE001_07 and MIGRATE001_08 run mapped guards through their declared OMP events in UI and headless policy modes.

**Acceptance Scenarios:**

Given a guarded mutation contains a disallowed placeholder
When its mapped OMP tool_call handler runs
Then it returns the declared block/reason result and the target document remains unchanged

Given a declared external interface lacks its required contract
When the authoritative verdict is requested through OMP
Then the result remains NOT_READY with the linked contract finding

### User Story 5: Recover safely from a failed wave (Priority: P1)

As a migration operator, I want W0 to provide bounded rollback before W1 begins, so that a failed OMP wave cannot damage unrelated specs or the Claude path.

**Требование:** [FR-5](FR.md#fr-5-w0-bounded-rollback)

**Why:** Recovery is a prerequisite for safe incremental migration, not final documentation.

**Independent Test:** @feature5 MIGRATE001_09 and MIGRATE001_10 force a disposable wave failure and compare an unrelated sentinel spec before and after rollback.

**Acceptance Scenarios:**

Given a disposable W1 fixture fails its migration gate
When the W0 runbook rollback is executed
Then only fixture and project-scope OMP state are removed and the sentinel spec bytes are unchanged

Given Claude Code is still configured for the repository
When the disposable OMP path is disabled after failure
Then the Claude plugin and its existing spec access path remain usable

### User Story 6: Use the existing MCP door from OMP (Priority: P1)

As an agent user, I want OMP to discover the existing dev-pomogator-specs server through the installed plugin, so that reads and guarded writes retain one authoritative boundary.

**Требование:** [FR-6](FR.md#fr-6-portable-mcp-door)

**Why:** A duplicate or wrong configuration path can shadow the real server and create unvalidated writes.

**Independent Test:** @feature6 MIGRATE001_11 and MIGRATE001_12 prove resolved root configuration, read_spec_doc success, and invalid mutation refusal through a fresh installed-plugin session.

**Acceptance Scenarios:**

Given a fresh OMP session has the installed root plugin
When it discovers dev-pomogator-specs through root .mcp.json
Then the server command, environment and project root resolve to the expected installed artifact

Given OMP sends an invalid apply_spec_change request
When the existing MCP door handles it
Then findings are returned and the target file remains unchanged
