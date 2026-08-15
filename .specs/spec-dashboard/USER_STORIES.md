# User Stories

**BDD trace tags:** @feature1 @feature2 @feature3 @feature4 @feature5

This Discovery scope defines a read-only dashboard for owners and reviewers who need to understand the health and impact of a specification without editing the specification or guessing beyond the evidence returned by the spec-generator-v4 MCP surface.

## Traceability map

| Story | User case | Requirement mapping | Independent evidence |
|---|---|---|---|
| User Story 1 | UC-1 | FR-1, FR-5 | A reviewer opens the board and sees a state that matches the provider result, including an explicit empty or unavailable state. |
| User Story 2 | UC-2 | FR-2 | A reviewer opens one requirement and follows its acceptance criteria, scenarios, tasks, and implementation evidence. |
| User Story 3 | UC-3 | FR-3 | An owner inspects related requirements and graph neighbors and can distinguish a returned relation from no returned relation. |
| User Story 4 | UC-4 | FR-4 | An owner sees result freshness and provenance before treating a status as current evidence. |
| User Story 5 | UC-5, UC-6, UC-7 | FR-5 | A reviewer can continue safely through provider, browser, runtime, authentication, status, and error boundary states without the UI presenting a false green. |

### User Story 1: See the specification status at a glance (Priority: P1)

As a specification owner, I want a read-only status board for one specification, so that I can identify whether it is specification-only, not yet tested, red, partial, or green before opening detailed evidence.

**Требование:** [FR-1](FR.md#fr-1-название), [FR-5](FR.md#fr-5-название)

**Why:** A status-first view reduces the time needed to find an unhealthy specification while keeping the provider's lifecycle result authoritative.

**Independent Test:** Manual walkthrough of UC-1 with a real spec-generator-v4 MCP status response and a fixture containing each lifecycle state.

**Acceptance Scenarios:**

Given a selected specification and a successful provider response
When the owner opens the dashboard
Then the board shows the specification identity, lifecycle state, last-run summary, structural counts, and known gaps without adding an inferred state.

Given the provider reports no test run or an empty result
When the owner opens the dashboard
Then the board labels that state as not run or unavailable and does not display it as green.

Given the provider returns a red or partial lifecycle state
When the owner selects the state card
Then the dashboard keeps the provider state visible and offers a path to the corresponding evidence rather than hiding the failing or missing data.

### User Story 2: Inspect the trace behind a requirement (Priority: P1)

As a reviewer, I want to open a requirement trace, so that I can see the acceptance criteria, tested scenarios, tasks, implementation references, and related nodes that support or limit the requirement.

**Требование:** [FR-2](FR.md#fr-2-название)

**Why:** A requirement card without its evidence chain encourages unsupported confidence; the trace makes the delivered claim inspectable.

**Independent Test:** Manual walkthrough of UC-2 using one FR node with at least one acceptance criterion, scenario, task, and code implementation reference returned by the read-only trace provider.

**Acceptance Scenarios:**

Given a requirement identifier that resolves in the provider graph
When the reviewer opens its detail view
Then the dashboard lists the requirement identity, acceptance criteria, scenarios, tasks, code implementation entries, and related nodes returned by the trace.

Given a requirement has no returned acceptance criterion or scenario
When the reviewer opens its detail view
Then the dashboard shows the missing relation explicitly and does not manufacture a linked artifact.

Given a linked scenario has a failing step or runtime trace
When the reviewer expands that scenario
Then the dashboard shows the provider's result and available failing-step or trace details, with missing trace data labelled as unavailable.

### User Story 3: Understand change impact and graph neighbors (Priority: P1)

As a specification owner, I want a change-impact view around a selected requirement, so that I can see which acceptance criteria, decisions, stories, scenarios, and implementation references are affected before I change the specification.

**Требование:** [FR-3](FR.md#fr-3-название)

**Why:** Impact is a relationship question, not a count; exposing the graph neighborhood prevents an owner from treating an isolated card as the whole change surface.

**Independent Test:** Manual walkthrough of UC-3 with a selected node that has both outgoing and incoming semantic relations and a second node with an empty neighborhood.

**Acceptance Scenarios:**

Given a selected node with returned semantic relations
When the owner opens the impact view
Then the dashboard groups the returned neighbors by relation and node type and allows navigation to the referenced node.

Given a selected node has no returned neighbors
When the owner opens the impact view
Then the dashboard says that no neighbors were returned for that node and distinguishes that result from a provider or transport failure.

Given an edge is malformed or an endpoint cannot be resolved
When the owner opens the impact view
Then the dashboard marks the relation as incomplete or unavailable and does not present the unresolved endpoint as a valid dependency.

### User Story 4: Verify freshness and provenance (Priority: P2)

As an evidence-focused reviewer, I want freshness, run, and provenance information beside status and trace data, so that I can tell current execution evidence from stale or claimed-only content.

**Требование:** [FR-4](FR.md#fr-4-название)

**Why:** A green-looking card is not trustworthy when its last result is stale, absent, or detached from the run that produced it.

**Independent Test:** Manual walkthrough of UC-4 with one current scenario result, one stale result, and one scenario with no run evidence.

**Acceptance Scenarios:**

Given a scenario has a current canonical result and run metadata
When the reviewer opens the evidence section
Then the dashboard shows the result, run time or run identifier when provided, source, and freshness indicator from the provider.

Given a scenario result is stale, pending, undefined, ambiguous, or unknown
When the reviewer opens the evidence section
Then the dashboard preserves that status and explains that it is not current passing evidence.

Given evidence is missing or unavailable
When the reviewer opens the evidence section
Then the dashboard displays the absence as an evidence state and does not replace it with a success claim.

### User Story 5: Work safely through incomplete or unavailable data (Priority: P2)

As a reviewer using a read-only dashboard, I want explicit provider, browser, runtime, authentication, status, and error states, so that I can distinguish an incomplete specification from a broken dashboard and recover without accidental writes.

**Требование:** [FR-5](FR.md#fr-5-название)

**Why:** Honest failure handling is part of the product contract: the dashboard must not turn a transport, permission, or rendering failure into a false assessment of the specification.

**Independent Test:** Manual walkthrough of UC-5, UC-6, and UC-7 with simulated provider error, partial payload, empty neighborhood, stale result, authentication refusal, and browser/runtime failure.

**Acceptance Scenarios:**

Given the provider returns a valid partial payload
When the reviewer opens the affected section
Then the dashboard renders the available fields, labels the missing fields as unavailable, and keeps the source state visible.

Given the provider is unavailable or authentication is refused
When the reviewer opens or refreshes the dashboard
Then the dashboard shows a recoverable connection or authorization error, does not classify the specification, and does not send a mutation request.

Given the browser or dashboard runtime cannot render the provider response
When the reviewer reaches the error boundary
Then the dashboard shows a bounded diagnostic and retry path without exposing credentials or treating the failure as a specification result.

## Scope boundary

All stories are read-only. They require an explicit, versioned contract for the spec-generator-v4 MCP provider; the SpecGraph/MCP remains the sole authority for graph structure, lifecycle, task status, scenario evidence, freshness, provenance, and verification. The dashboard does not edit specifications, test results, graph data, or user credentials, and it never delegates authority to Plane services or Plane data.

The browser shell is a vendored and adapted `makeplane/plane` `v1.4.1` fork at commit `5662b761062b0b2f9d42a6578b55481b5b069792`. The user journey retains the Plane board, UI, design-system, and runtime shell, while Plane backend, authentication, workspace, and project domain are replaced or bypassed by the read-only dashboard adapter and canonical SpecGraph/MCP. The fork ships under the `AGPL-3.0-only` boundary with provenance/notices, corresponding-source access, and manual upstream synchronization; its build requires Node `>=22.18` and pnpm `11.3`. These adaptation and licensing constraints support the same end-to-end read-only journey described by UC-1 through UC-7 and do not add new FR or AC nodes.
