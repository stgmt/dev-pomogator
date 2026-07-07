# Use Cases

## UC-1: Healthy worker — fast no-op (US-3)

Mid-session guard fires before a tool call while the worker is healthy.

- PreToolUse guard runs the fast bounded health probe against `127.0.0.1:37777`
- Probe returns healthy → guard returns `skip-healthy`
- Result: tool call proceeds with negligible added latency; the OS snapshot is never taken

## UC-2: Wedged worker mid-session — reap and heal (US-1)

Worker was SIGKILLed after a version-mismatch recycle; an orphaned `chroma-mcp` holds the port under a dead PID.

- Guard's health probe fails; debounce window has elapsed → guard takes the OS snapshot
- Snapshot shows port listening + owner PID dead + an orphaned claude-mem process
- `reaperDecision` returns `action: reap` → the orphan socket-holder is killed, port freed, `hook-failures.json` reset
- Result: the next hook reaches a healthy (or cleanly respawnable) worker instead of hanging 60s

## UC-3: Worker just down, port free — nothing to reap (US-1)

Worker is absent but no zombie holds the port.

- Guard's health probe fails; snapshot shows the port is NOT listening
- `reaperDecision` returns `skip-not-wedged` (worker will lazy-spawn on the next hook)
- Result: no process is killed; guard exits fail-open

## UC-4: Debounce — skip the expensive snapshot (US-3)

A full check ran moments ago and another tool call fires immediately.

- Guard reads the last-check timestamp; it is within the debounce window
- Guard skips the OS snapshot entirely and returns fast
- Result: back-to-back tool calls do not each pay the snapshot cost

## UC-5: Non-Windows / opt-out — skip entirely

The fixed-port zombie is a Windows-only pathology, and users may opt out.

- On non-Windows platforms, or when `DEV_POMOGATOR_CLAUDE_MEM_REAP=off`, the guard returns immediately
- Result: no probe, no snapshot, no reap; zero behavioural change on those setups

## UC-6: Ships to all users via plugin update (US-2)

An existing pomogator user updates the plugin.

- The mid-session guard is registered in `.claude-plugin/hooks.json` on the PreToolUse event
- On the user's next tool call the guard is active with no manual configuration
- Result: the fix is delivered to everyone who installs or has installed pomogator

## UC-7: Worker genuinely down beyond threshold, visible non-blocking notice (US-1)

The worker is unavailable across consecutive mid-session checks for longer than the visibility threshold, and the reap did NOT restore it (a death the reaper cannot heal — not the common zombie-port case).

- Each mid-session check finds the worker unavailable; the guard tracks a persisted "worker-down-since" timestamp
- Once the down interval exceeds the visibility threshold (default ~5 min) AND the reap did not restore the worker, the guard surfaces a VISIBLE, non-blocking notice (hook systemMessage / stderr warning, and/or a statusline indicator) stating memory has not been recording for N minutes
- The notice is de-duped — emitted on threshold crossing / at most once per window, not on every tool call
- The guard still returns continue:true (never denies/blocks); when the worker becomes healthy again the down-since marker is cleared
- Result: a genuine, un-healable memory outage is no longer silent — the user sees it — without reintroducing the exit(2) block-storm
