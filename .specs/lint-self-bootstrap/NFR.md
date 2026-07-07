# Non-Functional Requirements (NFR)

## Performance

- The lint bootstrap path SHALL skip dependency installation when the local eslint executable already exists.
- The dependency presence check SHALL use filesystem checks only and SHALL not run network operations on every lint invocation.

## Security

- The lint bootstrap path SHALL install only dependencies declared in `package.json` and locked in `package-lock.json`.
- The implementation SHALL NOT download or execute an unpinned global/latest eslint version outside the project dependency model.

## Reliability

- Fresh checkouts SHALL receive a deterministic dependency setup path before lint execution.
- Install failures SHALL preserve the original exit code and expose the command/log needed to diagnose the setup problem.

## Usability

- A missing eslint executable SHALL produce a clear dev-pomogator setup message, not a raw shell `command not found` / Windows `not recognized` error.
- Users SHALL NOT need to know hidden manual setup steps before invoking the supported lint verification path.
