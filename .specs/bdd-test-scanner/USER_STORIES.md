# User Stories

> Each story uses the User Story Form (v3): `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Session-start visibility of non-BDD test debt (Priority: P1)

As a plugin user working in any project, I want a one-line session-start notice of how many non-BDD test files exist, so I become aware of BDD-migration debt without anything blocking my work.

**Why:** The existing deny-guard only stops creation of NEW non-BDD tests; tests that already exist accumulate silently and nobody is reminded to migrate them.

**Independent Test:** BDD scenario — given a temp project with 3 `*.test.ts` files plus a `.feature`, when the scanner runs, then it reports a count of 3 and returns continue=true (does not block).

**Acceptance Scenarios:**

Given a project containing non-BDD test files
When a session starts and the scanner hook runs
Then a non-blocking notice with the count is shown and the session continues

---

### User Story 2: Actionable two-path suggestion (Priority: P1)

As a developer, I want the notice to name the two ways to resolve the debt (run the bdd-migrator agent now, or file a GitHub issue to track it), so I can act immediately without recalling the commands.

**Why:** A bare count is not actionable; pointing at the migrator and at a tracked GitHub issue turns awareness into a concrete next step that is recorded, not silently dismissed.

**Independent Test:** BDD scenario — the rendered notice text contains both the bdd-migrator path and a `gh issue create` path.

**Acceptance Scenarios:**

Given non-BDD tests were detected
When the notice is rendered
Then it lists both the bdd-migrator path and the file-a-GitHub-issue path

---

### User Story 3: A filed GitHub issue silences the notice (Priority: P2)

As a developer, I want the notice to go quiet once a GitHub issue tracks the migration debt (filing the issue is the acknowledgment), and to re-appear only when new non-BDD tests appear beyond what the issue covers, so the debt is tracked in the issue tracker rather than hidden behind a silent local flag.

**Why:** A passive "seen" flag hides the debt; a GitHub issue records it durably for the team. A repo mid-migration (e.g. ~120 files) must not show the same notice every session once an issue already tracks it.

**Independent Test:** BDD scenario — after a tracking issue is recorded, a session with the same set of non-BDD tests is silent; adding a new non-BDD test makes the notice fire again with the updated count.

**Acceptance Scenarios:**

Given a GitHub issue already tracks the detected non-BDD tests and no new ones appeared since
When a session starts
Then the notice is silent

---

### User Story 4: Doctor verifies and repairs the hook and its dependencies (Priority: P2)

As a plugin maintainer, I want pomogator-doctor to verify the scanner hook is registered and runnable AND that the dependencies it needs are present (the Node runtime; `gh` for the issue path), warning when a dependency is missing and offering a fix, so nothing silently does nothing.

**Why:** A plugin-distributed hook can silently fail to register, and the issue path silently no-ops if `gh` is absent or unauthenticated; pomogator-doctor is the surface that catches and repairs both.

**Independent Test:** pomogator-doctor reports the scanner-hook check as ok when registered and `gh` is available, and as a problem with a fix hint when the hook entry is absent OR `gh` is missing/unauthenticated.

**Acceptance Scenarios:**

Given the scanner hook entry is missing or broken, or a required dependency such as `gh` is absent
When pomogator-doctor runs
Then the relevant check reports a problem with a reinstall or fix hint
