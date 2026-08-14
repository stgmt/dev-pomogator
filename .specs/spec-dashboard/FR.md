# Functional Requirements — spec-dashboard

## FR-1: Название

**Title:** Provide a status-first Jira-like kanban dashboard.

The dashboard SHALL present a Jira-like task kanban as the primary view for one or more selected specs. Each card SHALL represent one canonical `Task` node returned by bounded `list_tasks` reads. Columns SHALL use the authored task lifecycle `todo`, `ready`, `in-progress`, `done`, and `blocked`; the card SHALL display evidence-derived `verified_status`/readiness separately so an authored `done` task with incomplete evidence cannot appear verified. Cards SHALL expose at least the spec slug, canonical task ID, title, authored status, evidence-derived readiness, and last evidence timestamp when available. A secondary local-graph view MAY show requirement and task relationships, but it SHALL NOT replace the kanban as the default view.

**AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use:** [UC-1](USE_CASES.md#uc-1-review-specification-status-at-a-glance)

## FR-2: Название

**Title:** Provide complete requirement card detail and trace navigation.

Selecting a task card SHALL expose the task and each referenced requirement's canonical trace. Acceptance criteria, decisions, user stories, scenarios/results, implementation files, and summarized related nodes SHALL come from `get_trace`; full incoming/outgoing semantic relationships SHALL come from bounded `find_refs`; raw node/evidence fields SHALL be resolved through `get_node`; scenario run detail SHALL come from `get_scenario_trace`. The initial provider has no canonical history collection, so the UI SHALL show history as `unavailable` unless a future versioned provider surface supplies it. Every collection SHALL preserve canonical IDs, direction where supplied, independent availability, bounds, truncation, and opaque continuation metadata, and SHALL distinguish empty from unavailable or failed provider data.

**AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use:** [UC-2](USE_CASES.md#uc-2-inspect-a-requirements-evidence-trace)

## FR-3: Название

**Title:** Provide readiness, coverage-gap, impact, and evidence-report views.

The dashboard SHALL provide read-only views for readiness, coverage gaps, change impact, and evidence reports. Impact SHALL include incoming and outgoing relationships with relation type and direction. Evidence SHALL be composed only from existing `get_spec_status(view=coverage)`, `get_trace`, `get_scenario_trace`, `evidenced-by` edges, and `EvidenceNode` fields; no nonexistent `get_evidence` tool SHALL be assumed. Reports SHALL preserve result state, review state, provenance, source/run metadata, and freshness.

**AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use:** [UC-3](USE_CASES.md#uc-3-inspect-change-impact-and-graph-neighbors)

## FR-4: Название

**Title:** Preserve honest lifecycle, result, and provider-state semantics.

The dashboard SHALL preserve spec-generator-v4 lifecycle values `SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, and `GREEN`; scenario results `PASSED`, `FAILED`, `SKIPPED`, `PENDING`, `UNDEFINED`, `AMBIGUOUS`, and `UNKNOWN`; and evidence states such as `PRESENT`, `MISSING`, `CONFIRMED`, `DENIED`, `INCOMPLETE`, `UNAVAILABLE`, and `SELF_ATTESTED`. Not-run SHALL be represented separately from scenario result by execution and collection-availability fields. Empty, not-run, stale, partial, unavailable, and provider-error states SHALL never be converted to green. The spec-generator-v4 graph, parser, lifecycle, status, and evidence outputs SHALL remain the sole source of truth.

**AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use:** [UC-4](USE_CASES.md#uc-4-verify-freshness-and-provenance-of-evidence)

## FR-5: Название

**Title:** Expose a secure read-only browser adapter over stdio MCP.

The dashboard SHALL use an explicit same-origin browser-to-adapter boundary. The server adapter SHALL allowlist only `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, and `find_refs`; every other, unknown, or mutation tool SHALL be rejected before MCP dispatch with `TOOL_NOT_ALLOWLISTED` or `READ_ONLY`. `list_tasks` SHALL provide bounded task-card inventory, while `find_refs` SHALL provide bounded incoming/outgoing semantic relationships; neither surface authorizes mutation or a dashboard-owned graph. Browser DTOs MAY display only validated root-contained repository-relative POSIX code paths; absolute paths and traversal SHALL be rejected. Evidence storage paths, credentials, command arguments, secrets, and sensitive provider details SHALL be omitted or opaque and SHALL NOT appear in URLs, errors, or logs. The initial local MVP SHALL bind to loopback, use no browser-held provider credential, and keep provider process/session state server-side; any future remote or multi-user authentication profile requires a separate contract.

**AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use:** [UC-5](USE_CASES.md#uc-5-handle-partial-provider-data-without-false-green), [UC-6](USE_CASES.md#uc-6-handle-provider-browser-runtime-and-authentication-failures), [UC-7](USE_CASES.md#uc-7-navigate-from-a-status-result-to-a-safe-next-action)

## FR-N: OUT OF SCOPE

The initial scope excludes dashboard mutations, editing spec documents, test execution orchestration, replacing spec-generator-v4 parsers or graph storage, credential management, and direct reuse of Plane source code. Any future Plane code reuse requires a separate legal review and approval.
