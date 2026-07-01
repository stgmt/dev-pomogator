# Non-Functional Requirements (NFR)

## Performance

- The scan SHALL complete within the SessionStart budget and never delay session readiness: it SHALL bound the walk (skip `node_modules`, `.git`, `dist`, build output), cap the number of files inspected, and race a timeout (as the doctor hook does), falling back to silence on timeout.
- Classification SHALL be path/name-based only (no reading of file contents), so cost is O(files walked).

## Security

- The hook SHALL read only file paths/names for classification; it SHALL NOT read test file contents, transmit data, or post anything automatically.
- Filing a GitHub issue SHALL be user-initiated (the hook only suggests `gh issue create`); the hook itself SHALL NOT call `gh` or perform any network action.

## Reliability

- The scanner core SHALL be builtins-only (`node:fs` / `node:path`) so it runs for plugin users with no installed dependencies, and SHALL be fail-open: any error → continue the session silently, never block.
- Dependencies SHALL NOT be silently skipped: where a dependency is needed (`gh` for the issue path), its absence SHALL surface as a warning and pomogator-doctor SHALL verify and offer a fix (install-or-warn + doctor-repair).

## Usability

- The notice SHALL be a single non-blocking line carrying the count and the two resolution paths; it SHALL never interrupt or deny a tool call.
- The notice SHALL NOT nag: once a GitHub issue tracks the debt it SHALL stay silent until new non-BDD tests appear beyond the covered set.
