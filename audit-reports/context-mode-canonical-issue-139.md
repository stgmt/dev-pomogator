# Canonical issue body for stgmt/dev-pomogator#139

## What this is

Canonical `context-mode` integration issue for `dev-pomogator`.

This folds the context-mode-specific findings from:

- #84 - full-install `headroom + context-mode`, global install, doctor-heal, Windows gotchas.
- #90 - `ENABLE_TOOL_SEARCH=1` and MCP schema deferral context.
- #91 - Windows/worktree friction, A/B bench findings, and honest value boundaries.
- #139 - live MCP crash/reconnect failure and dead-tool redirect bug.

Non-context-mode headroom work remains separate in #84/#88. `ENABLE_TOOL_SEARCH=1` provisioning can remain a separate implementation task (#90), but the context-mode rationale and interaction are captured here.

## Scope

Build/document a `dev-pomogator` context-mode integration that is usable in real Claude Code sessions:

1. Install or guide installation without pretending `/plugin` can run from shell hooks.
2. Verify plugin registration and MCP server health.
3. Recover live sessions when context-mode stdio MCP dies.
4. Degrade hooks safely when `ctx_*` tools are unavailable.
5. Document Windows/worktree gotchas and honest value limits.
6. Keep context-mode separate from headroom/rtk/tokensave claims unless explicitly comparing overlap.

## Canonical install / configure

### Full plugin path

Context-mode is a Claude Code plugin:

```text
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
/reload-plugins
```

After install, `~/.claude/plugins/installed_plugins.json` must contain:

```json
{
  "enabledPlugins": {
    "context-mode@context-mode": true
  }
}
```

If that entry is empty or missing, Claude Code can silently skip the plugin and the MCP server never starts. This is the config-poisoning mode related to upstream `anthropics/claude-code#46915`.

### MCP-only path

For automation-heavy or hook-sensitive setups, prefer documenting an MCP-only mode where `ctx_index` / `ctx_search` / `ctx_execute` work without installing invasive global hooks/slash commands. This is safer for money repos with existing `~/.claude/settings.json` hook chains.

### What cannot be automated from SessionStart

`/plugin` is interactive Claude Code UI, not a shell command. A SessionStart hook cannot perform first install via `/plugin`. It can only:

1. Detect/repair already-installed plugin registration.
2. Verify MCP server handshake/health.
3. Emit a clear one-time instruction when plugin install is required.
4. Optionally configure MCP-only mode if that path is supported.

## Live failure observed on 2026-07-21

A long, network-heavy streaming `ctx_execute` failed with:

```text
MCP error -32000: Connection closed
```

After that:

- All `ctx_*` tools disappeared or returned MCP-disconnected errors for the rest of the session.
- The live stdio MCP process was gone (`node start.mjs` not present).
- Plugin registration was still healthy, so this was not the config-poisoning case.
- Manual initialize handshake against `node "<plugin>/start.mjs"` succeeded, proving install/binary health.
- The PreToolUse hook kept redirecting Bash/curl/WebFetch to `ctx_execute` / `ctx_fetch_and_index`, even though those tools were dead.

## Root causes to distinguish

### A. Config poisoning

`installed_plugins.json` loses/omits `enabledPlugins["context-mode@context-mode"]`.

Effect: Claude Code plugin loader skips context-mode; MCP never boots.

Recovery:

```text
node "<plugin>/scripts/heal-installed-plugins.mjs"
```

Then reload/restart as needed.

### B. Mid-session MCP death

The plugin is registered and install is healthy, but the live stdio MCP child dies during the session.

Effect: Claude Code does not auto-respawn the crashed stdio MCP server inside the same session.

Recovery, in order:

1. Run `heal-installed-plugins.mjs` anyway; it is idempotent and covers mode A.
2. Use `/mcp` in the live Claude Code session, select `context-mode`, reconnect/restart.
3. Verify handshake or tool list.
4. Restart the whole session only if `/mcp` reconnect is unavailable/broken.

## Required dev-pomogator behavior

### Doctor / verify

Add a context-mode doctor path that reports:

- Plugin registration: `enabledPlugins["context-mode@context-mode"] === true`.
- MCP command exists: plugin manifest points to `node <plugin>/start.mjs`.
- Runtime prerequisites: Node >= 22.5 or Bun path acceptable for FTS5/sqlite.
- Live process state: stdio server present when expected.
- Handshake: `initialize` returns `serverInfo.name === "context-mode"`.
- Tool availability: `ctx_execute`, `ctx_search`, `ctx_index` discoverable after reconnect.
- Hook safety: PreToolUse does not redirect to dead `ctx_*` tools.

### Recovery runbook

The doctor output should distinguish:

- `CONFIG_POISONED`: repair `installed_plugins.json`.
- `MCP_DEAD_IN_SESSION`: use `/mcp` reconnect; do not default to full restart.
- `INSTALL_MISSING`: user must run `/plugin ...` or use MCP-only setup.
- `HOOK_UNSAFE`: disable/degrade redirect until tools are healthy.

### Hook degradation

If `ctx_*` tools are unavailable, context-mode guidance must fail open:

- Do not deny Bash/curl/WebFetch and point at dead tools.
- Do not emit bare `BLOCKED`.
- Prefer silence or a clear fallback: "context-mode MCP is unavailable; use native tooling or reconnect via `/mcp`."

If dev-pomogator ships a force-ctx hook, it must:

- Be selective: data/generated/log paths only, not source files needed for read-to-edit.
- Be fail-open.
- Have kill switch: `FORCE_CTX_OFF=1`.
- Use CASE-A wording: "redirected to context-mode; call ctx_execute_file/ctx_batch_execute; has full access".
- Never redirect when `ctx_*` tools are not discoverable.

## Windows / worktree gotchas from #91

### shell runtime is bash, not PowerShell

`ctx_execute` / `ctx_batch_execute` with `language: "shell"` runs bash/git-bash on Windows, not `pwsh`.

Guidance:

```text
pwsh -NoProfile -Command "..."
pwsh -NoProfile -File script.ps1
```

Escape PowerShell `$` variables when invoking through bash.

### `ctx_execute_file` is project-root confined

For worktree or external log paths outside the project root, use `ctx_batch_execute` with an explicit shell command and query instead of `ctx_execute_file`.

Potential upstream ask: allowed-roots / multi-root config for `ctx_execute_file`.

### `ctx_batch_execute` command prefix issue

Observed friction: command prefixing such as `NODE_OPTIONS=...` before every command can break compound shell constructs at the beginning of a statement (`for ... do`, PowerShell `@(...)`, etc.).

Workaround:

```text
bash -c 'for ...; do ...; done'
```

Potential upstream ask: export env separately rather than inline-prefixing arbitrary shell commands.

### Bash HTTP redirect can break local health scripts

Context-mode hooks may intercept `curl` / `wget` / inline HTTP in Bash and redirect to ctx tools. Doctor scripts must not rely on naive Bash curl if context-mode can deny it; either run health checks through the right tool path or fail open.

## Honest value boundary

Do not sell context-mode as universal cost reduction for a disciplined agent.

Measured findings from #91:

- Friction-free ctx run was roughly parity with clean native run (`$7.28` vs `$7.62` in that benchmark; variance was dominated by run churn).
- Context-mode helps most when raw bytes would otherwise enter context: large logs, generated artifacts, huge HTTP/browser/RAG dumps, or session-survival before/after `/compact`.
- Native `grep`, line-range reads, pipes, `jq`, and small derive scripts already keep most bytes out of context for a competent agent.
- `ctx_execute_file` is valuable for compute-over-data: count/filter/aggregate over large files while only printing the derived answer.
- Force-routing more native work into `ctx_*` can be net-negative if the native path was already a small grep/pipe.
- Token savings do not equal realized dollars on a subscription profile; they mostly affect session longevity and rate-limit headroom.

Context-mode is still useful as:

- A discipline rail for agents/users that dump raw output.
- A sandbox for derive-over-large-data.
- A session continuity layer.
- A way to survive large artifacts that would otherwise force compaction or overflow.

## Relationship to #90 / `ENABLE_TOOL_SEARCH=1`

`ENABLE_TOOL_SEARCH=1` is not the context-mode fix, but it is relevant for MCP-heavy setups:

- Defers MCP schemas until first tool use.
- Reduces startup context overhead when many MCP servers are installed.
- Adds one round trip on first use of a deferred tool.
- Changing MCP server sets mid-session can invalidate prompt-cache benefits.

Keep #90 as the implementation task for default settings provisioning unless this issue is expanded to own all MCP-context startup diet work.

## Acceptance checklist

- [ ] Doctor distinguishes config poisoning vs live MCP death.
- [ ] Doctor can verify manual MCP handshake.
- [ ] Runbook says `/mcp` reconnect before full session restart.
- [ ] Hooks fail open when `ctx_*` tools are absent.
- [ ] Force-ctx, if shipped, is selective, fail-open, and kill-switchable.
- [ ] Windows docs state shell=bash and show explicit `pwsh` invocation.
- [ ] Worktree docs state `ctx_execute_file` root confinement and `ctx_batch_execute` workaround.
- [ ] Docs include the honest value boundary: parity for disciplined grep/pipe agents, value for large raw artifacts and session survival.
- [ ] #91 is closed as merged into this canonical issue.
- [ ] #84/#90 link here for the context-mode slice while preserving their non-context-mode scopes.

## Upstream requests

For `mksglu/context-mode`:

- Graceful hook degradation when MCP server is down.
- Robustness/timeout/isolation for long or streaming `ctx_execute`.
- Health-check or auto-respawn for stdio MCP server, or a documented one-command reconnect.
- Optional `pwsh` runtime on Windows.
- Allowed-roots/multi-root support for `ctx_execute_file`.
- Safer shell env injection for `ctx_batch_execute`.

## Links

- Upstream context-mode: https://github.com/mksglu/context-mode
- Related Claude Code loader issue: https://github.com/anthropics/claude-code/issues/46915
- Merged context-mode install/full-install context: #84
- Merged Windows/worktree friction and A/B analysis: #91
- Related MCP-schema deferral task: #90
