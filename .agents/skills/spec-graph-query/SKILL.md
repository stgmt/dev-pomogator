---
name: spec-graph-query
description: >
  Cheatsheet for querying the spec-graph MCP (`dev-pomogator-specs`) instead of grepping
  `.specs/` and guessing slug variants. Pick the right tool for: look up a node by id, find
  what covers/tests/implements a node, list scenarios by @feature tag, list specs, list a
  phase's tasks, per-spec FR/AC/Scenario counts, or check a single anchor. Triggers (EN):
  "query the spec graph", "look up FR-7 / AC-7.1 / a scenario node", "what tests/covers FR-7",
  "what depends on this requirement before I change it", "scenarios tagged @featureN", "what
  specs exist", "tasks in Phase 2", "how many FR/AC/scenarios per spec", "does this anchor
  resolve". Triggers (RU): "запросить граф спек", "найди узел FR-7 / AC-7.1 / сценарий", "что
  тестит/покрывает FR-7", "что зависит от требования", "сценарии с тегом @featureN", "какие
  спеки есть", "задачи фазы 2", "сколько FR/AC/сценариев в спеке", "резолвится ли якорь". Do
  NOT use for: markdown link/anchor NAVIGATION or rename (markdown-lsp / Marksman), bulk
  broken-anchor scan+fix (anchor-fix), the honest per-task DONE verdict (get_spec_status view
  coverage / spec-status), or cross-spec drift (cross-spec-reconcile).
allowed-tools: mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__find_by_tags, mcp__dev-pomogator-specs__conformance_check, mcp__dev-pomogator-specs__search, mcp__dev-pomogator-specs__get_node, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__list_phase_tasks, mcp__dev-pomogator-specs__get_test_result, mcp__dev-pomogator-specs__find_orphans, mcp__dev-pomogator-specs__validate_anchor, mcp__dev-pomogator-specs__list_specs, mcp__dev-pomogator-specs__find_refs, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__read_attachment, Bash, Read
---

# spec-graph-query — one cheatsheet for the spec-graph MCP

The `dev-pomogator-specs` MCP server exposes 15 query tools over the built spec graph. Querying
the graph beats grepping `.specs/`: the graph resolved tag inheritance, dual-anchor slugs, and
the FR↔AC↔scenario↔task edges that text search can't see. Pick by the question you're asking.

## Node ids are SPEC-QUALIFIED (FR-36): `<slug>:<localId>`

Nodes inside `.specs/<slug>/` are keyed `spec-generator-v4:FR-2`, NOT bare `FR-2` — 46 specs
define `FR-2`, so bare ids collide. Every node-ref tool (`get_trace` / `get_node` /
`get_test_result` / `find_refs`) accepts three forms:

| Form | Example | Resolution |
|------|---------|------------|
| Composite (preferred) | `{ node_id: "spec-generator-v4:FR-2" }` | exact |
| Spec param | `{ node_id: "FR-2", spec: "spec-generator-v4" }` | exact |
| Bare | `{ node_id: "FR-2" }` | unique across specs → resolved; defined by 2+ specs → `ok:false, error:"AMBIGUOUS_BARE_ID"` + the sorted `candidates: ["slug-a:FR-2", …]` list (never one arbitrary node) |

On `AMBIGUOUS_BARE_ID`, pick the candidate for your spec and re-query. Anchors are the one
layer that stays BARE (`validate_anchor` takes `ac-7-1`, not a composite) — markdown links are
file-local by design (FR-36b).

## The under-used query tools (reach for these — they exist and work)

| Need | Tool | Call |
|------|------|------|
| **Full lifecycle of ONE spec** — SPEC_ONLY / TESTS_NOT_RUN / RED / PARTIAL / GREEN + linked last-run summary (passed/failed/undefined, run timestamp, NDJSON source) + counts + FR-37b gaps + agent hint (FR-38) | `get_spec_status` | `{ spec: "spec-generator-v4" }` |
| Look up ONE node by id (file+line+fields) | `get_node` | `{ node_id: "<slug>:AC-7.1" }` (или bare + candidates) |
| What **covers / tests / implements** a node (semantic edges, before a rename) | `find_refs` | `{ node_id: "<slug>:FR-7" }` |
| Scenarios carrying ALL these @feature tags (AND, inheritance-aware) | `find_by_tags` | `{ tags: ["@feature5","@regression"] }` |
| Which specs are loaded in the graph | `list_specs` | `{}` |
| Tasks under a phase heading | `list_phase_tasks` | `{ phase: "Phase 2: MCP server + hooks" }` |
| Per-spec FR/AC/Scenario/Task **counts** (structural census) | `get_spec_status` | `{ view: "counts" }` (bare) or `{ spec, view: "counts" }` |
| Honest FR-32 per-scenario buckets + per-task DONE verdict | `get_spec_status` | `{ spec: "<slug>", view: "coverage" }` |
| Does ONE anchor (compact id or slug) resolve? | `validate_anchor` | `{ anchor: "ac-7-1" }` |
| List ONE spec's readable docs + binary attachments (recurses subdirs: ARCHITECTURE/, attachments/) (FR-39a/P19-6) | `list_spec_docs` | `{ spec: "spec-generator-v4" }` → `{ docs[], attachments[] }` |
| Read a WHOLE spec document — prose outside graph nodes (README/DESIGN/RESUME or a SUBPATH `ARCHITECTURE/AXIS-1.md`); audited (FR-39a/b) | `read_spec_doc` | `{ spec: "...", doc: "RESUME.md" }` |
| Read a BINARY attachment (Jira screenshot/diagram) as base64+mime — text docs use read_spec_doc (P19-6) | `read_attachment` | `{ spec: "...", path: "attachments/diagram.png" }` |

All return `{ ok, ... }`; `ok:false` (or `registered:false`) when nothing matches.

> **MCP-rails (FR-39):** these read tools are the door — prefer them over a raw
> `Read`/`Grep` of `.specs/`. The whole-document read is `read_spec_doc`; for a
> single node's body use `get_node`. WRITING a spec is a sibling door —
> `create-spec` drives `propose_spec_change` / `apply_spec_change` / `create_spec` /
> `delete_spec_doc` (FR-40/FR-42; the D is doc-level only — whole-spec retirement is
> FR-43 human-confirmed); never hand-Edit or hand-delete a `.specs/` file.

## The 6 you already use (here for completeness)
`get_trace` (full traceability for a node), `conformance_check` (structural findings),
`search` (free-text over the graph), `get_test_result` (a scenario's last run),
`find_orphans` (nodes with no inbound coverage), `get_spec_status` (the umbrella status tool —
`view: "coverage"` is the **honest** FR-32 per-task DONE verdict; `view: "counts"` is just the
structural census). **Always pass `get_spec_status({ spec: "<slug>", view: "coverage" })`** for a
per-spec rollup — a bare `get_spec_status({ view: "coverage" })` returns the WHOLE-CORPUS buckets
(every other spec shows as `not_run`), which reads as "this spec is mostly unrun". Scope it.

## Pick the RIGHT neighbour (so you don't reach here by mistake)
- **Jump** from a `[text](#anchor)` link to its heading, or **rename** a heading + propagate
  links → **markdown-lsp** skill (Marksman `definition`/`references`/`rename`). Marksman owns
  PROSE links; `find_refs` owns the SEMANTIC edges Marksman can't see — complementary.
- **Scan the whole corpus for broken anchors + auto-FIX** → **anchor-fix** skill (`check.mjs`).
  `validate_anchor` is a single yes/no, not a bulk fixer.
- **"Is this task really DONE, backed by a green test?"** → `get_spec_status` (view: coverage) / **spec-status**.
  Counting (`view: counts`) ≠ verifying.
- **Cross-spec contradictions / drift** → **cross-spec-reconcile**.

## Why this is one skill, not seven
A bench (`skills-rules-optimizer` overlap detector) flagged 7 per-tool micro-skills at Jaccard
0.6–1.0 vs a 0.3 merge threshold — same domain vocabulary, near-duplicate shape. Consolidated
here: every tool stays documented + discoverable under one rich trigger, zero overlap flags.
