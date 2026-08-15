# Acceptance Criteria — spec-dashboard

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-название)

WHEN the browser opens the dashboard for a selected spec, THEN it SHALL render a Jira-like kanban from bounded `list_tasks` reads with `todo`, `ready`, `in-progress`, `done`, and `blocked` columns. Each card SHALL show its canonical task ID, title, spec slug, authored status, evidence-derived `verified_status` or readiness, and last evidence timestamp when available. Authored `done` SHALL not imply verified. Keyboard focus SHALL open a card and reach the secondary graph view without relying on color alone.

**Scenario:** [SPECDASH001_01](spec-dashboard.feature)

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-название)

WHEN a card and referenced requirement are opened, THEN the adapter SHALL compose provider-supported `get_trace`, bounded `find_refs`, `get_node`, and `get_scenario_trace` reads. Collections SHALL preserve canonical IDs, direction, independent availability, bounds, truncation, and opaque continuation metadata. Empty SHALL be distinct from unavailable or provider-error data, and history SHALL be explicitly `unavailable` until a provider history surface exists.

**Scenario:** [SPECDASH001_02](spec-dashboard.feature)

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-название)

WHEN coverage, impact, or evidence views are requested, THEN the dashboard SHALL use bounded status, trace, scenario-trace, directed relationship, `evidenced-by`, and `EvidenceNode` data only. It SHALL return coverage gaps, incoming and outgoing impact with relation type and direction, typed result and review state, source/run metadata, provenance, and freshness. It SHALL not invent a `get_evidence` provider tool or convert unavailable data to success.

**Scenario:** [SPECDASH001_03](spec-dashboard.feature)

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-название)

WHEN the provider returns lifecycle, scenario, or evidence state, THEN the UI SHALL preserve `SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, `GREEN`; `PASSED`, `FAILED`, `SKIPPED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, `UNKNOWN`; and the defined evidence states unchanged. Not-run SHALL be represented by execution or collection availability rather than a new scenario-result value. Empty, stale, partial, unavailable, and provider-error states SHALL never render as `GREEN` or `PASSED`.

**Scenario:** [SPECDASH001_04](spec-dashboard.feature)

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-название)

WHEN the browser uses the dashboard, THEN the same-origin loopback adapter SHALL expose only the allowlisted read tools `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, and `find_refs`. Unknown and mutation tools SHALL be rejected before MCP dispatch with `TOOL_NOT_ALLOWLISTED` or `READ_ONLY`. Requests SHALL enforce bounded time and response size, at most one safe transient retry, no retry for invalid, not-found, authentication, CORS, or non-allowlisted failures, and safe typed diagnostic IDs. DTOs, URLs, browser text, errors, and logs SHALL contain no credentials, secrets, command arguments, evidence storage paths, absolute paths, or traversal. The browser, adapter, and MCP child process SHALL be cleaned up even when a test step throws, with graceful-to-forceful escalation when required.

The dashboard SHALL be a vendored Plane fork of `makeplane/plane` `v1.4.1` at commit `5662b761062b0b2f9d42a6578b55481b5b069792`. It SHALL retain board, UI, design-system, and runtime shell portions while replacing or bypassing Plane backend, domain, authentication, workspace, and project data portions. The loopback spec-generator-v4 MCP adapter SHALL be the only dashboard data provider; Plane services, Plane authentication, Plane workspace/project data, and Plane backend/domain data SHALL not be contacted or required at runtime. `vendor/plane/PROVENANCE.json`, the `plane-upstream` remote, `AGPL-3.0-only` `COPYRIGHT.txt` notice, and unauthenticated corresponding-source network access SHALL be present. No proprietary component SHALL be distributed. The Node `>=22.18` and pnpm `11.3.0` frozen-lockfile build, clean-fork, license, upstream-sync, and dependency-absent bundled-start checks SHALL pass against real artifacts.

**Scenarios:** [SPECDASH001_05](spec-dashboard.feature), [SPECDASH001_06](spec-dashboard.feature), [SPECDASH001_09](spec-dashboard.feature), [SPECDASH001_10](spec-dashboard.feature), [SPECDASH001_11](spec-dashboard.feature), [SPECDASH001_12](spec-dashboard.feature), [SPECDASH001_13](spec-dashboard.feature)
