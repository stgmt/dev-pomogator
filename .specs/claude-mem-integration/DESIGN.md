# Design

## Architecture

The integration has four layers: a built-ins-only SessionStart bootstrap, a canonical state/config resolver, doctor diagnostics, and a bounded worker-health/reaper hook. Default BDD uses recorded launchers and local worker fixtures. Real installation is an explicit, isolated, network-enabled profile.

### Decision: deterministic bootstrap and provenance

**Требование:** [FR-1](FR.md#fr-1-bootstrap-decision-feature1), [FR-2](FR.md#fr-2-non-interactive-install-command-feature2), [FR-3](FR.md#fr-3-idempotency-and-backoff-feature3)

**Rationale:** A pure ordered decision and one home-rooted resolver prevent repeat installs, prompts, and cross-home test contamination while preserving installation evidence.

**Trade-off:** Recording detailed provenance adds local state and explicit version-unverified outcomes, but avoids a false claim of a verified installation.

**Alternatives considered:**

- Always invoke the installer: rejected because it repeats network work and prompts.
- Independently implement bootstrap and doctor resolution: rejected because their answers can drift.

`tools/claude-mem-bootstrap/install-claude-mem.ts` owns a pure decision function and invokes the supported non-interactive command only for `install`. A shared state resolver receives the effective home once, reads manifest/PID/database evidence, and writes the six-hour lock atomically. The recorded launcher seam captures command, environment, package specifier, and outcome. Post-install evidence records a resolved version or explicit unverified state.

### Decision: hooks always continue without dependencies

**Требование:** [FR-4](FR.md#fr-4-fail-open-builtins-only-feature4)

**Rationale:** A session hook that blocks tools or depends on plugin-local packages harms every user when the worker or package environment is unavailable.

**Trade-off:** A bounded fail-open hook may omit memory context during a transient failure, but preserves the coding session and releases stalled request resources.

**Alternatives considered:**

- Retry indefinitely: rejected because a black-hole worker can stall session initialization.
- Import package dependencies: rejected because installed plugins need run without repository `node_modules`.

Bootstrap and health-hook entrypoints import only `node:` modules. Their top-level error boundary emits the standard continue payload and exits zero. Worker HTTP uses a bounded timeout and abort/cancellation path; unavailable, invalid, non-200, or black-hole responses return no memory context and release resources.

### Decision: one canonical state, config, and doctor contract

**Требование:** [FR-5](FR.md#fr-5-doctor-detection-feature5), [FR-6](FR.md#fr-6-doctor-reads-the-canonical-global-mcp-config-feature6)

**Rationale:** Shared resolution prevents bootstrap and doctor from disagreeing about installation, global configuration, port, or version.

**Trade-off:** Centralizing the resolver couples diagnostics to its stable result contract, but removes duplicated and drifting filesystem/config parsing.

**Alternatives considered:**

- Read only project configuration: rejected because user-global MCP registration is canonical.
- Treat a malformed manifest as installed: rejected because it hides repairable failures.

`tools/claude-mem-bootstrap/claude-mem-state.ts` is the contract for installed evidence, effective `HOME`/`USERPROFILE`, port, version, and configuration parse errors. `C-CMEM` and `C-CMEM-W` consume it rather than duplicating detection. MCP parsing merges project `.mcp.json` and global `~/.claude.json`. Post-install reporting represents manifest, MCP, worker, and version as distinct results.

### Decision: surgical platform-aware health recovery

**Требование:** [FR-7](FR.md#fr-7-worker-reaper-heals-a-wedged-port-feature7)

**Rationale:** Fixed-port orphan cleanup is needed only on Windows and must not affect a live worker or an unrelated process.

**Trade-off:** Conservative signature, ownership, and parent checks can leave an ambiguous wedge unreaped, but prevent destructive cleanup of unrelated processes.

**Alternatives considered:**

- Kill every port holder: rejected as destructive.
- Apply Windows process commands under WSL/Linux: rejected because process ownership semantics differ.

`tools/claude-mem-health/health-check.ts` first performs a bounded health probe, then evaluates the pure `reaperDecision`. Only native Windows may inspect a configured listening port and kill a process; the selection requires a dead owner, dead parent, and claude-mem command signature. WSL and other platforms return a non-destructive skip. Successful reaping resets the failure counter.

## Integration matrix

| Surface | Bootstrap | Reaper/health | Source resolution |
|---|---|---|---|
| Installed plugin | SessionStart | SessionStart and supported PreToolUse guard | `CLAUDE_PLUGIN_ROOT` |
| Repository dogfood | SessionStart | SessionStart and supported PreToolUse guard | project root |
| Default Docker BDD | recorded launcher only | local responsive/black-hole fixtures | isolated test home |
| Explicit real-install BDD | network opt-in only | post-install bounded verification | isolated test home |

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

Deterministic test data is required before implementation: isolated HOME/USERPROFILE trees, recorded installer launcher, responsive worker, refused worker, non-200 worker, TCP black-hole worker, captured Windows process snapshot, record-only kill seam, canonical hook manifests, and exact upstream artifact provenance. Default Docker BDD uses only local fixtures; the network-enabled real-install profile is explicit and separately reported.

## Verification design

Offline BDD proves decision ordering, exact launch record, home isolation, malformed input, doctor states, global MCP discovery, bounded health paths, and reaper non-target/target selection. The explicit real-install profile verifies a real manifest, MCP registration, worker result, and version provenance without allowing a mock fallback. Upstream session-init tests cover responsive, refused, non-200, and black-hole endpoints plus leaked-handle absence.
