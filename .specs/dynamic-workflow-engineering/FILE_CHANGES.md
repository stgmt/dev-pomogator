# File Changes

Planned implementation surface only. This specification-only consolidation does not modify any listed production, test, manifest, or fixture path. Existing paths use `edit`; planned paths use `create`. All rows remain TODO-owned by the corresponding DWE task.

| Path | Action | Owner task | Reason |
|------|--------|------------|--------|
| `.claude/skills/dynamic-workflow-engineering/SKILL.md` | create | DWE-T03 | Bundle bounded Workflow guidance and deterministic steering [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) |
| `tools/dynamic-workflow-engineering/packet.ts` | create | DWE-T02 | Finite packet schema, scopes, work packages, ownership, dependencies, barriers, stop states [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `tools/dynamic-workflow-engineering/contracts.json` | create | DWE-T05 | Versioned runtime-issued consumer contracts and plugin-root skill binding [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tools/dynamic-workflow-engineering/admission.ts` | create | DWE-T05 | Hard pre-run packet admission and deterministic reason codes [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tools/dynamic-workflow-engineering/collectors.ts` | create | DWE-T04 | Deterministic finite collectors before model loops [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) |
| `tools/dynamic-workflow-engineering/spec-generator-inventory-adapter.ts` | create | DWE-T04 | Bounded SpecGraph MCP inventory/phase/search adapter using FR-82 contracts [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) |
| `tools/dynamic-workflow-engineering/serial-phase-runner-adapter.ts` | create | DWE-T04 | Authoritative serial phases, explicit non-zero child failure, bounded unchanged retry [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tools/dynamic-workflow-engineering/retry-circuit.ts` | create | DWE-T06 | One materially changed/narrowed retry and circuit-break rules [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker) |
| `tools/dynamic-workflow-engineering/monitor.ts` | create | DWE-T06 | Journal-backed FACT/INFERENCE/UNKNOWN/ACTION monitoring [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring) |
| `tools/dynamic-workflow-engineering/partial-results.ts` | create | DWE-T07 | Partial-result conservation, barrier policy, all-mandatory-branch completeness [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) |
| `tools/dynamic-workflow-engineering/verifier.ts` | create | DWE-T07 | Bounded adversarial verification without rediscovery [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery) |
| `tools/dynamic-workflow-engineering/journal.ts` | create | DWE-T08 | Redacted append-only logical/physical journal [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) |
| `tools/dynamic-workflow-engineering/replay-exporter.ts` | create | DWE-T08 | Offline replay/export, compatible resume, and `REPLAY_UNAVAILABLE` [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) |
| `tools/dynamic-workflow-engineering/agent-policy.ts` | create | DWE-T05 | Conditional protected native-Agent policy, provenance, redaction, and route isolation [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/dynamic-workflow-engineering/capability-matrix.ts` | create | DWE-T01 | Real-host capability matrix and ENFORCED/STEERING_ONLY/UNAVAILABLE classifier [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/dynamic-workflow-engineering/consumer-census.ts` | create | DWE-T11 | Deterministic native-Agent consumer census after runtime/pilot, including architecture-decision-builder [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tools/dynamic-workflow-engineering/incident-exporter.ts` | create | DWE-T08 | Export real journal/transcript provenance for `wf_0315d03b-28` [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) |
| `.claude-plugin/hooks.legacy.json` | edit | DWE-T09 | Conditional protected hook authoring only after real pre-spawn proof [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `.claude-plugin/hooks.json` | edit | DWE-T09 | Generated conditional distributed hook wiring [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `.claude/settings.json` | edit | DWE-T09 | Generated dogfood hook wiring without altering unrelated routes [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/hook-service/registry.json` | edit | DWE-T09 | Generated conditional route inventory [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/hook-service/server.mjs` | edit | DWE-T09 | Protected route integration only after capability proof [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/hook-service/client.mjs` | edit | DWE-T09 | Protected route failure semantics and redacted audit handoff [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) |
| `tools/hook-service/generate-registry.mjs` | edit | DWE-T09 | Generate conditional hook/route metadata [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/hook-service/generate-manifest.mjs` | edit | DWE-T09 | Keep generated manifest parity [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `.claude-plugin/plugin.json` | edit | DWE-T03 | Bundle skill and dependency-safe runtime; no assumed `.claude/workflows/` distribution [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) |
| `package.json` | edit | DWE-T03 | Build/bundle and dependency-absent launcher wiring [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) |
| `tests/features/core/dynamic-workflow-engineering.feature` | create | DWE-T02 | Executable BDD paths for DWE001_01..13 [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/step_definitions/feature_dynamic_workflow_engineering.ts` | create | DWE-T02 | Integration step definitions for real runtime/adapter paths [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/fixtures/dynamic-workflow-engineering/consumer-contracts.json` | create | DWE-T02 | Valid, forged, stale, widened, expired, and budget contract fixtures [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tests/fixtures/dynamic-workflow-engineering/journals/incident-1.jsonl` | create | DWE-T08 | Real-producer-shaped finite inventory journal, not invented positive fields [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/fixtures/dynamic-workflow-engineering/journals/incident-2.jsonl` | create | DWE-T08 | Real-producer-shaped partial useful review journal [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) |
| `tests/fixtures/dynamic-workflow-engineering/capability-matrix/` | create | DWE-T01 | Real-host capability evidence fixtures and lower-tier paths [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tests/fixtures/dynamic-workflow-engineering/replay/` | create | DWE-T08 | Journal/exporter compatibility, missing producer proof, and offline replay fixtures [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) |
| `audit-reports/wf-0315d03b-28f-mcp-incident.json` | edit/create | DWE-T08 | Real incident manifest with six attempts, 695 calls, 5,459,786 bytes, GitHub completion, zero spec structured outputs, and producer references [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `.claude/skills/spec-status/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after runtime/pilot and census [FR-1](FR.md#fr-1-workflow-only-delegation-gate) |
| `.claude/skills/tests-create-update/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after census [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `.claude/skills/spec-review/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after census [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/strong-tests/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after census [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/skills-rules-optimizer/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after census [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `.claude/skills/bdd-migrator/SKILL.md` | edit | DWE-T12 | Migrate direct Agent consumer after census [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) |
| `.claude/skills/architecture-decision-builder/SKILL.md` | edit | DWE-T12 | Known prior omission: census and migration must explicitly cover this consumer [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `.specs/spec-generator-v4/FR.md` | edit | DWE-T12 | Retain FR-82 prerequisite and add only prose dependency/reference to this canonical DWE spec; remove duplicate FR-83 [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | DWE-T12 | Remove duplicate AC-83 rows; retain AC-82 and cross-spec dependency prose only |
| `.specs/spec-generator-v4/TASKS.md` | edit | DWE-T12 | Remove duplicate Phase 48/FR-83 tasks; retain FR-82 tasks and reference DWE-T01..DWE-T13 as external owner |
| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | DWE-T12 | Remove duplicate @feature83/SPECGEN004_678..683 scenarios; retain @feature82 scenarios |
| `.specs/spec-generator-v4/DESIGN.md` | edit | DWE-T12 | Remove duplicate Dynamic Workflow decision/design package; retain bounded FR-82 prerequisite and prose dependency |
| `.specs/spec-generator-v4/NFR.md` | edit | DWE-T12 | Remove duplicate FR-83 NFR rows; retain FR-82 NFRs and dependency reference |
| `.specs/spec-generator-v4/FILE_CHANGES.md` | edit | DWE-T12 | Remove duplicate Dynamic Workflow implementation rows; retain FR-82 rows and prose link to canonical DWE owner |
| `.specs/spec-generator-v4/USER_STORIES.md` | edit | DWE-T12 | Remove duplicate Story 63; retain Story 62 and canonical owner reference |
| `.specs/spec-generator-v4/USE_CASES.md` | edit | DWE-T12 | Remove duplicate UC-35; retain UC-34 and canonical owner reference |
| `.specs/spec-generator-v4/RESEARCH.md` | edit | DWE-T12 | Downgrade unproven host/external numeric claims and cite canonical DWE dependency |
| `.specs/spec-generator-v4/README.md` | edit | DWE-T12 | Remove FR-83 implementation package references; document FR-82 prerequisite dependency |

## Second dogfood planned harness files

These are planned implementation surfaces only. No path below is created or modified by this specification-only update. Every row remains TODO-owned; the second incident is user-supplied and unverified for this repository.

| Path | Action | Owner task | Reason |
|---|---|---|---|
| `tools/dynamic-workflow-engineering/root-preflight.ts` | create | DWE-T02 | Normalize expectedRoot and compare it with actual git top-level before first work action; deny mismatch [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tools/dynamic-workflow-engineering/process-group.ts` | create | DWE-T06 | Windows Job Object/Unix process-group ownership and descendant/writer scan for terminal stop [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker) |
| `tools/dynamic-workflow-engineering/ownership-locks.ts` | create | DWE-T05 | CAS owner state, checkout-writer lock, shared-runtime lease, and central ownership census [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `tools/dynamic-workflow-engineering/run-state.ts` | create | DWE-T05 | CREATED through DONE state machine, proof phase, owner PID/task, baseline/plan freeze, and APPLY gates [FR-4](FR.md#fr-4-bounded-workflow-admission) |
| `tools/dynamic-workflow-engineering/captured-process.ts` | create | DWE-T04 | argv-array runner with UTF-8 stdout/stderr/evidence, native exit code, atomic JSON, and failure diagnostics [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) |
| `tools/dynamic-workflow-engineering/transactional-mutation.ts` | create | DWE-T07 | Baseline hashes, staged/quarantined mutation, rollback, and unproven-applied collections [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) |
| `tools/dynamic-workflow-engineering/recovery-capsule.ts` | create | DWE-T06 | 1–3 KiB bounded recovery capsule and TERMINATED_NO_RESUME continuation policy [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker) |
| `tools/dynamic-workflow-engineering/run-observability.ts` | create | DWE-T08 | Per-run journal/status correlation, monotonic seq, owner inheritance, stale-run filtering, and lifecycle metrics [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring) |
| `tools/dynamic-workflow-engineering/resource-lease.ts` | create | DWE-T10 | Run/worktree-derived resource identity, labels, ownership/mount validation, and non-destructive foreign-resource handling [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) |
| `tools/dynamic-workflow-engineering/schemas/run-state.schema.json` | create | DWE-T02 | Normative packet/run identity, proof phase, typed result collections, and terminal evidence schema [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) |
| `tools/dynamic-workflow-engineering/schemas/captured-process.schema.json` | create | DWE-T04 | Typed process result, diagnostics, native exit code, and evidence references [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) |
| `tools/dynamic-workflow-engineering/schemas/recovery-capsule.schema.json` | create | DWE-T06 | Bounded recovery fields, do-not-touch paths, and resume state [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) |
| `tests/fixtures/dynamic-workflow-engineering/second-incident/PROVENANCE.md` | create | DWE-T13 | Provenance-only fixture plan naming required original artifacts; contains no invented run-state, journal, process, lease, mount, or producer data [FR-13](FR.md#fr-13-dogfood-regression-contract) |
| `tests/fixtures/dynamic-workflow-engineering/second-incident/` | create | DWE-T13 | Quarantine boundary for future authoritative replay inputs; remains REPLAY_UNAVAILABLE until supplied and independently read back [FR-13](FR.md#fr-13-dogfood-regression-contract) |
