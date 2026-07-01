# Use Cases

## UC-1: Session-start notice of existing non-BDD tests (happy path)

A developer opens a project that still contains old-style test files. The scanner runs at session start, counts non-BDD tests, and surfaces a single non-blocking line. Linked: US-1.

- Session starts; SessionStart hooks fire
- The scanner walks the project and classifies each test file via the shared non-BDD detector
- A one-line notice with the count is added to session context; the session continues uninterrupted

## UC-2: Developer acts via the migrator

A developer reads the notice and resolves the debt by migrating now. Linked: US-2.

- Developer reads the notice naming the bdd-migrator path
- Developer launches the bdd-migrator agent on a chosen spec/test
- Tests become `@featureN` BDD scenarios; the non-BDD count drops on the next session

## UC-3: Developer defers by filing a GitHub issue

A developer reads the notice and records the debt as a tracked GitHub issue instead of migrating now. Linked: US-2, US-3.

- Developer reads the notice naming the `gh issue create` path
- An issue is filed (title carries the count; body lists the non-BDD test files; a label such as `bdd-migration` groups them)
- A local marker records the issue number and the covered set of tests, so the notice goes quiet for those

## UC-4: A tracking issue silences the notice (no nagging)

A repo with a large known tail; the developer does not want the same notice every session once an issue tracks it. Linked: US-3.

- A GitHub issue already tracks the detected non-BDD tests (recorded by the local marker)
- Subsequent sessions with the same set of non-BDD tests: the scanner is silent
- A new non-BDD test appears beyond what the issue covers, so the notice re-fires with the updated count

## UC-5: Doctor verifies and repairs the hook and its dependencies

The scanner hook fails to register, or the `gh` tool needed for the issue path is missing/unauthenticated. Linked: US-4.

- pomogator-doctor runs (session start or on demand)
- It checks the scanner-hook entry is present and runnable, and that required dependencies are available (Node runtime; `gh` present and authenticated for the issue path)
- For any missing piece it reports a warning or critical with a fix hint (reinstall the hook entry; install/authenticate `gh`); applying the fix restores full function
