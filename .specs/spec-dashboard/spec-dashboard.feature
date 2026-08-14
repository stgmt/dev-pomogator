@spec-dashboard
Feature: SPECDASH001_Read-only specification evidence workspace

  The dashboard is a read-only browser over the spec-generator-v4 MCP. Scenarios exercise the real same-origin HTTP adapter and stdio boundary in Docker BDD.

  @feature1 @FR-1 @AC-1
  Scenario: SPECDASH001_01 task-kanban is rendered in a real browser
    Given the real spec-dashboard adapter is connected to the stdio spec-generator-v4 MCP
    And headless Chromium opens the loopback dashboard
    When the browser selects "spec-dashboard"
    Then the browser requests bounded task pages for all authored task statuses
    And the DOM renders one card per canonical Task in todo, ready, in-progress, done, or blocked columns
    And each card shows authored status separately from evidence-derived verified status or readiness
    And keyboard focus can open a card and reach the secondary graph without relying on color alone

  @feature2 @FR-2 @AC-2
  Scenario: SPECDASH001_02 task detail composes provider-supported trace
    Given a kanban card for a canonical Task that references "spec-dashboard:FR-1"
    When the browser opens the card detail
    Then the adapter composes get_trace, bounded find_refs, get_node, and scenario-trace reads without a dashboard-owned graph
    And every supported collection has independent availability, bounds, truncation, and an opaque continuation token
    And full relationships preserve incoming or outgoing direction while history is explicitly unavailable without a provider history surface
    And an empty collection is distinct from unavailable or provider-error data

  @feature3 @FR-3 @AC-3
  Scenario: SPECDASH001_03 real routes expose gaps impact and composed evidence
    Given the real adapter is connected to canonical status, trace, and scenario-trace tools
    When I GET "/api/specs/spec-dashboard/coverage", "/api/specs/spec-dashboard/impact/spec-dashboard%3AFR-1", and "/api/specs/spec-dashboard/evidence"
    Then coverage gaps and directed incoming and outgoing relationships are returned
    And evidence is composed from coverage, trace, scenario trace, evidenced-by edges, and EvidenceNode fields
    And evidence includes typed state, review status, source, run metadata, freshness, and provenance

  @feature4 @FR-4 @AC-4
  Scenario: SPECDASH001_04 canonical lifecycle and result states remain honest
    Given the provider returns canonical lifecycle, scenario, and evidence states
    When I GET "/api/specs/spec-dashboard/status" and a scenario-trace route
    Then each canonical lifecycle and scenario result is rendered unchanged
    And not-run is represented by execution or availability rather than a new result enum
    And empty, stale, partial, unavailable, and provider-error states are not rendered as GREEN or PASSED

  @feature5 @FR-5 @AC-5
  Scenario: SPECDASH001_05 browser access is allowlisted read-only and safely redacted
    Given the adapter serves same-origin browser requests with server-side session credentials
    When the browser performs an allowlisted GET and submits a non-allowlisted mutation tool name
    Then the GET is returned through a bounded read-only DTO
    And the mutation is rejected before MCP dispatch with TOOL_NOT_ALLOWLISTED or READ_ONLY and a safe diagnostic ID
    And absolute paths, traversal, evidence storage paths, credentials, command arguments, and provider secrets are absent from DTOs, URLs, errors, and logs

  @feature5 @FR-5 @AC-5
  Scenario: SPECDASH001_06 provider and transport failures remain typed
    Given the provider is unavailable or returns a transient transport, browser-runtime, authentication, CORS, or not-found failure
    When the browser requests the affected read-only resource
    Then the adapter applies a 5-second timeout and at most one safe transient transport retry
    And invalid, not-found, authentication, CORS, and non-allowlisted failures are not retried
    And the response contains the corresponding typed category and safe diagnostic ID rather than an empty successful collection

  @feature1 @FR-1 @AC-1
  Scenario: SPECDASH001_07 performance corpus remains bounded
    Given the fixed producer-shaped 1,000-task corpus and a warm local provider
    When 5 warmups and 30 measured browser and route samples run at concurrency 1 with a monotonic clock
    Then status p95 is at most 300 milliseconds and trace p95 is at most 500 milliseconds by nearest-rank
    And the first 20 task cards render within 1 second p95 using visible pagination or virtualization
    And failed or partial samples fail the measurement instead of disappearing

  @feature5 @FR-5 @AC-5
  Scenario: SPECDASH001_08 shipped dashboard starts without project dependencies
    Given the dashboard bundles have been built and project node_modules is hidden
    When I launch "node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0"
    Then a browser can load the task kanban through the real bundled adapter or receives a safe typed provider error
    And no dependency path, command argument, credential, orphaned process, or mutation is exposed

  @feature5 @FR-5 @AC-5
  Scenario: SPECDASH001_09 browser security and cleanup remain bounded
    Given headless Chromium and the real loopback dashboard are running
    When cross-origin, traversal, mutation, and provider-failure requests are exercised and one step throws
    Then the adapter rejects unsafe requests before MCP dispatch with safe typed diagnostics
    And browser, adapter, and MCP child handles are closed by a guaranteed After hook
    And DTOs, URLs, browser text, errors, and logs contain no secret or absolute storage path
