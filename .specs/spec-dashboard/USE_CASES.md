# Use Cases

**BDD trace tags:** @feature1 @feature2 @feature3 @feature4 @feature5

The dashboard is a read-only consumer of the spec-generator-v4 MCP surface. The canonical SpecGraph/MCP is the sole data authority for graph structure, lifecycle, task status, scenario evidence, freshness, provenance, and verification. The dashboard presents provider results and never edits specification files, graph state, test results, or credentials.

The browser journey uses a vendored and adapted `makeplane/plane` `v1.4.1` fork at commit `5662b761062b0b2f9d42a6578b55481b5b069792`. The fork retains the Plane board, UI, design-system, and runtime shell, but Plane backend, authentication, workspace, and project domain are replaced or bypassed in favor of the read-only dashboard adapter and canonical SpecGraph/MCP. AGPL-3.0-only provenance/notices and corresponding-source access ship with the fork; upstream synchronization is manual, and the build contract is Node `>=22.18` with pnpm `11.3`. This changes the implementation shell, not the UC-1 through UC-7 user journey or its existing FR/AC traceability.

## UC-1: Review specification status at a glance

**Name:** Review specification status at a glance

**Primary actor:** Specification owner

**Goal:** Decide whether a specification needs attention before opening its detailed trace.

**Preconditions:** The dashboard identifies one specification and can call the read-only `get_spec_status` surface.

**Trigger:** The owner selects a specification.

**Main flow:**

1. The dashboard requests `get_spec_status` with `view=status`.
2. It displays the returned identity, lifecycle state, last-run summary, structural counts, gaps, phases, and hint when present.
3. The owner selects a state or gap to open related trace or evidence.

**Alternate and exception flows:**

- No run: show the provider's no-run state, never green.
- Partial, red, or unavailable response: preserve the state and label missing fields.
- Invalid identifier: show a bounded not-found error and do not infer a replacement.

**Outcome:** The owner receives an honest status view or an explicit provider classification failure.

**Open decisions:**

- Confirm the exact mapping for `SPEC_ONLY`, `TESTS_NOT_RUN`, `RED`, `PARTIAL`, and `GREEN`.
- Define refresh behavior and stale-response copy.

**Traceability:** [FR-1](FR.md#fr-1-название), [FR-5](FR.md#fr-5-название), [User Story 1](USER_STORIES.md#user-story-1-see-the-specification-status-at-a-glance-priority-p1), [User Story 5](USER_STORIES.md#user-story-5-work-safely-through-incomplete-or-unavailable-data-priority-p2)

## UC-2: Inspect a requirements evidence trace

**Name:** Inspect a requirement's evidence trace

**Primary actor:** Reviewer

**Goal:** Determine what evidence supports a selected requirement and what remains unverified.

**Preconditions:** The selected node resolves through read-only `get_trace`.

**Trigger:** The reviewer opens a requirement card or follows a requirement link.

**Main flow:**

1. The dashboard calls `get_trace` for the selected node.
2. It shows node identity and provider `verified_status`.
3. It lists returned acceptance criteria, stories, decisions, scenarios, tasks, `code_impl`, runtime trace fields, and related nodes.
4. The reviewer opens a scenario or related node.

**Alternate and exception flows:**

- `NODE_NOT_FOUND`: show the provider error and a path back to the selected specification.
- Empty relation: label no returned relation; do not invent a link.
- Failed, pending, undefined, ambiguous, unknown, or stale scenario: preserve the result and do not summarize it as passing.

**Outcome:** The reviewer distinguishes evidence, missing links, and provider limitations for one requirement.

**Open decisions:**

- Decide above-the-fold trace sections and collapsible sections.
- Decide how paths and lines are displayed without implying that a file reference proves behavior.

**Traceability:** [FR-2](FR.md#fr-2-название), [User Story 2](USER_STORIES.md#user-story-2-inspect-the-trace-behind-a-requirement-priority-p1)

## UC-3: Inspect change impact and graph neighbors

**Name:** Inspect change impact and graph neighbors

**Primary actor:** Specification owner

**Goal:** Understand the semantic neighborhood before changing a requirement.

**Preconditions:** A selected node can be resolved in the provider graph.

**Trigger:** The owner selects Impact or Graph.

**Main flow:**

1. The dashboard requests trace and related-node data.
2. It groups returned edges by relation, direction, and node type.
3. The owner follows a returned neighbor to its trace.
4. The dashboard keeps a link back to the originating node.

**Alternate and exception flows:**

- Empty neighborhood: show an honest empty result, not a successful dependency scan.
- Endpoint violation or unresolved node: mark incomplete or unavailable; do not render a valid dependency.
- Provider or transport failure: show separately from an empty graph response.

**Outcome:** The owner sees the returned change surface and knows why data may be absent.

**Open decisions:**

- Confirm first-class semantic edge types and labels for incoming versus outgoing relations.
- Define neighborhood limits, pagination, and visible truncation.

**Traceability:** [FR-3](FR.md#fr-3-название), [User Story 3](USER_STORIES.md#user-story-3-understand-change-impact-and-graph-neighbors-priority-p1)

## UC-4: Verify freshness and provenance of evidence

**Name:** Verify freshness and provenance of evidence

**Primary actor:** Evidence-focused reviewer

**Goal:** Decide whether a result is current execution evidence.

**Preconditions:** A scenario or status result is available from the provider.

**Trigger:** The reviewer opens Evidence or expands a scenario.

**Main flow:**

1. The dashboard shows canonical result and freshness.
2. It shows run identifier, run time, source, and trace status when provided.
3. The reviewer compares result state with requirement and scenario context.
4. The reviewer opens a failing step when present.

**Alternate and exception flows:**

- A stale `PASSED` result remains stale.
- `PENDING`, `UNDEFINED`, `AMBIGUOUS`, `UNKNOWN`, and missing evidence remain non-passing.
- Expired or missing trace chunks are unavailable or expired; no error detail is fabricated.

**Outcome:** The reviewer identifies current, stale, and absent evidence.

**Open decisions:**

- Define the freshness threshold and required source/run metadata.
- Define retention and copy for expired runtime trace chunks.

**Traceability:** [FR-4](FR.md#fr-4-название), [User Story 4](USER_STORIES.md#user-story-4-verify-freshness-and-provenance-priority-p2)

## UC-5: Handle partial provider data without false green

**Name:** Handle partial provider data without false green

**Primary actor:** Reviewer

**Goal:** Continue investigating a response with missing or partial fields.

**Preconditions:** The provider returns a syntactically valid partial response.

**Trigger:** The dashboard receives partial data.

**Main flow:**

1. Render fields that are present.
2. Label missing fields unavailable or not returned.
3. Retain provider state and timestamp when available.
4. Offer retry or navigation to returned sections.

**Alternate and exception flows:**

- A partial payload never becomes `GREEN` because one field says `PASSED`.
- A malformed payload goes to a bounded error state, not a specification result.

**Outcome:** Partial data remains useful and visibly incomplete.

**Open decisions:**

- Define the minimum valid payload for each section and unknown-field rendering.
- Decide automatic versus manual retry, backoff, and attempt count.

**Traceability:** [FR-5](FR.md#fr-5-название), [User Story 5](USER_STORIES.md#user-story-5-work-safely-through-incomplete-or-unavailable-data-priority-p2)

## UC-6: Handle provider, browser, runtime, and authentication failures

**Name:** Handle provider, browser, runtime, and authentication failures

**Primary actor:** Reviewer

**Goal:** Distinguish dashboard failure from specification failure and recover without exposing credentials or writing data.

**Preconditions:** The dashboard runs in an approved browser/runtime and has an explicitly defined authentication path to the read-only provider.

**Trigger:** Authentication is rejected, the browser blocks a request, the runtime cannot load, or a request fails.

**Main flow:**

1. Classify the boundary as authentication, authorization, transport, provider, browser, or runtime.
2. Show a bounded diagnostic and safe retry or sign-in path.
3. Do not map the failure to a lifecycle result.
4. Allow return to a clearly labelled stale view, if one exists.

**Alternate and exception flows:**

- Never write credentials or tokens to specs, URLs, rendered logs, or browser error copy.
- Expired sessions show authorization guidance, not red or green.
- Browser/runtime errors show a diagnostic identifier or safe retry without raw secrets.

**Outcome:** The reviewer can recover or report an environment failure without confusing it with spec evidence.

**Open decisions:**

- Name authentication mechanism, credential storage, session lifetime, logout, and least-privilege read-only scope.
- Name supported browser/runtime matrix, CORS/proxy boundary, timeout, retry, and telemetry redaction.

**Traceability:** [FR-5](FR.md#fr-5-название), [User Story 5](USER_STORIES.md#user-story-5-work-safely-through-incomplete-or-unavailable-data-priority-p2)

## UC-7: Navigate from a status result to a safe next action

**Name:** Navigate from a status result to a safe next action

**Primary actor:** Specification owner

**Goal:** Move from a lifecycle or evidence signal to investigation without turning the dashboard into an editor.

**Preconditions:** A status, trace, or error result and its provider identity are known.

**Trigger:** The owner selects a gap, failing scenario, missing relation, or unavailable section.

**Main flow:**

1. Preserve the originating provider state.
2. Open the relevant trace, evidence, graph, or recovery view.
3. Allow copying a stable node or scenario identifier and returning to status.
4. Offer no mutation operation in this scope.

**Alternate and exception flows:**

- If no follow-up data exists, explain the boundary and suggest bounded retry or escalation.
- Stale or partial results lead to verification, not completion.
- A disappeared node or scenario shows not-found tied to its original identifier.

**Outcome:** Each visible status or gap has a safe next action or explicit no-action explanation.

**Open decisions:**

- Define navigation and stable deep-link format for spec, node, scenario, and run identifiers.
- Decide whether copying identifiers and external provider documentation are the only outbound actions.

**Traceability:** [FR-5](FR.md#fr-5-название), [User Story 5](USER_STORIES.md#user-story-5-work-safely-through-incomplete-or-unavailable-data-priority-p2)
