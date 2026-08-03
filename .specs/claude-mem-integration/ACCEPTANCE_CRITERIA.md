# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-bootstrap-decision-feature1)

- WHEN state is not-installed, not opted-out, and lock not fresh THEN the decision SHALL be `install`
- WHEN claude-mem is already installed through a manifest, PID, or database signal THEN the decision SHALL be `skip-installed`
- WHEN `DEV_POMOGATOR_CLAUDE_MEM=off` THEN the decision SHALL be `skip-optout`, even if another condition also applies
- WHEN not installed and the lock is fresh within the backoff THEN the decision SHALL be `skip-backoff`
- WHEN manifest JSON is malformed and no PID/database evidence exists THEN the decision SHALL NOT report installed

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-non-interactive-install-command-feature2)

- WHEN the hook installs THEN it SHALL invoke `claude-mem install` with `-y`, `--ide claude-code`, `--provider claude`, `--model claude-haiku-4-5-20251001`, and `--runtime worker`
- WHEN the hook installs THEN its process environment SHALL set `DO_NOT_TRACK=1`, `CI=1`, and `CLAUDE_MEM_ONLINE_OPTIN=false`, and it SHALL have no TTY
- WHEN the platform is Windows THEN the command SHALL be wrapped as `cmd /c npx ...`
- WHEN installation completes THEN the report SHALL identify the package specifier, resolved version, and outcome
- WHEN the installed version cannot be resolved THEN the report SHALL identify it as unverified rather than verified

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3)

- WHEN `installed_plugins.json` contains a `claude-mem@*` entry THEN the hook SHALL NOT invoke the installer
- WHEN the worker PID or claude-mem database exists THEN the hook SHALL NOT invoke the installer
- WHEN `DEV_POMOGATOR_CLAUDE_MEM=off` THEN the hook SHALL NOT invoke the installer
- WHEN the hook fires THEN it SHALL atomically stamp `~/.dev-pomogator/.claude-mem-bootstrap.lock`
- WHEN Windows has `USERPROFILE` set THEN all state probes and lock writes SHALL use it; otherwise they SHALL use `HOME`

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4)

- WHEN the hook receives malformed stdin THEN it SHALL exit 0 with a `{continue:true}` payload
- WHEN the hook errors internally THEN it SHALL NOT block session start
- WHEN worker health is refused, non-200, malformed, or accepts without responding THEN it SHALL continue without memory context
- WHEN a health deadline elapses THEN the request SHALL be cancelled and SHALL not retain a live handle
- WHEN installed without dependencies THEN the hook SHALL load using Node built-ins only

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-doctor-detection-feature5)

- WHEN claude-mem is not installed THEN doctor `C-CMEM` SHALL report severity `warning` and an install hint
- WHEN claude-mem is installed THEN doctor `C-CMEM` SHALL report severity `ok`
- WHEN configuration is malformed, worker is unreachable, or worker is healthy THEN the worker diagnostic SHALL identify the respective condition separately from installation presence
- WHEN a worker configuration is available THEN the diagnostic SHALL report resolved port and version evidence

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)

- WHEN a referenced MCP server is registered in `~/.claude.json` THEN doctor `C11` SHALL report it as configured
- WHEN project `.mcp.json` and user-global configuration contain servers THEN doctor SHALL inspect both sources
- WHEN a real install profile is selected THEN verification SHALL separately report manifest, MCP registration, worker reachability, and version
- WHEN any post-install component fails THEN verification SHALL NOT label that component verified

## AC-7 (FR-7) @feature7

**Требование:** [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)

- WHEN the platform is not native Windows THEN `reaperDecision` SHALL return `skip-not-windows` and kill nothing
- WHEN the worker `/api/health` responds 200 THEN `reaperDecision` SHALL return `skip-healthy` and kill nothing
- WHEN the worker is unreachable and the port is not listening THEN `reaperDecision` SHALL return `skip-not-wedged` and kill nothing
- WHEN the worker is unreachable, the port listens, and the port owner is alive THEN `reaperDecision` SHALL return `skip-owner-alive` and kill nothing
- WHEN the worker is unreachable and the port is held by a dead owner THEN `reaperDecision` SHALL return `reap` with only orphaned claude-mem-signature PIDs
- WHEN a wedged snapshot contains no orphaned claude-mem process THEN `reaperDecision` SHALL kill nothing
- WHEN the reaper reaps THEN it SHALL reset `hook-failures.json` `consecutiveFailures` to 0
- WHEN default Docker BDD runs THEN it SHALL use recorded/local seams and make no real package network install
- WHEN real-install BDD is selected THEN it SHALL require explicit network opt-in and isolated `HOME`/`USERPROFILE`

## AC-2.1

**Требование:** [FR-2](FR.md#fr-2-non-interactive-install-command-feature2)

WHEN the detached installer process emits an asynchronous spawn error THEN the SessionStart hook SHALL remain fail-open without an unhandled process error. WHEN fresh install and legacy-model migration resolve active credentials THEN an active stored OpenRouter route SHALL remain authoritative, otherwise the project AiPomogator credential SHALL precede an environment OpenRouter credential consistently.
