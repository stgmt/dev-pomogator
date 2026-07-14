# claude-mem integration

## Purpose

This specification defines the v2 replacement for the removed v1 claude-mem installer. It keeps persistent-memory setup, health handling, and diagnostics non-interactive, bounded, and honest about what was or was not verified.

## User-facing behavior

- A SessionStart bootstrap checks canonical installation evidence before launching anything. It honors `DEV_POMOGATOR_CLAUDE_MEM=off`, uses one effective home (`USERPROFILE` on Windows when set, otherwise `HOME`), and backs off after an attempt.
- When installation is needed, the bootstrap uses a detached, non-interactive `npx -y claude-mem install` invocation with telemetry disabled. Bootstrap and health paths use Node built-ins only and fail open: they return the standard continue payload rather than block a session.
- `pomogator-doctor` reports installation, worker state, canonical global MCP registration from `~/.claude.json`, resolved port, and version evidence separately. A missing or failed component is never presented as verified.
- Native Windows recovery is deliberately narrow: a wedged port may be reaped only when the worker is unreachable and the holder is an orphaned claude-mem-signature process. Healthy workers, unrelated processes, WSL/Linux, live owners, and opt-out are non-destructive skips.

## Verification rails

The default Docker BDD rail is offline. It uses recorded installers plus local responsive and black-hole worker fixtures, so it must not download or install a real package.

A real installation is a separate, explicitly selected network-enabled profile. It requires an isolated `HOME`/`USERPROFILE` and independently records manifest presence, MCP registration, worker reachability, and detected version. A recorded-launcher fallback is not acceptable in that profile.

## Requirement and scenario map

| Area | Requirements | Source BDD scenarios |
|---|---|---|
| Bootstrap, state, and fail-open health | [FR-1](FR.md#fr-1-bootstrap-decision-feature1) through [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4) | `CMEM001_01`–`CMEM001_12` |
| Doctor and global configuration | [FR-5](FR.md#fr-5-doctor-detection-feature5), [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6) | `CMEM001_13`–`CMEM001_17` |
| Real-install proof and Windows reaper | [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4), [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6), [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7) | `CMEM001_18`–`CMEM001_26` |

Implementation sequencing, files, and evidence gates are in [TASKS.md](TASKS.md). Current execution status must be obtained from the spec status evidence rather than inferred from this document.
