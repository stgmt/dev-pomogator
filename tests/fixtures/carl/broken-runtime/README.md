# F-2 — Broken CARL runtime fixture policy

This directory documents induced broken-runtime cases for future CARL fail-open BDD steps. These fixtures are **not** producer-shape evidence and must never be used to prove CARL output contracts or benchmark thresholds.

## Intended failure classes

Future step definitions may generate per-scenario temp commands or files for these classes:

| Diagnostic code | Induced condition | Expected behavior |
|-----------------|------------------|-------------------|
| `missing-runtime` | Hook points to a missing command or missing CARL runtime path. | Hook fails open and injects the agent-visible warning. |
| `timeout` | Hook points to a shim that exceeds the configured timeout. | Hook fails open and injects the agent-visible warning. |
| `malformed-output` | Hook returns non-JSON or JSON without the expected hook output shape. | Hook fails open and injects the agent-visible warning. |
| `unsupported` | Platform or dispatcher capability is intentionally marked unsupported. | Hook/doctor reports unsupported/deferred, not healthy. |
| `exception` | Runtime shim throws or exits non-zero unexpectedly. | Hook fails open and injects the agent-visible warning. |

## Required warning

Broken CARL paths must remind the AI agent to tell the user that CARL guidance/recall was unavailable:

```text
CARL did not run; tell the user CARL guidance/recall was unavailable.
```

## Boundary

Use `tests/fixtures/carl/real-output/README.md` and the captured `manifest.json` / stdout samples for real CARL producer evidence. Use this directory only to design deterministic negative cases for FR-4 and doctor degraded-state handling.
