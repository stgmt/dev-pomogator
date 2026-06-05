# Unified spec-graph — design (spec-qualified node ids)

**Decision taken:** specs are ONE graph, not per-spec. The blocker is that node ids are bare
(`FR-2`, `AC-2.1`, `Scenario`...), so across 47 specs they collide and the graph keeps only the
last writer. This is the think-through before implementing.

## 1. The problem (measured)

- 46 specs define `FR-2`; the graph holds **47 FR nodes from 6 spec dirs** (≈470 expected). The
  map is keyed by the bare id → ~90% of nodes are silently dropped.
- Every edge bug follows: `covers` ×52 piled on one id, `tested-by` orphaned, get_trace empty.
- It "works" today only because computeCoverage + the patched get_trace scope by **file path**,
  never trusting a bare id. That's the workaround we're replacing with a real fix.

## 2. Goal

One graph holding ALL specs' nodes, every node addressable without collision, edges resolving
correctly, cross-spec queries possible (e.g. "every spec that defines an `FR` named X").

## 3. ID scheme — recommendation

**Composite node KEY = `<slug>:<localId>`** (e.g. `spec-generator-v4:FR-2`), where:
- `localId` stays the human form (`FR-2`, `AC-2.1`, the scenario id) — unchanged in the docs.
- The node gains an explicit `spec: '<slug>'` field (most nodes already carry `file`, from which
  `<slug>` is derived: `.specs/<slug>/…`).
- **Anchors stay bare + file-scoped.** Markdown links (`[x](#fr-2)`) resolve WITHIN a file — the
  anchor alias must remain `fr-2`, not `slug:fr-2`. So decouple: NODE key = composite; ANCHOR
  alias = bare (already per-file in the anchor index). Marksman/anchor-fix unaffected.
- **Edges reference composite keys** on both ends (`from: spec:FR-2`, `to: spec:AC-2.1`).

Why composite-key over a `spec` field alone: the `nodes` Map key must be unique, and edges/refs
need a stable target — a single string key is simplest. `<slug>:<localId>` is greppable + human.

## 4. Impact surface (21 TS files in spec-graph + spec-mcp-server)

| Layer | Files | Change |
|------|------|--------|
| id derivation | `parsers/{md,gherkin,tasks,design,file-changes,multilang,ndjson}.ts` | emit `id = \`${slug}:${localId}\``, set `spec`, keep `localId` for display |
| edge construction | `parsers/md.ts` (covers), `parsers/gherkin.ts` (tested-by) | both ends use composite keys; **also** build tested-by for `@featureN` (today SPEC_TAG_RE only matches `@FR-N`) → resolves the unbuilt scenario-edge layer |
| graph assembly | `builder.ts` | key nodes by composite; dedup edges; the @featureN↔FR-N convention becomes intra-spec by construction |
| consumers | `tools.ts` (13 tools), `wikilinks.ts`, `conformance.ts`, `coverage.ts` | accept/emit composite ids; `get_node`/`get_trace` take `{spec?, node_id}` or a `slug:id`; bare id with collision → return the candidate list instead of a random one |
| convention | `coverage.ts` `mapTasksToScenarios` | already same-spec; simplifies (ids carry spec) |

## 5. Migration — phased, each phase suite-green

1. **Add `spec` + composite key in the builder ONLY** (parsers still emit bare localId; builder
   prefixes). Smallest diff that de-collides the map. Re-run dogfood → expect ~470 FR nodes.
2. **Move edge endpoints to composite keys** + add the `@featureN` tested-by edges. Re-run
   dogfood → get_trace via real edges (drop the tag-workaround).
3. **Tools accept `slug:id` / `{spec, node_id}`**; bare-id lookup returns candidates, not a guess.
4. **Update tests** that pin a bare id (`get_node("FR-2")`) to the qualified form.

## 6. Risks

- **Test churn (biggest):** every test asserting a bare id breaks → must update in lockstep. This
  is why the suite was "green" on a broken graph — it asserted bare ids that happened to resolve.
- **MCP tool API change:** `node_id` semantics change → the `spec-graph-query` skill + the
  hooks-stdin test + any agent caller need the qualified form (or a bare→candidates fallback).
- **Anchor coupling:** must keep anchor aliases bare or break Marksman/anchor-fix (call this out
  in the spec; it's the easy mistake).
- **Bundle:** rebuild `server.bundle.mjs` after `tools.ts` changes.

## 7. Verification (per phase)
- `runtime-dogfood` / `spec-mcp-dogfood`: FR-node count jumps 47→~470; get_trace non-empty via
  edges; 0 id collisions in a raw (pre-map) node dump.
- Full clean-HEAD Docker suite green after each phase (clean-vs-clean, per `suite-failure-triage`).

## 8. Open decisions (need a call before coding)
1. Separator: `:` vs `/` vs `#` in the composite key (`slug:FR-2`). `/` reads like a path but
   collides with anchor/file syntax; `:` is clean. → recommend `:`.
2. Bare-id back-compat: hard-break (require qualified) vs soft (bare → candidate list). →
   recommend soft for tools (agents often know only `FR-2`), hard internally (edges always
   qualified).
3. Scope of phase 1: spec-generator-v4 only first, or all 47 specs at once. → recommend all (the
   collision is global; a half-migration is worse).

This is a real refactor (~21 files + test churn), but it's the correct foundation for "specs as
one graph". Recommend turning this doc into a proper `.specs/unified-spec-graph/` via create-spec
before coding, so each phase has FR/AC/BDD + the honesty gate.
