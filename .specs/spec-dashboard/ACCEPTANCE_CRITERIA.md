# Acceptance Criteria — spec-dashboard

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-название)

WHEN a spec is selected THEN the dashboard SHALL request bounded `list_tasks` pages for all five authored task statuses, render one canonical task per Jira-like card, group cards by authored `todo`, `ready`, `in-progress`, `done`, and `blocked` columns, show evidence-derived `verified_status`/readiness separately, and expose the local graph only as a secondary view.

**Scenario:** [SPECDASH001_01](spec-dashboard.feature)

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-название)

WHEN a canonical task card is opened THEN the dashboard SHALL resolve its referenced requirements and compose typed detail from `get_trace`, bounded `find_refs`, `get_node`, and `get_scenario_trace`; acceptance criteria, decisions, stories, scenarios/results, tasks, code/files, evidence, and relationships SHALL preserve canonical IDs and availability, full relationships SHALL preserve direction, and history SHALL be explicitly `unavailable` while the provider exposes no canonical history surface.

**Scenario:** [SPECDASH001_02](spec-dashboard.feature)

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-название)

WHEN readiness, coverage-gap, impact, and evidence routes are requested THEN the adapter SHALL call the mapped existing status/trace/scenario-trace surfaces, show directed impact and typed evidence provenance/freshness, and SHALL NOT assume a nonexistent evidence tool.

**Scenario:** [SPECDASH001_03](spec-dashboard.feature)

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-название)

WHEN lifecycle, scenario, or evidence states are rendered THEN canonical provider values SHALL remain unchanged; not-run SHALL be represented outside the scenario-result enum; empty, stale, partial, unavailable, and provider-error states SHALL never be rendered as `GREEN` or `PASSED`.

**Scenario:** [SPECDASH001_04](spec-dashboard.feature)

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-название)

WHEN the loopback same-origin adapter handles browser requests THEN it SHALL dispatch only `list_specs`, `list_tasks`, `get_spec_status`, `get_trace`, `get_scenario_trace`, `get_node`, and `find_refs`, reject unknown/mutation tools before dispatch, enforce root-contained repository-relative code paths, omit absolute/evidence-storage paths and secrets, keep provider process/session state server-side, apply typed timeout/retry/freshness defaults, and return safe diagnostic IDs.

**Scenario:** [SPECDASH001_05](spec-dashboard.feature), [SPECDASH001_06](spec-dashboard.feature)
