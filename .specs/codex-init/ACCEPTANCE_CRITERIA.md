# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-init)

WHEN a dev-pomogator feature is presented as Codex-plugin supported THEN the repo SHALL contain a whitelist entry that records plugin name, support status, `.codex-plugin/plugin.json` path, marketplace path, runtime contract, and verification evidence.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels)

WHEN Codex plugin support is added for a feature that already has Claude Code support THEN the implementation SHALL preserve the Claude Code artifacts and verification path unless another accepted spec explicitly deprecates them.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface)

WHEN the Codex plugin support whitelist is inspected THEN its first supported feature entry SHALL be `context-menu` and SHALL link to `.specs/context-menu/` for feature-level launcher behavior. The entry SHALL NOT imply Codex+TUI support unless `.specs/context-menu/` contains explicit Codex+TUI launcher evidence.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-codex-native-packaging-contract)

WHEN a Codex plugin package is defined THEN the package SHALL use `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` for Codex-facing distribution, unless the spec cites verified Codex CLI evidence for an alternative.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-real-codex-cli-verification-gate)

WHEN a whitelist entry is marked `Supported` THEN verification SHALL prove marketplace visibility, plugin manifest validity, installed/enabled status, and relevant skills/hooks/MCP/runtime loading expectations through real Codex CLI behavior or an equivalent integration harness.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-stale-claim-rejection)

IF a Codex implementation claim conflicts with verified local Codex CLI output or official Codex documentation THEN the claim SHALL be rejected or marked drift until corrected in the source artifact.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-minimal-codex-package-scope)

WHEN the Codex manifest for the whitelisted `context-menu` plugin is inspected THEN its installable surface SHALL be limited to `context-menu` support and SHALL NOT expose the full `.claude/skills` catalog, Claude hooks, Claude rules, or Claude slash commands.
