# Upstream issue draft — claude-mem: Windows worker wedge is a LIVE orphaned socket-handle leak (not a kernel zombie); reap the holder to fix without reboot

> Draft for filing at https://github.com/thedotmack/claude-mem/issues (post only with owner approval).
> Written 2026-07-03 from a live-reproduced wedge on Windows 11, claude-mem 13.9.2.

## Summary

On Windows the worker port (default 37777) gets stuck "in use" under a **dead PID**, so every new
worker fails `Is port 37777 in use?`, hooks flood `hook-failures.json`, and at the fail-loud
threshold the hook does `process.exit(2)` — a **blocking** PostToolUse error on every tool call, in
every project. Existing issues (#415, #1531, #2111, #213, #363, #729) describe the symptom and
conclude "reboot" or "change the port". Neither is necessary.

**The socket is NOT a kernel zombie. A LIVE orphaned child process holds it via an inherited handle.
Killing that child frees the port immediately — no reboot, no port change.**

## Root cause (proven live)

1. Under load the observer SDK session times out / returns empty (`SDK returned non-XML idle
   response`); after 3 in a row the worker is declared poisoned and **SIGKILLed as a process group**.
2. The worker had spawned `chroma-mcp` (via `uvx`) as a child. On Windows, child processes
   **inherit open handles by default**, so `chroma-mcp` inherited the worker's *listening socket
   handle* for 37777.
3. SIGKILL terminates the worker, but the orphaned `chroma-mcp` (and its `python` subtree) **survive
   and keep the inherited socket handle open**. The listening socket therefore stays in `LISTEN`
   under the now-dead worker PID until the *handle holder* dies. (This is also the source of the
   endless orphaned `node → uvx → chroma_mcp → python` trees reported in #213.)
4. The port-in-use guard sees the port bound and assumes a healthy peer exists, so the new worker
   exits without ever serving `/api/health` → permanent wedge.

## Evidence (Windows 11, 13.9.2)

```
# Owner of the listening socket is DEAD:
Get-NetTCPConnection -LocalPort 37777 -State Listen  → OwningProcess 23892 (CreationTime 2 days ago)
Get-Process -Id 23892                                → no such process   (owner dead)

# The LIVE holders are orphaned chroma-mcp trees (parent PID dead):
Get-CimInstance Win32_Process | ? CommandLine -match 'chroma-mcp .*\.claude-mem'
  → PID 27200 (ParentProcessId 36924 = DEAD)  chroma-mcp --data-dir C:/Users/.../.claude-mem/vector-db
  → PID 52860 (ParentProcessId 51244 = DEAD)  chroma-mcp --data-dir ...

# Kill ONLY the orphaned holders → port frees, worker recovers, NO reboot:
taskkill /PID 27200 /T /F ; taskkill /PID 52860 /T /F
Get-NetTCPConnection -LocalPort 37777 -State Listen  → (none) — PORT FREE
# next hook lazy-spawns a healthy worker: 37777 LISTEN by a live PID
```

`worker-service.cjs` log during the wedge (10-day window): `SDK returned non-XML idle response`
×9631, `SDK session poisoned — killing and respawning` ×2057, `PID … did not exit … sending
SIGKILL to process group` ×1349, `child emitted error {The operation was aborted}` ×1344, `Is port
37777 in use?` ×142. No `429`/quota/auth lines — the observer failures are timeouts, not rate limits.

## Why version bump doesn't fix it

Latest 13.9.3 is error-handling cleanup only. The lifecycle rework (13.5.6 self-replacing worker +
`spawn.lock`) and Windows socket cleanup (7.3.7 process-tree enumeration) are already present in
13.9.2 and the bug survives them: the port-guard still treats "bound" as "healthy peer", and the
SIGKILL still leaves `chroma-mcp` holding the inherited handle.

## Proposed fixes (upstream)

1. **Do not leak the listening socket handle to children.** Create the worker's `server.listen()`
   socket with the handle marked non-inheritable, or ensure `chroma-mcp`/`uvx` are spawned so they
   never inherit fd/handles (`windowsHide` + explicit non-inheritable stdio + no shared handles).
   Then a dead worker's socket is reclaimed immediately even if children linger.
2. **Kill the whole process tree on shutdown/poison.** When SIGKILLing a poisoned worker, also
   `taskkill /T` (tree) its `chroma-mcp`/`uvx`/`python` descendants so no orphan survives holding
   the port (also fixes #213's endless orphans).
3. **Port-guard must verify liveness, not just binding.** If 37777 is bound but `/api/health` fails
   for N attempts, treat it as wedged: reclaim it (kill the holder found via handle/port ownership)
   rather than exiting as a "duplicate", or fall forward to the next port and persist it.

## Interim mitigation shipped in dev-pomogator (for reference)

A SessionStart reaper hook probes `/api/health`; when unhealthy AND the port is bound by a dead
PID, it kills ONLY orphaned processes whose command line carries a claude-mem signature
(`chroma-mcp …/.claude-mem`, `…/claude-mem/…/worker-service.cjs`) and whose parent is dead —
freeing the port — then resets `hook-failures.json`. No reboot, no port change; a live worker is
never touched.
