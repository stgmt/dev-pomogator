# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Heal a wedged worker mid-session (Priority: P1)

As a developer using dev-pomogator + claude-mem, I want a wedged claude-mem worker to be healed in the MIDDLE of a session, so that my prompts stop hanging for 60 seconds after the worker zombifies.

**Why:** Today the reaper (`tools/claude-mem-health/health-check.ts`) runs only on SessionStart; a dead-PID zombie socket on the fixed port appears mid-session (after a version-mismatch recycle) and every prompt in that window blocks the full 60s Claude-Code budget → `UserPromptSubmit hook timed out after 60s`, recurring until the session is restarted (proven: the SessionStart reaper ran 312× in an lm-saas session yet the 60s timeouts still happened).

**Independent Test:** Feed the mid-session guard a snapshot fixture simulating a wedge (port listening + dead owner PID + an orphaned claude-mem process), assert the pure `reaperDecision` returns `action: "reap"` carrying the orphan pid(s) — no OS contact, deterministic.

**Acceptance Scenarios:**

Given the claude-mem worker is wedged mid-session (port held by a dead PID with a live orphaned claude-mem process)
When the mid-session guard runs before a tool call
Then it reaps the orphaned socket-holder and frees the port so the next hook does not hang

Given the claude-mem worker is healthy mid-session
When the mid-session guard runs before a tool call
Then it takes the fast path and never touches the worker

---

### User Story 2: Ships to every pomogator user automatically (Priority: P1)

As any user who has installed or will install pomogator, I want this fix delivered automatically on plugin update, so that I do not need any manual steps.

**Why:** The guard is registered in `.claude-plugin/hooks.json` (canonical plugin distribution), so existing users receive it on the next plugin update and new users get it on install — matching how the SessionStart reaper already ships.

**Independent Test:** Assert the new mid-session hook event is present in `.claude-plugin/hooks.json` and points at the health-check entrypoint (registration-presence check, framework-independent).

**Acceptance Scenarios:**

Given a user updates or installs the dev-pomogator plugin
When their session runs a tool call
Then the mid-session guard is registered and active without any manual configuration

---

### User Story 3: Zero cost when the worker is healthy (Priority: P2)

As a user with a busy workflow, I want the mid-session check to NOT slow down my tool calls when the worker is healthy, so that per-tool-call latency stays negligible.

**Why:** The guard is on PreToolUse (fires on every tool call), so on a healthy worker it must run near-zero: a fast bounded health probe first, escalating to the expensive OS snapshot/reap only when the worker is unhealthy AND a debounce window has elapsed.

**Independent Test:** With a healthy-worker fixture, assert the guard returns `skip-healthy` without invoking the OS snapshot seam (record-seam confirms the heavy path was never entered).

**Acceptance Scenarios:**

Given the claude-mem worker is healthy
When the mid-session guard runs before a tool call
Then it returns skip-healthy without taking the OS snapshot

Given the guard already ran a full check within the debounce window
When another tool call fires
Then it skips the expensive snapshot to avoid adding latency
