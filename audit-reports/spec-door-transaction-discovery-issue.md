# Bug: spec-door transaction path exists in code but is not exposed/routed, so fresh spec authoring falls back to raw edits

## Summary

Fresh spec bootstrap can dead-end through the MCP spec door: `create_spec` creates placeholder docs, but `apply_spec_change` validates the whole spec immediately and rejects staged single-document edits while sibling placeholder documents still have temporarily inconsistent anchors/conformance links.

This is not just a validation failure. The repository appears to already contain FR-60/P33-3 transaction tools for multi-document spec changes, but the agent-facing workflow did not expose or route to them:

- `.agents/skills/create-spec/SKILL.md:36-43` tells agents to create with `create_spec` and write documents with `apply_spec_change`.
- `tools/spec-mcp-server/tools.ts:2021-2185` defines `propose_patch`, `apply_proposed_patch`, and `apply_spec_transaction`.
- `tools/spec-mcp-server/server.bundle.mjs:53084-53174` contains the bundled versions of those same tools.
- Tool discovery with an exact query for `apply_spec_transaction propose_patch apply_proposed_patch` did not make those transaction tools callable; it surfaced ordinary read/list/delete/rename/spec-node tools instead.

## Repro From 2026-07-21 Dogfood

Goal: create `.specs/context-mode-integration` for context-mode installation/integration.

1. `create_spec` through MCP succeeded and scaffolded the spec.
2. `apply_spec_change` for `USER_STORIES.md` initially rejected user stories without the required `**Требование:** [FR-N]` leg.
3. Adding FR references then made the same staged write vulnerable to broken anchors because `FR.md` had not yet been replaced with matching FR anchors.
4. `apply_spec_change` for `FR.md` was also blocked because the rest of the placeholder docs were still temporarily inconsistent and the new FRs did not yet have all sibling story/design/AC legs in the already-on-disk graph.
5. The only practical path during the session was direct `apply_patch` over `.specs/context-mode-integration/*`, followed by validators:
   - `validate-spec.ts -Path .specs/context-mode-integration` => `valid: true`, `0 errors`, `0 warnings`
   - `spec-verdict.ts -Path .specs/context-mode-integration --no-semantic` => `GRAPH_GREEN`; expected `NOT_READY` only because executable BDD step definitions were not implemented yet
   - `spec-status.ts -Path .specs/context-mode-integration` => `Complete`, `100%`

## Expected

The canonical create-spec workflow should have a fully MCP-only path for bootstrap and multi-document conceptual edits.

For a fresh scaffold, an agent should be able to submit one transaction containing the mutually-dependent updates to `USER_STORIES.md`, `FR.md`, `ACCEPTANCE_CRITERIA.md`, `DESIGN.md`, `TASKS.md`, `.feature`, etc., and have validation run after the whole transaction is applied to the staged graph.

## Actual

`apply_spec_change` behaves like a single-document door while enforcing whole-spec validity. That is a bad UX contract for placeholder-driven scaffold bootstrap and FR/story/design/AC edits where valid intermediate states are naturally cross-document.

The repo has transaction-tool code, but the route is effectively hidden from the agent workflow:

- not mentioned by the active `create-spec` skill;
- not discoverable/callable through the available MCP tool surface in this dogfood session;
- not suggested by `apply_spec_change` rejection messages as the correct recovery path.

## Impact

This directly undermines the spec-door rule: the workflow tells agents to avoid raw `.specs/` edits, but the MCP door blocks the normal bootstrap sequence and leaves direct filesystem edits as the only practical route.

Related issue: #135 describes the core FR/story/design anchor deadlock and proposes multi-doc transactions. This issue adds evidence that the transaction path already exists in code but is not exposed/routed well enough to solve the dogfood workflow.

## Suggested Fix

Acceptance criteria:

1. `propose_patch`, `apply_proposed_patch`, and `apply_spec_transaction` are exposed through the MCP tool schema/tool discovery path used by Codex.
2. `create-spec` skill is updated to use the transaction tool for fresh bootstrap and for FR/story/design/AC multi-leg edits.
3. `apply_spec_change` validation failures caused by cross-document temporary inconsistency include an actionable hint to use the transaction tool.
4. Regression coverage proves: fresh `create_spec` scaffold -> one transaction replacing the dependent docs -> no raw filesystem edits -> final `validate-spec` green and graph verdict green.

