# HANDOFF: claude-mem UserPromptSubmit hook timeout (2026-07-06)

> **⚠️ CORRECTION (measured 2026-07-07): the "store bloat → slow search" root cause below is WRONG — retracted.**
> The context inject/search is **fast: 553 ms measured** (`GET :37777/api/context/inject?project=lm-saas` → 200, 553 ms; `/health` → 8 ms). **330 MB is NOT the cause.**
> Real evidenced suspects (from the claude-mem log): recurring `Windows Credential Manager read failed {service=Claude Code-credentials}` (×7), worker restarts + `SDK context lost on worker restart`, and haiku SDK calls — i.e. the **auth/worker/SDK path**, not the vector search. Exact 60 s event not yet pinned.
> `CLAUDE_MEM_CONTEXT_OBSERVATIONS=10` reduces injection *size* (context economy) but is **not** a confirmed timeout fix. Store prune/log-rotation = hygiene, not the timeout cause.

**For:** the claude-mem agent/maintainer (this `tools/claude-mem-health/` toolset)
**From:** Claude Code session on `lm-saas`, incident observed live
**Severity:** low per-turn (fail-open) but **recurring + net-negative overhead**

## TL;DR
claude-mem's local store grew to **330 MB** (178 MB Chroma vector DB). Its `UserPromptSubmit` hook (`worker-service.cjs hook claude-code session-init`, `timeout: 60`) now exceeds 60 s → killed, context injection dropped. Same plugin killed the Bash tool on Jul 2. **Prune the store and/or verify the persistent worker stays warm, or disable.**

## Environment
- claude-mem **13.10.1** (thedotmack); plugin cache `~/.claude/plugins/cache/thedotmack/claude-mem/13.10.1/`
- Windows 11, hooks run under Git Bash, node via nvm
- Store: `C:\Users\stigm\.claude-mem\` = **330 MB**

## Incident (today)
- Error surfaced to the model: `UserPromptSubmit hook timed out after 60s — output discarded.`
- Culprit hook: claude-mem UPS = `node bun-runner.js worker-service.cjs hook claude-code session-init`, `"timeout": 60` (`hooks.json:36-44`). It is the **only** UPS hook with timeout 60; carl / hookify(10s) / OR-reminder all ran fine that turn.
- Confirmation: that turn had **no** `<claude-mem-context>` / Recent-Activity injection (prior turns did) → the injecting hook is exactly the one that died.

## Prior incident
- **Jul 2, 2026:** "Bash tool death due to claude-mem plugin" (session note). Same plugin's hook surface destabilising tool calls.

## Root cause (high confidence) — store bloat
Semantic search / worker init over an oversized store:
| File | Size |
|---|---|
| `~/.claude-mem/chroma/chroma.sqlite3` | **178 MB** (Chroma vector store) |
| `chroma/<uuid>/data_level0.bin` | **85 MB** (HNSW index) |
| `claude-mem.db` (+ 5 MB WAL) | **27 MB** (observations) |
| `logs/claude-mem-2026-06-25.log` | **15 MB** (unrotated; multi-MB/day) |
| **total `~/.claude-mem`** | **330 MB** |

At 330 MB the UPS `session-init` query blows the 60 s budget — especially if the persistent worker isn't warm and the hook cold-starts node+bun+chroma.

> NB: `headroom memory stats: Total Memories 0` is a **different** memory system (headroom/fastembed, unused). claude-mem's own store is heavily populated (330 MB) — do not conflate.

## Hook surface (why it's heavy every turn) — from `hooks.json`
- **SessionStart** (`startup|clear|compact`): worker `start` (60s) + `context` inject (60s) — injects a **compressed recent-context summary** (claude-mem's own stat: **19,751 t "read"**), which *represents* ~172 k of past work; the 172 k itself is fetched **on-demand** via `get_observations` — it is **NOT** a 172 k dump
- **UserPromptSubmit**: `session-init` (60s) ← **timed out**
- **PostToolUse `*`**: `observation` (120s) — **runs on every tool call**
- **PreToolUse Read**: `file-context` (60s) — every Read
- **Stop**: `summarize` (120s)
- Setup: `version-check` (300s)

## Impact
- Per-turn: **fail-open** — the prompt proceeds; only that turn's memory injection is lost. Benign.
- Cumulative cost (weigh against the cross-session recall it provides): **~19.7 k** tokens injected each SessionStart (a compressed summary — **not** the 172 k it represents; that 172 k is on-demand), per-tool observation overhead, recurring timeouts, 330 MB disk.

## Recommended actions (ranked)
1. **Prune/compact the store.** Cap Chroma to recent-N observations; `VACUUM` `claude-mem.db`; rotate+truncate `logs/`. Target UPS hook < 10 s. Restores health without losing recent memory.
2. **Verify the persistent worker stays alive** (`worker.pid`, `supervisor.json`, `telemetry.json`). If the SessionStart-started worker dies, every hook cold-starts node+bun+chroma → timeout. Fix the supervisor so hooks hit a warm worker.
3. **Raise UPS timeout** via user `settings.json` hook override (band-aid — the plugin-cache value is overwritten on update; does not fix slowness).
4. **Disable claude-mem** if memory isn't valued on this machine — removes the SessionStart injection (~19.7 k) + all per-turn hook overhead.

## Open questions for the agent
- Observation/vector count in Chroma (330 MB ⇒ likely tens of thousands). Is there a retention/prune policy? If not, add one.
- Is log rotation implemented? Currently none (single-day 15 MB log).
- Windows/Git Bash worker lifecycle: does `worker-service.cjs start` reliably persist across the session, or is each hook cold-starting?
- Does `health-check.ts` already surface store-size / hook-latency? Extend it to **alert when store > threshold or UPS latency > N s** (this incident should have been caught proactively).

## Key paths / repro
- hooks: `~/.claude/plugins/cache/thedotmack/claude-mem/13.10.1/hooks/hooks.json`
- store: `~/.claude-mem/` (`chroma/`, `claude-mem.db`, `logs/`)
- worker entry: `<plugin>/scripts/bun-runner.js <plugin>/scripts/worker-service.cjs hook claude-code <phase>`
- existing health tool: `E:/repos/dev-pomogator/tools/claude-mem-health/health-check.ts`
- repro: submit any prompt on a large-store session → UPS `session-init` > 60 s → "timed out after 60s".
