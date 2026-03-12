# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-first-class-codex-platform-feature1) | First-Class Codex Platform | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-project-level-codex-artifact-layout-feature2) | Project-Level Codex Artifact Layout | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-project-level-codex-artifact-layout-feature2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-existing-user-artifact-protection-feature3) | Existing User Artifact Protection | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-user-artifact-protection-feature3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-codex-hooks-installation-feature4) | Codex Hooks Installation | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-codex-hooks-installation-feature4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-agentsmd-and-claudemd-coexistence-feature5) | AGENTS.md and CLAUDE.md Coexistence | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-agentsmd-and-claudemd-coexistence-feature5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-codex-skills-packaging-feature6) | Codex Skills Packaging | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-codex-skills-packaging-feature6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-project-level-codex-mcp-configuration-feature7) | Project-Level Codex MCP Configuration | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-project-level-codex-mcp-configuration-feature7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-extension-parity-support-matrix-feature8) | Extension Parity Support Matrix | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-parity-support-matrix-feature8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-windows-bashsh-bootstrap-for-codex-feature9) | Windows Bash/SH Bootstrap for Codex | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-windows-bashsh-bootstrap-for-codex-feature9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-managed-update-and-reinstall-path-feature10) | Managed Update and Reinstall Path | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-managed-update-and-reinstall-path-feature10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-explicit-codex-parity-routing-feature11) | Explicit Codex Parity Routing | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-explicit-codex-parity-routing-feature11) | @feature11 | Draft |

## BDD Suite Layout

### Core

- [features/core/codex-platform.feature](features/core/codex-platform.feature) — FR-1, FR-2, FR-9
- [features/core/codex-protection.feature](features/core/codex-protection.feature) — FR-3, FR-5
- [features/core/codex-update.feature](features/core/codex-update.feature) — FR-10
- [features/core/codex-hooks-schema.feature](features/core/codex-hooks-schema.feature) — FR-4

### Plugins

- [features/plugins/auto-commit.feature](features/plugins/auto-commit.feature) — FR-4, FR-8
- [features/plugins/auto-simplify.feature](features/plugins/auto-simplify.feature) — FR-4, FR-8
- [features/plugins/claude-mem-health.feature](features/plugins/claude-mem-health.feature) — FR-4, FR-8
- [features/plugins/bun-oom-guard.feature](features/plugins/bun-oom-guard.feature) — FR-4, FR-8
- [features/plugins/suggest-rules.feature](features/plugins/suggest-rules.feature) — FR-6, FR-8, FR-11
- [features/plugins/specs-workflow.feature](features/plugins/specs-workflow.feature) — FR-7, FR-8, FR-11
- [features/plugins/prompt-suggest.feature](features/plugins/prompt-suggest.feature) — FR-11
- [features/plugins/tui-test-runner.feature](features/plugins/tui-test-runner.feature) — FR-6, FR-8, FR-11
- [features/plugins/devcontainer.feature](features/plugins/devcontainer.feature) — FR-8, FR-11
- [features/plugins/forbid-root-artifacts.feature](features/plugins/forbid-root-artifacts.feature) — FR-8, FR-11
- [features/plugins/plan-pomogator.feature](features/plugins/plan-pomogator.feature) — FR-8, FR-11
- [features/plugins/test-statusline.feature](features/plugins/test-statusline.feature) — FR-8

## Functional Requirements

- [FR-1: First-Class Codex Platform](FR.md#fr-1-first-class-codex-platform-feature1)
- [FR-2: Project-Level Codex Artifact Layout](FR.md#fr-2-project-level-codex-artifact-layout-feature2)
- [FR-3: Existing User Artifact Protection](FR.md#fr-3-existing-user-artifact-protection-feature3)
- [FR-4: Codex Hooks Installation](FR.md#fr-4-codex-hooks-installation-feature4)
- [FR-5: AGENTS.md and CLAUDE.md Coexistence](FR.md#fr-5-agentsmd-and-claudemd-coexistence-feature5)
- [FR-6: Codex Skills Packaging](FR.md#fr-6-codex-skills-packaging-feature6)
- [FR-7: Project-Level Codex MCP Configuration](FR.md#fr-7-project-level-codex-mcp-configuration-feature7)
- [FR-8: Extension Parity Support Matrix](FR.md#fr-8-extension-parity-support-matrix-feature8)
- [FR-9: Windows Bash/SH Bootstrap for Codex](FR.md#fr-9-windows-bashsh-bootstrap-for-codex-feature9)
- [FR-10: Managed Update and Reinstall Path](FR.md#fr-10-managed-update-and-reinstall-path-feature10)
- [FR-11: Explicit Codex Parity Routing](FR.md#fr-11-explicit-codex-parity-routing-feature11)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): First-Class Codex Platform](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1)
- [AC-2 (FR-2): Project-Level Codex Artifact Layout](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-project-level-codex-artifact-layout-feature2)
- [AC-3 (FR-3): Existing User Artifact Protection](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-user-artifact-protection-feature3)
- [AC-4 (FR-4): Codex Hooks Installation](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-codex-hooks-installation-feature4)
- [AC-5 (FR-5): AGENTS.md and CLAUDE.md Coexistence](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-agentsmd-and-claudemd-coexistence-feature5)
- [AC-6 (FR-6): Codex Skills Packaging](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-codex-skills-packaging-feature6)
- [AC-7 (FR-7): Project-Level Codex MCP Configuration](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-project-level-codex-mcp-configuration-feature7)
- [AC-8 (FR-8): Extension Parity Support Matrix](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-parity-support-matrix-feature8)
- [AC-9 (FR-9): Windows Bash/SH Bootstrap for Codex](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-windows-bashsh-bootstrap-for-codex-feature9)
- [AC-10 (FR-10): Managed Update and Reinstall Path](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-managed-update-and-reinstall-path-feature10)
- [AC-11 (FR-11): Explicit Codex Parity Routing](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-explicit-codex-parity-routing-feature11)
