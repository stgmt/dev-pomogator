# Category 17 — Product surface, provider capability, and full UX journey

## Purpose

Catch internally consistent specs that are still not implementation-ready because the shipped surface, provider authority, complete user journey, or browser-visible proof is missing. This category was introduced after the `spec-dashboard` dogfood required repeated reviews to discover those gaps one at a time.

## Finding codes

| Code | Default severity | Trigger | Repair class |
|---|---:|---|---|
| `PRODUCT_SURFACE_UNRESOLVED` | P0 | The spec alternates between web/CLI/report/TUI or never chooses the shipped surface. | `DECISION_REQUIRED` |
| `DISPLAY_ENTITY_SOURCE_MISSING` | P0 | A primary card/row/node has no canonical identity and bounded inventory producer. | `DECISION_REQUIRED` |
| `PROVIDER_CAPABILITY_FABRICATED` | P0 | The spec claims fields/relations/history that no current provider surface owns. | `DECISION_REQUIRED` |
| `PROVIDER_QUERY_UNBOUNDED` | P1 | Inventory/relationship reads omit cursor/limit/truncation semantics. | `PROPOSAL_ONLY` |
| `AUTHORED_DERIVED_STATE_CONFLATED` | P0 | Authored lifecycle and evidence-derived verification/readiness share one status field. | `DECISION_REQUIRED` |
| `UX_JOURNEY_LEG_MISSING` | P0/P1 | A required launch/selection/action/detail/return/recovery leg has no contract or executable owner. | `DECISION_REQUIRED` |
| `BROWSER_PROOF_MISSING` | P0 | A claimed browser UX is verified only by HTTP/API assertions. | `DECISION_REQUIRED` |
| `DELIVERY_EVIDENCE_MISSING` | P0/P1 | Bundle, launcher, dependency-absent, performance, accessibility, security, cleanup, or live-provider proof is absent. | `DECISION_REQUIRED` |

## Required evidence matrix

For an interactive provider-backed feature, assemble this matrix before returning READY:

| Concern | Required source | Required executable proof |
|---|---|---|
| Shipped surface | FR/UC explicit choice | Scenario opens the real surface |
| Primary entity | Canonical graph/provider node type | Bounded inventory returns stable IDs |
| Displayed fields | Provider route/tool matrix | Producer-shaped fixture or live provider |
| Relationships | Directed provider relation surface | Incoming/outgoing + pagination/truncation |
| Empty/unavailable/error | DTO/state contract | Visible UI assertions and retry |
| Full happy path | USE_CASE + BDD chain | launch→select→primary action→detail→evidence/graph→back |
| Recovery | typed error/retry contract | thrown-step/provider failure and cleanup |
| Delivery | build/launcher/package boundary | shipped bundle with dependencies absent |
| NFRs | explicit performance/a11y/security obligations | separate scenarios, not one broad green test |

## Review rules

1. Read current provider tool/schema evidence; generated spec prose is not proof of provider capability.
2. Empty collection, unsupported collection, provider unavailable and provider error are distinct states.
3. A summary relation list is not a complete directed graph unless the provider contract explicitly guarantees direction, bounds and pagination.
4. API success does not prove DOM order, focus, keyboard operation, reduced motion, retry copy or context preservation.
5. A scenario name is not proof: verify executable mirror/step ownership and current result through the canonical status/evidence surfaces.
6. Emit the structured envelope from `../SKILL.md`. Never auto-apply product/provider/UX prose.

## Dogfood pin

A `spec-dashboard`-shaped regression is complete only when one review finds all of these together:

- cards are canonical `Task` nodes;
- inventory is bounded `list_tasks` across authored statuses;
- authored status differs from `verified_status`/readiness;
- complete directed neighbors use bounded `find_refs`, while `get_trace` remains a summary;
- unsupported history is explicitly `unavailable`;
- browser path includes launch, spec selection, loading/empty/error, filters/sort/pagination, task detail, evidence/file/graph, back/context retention, retry/recovery and deep links;
- performance, accessibility, security/cleanup and dependency-absent launch are separately proven.
