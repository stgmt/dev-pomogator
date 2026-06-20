# Non-Functional Requirements (NFR)

## Performance

- The evidence check is in-process line scanning over the plan markdown; it adds negligible time to validation (no I/O beyond reading the plan file).

## Security

- N/A — no secrets, no network; the check operates on the local plan file only.

## Reliability

- The check runs in Phase 4 (warnings, non-blocking); a missing «Источники / Пруфы» section or a flagged claim never blocks ExitPlanMode, so legacy plans keep working.

## Usability

- Three simple proof markers — `[src:url]` (web fact), `[ref:file:line]` (code fact), `[cmd:output]` (verified by running) — cover every external/technical fact a plan can state.
