# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-setup-decision-and-install-guidance)

WHEN the context-mode setup hook observes missing plugin evidence THEN the system SHALL exit 0 and emit exact `/plugin marketplace add mksglu/context-mode`, `/plugin install context-mode@context-mode`, and `/reload-plugins` instructions without launching interactive UI.

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-mcp-only-auto-config)

IF MCP-only mode is selected THEN the system SHALL write only the minimal MCP registration after creating a backup and SHALL preserve unrelated settings keys, hooks, and MCP server entries.

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out)

WHEN setup or repair encounters malformed JSON, filesystem failure, unavailable runtime, opt-out, or a fresh backoff lock THEN the system SHALL exit 0 with an explicit non-success status and no blocking prompt.

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-doctor-classification)

WHEN doctor checks context-mode state THEN it SHALL classify the result into one of the documented statuses using manifest, plugin command, process, and handshake evidence rather than a generic "broken" message.

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-live-recovery-runbook)

WHEN doctor reports `MCP_DEAD_IN_SESSION` THEN the recovery text SHALL recommend idempotent heal plus `/mcp` reconnect before full session restart.

## AC-6 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-hook-safe-degradation)

IF `ctx_*` tools are not discoverable THEN any dev-pomogator context-mode hook SHALL allow native tooling and SHALL NOT deny the operation with a dead-tool redirect.

## AC-7 (FR-7) @feature7

**Требование:** [FR-7](FR.md#fr-7-optional-force-ctx-policy)

WHEN optional force-ctx evaluates a path THEN it SHALL redirect only generated/data/log classes, pass edit-relevant source/config/spec paths, and respect `FORCE_CTX_OFF=1`.

## AC-8 (FR-8) @feature8

**Требование:** [FR-8](FR.md#fr-8-windows-and-worktree-guidance)

WHEN Windows/worktree guidance is generated THEN it SHALL include bash-shell semantics, explicit `pwsh -NoProfile` invocation, `ctx_execute_file` root confinement, `ctx_batch_execute` workaround, and `bash -c` compound-command workaround.

## AC-9 (FR-9) @feature9

**Требование:** [FR-9](FR.md#fr-9-honest-value-boundary)

WHEN docs describe context-mode value THEN they SHALL distinguish derive-over-large-data and session survival from universal cost reduction and SHALL avoid unmeasured savings claims.
