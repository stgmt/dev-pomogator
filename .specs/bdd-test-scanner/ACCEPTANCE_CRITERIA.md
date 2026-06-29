# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start)

WHEN a session starts in a project containing non-BDD test files THEN the scanner SHALL produce a count of those files without blocking or modifying any tool call.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-shared-non-bdd-test-detector)

IF the non-BDD classification logic is invoked THEN both the write-time deny-guard and the scanner SHALL obtain it from one shared builtins-only module, with no duplicated patterns.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-advisory-two-path-notice)

WHEN non-BDD tests are detected AND a notice is rendered THEN the notice SHALL contain the count, the bdd-migrator path, and the `gh issue create` path, and SHALL NOT deny or alter the triggering event.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice)

WHEN a GitHub issue is recorded as tracking the detected non-BDD tests AND no non-BDD tests exist beyond the covered set THEN the scanner SHALL emit no notice; WHEN a non-BDD test appears beyond the covered set THEN the scanner SHALL emit the notice with the updated count.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-plugin-wide-distribution)

IF the plugin is installed THEN the scanner SHALL be registered as a SessionStart hook in the plugin manifest (and in the project settings for dogfooding) and SHALL run via the bootstrap launcher resolved through CLAUDE_PLUGIN_ROOT or CLAUDE_PROJECT_DIR.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies)

WHEN pomogator-doctor runs AND the scanner hook entry is missing or broken OR a required dependency such as `gh` is absent or unauthenticated THEN pomogator-doctor SHALL report a warning or critical result with a reinstall or fix hint.
