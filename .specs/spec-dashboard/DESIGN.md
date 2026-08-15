# Design — spec-dashboard

## Architecture

The dashboard is a read-only web application backed by an explicit server-side adapter. The browser talks only to same-origin HTTP endpoints. The adapter owns the stdio process boundary, starts or connects to the spec-generator-v4 MCP server, validates request identifiers, bounds responses, redacts sensitive fields, and maps MCP results into stable browser DTOs. The adapter never exposes mutation tools.

The UI uses a Jira-like task kanban as the primary surface and a lazy-loaded local graph as a secondary surface. Bounded `list_tasks` reads produce one card per canonical Task across all five authored statuses. Card columns use authored task status, while `get_spec_status(view=coverage)` supplies evidence-derived `verified_status`/readiness as a separate badge so authored completion cannot masquerade as verified evidence. Card detail resolves the task through `get_node`, each referenced requirement through `get_trace`, complete incoming/outgoing relationships through bounded `find_refs`, and scenario runtime detail through `get_scenario_trace`. The provider currently has no canonical history surface, so history is explicitly unavailable rather than synthesized. Readiness, coverage-gap, impact, and evidence-report views reuse the same DTO identifiers and evidence metadata instead of maintaining a second graph or status engine.

## Components

1. **Browser UI** — task kanban, card detail, graph neighborhood, readiness, coverage-gap, impact, and evidence-report views; keyboard navigation and explicit authored-versus-verified state labels.
2. **Loopback same-origin browser API** — read-only routes for spec inventory, bounded task pages, status/counts/coverage, composed trace, scenario trace, impact, and evidence reports; bounded pagination and error envelopes.
3. **MCP adapter** — stdio lifecycle; exact read allowlist `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, `find_refs`; request validation, timeout/size limits, typed error mapping, redaction, and canonical DTO mapping.
4. **Build and launch artifacts** — esbuild produces self-contained `server.bundle.mjs` for Node 20 and browser-executable `ui/app.bundle.js`; the canonical local command binds `127.0.0.1` and may request an ephemeral port.
5. **spec-generator-v4 MCP** — sole parser, graph, lifecycle, status, test-result, staleness, provenance, and evidence source; not modified by this spec.
6. **BDD integration boundary** — Cucumber.js 12 executes the nine SPECDASH001 scenarios through the real adapter/MCP boundary and headless Chromium where the contract is browser-visible; host BDD runs are prohibited and no new non-BDD test files are introduced.

## Data Flow

1. Browser requests the spec inventory, then bounded task pages with explicit `statuses=[todo,ready,in-progress,done,blocked]`, cursor, and limit.
2. The loopback same-origin API validates identifiers and forwards bounded requests to the stdio MCP adapter.
3. The kanban joins authored task status from `list_tasks` with evidence-derived task verification from `get_spec_status(view=coverage)` by canonical task ID; the two fields remain separate.
4. Opening a card reads the Task through `get_node`, resolves each `requirements[]` reference through `get_trace`, loads complete directed neighbors through bounded `find_refs`, and loads scenario run detail through `get_scenario_trace`. No client or adapter reconstructs a second graph, and no unsupported history is synthesized.
5. Adapter maps responses into versioned DTOs, attaches retrieval/freshness metadata, redacts sensitive data, and returns an error envelope when needed. For composed routes, the envelope is `partial` when any bounded provider read fails; each affected collection retains its own `availability` and typed error. The whole route is an error only when a required identity/root read fails. A provider failure is never coalesced into an empty successful collection.
6. UI renders a state-specific view and links from task cards to requirement trace, evidence, impact, and safe next actions without writing to the spec corpus.

## API Contract

All routes are same-origin and read-only. JSON envelopes include `schemaVersion`, `requestId`, and either `data` or `error`.

| Route | Purpose | Source MCP read operation |
|---|---|---|
| `GET /api/specs` | Bounded spec inventory | `list_specs` |
| `GET /api/specs/:spec/tasks?status=&cursor=&limit=` | Task-card pages; caller requests all five authored statuses explicitly | bounded `list_tasks` |
| `GET /api/specs/:spec/status` | Lifecycle, counts, gaps, phases | `get_spec_status(view=status)` |
| `GET /api/specs/:spec/coverage` | Scenario buckets and evidence-derived task verification | `get_spec_status(view=coverage)` |
| `GET /api/specs/:spec/trace/:nodeId` | Task plus referenced requirement trace, supported collections, and directed relationships | `get_node` + `get_trace` + bounded `find_refs`; scenario detail via `get_scenario_trace` |
| `GET /api/specs/:spec/scenarios/:scenarioId/trace` | Run, source, opaque trace status, failing step/error | `get_scenario_trace` |
| `GET /api/specs/:spec/impact/:nodeId` | Directed incoming/outgoing neighbors | bounded `find_refs` |
| `GET /api/specs/:spec/evidence` | Evidence report and freshness | coverage + trace + scenario trace + EvidenceNode via `get_node` |

Mutation routes SHALL return a typed `READ_ONLY` error. Provider failures SHALL map to `PROVIDER_UNAVAILABLE`, `TRANSPORT_ERROR`, `BROWSER_RUNTIME_ERROR`, `AUTHENTICATION_ERROR`, `CORS_ORIGIN_REJECTED`, `NODE_NOT_FOUND`, or `INVALID_REQUEST`, each with a safe diagnostic ID and no secret/path payload.

## DTO Contract

- `TaskCardDto` includes canonical task ID/title/phase/requirements, authored task status, evidence-derived `verifiedStatus`/readiness, and last evidence time; authored and derived fields are never collapsed.
- `StatusDto` includes `lifecycle`, `counts`, `gaps`, `phases`, `lastRun`, `providerState`, and retrieval/freshness metadata.
- `TraceDto` includes canonical node identity/type/title, provider-supported AC/story/decision/scenario/task/file/evidence collections, full directed relationship entries from `find_refs`, and per-collection availability. `history` remains `unavailable` until a versioned provider history surface exists.
- `ScenarioEvidenceDto` includes scenario ID, canonical result, run ID/time/source, opaque trace status, failing step/error category, and staleness; raw trace storage paths are never browser DTO fields.
- `EvidenceReportDto` includes evidence state, provenance, source, run/timestamp, freshness, claimed-only/execution-verified classification, and unknown/unavailable markers.
- `ErrorDto` includes stable `code`, safe `diagnosticId`, `retryable`, and user-safe `message`; it excludes credentials, raw paths, command lines, and exception stacks.
- Every bounded collection carries `items`, `total` when known, `nextCursor` or `truncated`, and `availability`.

## Status and Empty-State Rules

`SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, and `GREEN` are lifecycle values, not UI guesses. A present empty collection means the provider answered with zero items. `not_run` means no canonical execution exists. `stale` means a prior result exists but freshness validation failed or the source changed. `partial` means only a subset of requested data is available. `unavailable` means the provider could not supply that collection. `provider_error` means the request failed and is represented by `ErrorDto`. None may be rendered as `GREEN` or `PASSED` by fallback logic.

## Security and Licensing

The adapter uses least-privilege read-only calls, validates identifiers, bounds child processes, and redacts sensitive values before logging or returning data. Plane research is used only for clean-room interaction reference: the externally researched Plane preview contained `LICENSE.txt` (AGPL-3.0), a kanban issue-layout component, and an issue-detail root component. Those are upstream reference artifacts, not local repository paths or implementation dependencies. Initial scope copies no Plane code and records the mutable-preview risk; legal approval is a prerequisite for any future AGPL reuse.

### Mixed composed-route responses

A composed route such as coverage, impact, or evidence returns a `partial` route envelope when any bounded provider read fails after the required identity/root read succeeds. Each collection retains its own `availability` and typed error metadata, while successful collections remain inspectable. The whole route returns an error only when the required identity/root read fails. A provider failure is never converted into an empty successful collection.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

- **Framework:** Cucumber.js 12 through the existing centralized Docker BDD runner; Playwright library drives pinned headless Chromium for browser-visible contracts.
- **Feature source:** `spec-dashboard.feature`, mirrored to `tests/features/spec-dashboard/SPECDASH001_spec_dashboard.feature` during implementation.
- **Step definitions:** `tests/step_definitions/spec-dashboard.steps.ts`; API steps exercise the real loopback HTTP adapter and stdio MCP boundary, while browser steps navigate the real bundled/static UI and assert DOM, keyboard, focus, reduced-motion, degraded-state, and lazy-load behavior.
- **Hooks:** reuse `tests/hooks/before-after.ts` and extend `V4World` with browser, page, adapter, and MCP-child handles. Its guaranteed `After` closes those handles before temp-workspace cleanup even when a step throws; no duplicate hook file is planned.
- **Fixtures:** producer-shaped status, task inventory, coverage, trace, `find_refs`, scenario-trace, evidence, typed-error, redaction, fixed 1,000-task corpus, and deps-absent package captures defined in FIXTURES.md.
- **Focused proof:** SPECDASH001_07 owns performance/scale evidence; SPECDASH001_08 owns shipped deps-absent startup; SPECDASH001_09 owns browser security, redaction, and failure cleanup. Broad feature tags do not substitute for these task-specific scenarios.
- **Lifecycle:** select controlled provider state per scenario, launch an isolated adapter and browser when required, execute real reads/interactions, capture assertions, and terminate all handles through `After`.
- **Cleanup Strategy:** after every scenario, the guaranteed hook closes page/browser first, then adapter and stdio MCP child with bounded graceful-to-force termination, releases ports and temporary fixture state, and verifies cleanup after success and thrown-step failure; no background process or scenario-owned state may survive.
- **Docker image:** `Dockerfile.test.base` installs the pinned browser and Linux dependencies using Playwright's documented Chromium installation path; browser binaries are accessible to non-root `testuser`.
- **Execution:** Docker only through the centralized runner; host Cucumber is prohibited.

## Key Decisions

### Decision: Build and launch self-contained Node and browser bundles

**Требование:** [FR-5](FR.md#fr-5-название)

**Rationale:** Plugin users cannot rely on repository `node_modules`, browsers cannot execute TypeScript directly, and the existing package already distributes the `tools` tree. A Node 20 `server.bundle.mjs` plus browser `ui/app.bundle.js`, launched on loopback with an ephemeral-port option, makes the same artifact testable and distributable.

**Trade-off:** Generated bundles are committed release artifacts that require freshness checks and increase package size.

**Alternatives considered:**
- Launch `server.ts` through `tsx` and serve `app.ts` — rejected because installed users may lack project dependencies and browsers do not execute TypeScript.
- Introduce a web framework and development server — rejected because the local read-only surface does not need that dependency closure and would enlarge the distributed runtime.

### Decision: Use bounded task inventory and full directed reference reads

**Требование:** [FR-1](FR.md#fr-1-название), [FR-2](FR.md#fr-2-название), [FR-3](FR.md#fr-3-название)

**Rationale:** `list_tasks` is the existing bounded task inventory and `find_refs` is the existing source of complete incoming/outgoing semantic direction. Using them directly avoids N+1 card discovery and avoids pretending that `get_trace.related_nodes` is a complete graph neighborhood.

**Trade-off:** A task card detail is a composed request and must preserve partial availability across multiple provider reads.

**Alternatives considered:**
- Discover cards from `get_spec_status(view=coverage)` — rejected because the coverage payload is evidence rollup, not a bounded task inventory, and omits task titles and authored lifecycle fields.
- Derive full graph direction from `get_trace.related_nodes` — rejected because that collection is a selective summary and does not carry a direction field.

### Decision: Expose card detail as typed trace collections

**Требование:** [FR-2](FR.md#fr-2-название)

**Rationale:** Requirement, acceptance, design, story, scenario, task, code, evidence, and relationship data can be independently empty, partial, unavailable, or truncated, so each collection needs its own typed availability and bound metadata. History retains the same typed collection shape but is `unavailable` while the current provider has no canonical history surface.

**Trade-off:** The DTO and renderer are more explicit than a single nested document and require collection-level error handling.

**Alternatives considered:**
- Return one untyped card payload — rejected because one provider failure could hide which trace sections remain trustworthy.
- Fetch raw graph nodes in the browser — rejected because it would expose provider internals and move canonical mapping logic outside the adapter boundary.

### Decision: Compose evidence reports from existing provider reads

**Требование:** [FR-3](FR.md#fr-3-название)

**Rationale:** The provider already exposes coverage, trace, scenario-trace, `evidenced-by` edges, and EvidenceNode fields; composing those read surfaces preserves one evidence authority without inventing a new endpoint or store.

**Trade-off:** Producing one report may require several bounded provider reads and must preserve partial availability when only some reads succeed.

**Alternatives considered:**
- Add a dashboard-owned evidence database — rejected because it would duplicate provenance and freshness state.
- Assume a new `get_evidence` MCP tool — rejected because no such provider operation is part of the verified current contract.

### Decision: Keep spec-generator-v4 as the sole graph and lifecycle authority

**Требование:** [FR-4](FR.md#fr-4-название)

**Rationale:** The dashboard must show the same canonical IDs, edges, status semantics, test results, staleness, and provenance as the existing MCP graph, avoiding a second inconsistent parser or status engine.

**Trade-off:** The dashboard inherits MCP availability, stdio latency, and the provider's existing response shapes instead of optimizing through an independent store.

**Alternatives considered:**
- Build a dashboard-owned graph database — rejected because it would duplicate parser/lifecycle logic and create drift from spec-generator-v4.
- Parse markdown and feature files directly in the browser — rejected because browser parsing would bypass canonical evidence and status semantics.

### Decision: Use an explicit same-origin server adapter over stdio MCP

**Требование:** [FR-5](FR.md#fr-5-название)

**Rationale:** Browsers cannot safely consume a local stdio MCP process directly; a server boundary can enforce timeouts, redaction, read-only access, and stable DTO/error contracts.

**Trade-off:** The deployment has an additional process and adapter failure mode, and the browser does not get direct MCP streaming.

**Alternatives considered:**
- Ship a browser extension that launches MCP locally — rejected because it expands installation and privilege surface and is not same-origin by default.
- Expose the MCP server directly over a network transport — rejected because it would broaden the trust boundary and require a new transport contract outside current scope.

### Decision: Make the kanban primary and the graph secondary

**Требование:** [FR-1](FR.md#fr-1-название)

**Rationale:** Jira-like status cards support triage and readiness at a glance, while graph neighborhoods are valuable for impact analysis but are harder to scan as the default workspace.

**Trade-off:** Relationship-heavy exploration requires a deliberate navigation step and the kanban may hide distant graph context until requested.

**Alternatives considered:**
- Make the graph the home screen — rejected because it does not provide a compact status-first work queue.
- Use a table-only requirement list — rejected because it loses the visual lifecycle grouping and card-oriented detail affordance.

### Decision: Adopt a vendored Plane shell with a replacement domain boundary

**Требование:** [FR-5](FR.md#fr-5-название)

**Decision:** Treat the dashboard as a vendored fork of `makeplane/plane` `v1.4.1` at commit `5662b761062b0b2f9d42a6578b55481b5b069792`. Retain the Plane board, UI, design-system, and runtime shell portions needed for the Jira-like browser experience. Replace or bypass Plane backend, domain, authentication, workspace, project, database, and external-service paths. Route all dashboard data through the loopback same-origin adapter to the seven-tool read-only spec-generator-v4 MCP allowlist.

**Rationale:** Vendoring preserves the requested Plane board/UI/design-system/runtime fidelity while making the upstream base, local patches, and legal source obligations explicit. Keeping the loopback adapter as the only data boundary preserves spec-generator-v4 as the graph, lifecycle, evidence, and status authority.

**Trade-off:** The fork gains UI fidelity and avoids a second dashboard domain model, but it adds AGPL notice/source duties and a manual upstream review burden; bypassing Plane domain services excludes Plane-native workspace, project, and authentication behavior.

**Alternatives considered:**
- A clean-room reimplementation is rejected because it would not satisfy the requested vendored-fork strategy.
- A live Plane backend or automatic runtime synchronization is rejected because it would violate the loopback-only, pinned, read-only, reviewable boundary.

### Decision: Preserve typed distinctions for empty, not-run, stale, partial, unavailable, and provider-error states

**Требование:** [FR-4](FR.md#fr-4-название)

**Rationale:** A status dashboard is only trustworthy when missing or stale evidence cannot silently become green; explicit categories let users choose safe next actions.

**Trade-off:** DTOs, UI states, and BDD fixtures are more verbose than a single nullable data field.

**Alternatives considered:**
- Collapse all missing data into `UNKNOWN` — rejected because not-run, stale, unavailable, and provider failure imply different actions.
- Treat the latest available result as current — rejected because source changes and expired traces would create false-green evidence.

### Decision: Use integration-first BDD through the real adapter boundary

**Требование:** [FR-5](FR.md#fr-5-название)

**Rationale:** The browser/API/MCP contract is the feature; exercising only pure mapping functions could leave the actual stdio and redaction boundary untested.

**Trade-off:** Docker BDD runs take longer and require realistic MCP fixtures and process setup.

**Alternatives considered:**
- Add only unit tests for DTO mappers — rejected because they cannot prove the browser reaches the real MCP boundary.
- Run Cucumber directly on the host — rejected because project policy requires Docker for BDD and host runs can produce false results.
