# Requirements Traceability — spec-dashboard

## Functional Requirements

- [FR-1: Status-first kanban](FR.md#fr-1-название)
- [FR-2: Complete trace](FR.md#fr-2-название)
- [FR-3: Analysis views](FR.md#fr-3-название)
- [FR-4: Honest semantics](FR.md#fr-4-название)
- [FR-5: Secure read-only adapter and vendored Plane shell](FR.md#fr-5-название)

## Verification Matrix

| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |
|---|---|---|---|---|---|
| CHK-FR1-01 | Task cards use bounded inventory and separate authored from verified state | FR-1, AC-1, @feature1, UC-1 | Integration test | Draft | SPECDASH001_01 real browser + list_tasks |
| CHK-FR1-02 | The fixed 1,000-task corpus remains bounded and within p95 budgets | FR-1, AC-1, @feature1, UC-1 | Integration test | Draft | SPECDASH001_07; NFR-Perf-1/NFR-Scale-1 |
| CHK-FR2-01 | Task detail composes only provider-supported typed trace surfaces | FR-2, AC-2, @feature2, UC-2 | Integration test | Draft | SPECDASH001_02; history unavailable until provider support |
| CHK-FR3-01 | Readiness, gaps, impact and evidence use bounded real routes | FR-3, AC-3, @feature3, UC-3 | Integration test | Draft | SPECDASH001_03; find_refs direction |
| CHK-FR4-01 | Provider statuses remain honest | FR-4, AC-4, @feature4, UC-4 | Integration test | Draft | SPECDASH001_04; not-run outside result enum |
| CHK-FR5-01 | Loopback adapter is allowlisted, read-only, redacted, and backed by the pinned clean fork | FR-5, AC-5, @feature5, UC-5 | Integration test | Draft | SPECDASH001_05, SPECDASH001_09, and SPECDASH001_10; exact commit and runtime boundary |
| CHK-FR5-02 | Provider, transport, browser-runtime, CORS, authentication, and not-found failures remain typed | FR-5, AC-5, @feature5, UC-6 | Integration test | Draft | SPECDASH001_06; safe diagnostic IDs and bounded retry |
| CHK-FR5-03 | Node 22 distributable, AGPL notices, corresponding source, and dependency-absent startup are real-artifact checks | FR-5, AC-5, @feature5, UC-7 | Integration test | Draft | SPECDASH001_08, SPECDASH001_11, and SPECDASH001_13; Node >=22.18, pnpm 11.3.0, PROVENANCE.json, COPYRIGHT.txt |
| CHK-FR5-04 | Real browser keyboard, focus, reduced-motion, security, performance, cleanup, and upstream-sync contracts hold | FR-5, AC-5, @feature5, UC-5 | Integration test | Draft | SPECDASH001_01, SPECDASH001_07, SPECDASH001_09, and SPECDASH001_12; no Plane service or runtime auto-sync |

## Route → Provider → Scenario Matrix

| Browser route or operation | Existing provider composition | Scenario |
|---|---|---|
| `GET /api/specs` | `list_specs` | SPECDASH001_01 |
| `GET /api/specs/:spec/tasks?status=&cursor=&limit=` | bounded `list_tasks` for all authored statuses | SPECDASH001_01, SPECDASH001_07 |
| `GET /api/specs/:spec/status` | `get_spec_status(view=status)` | SPECDASH001_01, SPECDASH001_04 |
| `GET /api/specs/:spec/coverage` | `get_spec_status(view=coverage)` | SPECDASH001_03 |
| `GET /api/specs/:spec/trace/:nodeId` | task `get_node`; requirement `get_trace`; bounded `find_refs`; scenario `get_scenario_trace` | SPECDASH001_02 |
| `GET /api/specs/:spec/scenarios/:scenarioId/trace` | `get_scenario_trace` | SPECDASH001_03, SPECDASH001_04 |
| `GET /api/specs/:spec/impact/:nodeId` | bounded `find_refs` with incoming/outgoing direction | SPECDASH001_03 |
| `GET /api/specs/:spec/evidence` | coverage + trace + scenario trace + `evidenced-by`/EvidenceNode fields from `get_node` | SPECDASH001_03, SPECDASH001_04 |
| `GET /licenses/plane` | `vendor/plane/PROVENANCE.json` + `COPYRIGHT.txt` | SPECDASH001_11 |
| `GET /source/plane` | corresponding-source archive or stable URL for pinned fork plus local patches | SPECDASH001_11 |
| `vendor/plane/PROVENANCE.json` and `plane-upstream` | pinned upstream metadata, local-patch manifest, manual sync policy | SPECDASH001_10, SPECDASH001_12 |
| browser DOM/keyboard/accessibility | headless Chromium over the real loopback server | SPECDASH001_01, SPECDASH001_09 |
| built bundle with hidden `node_modules` | Node >=22.18 launcher + static assets | SPECDASH001_08, SPECDASH001_13 |
| non-allowlisted, mutation, cross-origin, or traversal operation | rejected before MCP dispatch | SPECDASH001_05, SPECDASH001_09 |
| unavailable/transport/runtime/not-found result | typed adapter or browser error mapping | SPECDASH001_06 |

## Verification Process

### How CHKs are verified
1. Every CHK is attached to an AC and real Cucumber scenario.
2. Status changes only after the Docker integration scenario passes against the real adapter/MCP boundary or, for fork controls, against the real vendored source and bundled distributable.
3. Clean-fork, license, upstream-sync, Node 22 build, and dependency-absent checks SHALL inspect real artifacts; synthetic assertions or silent skips are insufficient.

### Status lifecycle
`Draft → In Progress → Verified → Blocked` (regression takes `Verified → Blocked` with an issue link in Notes).

### Review cadence
- Phase 2 STOP: all CHKs are `Draft`.
- Phase 3 STOP: implementation tasks exist for every CHK.
- Implementation end: 100% are `Verified` or `Blocked` with an issue link.

## Summary Counts

- Total CHKs: 9
- Verified: 0
- In Progress: 0
- Draft: 9
- Blocked: 0
