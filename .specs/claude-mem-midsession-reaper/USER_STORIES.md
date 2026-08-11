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


### User Story 2: Recover a protected blank-metadata chroma tree (Priority: P1)

**Требование:** [FR-7](FR.md#fr-7-classify-an-unreadable-claude-mem-chroma-root-without-touching-foreign-processes)

As a developer whose Windows process metadata is unreadable, I want the correct claude-mem orphan tree identified, so that unrelated processes stay untouched.

**Why:** Elevated process metadata can hide CommandLine while retaining the inherited socket; relying on a command line alone misses the real holder.

**Independent Test:** Run the real hook against synthetic blank-root snapshots and assert the exact root selection and foreign-process exclusion.

**Acceptance Scenarios:**

Given a blank chroma root with a dead parent and direct Python child under a dead-owner port wedge
When the reaper runs
Then it selects only that root

### User Story 3: Prove recovery on the configured port (Priority: P1)

**Требование:** [FR-8](FR.md#fr-8-treat-port-release-as-the-recovery-proof)

As a developer with a wedged memory worker, I want the failure state cleared only after its configured port is actually free, so that a failed cleanup is never presented as a repair.

**Why:** Process exit status does not prove that an inherited listener has been released.

**Independent Test:** Run released and unverified synthetic snapshots through the real hook and assert the counter transition in each case.

**Acceptance Scenarios:**

Given a selected chroma tree and an unverified port release
When the reaper finishes its attempt
Then it keeps the failure counter unchanged and returns continue

### User Story 4: Request privilege only when Windows requires it (Priority: P1)

**Требование:** [FR-9](FR.md#fr-9-cross-the-windows-elevation-boundary-explicitly-and-narrowly)

As a developer facing a protected orphan tree, I want an explicit, rate-limited UAC recovery request after Access Denied, so that the hook can heal the real issue without silently gaining broad privilege.

**Why:** The normal hook process must remain unprivileged and fail-open, but Windows may prevent it from terminating the inherited-handle tree.

**Independent Test:** Simulate Access Denied and prove one fixed-helper request is recorded while the counter remains unchanged until release is observed.

**Acceptance Scenarios:**

Given the constrained root cannot be killed without elevation
When taskkill reports Access Denied
Then the guard requests the fixed helper once and does not claim successful recovery

### User Story 5: Heal before the next blocked prompt (Priority: P1)

**Требование:** [FR-10](FR.md#fr-10-heal-before-a-blocked-prompt-reaches-claude-mem)

As a developer with an already-active Claude Code session, I want the recovery guard to run before UserPromptSubmit reaches claude-mem, so that a new prompt does not wait for a later tool call or a port workaround.

**Why:** PreToolUse cannot protect a prompt hook that is already trying to reach an unavailable worker.

**Independent Test:** Inspect the generated managed manifest and registry for the first prompt route, then run the hook with the actual UserPromptSubmit event seam.

**Acceptance Scenarios:**

Given the worker wedges after SessionStart
When a user submits a prompt
Then the guarded route runs before later prompt hooks on the unchanged configured port.
