# File Changes

| Action | Path | Reason |
|---|---|---|
| CREATE | .omp-plugin/marketplace.json | OMP-preferred root catalog; dev-pomogator source remains ./ . |
| EDIT | package.json | Declare root OMP extension entry and include runtime assets. |
| CREATE | omp-extension/index.ts | Default extension factory. |
| CREATE | omp-extension/hook-map.ts | Legacy-hook to OMP-event/result/headless-policy matrix. |
| CREATE | omp-extension/spec-tools.ts | pi.registerTool wrappers delegating to authoritative engines. |
| EDIT | .mcp.json | Adjust only if W0 installed-plugin probe proves a needed portable-config change. |
| CREATE | docs/migration-runbook.md | W0 rollback contract and preservation proof. |
| CREATE | docker/omp.Dockerfile | Disposable OMP plus Node test runtime. |
| CREATE | docker-compose.omp-test.yml | Isolated OMP test service and fixtures. |
| EDIT | cucumber.json | Register migration feature, steps and lifecycle hook. |
| EDIT | scripts/docker-bdd.sh | Select migration Docker profile without changing shared suite behavior. |
| CREATE | tests/features/omp/migrate-to-omp.feature | Executable mirror of canonical migration scenarios. |
| CREATE | tests/step_definitions/omp_migration.ts | Real install, activation, registry, MCP, guard and rollback assertions. |
| CREATE | tests/hooks/omp-migration.ts | @migrate-to-omp fixture lifecycle without shared corpus reset. |
| EDIT | .claude-plugin/marketplace.json | Keep Claude-compatible catalog aligned with OMP root catalog. |

## Verification Targets

- Resolved root after disposable project-scope installation.
- Extension tools, mapped hooks and headless behavior.
- Existing .mcp.json Node command/environment after installed-plugin discovery.
- Rollback preserves unrelated spec bytes and removes only fixture state.
