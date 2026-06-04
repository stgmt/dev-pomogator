# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Domain: NATIVE Claude Code statusLine (`statusLine.command` = ccstatusline, git/model info).
> NOT the test-progress statusline (TUI `compact_bar.py` / `test-statusline` / `tui-statusline-mode`) — separate specs.

### User Story 1: Auto-install native statusLine for new plugin users (Priority: P1)

As a developer who just ran `/plugin install dev-pomogator@stgmt`, I want the native Claude Code statusLine (ccstatusline) to appear by itself, so that I get the same git/model status bar as before v2 without hand-editing settings.json.

**Why:** v1 auto-installed it via the now-deleted installer (commit `43cf946`); canonical-plugin users currently get no statusLine at all — a silent regression.

**Independent Test:** (@feature1) Empty `~/.claude/settings.json` (no `statusLine`) → run the native-statusline SessionStart hook with a session-start stdin JSON → assert `settings.json.statusLine.command` now contains `ccstatusline`.

**Acceptance Scenarios:**

Given a clean settings.json with no statusLine field
When the native-statusline SessionStart hook runs
Then settings.json gains statusLine.command = "npx -y ccstatusline@latest" with type "command"

Given settings.json that already has our ccstatusline statusLine
When the hook runs again
Then the file is left byte-for-byte unchanged (idempotent)

---

### User Story 2: Never overwrite a user's custom statusLine (Priority: P1)

As a user who configured my own statusLine command, I want the plugin to leave it alone, so that my personal status bar is never clobbered by the plugin.

**Why:** Silently replacing a user's prominent, persistent UI element is hostile; the old `resolveClaudeStatusLine` preserved user commands and we must keep that contract.

**Independent Test:** (@feature2) settings.json with a foreign `statusLine.command` (e.g. `my-custom-bar.sh`) → run the hook → assert the command is unchanged (action = keep-user).

**Acceptance Scenarios:**

Given settings.json with a custom statusLine.command that has no ccstatusline ownership marker
When the native-statusline hook runs
Then the existing statusLine.command is preserved unchanged and no write occurs

Given settings.json with our own ccstatusline marker command
When the hook runs
Then the slot is recognized as "ours" and left unchanged

---

### User Story 3: Apply immediately in the current session via doctor (Priority: P2)

As a user who does not want to wait for the next session, I want `/pomogator-doctor` to detect a missing statusLine and offer to install it now, so that I see the status bar without restarting.

**Why:** SessionStart writes are read only on the NEXT session (settings load before hooks fire); a doctor fix-action is the only way to apply within the current session by explicit user action.

**Independent Test:** (@feature3) Doctor run on an env with no statusLine → check reports "statusLine missing" → apply fix-action → assert settings.json updated by the same reconciler writer.

**Acceptance Scenarios:**

Given pomogator-doctor runs and settings.json has no statusLine
When the user applies the offered fix-action
Then settings.json is updated with the ccstatusline command via the shared writer

Given settings.json already has a statusLine
When pomogator-doctor runs
Then the check reports OK and offers no statusLine fix

---

### User Story 4: Opt out of automatic writes to the global config (Priority: P2)

As a user who does not want a plugin writing to my global `~/.claude/settings.json`, I want an off switch, so that I can keep the plugin without it touching my config.

**Why:** Auto-writing a third-party command into a user's global config is outward-facing; an explicit kill switch respects users who want zero side effects.

**Independent Test:** (@feature4) Set `DEV_POMOGATOR_STATUSLINE=off` → run the hook on an empty settings.json → assert settings.json is left untouched (no statusLine added).

**Acceptance Scenarios:**

Given the env var DEV_POMOGATOR_STATUSLINE is set to "off"
When the native-statusline hook runs on a settings.json with no statusLine
Then no write occurs and settings.json is unchanged

Given DEV_POMOGATOR_STATUSLINE is unset
When the hook runs on a settings.json with no statusLine
Then the statusLine is installed (default-on behavior, parity with v1)

---

### User Story 5: Idempotent and fail-open behavior (Priority: P3)

As a dev-pomogator maintainer, I want the hook to write only when something actually changes and to never break a session on error, so that the feature is safe to ship to all users by default.

**Why:** A SessionStart hook runs every session; needless writes cause disk churn and a crash would block the user's session — the hook must be idempotent and always exit 0.

**Independent Test:** (@feature5) Run the hook twice → second run performs no write (mtime unchanged); feed a corrupt (invalid JSON) settings.json → hook exits 0 and the session is not blocked.

**Acceptance Scenarios:**

Given the hook already installed the statusLine in a previous run
When the hook runs again with no other changes
Then no file write occurs (idempotent, no disk churn)

Given settings.json contains invalid JSON
When the hook runs
Then the hook exits 0 (fail-open) without throwing and emits no settings mutation
