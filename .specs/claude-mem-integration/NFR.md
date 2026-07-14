# Non-Functional Requirements (NFR)

## Performance

- SessionStart bootstrap decision and installed-state skip SHALL complete within 2 seconds without network I/O.
- Worker health/reaper evaluation SHALL complete within 15 seconds; every individual worker request SHALL use a bounded deadline and cancellation.
- Explicit post-install verification of manifest, MCP, worker, and version SHALL complete within 10 seconds after the installer process has completed, excluding package download/install time.

## Security

- Process termination SHALL be available only on native Windows and only for a dead-owner, dead-parent, claude-mem-signature process selected by the pure reaper decision.
- Default Docker BDD SHALL make no network package download or real installation.
- Real-install verification SHALL require explicit network opt-in and an isolated `HOME`/`USERPROFILE`; it SHALL not touch the invoking user's state.

## Reliability

- All hook failure paths SHALL fail open with exit code 0 and a continue payload.
- State/report writes, including bootstrap lock and provenance report, SHALL use temp-file plus atomic move.
- A failed manifest, MCP, worker, or version probe SHALL be represented independently and SHALL not produce a verified aggregate status.
- Windows and WSL/Linux behavior SHALL be explicitly separated: WSL/Linux health paths are non-destructive.

## Usability

- Doctor output SHALL provide a one-line actionable reason and remediation for absent installation, malformed config, unreachable worker, and unverified version.
- Install/verification output SHALL present component status for plugin, version, MCP, worker, hooks, and final outcome.
- Successful hooks SHALL remain silent; warnings SHALL go to stderr and shall not block SessionStart.
