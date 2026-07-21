# Functional Requirements (FR)

> context-mode integration for dev-pomogator: SessionStart-safe setup guidance, optional MCP-only auto config, doctor classification, live MCP recovery, safe hook degradation, and Windows/worktree usage guidance. Reference pattern: claude-mem bootstrap/health contracts, adapted to context-mode's plugin install constraints.

## FR-1: Setup decision and install guidance @feature1

The SessionStart setup component SHALL return an explicit decision status without launching interactive Claude Code commands from shell. It SHALL report `INSTALL_MISSING` with exact user instructions when context-mode is absent, `PLUGIN_REGISTERED` when `enabledPlugins["context-mode@context-mode"] === true`, `MCP_ONLY_CONFIGURED` when the MCP-only path is active, `SKIP_OPTOUT` when `DEV_POMOGATOR_CONTEXT_MODE=off`, and `SKIP_BACKOFF` when a fresh retry lock exists. It SHALL never claim a successful install from malformed JSON or missing plugin evidence.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

## FR-2: MCP-only auto config @feature2

When full `/plugin` installation is unavailable or intentionally avoided, dev-pomogator MAY configure a documented MCP-only mode that registers the context-mode MCP server without global slash commands or advisory hooks. The mode SHALL be opt-in or explicitly selected by policy, SHALL back up any modified Claude global settings, and SHALL preserve unrelated user hooks and MCP servers.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## FR-3: Idempotency, backoff, and opt-out @feature3

Setup and repair hooks SHALL be idempotent, fail-open, and builtins-only in the shipped hook path. They SHALL use one home root consistently per run, SHALL respect `DEV_POMOGATOR_CONTEXT_MODE=off`, SHALL stamp a retry lock before any slow or network-dependent action, and SHALL suppress repeat repair/install guidance for the configured backoff window.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

## FR-4: Doctor classification @feature4

`pomogator-doctor` SHALL include a context-mode check that distinguishes at least `OK`, `INSTALL_MISSING`, `CONFIG_POISONED`, `MCP_ONLY_CONFIGURED`, `MCP_DEAD_IN_SESSION`, `HANDSHAKE_FAILED`, and `HOOK_UNSAFE`. The check SHALL use real-shaped artifacts: `installed_plugins.json`, plugin manifest command, live process evidence, and a JSON-RPC initialize handshake where possible.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## FR-5: Live recovery runbook @feature5

For `MCP_DEAD_IN_SESSION`, doctor output and docs SHALL recommend live `/mcp` reconnect before full session restart. The runbook SHALL first run or suggest the idempotent plugin heal step, then reconnect context-mode through `/mcp`, then verify handshake/tool availability. Full session restart SHALL be documented as the last resort only.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

## FR-6: Hook safe degradation @feature6

Any dev-pomogator-shipped context-mode guidance or hook SHALL fail open when `ctx_*` tools are unavailable. It SHALL not deny Bash/curl/WebFetch/Read/Grep and point to dead tools. It SHALL emit either no output or a concise recovery hint that names the unavailable MCP and the `/mcp` reconnect path.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

## FR-7: Optional force-ctx policy @feature7

If dev-pomogator ships a force-ctx hook, it SHALL be selective, kill-switchable, and read-to-edit safe. It MAY redirect generated data, large logs, minified files, maps, build output, and lockfiles. It SHALL pass source files, markdown/spec files under active authoring, and config files needed for edits. Its deny reason SHALL use CASE-A wording that says context-mode has full access and names the correct ctx tool.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

## FR-8: Windows and worktree guidance @feature8

Docs and doctor guidance SHALL encode the known Windows/worktree frictions: `language: shell` means bash rather than PowerShell, PowerShell must be invoked explicitly with `pwsh -NoProfile`, `ctx_execute_file` is project-root confined, external worktree/log paths should use `ctx_batch_execute`, and compound shell commands may need `bash -c` wrapping.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

## FR-9: Honest value boundary @feature9

User-facing docs SHALL state that context-mode is valuable for derive-over-large-data, large raw artifacts, and session survival, but it is not universal cost reduction for disciplined grep/pipe agents and does not automatically translate token trimming into realized subscription-dollar savings. The docs SHALL avoid `-99% daily usage` style claims unless a measured workflow-specific baseline supports them.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
