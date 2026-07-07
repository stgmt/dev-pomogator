# Codex Init

This spec defines a controlled whitelist for Codex plugin support in dev-pomogator. The goal is not to convert every existing Claude Code plugin surface at once; the goal is to approve one Codex-compatible plugin surface at a time, with evidence for manifest shape, install flow, runtime behavior, and verification gates.

## Key Ideas

- Support Claude Code and Codex in parallel. Codex support must not remove or weaken existing Claude Code plugin/context-menu behavior.
- Codex plugin support is whitelist-based. A feature enters Codex plugin distribution only after its `.codex-plugin/plugin.json`, marketplace entry, hooks/MCP/skills paths, and runtime checks are proven against the real Codex CLI.
- The first whitelisted Codex plugin surface is `context-menu`: Windows right-click launch entries for Claude Code and Codex, with Codex using its own launch flags, trust/config files, and generated Nilesoft artifacts. Codex is whitelisted in non-TUI mode first; Codex+TUI remains outside this initial support boundary.

## Where Implementation Will Live

- **Codex plugin metadata**: `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`
- **Existing Claude plugin metadata**: `.Codex-plugin/plugin.json`, `.Codex-plugin/hooks.json`, `.Codex-plugin/marketplace.json`
- **First whitelisted feature**: `tools/context-menu/postinstall.ts`, `scripts/launch-Codex-tui.ps1`, `scripts/launch-claude-tui.ps1`, `.specs/context-menu/`
- **Verification**: plugin manifest checks, context-menu install drift checks, and BDD scenarios under this spec

## Current Phase

Discovery/research started on 2026-07-07. Requirements are grounded in verified local Codex CLI behavior and official OpenAI Developers plugin docs; implementation tasks remain draft until Phase 2 is finalized.

## Read Next

- [RESEARCH.md](RESEARCH.md)
- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
