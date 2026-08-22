# Research

## Context

The target is a root-installed dev-pomogator marketplace plugin for OMP. Existing SpecGraph, MCP door, verdict, evidence and BDD engines remain authoritative; OMP adapters delegate to them. Test cleanup must never mutate a user's shared .specs corpus.

## Hypotheses and evidence

| ID | Statement | Status | Evidence |
|---|---|---|---|
| H1 | OMP can install the repository-root plugin through a root catalog with relative source ./ . | [NEEDS_CONFIRMATION] | OMP marketplace docs describe root .omp-plugin/marketplace.json or .claude-plugin/marketplace.json and relative source resolution; fresh install still required. |
| H2 | Guard semantics must use extension/hook factories and pi.on event handlers. | [NEEDS_CONFIRMATION] | OMP hooks docs require a default factory and typed handler results; per-hook probes still required. |
| H3 | Narrow agent-facing wrappers can use one extension with pi.registerTool. | [NEEDS_CONFIRMATION] | OMP extensions/custom-tools docs require factories; W0 compile and invocation still required. |
| H4 | Existing root .mcp.json can remain a portable manifest through installed-plugin discovery. | [NEEDS_CONFIRMATION] | OMP MCP docs support root .mcp.json fallback and plugin discovery; a fresh installed-plugin request is still required. |

## Technical findings

### Marketplace topology

[NEEDS_CONFIRMATION: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/marketplace.md] The existing Claude-compatible marketplace catalog names dev-pomogator with source ./ . OMP recognizes a root .omp-plugin/marketplace.json as the preferred equivalent. The migration therefore uses one repository-root plugin source and must not create a nested omp-plugin package that the root catalog cannot select.

Marketplace install does not activate every capability in the current session. W0 proves install, reload for skills/MCP, fresh session for extension/hooks/tools, and an actual capability call.

### Hook and tool contracts

[NEEDS_CONFIRMATION: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md] Hook modules default-export factories and register pi.on handlers. tool_call returns block/reason/input data and tool_result returns content/details data. No adapter may assume ctx.block, ctx.confirm, or ctx.rewrite.

[NEEDS_CONFIRMATION: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md; https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/custom-tools.md] The selected surface is a root extension factory. It owns pi.on registrations and pi.registerTool wrappers but does not reimplement graph, MCP, conformance, or verdict logic.

### MCP boundary

[NEEDS_CONFIRMATION: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/mcp-config.md] OMP supports native .omp/mcp.json and portable root .mcp.json. dev-pomogator currently launches its MCP server from root .mcp.json through Node and tools/mcp-stdio-launcher.mjs. W0 keeps that portable route unless an installed-plugin probe proves a necessary replacement; duplicate server names are forbidden before precedence is tested.

## Proof of Concept

**PoC Required:** yes

- Producer: local OMP binary.
- Capture date: 2026-08-22.
- Commands: omp --version; omp plugin --help.
- Observed output: omp/17.3.7; plugin actions include install, marketplace, enable, disable, link, doctor, discover, and upgrade.
- Upstream reference: can1357/oh-my-pi HEAD resolved to 4324de2c60d810ef19d4775a94dd194e57e6e33e on 2026-08-22; binary/source equality is not asserted.
- Missing proof: disposable project-scope install, reload, fresh session, loaded extension, registered tool call, and dev-pomogator-specs MCP probe.

**Verdict:** PARTIAL

## Cost Estimate

**Runtime/CI:** one disposable OMP image/session per migration BDD feature; Node remains available for the existing MCP launcher and bundle.

**Maintenance:** pin and refresh the tested OMP revision; maintain one legacy-hook to OMP-event matrix and installed-plugin probes. Do not fork the authoritative spec engines.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OMP API drift invalidates an adapter. | Medium | High | Pin the tested revision and compile/invoke the root extension in W0. |
| Marketplace install loads the old root but not adapters. | Medium | High | Use one root source and assert loaded root plus a registered tool after restart. |
| Rollback changes unrelated specs. | Medium | High | Use a disposable fixture root, path allowlist, and sentinel byte comparison. |
| Node MCP dependencies fail under OMP delivery. | Medium | High | Declare the Node launch boundary and test resolved command, environment and server request. |

## Project Context & Constraints

- App engines: tools/spec-graph, tools/spec-mcp-server, tools/specs-generator.
- Existing distribution: root .claude-plugin manifest and root .mcp.json.
- Migration BDD is Docker-only; no host Cucumber result is acceptance evidence.

### Relevant Rules

- no-host-bdd-runs: migration BDD executes only through Docker.
- dead-integration-guard: installation proof requires a real runtime consumer.
- verify-against-real-artifact: OMP runtime and MCP captures come from the real fixture.

### Existing Patterns

- Root .claude-plugin manifest and root .mcp.json are the existing distribution and MCP boundaries.
- tools/spec-graph, tools/spec-mcp-server and tools/specs-generator remain the authoritative engines.

### Architectural Constraints

- OMP extension factories must not duplicate the graph or mutation door.
- The migration fixture may not reset shared .specs or user OMP state.
