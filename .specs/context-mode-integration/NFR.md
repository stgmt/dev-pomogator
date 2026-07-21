# Non-Functional Requirements (NFR)

## Performance

- SessionStart setup SHALL complete the synchronous path in under 500 ms when no repair is needed.
- Doctor quick classification SHALL avoid network calls and SHALL complete in under 2 seconds on a normal Windows workstation.
- Slow repair or install-adjacent work SHALL run only after a retry lock/backoff decision and SHALL never hold the Claude Code hook budget hostage.

## Security

- MCP-only configuration SHALL preserve unrelated user settings and SHALL create a timestamped backup before editing global Claude configuration.
- The feature SHALL NOT store secrets, API tokens, or OAuth values in spec artifacts, logs, or doctor output.
- Any optional force-ctx hook SHALL fail open and SHALL NOT deny edit-relevant source/config/spec reads.

## Reliability

- Every hook path SHALL exit 0 on malformed JSON, missing files, unavailable runtime, failed process probe, or failed handshake.
- Classification SHALL be evidence-based and SHALL not collapse distinct root causes into a generic restart recommendation.
- Fixtures for config parsing SHALL mirror real artifact shapes rather than hand-typed simplified examples.

## Usability

- Missing-install output SHALL be actionable: exact commands, why they must be run by the user, and what to verify afterward.
- Recovery output SHALL order steps by least disruptive first: heal, `/mcp` reconnect, verify, full restart last.
- Documentation SHALL state the honest value boundary: useful for large raw artifacts and session survival, not universal daily usage reduction.
