# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-first-class-codex-platform-feature1) | First-Class Codex Platform | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-trusted-project-local-artifact-model-feature2) | Trusted Project-Local Artifact Model | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-trusted-project-local-artifact-model-feature2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-existing-project-artifact-protection-feature3) | Existing Project Artifact Protection | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-project-artifact-protection-feature3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-version-aware-codex-hook-capability-model-feature4) | Version-Aware Codex Hook Capability Model | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-version-aware-codex-hook-capability-model-feature4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-hook-orchestration-and-conflict-discipline-feature5) | Hook Orchestration and Conflict Discipline | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-hook-orchestration-and-conflict-discipline-feature5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-agents-first-guidance-and-claude-coexistence-feature6) | AGENTS-First Guidance and CLAUDE Coexistence | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-agents-first-guidance-and-claude-coexistence-feature6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-codex-skills-packaging-with-layered-discovery-feature7) | Codex Skills Packaging with Layered Discovery | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-codex-skills-packaging-with-layered-discovery-feature7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-project-level-codex-mcp-configuration-feature8) | Project-Level Codex MCP Configuration | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-project-level-codex-mcp-configuration-feature8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-extension-parity-support-matrix-feature9) | Extension Parity Support Matrix | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-extension-parity-support-matrix-feature9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-windows-execution-strategy-for-codex-feature10) | Windows Execution Strategy for Codex | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-windows-execution-strategy-for-codex-feature10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-managed-update-and-reinstall-path-feature11) | Managed Update and Reinstall Path | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-managed-update-and-reinstall-path-feature11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-explicit-codex-parity-routing-feature12) | Explicit Codex Parity Routing | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-explicit-codex-parity-routing-feature12) | @feature12 | Draft |

## BDD Suite Layout

### Core

- [features/core/codex-platform.feature](features/core/codex-platform.feature) — FR-1, FR-2, FR-10
- [features/core/codex-protection.feature](features/core/codex-protection.feature) — FR-3, FR-6
- [features/core/codex-update.feature](features/core/codex-update.feature) — FR-11
- [features/core/codex-hooks-schema.feature](features/core/codex-hooks-schema.feature) — FR-4, FR-5

### Plugins

- [features/plugins/auto-commit.feature](features/plugins/auto-commit.feature) — FR-4, FR-5, FR-9
- [features/plugins/auto-simplify.feature](features/plugins/auto-simplify.feature) — FR-4, FR-5, FR-9
- [features/plugins/claude-mem-health.feature](features/plugins/claude-mem-health.feature) — FR-4, FR-9
- [features/plugins/bun-oom-guard.feature](features/plugins/bun-oom-guard.feature) — FR-4, FR-9
- [features/plugins/suggest-rules.feature](features/plugins/suggest-rules.feature) — FR-7, FR-9, FR-12
- [features/plugins/specs-workflow.feature](features/plugins/specs-workflow.feature) — FR-8, FR-9, FR-12
- [features/plugins/prompt-suggest.feature](features/plugins/prompt-suggest.feature) — FR-4, FR-9, FR-12
- [features/plugins/tui-test-runner.feature](features/plugins/tui-test-runner.feature) — FR-4, FR-7, FR-9, FR-12
- [features/plugins/devcontainer.feature](features/plugins/devcontainer.feature) — FR-9, FR-12
- [features/plugins/forbid-root-artifacts.feature](features/plugins/forbid-root-artifacts.feature) — FR-9, FR-12
- [features/plugins/plan-pomogator.feature](features/plugins/plan-pomogator.feature) — FR-6, FR-9, FR-12
- [features/plugins/test-statusline.feature](features/plugins/test-statusline.feature) — FR-9, FR-12

## Functional Requirements

- [FR-1: First-Class Codex Platform](FR.md#fr-1-first-class-codex-platform-feature1)
- [FR-2: Trusted Project-Local Artifact Model](FR.md#fr-2-trusted-project-local-artifact-model-feature2)
- [FR-3: Existing Project Artifact Protection](FR.md#fr-3-existing-project-artifact-protection-feature3)
- [FR-4: Version-Aware Codex Hook Capability Model](FR.md#fr-4-version-aware-codex-hook-capability-model-feature4)
- [FR-5: Hook Orchestration and Conflict Discipline](FR.md#fr-5-hook-orchestration-and-conflict-discipline-feature5)
- [FR-6: AGENTS-First Guidance and CLAUDE Coexistence](FR.md#fr-6-agents-first-guidance-and-claude-coexistence-feature6)
- [FR-7: Codex Skills Packaging with Layered Discovery](FR.md#fr-7-codex-skills-packaging-with-layered-discovery-feature7)
- [FR-8: Project-Level Codex MCP Configuration](FR.md#fr-8-project-level-codex-mcp-configuration-feature8)
- [FR-9: Extension Parity Support Matrix](FR.md#fr-9-extension-parity-support-matrix-feature9)
- [FR-10: Windows Execution Strategy for Codex](FR.md#fr-10-windows-execution-strategy-for-codex-feature10)
- [FR-11: Managed Update and Reinstall Path](FR.md#fr-11-managed-update-and-reinstall-path-feature11)
- [FR-12: Explicit Codex Parity Routing](FR.md#fr-12-explicit-codex-parity-routing-feature12)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): First-Class Codex Platform](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1)
- [AC-2 (FR-2): Trusted Project-Local Artifact Model](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-trusted-project-local-artifact-model-feature2)
- [AC-3 (FR-3): Existing Project Artifact Protection](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-project-artifact-protection-feature3)
- [AC-4 (FR-4): Version-Aware Codex Hook Capability Model](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-version-aware-codex-hook-capability-model-feature4)
- [AC-5 (FR-5): Hook Orchestration and Conflict Discipline](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-hook-orchestration-and-conflict-discipline-feature5)
- [AC-6 (FR-6): AGENTS-First Guidance and CLAUDE Coexistence](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-agents-first-guidance-and-claude-coexistence-feature6)
- [AC-7 (FR-7): Codex Skills Packaging with Layered Discovery](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-codex-skills-packaging-with-layered-discovery-feature7)
- [AC-8 (FR-8): Project-Level Codex MCP Configuration](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-project-level-codex-mcp-configuration-feature8)
- [AC-9 (FR-9): Extension Parity Support Matrix](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-extension-parity-support-matrix-feature9)
- [AC-10 (FR-10): Windows Execution Strategy for Codex](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-windows-execution-strategy-for-codex-feature10)
- [AC-11 (FR-11): Managed Update and Reinstall Path](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-managed-update-and-reinstall-path-feature11)
- [AC-12 (FR-12): Explicit Codex Parity Routing](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-explicit-codex-parity-routing-feature12)

## Support Matrix Expectations

- `auto-commit`, `auto-simplify`, `claude-mem-health`, `bun-oom-guard` — кандидаты на `supported`, если hook dispatch и version floors соблюдены
- `prompt-suggest`, `suggest-rules`, `specs-workflow`, `tui-test-runner`, `plan-pomogator`, `devcontainer`, `forbid-root-artifacts` — по умолчанию `partial`, пока не доказана полная parity
- `test-statusline` — `excluded` с явной причиной
