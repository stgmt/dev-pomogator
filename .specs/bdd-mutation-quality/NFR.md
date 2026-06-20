# Non-Functional Requirements (NFR)

## Performance

- BDD mutation of one file completes in minutes on all cores (788 mutants ≈ 13 min on 24), not ~2.5h serial.

## Security

- The judge reads its token only from env / `.env*`; fail-open (no token → silent); never logs secrets.

## Reliability

- The judge hook is builtins-only + fail-open: a non-BDD edit, missing token, or unreachable endpoint never blocks or crashes the edit.

## Usability

- The `stryker-mutation` skill carries the run/interpret recipe + persisted last score, so the setup is not re-derived each session.
