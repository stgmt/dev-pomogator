# User Stories

### User Story 1: Approve Codex Plugin Surfaces Deliberately (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1-init)

As a dev-pomogator maintainer, I want a whitelist of Codex-supported plugin surfaces, so that Codex compatibility is added only where runtime behavior has been researched and verified.

**Why:** The repo has Claude-oriented plugin history, and treating every old plugin claim as Codex-ready would ship drift.

**Independent Test:** `@FR-1` scenario verifies that only explicitly whitelisted Codex plugin entries are treated as supported.

**Acceptance Scenarios:**

Given a feature has no Codex whitelist entry
When a maintainer asks whether it is Codex-plugin supported
Then the answer is "not yet supported" with the missing evidence listed

Given a feature has a Codex whitelist entry
When the whitelist is checked
Then the entry names its manifest, marketplace entry, runtime contract, and verification method

---

### User Story 2: Keep Claude and Codex Channels Parallel (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels)

As a user who still uses Claude Code, I want Codex support to be added beside Claude support, so that existing Claude plugin and context-menu behavior keeps working.

**Why:** The requested migration is parallel support, not replacement; regressions in Claude artifacts would break existing users.

**Independent Test:** `@FR-2` scenario verifies that Codex support does not remove or weaken existing Claude plugin/context-menu artifacts.

**Acceptance Scenarios:**

Given an existing Claude Code plugin artifact is present
When a Codex whitelist entry is added
Then the Claude artifact remains present unless a spec explicitly deprecates it

Given the context-menu feature is whitelisted for Codex
When the installer is run
Then both Claude Code and Codex launch channels are independently verifiable

---

### User Story 3: Whitelist Context Menu First (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface)
**Требование:** [FR-6](FR.md#fr-6-stale-claim-rejection)

As a Windows power user, I want `context-menu` to be the first Codex plugin whitelist item, so that right-click launch supports both Claude Code and Codex with the right privileges and flags.

**Why:** Context-menu is the immediate user-requested workflow and already has enough existing artifacts to verify end-to-end.

**Independent Test:** `@FR-3` scenario verifies that `context-menu` is the first whitelist entry and links to the context-menu spec for feature-level behavior.

**Acceptance Scenarios:**

Given the Codex plugin support whitelist exists
When the first whitelisted plugin is inspected
Then it is `context-menu`

Given `context-menu` is whitelisted
When its Codex support is implemented
Then Codex-specific launch flags, trust files, and Nilesoft artifacts are not copied from Claude-only behavior

---

### User Story 4: Verify Codex Plugin Packaging With Real Codex CLI (Priority: P2)

**Требование:** [FR-4](FR.md#fr-4-codex-native-packaging-contract)

As a maintainer, I want every whitelisted entry to be checked through real Codex plugin commands, so that manifest validity and marketplace availability are not inferred from docs alone.

**Why:** Plugin distribution bugs are high-risk because install can look correct while skills/hooks/MCP are not actually loaded.

**Independent Test:** `@FR-4` scenario verifies that a whitelist entry cannot become Supported without CLI-backed evidence.

**Acceptance Scenarios:**

Given a plugin entry is proposed for the whitelist
When verification runs
Then it checks marketplace metadata, `.codex-plugin/plugin.json`, and installed/enabled status through the Codex CLI or an equivalent integration harness

Given a plugin includes hooks or MCP
When verification runs
Then it records trust/policy requirements instead of assuming those components execute immediately

---

### User Story 5: Gate Supported Status With Integration Evidence (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5-real-codex-cli-verification-gate)

As a maintainer, I want `Supported` status to require a real Codex CLI run or equivalent integration harness, so that whitelist status reflects executable behavior instead of documentation intent.

**Why:** A plugin can have plausible metadata and still fail marketplace visibility, manifest loading, or runtime expectations.

**Independent Test:** `@FR-5` scenario verifies that Supported evidence includes CLI or harness coverage for marketplace, manifest, installed-state, and runtime expectations.

**Acceptance Scenarios:**

Given a whitelist entry is marked Supported
When its evidence is inspected
Then an integration harness or real Codex plugin CLI run is present

---

### User Story 6: Reject Stale Claude-to-Codex Claims (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6-stale-claim-rejection)

As a maintainer, I want stale Claude-only assumptions to be rejected before they become Codex requirements, so that Codex launch flags and trust behavior stay tied to verified Codex behavior.

**Why:** Copying Claude flags or trust files into Codex support would produce a false green implementation and broken user workflows.

**Independent Test:** `@FR-6` scenario verifies that a Claude-derived claim contradicted by Codex code/docs is marked drift.

**Acceptance Scenarios:**

Given a Codex implementation claim uses Claude-only behavior
When official Codex docs or local Codex output contradict it
Then the claim is rejected until corrected

---

### User Story 7: Publish the Full Spec Generator as the Second Codex Plugin (Priority: P1)

**Требование:** [FR-8](FR.md#fr-8-second-full-spec-generator-v4-codex-entry)

As a dev-pomogator maintainer, I want the full `spec-generator-v4` Codex plugin to be a separate second whitelist entry, so that users can install the full spec workflow without widening the context-menu-only package.

**Why:** The launcher-only package and the full spec engine have different runtime surfaces. A separate entry preserves the minimal first package and keeps the full Codex Desktop behavior owned by the main `spec-generator-v4` contract.

**Independent Test:** `@FR-8` verifies the ordered second entry, its distinct plugin source and manifest reference, its ownership boundary, and its evidence-gated support status.

**Acceptance Scenarios:**

Given the Codex plugin support whitelist exists
When its plugin entries are ordered
Then `context-menu` remains first and `spec-generator-v4` is the separately installable second entry

Given the second entry has no passing installed-runtime evidence for requirement 83 of the main `spec-generator-v4` spec
When its support status is evaluated
Then it remains `Draft` or `Blocked` rather than `Supported`
