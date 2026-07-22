# context-mode consolidation report - 2026-07-21

## Result

Issue #139 is now the canonical target for `context-mode` integration in `dev-pomogator`.

Merged into #139:

- #84 context-mode install, MCP-only option, global hook risks, force-ctx caveats.
- #91 Windows/worktree gotchas, A/B benchmark conclusions, honest value boundary.
- #90 context around MCP schema overhead and `ENABLE_TOOL_SEARCH=1`, kept as related implementation scope.
- Existing #139 live MCP crash, reconnect runbook, and dead-tool redirect bug.

## Issue decisions

- #139: canonical context-mode integration issue.
- #91: can be closed as merged into #139.
- #84: should stay open only for headroom/full-install umbrella scope; its context-mode slice now points to #139.
- #90: should stay open as default settings provisioning for `ENABLE_TOOL_SEARCH=1`; related but not the same fix as context-mode health/reconnect.

## Canonical engineering target

Build a `dev-pomogator` doctor/runbook path that distinguishes:

- plugin config poisoning,
- mid-session MCP death,
- missing install,
- unsafe hook redirects.

The required behavior is fail-open hook degradation, `/mcp` reconnect before restart, Windows-specific ctx guidance, and no inflated savings claims.
