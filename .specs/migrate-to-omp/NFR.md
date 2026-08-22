# Non-Functional Requirements

## Performance

The disposable OMP migration profile SHALL record setup, install, reload/restart and scenario durations separately so a slow environment cannot be mistaken for a product failure.

## Security

The migration SHALL not copy secrets into the marketplace catalog, extension source, fixture logs or MCP transcript. The fixture uses project-scope state only.

## Reliability

The project-scope installation test SHALL record marketplace root, resolved plugin root, lock entry and loaded extension path. The Node launcher, environment substitution and native dependency boundary for the MCP server SHALL be exercised. Rollback SHALL preserve an unrelated sentinel spec byte-for-byte.

## Usability

The runbook SHALL name the activation, reload/restart and rollback steps, including the evidence required before an operator treats a wave as enabled or recovered.

## Additional Contracts

### NFR-1: Hook semantic preservation (FR-4)

Every enabled hook mapping SHALL record event ordering, returned result shape, UI/headless policy and an executable regression. An unmapped hook SHALL not load silently.
