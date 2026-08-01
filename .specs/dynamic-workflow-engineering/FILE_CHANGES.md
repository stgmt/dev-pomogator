# File Changes

Planned implementation surface. Existing paths use `edit`; planned paths use `create`.

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/dynamic-workflow-engineering/SKILL.md` | create | Ship bounded Workflow guidance [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) |
| `.claude/skills/spec-status/SKILL.md` | edit | Migrate verifier to Workflow contract [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `.claude/skills/tests-create-update/SKILL.md` | edit | Migrate reconnaissance to Workflow [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `.claude/skills/spec-review/SKILL.md` | edit | Bound semantic delegation [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/strong-tests/SKILL.md` | edit | Contract batch and test-author operations [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/skills-rules-optimizer/SKILL.md` | edit | Contract synthesis and scorer operations [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/bdd-migrator/SKILL.md` | edit | Preserve sequential per-spec migration [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) |
| `tools/dynamic-workflow-engineering/contracts.json` | create | Versioned consumer contracts [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tools/dynamic-workflow-engineering/policy.ts` | create | Admission budgets circuit audit and tier logic [FR-1](FR.md#fr-1-workflow-only-delegation-gate) |
| `tools/dynamic-workflow-engineering/guard.ts` | create | Protected pre-spawn adapter [FR-1](FR.md#fr-1-workflow-only-delegation-gate) |
| `tools/dynamic-workflow-engineering/monitor.ts` | create | Journal accounting and classification [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring) |
| `tools/dynamic-workflow-engineering/guard.bundle.mjs` | create | Dependency-safe installed runtime if PoC selects bundling [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `.claude-plugin/hooks.legacy.json` | edit | Author defense-in-depth wiring [FR-1](FR.md#fr-1-workflow-only-delegation-gate) |
| `.claude-plugin/hooks.json` | edit | Regenerated distributed hooks [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `.claude/settings.json` | edit | Regenerated dogfood hooks [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/hook-service/registry.json` | edit | Regenerated route inventory [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/hook-service/server.mjs` | edit | Protected authorization if trusted origin reaches server [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/hook-service/client.mjs` | edit | Isolate fail-closed protected path [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/hook-service/generate-registry.mjs` | edit | Carry policy metadata through generation [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/hook-service/generate-manifest.mjs` | edit | Keep generated manifests synchronized [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `.claude-plugin/plugin.json` | edit | Verify any workflow/runtime declaration in one plugin [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) |
| `package.json` | edit | Build lint assets and deps-absent wiring [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tests/features/core/dynamic-workflow-engineering.feature` | create | Executable policy regressions [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/step_definitions/feature_dynamic_workflow_engineering.ts` | create | Integration steps [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | create | Policy edge fixtures [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tests/fixtures/dynamic-workflow-engineering/journals/incident-1.jsonl` | create | Inventory/barrier regression [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/fixtures/dynamic-workflow-engineering/journals/incident-2.jsonl` | create | Partial useful review regression [FR-13](FR.md#fr-13-dogfood-regression-contract) |
