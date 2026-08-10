# Codex Init

This spec defines a controlled whitelist for Codex plugin support in dev-pomogator. The goal is not to convert every existing Claude Code plugin surface at once; the goal is to approve one Codex-compatible plugin surface at a time, with evidence for manifest shape, install flow, runtime behavior, and verification gates.

## Key Ideas

- Support Claude Code and Codex in parallel. Codex support must not remove or weaken existing Claude Code plugin/context-menu behavior.
- Codex plugin support is whitelist-based. A feature enters Codex plugin distribution only after its `.codex-plugin/plugin.json`, marketplace entry, hooks/MCP/skills paths, and runtime checks are proven against the real Codex CLI.
- The first whitelisted Codex plugin surface is `context-menu`: Windows right-click launch entries for Claude Code and Codex, with Codex using its own launch flags, trust/config files, and generated Nilesoft artifacts. Codex is whitelisted in non-TUI mode first; Codex+TUI remains outside this initial support boundary.
- The second entry is a separately installable full `spec-generator-v4` plugin with its own source and manifest reference. This spec owns only distribution order/status/evidence; qualified requirement `spec-generator-v4:FR-83` owns all full-plugin runtime behavior.

## Where Implementation Will Live

- **Codex plugin metadata**: `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`
- **Existing Claude plugin metadata**: `.Codex-plugin/plugin.json`, `.Codex-plugin/hooks.json`, `.Codex-plugin/marketplace.json`
- **First whitelisted feature**: `tools/context-menu/postinstall.ts`, `scripts/launch-Codex-tui.ps1`, `scripts/launch-claude-tui.ps1`, `.specs/context-menu/`
- **Second distribution entry**: `spec-generator-v4` record in `.agents/plugins/marketplace.json`; its full plugin files remain owned by main spec requirement 83
- **Verification**: plugin manifest checks, context-menu install drift checks, ordered-entry/evidence-gate checks, and BDD scenarios under this spec

## Current Phase

Discovery/research started on 2026-07-07. On 2026-08-10 the spec added the second-entry distribution boundary only. FR-8 implementation and verification tasks remain `TODO`; the Docker BDD scenario, full plugin install, and Codex Desktop runtime probe were not run, so the second entry is not `Supported`.

## Read Next

- [RESEARCH.md](RESEARCH.md)
- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
