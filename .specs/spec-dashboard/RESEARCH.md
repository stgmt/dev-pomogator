# Research

## Problem

A dashboard for specification health is useful only if it exposes the evidence that produced a state and keeps provider failures separate from specification failures. Discovery therefore defines a read-only presentation boundary around the existing spec-generator-v4 MCP graph and runtime evidence; it does not redesign that provider or invent a second status model.

## Project Context & Constraints

### Architectural Constraints Summary

- The dashboard depends explicitly on the read-only spec-generator-v4 MCP contract. Its graph, lifecycle, coverage, trace, and runtime evidence are authoritative inputs.
- The dashboard must not write specification files, graph state, test results, credentials, or provider state.
- The provider surface and payload version must be pinned before implementation. A mutable preview branch is not a pinned dependency.
- The repository uses Node, TypeScript, and ESM conventions and already runs Cucumber.js through the centralized Docker BDD runner; host Cucumber execution is prohibited.
- The browser must call a same-origin server adapter; MCP stdio, credentials, absolute paths, provider command arguments, and sensitive evidence storage paths remain server-side.
- The implementation must reuse existing `tests/hooks/**/*.ts`, use producer-shaped fixtures from real provider output, and prove the distributed runtime with project dependencies absent.
- Browser/runtime behavior, authentication, authorization, transport, timeout, retry, CORS or proxy boundaries, error redaction, and stale-data policy are resolved by the Requirements and Design contracts that follow this research.

## Evidence inventory

### SpecGraph model

- `[VERIFIED][ref:tools/spec-graph/types.ts:22-48]` declares node and edge vocabularies including `FR`, `NFR`, `AC`, `Decision`, `Story`, `UseCase`, `Risk`, and `StepBinding`; edge vocabulary includes `tested-by`, `tagged-by`, `last-result`, `runtime-trace`, `step-binding`, `code-impl`, and `evidenced-by`.
- `[VERIFIED][ref:tools/spec-graph/types.ts:157-180]` represents scenario identity, steps, result states `PASSED`, `FAILED`, `SKIPPED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, and `UNKNOWN`, run timing, staleness, and runtime trace references.
- `[VERIFIED][ref:tools/spec-graph/types.ts:251-268]` represents evidence presence `PRESENT` or `MISSING` and verdict states `CONFIRMED`, `DENIED`, `INCOMPLETE`, `UNAVAILABLE`, or `SELF_ATTESTED`.
- `[VERIFIED][ref:tools/spec-graph/edge-schema.ts:11-64]` validates semantic edge endpoint types and reports endpoint violations. The UI must distinguish an empty relation from an invalid or unavailable relation.

### Read-only spec-generator-v4 MCP provider

| Provider surface | Discovery use | Established evidence | Contract decision still open |
|---|---|---|---|
| `get_spec_status` with `view=status` | Board lifecycle and last-run overview | `[VERIFIED][ref:tools/spec-mcp-server/tools.ts:1456-1469]` documents merged status/counts/coverage and lifecycle states `SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, and `GREEN`. | Confirm payload schema, refresh policy, stale labeling, and provider-error versus no-run handling. |
| `get_spec_status` with `view=summary` or `view=counts` | Compact inventory and structural totals | `[VERIFIED][ref:tools/spec-mcp-server/tools.ts:1460-1469]` identifies lifecycle/count summaries and FR/AC/Scenario/Task counts. | Decide above-the-fold counts and corpus-scope/truncation copy. |
| `get_spec_status` with `view=coverage` | Scenario buckets and honest task state | `[VERIFIED][ref:tools/spec-mcp-server/tools.ts:1467-1469]` describes per-scenario buckets and task `DONE` only when every mapped scenario is green. | Define copy for pending, undefined, ambiguous, stale, and not-run evidence. |
| `get_trace` | Requirement detail, impact, and trace navigation | `[VERIFIED][ref:tools/spec-mcp-server/tools.ts:909-1035]` describes acceptance criteria, scenarios, tasks, `code_impl[]`, related nodes, bounded summary, node `verified_status`, scenario result/failing step/runtime trace, and task links. | Confirm section ordering, empty-list copy, relation direction, and safe display of repository paths/lines. |
| `get_scenario_trace` | Failure detail and runtime provenance | `[VERIFIED][ref:tools/spec-mcp-server/tools.ts:1331-1351]` exposes run/time/source plus failing step/error and trace status, with `SCENARIO_NOT_FOUND` as an explicit error. | Define retention, expired-chunk copy, and treatment of stale passes. |
| Coverage/evidence concepts | Honest labels, not a second status engine | `[VERIFIED][ref:tools/spec-graph/types.ts:157-180,251-268]` supplies scenario results, staleness, runtime trace references, evidence presence, and evidence verdict vocabulary. | Confirm whether these fields arrive through the three surfaces above; do not assume a separate `get_evidence` endpoint. |

## Plane preview evidence and reuse boundary

- `[VERIFIED][source: orchestrator-provided][ref:LICENSE.txt]` identifies the Plane preview as AGPL-3.0. This is a licensing fact for the preview, not permission to copy code without a compatibility decision.
- `[VERIFIED][source: orchestrator-provided][ref:apps/web/core/components/issues/issue-layouts/kanban/default.tsx]` is an exact preview file reference for a kanban issue layout.
- `[VERIFIED][source: orchestrator-provided][ref:apps/web/core/components/issues/issue-detail/root.tsx]` is an exact preview file reference for an issue-detail root.
- These references support only the narrow claim that the named preview files are candidate UI references. They do not establish reusable routing, workspace models, authentication, design-system packages, localization, build configuration, or runtime integration. Reuse remains pending.

## Provider and boundary decision matrix

| Decision area | Decision status | Evidence or owner | Implementation gate |
|---|---|---|---|
| Provider authority | RESOLVED | SpecGraph and MCP evidence above. | Render provider results; do not recompute lifecycle, coverage, trace, or evidence truth. |
| Read/write routes | RESOLVED | FR-5, User Stories, UC-6/UC-7, and the route table below. | Expose same-origin read routes only; reject mutation and unknown operations before MCP dispatch. |
| Status and result enums | RESOLVED | `get_spec_status`, `types.ts`, UC-1/UC-4/UC-5. | Preserve provider lifecycle/result values and keep not-run outside the scenario-result enum. |
| Bounds and collection semantics | RESOLVED | Provider contract tables plus FR-2/FR-3. | Bound every collection, preserve empty versus unavailable, and expose truncation/opaque continuation metadata. |
| Timeout and retry | RESOLVED | DESIGN API/DTO contract and FR-5. | Apply the five-second request timeout and at most one retry for a transient idempotent transport failure. |
| Redaction and path safety | RESOLVED | FR-5, NFR-Sec-1, NFR-Sec-2. | Validate root-contained POSIX paths and omit credentials, commands, raw paths, and sensitive provider details. |
| Error and freshness semantics | RESOLVED | FR-4, NFR-Rel-1, and the typed DTO contract. | Preserve provider, transport, browser-runtime, authentication, CORS, not-found, stale, partial, and unavailable states without false green. |
| Clean-room boundary | RESOLVED | Plane preview evidence and NFR-Legal-1. | Copy no Plane source; treat the preview as interaction research only unless the deferred legal gate is approved. |
| Exact provider compatibility | DEFERRED IMPLEMENTATION GATE | Provider contract inventory above. | Pin the supported spec-generator-v4 MCP payload version and define compatibility behavior before implementation. |
| Browser/runtime and authentication session | DEFERRED IMPLEMENTATION GATE | UC-6 open decisions. | Name supported browsers/runtime packaging, browser/proxy boundary, authentication mechanism, session lifetime, logout, and least privilege before implementation. |
| Future Plane reuse | DEFERRED IMPLEMENTATION GATE | LICENSE.txt and candidate preview references above. | Obtain legal/compatibility approval and dependency-closure evidence before any future source reuse; initial scope remains clean-room. |

## Deferred implementation gates

The following decisions are closed by the Requirements and Design contracts and are not open authoring questions: provider authority, read-only route composition, lifecycle/result enums, bounded collections and continuation semantics, timeout/retry policy, path/redaction rules, typed error/freshness semantics, and the clean-room default.

The remaining gates are intentionally deferred until implementation planning:

1. Pin the exact versioned MCP payload compatibility policy at implementation time; the required current surfaces are bounded `list_tasks`, bounded `find_refs`, `list_specs`, `get_spec_status`, `get_trace`, `get_scenario_trace`, and `get_node`.
2. Any future remote or multi-user deployment must separately define authentication, authorization, proxy/CORS, session lifetime, logout, credential storage, least-privilege scope, and audit behavior. The initial MVP is resolved as Node 20, loopback-only, no browser-held provider credential, with server-side MCP process/session state and pinned headless Chromium only for Docker BDD.
3. Obtain legal/compatibility approval for any future Plane source reuse under the exact AGPL-3.0 boundary; no reuse is permitted in the initial implementation.

These deferred gates do not authorize a second parser, graph, lifecycle, status, evidence, or credential store.

## Non-goals and assumptions

- `[ASSUMED]` The dashboard consumes the existing spec-generator-v4 read-only MCP surface; it is not a replacement for the graph builder, result ingester, or status engine.
- `[PROPOSED]` Every status or evidence panel should show source, freshness, and provider state.
- `[PROPOSED]` Missing, stale, partial, unavailable, and failed states remain inspectable and are never silently coalesced into success.
- `[OUT_OF_SCOPE]` Editing specifications, changing graph edges, rerunning tests, storing credentials in spec artifacts, and claiming Plane as an integrated dependency are outside Discovery.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The UI maps a stale, partial, pending, or unavailable provider result to green | Medium | High | Render lifecycle and freshness separately; add fixtures for every non-green state and reject success when evidence is absent or stale. |
| Browser, runtime, CORS/proxy, or authentication failures are mistaken for specification failures | Medium | High | Define typed boundary errors, a safe error boundary, retry behavior, diagnostic IDs, and explicit auth/transport labels before implementation. |
| The dashboard invents graph neighbors or treats malformed endpoints as valid impact | Medium | High | Consume only returned semantic edges, distinguish empty from unavailable, surface endpoint violations, and show relation/direction. |
| Plane preview code is copied without satisfying AGPL-3.0 or without compatible runtime dependency closure | Low | High | Keep preview references non-binding; complete legal and dependency review before reuse, or implement an original compatible surface. |
| Credentials or sensitive provider details leak through URLs, rendered errors, logs, or spec artifacts | Medium | High | Keep the client read-only, prohibit secret persistence, redact provider errors, and verify URL/log/spec outputs with negative tests. |
