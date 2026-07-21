# context-mode integration

## Install

dev-pomogator cannot run interactive Claude Code `/plugin` commands from a SessionStart shell hook. When context-mode is missing, it should print the commands for the user:

```text
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
/reload-plugins
```

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
