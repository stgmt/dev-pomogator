# User Stories

### User Story 1: Full plugin install is guided, not shell-run (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1-setup-decision-and-install-guidance)

**Feature tags:** @feature1

As a dev-pomogator maintainer, I want SessionStart setup to detect when context-mode is missing and print exact Claude Code plugin instructions, so every session stays usable without pretending `/plugin` can run from a shell hook.

**Why:** context-mode slash-command install is interactive UI, but the Claude plugin CLI is scriptable. The setup contract must be idempotent, fail-open, auto-install through that CLI path, and still tell the user exactly what to do if the background install cannot complete.

**Independent Test:** Scenario `CTXMODE001_01 setup decision distinguishes install states` verifies `INSTALL_MISSING`, installed, opt-out, backoff, and MCP-only decisions without launching interactive UI.

**Acceptance Scenarios:**

Given a fresh Claude Code home without context-mode registration
When the SessionStart setup hook runs
Then it exits 0, records `INSTALL_MISSING`, starts `claude plugin marketplace add mksglu/context-mode` plus `claude plugin install context-mode@context-mode -s user` in the background, and prints exact `/plugin marketplace add` and `/plugin install` fallback instructions instead of trying to execute interactive `/plugin` from shell

---

### User Story 2: MCP-only mode preserves existing Claude settings (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2-mcp-only-auto-config)

**Feature tags:** @feature2

As a maintainer with existing Claude hooks and MCP servers, I want an explicit MCP-only context-mode path that merges safely, so I can use `ctx_*` tools without installing global slash commands or advisory hooks.

**Why:** #139 calls out hook-sensitive sessions and MCP-heavy setups. MCP-only must be opt-in and conservative because a global settings rewrite can silently break unrelated workflows.

**Independent Test:** Scenario `CTXMODE001_02 MCP-only configuration preserves existing settings` verifies backup creation, minimal MCP registration, and unrelated settings preservation.

**Acceptance Scenarios:**

Given global Claude settings contain unrelated hooks and MCP servers
When MCP-only context-mode config is applied
Then a settings backup is created
And unrelated hooks and MCP servers are preserved
And context-mode MCP registration is present

---

### User Story 3: Setup is idempotent, fail-open, and retry-safe (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out)

**Feature tags:** @feature3

As a Claude Code user, I want setup and repair hooks to respect opt-out, malformed JSON, and retry backoff, so a broken registry or slow repair never blocks my coding session.

**Why:** The claude-mem reference works because hook code is defensive. context-mode needs the same fail-open contract, with an extra constraint that first install may require a user-driven plugin command.

**Independent Test:** Scenario `CTXMODE001_03 setup fails open for opt-out, backoff, and malformed JSON` verifies every non-success setup branch exits 0 with an explicit status.

**Acceptance Scenarios:**

Given context-mode setup sees an opt-out or malformed registry
When the setup hook runs
Then the hook exits with code 0
And the result records a non-success status without blocking the session

---

### User Story 4: Doctor separates config poisoning from generic failure (Priority: P1)

**Требование:** [FR-4](FR.md#fr-4-doctor-classification)

**Feature tags:** @feature4

As a maintainer debugging context-mode failures, I want `/pomogator-doctor` to classify missing install, config poisoning, handshake failure, dead MCP, and unsafe hooks separately, so I repair the mechanism instead of chasing symptoms.

**Why:** Issue #139 showed different failure modes with the same user-visible symptom: `ctx_*` tools disappear. A generic restart hint hides the actual root cause.

**Independent Test:** Scenario `CTXMODE001_04 doctor classifies config poisoning versus live MCP death` uses real-shaped registry, manifest, process, and handshake fixtures.

**Acceptance Scenarios:**

Given context-mode plugin files exist
And the plugin registry is poisoned
When the context-mode doctor check runs
Then the doctor status is `CONFIG_POISONED`

---

### User Story 5: Live recovery prefers MCP reconnect before restart (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5-live-recovery-runbook)

**Feature tags:** @feature5

As a maintainer in a long-lived Claude Code session, I want recovery guidance for a dead context-mode stdio MCP process to try heal and `/mcp` reconnect before full restart, so I do not throw away session state unnecessarily.

**Why:** #139 captured mid-session MCP death where plugin registration was healthy but the live child process was gone. The least-disruptive recovery is not the same as config repair.

**Independent Test:** Scenario `CTXMODE001_05 recovery runbook prefers live MCP reconnect` verifies the recovery order and last-resort restart wording.

**Acceptance Scenarios:**

Given the doctor status is `MCP_DEAD_IN_SESSION`
When recovery guidance is rendered
Then it recommends the heal step
And it recommends reconnecting context-mode through `/mcp`
And it lists full session restart only as a last resort

---

### User Story 6: Hooks fail open when ctx tools are unavailable (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6-hook-safe-degradation)

**Feature tags:** @feature6

As a Claude Code user, I want dev-pomogator context-mode hooks to allow native tooling when `ctx_*` tools are unavailable, so recovery remains possible inside the same session.

**Why:** The observed #139 failure left a PreToolUse hook redirecting Bash/curl/WebFetch to tools that no longer existed, turning a recoverable MCP crash into an interaction trap.

**Independent Test:** Scenario `CTXMODE001_06 hook degrades when ctx tools are unavailable` feeds unavailable-tool hook payloads and verifies native tooling is allowed.

**Acceptance Scenarios:**

Given `ctx_execute`, `ctx_search`, and `ctx_index` are not discoverable
When the hook inspects a Bash/curl/WebFetch operation
Then it allows native tooling and emits a clear reconnect hint instead of denying the action

---

### User Story 7: Optional force-ctx policy is selective and kill-switchable (Priority: P2)

**Требование:** [FR-7](FR.md#fr-7-optional-force-ctx-policy)

**Feature tags:** @feature7

As a maintainer, I want any force-ctx policy to redirect only data/log/generated reads and never edit-relevant source/config/spec paths, so context-mode saves context without blocking normal code changes.

**Why:** context-mode is useful for large raw artifacts, but a broad deny hook becomes harmful when the tool is dead or when the user needs exact bytes for editing.

**Independent Test:** Scenario `CTXMODE001_07 optional force-ctx policy is selective and kill-switchable` verifies path classes, CASE-A wording, and `FORCE_CTX_OFF=1`.

**Acceptance Scenarios:**

Given ctx tools are available
And `FORCE_CTX_OFF` is not set
When force-ctx evaluates generated and source paths
Then generated/data/log classes redirect to ctx tools
And source/config/spec paths pass through for edit-safe native access

---

### User Story 8: Windows and worktree frictions are explicit (Priority: P2)

**Требование:** [FR-8](FR.md#fr-8-windows-and-worktree-guidance)

**Feature tags:** @feature8

As a Windows maintainer using dev-pomogator worktrees, I want context-mode docs and doctor output to name the known Windows/worktree frictions, so agents do not rediscover bash-vs-pwsh and root-confinement failures.

**Why:** Issue #91 measured concrete friction: `language: shell` runs bash on Windows, `ctx_execute_file` is project-root confined, and compound shell commands can break when env prefixes are injected.

**Independent Test:** Scenario `CTXMODE001_08 Windows guidance maps each friction to a workaround` checks generated doctor output and docs for exact workarounds.

**Acceptance Scenarios:**

Given the platform is Windows
When usage guidance is generated
Then it states that ctx shell is bash
And it shows explicit `pwsh -NoProfile` invocation
And it recommends `ctx_batch_execute` for paths outside the project root

---

### User Story 9: Value boundary prevents over-selling (Priority: P2)

**Требование:** [FR-9](FR.md#fr-9-honest-value-boundary)

**Feature tags:** @feature9

As a maintainer reviewing the feature, I want the spec and user-facing output to state where context-mode helps and where it is parity or overhead, so dev-pomogator does not ship inflated savings claims.

**Why:** The benchmark notes in #91 show context-mode can be valuable for derive-over-large-data and session survival, but it does not automatically beat disciplined grep/pipe usage or convert token trimming into realized dollars on a subscription profile.

**Independent Test:** Scenario `CTXMODE001_09 docs include honest value boundary` verifies that docs mention large raw artifacts/session survival, disciplined grep parity, and no universal cost-reduction claim.

**Acceptance Scenarios:**

Given context-mode docs are rendered
When a maintainer reads the value section
Then the docs distinguish token/window savings from realized billing and name grep/pipe parity
