# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: {Short title} (Priority: P1)

As a {роль}, I want {цель}, чтобы {ценность}.

**Why:** {1-sentence rationale — business impact or user pain}

**Independent Test:** {How to verify this story in isolation — single BDD scenario label, manual walkthrough, or smoke check}

**Acceptance Scenarios:**

Given {precondition}
When {action}
Then {outcome}

---

### User Story 3: Parallel Codex Entry (Priority: P1) @feature8 @feature9 @feature10 @feature11

As a maintainer using both Claude Code and Codex, I want the Windows context menu to expose a separate Codex YOLO entry beside the existing Claude Code YOLO+TUI entry, чтобы I can choose either agent from the same folder without losing the already-working Claude workflow.

**Why:** Codex adoption is additive: removing or renaming the Claude Code channel would break a proven local workflow while solving a different problem.

**Independent Test:** CTXMENU001_18..22 verify both channel preservation and Codex-specific NSS/script/trust behavior.

**Acceptance Scenarios:**

Given the existing Claude Code context-menu channel is installed
When Codex context-menu support is installed
Then both `Claude Code (YOLO + TUI)` and `Codex (YOLO)` remain available as separate entries
And the Codex entry runs without the TUI pane until Codex+TUI is implemented as a separate follow-up

Given a Codex context-menu entry is launched in YOLO mode
When the selected directory is passed to the launcher
Then Codex starts with Codex-native full-access flags and Codex trust handling, without modifying Claude trust state

---

### User Story 2: {Short title} (Priority: P2)

As a {роль}, I want {цель}, чтобы {ценность}.

**Why:** {rationale}

**Independent Test:** {verification method}

**Acceptance Scenarios:**

Given {precondition}
When {action}
Then {outcome}
