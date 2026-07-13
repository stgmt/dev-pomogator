# Design

## Requirement Mapping

- [FR-1: Название](FR.md#fr-1-название)
- [FR-2: Название](FR.md#fr-2-название)
- [FR-3: Название](FR.md#fr-3-название)
- [FR-4: Название](FR.md#fr-4-название)
- [FR-5: Название](FR.md#fr-5-название)

## Components

1. **Canonical skill entrypoint** — `.claude/skills/report-issue/SKILL.md` receives the issue description and controls the conversation, disclosure, and consent boundary.
2. **Report preparation** — derives a concise title and preserves the user’s Markdown detail while removing credential-shaped material before it leaves the local process.
3. **Repository resolver** — reads repository metadata or a Git remote, accepts only a GitHub owner/repository target, and otherwise supplies `stgmt/dev-pomogator`.
4. **GitHub CLI adapter** — probes `gh`, determines authentication state, searches duplicates, and only after explicit consent runs `gh issue create` for the resolved target.
5. **Manual fallback renderer** — builds a URL-encoded GitHub new-issue URL from the exact sanitized title and body and returns it for missing, unauthenticated, and error paths.

## Interaction Flow

1. Receive the issue description and sanitize it before forming a query, console output, Markdown payload, or URL.
2. Resolve and display the single repository target.
3. Prepare and display the exact title, Markdown body, and filled GitHub new-issue URL.
4. If `gh` is locally available and authenticated, search open issues for duplicates and display the results.
5. If duplicates exist, require an explicit second confirmation that a new issue is wanted.
6. Request explicit approval for the exact payload; only an affirmative response permits `gh issue create`.
7. On missing CLI, unauthenticated CLI, CLI error, declined consent, or no response, do not mutate GitHub; retain the prepared Markdown and URL. The unauthenticated path additionally says `gh auth login`.

## Command Boundary

- The implementation SHALL use the locally installed GitHub CLI rather than an embedded token or direct GitHub API client.
- `gh issue list` or `gh search issues` is read-only and may run only after sanitization.
- `gh issue create --repo <owner>/<repo> --title <title> --body <body>` is the sole creation mutation and may run only after the consent boundary is crossed.
- Arguments SHALL be passed as structured process arguments rather than interpolated shell text.

## Data Handling

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** N/A — the repository’s existing BDD harness supplies test execution.
**Evidence:** The feature uses user-supplied text but requires no persistent fixture, external database, mock service, or test-only data store. Tests use controlled process seams for local CLI states and must assert the prepared result and mutation absence/presence.

| Boundary | Data | Handling |
|---|---|---|
| User input | Issue description | Preserve Markdown semantics while sanitizing credential-shaped material before display or CLI use. |
| Git remote/metadata | Repository target | Accept GitHub targets only; otherwise use the canonical fallback. |
| `gh` output | Duplicate URLs and errors | Display only truthful summarized results; errors trigger fallback. |
| New-issue URL | Sanitized title and body | URL encode the exact displayed payload so manual submission preserves Markdown. |

## Key Decisions

### Decision 1: Use the local GitHub CLI as the GitHub integration

**Rationale:** The interaction belongs in the user’s current repository and must use their local GitHub authentication state without collecting or persisting tokens.

**Trade-off:** This supports an existing authenticated developer environment and avoids a secret-bearing API client, but it requires clear fallback behavior when `gh` is absent, unauthenticated, or fails.

**Alternatives considered:** Direct GitHub REST API with a token; browser-only submission without attempting local creation.

### Decision 2: Make consent a hard mutation boundary

**Rationale:** A report may contain incomplete, private, or unwanted content; showing the exact sanitized payload lets the user decide before any irreversible external action.

**Trade-off:** The flow adds an interaction turn, but prevents accidental issue creation and makes declined or interrupted flows safe by default.

**Alternatives considered:** Create immediately after invocation; infer approval from the supplied description.

### Decision 3: Search duplicates before creation consent

**Rationale:** A duplicate result is useful context for deciding whether a new issue should exist, and must not be hidden after a mutation has already occurred.

**Trade-off:** Search adds a network-dependent read step and can be imperfect, but it preserves user choice and does not block manual reporting when no result is available.

**Alternatives considered:** Search after creation; silently suppress reports deemed duplicates.

### Decision 4: Always render a manual GitHub fallback

**Rationale:** The issue description is valuable even when the local CLI cannot create an issue; a filled URL keeps the report actionable and avoids loss of Markdown.

**Trade-off:** Browser submission requires a final user action, but guarantees a truthful outcome across missing, unauthenticated, and error states.

**Alternatives considered:** Fail with an error only; save the report to a local file.

### Decision 5: Resolve one target with a canonical fallback

**Rationale:** Duplicate search, creation, and the manual URL must describe the same repository to avoid a report being reviewed in one target and created in another.

**Trade-off:** A fixed fallback is appropriate for the distributed dev-pomogator feature but can differ from a non-GitHub checkout; displaying it before consent makes that visible.

**Alternatives considered:** Require a repository argument; infer a target separately for each operation.
