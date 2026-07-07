# TASK: pin exact claude-mem UPS hook 60 s timeout — ✅ PINNED (2026-07-07)

**Status:** RESOLVED. Root cause pinned with log + transcript evidence. Store-size, credential-read, and
chroma-prewarm hypotheses all DISPROVEN as the 60 s sink. Superseded prior handoffs.

---

## ✅ PINNED CAUSE (one line)

The `session-init` UPS hook has **no short internal deadline on its HTTP call to the claude-mem worker
(127.0.0.1:37777)**, so whenever that worker is **unavailable**, the hook blocks and rides the full **60 s
Claude-Code hook budget** until the harness kills it (`UserPromptSubmit hook timed out after 60s — output
discarded`). It is a **worker-AVAILABILITY** failure, not store size, not auth/credentials, not chroma.

**PROVEN (this episode):** the mechanism above — an unbounded hook call to an unavailable worker rides the
full 60 s budget. What is NOT isolated for the exact 19:45–19:58 outage is *why* the worker was down/unbootable
in that window (no worker-death or bind-error line is logged inside it; the worker simply never came up between
the `05:13 Failed to start server` and `19:58:51 HTTP server started`).

**CANDIDATE recurring triggers (proven to occur on this box / same day, but not pinned to the 19:48 kill):**
1. **Version-mismatch recycle on every claude-mem plugin auto-update** — the next hook after each update
   detects `Worker version mismatch — recycling stale worker` and tears the worker down. Frequent: **10 recycles
   in 13 days** (13.8.0→…→13.10.2), one per bump (incl. 04:58 and 19:58 on 2026-07-06). NOTE: the 19:58:52
   recycle is *fallout* of the 19:48 kill (post-outage remediation), not its trigger.
2. **Fixed-port-37777 rebind failure on Windows** — after a recycle/crash the successor often cannot re-bind
   the fixed port (`✗ Worker failed to start — Failed to start server. Is port 37777 in use?` — **226×** across
   logs, incl. **05:13 on 2026-07-06**; dead-PID zombie LISTENING socket, see memory
   `reference_claude-mem-worker-wedged-block-storm` + `no-reboot-remediation`). Graceful shutdown logs
   `Graceful shutdown failed — proceeding` → `No successor worker appeared after recycle; falling through to
   lazy-spawn`, leaving the worker **down for minutes** while every hook that fires blocks 60 s.

## Evidence (2026-07-06, current lm-saas session `25af22b9` = session-31)

Timezone: worker.pid `startedAt 2026-07-06T16:59:12.881Z` == local log `19:59:12.881` ⇒ **local = UTC+3**.

- **Worker unavailable ~13 min (≈19:45–19:58 local).** claude-mem log 19:45→19:58 has only hook-process
  `Cached … at boot` bursts (spaced 99 s / 197 s / 131 s / 174 s) and **zero** `HTTP server started` /
  `Worker started` — worker absent-or-wedged (next `HTTP server started` is 19:58:51 pid 29404). The timeout
  proves *unavailable*; no HTTP-started line is consistent with either absent or wedged.
- **Exactly ONE real 60 s kill (handoff's "once" was correct).** lm-saas `25af22b9.jsonl`: the only harness
  timeout notice landing in a worker-down window is `hook timed out after 60s — output discarded` at
  **16:48:46.885Z = 19:48:46 local** (`[user]`-role injected notice), 0.67 s before the 19:48:47.552 hook
  boot-burst. The other ~11 transcript timeout mentions (17:27Z, 17:31Z, 20:28Z, 21:46Z, 21:49Z…) all occur
  **after** the worker came up (healthy since 16:59:12Z) — they are the user/assistant quoting/discussing the
  incident, not kills. So: 1 real kill in 1 outage episode, not "repeated."
- **Recycle choreography (the remediation the timeout triggered), 19:58:52→19:59:20:**
  `Worker version mismatch (plugin 13.10.2 vs worker 13.10.1)` → `Graceful shutdown failed — proceeding` →
  (+17.7 s) `No successor worker appeared after recycle` → lazy-spawn pid 3292 →
  `Worker already running (PID alive), refusing to start duplicate {existingPid=29404}` (double-spawn race) →
  `Connected to chroma-mcp successfully`. This recycle's own worker-down window was only ~28–31 s (< 60 s), so
  the recycle is the **fallout** of the 60 s kill, not the kill itself.
- **First-13.10.2-install window 04:58 corroborates the outage class:** version mismatch 04:58:08 → (+17.7 s)
  no-successor → lazy-spawn 13.10.2 → **96.8 s of zero worker log lines** (every line in 04:58:27→05:00:04
  dumped: none is a worker/HTTP line) → next hook falls back to the old 13.10.1. ~97 s worker-down ≫ 60 s.

## DISPROVEN (do not re-litigate)

- **Store size (330 MB Chroma / 28 MB DB):** already measured — warm `GET /api/context/inject` = 553 ms /
  200. Chroma connect ≤ 26 s regardless of store size. Not the sink.
- **Windows Credential Manager read failed ×7 (prior "STRONGEST LEAD"): RED HERRING.** It is a `[WARN]`, fails
  **fast** (0.3–1.4 s after each restart), fires once per fresh worker boot (re-reads OAuth), and auth still
  works — `/api/health` reports `initialized:true, mcpReady:true, authMethod:"OAuth token read from system
  keychain at spawn"`. It is a **symptom of the reboot**, not the 60 s cause.
- **Chroma uvx prewarm: NOT shown to be on the blocking path.** Prewarm→connected maxes at 26.3 s and is a
  background/lazy step; the only chroma waits logged are on the **sync/write** path (`SDK chroma sync failed,
  continuing without vector search`), never on the inject **read** path. Warm inject = 553 ms. Do not name it
  the 60 s amplifier — the 60 s is worker HTTP unreachability, full stop.

## Fixes (root, upstream = github.com/thedotmack/claude-mem)

1. **Bound the hook's worker call** — session-init must use a short deadline (e.g. 3–5 s) to reach :37777 and
   **fast-fall-back to no-injection** on timeout, instead of blocking the whole 60 s budget. Single highest-value fix.
2. **Kill the fixed-port zombie** — free/verify the old worker's socket before spawning the successor, or use an
   **ephemeral/rotating port** instead of hard-coded 37777 (`CLAUDE_MEM_WORKER_PORT`).
3. **Robust recycle** — on `Graceful shutdown failed` / `No successor worker appeared`, hard-kill + rebind-retry
   with backoff rather than leaving the worker down for minutes.

## Local mitigations (user side, no upstream change)

- **Pin claude-mem to a fixed version** to stop the auto-update churn that fires the version-mismatch recycle
  (removes defect #1's trigger entirely).
- Optionally set a non-default `CLAUDE_MEM_WORKER_PORT` less prone to a lingering zombie socket (palliative).
- Already applied (NOT a timeout fix): `CLAUDE_MEM_CONTEXT_OBSERVATIONS=10` (SessionStart injection size),
  `CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD=50` (suppresses the exit(2) block-STORM when the worker is unreachable —
  mitigates the *storm*, not the 60 s timeout).

## Key paths / endpoints
- hooks def: `~/.claude/plugins/cache/thedotmack/claude-mem/<ver>/hooks/hooks.json` (`session-init` timeout 60)
- logs: `~/.claude-mem/logs/claude-mem-YYYY-MM-DD.log` (local TZ = UTC+3)
- transcript with the real timeout events: `~/.claude/projects/E--repos-lm-saas/25af22b9-…jsonl`
- worker (fixed port 37777): `/health`, `/api/health`, `/api/context/inject?project=<name>`
- settings: `~/.claude-mem/settings.json`
- upstream: github.com/thedotmack/claude-mem — `src/cli/handlers/session-init.ts`, worker recycle/bind code

## Refs
- dev-pomogator #92 (this timeout), #91 (context-tool). Issue #92 title currently says "cause is worker/auth
  path" — this pin **narrows it to worker-AVAILABILITY** and clears "auth" (credential read is a red herring).
- memories: `reference_claude-mem-worker-wedged-block-storm`, `reference_claude-mem-observer-poison-loop-root`,
  `no-reboot-remediation`.
