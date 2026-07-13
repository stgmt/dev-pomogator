# Non-Functional Requirements (NFR)

## Performance

- The skill SHALL complete local preparation, sanitization, target resolution, and URL generation without network access; duplicate search and creation SHALL be the only GitHub-network operations.
- The prepared report SHALL remain available when an optional GitHub operation is slow or fails.

## Security

- The skill SHALL sanitize tokens, credentials, and credential-shaped values from the title, Markdown body, search query, console output, and generated URL before invoking `gh` or displaying a report.
- The skill SHALL require explicit user consent after presenting the exact sanitized payload and SHALL not treat invocation as consent.

## Reliability

- A missing executable, unauthenticated `gh`, non-zero GitHub CLI exit, malformed repository metadata, or non-GitHub remote SHALL produce a truthful manual fallback rather than a false creation-success claim.
- The same resolved repository target SHALL be used for duplicate search, `gh issue create`, and the new-issue URL for one report attempt.

## Usability

- The prepared output SHALL plainly state whether the issue was created, not created pending consent, or not created because local creation was unavailable.
- The unauthenticated-CLI path SHALL name the remedial command `gh auth login` and provide a filled GitHub URL that the user can open without the CLI.
