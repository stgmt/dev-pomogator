# Functional Requirements (FR)

> v2 rewrite (2026-06-24). The v1 installer (`src/installer/`) that set claude-mem up was deleted in the canonical plugin refactor (commit `43cf9462`) with no replacement. These FRs describe the v2 replacement: a non-interactive SessionStart bootstrap hook (`tools/claude-mem-bootstrap/`) plus pomogator-doctor detection. claude-mem's own MCP (`plugin_claude-mem_mcp-search`) ships with the plugin.

## FR-1: Bootstrap decision @feature1

The bootstrap MUST decide to install claude-mem ONLY when it is not already installed, not opted out, and not within the retry backoff window. The decision is a pure function `claudeMemBootstrapDecision({installed, optOut, lockFresh})` evaluated in order opt-out then installed then backoff then install, returning one of `install` / `skip-installed` / `skip-optout` / `skip-backoff`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)

## FR-2: Non-interactive install command @feature2

When the decision is `install`, the hook MUST invoke the official installer non-interactively with the dev-pomogator defaults: `npx -y claude-mem install --ide claude-code --provider claude --model claude-haiku-4-5-20251001 --runtime worker`, with env `DO_NOT_TRACK=1`, `CI=1`, `CLAUDE_MEM_ONLINE_OPTIN=false`, spawned WITHOUT a TTY (detached). On Windows the command is wrapped as `cmd /c npx ...`. These flags plus env plus non-TTY suppress every interactive prompt (verified against thedotmack/claude-mem@13.8.0 `src/npx-cli`).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)

## FR-3: Idempotency and backoff @feature3

The hook MUST be a no-op when claude-mem is already installed (`installed_plugins.json` contains a `claude-mem@*` entry, OR `~/.claude-mem/.worker.pid` / `~/.claude-mem/claude-mem.db` exists) or when opted out via `DEV_POMOGATOR_CLAUDE_MEM=off`. After firing, it MUST stamp a lock (`~/.dev-pomogator/.claude-mem-bootstrap.lock`) and back off for 6h so it does not re-fire every session.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)

## FR-4: Fail-open builtins-only @feature4

The hook MUST never block session start: any error (including malformed stdin) MUST result in exit 0 with a `{continue:true,suppressOutput:true}` payload. It MUST be builtins-only (no `node_modules` imports) so it runs for plugin users with no installed dependencies.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)

## FR-5: Doctor detection @feature5

The pomogator-doctor MUST report whether claude-mem is installed (check `C-CMEM`): severity `warning` with an install hint when absent, severity `ok` when present.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5)

## FR-6: Doctor reads the canonical global MCP config @feature6

The doctor MCP-parse check (`C11`) MUST read the canonical user-global config `~/.claude.json` (NOT the non-existent `~/.claude/mcp.json`) in addition to the project `.mcp.json`, so globally-registered MCP servers are visible.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature6)
