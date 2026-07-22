# Use Cases

## UC-1: First session, context-mode is missing

**Feature tags:** @feature1 @feature3

**Actors:** Claude Code user, dev-pomogator SessionStart hook.

**Stories:** User Story 1, User Story 3.

**Main Flow:**
1. User opens Claude Code in a repo with dev-pomogator installed.
2. SessionStart setup checks the Claude home, opt-out, retry lock, and plugin registry.
3. No context-mode registration is found.
4. Hook exits 0 and emits exact install instructions plus a short reason.
5. No interactive command is spawned from shell.

**Expected Result:** Session continues; user receives a precise one-time install path and no repeated noisy repair loop.

## UC-2: MCP-only mode is selected for a hook-sensitive setup

**Feature tags:** @feature2

**Actors:** Maintainer, global Claude settings, dev-pomogator setup component.

**Stories:** User Story 2.

**Main Flow:**
1. Maintainer selects MCP-only context-mode configuration.
2. Setup reads existing global Claude settings containing unrelated hooks and MCP servers.
3. Setup creates a timestamped backup.
4. Setup writes only the context-mode MCP registration and preserves unrelated settings.

**Expected Result:** `ctx_*` tools can be exposed without installing global slash commands or overwriting existing hook chains.

## UC-3: Existing plugin is config-poisoned

**Feature tags:** @feature4

**Actors:** Maintainer, `/pomogator-doctor`.

**Stories:** User Story 4.

**Main Flow:**
1. Doctor reads `installed_plugins.json`.
2. It finds context-mode plugin files but disabled or missing `enabledPlugins["context-mode@context-mode"]`.
3. It classifies `CONFIG_POISONED`.
4. It recommends the heal step and reload/restart path, not `/mcp` reconnect.

**Expected Result:** Maintainer repairs plugin discovery instead of chasing a live-process symptom.

## UC-4: Live MCP server dies mid-session

**Feature tags:** @feature5

**Actors:** Maintainer, Claude Code `/mcp`, context-mode MCP server.

**Stories:** User Story 5.

**Main Flow:**
1. A long or streaming ctx operation kills the stdio MCP child.
2. Doctor sees healthy registration but no live `node start.mjs` process or failed handshake.
3. Doctor classifies `MCP_DEAD_IN_SESSION`.
4. User runs the heal step, reconnects context-mode through `/mcp`, and verifies tools are discoverable.

**Expected Result:** The session is recovered without defaulting to full restart.

## UC-5: Hook sees dead ctx tools

**Feature tags:** @feature6 @feature7

**Actors:** PreToolUse hook, Claude Code user.

**Stories:** User Story 6, User Story 7.

**Main Flow:**
1. Hook receives a Bash/curl/WebFetch operation.
2. Tool availability probe says `ctx_execute` and related tools are absent.
3. Hook allows the operation and emits a reconnect hint or stays silent.
4. If ctx tools are healthy, optional force-ctx evaluates path class and kill switch before redirecting.

**Expected Result:** The hook does not trap the user behind a dead tool and never redirects edit-relevant source/config/spec paths.

## UC-6: Windows worktree command needs ctx guidance and honest value framing

**Feature tags:** @feature8 @feature9

**Actors:** Maintainer, context-mode docs/doctor guidance.

**Stories:** User Story 8, User Story 9.

**Main Flow:**
1. User is on Windows and needs to inspect an external worktree log.
2. Guidance states ctx shell is bash and `ctx_execute_file` is project-root confined.
3. Guidance recommends explicit `pwsh -NoProfile` or `ctx_batch_execute` depending on the path.
4. The value section explains that this is a large-artifact/session-survival value case, not proof of universal cost reduction.

**Expected Result:** The known #91 friction is avoided without trial-and-error, and the feature does not overclaim savings.
