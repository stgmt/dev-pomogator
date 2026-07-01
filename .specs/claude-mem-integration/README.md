# claude-mem-integration (v2)

dev-pomogator bootstraps the **claude-mem** plugin (persistent memory across sessions) automatically, and the pomogator-doctor detects it.

## Why v2

The v1 installer (`src/installer/`) that set claude-mem up was deleted in the canonical plugin refactor (commit `43cf9462`) with no replacement, so on a fresh machine claude-mem was never installed. This spec covers the v2 replacement.

## What it does

- **SessionStart hook** `tools/claude-mem-bootstrap/install-claude-mem.ts` — if claude-mem is not installed, fires `npx -y claude-mem install` with non-interactive defaults (provider=claude, model Haiku 4.5, runtime=worker, IDE=claude-code, telemetry off) DETACHED, once (lock-backed, opt-out via `DEV_POMOGATOR_CLAUDE_MEM=off`). Builtins-only, fail-open.
- **Doctor** — `C-CMEM` reports whether claude-mem is installed; `C11` now reads the canonical `~/.claude.json`.

claude-mem's MCP (`plugin_claude-mem_mcp-search`) ships with the plugin itself.

## Verify

`claude-mem-integration.feature` (CMEM001_01..11) — pure decision, hook command/idempotency/fail-open, doctor checks. Run via the Docker BDD suite.
