# Non-Functional Requirements

## Security

- Default bind MUST be loopback.
- Non-loopback bind MUST require an explicit proxy token.
- Secrets MUST stay in user-local config or env files outside git.
- Logs MUST redact authorization headers and tokens.

## Reliability

- All hooks and autostart helpers MUST fail open.
- The installer MUST never kill an existing unrelated proxy process.
- Repair actions MUST be idempotent.

## Performance

- Headroom overhead SHOULD be reported from `/stats.overhead`.
- Synthetic verification SHOULD complete within 60 seconds on a normal machine
  after model warmup.
- Compression worker/concurrency settings MUST be bounded.

## Usability

- The first install flow MUST present the topology and settings changes before
  applying them.
- Doctor output MUST be short by default and include a path to detailed logs.
- Dashboard URL MUST be printed after successful install.

## Maintainability

- Version-specific flags MUST be computed from `headroom proxy --help`.
- Docker and host fallback paths SHOULD share the same doctor parser.
- Tests SHOULD use fixtures for `/stats`, `/health`, and Claude settings JSON.

