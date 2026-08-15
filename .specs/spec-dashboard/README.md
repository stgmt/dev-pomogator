# Spec Dashboard

The spec-dashboard is a read-only, status-first browser workspace for reviewing one or more specifications through the canonical spec-generator-v4 MCP graph. It presents a Jira-like kanban first, then lets reviewers inspect typed requirement traces, coverage gaps, directed impact, scenario evidence, freshness, and safe recovery states without editing the spec corpus or inferring green from missing data.

The browser shell is a forked, vendored, and adapted copy of `makeplane/plane` `v1.4.1` at commit `5662b761062b0b2f9d42a6578b55481b5b069792`, not merely a reference to Plane. The retained Plane board, UI, design-system, and runtime shell are adapted to this read-only product boundary; Plane backend, domain, authentication, workspace, and project data are replaced or bypassed in favor of the spec-generator-v4 SpecGraph MCP.

## Key ideas

- **Task kanban first, graph second:** bounded `list_tasks` pages produce one card per canonical Task. Columns use authored `todo`, `ready`, `in-progress`, `done`, and `blocked`; evidence-derived `verified_status`/readiness remains visibly separate. Graph neighborhoods are lazy-loaded for impact exploration.
- **Evidence stays honest:** status, scenario results, freshness, provenance, availability, bounds, truncation, and provider errors are preserved from existing MCP read surfaces. Not-run is represented outside the scenario-result enum, and an authored `done` is not proof of verification.
- **Forked Plane shell, SpecGraph data:** the retained Plane board/UI/design-system/runtime shell supplies the interaction surface, while the loopback adapter's allowlisted `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, and `find_refs` calls are the only dashboard data provider. Plane services, Plane authentication, Plane workspace/project data, and Plane backend/domain data are not contacted or required at runtime.
- **Explicit read-only boundary:** the browser uses loopback same-origin HTTP routes backed by a server-side stdio MCP adapter. Mutation and unknown tools are rejected before dispatch.
- **Safe and bounded by default:** repository-relative POSIX code paths are validated, sensitive paths and credentials are redacted, collections are bounded, continuation metadata is opaque, and failures carry typed categories with safe diagnostic IDs.
- **Provenance and source are distributable:** `vendor/plane/PROVENANCE.json`, the `plane-upstream` remote, `vendor/plane/COPYRIGHT.txt` with the `AGPL-3.0-only` notice, and unauthenticated corresponding-source access are part of the shipped boundary. Proprietary components, closed-source bundles, credentialed services, and unreviewed binaries are excluded.

## Where the implementation lives

- **Forked shell and provenance:** `vendor/plane/board/**`, `vendor/plane/ui/**`, `vendor/plane/design-system/**`, `vendor/plane/runtime/**`, `vendor/plane/PROVENANCE.json`, `vendor/plane/COPYRIGHT.txt`, and `vendor/plane/source/`
- **Server and provider boundary:** `tools/spec-dashboard/server.ts`, `tools/spec-dashboard/mcp-adapter.ts`, `tools/spec-dashboard/dto.ts`
- **Browser UI and packaged assets:** `tools/spec-dashboard/ui/index.html`, `tools/spec-dashboard/ui/app.ts`, `tools/spec-dashboard/ui/styles.css`, and `tools/spec-dashboard/ui/app.bundle.js`
- **DTO contract mirror:** `tools/spec-dashboard/spec-dashboard_SCHEMA.md`
- **BDD integration:** `tests/features/spec-dashboard/SPECDASH001_spec_dashboard.feature`, `tests/step_definitions/spec-dashboard.steps.ts`, and reused `tests/hooks/**/*.ts`; executable scenarios cover SPECDASH001_01 through SPECDASH001_13
- **Producer-shaped fixtures:** `tests/features/spec-dashboard/fixtures/status-and-trace.json`
- **Build and Docker BDD wiring:** `package.json`, `pnpm-lock.yaml`, and `cucumber.json`
- **Canonical provider contract:** `spec-generator-v4` (`.specs/spec-generator-v4/README.md`; the dashboard remains its read-only consumer)

## Build and launch contract

The fork build requires Node `>=22.18` and pnpm `11.3.0` with a frozen lockfile. `npm run build:dashboard` (or the documented pnpm equivalent) produces the shipped `tools/spec-dashboard/server.bundle.mjs` and browser `tools/spec-dashboard/ui/app.bundle.js`. The canonical local command is `node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0`; the server reports the selected loopback URL and serves the bundled browser asset. The packaged artifacts must start with project `node_modules` hidden and must not fall back to Plane services or source TypeScript.

Browser-visible BDD uses pinned headless Chromium through the centralized Docker runner. The test image installs the browser and Linux dependencies for non-root `testuser`; host Cucumber execution remains unsupported. SPECDASH001_10 through SPECDASH001_13 are executable real-artifact checks for the fork boundary, AGPL/source distribution, manual upstream synchronization, Node/pnpm build, packaged runtime, and dependency-absent startup.

## Operating boundaries

The adapter is read-only and does not edit specifications, execute tests, mutate graph state, manage browser credentials, or expose provider command arguments. The initial MVP is loopback-only and keeps MCP process/session state on the server. The spec-generator-v4 MCP remains the sole authority for graph structure, authored task status, evidence-derived verification, lifecycle values, scenario results, freshness, provenance, and evidence. The fork's upstream synchronization is manual: fetch, review conflicts, update the pinned commit and local-patch manifest, rebuild, and rerun BDD; runtime auto-sync is prohibited.

The package exposes unauthenticated same-origin `/licenses/plane` and `/source/plane` routes for the AGPL notice and corresponding source metadata/archive. The corresponding-source response identifies the exact pinned fork and local patches without exposing credentials or filesystem paths.

## Where to read next

- [User stories](USER_STORIES.md)
- [Use cases](USE_CASES.md)
- [Requirements traceability](REQUIREMENTS.md)
- [Design](DESIGN.md)
- [File changes](FILE_CHANGES.md)
- [DTO schema](spec-dashboard_SCHEMA.md)
- [Tasks](TASKS.md)
- [Changelog](CHANGELOG.md)
