# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).

### User Story 1: Помогатор сам доставляет свой lint-инструмент (Priority: P1)

As a dev-pomogator maintainer, I want the project to install or otherwise provide the lint runner it requires, so that `npm run lint` does not fail on a fresh user machine just because `eslint` is missing.

**Why:** The current verification path can be blocked by a missing local dev dependency, which turns a real code check into an environment failure.

**Independent Test:** LINTBOOT001 — simulate a checkout without `node_modules/.bin/eslint`, run the supported lint command, and verify that dev-pomogator bootstraps or dispatches the required lint tool instead of failing with `eslint is not recognized`.

**Acceptance Scenarios:**

Given a fresh dev-pomogator checkout without an installed eslint binary
When the maintainer runs the supported lint verification command
Then the command installs or resolves the required lint tool before running checks

Given the lint tool is already installed
When the maintainer runs the same verification command
Then the command reuses the existing tool and does not reinstall it unnecessarily

---

### User Story 2: Новые пользователи получают рабочую проверку из коробки (Priority: P1)

As a user who installed dev-pomogator, I want its own diagnostics and verification commands to bring their required tooling with them, so that I do not need to know which npm packages to install manually.

**Why:** A plugin meant to help users should not require hidden manual setup before its own quality checks can run.

**Independent Test:** LINTBOOT002 — run the lint verification path in a clean install-like environment and assert that the result is either a real lint pass/fail, never a missing-command failure.

**Acceptance Scenarios:**

Given a clean install-like environment with package metadata but no eslint binary
When the user or agent invokes the lint verification path
Then dev-pomogator prepares the lint dependency and runs eslint through the prepared path

Given dependency installation cannot complete
When the user or agent invokes the lint verification path
Then the command reports a clear setup failure with the install command and log location instead of a raw shell missing-command error

---

### User Story 3: CI and agent verification stay deterministic (Priority: P2)

As an automation reviewer, I want lint bootstrapping to be explicit, reproducible, and pinned by package metadata, so that CI, Docker, and agent sessions all run the same lint tool version.

**Why:** Auto-installing tools without a pinned source can make checks non-reproducible and can hide supply-chain or version drift problems.

**Independent Test:** LINTBOOT003 — inspect package metadata and the bootstrap path to verify that eslint is declared, pinned through the lockfile, and executed from the local project dependency tree.

**Acceptance Scenarios:**

Given package metadata declares the lint dependency and lockfile entry
When the bootstrap path installs dependencies
Then eslint is installed at the locked version and executed from the local project path

Given the lockfile is out of sync with package metadata
When the bootstrap path runs
Then it fails with an actionable lockfile-sync message instead of installing an untracked version
