# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-bootstrap-decision-feature1)

- WHEN state is not-installed AND not opted-out AND lock not fresh THEN the decision SHALL be `install`
- WHEN claude-mem is already installed THEN the decision SHALL be `skip-installed`
- WHEN `DEV_POMOGATOR_CLAUDE_MEM=off` THEN the decision SHALL be `skip-optout`
- WHEN not installed AND the lock is fresh (within backoff) THEN the decision SHALL be `skip-backoff`

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-non-interactive-install-command-feature2)

- WHEN the hook installs THEN it SHALL invoke `claude-mem install` with `--ide claude-code --provider claude --model claude-haiku-4-5-20251001 --runtime worker`
- WHEN the hook installs THEN the process environment SHALL set `DO_NOT_TRACK=1` and `CLAUDE_MEM_ONLINE_OPTIN=false`
- WHEN the platform is Windows THEN the command SHALL be wrapped as `cmd /c npx ...`

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3)

- WHEN `installed_plugins.json` contains a `claude-mem@*` entry THEN the hook SHALL NOT invoke the installer
- WHEN `DEV_POMOGATOR_CLAUDE_MEM=off` THEN the hook SHALL NOT invoke the installer
- WHEN the hook fires THEN it SHALL stamp `~/.dev-pomogator/.claude-mem-bootstrap.lock`

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4)

- WHEN the hook receives malformed stdin THEN it SHALL exit 0 with a `{continue:true}` payload
- WHEN the hook errors internally THEN it SHALL NOT block session start

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-doctor-detection-feature5)

- WHEN claude-mem is not installed THEN the doctor `C-CMEM` check SHALL report severity `warning`
- WHEN claude-mem is installed THEN the doctor `C-CMEM` check SHALL report severity `ok`

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)

- WHEN a referenced MCP server is registered in `~/.claude.json` THEN the doctor `C11` check SHALL report it as configured
