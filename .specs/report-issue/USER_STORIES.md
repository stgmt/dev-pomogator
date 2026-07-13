# User Stories

### User Story 1: Submit a safe issue from the active session (Priority: P1)

As a dev-pomogator user, I want to invoke `/report-issue` with the problem I encountered so that I can submit a useful GitHub issue without manually collecting diagnostic context.

**Требование:** [FR-1]

**Why:** Reporting while the failure context is still present reduces friction and produces more actionable reports.

**Independent Test:** BDD scenario `@feature1` invokes the command with a valid authenticated GitHub CLI fixture and verifies that the created issue contains the approved sanitized draft.

**Acceptance Scenarios:**

Given an active session and an authenticated GitHub CLI
When I provide an issue title and description to `/report-issue` and approve its draft
Then the command creates one issue in the resolved dev-pomogator repository and shows its URL

---

### User Story 2: Review and control the exact report payload (Priority: P1)

As a privacy-conscious user, I want to review the sanitized issue draft and explicitly confirm it before posting so that no unapproved or sensitive content is sent to GitHub.

**Требование:** [FR-2]

**Why:** A clear approval boundary makes remote posting predictable and prevents accidental disclosure.

**Independent Test:** BDD scenario `@feature2` supplies session text containing a token and a personal path, then verifies that the displayed and submitted draft is redacted and that declining confirmation performs no remote create.

**Acceptance Scenarios:**

Given collected context contains a credential-shaped value and a user-specific filesystem path
When `/report-issue` builds the draft
Then it displays only the redacted draft and posts nothing until I explicitly confirm that same draft

---

### User Story 3: Avoid duplicate reports (Priority: P2)

As a maintainer, I want `/report-issue` to search existing GitHub issues using sanitized report terms before creation so that duplicate reports are surfaced instead of silently multiplying.

**Требование:** [FR-3]

**Why:** Early duplicate visibility keeps the issue tracker actionable while leaving the submitter in control.

**Independent Test:** BDD scenario `@feature3` returns a matching open issue from the search fixture and verifies that the command displays it before asking whether to create a new issue.

**Acceptance Scenarios:**

Given GitHub search finds a related issue using the sanitized title and summary
When I run `/report-issue`
Then the command shows the match and asks whether I still want to submit the approved draft

---

### User Story 4: Preserve a report when remote creation is unavailable (Priority: P1)

As a user without working GitHub access, I want `/report-issue` to preserve my sanitized approved draft and offer a prefilled GitHub new-issue URL so that I can finish reporting later without losing work.

**Требование:** [FR-4]

**Why:** Missing authentication, offline operation, timeouts, and create failures must not turn a reporting attempt into lost information.

**Independent Test:** BDD scenario `@feature4` simulates each remote failure class and verifies that an atomic local Markdown draft is preserved and that the encoded GitHub URL contains the same sanitized title and body.

**Acceptance Scenarios:**

Given GitHub is missing, logged out, offline, times out, or rejects issue creation
When I approve the sanitized draft
Then the command atomically preserves it locally and offers the prefilled `https://github.com/stgmt/dev-pomogator/issues/new` fallback URL with best-effort browser opening

---

### User Story 5: Route reports without user-specific configuration (Priority: P2)

As a plugin user, I want `/report-issue` to derive the target repository from the checked-out Git remote or plugin metadata so that the command works after canonical plugin installation without hardcoded personal setup.

**Требование:** [FR-5]

**Why:** A distributed plugin must resolve its own support destination consistently across different users and repository layouts.

**Independent Test:** BDD scenario `@feature5` covers Git-remote resolution, plugin-metadata resolution, and an unavailable identity source, verifying the selected target or an actionable fallback.

**Acceptance Scenarios:**

Given the current repository remote is unavailable but canonical plugin metadata identifies `stgmt/dev-pomogator`
When I invoke `/report-issue`
Then the command uses that repository identity without requiring a user-specific setting