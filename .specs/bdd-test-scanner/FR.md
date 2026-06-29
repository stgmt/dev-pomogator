# Functional Requirements (FR)

## FR-1: Scan existing non-BDD tests at session start

At session start the scanner SHALL walk the current project, classify each test file via the shared non-BDD detector, and produce a count of existing non-BDD test files — without blocking or modifying any tool call.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-session-start-notice-of-existing-non-bdd-tests-happy-path)

## FR-2: Shared non-BDD test detector

The non-BDD classification (patterns plus allow-lists) SHALL live in one shared, builtins-only pure module (`isNonBddTest()` / `detectNonBddTests()`) that both the existing write-time deny-guard and this scanner import — no duplicated regexes across the two.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-session-start-notice-of-existing-non-bdd-tests-happy-path)

## FR-3: Advisory two-path notice

WHEN non-BDD tests are detected the scanner SHALL emit a non-blocking notice carrying the count and naming two resolution paths — run the bdd-migrator agent, or file a GitHub issue (`gh issue create`) to track the debt. The notice SHALL never deny or alter a tool call.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-developer-acts-via-the-migrator)

## FR-4: A tracking issue gates the notice

The scanner SHALL stay silent once a GitHub issue tracks the detected non-BDD tests (recorded by a local marker holding the issue number and the covered set), and SHALL re-emit the notice only when non-BDD tests appear beyond the covered set.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-a-tracking-issue-silences-the-notice-no-nagging)

## FR-5: Plugin-wide distribution

The scanner hook SHALL be registered as a SessionStart hook in the plugin manifest (`.claude-plugin/hooks.json`) so every plugin user receives it, and in the project's `.claude/settings.json` for dogfooding, using the bootstrap launcher resolved via `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PROJECT_DIR`.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-session-start-notice-of-existing-non-bdd-tests-happy-path)

## FR-6: Doctor verifies and repairs the hook and its dependencies

pomogator-doctor SHALL include a check that verifies the scanner hook is registered and runnable AND that its dependencies are present (the Node runtime; `gh` present and authenticated for the issue path); WHEN any is missing it SHALL report a warning or critical with a reinstall or fix hint.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-5](USE_CASES.md#uc-5-doctor-verifies-and-repairs-the-hook-and-its-dependencies)
