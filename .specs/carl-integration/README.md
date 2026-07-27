# CARL Integration

CARL integration packages CARL rules/recall support as a managed dev-pomogator integration. The first supported path is Claude Code: dev-pomogator installs managed CARL artifacts, wires a real hook consumer, reports degraded states honestly, and lets `pomogator-doctor` repair only the managed pieces. Codex support is intentionally gated until the context-menu Codex launcher and deterministic hook dispatcher prerequisites exist.

## Lifecycle

1. **Install/refresh** — create or refresh only dev-pomogator-managed CARL artifacts with owner/version markers.
2. **Runtime consume** — invoke the managed CARL runner through the distributed Claude Code hook path, not through a test-only side channel.
3. **Fail open visibly** — when CARL cannot run, keep the main agent session alive and inject an agent-visible warning that CARL guidance/recall was unavailable.
4. **Diagnose and repair** — `pomogator-doctor` classifies CARL as `healthy`, `missing`, `stale`, `broken-runtime`, `unsupported`, `user-conflict`, or `repairable`, and refreshes only managed artifacts when repair is safe.
5. **Review and benchmark** — report verified/unverified CARL claims and accept recall benchmark thresholds only after a real CARL artifact or approved external requirement provides evidence.



## Finalization status

The finalization verdict is **PARTIAL / NOT_READY**. CARL001_13–15 are canonical reconciliation scenarios added to the spec feature inventory and traced to FR-1, AC-1, and CHK-FR1-01. They are intentionally retained as BDD scenarios, but their canonical evidence is stale or unverified; they must not be treated as green. The related implementation and verification tasks remain partial (`IN_PROGRESS`) until Docker BDD evidence is refreshed through the shared `cucumber.json` path and the adaptation/SessionStart ordering mutation checks are independently demonstrated.

Coverage is 9 FR, 9 AC, 15 BDD scenarios, and 12 tasks. The current evidence includes explicit degraded/fake-green protections, but does not justify a completion claim. The benchmark and Russian evaluation remain bounded by their documented real-artifact and runtime-readiness gaps.
## Scope

In scope:

- Claude Code managed CARL install and repair path.
- Real runtime-consumer proof for the distributed hook command.
- Fail-open warning behavior for missing dependencies, unsupported environments, malformed output, timeouts, and runtime failures.
- Doctor health/repair integration with managed markers and user-config preservation.
- Codex status gating that leaves Claude Code CARL behavior independent.
- Review/reporting and recall benchmark scaffolding that refuses invented numeric thresholds.

## Non-goals

- No new vitest or other non-BDD test files; CARL coverage is BDD-only through `.feature`, step definitions, and fixtures.
- No fake-green state where files on disk imply CARL is healthy without exercising the hook runtime consumer.
- No silent overwrite of user-owned CARL or hook configuration outside managed regions.
- No Codex CARL implementation that bypasses the context-menu launcher, project-local artifact model, or deterministic dispatcher.
- No numeric recall threshold until the real CARL baseline or an approved external requirement exists.

## Current status

- Spec status: active.
- Structural coverage: 9 FR, 9 AC, 15 scenarios, and 12 implementation tasks; spec graph traceability currently has 0 `UNCOVERED_FR`, 0 `TASK_UNTESTED`, and 0 `UNTAGGED_SCENARIO` gaps.
- Test evidence: scenarios are authored but not run yet; current lifecycle remains `TESTS_NOT_RUN` until Docker BDD ingests CARL results.
- Captured fixture evidence: sibling CARL producer output and benchmark provenance are recorded under `tests/fixtures/carl/`; this verifies output shape and benchmark behavior for the captured sibling implementation, not that dev-pomogator already packages or wires CARL.
- Key unresolved evidence: final dev-pomogator CARL source/vendor path, runtime packaging, hook command contract, recall backend durability, project language metadata schema, Russian coverage generation, and stable numeric pass thresholds remain `[NEEDS_CONFIRMATION]` or `[UNVERIFIED]`.
- Codex path: blocked/deferred until context-menu Codex launcher and Codex hook dispatcher prerequisites are ready.

## Key docs

- [FR.md](FR.md) — functional requirements for managed install, runtime proof, warning injection, doctor repair, Codex gating, reporting, and benchmark guard.
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS acceptance criteria for FR-1 through FR-9.
- [DESIGN.md](DESIGN.md) — component model, managed artifact rules, hook flow, doctor states, Codex sequencing, and BDD infrastructure.
- [RESEARCH.md](RESEARCH.md) — verified repo context and still-unverified external CARL facts.
- [TASKS.md](TASKS.md) — TDD implementation plan: real-artifact capture, BDD red layer, Claude Code install/runtime, warning path, doctor repair, Codex gate, benchmark/report, and final verification.
- [carl-integration.feature](carl-integration.feature) — spec-level BDD scenarios and @feature trace tags.
- [FILE_CHANGES.md](FILE_CHANGES.md) — planned implementation and verification files.
- [CHANGELOG.md](CHANGELOG.md) — spec history.
