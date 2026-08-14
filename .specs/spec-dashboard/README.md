# Spec Dashboard

The spec-dashboard is a read-only, status-first browser workspace for reviewing one or more specifications through the canonical spec-generator-v4 MCP graph. It presents a Jira-like kanban first, then lets reviewers inspect typed requirement traces, coverage gaps, directed impact, scenario evidence, freshness, and safe recovery states without editing the spec corpus or inferring green from missing data.

## Key ideas

- **Task kanban first, graph second:** bounded `list_tasks` pages produce one card per canonical Task. Columns use authored `todo`, `ready`, `in-progress`, `done`, and `blocked`; evidence-derived `verified_status`/readiness remains visibly separate. Graph neighborhoods are lazy-loaded for impact exploration.
- **Evidence stays honest:** status, scenario results, freshness, provenance, availability, bounds, truncation, and provider errors are preserved from existing MCP read surfaces. Not-run is represented outside the scenario-result enum, and an authored `done` is not proof of verification.
- **Explicit read-only boundary:** the browser uses loopback same-origin HTTP routes backed by a server-side stdio MCP adapter. Only `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, and `find_refs` are allowlisted; mutation and unknown tools are rejected before dispatch.
- **Safe and bounded by default:** repository-relative POSIX code paths are validated, sensitive paths and credentials are redacted, collections are bounded, continuation metadata is opaque, and failures carry typed categories with safe diagnostic IDs.
- **Clean-room interaction model:** Plane references inform interaction research only. This feature copies no Plane source; any future reuse requires separate legal review and approval.

## Where the implementation lives

- **Server and provider boundary:** `tools/spec-dashboard/server.ts`, `tools/spec-dashboard/mcp-adapter.ts`, `tools/spec-dashboard/dto.ts`
- **Browser UI:** `tools/spec-dashboard/ui/index.html`, `tools/spec-dashboard/ui/app.ts`, `tools/spec-dashboard/ui/styles.css`
- **DTO contract mirror:** `tools/spec-dashboard/spec-dashboard_SCHEMA.md`
- **BDD integration:** `tests/features/spec-dashboard/SPECDASH001_spec_dashboard.feature`, `tests/step_definitions/spec-dashboard.steps.ts`, and reused `tests/hooks/**/*.ts`
- **Producer-shaped fixtures:** `tests/features/spec-dashboard/fixtures/status-and-trace.json`
- **Build and Docker BDD wiring:** `package.json` and `cucumber.json`
- **Canonical provider contract:** `spec-generator-v4` (`.specs/spec-generator-v4/README.md`; the dashboard remains its read-only consumer)

## Build and launch contract

`npm run build:dashboard` produces the shipped Node 20 `tools/spec-dashboard/server.bundle.mjs` and browser `tools/spec-dashboard/ui/app.bundle.js`. The canonical local command is `node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0`; the server reports the selected loopback URL and serves the bundled browser asset. These artifacts are inside the package's existing `tools` distribution boundary and must run with project `node_modules` hidden.

Browser-visible BDD uses pinned headless Chromium through the centralized Docker runner. The test image installs the browser and Linux dependencies for non-root `testuser`; host Cucumber execution remains unsupported.

## Operating boundaries

The adapter is read-only and does not edit specifications, execute tests, mutate graph state, manage browser credentials, or expose provider command arguments. The initial MVP is loopback-only and keeps MCP process/session state on the server. The spec-generator-v4 MCP remains the sole authority for graph structure, authored task status, evidence-derived verification, lifecycle values, scenario results, freshness, provenance, and evidence.

## Where to read next

- [User stories](USER_STORIES.md)
- [Use cases](USE_CASES.md)
- [Requirements traceability](REQUIREMENTS.md)
- [Design](DESIGN.md)
- [File changes](FILE_CHANGES.md)
- [DTO schema](spec-dashboard_SCHEMA.md)
- [Tasks](TASKS.md)
- [Changelog](CHANGELOG.md)
