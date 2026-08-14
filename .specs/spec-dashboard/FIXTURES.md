# Fixtures — spec-dashboard

## Fixture strategy

Fixtures SHALL represent real spec-generator-v4 MCP response envelopes and real Cucumber NDJSON result shapes rather than invented browser-only objects. Each fixture records its producer, capture date, source/reference, expected state, and redaction expectations.

## Fixture inventory

| ID | Artifact | Producer/source | Scope | Expected use |
|---|---|---|---|---|
| F-1 | Status response with `SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, `GREEN` | spec-generator-v4 `get_spec_status` | Per-scenario | lifecycle rendering without fallback-to-green |
| F-2 | Coverage response with passed/pending/undefined/unknown/stale buckets and task `verified_status` | spec-generator-v4 coverage view | Per-scenario | honest evidence-derived verification joined to authored status by canonical task ID |
| F-3 | Bounded task pages containing all five authored statuses | spec-generator-v4 `list_tasks` | Per-board | canonical task cards, cursor pagination, and authored lifecycle |
| F-4 | Requirement trace plus bounded incoming/outgoing references and unavailable history | spec-generator-v4 `get_trace`, `find_refs`, `get_node` | Per-card | provider-supported detail, direction, and honest unsupported state |
| F-5 | Scenario trace with pass, failing step/error, expired trace chunk | spec-generator-v4 `get_scenario_trace` | Per-scenario | evidence provenance/staleness/error detail without raw chunk paths |
| F-6 | Provider error envelopes for MCP, transport, browser/runtime, CORS, not-found, invalid request | Adapter/browser integration capture | Per-request | stable typed errors and safe diagnostic IDs |
| F-7 | Redaction corpus containing credential, token, raw path, evidence path, and command-line-like values | Security test producer | Per-request | prove DTO, URL, DOM, error, and log redaction |
| F-8 | Fixed bounded 1,000-task-card corpus with identity and digest | producer-shaped `list_tasks` and coverage capture | Corpus | pagination/virtualization, state joins, and truncation metadata |
| F-9 | Built package with hidden `node_modules` | `server.bundle.mjs` + `ui/app.bundle.js` deps-absent capture | Package | prove canonical Node 20 loopback launcher and shipped browser asset |

## Provenance requirements

- Fixtures SHALL include `producer`, `capturedAt`, `sourceRef`, and `groundTruth` metadata.
- Fixture updates SHALL preserve the real producer shape and SHALL be reviewed against an independent expected result; hand-authored fields that do not exist in the producer output are prohibited.
- F-1 through F-5 and F-8 SHALL be refreshed when spec-generator-v4 task/trace/reference/status DTOs or result enums change; the dashboard SHALL not redefine those contracts.
- F-8 records the fixed 1,000-task corpus identity, digest, Node 20 version, pinned Chromium version, concurrency `1`, warmup/sample counts, and failed/partial samples.
- F-9 is captured from the packaged `tools` tree with project `node_modules` hidden; a source-tree or `tsx` launch is not acceptable ground truth.
