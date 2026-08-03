# Functional Requirements (FR)

## FR-1: Init

The repo SHALL define a Codex plugin support whitelist that records which dev-pomogator plugin surfaces are supported in Codex. A feature SHALL NOT be described as Codex-plugin supported unless it has an explicit whitelist entry with status, manifest path, marketplace path, runtime contract, and verification evidence.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-add-a-codex-plugin-surface-to-the-whitelist)

## FR-2: Parallel Claude Code and Codex Channels

Codex plugin support SHALL be added beside existing Claude Code support. Codex metadata, launch scripts, hook/MCP assumptions, and generated artifacts SHALL NOT replace, delete, or silently weaken existing Claude Code plugin/context-menu behavior.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-preserve-existing-claude-code-support)

## FR-3: Context Menu as First Whitelisted Codex Plugin Surface

The first whitelist entry SHALL be `context-menu`. This spec SHALL own the Codex plugin whitelist gate for that entry, while `.specs/context-menu/` SHALL remain the owner of detailed Windows Explorer, Nilesoft Shell, launch script, privilege, and logging behavior. Initial whitelist support SHALL cover the Codex non-TUI context-menu launch path only; Codex+TUI requires a later whitelist update with separate launcher evidence.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-first-whitelist-entry-is-context-menu)

## FR-4: Codex-Native Packaging Contract

Every supported Codex whitelist entry SHALL define Codex-native packaging artifacts using lowercase `.codex-plugin/plugin.json` and a Codex marketplace entry under `.agents/plugins/marketplace.json`, unless a later verified Codex CLI contract proves a different path. Historical `.Codex-plugin/` or `.claude-plugin/` artifacts SHALL NOT be treated as Codex-native without evidence.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-reject-stale-claude-to-codex-assumptions)

## FR-5: Real Codex CLI Verification Gate

A whitelist entry SHALL NOT move to `Supported` until verification uses the real Codex CLI or an equivalent integration harness to prove marketplace visibility, plugin manifest validity, installed/enabled state, and runtime expectations for skills/hooks/MCP/scripts used by the entry.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5), [AC-5.1](ACCEPTANCE_CRITERIA.md#ac-51)
**Use Case:** [UC-5](USE_CASES.md#uc-5-verify-plugin-install-and-runtime-load)

## FR-6: Stale Claim Rejection

The whitelist SHALL reject stale Claude-to-Codex assumptions, including Codex launch flags or plugin commands copied from Claude documentation. Any Codex behavior used by an implementation SHALL be backed by local CLI output, official Codex documentation, or a committed integration fixture generated from a real Codex run.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-reject-stale-claude-to-codex-assumptions)

## FR-7: Minimal Codex Package Scope

The `context-menu` Codex plugin package SHALL expose only the Codex-supported context-menu surface. Its Codex manifest SHALL NOT point at the full Claude skill catalog, Claude hooks, Claude rules, Claude slash commands, or any unrelated dev-pomogator surface. If a skill surface is shipped for operator help, it SHALL be scoped to the context-menu skill only.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-3](USE_CASES.md#uc-3-first-whitelist-entry-is-context-menu)
