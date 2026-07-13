# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-название)

WHEN a user supplies an issue description to `/report-issue`, the system SHALL display a sanitized proposed title and Markdown body, the resolved GitHub repository, and a filled new-issue URL before any GitHub mutation is attempted.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-название)

IF the user has not explicitly approved the exact prepared report, THEN the system SHALL NOT execute `gh issue create` or any equivalent issue-creation mutation.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-название)

WHEN the locally installed GitHub CLI is available and authenticated, the system SHALL search the resolved repository for open issues matching the sanitized report and show each possible duplicate before requesting consent to create a new issue.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-название)

IF `gh` is unavailable, unauthenticated, or returns an error, THEN the system SHALL retain and display the exact sanitized Markdown with a filled GitHub new-issue URL; for an unauthenticated `gh`, it SHALL also direct the user to run `gh auth login`.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-название)

WHEN repository metadata or a GitHub remote is available, the system SHALL resolve and display that owner/repository; OTHERWISE it SHALL use `stgmt/dev-pomogator`, and SHALL use the single displayed target consistently for duplicate search, issue creation, and the fallback URL.
