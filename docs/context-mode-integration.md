# context-mode integration

## Install

When context-mode is missing, dev-pomogator's SessionStart hook starts a detached non-interactive Claude plugin CLI install:

```text
claude plugin marketplace add mksglu/context-mode
claude plugin install context-mode@context-mode -s user
```

The hook is fail-open and guarded by a retry lock, so an offline or broken install attempt does not block the session or retry on every prompt. It also prints the manual fallback commands:

```text
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
/reload-plugins
```

## Stale-worker self-heal

Context-mode setup launches its installer through a dev-pomogator-owned worker wrapper. The wrapper terminates its installer process tree on normal completion, cancellation, or a five-minute timeout.

At SessionStart, dev-pomogator runs a bounded, fail-open stale-worker sweep. It selects a root only when its command line has both the owned worker marker and exact private `.ctx-mode-*/script` identity, and the script is older than 15 minutes. It never selects `python`, `bash`, or another runtime merely by executable name. Recovered roots are recorded in `~/.dev-pomogator/context-mode-worker-recovery.jsonl`.

## Recovery

For a dead in-session context-mode MCP, use the least disruptive path first:

1. run the idempotent context-mode heal step
2. reconnect context-mode through `/mcp`
3. verify ctx tools are available
4. restart the full Claude Code session only as the last resort

## Windows And Worktrees

- `language: shell` uses bash semantics; use `pwsh -NoProfile` when PowerShell behavior is required.
- `ctx_execute_file` is confined to the active project root.
- Use `ctx_batch_execute` for external worktree paths and logs outside the project root.
- Wrap compound shell commands with `bash -c` when needed.

## Value Boundary

context-mode is useful for derive-over-large-data work, large raw artifacts, and session survival across compactions. Disciplined `rg`, shell pipes, and targeted reads can be parity for ordinary source inspection. Do not claim universal daily usage reduction or broad percentage savings unless a measured workflow-specific baseline supports it.
